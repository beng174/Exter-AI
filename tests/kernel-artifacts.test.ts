import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readdir, readFile, writeFile, rm, symlink, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createKernelArtifactRef, validateKernelArtifactRef, DiskKernelArtifactStore,
  KernelArtifactBrokerClient, KernelArtifactError,
} from "../server/kernel/artifacts.js";

const payload = Buffer.from("retained fixture media"), token = "fixture-broker-token-" + "x".repeat(32);
const ref = (workspaceId = "valentte", data = payload) => createKernelArtifactRef({
  workspaceId, sha256: createHash("sha256").update(data).digest("hex"), bytes: data.length, mimeType: "video/mp4",
});
async function* chunks(data = payload) { yield data.subarray(0, 4); yield data.subarray(4); }
async function fixture(run: (store: DiskKernelArtifactStore, root: string) => Promise<void>, maxBytes?: number) {
  const root = await mkdtemp(join(tmpdir(), "exter-kernel-artifacts-"));
  try { await run(new DiskKernelArtifactStore({ root: join(root, "worker-cache"), maxBytes }), root); }
  finally { await rm(root, { recursive: true, force: true }); }
}
const hasCode = (code: string) => (error: unknown) => error instanceof KernelArtifactError && error.code === code;

test("kernel artifacts have deterministic scope-bound references without transport paths", () => {
  assert.deepEqual(ref(), ref());
  assert.notEqual(ref().artifactId, ref("ion8").artifactId);
  assert.deepEqual(validateKernelArtifactRef(ref()), ref());
  for (const value of [{ ...ref(), workspaceId: "../valentte" }, { ...ref(), absolutePath: "/var/data/private" },
    { ...ref(), bytes: 0 }, { ...ref(), sha256: "0".repeat(64) }, { ...ref(), mimeType: "text/html" }]) {
    assert.throws(() => validateKernelArtifactRef(value), hasCode("invalid"));
  }
});

test("worker cache deduplicates verified immutable objects and isolates equal media by workspace", async () => {
  await fixture(async store => {
    const first = await store.receive(ref(), chunks());
    const again = await store.put("valentte", "video/mp4", chunks());
    const other = await store.receive(ref("ion8"), chunks());
    assert.equal(first.absolutePath, again.absolutePath);
    assert.notEqual(first.absolutePath, other.absolutePath);
    assert.deepEqual(await readFile(first.absolutePath), payload);
    assert.deepEqual((await store.load(ref()))?.ref, ref());
    assert.deepEqual((await readdir(store.root)).filter(name => name.startsWith(".partial-")), []);
    assert.equal(JSON.stringify(first.ref).includes(store.root), false);
  });
});

test("reading a missing worker object creates no directories", async () => {
  await fixture(async (store, root) => {
    assert.equal(await store.load(ref()), null);
    assert.deepEqual(await readdir(root), []);
  });
});

test("streamed size/hash failures clean temporary files and preserve earlier objects", async () => {
  await fixture(async store => {
    const first = await store.receive(ref(), chunks());
    const changed = Buffer.from(payload); changed[0] ^= 1;
    await assert.rejects(store.receive(ref(), chunks(changed)), hasCode("corrupt"));
    await assert.rejects(store.receive(ref(), chunks(Buffer.concat([payload, Buffer.from("extra")]))), hasCode("too_large"));
    assert.deepEqual(await readFile(first.absolutePath), payload);
    assert.deepEqual((await readdir(store.root)).filter(name => name.startsWith(".partial-")), []);
  });
  await fixture(async store => {
    await assert.rejects(store.put("valentte", "video/mp4", chunks()), hasCode("too_large"));
    assert.deepEqual(await readdir(store.root), []);
  }, 8);
});

test("worker cache streams many chunks and never replaces a corrupted existing object", async () => {
  await fixture(async store => {
    const block = Buffer.alloc(16 * 1024, 3);
    async function* large() { for (let index = 0; index < 128; index++) yield block; }
    const saved = await store.put("valentte", "video/mp4", large());
    assert.equal(saved.ref.bytes, 2 * 1024 * 1024);
    assert.equal((await store.load(saved.ref))?.ref.sha256, saved.ref.sha256);
    const small = await store.receive(ref(), chunks());
    await writeFile(small.absolutePath, Buffer.from("corrupt bytes"));
    await assert.rejects(store.load(ref()), hasCode("corrupt"));
    await assert.rejects(store.receive(ref(), chunks()), hasCode("corrupt"));
    assert.equal((await readFile(small.absolutePath)).toString(), "corrupt bytes");
  }, 3 * 1024 * 1024);
});

test("cancelled artifact imports remove partial writes", async () => {
  await fixture(async store => {
    const controller = new AbortController();
    async function* interrupted() { yield payload.subarray(0, 4); controller.abort(); yield payload.subarray(4); }
    await assert.rejects(store.receive(ref(), interrupted(), { signal: controller.signal }), hasCode("aborted"));
    assert.deepEqual(await readdir(store.root), []);
    await assert.rejects(store.receive(ref(), chunks(), { signal: controller.signal }), hasCode("aborted"));
  });
});

test("worker cache rejects symlink roots, ancestors and object files", async () => {
  await fixture(async (store, root) => {
    const outside = join(root, "outside"), alias = join(root, "alias");
    await mkdir(outside);
    await symlink(outside, alias);
    const unsafe = new DiskKernelArtifactStore({ root: join(alias, "nested") });
    await assert.rejects(unsafe.receive(ref(), chunks()), hasCode("corrupt"));
    assert.deepEqual(await readdir(outside), []);
    const saved = await store.receive(ref(), chunks());
    const externalFile = join(outside, "private");
    await writeFile(externalFile, payload);
    await unlink(saved.absolutePath);
    await symlink(externalFile, saved.absolutePath);
    await assert.rejects(store.load(ref()), hasCode("corrupt"));
  });
});

test("artifact broker uses a dedicated token and fixed HTTPS origin, then verified cache avoids another request", async () => {
  await fixture(async store => {
    let requests = 0;
    const client = new KernelArtifactBrokerClient({ origin: "https://broker.example", token, store, fetch: async (target, init) => {
      requests++;
      assert.equal(String(target), `https://broker.example/api/kernel/artifacts/valentte/${ref().artifactId}`);
      assert.equal(init?.redirect, "error");
      assert.equal(new Headers(init?.headers).get("X-Exter-Artifact-Token"), token);
      assert.equal(new Headers(init?.headers).has("Authorization"), false);
      return new Response(payload, { headers: { "Content-Length": String(payload.length), "Content-Type": "video/mp4" } });
    } });
    const first = await client.retrieve(ref());
    assert.deepEqual(await readFile(first.absolutePath), payload);
    assert.deepEqual(await client.retrieve(ref()), first);
    assert.equal(requests, 1);
    assert.equal(JSON.stringify(client).includes(token), false);
  });
});

test("broker configuration rejects credentials, non-origin URLs, private address names and weak tokens", async () => {
  await fixture(async store => {
    for (const origin of ["http://broker.example", "https://user:secret@broker.example", "https://broker.example/path", "https://broker.example?token=secret", "https://127.0.0.1", "https://host.internal", "https://[::1]", "https://broker.example/#fragment"]) {
      assert.throws(() => new KernelArtifactBrokerClient({ origin, token, store }), hasCode("configuration"));
    }
    for (const invalid of ["", "short", token + "\r\n"]) {
      assert.throws(() => new KernelArtifactBrokerClient({ origin: "https://broker.example", token: invalid, store }), hasCode("configuration"));
    }
  });
});

test("broker errors and redirect failures are sanitised; failed verification never enters the cache", async () => {
  await fixture(async store => {
    for (const status of [302, 401, 403, 404, 409, 413, 429, 500, 503]) {
      const client = new KernelArtifactBrokerClient({ origin: "https://broker.example", token, store, fetch: async () => new Response(token, { status }) });
      await assert.rejects(client.retrieve(ref()), (error: unknown) => error instanceof KernelArtifactError && !error.message.includes(token));
    }
    const offline = new KernelArtifactBrokerClient({ origin: "https://broker.example", token, store, fetch: async () => { throw new Error(`raw error ${token}`); } });
    await assert.rejects(offline.retrieve(ref()), (error: unknown) => error instanceof KernelArtifactError && error.code === "unavailable" && !error.message.includes(token));
    const wrong = new KernelArtifactBrokerClient({ origin: "https://broker.example", token, store, fetch: async () => new Response(Buffer.alloc(payload.length, 0)) });
    await assert.rejects(wrong.retrieve(ref()), hasCode("corrupt"));
    assert.equal(await store.load(ref()), null);
  });
});

test("broker rejects inaccurate byte/type headers before consuming an untrusted stream", async () => {
  await fixture(async store => {
    for (const headers of [new Headers({ "Content-Length": "99999" }), new Headers({ "Content-Type": "text/html" })]) {
      let cancelled = false;
      const client = new KernelArtifactBrokerClient({ origin: "https://broker.example", token, store, fetch: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers }) });
      await assert.rejects(client.retrieve(ref()), hasCode("corrupt"));
      assert.equal(cancelled, true);
      assert.equal(await store.load(ref()), null);
    }
  });
});

test("broker cancellation and timeouts remain controlled and never cache partial content", async () => {
  await fixture(async store => {
    let requests = 0;
    const controller = new AbortController();
    const stopped = new KernelArtifactBrokerClient({ origin: "https://broker.example", token, store, fetch: async () => { requests++; throw new Error("unused"); } });
    controller.abort();
    await assert.rejects(stopped.retrieve(ref(), { signal: controller.signal }), hasCode("aborted"));
    assert.equal(requests, 0);

    const timedOut = new KernelArtifactBrokerClient({ origin: "https://broker.example", token, store, timeoutMs: 5, fetch: async (_target, init) => {
      // A real fetch rejects when its signal aborts. Keep the fixture event loop alive.
      return new Promise<Response>((_resolve, reject) => {
        const alive = setTimeout(() => reject(new Error("fixture did not time out")), 1000);
        init?.signal?.addEventListener("abort", () => { clearTimeout(alive); reject(new Error(`raw timeout ${token}`)); }, { once: true });
      });
    } });
    await assert.rejects(timedOut.retrieve(ref()), (error: unknown) => error instanceof KernelArtifactError && error.code === "unavailable" && error.status === 504 && !error.message.includes(token));
    assert.equal(await store.load(ref()), null);
  });
});
