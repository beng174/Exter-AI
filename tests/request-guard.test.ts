import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { protectSettingsMutation } from "../server/request-guard.js";

test("authenticated settings mutations reject cross-site forms and accept same-origin JSON", async () => {
  const app = express();
  app.use(protectSettingsMutation);
  app.all("/action", (_req, res) => res.json({ accepted: true }));
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      assert.equal((await fetch(origin + "/action", { method, headers: { "content-type": "application/x-www-form-urlencoded" }, body: "run=true" })).status, 415);
      const origins: Record<string, string>[] = [
        { origin: "https://elsewhere.example" },
        { origin: "null" },
        { "sec-fetch-site": "cross-site" },
      ];
      for (const headers of origins) {
        assert.equal((await fetch(origin + "/action", { method, headers: { "content-type": "application/json", ...headers }, body: "{}" })).status, 403);
      }
      assert.equal((await fetch(origin + "/action", { method, headers: { "content-type": "application/json", origin }, body: "{}" })).status, 200);
      assert.equal((await fetch(origin + "/action", { method, headers: { "content-type": "application/json" }, body: "{}" })).status, 200);
    }
    assert.equal((await fetch(origin + "/action")).status, 200);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
