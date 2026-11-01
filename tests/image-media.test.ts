import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { LocalImageMediaStore, type ImageMediaOptions } from "../server/image/media.js";
import { MediaStorageError } from "../server/video/media.js";

const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(40)]);
const other = Buffer.concat([png,Buffer.from("second fixture")]);
const secretUrl = "https://image.fixture.fbcdn.net/creative.png?signature=DO-NOT-PERSIST";
const input = {brandId:"brand-one",adId:"ad-one",kind:"image" as const,sourceUrls:[secretUrl]};
const validResponse = (value: Uint8Array = png) => new Response(new Uint8Array(value),{headers:{"Content-Type":"image/png"}});
const temporary = () => mkdtemp(join(tmpdir(),"exter-image-media-"));
const options = (root: string, extra: ImageMediaOptions = {}): ImageMediaOptions => ({root,allowedHosts:["*.fbcdn.net"],resolve:async()=>[{address:"8.8.8.8",family:4}],fetch:async()=>validResponse(),probe:async()=>({width:40,height:30}),...extra});

test("image sets retain ordered immutable bytes, scoped ownership, and no source secrets or absolute paths in manifests",async()=>{
  const root=await temporary();
  try {
    const store=new LocalImageMediaStore(options(root,{fetch:async url=>validResponse(String(url).includes("second")?other:png)}));
    const first=await store.store(input);
    assert.deepEqual(await store.load(first.mediaId),first);
    const carousel=await store.store({...input,kind:"carousel",sourceUrls:[secretUrl,"https://image.fixture.fbcdn.net/second.png?signature=ANOTHER"]});
    const reversed=await store.store({...input,kind:"carousel",sourceUrls:["https://image.fixture.fbcdn.net/second.png",secretUrl]});
    assert.notEqual(carousel.sha256,reversed.sha256,"carousel slide order is part of media identity");
    const scoped=await store.store({...input,brandId:"other-brand"});
    assert.equal(scoped.sha256,first.sha256); assert.notEqual(scoped.mediaId,first.mediaId);
    assert.equal(scoped.images[0].absolutePath,first.images[0].absolutePath);
    const raw=await readFile(join(root,"image-creatives",carousel.mediaId+".json"),"utf8");
    assert(!raw.includes("https://")); assert(!raw.includes("signature")); assert(!raw.includes("DO-NOT-PERSIST")); assert(!raw.includes("absolutePath"));
    assert.equal(carousel.images.length,2); assert.deepEqual(await readFile(carousel.images[1].absolutePath),other);
    assert.deepEqual(await new LocalImageMediaStore(options(root,{fetch:async()=>{throw new Error("No remote fetch on load");}})).load(carousel.mediaId),carousel);
  } finally {await rm(root,{recursive:true,force:true});}
});

test("a carousel with an unavailable slide never commits a partial creative and preserves existing stored images",async()=>{
  const root=await temporary();
  try {
    const store=new LocalImageMediaStore(options(root)); const first=await store.store(input);
    const before=await readdir(join(root,"image-creatives"));
    const failing=new LocalImageMediaStore(options(root,{fetch:async url=>String(url).includes("second")?new Response("private error body",{status:403}):validResponse()}));
    await assert.rejects(()=>failing.store({...input,kind:"carousel",sourceUrls:[secretUrl,"https://image.fixture.fbcdn.net/second.png?signature=PRIVATE"]}),(error:unknown)=>{
      assert(error instanceof MediaStorageError); assert.equal(error.code,"media_forbidden"); assert.equal(error.sourceHttpStatus,403); assert(!error.message.includes("PRIVATE")); assert(!error.message.includes("private error body")); return true;
    });
    assert.deepEqual(await readdir(join(root,"image-creatives")),before);
    assert.deepEqual(await failing.load(first.mediaId),first);
    assert(!(await readdir(join(root,"image-objects"))).some(file=>file.endsWith(".tmp")));
  } finally {await rm(root,{recursive:true,force:true});}
});

test("image downloads reject unapproved/private destinations and recheck every redirect",async()=>{
  const root=await temporary(); let calls=0;
  try {
    const store=new LocalImageMediaStore(options(root,{fetch:async()=>{calls++;return validResponse();}}));
    for(const url of ["http://image.fixture.fbcdn.net/x.png","https://user:password@image.fixture.fbcdn.net/x.png","https://127.0.0.1/x.png","https://image.fixture.fbcdn.net.evil.example/x.png"])
      await assert.rejects(()=>store.store({...input,sourceUrls:[url]}),/approved public HTTPS/);
    const privateHost=new LocalImageMediaStore(options(root,{resolve:async()=>[{address:"10.0.0.1",family:4}]}));
    await assert.rejects(()=>privateHost.store(input),/private, local/); assert.equal(calls,0);
    const redirect=new LocalImageMediaStore(options(root,{fetch:async(_url,init)=>{assert.equal(init?.redirect,"manual"); assert(!new Headers(init?.headers).has("authorization")); return new Response(null,{status:302,headers:{location:"https://unapproved.example/x.png"}});}}));
    await assert.rejects(()=>redirect.store(input),/approved public HTTPS/);
  } finally {await rm(root,{recursive:true,force:true});}
});

test("image MIME, actual container, decoded size and carousel bounds are enforced without truncation",async()=>{
  const root=await temporary();
  try {
    const cases:{extra:ImageMediaOptions;match:RegExp}[]=[
      {extra:{fetch:async()=>new Response("<svg/>",{headers:{"content-type":"image/svg+xml"}})},match:/accepted image content type/},
      {extra:{fetch:async()=>validResponse(Buffer.from("HTML masquerading as a PNG"))},match:/supported image container/},
      {extra:{maxBytes:12},match:/media limit/},
      {extra:{probe:async()=>({width:100000,height:100000})},match:/dimensions/},
    ];
    for(const item of cases) await assert.rejects(()=>new LocalImageMediaStore(options(root,item.extra)).store(input),item.match);
    const store=new LocalImageMediaStore(options(root));
    await assert.rejects(()=>store.store({...input,kind:"carousel",sourceUrls:[secretUrl]}),/all two to ten/);
    await assert.rejects(()=>store.store({...input,kind:"carousel",sourceUrls:Array.from({length:11},()=>secretUrl)}),/all two to ten/);
    await assert.rejects(()=>store.store({...input,sourceUrls:[secretUrl,secretUrl]}),/one image/);
    assert.deepEqual(await readdir(join(root,"image-creatives")).catch(()=>[]),[]);
  } finally {await rm(root,{recursive:true,force:true});}
});

test("image source HTTP failures and network timeouts are precise and never expose temporary URLs",async()=>{
  const root=await temporary();
  try {
    for(const [status,code] of [[404,"media_not_found"],[410,"media_expired"],[429,"media_rate_limited"],[503,"media_source_http_error"]] as const) {
      const store=new LocalImageMediaStore(options(root,{fetch:async()=>new Response(secretUrl,{status})}));
      await assert.rejects(()=>store.store(input),(error:unknown)=>{assert(error instanceof MediaStorageError); assert.equal(error.code,code); assert.equal(error.sourceHttpStatus,status); assert(!error.message.includes("https://")); return true;});
    }
    const timeout=new LocalImageMediaStore(options(root,{timeoutMs:1,fetch:async()=>{await new Promise(resolve=>setTimeout(resolve,5));throw new Error(secretUrl);}}));
    await assert.rejects(()=>timeout.store(input),(error:unknown)=>{assert(error instanceof MediaStorageError); assert.equal(error.code,"media_timeout"); assert(!error.message.includes("DO-NOT-PERSIST"));return true;});
  } finally {await rm(root,{recursive:true,force:true});}
});

test("retained image objects and manifest paths are verified before reuse",async()=>{
  const root=await temporary();
  try {
    const store=new LocalImageMediaStore(options(root)); const saved=await store.store(input);
    await writeFile(saved.images[0].absolutePath,Buffer.alloc(png.length));
    await assert.rejects(()=>store.load(saved.mediaId),/integrity verification/);
    await writeFile(saved.images[0].absolutePath,png);
    const path=join(root,"image-creatives",saved.mediaId+".json"); const manifest=JSON.parse(await readFile(path,"utf8"));
    manifest.images[0].relativePath="../../private"; await writeFile(path,JSON.stringify(manifest));
    await assert.rejects(()=>store.load(saved.mediaId),/integrity verification/);
  } finally {await rm(root,{recursive:true,force:true});}
});

test("ffprobe verifies a real retained PNG",async t=>{
  if(spawnSync("ffprobe",["-version"]).status!==0){t.skip("ffprobe unavailable");return;}
  const root=await temporary();
  const real=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=","base64");
  try {
    const store=new LocalImageMediaStore({...options(root,{fetch:async()=>validResponse(real)}),probe:undefined});
    const saved=await store.store(input); assert.equal(saved.images[0].mimeType,"image/png"); assert.deepEqual(await readFile(saved.images[0].absolutePath),real);
  } finally {await rm(root,{recursive:true,force:true});}
});
