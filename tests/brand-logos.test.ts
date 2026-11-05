import {DatabaseSync} from "node:sqlite";
import type {DemoCollectionService} from "../server/demo/collection.js";
import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,readdir,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {BrandLogoStore,brandIdentities,iconCandidates,validateLogo,LOGO_MAX_BYTES,logoMime} from "../server/brand-logos.js";
import {fetchWebsiteResource} from "../server/demo/website.js";
import {brandInitials,logoAlt,type BrandIdentity} from "../shared/brand-identity.js";
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=","base64");
const brand:BrandIdentity={id:"fixture-brand",name:"Fixture Candle Co.",domain:"fixture-candle.example",color:"#233b80",initials:"FC",mode:"imported"};
const dns=async()=>[{address:"93.184.215.14",family:4}];
test("UI-00/UI-05 logo inputs accept only bounded raster containers with matching MIME",()=>{
 validateLogo(png,"image/png");
 for(const [bytes,mime] of [[Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/ >"),"image/svg+xml"],[png,"image/jpeg"],[Buffer.alloc(LOGO_MAX_BYTES),"image/png"],[Buffer.alloc(0),"image/png"],[Buffer.from("GIF89a"),"image/gif"]] as const)assert.throws(()=>validateLogo(bytes,mime));
 assert.equal(logoMime(Buffer.from([0,0,1,0,1,0])),"image/x-icon");
 assert.equal(logoMime(Buffer.from([255,216,255,0])),"image/jpeg");
 assert.equal(logoMime(Buffer.from("RIFF0000WEBPVP8 ")),"image/webp");
 assert.equal(logoAlt(brand.name,true),"");assert.equal(logoAlt(brand.name,false),brand.name);assert.equal(brandInitials(brand.name),"FC");
});
test("UI-05 icon ordering prefers apple touch then largest favicon; no SVG",()=>{
 const icons=iconCandidates('<link rel="icon" sizes="16x16" href="/small.png"><link rel="icon" sizes="192x192" href="/large.png"><link rel="apple-touch-icon" sizes="180x180" href="/apple.png"><link rel="icon" sizes="512x512" href="/bad.svg">',`https://${brand.domain}/`);
 assert.deepEqual(icons,[`https://${brand.domain}/apple.png`,`https://${brand.domain}/large.png`,`https://${brand.domain}/small.png`,`https://${brand.domain}/favicon.ico`]);
});
test("UI-05 upload wins, automatic icons are retained locally and refresh once a month",async()=>{
 const root=await mkdtemp(join(tmpdir(),"exter-logo-test-")),calls:string[]=[];let now=new Date("2026-11-04T12:00:00Z");
 const fixtureFetch:typeof fetch=async input=>{const url=String(input);calls.push(url);return url.endsWith("/")?new Response('<link rel="apple-touch-icon" href="/apple.png"><link rel="icon" sizes="256x256" href="/large.png">',{headers:{"content-type":"text/html"}}):new Response(png,{headers:{"content-type":"image/png"}});};
 const store=new BrandLogoStore({root,resolve:dns,fetch:fixtureFetch,now:()=>now});
 try {
  const results=await Promise.all([store.image(brand),store.image(brand),store.image(brand)]);assert.ok(results.every(image=>image?.equals(results[0]!)));assert.equal(calls.length,2);assert.match(calls[1],/apple\.png$/);
  const saved=results[0]!;assert.equal(saved.readUInt32BE(16),64);assert.equal(saved.readUInt32BE(20),64);assert.ok(saved.length<LOGO_MAX_BYTES);
  await store.image(brand);assert.equal(calls.length,2);
  now=new Date("2026-12-04T12:00:00Z");await store.image(brand);assert.equal(calls.length,4);
  await store.upload(brand,png,"image/png");now=new Date("2027-02-04T12:00:00Z");await store.image(brand);assert.equal(calls.length,4,"uploaded logo bypasses website even after automatic expiry");
  await store.reset(brand);await store.image(brand);assert.equal(calls.length,6);
  const manifest=(await readdir(store.root)).find(file=>file.endsWith(".json"))!;assert.doesNotMatch(await readFile(join(store.root,manifest),"utf8"),/https?:/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test("UI-05 failed apple falls back to largest icon; failure and sample use monogram without repeat fetch",async()=>{
 const root=await mkdtemp(join(tmpdir(),"exter-logo-fallback-")),calls:string[]=[];
 const store=new BrandLogoStore({root,resolve:dns,convert:async()=>png,fetch:async input=>{const url=String(input);calls.push(url);if(url.endsWith("/"))return new Response('<link rel="apple-touch-icon" href="/apple.svg"><link rel="apple-touch-icon" href="/bad.png"><link rel="icon" sizes="192x192" href="/large.png"><link rel="icon" sizes="16x16" href="/small.png">',{headers:{"content-type":"text/html"}});return new Response(url.endsWith("/bad.png")?Buffer.from("<svg/>"):png,{headers:{"content-type":"image/png"}});}});
 try{assert.ok(await store.image(brand));assert.equal(calls.length,3);assert.match(calls[2],/large\.png$/);
  assert.equal(await store.image({...brand,id:"sample-fixture",mode:"demo"}),null);assert.equal(calls.length,3);await assert.rejects(store.upload({...brand,mode:"demo"},png,"image/png"));
  let attempts=0;const failed=new BrandLogoStore({root,resolve:dns,fetch:async()=>{attempts++;throw new Error("fixture failure");}});
  assert.equal(await failed.image({...brand,id:"failed"}),null);assert.equal(await failed.image({...brand,id:"failed"}),null);assert.equal(attempts,1);
 }finally{await rm(root,{recursive:true,force:true});}
});
test("UI-05 website asset fetch blocks unrelated hosts, private DNS, bad redirects and size overruns",async()=>{
 let calls=0;const fixtureFetch:typeof fetch=async()=>{calls++;return new Response(png,{headers:{"content-type":"image/png"}});};
 for(const url of ["https://other.example/logo.png","http://fixture-candle.example/logo.png","https://fixture-candle.example:4433/logo.png","https://user:password@fixture-candle.example/logo.png","https://127.0.0.1/logo.png"])
  await assert.rejects(fetchWebsiteResource(brand.domain,url,LOGO_MAX_BYTES,{fetch:fixtureFetch,resolve:dns}));
 assert.equal(calls,0);
 await assert.rejects(fetchWebsiteResource(brand.domain,`https://${brand.domain}/logo.png`,LOGO_MAX_BYTES,{fetch:fixtureFetch,resolve:async()=>[{address:"127.0.0.1",family:4}]}));assert.equal(calls,0);
 await assert.rejects(fetchWebsiteResource(brand.domain,`https://${brand.domain}/`,LOGO_MAX_BYTES,{resolve:dns,fetch:async()=>new Response(null,{status:302,headers:{location:"https://other.example/logo.png"}})}));
 for(const declared of [false,true])await assert.rejects(fetchWebsiteResource(brand.domain,`https://${brand.domain}/logo.png`,LOGO_MAX_BYTES,{resolve:dns,fetch:async()=>new Response(Buffer.alloc(LOGO_MAX_BYTES),{headers:{"content-type":"image/png",...(declared?{"content-length":String(LOGO_MAX_BYTES)}:{})}})}));
});


test("UI-05 logo identities use the same configured competitor set before collection",()=>{
 const db=new DatabaseSync(":memory:");db.exec("CREATE TABLE brands(id TEXT PRIMARY KEY,data TEXT NOT NULL)");
 const workspace={...brand,competitors:[],voice:[],category:"Home fragrance & gifting",createdAt:"2026-11-04"};
 db.prepare("INSERT INTO brands VALUES (?,?)").run(workspace.id,JSON.stringify(workspace));
 const collection={snapshot:()=>({competitors:[{name:"Fictional Rival",domain:"fictional-rival.example",brandId:null,status:"not-started"}]})} as unknown as Pick<DemoCollectionService,"snapshot">;
 try{const identities=brandIdentities(db,workspace.id,collection);assert.equal(identities.length,2);assert.equal(identities[1].name,"Fictional Rival");assert.equal(identities[1].domain,"fictional-rival.example");assert.match(identities[1].id,/^competitor-/);assert.ok(!identities.some(b=>b.mode==="demo"));}finally{db.close();}
});
