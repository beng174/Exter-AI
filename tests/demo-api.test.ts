import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { openDatabase } from "../server/db.js";
import { createApp } from "../server/app.js";
import type { Brand } from "../shared/types.js";

test("demo reads are authenticated and do not collect, infer, fabricate samples or write", async () => {
  const previous = { user: process.env.EXTER_ADMIN_USER, password: process.env.EXTER_ADMIN_PASSWORD };
  process.env.EXTER_ADMIN_USER = "demo-fixture"; process.env.EXTER_ADMIN_PASSWORD = "fixture-only-password";
  const db = openDatabase(":memory:", false);
  const brand: Brand = { id: "demo-api-fixture", name: "Real-source fixture", domain: "example.com", category: "Home fragrance & gifting", color: "#234", initials: "RF", voice: [], competitors: [], mode: "imported", createdAt: "2026-11-02T00:00:00Z" };
  db.prepare("INSERT INTO brands VALUES (?,?)").run(brand.id, JSON.stringify(brand));
  const app = createApp(db);
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { authorization: `Basic ${Buffer.from("demo-fixture:fixture-only-password").toString("base64")}` };
  try {
    const before = db.prepare("SELECT total_changes() AS n").get() as { n: number };
    assert.equal((await fetch(base + "/api/kernel/status")).status,401);
    const kernel=await (await fetch(base + "/api/kernel/status",{headers})).json();
    assert.equal(kernel.candidate.status,"not_ready");assert.equal(kernel.candidate.enabled,false);assert.equal(kernel.workStartsOnRead,false);
    for (const path of [`/api/brands/${brand.id}/demo`, `/api/creator-research?brandId=${brand.id}`, `/api/demo-readiness?brandId=${brand.id}`]) {
      assert.equal((await fetch(base + path)).status, 401);
      const response = await fetch(base + path, { headers });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control") || "", /no-store/);
      const body = await response.json();
      if (path.endsWith("/demo")) {
        assert.equal(body.analysedAdsCount, 0);
        assert.deepEqual(body.scores, []);
        assert.equal(body.prediction.probability, null);
        assert.equal(body.prediction.message, "Trains as collection history builds.");
      } else if (path.startsWith("/api/creator-research")) { assert.deepEqual(body.candidates, []); assert.deepEqual(body.searches, []); }
      else { assert.equal(body.pages.overview.adsCollected, 0); assert.equal(body.pages.contentLibrary.mediaVerifiedOnDisk, 0); assert.equal(body.pages.brandResearch.available, false); assert.equal(body.pages.creators.attributedCreators, 0); }
    }
    const intelligencePath = `/api/brands/${brand.id}/demo/intelligence`;
    assert.equal((await fetch(base + intelligencePath)).status, 401);
    const intelligenceResponse = await fetch(base + intelligencePath, { headers });
    assert.equal(intelligenceResponse.status, 200);
    assert.match(intelligenceResponse.headers.get("cache-control") || "", /no-store/);
    const intelligence = await intelligenceResponse.json();
    assert.deepEqual(intelligence.audienceLabels, []);
    assert.deepEqual(intelligence.voice, []);
    assert.equal(intelligence.performance.status, "unavailable");
    assert.equal((await fetch(base + "/api/brands/missing/demo/intelligence", { headers })).status, 404);
    const verified = await (await fetch(`${base}/api/demo-readiness?brandId=valentte`, { headers })).json();
    assert.equal(verified.pages.overview.adsCollected, 58);
    assert.equal(verified.pages.overview.adsAnalysed, 0, "A source import never invents missing paid outputs");
    assert.equal(verified.pages.creators.attributedCreators, 3);
    assert.equal(verified.pages.creators.attributedAds, 4);
    assert.equal(verified.pages.contentLibrary.mediaVerifiedOnDisk, 0);
    const download = await fetch(`${base}/api/demo-readiness?brandId=valentte&download=1`, { headers });
    assert.equal(download.status, 200);
    assert.match(download.headers.get("content-disposition") || "", /attachment/);
    assert.match(await download.text(), /"adsCollected": 58/);
    assert.equal((db.prepare("SELECT total_changes() AS n").get() as { n: number }).n, before.n);
    assert.equal((await fetch(`${base}/api/brands/missing/demo`, { headers })).status, 404);
    for (const path of [`/api/brands/${brand.id}/demo/website`, "/api/creator-research/search", "/api/creator-research/fit", "/api/creator-research/shortlist"]) {
      assert.equal((await fetch(base + path, { method: "POST", headers, body: "brandId=test" })).status, 415);
      assert.equal((await fetch(base + path, { method: "POST", headers: { ...headers, "Content-Type": "application/json", Origin: "https://foreign.example" }, body: JSON.stringify({ brandId: brand.id }) })).status, 403);
    }
    assert.equal((db.prepare("SELECT total_changes() AS n").get() as { n: number }).n, before.n);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); db.close();
    if (previous.user === undefined) delete process.env.EXTER_ADMIN_USER; else process.env.EXTER_ADMIN_USER = previous.user;
    if (previous.password === undefined) delete process.env.EXTER_ADMIN_PASSWORD; else process.env.EXTER_ADMIN_PASSWORD = previous.password;
  }
});
