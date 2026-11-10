import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type pg from "pg";
import { agreement, ACCURACY_VERSION, type AccuracyRow } from "../../shared/accuracy.js";
import { publishedReach } from "../../shared/meta-public.js";
import { ownedMetrics, type OwnedDay } from "../../shared/owned-metrics.js";
import { LABELLING_FIELDS, type HumanCreativeReview } from "../../shared/labelling.js";
import type { VideoAnalysisResult } from "../../shared/video-analysis.js";
import { jsonFingerprint } from "../infrastructure/meta-observations.js";

export function calculationChecks(at:string):AccuracyRow {
  const row:OwnedDay={platform:"Meta",accountId:"fixture",adId:"a",day:"2026-01-01",currency:"GBP",attribution:"7d_click",conversionEvent:"purchase",pulledAt:"2026-01-02T00:00:00Z",adName:null,adSetName:null,campaignName:null,assetIds:[],spend:100,impressions:10000,linkClicks:200,earlyViews:3000,longerViews:1500,videoStarts:5000,retention25:2000,retention50:1000,retention75:500,retention95:200,retention100:100,averageWatchTime:null,frequency:null,purchases:20,purchaseValue:600};
  const m=ownedMetrics([row]),expected=[100,10,.02,.3,.5,.4,.2,.1,.04,.02,20,5,6,.1,null,null];
  const actual=[m.Spend.value,m.CPM.value,m["Link CTR"].value,m["Hook rate"].value,m["Hold rate"].value,m["Retention 25%"].value,m["Retention 50%"].value,m["Retention 75%"].value,m["Retention 95%"].value,m["Retention 100%"].value,m.Purchases.value,m.CPA.value,m.ROAS.value,m.CVR.value,m.Frequency.value,m["Average watch time"].value];
  const revised=ownedMetrics([row,{...row,spend:200,pulledAt:"2026-01-03T00:00:00Z"}]);expected.push(200,null);actual.push(revised.Spend.value,ownedMetrics([{...row,purchaseValue:null}]).ROAS.value);
  let mixed=false;try{ownedMetrics([row,{...row,accountId:"other"}]);}catch{mixed=true;}expected.push(1);actual.push(mixed?1:0);
  const check=agreement(expected,actual);
  return {layer:"Calculations",field:"Owned metrics",version:ACCURACY_VERSION,score:check.score,sampleSize:check.total,checkedAt:at,status:check.matched===check.total?"Live":"In validation",detail:"Fixture-tested formulas. Fixtures are not live verification."};
}
export async function factChecks(pool:pg.Pool,workspace:string,at:string):Promise<AccuracyRow[]> {
  const result=await pool.query(`SELECT DISTINCT ON(o.native_id) o.native_id,o.active_status,o.reach,o.payload_hash,
    COALESCE(o.raw_payload,p.raw_payload) AS payload,a.start_time,a.stop_time,a.advertiser_id
    FROM ad_observations o JOIN public_ads a USING(platform,native_id)
    LEFT JOIN ad_observations p ON p.platform=o.platform AND p.native_id=o.native_id AND p.workspace_id=o.workspace_id AND p.run_id=o.raw_payload_run_id
    WHERE o.workspace_id=$1 AND o.platform='Meta' ORDER BY o.native_id,o.observed_at DESC,o.run_id DESC LIMIT 1000`,[workspace]);
  const pairs=new Map<string,{expected:unknown[];actual:unknown[]}>();
  const push=(field:string,a:unknown,b:unknown)=>{const pair=pairs.get(field)||{expected:[],actual:[]};pair.expected.push(a);pair.actual.push(b);pairs.set(field,pair);};
  const date=(v:unknown)=>v?new Date(String(v)).toISOString():null;
  for(const row of result.rows){const p=row.payload;if(!p||typeof p!=="object")continue;
    push("Ad identity",String(p.id),row.native_id);push("Page identity",p.page_id??null,row.advertiser_id??null);
    push("Delivery start",date(p.ad_delivery_start_time),date(row.start_time));push("Delivery stop",date(p.ad_delivery_stop_time),date(row.stop_time));
    push("Status",p.ad_delivery_stop_time?"inactive":"unknown",row.active_status);
    const reach=publishedReach(p);for(const field of ["eu","locations","demographics"] as const)push(`Published reach: ${field}`,reach[field],row.reach?.[field]??null);
    if(row.payload_hash)push("Original fields and copy",jsonFingerprint(p),row.payload_hash);
  }
  return [...pairs].map(([field,p])=>{const m=agreement(p.expected,p.actual);return {layer:"Facts",field,version:ACCURACY_VERSION,score:m.score,sampleSize:m.total,checkedAt:at,status:m.total?m.matched===m.total?"Live":"In validation":"Not enough data",detail:"Stored source comparison, up to 1,000 latest ads. Not a fresh Meta check."};});
}
const exists=(db:DatabaseSync,table:string)=>Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table));
/** Blind, file-matched labels only. Different machine versions never share a denominator. */
export function tagChecks(db:DatabaseSync,workspace:string,at:string):AccuracyRow[] {
  if(!exists(db,"human_creative_labels")||!exists(db,"video_analysis_runs"))return [];
  const reviews=(db.prepare("SELECT data FROM human_creative_labels WHERE brand_id=? ORDER BY labelled_at DESC LIMIT 2000").all(workspace) as {data:string}[]).map(r=>JSON.parse(r.data) as HumanCreativeReview).filter(r=>r.schemaVersion==="exter-human-labels-v2"&&r.mediaSha256&&r.taxonomyVersion&&r.labels.format!=="unsure");
  const groups=new Map<string,{field:string;version:string;expected:unknown[];actual:unknown[];ads:Set<string>}>();
  const queries=db.prepare("SELECT data FROM video_analysis_runs WHERE brand_id=? AND ad_id=? ORDER BY created_at DESC LIMIT 20");
  for(const review of reviews){const analysis=(queries.all(workspace,review.adId) as {data:string}[]).map(r=>JSON.parse(r.data) as VideoAnalysisResult).find(a=>a.mediaSha256===review.mediaSha256);
    if(!analysis)continue;const version=createHash("sha256").update(JSON.stringify([analysis.provider,analysis.model,analysis.modelVersion,analysis.promptVersion,analysis.analysisConfigSha256||analysis.id,review.taxonomyVersion,review.guideVersion,review.labels.format])).digest("hex").slice(0,16);
    const f=analysis.fields,ugc=new Set(f.creatorEvidence.map(e=>e.kind));
    const values:Record<string,unknown>={format:f.format.value,hookType:f.hook_type?.value,angle:f.angle.value,offerType:f.offer_type?.value,ugcEvidence:ugc.size===2?"both":ugc.has("paid-partnership-label")?"paid-partnership-label":ugc.has("visible-creator-handle")?"visible-creator-handle":"none"};
    for(const field of LABELLING_FIELDS){if(!(field.key in values)||review.labels[field.key]==="unsure")continue;
      // Disagreements require adjudication; do not choose whichever label matches the machine.
      if(reviews.some(r=>r.mediaSha256===review.mediaSha256&&r.labels[field.key]!==review.labels[field.key]))continue;
      const key=`${version}:${field.key}`,g=groups.get(key)||{field:`${field.label} (${review.labels.format})`,version,expected:[],actual:[],ads:new Set<string>()};if(g.ads.has(review.mediaSha256!))continue;
      g.ads.add(review.mediaSha256!);g.expected.push(review.labels[field.key]);g.actual.push(values[field.key]??null);groups.set(key,g);
    }
  }
  return [...groups.values()].map(g=>{const m=agreement(g.expected,g.actual);return {layer:"Tags",field:g.field,version:g.version,score:m.score,sampleSize:m.total,checkedAt:at,status:m.total<200?"Not enough data":m.score!>=.9?"Live":"In validation",detail:"Blind, matching-file labels. Uncertain and disputed reviews excluded."};});
}
