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
import { CREATIVE_BOOLEAN_TAGS } from "../shared/creative-taxonomy.js";

const key = "fixture-image-credential";
const field = (value: string) => ({ value,confidence: 0.95,imageIndices: [1] });
const fields = (_kind: "image" | "carousel" = "image"): ImageAnalysisFields => ({
  format: field("static"), hook: field("Room fragrance"), hook_type: {...field("offer-led"),value:"offer-led"},
  headline: field("Save on your gift set"), angle: field("gifting"), angle_explanation: field("Gifting"),
  keyClaims: [{...field("Publisher says long lasting"),claim_type:["performance"]}], onScreenText: [field("Gift set")],
  offer: field("Bundle"), offer_type:{...field("bundle"),value:"bundle"}, cta:field("Shop now"),
  tags: Object.fromEntries(CREATIVE_BOOLEAN_TAGS.map(tag=>[tag,{...field("unknown"),value:false}])) as NonNullable<ImageAnalysisFields["tags"]>,
});
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
    const provider=new GeminiImageAnalyser({ apiKey:key,model:"gemini-fixture-flash",pricingModel:"gemini-fixture-flash-001",inputGbpPerMillion:1,outputGbpPerMillion:2,
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
    assert.equal(calls,2); assert.equal(reserves,1); assert.equal(result.fields.format.value,"static"); assert.equal(result.fields.offer.value,"Bundle");
    assert.equal(result.accounting.usage.outputTokens,25); assert.equal(result.accounting.usage.totalTokens,125);
    assert.equal(result.accounting.tokenCostGbp,0.00015); assert.equal(settled[0],0.00015); assert.equal(result.accounting.reservedCostGbp,0);
    assert.ok(!JSON.stringify(result).includes(key)); assert.match(JSON.stringify(result.accounting.rawResponse),/REDACTED/);
  } finally {await f.close();}
});
test("image requests apply low resolution and the fixed seed while reporting and pricing the served model",async()=>{
  const f=await fixture();let settles=0;
  try{
    const provider=new GeminiImageAnalyser({apiKey:key,model:"gemini-3.7-flash",inputGbpPerMillion:10,outputGbpPerMillion:20,
      modelPricingGbp:{"gemini-fixture-flash-001":{inputGbpPerMillion:1,outputGbpPerMillion:2}},
      reserveCost:async()=>({reservationId:"low-image",reservedGbp:0.2}),settleCost:async()=>{settles++;},
      fetch:async(_url,init)=>{
        if(init?.method!=="POST")return json({name:"models/gemini-3.7-flash"});
        const request=JSON.parse(String(init.body));assert.equal(request.generationConfig.temperature,0);assert.equal(request.generationConfig.seed,7);assert.equal(request.generationConfig.mediaResolution,"MEDIA_RESOLUTION_LOW");
        return json(payload());
      }});
    const result=await provider.analyse({media:f.media,context:{brandName:"Brand",adCopy:"Copy"},inferenceSettings:{mediaResolution:"low",generationSeed:7}});
    assert.equal(result.requestedModel,"gemini-3.7-flash");assert.equal(result.servedModel,"gemini-fixture-flash-001");assert.equal(result.modelVersion,"gemini-fixture-flash-001");
    assert.deepEqual(result.generation,{temperature:0,seedRequested:7,seedApplied:true,mediaResolutionRequested:"low",mediaResolutionApplied:true,providerMediaResolution:null});
    assert.equal(result.accounting.pricing?.model,"gemini-fixture-flash-001");assert.equal(result.accounting.tokenCostGbp,0.00015);assert.equal(settles,1);
  }finally{await f.close();}
});
test("image alias changes retain conservative budget coverage until matching served-model rates exist",async()=>{
  const f=await fixture();let settles=0;
  try{
    const provider=new GeminiImageAnalyser({apiKey:key,model:"gemini-fixture-flash",inputGbpPerMillion:1,outputGbpPerMillion:2,
      reserveCost:async()=>({reservationId:"unpriced-image",reservedGbp:0.2}),settleCost:async()=>{settles++;},
      fetch:async(_url,init)=>init?.method!=="POST"?json({name:"models/gemini-fixture-flash"}):json(payload())});
    const result=await provider.analyse({media:f.media,context:{brandName:"Brand",adCopy:"Copy"}});
    assert.equal(settles,0);assert.equal(result.accounting.tokenCostGbp,null);assert.equal(result.accounting.pricing,null);assert.equal(result.accounting.reservedCostGbp,0.2);
    assert.match(result.accounting.pricingReason??"",/differs from pricing model/);assert.equal(result.accounting.billedCostGbp,null);
  }finally{await f.close();}
});
test("image retries reuse the same reserve after a rejected server response and never double count settlement failures",async()=>{
  const f=await fixture(); let reserves=0,posts=0; const waits:number[]=[];
  try{
    const provider=new GeminiImageAnalyser({apiKey:key,model:"gemini-fixture-flash",maxRetries:1,retryBaseMs:2,pricingModel:"gemini-fixture-flash-001",inputGbpPerMillion:1,outputGbpPerMillion:2,
      reserveCost:async()=>({reservationId:`r-${++reserves}`,reservedGbp:0.2}),settleCost:async()=>{throw new Error("private details");},sleep:async ms=>{waits.push(ms);},
      fetch:async(_url,init)=>init?.method!=="POST"?json({name:"models/gemini-fixture-flash"}):++posts===1?json({error:{message:key}},503):json(payload())});
    const result=await provider.analyse({media:f.media,context:{brandName:"Brand",adCopy:"Copy"}});
    assert.equal(posts,2); assert.equal(reserves,1); assert.deepEqual(waits,[2]); assert.equal(result.accounting.requestAttempts,2);
    assert.equal(result.accounting.rejectedAttempts,1); assert.equal(result.accounting.retryAttempts,1); assert.equal(result.accounting.billedCostGbp,null);
    assert.equal(result.accounting.reservedCostGbp,0.2); assert.equal(result.accounting.estimatedCostGbp,0.2);
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
    const provider=new GeminiImageAnalyser({apiKey:key,model:"gemini-fixture-flash",pricingModel:"gemini-fixture-flash-001",inputGbpPerMillion:1,outputGbpPerMillion:2,fetch:async(_url,init)=>init?.method==="POST"?json(invalid):json({name:"models/gemini-fixture-flash"})});
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


test("final rejected image requests release one shared reserve and expose the sanitised provider diagnostic",async()=>{
  const f=await fixture(); let reserves=0,posts=0; const releases:string[]=[],waits:number[]=[];
  const hiddenQuery="opaque-signed-value";
  try{
    const provider=new GeminiImageAnalyser({apiKey:key,model:"gemini-fixture-flash",retryBaseMs:2,
      reserveCost:async()=>({reservationId:`held-${++reserves}`,reservedGbp:0.2}),releaseCost:async id=>{releases.push(id);},sleep:async ms=>{waits.push(ms);},
      fetch:async(_url,init)=>{
        if(init?.method!=="POST")return json({name:"models/gemini-fixture-flash"});
        posts++;
        return new Response(JSON.stringify({error:{code:503,status:"UNAVAILABLE",message:`Model overloaded for image input. Key ${key}; Authorization: Bearer bearer-secret-value; source https://user:password-secret@fixture.fbcdn.net/asset?token=${hiddenQuery}`,details:[{"@type":"type.googleapis.com/google.rpc.RetryInfo",retryDelay:"2s"}]}}),{status:503,headers:{"Content-Type":"application/json","Retry-After":"2","x-request-id":"provider-request-one"}});
      }});
    await assert.rejects(()=>provider.analyse({media:f.media,context:{brandName:"Brand",adCopy:"Copy"}}),(error:any)=>{
      assert.ok(error instanceof VideoProviderError);
      assert.match(error.message,/Model overloaded for image input/);
      assert.equal(error.diagnostic?.stage,"image_generation");
      assert.equal(error.diagnostic?.httpStatus,503);
      assert.equal(error.diagnostic?.providerStatus,"UNAVAILABLE");
      assert.ok(error.diagnostic?.details);
      const serialised=JSON.stringify(error);
      for(const secret of [key,hiddenQuery,"bearer-secret-value","password-secret"])assert.ok(!serialised.includes(secret),`sanitised diagnostic excludes ${secret}`);
      assert.equal(error.accounting?.requestAttempts,3);
      assert.equal(error.accounting?.rejectedAttempts,3);
      assert.equal(error.accounting?.reservedCostGbp,0);
      assert.equal(error.accounting?.estimatedCostGbp,0);
      assert.equal(error.accounting?.billedCostGbp,null,"HTTP rejection is not provider billing evidence");
      return true;
    });
    assert.equal(posts,3);assert.equal(reserves,1);assert.deepEqual(releases,["held-1"]);
    assert.deepEqual(waits,[2000,2000]);
  }finally{await f.close();}
});
test("ambiguous image timeouts retry with new coverage while retaining the original uncertain reserve",async()=>{
  const f=await fixture();let reserves=0,posts=0;const waits:number[]=[],settled:string[]=[];
  try{
    const provider=new GeminiImageAnalyser({apiKey:key,model:"gemini-fixture-flash",retryBaseMs:3,pricingModel:"gemini-fixture-flash-001",inputGbpPerMillion:1,outputGbpPerMillion:2,
      reserveCost:async()=>({reservationId:`timeout-${++reserves}`,reservedGbp:0.2}),settleCost:async id=>{settled.push(id);},sleep:async ms=>{waits.push(ms);},
      fetch:async(_url,init)=>{
        if(init?.method!=="POST")return json({name:"models/gemini-fixture-flash"});
        if(++posts<3)throw new DOMException("opaque upstream request body","TimeoutError");
        return json(payload());
      }});
    const result=await provider.analyse({media:f.media,context:{brandName:"Brand",adCopy:"Copy"}});
    assert.equal(posts,3);assert.equal(reserves,3);assert.deepEqual(waits,[3,6]);assert.deepEqual(settled,["timeout-3"]);
    assert.equal(result.accounting.reservedCostGbp,0.4);
    assert.equal(result.accounting.tokenCostGbp,0.00015);
    assert.ok(Math.abs(result.accounting.estimatedCostGbp!-0.40015)<1e-10);
    assert.equal(result.accounting.rejectedAttempts,0);assert.equal(result.accounting.billedCostGbp,null);
  }finally{await f.close();}
});

test("timed-out successful image response bodies are retried as uncertain attempts",async()=>{
  const f=await fixture();let reserves=0,posts=0;const waits:number[]=[];
  try{
    const provider=new GeminiImageAnalyser({apiKey:key,model:"gemini-fixture-flash",maxRetries:1,retryBaseMs:4,
      reserveCost:async()=>({reservationId:`body-${++reserves}`,reservedGbp:0.2}),sleep:async ms=>{waits.push(ms);},
      fetch:async(_url,init)=>{
        if(init?.method!=="POST")return json({name:"models/gemini-fixture-flash"});
        if(++posts===1)return new Response(new ReadableStream({start(controller){controller.error(new DOMException("untrusted transport text","TimeoutError"));}}),{headers:{"Content-Type":"application/json"}});
        return json(payload());
      }});
    const result=await provider.analyse({media:f.media,context:{brandName:"Brand",adCopy:"Copy"}});
    assert.equal(posts,2);assert.equal(reserves,2);assert.deepEqual(waits,[4]);
    assert.equal(result.accounting.reservedCostGbp,0.4,"missing prices keep both possible charges reserved");
    assert.equal(result.accounting.usage.totalTokens,125);
    assert.equal(result.accounting.billedCostGbp,null);
  }finally{await f.close();}
});
