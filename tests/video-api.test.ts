import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { openDatabase } from "../server/db.js";
import { attachVideoAnalysis } from "../server/video/api.js";
import source from "../shared/cases/valentte-ads.json";
import caseData from "../shared/cases/valentte.json";
import type { Ad } from "../shared/types.js";
import { VIDEO_PROMPT_VERSION } from "../shared/video-analysis.js";
import { createMonitorMcpServer } from "../server/mcp/monitor.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
test("video API scopes jobs/history, reports configuration safely and exports one chosen run", async () => {
  const db = openDatabase(":memory:", false);
  const ad = source.ads[0] as Ad;
  db.prepare("INSERT INTO brands VALUES (?,?)").run(caseData.brand.id, JSON.stringify(caseData.brand));
  db.prepare("INSERT INTO ads VALUES (?,?,?,?,?,?)").run(ad.id, ad.brandId, ad.source, ad.platform, ad.publishedAt, JSON.stringify(ad));
  const app = express(); app.use(express.json());
  const field = (value: string | boolean) => ({ value, confidence: 0.9, timestamps: [{ startSeconds: 0, endSeconds: 2 }] });
  const service = attachVideoAnalysis(app, db, {
    mediaStore: { store: async () => ({ mediaId: "a".repeat(64), brandId: ad.brandId, sourceAdId: ad.id, absolutePath: "/tmp/unused.mp4", relativePath: "unused.mp4", sha256: "b".repeat(64), bytes: 1, mimeType: "video/mp4", durationSeconds: 5, storedAt: new Date().toISOString(), sourceUrl: "https://example.com/video.mp4" }), load: async () => null },
    analyserFactory: () => ({ provider: "gemini", model: "fixture-flash", analyse: async () => ({ model: "fixture-flash", modelVersion: null, processingMode: "agentic", promptVersion: VIDEO_PROMPT_VERSION, coverage: { durationSeconds: 5, fullVideo: true, segments: [{ startSeconds: 0, endSeconds: 5, processing: "agentic" }] }, fields: { hook: field("Product opening"), format: field("studio"), angle: field("Product benefit"), keyClaims: [], spokenTranscript: [], onScreenText: [], cta: field("Shop"), personTalkingToCamera: field(false), creatorEvidence: [] } }) }),
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const status = await (await fetch(base + "/api/video/status")).json();
    assert.equal(status.providers[1].implementation, "stub");
    assert.ok(!JSON.stringify(status).includes("apiKey"));
    const submit = () => fetch(base + "/api/video/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: ad.brandId, adId: ad.id, force: true }) });
    const firstResponse = await submit(); assert.equal(firstResponse.status, 202);
    const first = await firstResponse.json(); await service.idle();
    const secondResponse = await submit(); const second = await secondResponse.json(); await service.idle();
    assert.equal((await fetch(base + `/api/video/jobs/${first.id}?brandId=other`)).status, 404);
    const scope = `brandId=${ad.brandId}&adId=${encodeURIComponent(ad.id)}`;
    const history = await (await fetch(base + "/api/video/analyses?" + scope)).json();
    assert.equal(history.length, 2);
    const latest = await (await fetch(base + "/api/video/export?" + scope)).json();
    assert.equal(latest.predictions.length, 1);
    assert.equal(latest.predictions[0].id, history[0].id);
    const chosen = await (await fetch(base + "/api/video/export?" + scope + "&analysisId=" + history[1].id)).json();
    assert.equal(chosen.predictions[0].id, history[1].id);
    assert.equal((await fetch(base + "/api/video/export?" + scope + "&analysisId=foreign")).status, 404);
    assert.equal((await fetch(base + `/api/video/jobs/${second.id}?brandId=${ad.brandId}`)).status, 200);
    const mcp = createMonitorMcpServer(db);
    const client = new Client({ name: "native-video-evidence-test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await mcp.connect(serverTransport); await client.connect(clientTransport);
    try {
      const before = db.prepare("SELECT data FROM ads WHERE id=?").get(ad.id);
      const tool = await client.callTool({ name: "get_ad_analysis", arguments: { brandId: ad.brandId, adId: ad.id } });
      assert.ok(!tool.isError);
      const saved = tool.structuredContent as Record<string, any>;
      assert.equal(saved.analysisStatus, "saved_native_video_analysis");
      assert.equal(saved.nativeVideoAnalysis.fields.personTalkingToCamera.value, false);
      assert.equal(saved.nativeVideoAnalysis.mediaSha256, "b".repeat(64));
      assert.deepEqual(db.prepare("SELECT data FROM ads WHERE id=?").get(ad.id), before);
    } finally { await client.close(); await mcp.close(); }
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); db.close(); }
});
