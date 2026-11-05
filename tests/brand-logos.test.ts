import {DatabaseSync} from "node:sqlite";
import type {DemoCollectionService} from "../server/demo/collection.js";
import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,readdir,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {BrandLogoStore,brandIdentities,savedMetaPageId,iconCandidates,validateLogo,LOGO_MAX_BYTES,logoMime} from "../server/brand-logos.js";
import {fetchWebsiteResource,fetchMetaPagePicture} from "../server/demo/website.js";
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

test("UI-05 Meta Page picture precedes the website, shares the monthly cache and yields to uploads",async()=>{
 const root=await mkdtemp(join(tmpdir(),"exter-page-logo-")),calls:string[]=[];
 let now=new Date("2026-11-05T12:00:00Z");const page={...brand,metaPageId:"123456789"};
 const store=new BrandLogoStore({root,resolve:dns,convert:async bytes=>bytes,now:()=>now,fetch:async(input,init)=>{
  const url=String(input);calls.push(url);assert.equal(new Headers(init?.headers).get("authorization"),null);assert.ok(!new URL(url).searchParams.has("access_token"));
  return url.startsWith("https://graph.facebook.com/")?new Response(null,{status:302,headers:{location:"https://scontent.fixture.fbcdn.net/picture.png"}}):new Response(png,{headers:{"content-type":"image/png"}});
 }});
 try{
  assert.ok(await store.image(page));assert.equal(calls.length,2);assert.match(calls[0],/\/123456789\/picture\?type=large$/);assert.ok(!calls.some(url=>url.includes(brand.domain)));
  await store.image(page);assert.equal(calls.length,2);
  now=new Date("2026-12-05T12:00:00Z");await store.image(page);assert.equal(calls.length,4);
  await store.upload(page,png,"image/png");now=new Date("2027-02-05T12:00:00Z");await store.image(page);assert.equal(calls.length,4);
  await store.reset(page);await store.image(page);assert.equal(calls.length,6);
  await store.image({...page,metaPageId:"987654321"});assert.equal(calls.length,8,"a changed Page identity refreshes immediately");
  const manifest=(await readdir(store.root)).find(file=>file.endsWith(".json"))!;assert.doesNotMatch(await readFile(join(store.root,manifest),"utf8"),/https?:|access_token|authorization/i);
  await store.image({...page,mode:"demo"});assert.equal(calls.length,8,"sample mode makes no Page or website request");
 }finally{await rm(root,{recursive:true,force:true});}
});

test("UI-05 failed or unsupported Page pictures fall back to a valid own-site raster",async()=>{
 for(const failure of ["denied","svg","oversized"]){
  const root=await mkdtemp(join(tmpdir(),"exter-page-fallback-")),calls:string[]=[];
  const store=new BrandLogoStore({root,resolve:dns,convert:async bytes=>bytes,fetch:async input=>{
   const url=String(input);calls.push(url);
   if(url.startsWith("https://graph.facebook.com/"))return failure==="denied"?new Response("denied",{status:403}):failure==="svg"?new Response("<svg/>",{headers:{"content-type":"image/svg+xml"}}):new Response(Buffer.alloc(LOGO_MAX_BYTES),{headers:{"content-type":"image/png"}});
   return url.endsWith("/")?new Response('<link rel="apple-touch-icon" href="/apple.png">',{headers:{"content-type":"text/html"}}):new Response(png,{headers:{"content-type":"image/png"}});
  }});
  try{assert.ok(await store.image({...brand,metaPageId:"123456789"}));assert.equal(calls.length,3);assert.match(calls[0],/graph\.facebook\.com/);assert.equal(calls[1],`https://${brand.domain}/`);await store.image({...brand,metaPageId:"123456789"});assert.equal(calls.length,3);}finally{await rm(root,{recursive:true,force:true});}
 }
});

test("UI-05 Page picture transport rejects unrelated redirects, private CDN DNS and invalid IDs",async()=>{
 for(const location of ["https://other.example/logo.png","https://scontent.fbcdn.net.other.example/logo.png","http://scontent.fixture.fbcdn.net/logo.png","https://user:password@scontent.fixture.fbcdn.net/logo.png"]){
  let calls=0;
  await assert.rejects(fetchMetaPagePicture("123456789",LOGO_MAX_BYTES,{resolve:dns,fetch:async()=>{calls++;return new Response(null,{status:302,headers:{location}});}}));assert.equal(calls,1);
 }
 let calls=0;await assert.rejects(fetchMetaPagePicture("123456789",LOGO_MAX_BYTES,{resolve:async host=>[{address:host.endsWith("fbcdn.net")?"127.0.0.1":"93.184.215.14",family:4}],fetch:async()=>{calls++;return new Response(null,{status:302,headers:{location:"https://scontent.fixture.fbcdn.net/logo.png"}});}}));assert.equal(calls,1);
 for(const pageId of ["../me","123?access_token=fixture","https://other.example","", "1".repeat(31)])await assert.rejects(async()=>fetchMetaPagePicture(pageId,LOGO_MAX_BYTES,{resolve:dns,fetch:async()=>{throw new Error("Must not fetch invalid IDs");}}));
});

test("UI-05 brand logo identity uses advertiser evidence and never substitutes a creator Page",()=>{
 const db=new DatabaseSync(":memory:");db.exec("CREATE TABLE brands(id TEXT PRIMARY KEY,data TEXT NOT NULL);CREATE TABLE ads(id TEXT PRIMARY KEY,brand_id TEXT,source TEXT,platform TEXT,data TEXT)");
 const workspace={...brand,competitors:[],voice:[],category:"Home fragrance & gifting" as const,createdAt:"2026-11-05"};db.prepare("INSERT INTO brands VALUES (?,?)").run(workspace.id,JSON.stringify(workspace));
 const add=(id:string,page:string|undefined,source="public")=>db.prepare("INSERT INTO ads VALUES (?,?,?,?,?)").run(id,brand.id,source,"Meta",JSON.stringify({id,brandId:brand.id,source,advertiserPageId:page,brandedContentPartner:{pageId:"999999"}}));
 try{
  add("creator-only",undefined);assert.equal(savedMetaPageId(db,workspace),undefined);
  add("saved","123456789");add("sample","111111111","sample");assert.equal(brandIdentities(db,brand.id)[0].metaPageId,"123456789");
  add("another-page","222222222");assert.equal(savedMetaPageId(db,workspace),undefined,"ambiguous advertiser pages are not guessed");
  assert.equal(savedMetaPageId(db,{...workspace,metaPageId:"333333333"}),"333333333");
  assert.equal(savedMetaPageId(db,{...workspace,mode:"demo",metaPageId:"333333333"}),undefined);
 }finally{db.close();}
});
