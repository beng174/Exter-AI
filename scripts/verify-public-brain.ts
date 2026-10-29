import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.js";
import { openDatabase, readBrand } from "../server/db.js";
import { getAds } from "../server/analysis.js";
const db = openDatabase(":memory:");
const server = createServer(createApp(db));
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
try {
  const response = await fetch(base + "/api/public/collect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "rhode",
      urls: ["https://x.com/Interior/status/463440424141459456"],
      contentSource: "organic",
    }),
  });
  const collected = (await response.json()) as {
    error?: string;
    analysisJob?: { id: string };
    collected: number;
    clientAccountRequired: boolean;
  };
  assert.equal(response.status, 201, collected.error);
  assert.equal(collected.clientAccountRequired, false);
  assert.ok(collected.analysisJob);
  let status = "queued";
  for (let i = 0; i < 90; i++) {
    const job = (await (
      await fetch(base + "/api/brain/jobs/" + collected.analysisJob!.id)
    ).json()) as { status: string; error: string };
    status = job.status;
    if (status === "complete") break;
    if (status === "error") throw new Error(job.error);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(status, "complete");
  const records = getAds(db, readBrand(db, "rhode")!);
  assert.equal(records.length, 1);
  const ad = records[0];
  assert.equal(ad.source, "public");
  assert.equal(ad.analysis?.provenance, "model");
  assert.equal(ad.metricsAvailable, false);
  assert.equal(ad.owned, false);
  console.log(
    JSON.stringify(
      {
        status: "verified",
        publicSource: ad.platform,
        collected: collected.collected,
        analysisProvenance: ad.analysis?.provenance,
        clientAccountRequired: false,
        claudeRequired: false,
        metricsInvented: false,
        scope: "One submitted public source URL; not broad live monitoring",
      },
      null,
      2,
    ),
  );
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
}
