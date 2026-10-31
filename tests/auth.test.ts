import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { basicAuth } from "../server/auth.js";

test("production refuses missing or partial credentials", () => {
  for (const env of [{}, { EXTER_ADMIN_USER: "test" }, { EXTER_ADMIN_PASSWORD: "test" }])
    assert.throws(() => basicAuth({ ...env, NODE_ENV: "production" }), /refusing to start/);
});
test("all methods, pages, APIs, static paths and unknown routes require credentials", async () => {
  const app = express();
  app.use(basicAuth({ EXTER_ADMIN_USER: "test-admin", EXTER_ADMIN_PASSWORD: "test:password" }));
  app.use((_req, res) => res.send("protected"));
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    for (const path of ["/", "/api/brands", "/assets/app.js", "/favicon.svg", "/unknown"]) {
      for (const method of ["GET", "POST", "HEAD", "OPTIONS"]) {
        for (const authorization of ["", "Bearer invalid", "Basic !!!", `Basic ${Buffer.from("test-admin:wrong").toString("base64")}`]) {
          const response = await fetch(base + path, { method, headers: { authorization } });
          assert.equal(response.status, 401);
          assert.match(response.headers.get("www-authenticate")!, /Basic/);
        }
        const response = await fetch(base + path, { method, headers: { authorization: `Basic ${Buffer.from("test-admin:test:password").toString("base64")}` } });
        assert.equal(response.status, 200);
      }
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("the real app protects API handlers and subsequently mounted production static files", async () => {
  const { createApp } = await import("../server/app.js");
  const { openDatabase } = await import("../server/db.js");
  const { mkdtemp,writeFile,rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const oldUser = process.env.EXTER_ADMIN_USER, oldPassword = process.env.EXTER_ADMIN_PASSWORD;
  process.env.EXTER_ADMIN_USER = "integration-admin";
  process.env.EXTER_ADMIN_PASSWORD = "integration-password";
  const db = openDatabase(":memory:",false);
  const root = await mkdtemp(join(tmpdir(),"exter-static-auth-"));
  let server: ReturnType<typeof createServer> | undefined;
  try {
    await writeFile(join(root,"static.txt"),"protected static content");
    const app = createApp(db);
    app.use(express.static(root));
    app.get("/{*path}",(_req,res) => res.send("protected page"));
    server = createServer(app);
    await new Promise<void>(resolve => server!.listen(0,"127.0.0.1",resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const headers = { authorization: `Basic ${Buffer.from("integration-admin:integration-password").toString("base64")}` };
    for (const path of ["/", "/api/health", "/api/infrastructure/status", "/static.txt"]) {
      assert.equal((await fetch(base+path)).status,401);
      const response = await fetch(base+path,{ headers });
      assert.equal(response.status,200);
      if (path === "/static.txt") assert.equal(await response.text(),"protected static content");
      if (path === "/api/infrastructure/status") assert.equal((await response.json()).meta.message,"Meta not connected");
    }
    const absent = await fetch(base+"/api/public/meta/collect",{ method: "POST", headers: { ...headers,"Content-Type":"application/json" }, body: JSON.stringify({ watchlistId: "test" }) });
    assert.equal(absent.status,409);
    assert.equal((await absent.json()).message,"Meta not connected");
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    db.close(); await rm(root,{ recursive: true, force: true });
    if (oldUser === undefined) delete process.env.EXTER_ADMIN_USER; else process.env.EXTER_ADMIN_USER=oldUser;
    if (oldPassword === undefined) delete process.env.EXTER_ADMIN_PASSWORD; else process.env.EXTER_ADMIN_PASSWORD=oldPassword;
  }
});
