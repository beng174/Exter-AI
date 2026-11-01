import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GeminiImageAnalyser, type ImageProviderResult } from "../server/image/gemini.js";
import { ImageAnalysisService } from "../server/image/service.js";
import { VideoProviderError } from "../server/video/types.js";
import { openDatabase } from "../server/db.js";
import type { StoredImageCreative, ImageAnalysisFields } from "../shared/image-analysis.js";
import { IMAGE_PROMPT_VERSION } from "../shared/image-analysis.js";

const key = "fixture-image-credential";
const field = (value: string) => ({ value,confidence: 0.95,imageIndices: [1] });
const fields = (kind: "image" | "carousel" = "image"): ImageAnalysisFields => ({ format: field(kind === "image" ? "static" : "carousel"),hook: field("Room fragrance"),headline: field("Save on your gift set"),angle: field("Gifting"),keyClaims: [field("Publisher says long lasting")],onScreenText: [field("Gift set")],offer: field("Bundle"),cta: field("Shop now") });
function payload(kind: "image" | "carousel" = "image") {
  return { modelVersion: "gemini-fixture-flash-001", candidates: [{ finishReason: "STOP",content: { parts: [{ text: JSON.stringify(fields(kind)) }] } }],usageMetadata: { promptTokenCount: 100,candidatesTokenCount: 20,thoughtsTokenCount: 5,totalTokenCount: 125 } };
}
const json = (data: unknown,status = 200) => new Response(JSON.stringify(data),{ status,headers: { "Content-Type":"application/json" } });
async function fixture(kind: "image" | "carousel" = "image") {
  const root = await mkdtemp(join(tmpdir(),"exter-image-analysis-"));
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU6sAAAAASUVORK5CYII=","base64");
  const path = join(root,"one.png"); await writeFile(path,bytes);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const image = { absolutePath:path,relativePath:"images/one.png",mimeType:"image/png" as const,sha256:sha,bytes:bytes.length };
  const media: StoredImageCreative = { mediaId:"a".repeat(64),sha256:"b".repeat(64),kind,brandId:"brand",adId:"ad",storedAt:new Date().toISOString(),images:kind === "image" ? [image] : [image,{...image}] };
  return { root,bytes,media,close:()=>rm(root,{recursive:true,force:true}) };
}
test("Gemini analyses all retained carousel slides as image inputs and persists structured fields, token usage and safe raw response", async () => {
  const f=await fixture("carousel"); let reserves=0; const settled: number[]=[]; let calls=0;
  try {
    const provider=new GeminiImageAnalyser({ apiKey:key,model:"gemini-fixture-flash",inputGbpPerMillion:1,outputGbpPerMillion:2,
      reserveCost:async()=>({reservationId:`attempt-${++reserves}`,reservedGbp:0.2}),settleCost:async(_id,cost)=>{settled.push(cost);},
      fetch:async(input,init)=>{
        calls++; const url=new URL(String(input)); assert.equal(url.hostname,"generativelanguage.googleapis.com"); assert.equal(url.search,""); assert.equal(new Headers(init?.headers).get("x-goog-api-key"),key); assert.equal(init?.redirect,"manual");
        if(init?.method!=="POST")return json({name:"models/gemini-fixture-flash",version:"fixture-1"});
        const request=JSON.parse(String(init.body));
        const parts=request.contents[0].parts; assert.equal(parts.filter((part:any)=>part.inline_data).length,2);
        assert.ok(parts.filter((part:any)=>part.inline_data).every((part:any)=>part.inline_data.mime_type==="image/png" && Buffer.from(part.inline_data.data,"base64").equals(f.bytes)));
        assert.ok(!JSON.stringify(request).includes("media_processing")); assert.equal(request.generationConfig.responseMimeType,"application/json");
        return json({...payload("carousel"),echo:key});
      }});
    const result=await provider.analyse({media:f.media,context:{brandName:"Brand",adCopy:"Original source copy"}});
    assert.equal(calls,2); assert.equal(reserves,1); assert.equal(result.fields.format.value,"carousel"); assert.equal(result.fields.offer.value,"Bundle");
    assert.equal(result.accounting.usage.outputTokens,25); assert.equal(result.accounting.usage.totalTokens,125);
    assert.equal(result.accounting.tokenCostGbp,0.00015); assert.equal(settled[0],0.00015); assert.equal(result.accounting.reservedCostGbp,0);
    assert.ok(!JSON.stringify(result).includes(key)); assert.match(JSON.stringify(result.accounting.rawResponse),/REDACTED/);
  } finally {await f.close();}
});
test("image retries reserve each billable attempt and preserve unknown earlier charges without double counting settlement failures",async()=>{
  const f=await fixture(); let reserves=0,posts=0; const waits:number[]=[];
  try{
    const provider=new GeminiImageAnalyser({apiKey:key,model:"gemini-fixture-flash",maxRetries:1,retryBaseMs:2,inputGbpPerMillion:1,outputGbpPerMillion:2,
      reserveCost:async()=>({reservationId:`r-${++reserves}`,reservedGbp:0.2}),settleCost:async()=>{throw new Error("private details");},sleep:async ms=>{waits.push(ms);},
      fetch:async(_url,init)=>init?.method!=="POST"?json({name:"models/gemini-fixture-flash"}):++posts===1?json({error:{message:key}},503):json(payload())});
    const result=await provider.analyse({media:f.media,context:{brandName:"Brand",adCopy:"Copy"}});
    assert.equal(posts,2); assert.equal(reserves,2); assert.deepEqual(waits,[2]); assert.equal(result.accounting.requestAttempts,2);
    assert.equal(result.accounting.reservedCostGbp,0.4); assert.equal(result.accounting.estimatedCostGbp,0.4);
    assert.ok(!JSON.stringify(result).includes("private details"));
  }finally{await f.close();}
});
test("image budget pause blocks dispatch and invalid structured outputs retain raw response, usage and costs",async()=>{
  const f=await fixture(); let posts=0;
  try{
    const blocked=new GeminiImageAnalyser({apiKey:key,model:"gemini-fixture-flash",reserveCost:async()=>{throw new Error(key);},fetch:async(_url,init)=>{if(init?.method==="POST")posts++;return json({name:"models/gemini-fixture-flash"});}});
    await assert.rejects(()=>blocked.analyse({media:f.media,context:{brandName:"Brand",adCopy:"Copy"}}),(error:any)=>error instanceof VideoProviderError && error.code==="budget_paused" && error.accounting?.requestAttempts===0 && error.accounting.estimatedCostGbp===null && !error.message.includes(key));
    assert.equal(posts,0);
    const invalid=payload(); invalid.candidates[0].content.parts[0].text=JSON.stringify({...fields(),headline:{...field("Bad evidence"),imageIndices:[2]}});
    const provider=new GeminiImageAnalyser({apiKey:key,model:"gemini-fixture-flash",inputGbpPerMillion:1,outputGbpPerMillion:2,fetch:async(_url,init)=>init?.method==="POST"?json(invalid):json({name:"models/gemini-fixture-flash"})});
    await assert.rejects(()=>provider.analyse({media:f.media,context:{brandName:"Brand",adCopy:"Copy"}}),(error:any)=>error instanceof VideoProviderError && error.code==="invalid_output" && error.accounting?.usage.totalTokens===125 && error.accounting.estimatedCostGbp===0.00015 && Boolean(error.accounting.rawResponse));
  }finally{await f.close();}
});
test("image media integrity fails before model lookup or budget reservation",async()=>{
  const f=await fixture(); let calls=0;
  try{
    await writeFile(f.media.images[0].absolutePath,Buffer.alloc(f.bytes.length));
    const provider=new GeminiImageAnalyser({apiKey:key,model:"gemini-fixture-flash",fetch:async()=>{calls++;return json({});},reserveCost:async()=>{calls++;return undefined;}});
    await assert.rejects(()=>provider.analyse({media:f.media,context:{brandName:"Brand",adCopy:"Copy"}}),/checksum/); assert.equal(calls,0);
  }finally{await f.close();}
});
test("image service persists scoped immutable media, completed results and failed accounting, and never replays an uncertain attempt",async()=>{
  const db=openDatabase(":memory:",false); const f=await fixture(); let analyses=0,fail=false;
  const brand={id:"brand",name:"Brand"}; const ad={id:"ad",brandId:"brand",brand:"Brand",source:"public",platform:"Meta",publishedAt:"2026-11-01",copy:"Copy"};
  db.prepare("INSERT INTO brands VALUES (?,?)").run(brand.id,JSON.stringify(brand)); db.prepare("INSERT INTO ads VALUES (?,?,?,?,?,?)").run(ad.id,ad.brandId,ad.source,ad.platform,ad.publishedAt,JSON.stringify(ad));
  const usage={usage:{inputTokens:100,outputTokens:20,totalTokens:120},tokenCostGbp:0.01,reservedCostGbp:0,estimatedCostGbp:0.01,costBasis:"token_estimate" as const,pricing:null,requestAttempts:1,rawResponse:{fixture:"raw"}};
  const service=new ImageAnalysisService(db,{mediaStore:{store:async()=>f.media,load:async()=>f.media},analyserFactory:()=>({model:"fixture",analyse:async()=>{analyses++;if(fail)throw new VideoProviderError("invalid_output","Invalid output",usage);return {model:"fixture",modelVersion:null,promptVersion:IMAGE_PROMPT_VERSION,fields:fields(),accounting:usage} satisfies ImageProviderResult;}})});
  try{
    await service.storeMedia("brand","ad",["https://fixture.fbcdn.net/image.png"],"image");
    assert.equal((await service.latestMedia("brand","ad"))!.mediaId,f.media.mediaId);
    const result=await service.analyse("brand","ad",f.media.mediaId,"same-attempt"); assert.equal(result.id,"same-attempt");
    assert.equal((await service.analyse("brand","ad",f.media.mediaId,"same-attempt")).id,result.id);assert.equal(analyses,1);
    fail=true; await assert.rejects(()=>service.analyse("brand","ad",f.media.mediaId,"failed-attempt"),/Invalid output/);
    assert.equal(service.attemptAccounting("brand","ad","failed-attempt")!.estimatedCostGbp,0.01);
    await assert.rejects(()=>service.analyse("brand","ad",f.media.mediaId,"failed-attempt"),/will not be replayed/); assert.equal(analyses,2);
    assert.equal(service.history("brand","ad").length,1);assert.equal(await service.storedMedia("brand","ad","not-this-media"),null);
    assert.equal(service.attemptAccounting("other","ad","failed-attempt"),null);
    fail=false; const duplicate=await Promise.allSettled([service.analyse("brand","ad",f.media.mediaId,"parallel-attempt"),service.analyse("brand","ad",f.media.mediaId,"parallel-attempt")]);
    assert.equal(duplicate.filter(value=>value.status==="fulfilled").length,1);assert.equal(analyses,3);
  }finally{db.close();await f.close();}
});
