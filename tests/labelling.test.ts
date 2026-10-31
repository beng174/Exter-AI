import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { openDatabase } from "../server/db.js";
import { basicAuth } from "../server/auth.js";
import { attachLabelling } from "../server/labelling/api.js";
import { LabellingError, LabellingService } from "../server/labelling/service.js";
import type { VideoAnalysisService } from "../server/video/service.js";
import { LABELLING_FIELDS, validateHumanCreativeLabels } from "../shared/labelling.js";
import source from "../shared/cases/valentte-ads.json";
import caseData from "../shared/cases/valentte.json";
import type { Ad } from "../shared/types.js";
import type { StoredVideo } from "../server/video/types.js";

const labels = { format: "studio", hookType: "question", angle: "product-benefit", personOnCamera: "no", ugcEvidence: "none", offerType: "none", cta: "shop" };
function fixture(video = false) {
  const db = openDatabase(":memory:", false);
  const brand = caseData.brand;
  db.prepare("INSERT INTO brands VALUES (?,?)").run(brand.id, JSON.stringify(brand));
  db.prepare("INSERT INTO brands VALUES (?,?)").run("other", JSON.stringify({ ...brand, id: "other" }));
  const ad: Ad = { ...(source.ads[0] as Ad), id: "source-ad", brandId: brand.id, source: "public", sourceUrl: "https://www.facebook.com/ads/library/?id=12345",
    copy: "Original source copy", image: "https://images.example.com/original.jpg", mediaType: video ? "video" : "image",
    videoMediaId: undefined, videoAnalysis: { model: "MODEL_OUTPUT_MUST_STAY_HIDDEN" } as Ad["videoAnalysis"],
    angle: "MODEL_OUTPUT_MUST_STAY_HIDDEN", format: "MODEL_OUTPUT_MUST_STAY_HIDDEN", title: "MODEL_OUTPUT_MUST_STAY_HIDDEN", audience: "MODEL_OUTPUT_MUST_STAY_HIDDEN" };
  const insert = (item: Ad) => db.prepare("INSERT INTO ads VALUES (?,?,?,?,?,?)").run(item.id, item.brandId, item.source, item.platform, item.publishedAt, JSON.stringify(item));
  insert(ad);
  insert({ ...ad, id: "fictional", source: "sample" });
  insert({ ...ad, id: "missing-source", sourceUrl: null });
  return { db, brand, ad };
}
const rejectsStatus = (status: number) => (error: unknown) => error instanceof LabellingError && error.status === status;

test("blind labelling returns only source evidence, excludes samples and keeps prior labels hidden", async () => {
  const { db, ad, brand } = fixture();
  let time = Date.parse("2026-10-31T12:00:00Z");
  const service = new LabellingService(db, { now: () => new Date(time) });
  try {
    const queue = service.queue(brand.id);
    assert.equal(queue.total, 1);
    assert.equal(queue.items[0].copy, "Original source copy");
    assert.ok(!JSON.stringify(queue).includes("MODEL_OUTPUT_MUST_STAY_HIDDEN"));
    assert.equal(queue.guideStatus, "draft_for_review");
    const { session } = await service.start({ brandId: brand.id, adId: ad.id, labeller: "  Benjamin  " });
    time += 73000;
    const review = service.submit(brand.id, session.id, { labels, notes: "A blind human observation" });
    assert.equal(review.labeller, "Benjamin");
    assert.equal(review.elapsedSeconds, 73);
    assert.equal(review.mediaSha256, null);
    assert.equal(review.guideVersion, "draft-v1");
    assert.equal(service.queue(brand.id).items[0].completedReviews, 1);
    assert.ok(!JSON.stringify(service.queue(brand.id)).includes("A blind human observation"));
    assert.throws(() => service.submit(brand.id, session.id, { labels }), rejectsStatus(409));
    assert.throws(() => service.submit("other", session.id, { labels }), rejectsStatus(404));
    assert.equal(service.export("other").labels.length, 0);
    const repeat = await service.start({ brandId: brand.id, adId: ad.id, labeller: "Benjamin" });
    service.submit(brand.id, repeat.session.id, { labels: { ...labels, hookType: "unsure" } });
    assert.equal(service.export(brand.id).labels.length, 2);
    // Both saves use the same fixed server time; append order must survive UUID ordering.
    assert.deepEqual(service.export(brand.id).labels.map(label => label.id), [session.id, repeat.session.id]);
    assert.equal(service.export(brand.id).labels.find(label => label.id === session.id)!.labels.hookType, "question");
    await assert.rejects(service.start({ brandId: "other", adId: ad.id, labeller: "Benjamin" }), rejectsStatus(404));
  } finally { db.close(); }
});

test("all seven human fields require documented choices and UGC needs attribution", () => {
  assert.equal(LABELLING_FIELDS.length, 7);
  for (const field of LABELLING_FIELDS) assert.ok(field.options.some(option => option[0] === "unsure"));
  assert.deepEqual(validateHumanCreativeLabels(labels), labels);
  assert.throws(() => validateHumanCreativeLabels({ ...labels, hookType: "" }), /documented hook type/);
  assert.throws(() => validateHumanCreativeLabels({ ...labels, extra: "injected field" }), /exactly/);
  assert.throws(() => validateHumanCreativeLabels({ ...labels, format: "UGC", personOnCamera: "yes" }), /UGC requires/);
  assert.equal(validateHumanCreativeLabels({ ...labels, format: "UGC", ugcEvidence: "visible-creator-handle" }).format, "UGC");
});

test("original Valentte records use source container formats and dynamic creatives cannot pass as stills", async () => {
  const db = openDatabase(":memory:", false);
  const brand = caseData.brand;
  db.prepare("INSERT INTO brands VALUES (?,?)").run(brand.id, JSON.stringify(brand));
  const insert = db.prepare("INSERT INTO ads VALUES (?,?,?,?,?,?)");
  for (const ad of source.ads as Ad[]) insert.run(ad.id, ad.brandId, ad.source, ad.platform, ad.publishedAt, JSON.stringify(ad));
  const service = new LabellingService(db);
  try {
    const queue = service.queue(brand.id, 0, 200);
    assert.equal(queue.items.filter(ad => ad.creativeKind === "video").length, 11);
    assert.equal(queue.items.filter(ad => ad.creativeKind === "image").length, 8);
    assert.equal(queue.items.filter(ad => ad.creativeKind === "unknown").length, 39);
    for (const item of queue.items.filter(ad => ad.creativeKind !== "image")) {
      await assert.rejects(service.start({ brandId: brand.id, adId: item.id, labeller: "Benjamin" }), rejectsStatus(409));
    }
    const dynamic = queue.items.find(ad => ad.creativeKind === "unknown")!;
    await assert.rejects(service.start({ brandId: brand.id, adId: dynamic.id, labeller: "Benjamin" }), /Dynamic creatives cannot be reviewed from a thumbnail/);
    const still = queue.items.find(ad => ad.creativeKind === "image")!;
    // The committed capture does not retain its static images either.
    await assert.rejects(service.start({ brandId: brand.id, adId: still.id, labeller: "Benjamin" }), rejectsStatus(409));
    const original = (source.ads as Ad[]).find(ad => ad.id === still.id)!;
    db.prepare("UPDATE ads SET data=? WHERE id=?").run(JSON.stringify({ ...original, image: "https://images.example.com/confirmed-still.jpg" }), still.id);
    assert.equal((await service.start({ brandId: brand.id, adId: still.id, labeller: "Benjamin" })).ad.creativeKind, "image");
    // Container detection does not reveal the original format or inferred classifications.
    assert.ok(queue.items.every(ad => !("format" in ad) && !("angle" in ad)));
  } finally { db.close(); }
});

test("video review cannot use a thumbnail, verifies retained media and binds its exact hash", async () => {
  const { db, ad, brand } = fixture(true);
  let diskAvailable = false;
  const media: StoredVideo = { mediaId: "a".repeat(64), sha256: "b".repeat(64), brandId: brand.id, sourceAdId: ad.id,
    absolutePath: "/private/retained.mp4", relativePath: "retained.mp4", bytes: 10, durationSeconds: 15, mimeType: "video/mp4", storedAt: new Date().toISOString(), sourceUrl: "https://media.example.com/temporary-signed-url" };
  const video = {
    storeMedia: async () => {
      diskAvailable = true;
      db.prepare("INSERT INTO video_media VALUES (?,?,?,?)").run(media.mediaId, brand.id, ad.id, JSON.stringify(media));
      return media;
    },
    storedMedia: async (brandId: string, adId: string) => diskAvailable && brandId === brand.id && adId === ad.id ? media : null,
  };
  const service = new LabellingService(db, { video });
  try {
    await assert.rejects(service.start({ brandId: brand.id, adId: ad.id, labeller: "Benjamin" }), rejectsStatus(409));
    const retained = await service.storeVideo({ brandId: brand.id, adId: ad.id });
    assert.equal(retained.storedVideo?.sha256, media.sha256);
    assert.ok(!JSON.stringify(retained).includes("private"));
    assert.ok(!JSON.stringify(retained).includes("temporary-signed-url"));
    diskAvailable = false;
    await assert.rejects(service.start({ brandId: brand.id, adId: ad.id, labeller: "Benjamin" }), rejectsStatus(409));
    diskAvailable = true;
    const { session } = await service.start({ brandId: brand.id, adId: ad.id, labeller: "Benjamin" });
    const review = service.submit(brand.id, session.id, { labels });
    assert.equal(review.mediaSha256, media.sha256);
    assert.equal(review.mediaId, media.mediaId);
  } finally { db.close(); }
});

test("labelling HTTP routes inherit authentication and export safe CSV without model payloads", async () => {
  const { db, ad, brand } = fixture();
  const app = express();
  app.use(basicAuth({ EXTER_ADMIN_USER: "test-reviewer", EXTER_ADMIN_PASSWORD: "fixture-password" }));
  app.use(express.json());
  attachLabelling(app, db);
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const headers = { Authorization: "Basic " + Buffer.from("test-reviewer:fixture-password").toString("base64"), "Content-Type": "application/json" };
  try {
    assert.equal((await fetch(base + `/api/labelling/queue?brandId=${brand.id}`)).status, 401);
    assert.equal((await fetch(base + "/api/labelling/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: brand.id, adId: ad.id, labeller: "Benjamin" }) })).status, 401);
    const queue = await (await fetch(base + `/api/labelling/queue?brandId=${brand.id}`, { headers })).text();
    assert.ok(!queue.includes("MODEL_OUTPUT_MUST_STAY_HIDDEN"));
    const started = await fetch(base + "/api/labelling/sessions", { method: "POST", headers, body: JSON.stringify({ brandId: brand.id, adId: ad.id, labeller: "Benjamin" }) });
    assert.equal(started.status, 201);
    const { session } = await started.json();
    const saved = await fetch(base + `/api/labelling/sessions/${session.id}/labels`, { method: "POST", headers, body: JSON.stringify({ brandId: brand.id, labels, notes: '=HYPERLINK("https://example.com")\nA second line' }) });
    assert.equal(saved.status, 201);
    const csv = await fetch(base + `/api/labelling/export?brandId=${brand.id}&format=csv`, { headers });
    assert.match(csv.headers.get("Content-Disposition") || "", /exter-human-labels.csv/);
    const body = await csv.text();
    assert.ok(body.includes("\"'=HYPERLINK("));
    assert.ok(body.includes("A second line"));
    assert.ok(!body.includes("MODEL_OUTPUT_MUST_STAY_HIDDEN"));
    const exported = await (await fetch(base + `/api/labelling/export?brandId=${brand.id}`, { headers })).json();
    assert.equal(exported.labels.length, 1);
    assert.equal(exported.labels[0].labels.personOnCamera, "no");
    assert.match(await (await fetch(base + "/api/labelling/guide", { headers })).text(), /DRAFT/);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); db.close(); }
});
