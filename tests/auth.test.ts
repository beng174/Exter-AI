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
