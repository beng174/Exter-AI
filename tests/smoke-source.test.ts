import { test } from "node:test";
import assert from "node:assert/strict";
import { creativeSourcesFromScripts, PublicValentteVideoSource, SmokeSourceError, VALENTTE_PAGE_ID, type SmokeSnapshot } from "../server/smoke/source.js";

const id = "123456789";
const other = "987654321";
const snapshot = (adId: string, video: string | null, pageId = VALENTTE_PAGE_ID) => ({
  ad_archive_id: adId,
  page_id: pageId,
  snapshot: { page_id: pageId, display_format: video ? "VIDEO" : "IMAGE", videos: video ? [{ video_hd_url: video }] : [], images: video ? [] : [{ original_image_url: "https://fixture.fbcdn.net/image.jpg" }] },
});

test("refresh reopens the exact ad snapshot and replaces cached or already-checked media links", async () => {
  const reads: string[] = [];
  let fresh = 0;
  const source = new PublicValentteVideoSource(new Set([id, other]), {
    readSnapshot: async url => {
      reads.push(url);
      if (url.includes("view_all_page_id=")) return { url, status: 200, scripts: [JSON.stringify([snapshot(id, "https://fixture.fbcdn.net/old.mp4?signature=OLD_PRIVATE_MARKER"), snapshot(other, "https://fixture.fbcdn.net/other.mp4")])] };
      fresh++;
      return { url, status: 200, scripts: [JSON.stringify(snapshot(id, `https://fixture.fbcdn.net/fresh-${fresh}.mp4?signature=FRESH_PRIVATE_MARKER`))] };
    },
  });
  try {
    assert.match((await source.resolve(id))!, /old\.mp4/);
    assert.match((await source.resolve(other))!, /other\.mp4/);
    assert.equal(reads.length, 1, "ordinary reads reuse the verified initial result batch");
    assert.match((await source.resolve(id, { refresh: true }))!, /fresh-1\.mp4/);
    assert.match((await source.resolve(id))!, /fresh-1\.mp4/);
    assert.match((await source.resolve(id, { refresh: true }))!, /fresh-2\.mp4/);
    assert.deepEqual(reads.slice(1), Array(2).fill(`https://www.facebook.com/ads/library/?id=${id}`));
  } finally { await source.close(); }
});

test("refresh discards a stale URL and accepts only the requested advertiser and approved video host", async () => {
  let refresh = false;
  const source = new PublicValentteVideoSource(new Set([id]), {
    readSnapshot: async url => {
      const rows = refresh ? [snapshot(id, "https://fixture.fbcdn.net/wrong-advertiser.mp4", "12345"), snapshot(id, "https://private.example/video.mp4")] : [snapshot(id, "https://fixture.fbcdn.net/old.mp4")];
      refresh = true;
      return { url, status: 200, scripts: [JSON.stringify(rows)] };
    },
  });
  try {
    assert.match((await source.resolve(id))!, /old\.mp4/);
    assert.equal(await source.resolve(id, { refresh: true }), null);
    assert.equal(await source.resolve(id), null, "the old signed URL is not resurrected after refresh");
  } finally { await source.close(); }
});

test("snapshot failures preserve specific HTTP or timeout reasons without exposing upstream data", async () => {
  const cases: [number, string][] = [[401, "source_unauthorized"], [403, "source_forbidden"], [404, "source_not_found"], [408, "source_timeout"], [410, "source_expired"], [429, "source_rate_limited"], [503, "source_http_error"]];
  for (const [status, code] of cases) {
    const source = new PublicValentteVideoSource(new Set([id]), {
      readSnapshot: async url => ({ url, status, scripts: ["PRIVATE_UPSTREAM_MARKER"] }),
    });
    try {
      await assert.rejects(source.resolve(id, { refresh: true }), error => {
        assert.ok(error instanceof SmokeSourceError);
        assert.equal(error.code, code);
        assert.equal(error.sourceHttpStatus, status);
        assert.ok(error.message.includes(String(status)));
        assert.ok(!error.message.includes("PRIVATE_UPSTREAM_MARKER"));
        assert.ok(!error.message.includes("https://"));
        return true;
      });
    } finally { await source.close(); }
  }
  for (const name of ["TimeoutError", "Error"]) {
    const source = new PublicValentteVideoSource(new Set([id]), { readSnapshot: async () => { const error = new Error("https://fixture.fbcdn.net/video.mp4?signature=PRIVATE_UPSTREAM_MARKER"); error.name = name; throw error; } });
    try {
      await assert.rejects(source.resolve(id, { refresh: true }), error => {
        assert.ok(error instanceof SmokeSourceError);
        assert.equal(error.code, name === "TimeoutError" ? "source_timeout" : "source_unavailable");
        assert.ok(!error.message.includes("PRIVATE_UPSTREAM_MARKER"));
        return true;
      });
    } finally { await source.close(); }
  }
});

test("snapshot refresh identifies verified still images, login redirects and access challenges", async () => {
  const cases: [SmokeSnapshot, string][] = [
    [{ url: `https://www.facebook.com/ads/library/?id=${id}`, status: 200, scripts: [JSON.stringify(snapshot(id, null))] }, "source_not_video"],
    [{ url: "https://www.facebook.com/login/", status: 200, scripts: [] }, "source_restricted"],
    [{ url: `https://www.facebook.com/ads/library/?id=${id}`, status: 200, scripts: ['{"xfb_ad_library_is_captcha_required":true}'] }, "source_restricted"],
  ];
  for (const [result, code] of cases) {
    const source = new PublicValentteVideoSource(new Set([id]), { readSnapshot: async () => result });
    try { await assert.rejects(source.resolve(id, { refresh: true }), error => error instanceof SmokeSourceError && error.code === code); }
    finally { await source.close(); }
  }
});

test("creative descriptors distinguish source videos, images and complete ordered image carousels", () => {
  const row = (adId: string, media: Record<string, unknown>, pageId = VALENTTE_PAGE_ID) => ({ ad_archive_id: adId, page_id: pageId, snapshot: { page_id: pageId, ...media } });
  const rows = [
    row("10001", { display_format: "IMAGE", page_profile_picture_url: "https://fixture.fbcdn.net/profile.jpg", images: [{ original_image_url: "https://fixture.fbcdn.net/source.jpg?signature=PRIVATE_IMAGE", resized_image_url: "https://fixture.fbcdn.net/source-small.jpg" }] }),
    row("10002", { display_format: "CAROUSEL", cards: [{ original_image_url: "https://fixture.fbcdn.net/card-one.jpg", link_url: "https://fixture.fbcdn.net/not-a-creative.jpg" }, { image_url: "https://fixture.fbcdn.net/card-two.jpg" }] }),
    row("10003", { display_format: "CAROUSEL", cards: [{ image: { uri: "https://fixture.fbcdn.net/first.jpg" } }, { resized_image_url: "https://fixture.fbcdn.net/second.jpg" }] }),
    row("10004", { display_format: "VIDEO", videos: [{ video_hd_url: "https://fixture.fbcdn.net/source.mp4", video_preview_image_url: "https://fixture.fbcdn.net/preview.jpg" }], images: [{ original_image_url: "https://fixture.fbcdn.net/preview.jpg" }] }),
    row("10005", { display_format: "VIDEO", videos: [], images: [{ original_image_url: "https://fixture.fbcdn.net/preview-only.jpg" }] }),
    row("10006", { display_format: "DCO", page_profile_picture_url: "https://fixture.fbcdn.net/profile.jpg", video_preview_image_url: "https://fixture.fbcdn.net/preview.jpg" }),
    row("10007", { display_format: "IMAGE", images: [{ original_image_url: "https://fixture.fbcdn.net/wrong-advertiser.jpg" }] }, "99999"),
    row("10008", { display_format: "IMAGE", images: [{ original_image_url: "https://private.example/image.jpg" }] }),
  ];
  const result = creativeSourcesFromScripts([JSON.stringify(rows)], new Set(rows.map(row => row.ad_archive_id)));
  assert.deepEqual(result.get("10001"), { kind: "image", imageUrls: ["https://fixture.fbcdn.net/source.jpg?signature=PRIVATE_IMAGE"] });
  assert.deepEqual(result.get("10002"), { kind: "carousel", imageUrls: ["https://fixture.fbcdn.net/card-one.jpg", "https://fixture.fbcdn.net/card-two.jpg"] });
  assert.deepEqual(result.get("10003"), { kind: "carousel", imageUrls: ["https://fixture.fbcdn.net/first.jpg", "https://fixture.fbcdn.net/second.jpg"] });
  assert.deepEqual(result.get("10004"), { kind: "video", videoUrl: "https://fixture.fbcdn.net/source.mp4" });
  const videoMissing = result.get("10005");
  assert.equal(videoMissing?.kind, "unknown");
  assert.equal(videoMissing?.kind === "unknown" && videoMissing.candidateKind, "video");
  assert.equal(result.get("10006")?.kind, "unknown", "a profile picture or video preview is not a creative image");
  assert.equal(result.has("10007"), false, "advertiser identity is required for images too");
  assert.equal(result.get("10008")?.kind, "unknown", "image hosts retain the same public CDN allowlist");
});

test("incomplete, mixed or oversized carousels and unordered dynamic variants are never silently reduced", () => {
  const row = (adId: string, media: Record<string, unknown>) => ({ ad_archive_id: adId, page_id: VALENTTE_PAGE_ID, snapshot: { page_id: VALENTTE_PAGE_ID, ...media } });
  const rows = [
    row("20001", { display_format: "CAROUSEL", cards: [{ original_image_url: "https://fixture.fbcdn.net/one.jpg" }, { body: "Missing image" }, { original_image_url: "https://fixture.fbcdn.net/three.jpg" }] }),
    row("20002", { display_format: "CAROUSEL", cards: [{ original_image_url: "https://fixture.fbcdn.net/one.jpg" }, { video_hd_url: "https://fixture.fbcdn.net/two.mp4" }] }),
    row("20003", { display_format: "CAROUSEL", cards: Array.from({ length: 11 }, (_, index) => ({ original_image_url: `https://fixture.fbcdn.net/card-${index}.jpg` })) }),
    row("20004", { display_format: "DCO", images: [{ original_image_url: "https://fixture.fbcdn.net/variant-one.jpg" }, { original_image_url: "https://fixture.fbcdn.net/variant-two.jpg" }] }),
    row("20005", { display_format: "CAROUSEL", images: [{ original_image_url: "https://fixture.fbcdn.net/one.jpg" }, { original_image_url: "https://unapproved.example/two.jpg" }] }),
    row("20006", { display_format: "DCO", cards: [{ original_image_url: "https://fixture.fbcdn.net/variant-one.jpg" }, { original_image_url: "https://fixture.fbcdn.net/variant-two.jpg" }] }),
    row("20007", { cards: [{ original_image_url: "https://fixture.fbcdn.net/variant-one.jpg" }, { original_image_url: "https://fixture.fbcdn.net/variant-two.jpg" }] }),
  ];
  const result = creativeSourcesFromScripts([JSON.stringify(rows)], new Set(rows.map(row => row.ad_archive_id)));
  for (const id of ["20001", "20002", "20003", "20005"]) {
    const creative = result.get(id);
    assert.equal(creative?.kind, "unknown");
    assert.equal(creative?.kind === "unknown" && creative.candidateKind, "carousel");
    assert.ok(!("imageUrls" in creative!));
  }
  assert.equal(result.get("20004")?.kind, "unknown");
  assert.equal(result.get("20006")?.kind, "unknown", "DCO cards are asset variants, not proof of an ordered carousel");
  assert.equal(result.get("20007")?.kind, "unknown", "unlabelled cards do not establish carousel order");
});

test("refresh captures a fresh image or carousel descriptor without returning its prior signed links", async () => {
  const reads: string[] = [];
  const source = new PublicValentteVideoSource(new Set([id]), {
    readSnapshot: async url => {
      reads.push(url);
      return { url, status: 200, scripts: [JSON.stringify({ ad_archive_id: id, page_id: VALENTTE_PAGE_ID, snapshot: { page_id: VALENTTE_PAGE_ID, display_format: "IMAGE", images: [{ original_image_url: `https://fixture.fbcdn.net/source-${reads.length}.jpg?signature=PRIVATE_IMAGE` }] } })] };
    },
  });
  try {
    assert.deepEqual(await source.resolveCreative(id), { kind: "image", imageUrls: ["https://fixture.fbcdn.net/source-1.jpg?signature=PRIVATE_IMAGE"] });
    assert.deepEqual(await source.resolveCreative(id, { refresh: true }), { kind: "image", imageUrls: ["https://fixture.fbcdn.net/source-2.jpg?signature=PRIVATE_IMAGE"] });
    assert.equal(reads[1], `https://www.facebook.com/ads/library/?id=${id}`);
    await assert.rejects(source.resolve(id), error => error instanceof SmokeSourceError && error.code === "source_not_video");
    assert.equal(reads.length, 2);
  } finally { await source.close(); }
});
