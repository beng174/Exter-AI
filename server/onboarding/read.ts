import {countTaggedAds} from '../public-categories/jobs.js';
import {mediaGbpRate} from "../../shared/ad-media.js";
import type pg from "pg";
import type {DatabaseSync} from "node:sqlite";
import {readBrand} from "../db.js";
import {readMediaCoverage} from "../ad-media/coverage.js";
import {ONBOARDING_ERRORS,type RunData} from "./jobs.js";
import type {OnboardingView,OnboardingStepView,StepStatus} from "../../shared/onboarding/types.js";
const iso=(v:unknown)=>v?new Date(String(v)).toISOString():null;
export async function readOnboarding(pool:pg.Pool,db:DatabaseSync,workspace:string):Promise<OnboardingView|null>{
 const run=(await pool.query(`SELECT id,workspace_id,kind,phase,status,error_kind,created_at,updated_at,jsonb_build_object('name',data->'name','domain',data->'domain','ownMatches',data->'ownMatches','choices',data->'choices','pages','[]'::jsonb) AS data FROM brand_onboarding_runs WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 1`,[workspace])).rows[0];if(!run)return null;
 const [steps,profile,watchlists,coverage,tagged,mediaCosts,tagCosts,choicesState]=await Promise.all([
  pool.query('SELECT s.*,l.cost_gbp::float8,l.initial_reserved_gbp::float8,l.status AS cost_status,l.cost_basis FROM brand_onboarding_steps s LEFT JOIN cost_ledger l ON l.id=s.reservation_id WHERE s.run_id=$1',[run.id]),
  pool.query('SELECT * FROM brand_onboarding_profiles WHERE workspace_id=$1',[workspace]),
  pool.query("SELECT brand_key,page_ids FROM watchlists WHERE workspace_id=$1 AND enabled AND purpose='brand'",[workspace]),
  readMediaCoverage(pool,workspace),
  countTaggedAds(pool,workspace),
  pool.query(`SELECT sum((r.cap*.0005+.00005)*COALESCE(r.gbp_per_usd,$3::numeric))::float8 AS estimate,sum(l.initial_reserved_gbp) FILTER(WHERE l.status='reserved')::float8 AS reserved,sum(l.cost_gbp) FILTER(WHERE l.status='settled')::float8 AS actual,bool_or(l.status='reserved') AS pending FROM ad_media_runs r LEFT JOIN cost_ledger l ON l.id=r.reservation_id WHERE r.workspace_id=$1 AND r.started_at>=$2`,[workspace,run.created_at,mediaGbpRate(process.env)]),
  pool.query(`SELECT sum(r.estimate_gbp)::float8 AS estimate,sum(l.initial_reserved_gbp) FILTER(WHERE l.status='reserved')::float8 AS reserved,sum(l.cost_gbp) FILTER(WHERE l.status='settled')::float8 AS actual,bool_or(l.status='reserved') AS pending FROM public_category_batches r LEFT JOIN cost_ledger l ON l.id=r.reservation_id WHERE r.workspace_id=$1 AND r.created_at>=$2`,[workspace,run.created_at]),
  pool.query('SELECT domain,action FROM brand_onboarding_choices WHERE workspace_id=$1',[workspace])
 ]);
 const data=run.data as RunData,brand=readBrand(db,workspace),ads=coverage.reduce((n,c)=>n+c.official,0),images=coverage.reduce((n,c)=>n+c.images,0),tags=Math.min(ads,tagged);
 const savedPages=new Set<string>(watchlists.rows.filter(w=>w.brand_key===workspace).flatMap(w=>w.page_ids));
 const labels=[['understanding','Website analysed'],['pages','Page found'],['competitors','Competitors found'],...(run.kind==='monthly'?[]:[['collection','Ads collected'],['media','Media coverage'],['tagging','Category tagging'],['comparisons','Winners and comparisons']])];
 const views=labels.map(([key,label]):OnboardingStepView=>{const row=steps.rows.find(s=>s.key===key),paid=key==='competitors'?steps.rows.filter(s=>s.key.startsWith('competitor:')||s.key==='competitor-profiles'):row?[row]:[],costs=key==='media'?mediaCosts.rows[0]:key==='tagging'?tagCosts.rows[0]:null;
  const relevant=run.phase===key||key==='understanding'&&run.phase==='website',paused=relevant&&['paused','uncertain'].includes(run.status);
  const finalStatus:StepStatus=paused?run.status:row?.status==='starting'?'running':row?.status|| (relevant?'running':'queued');
  const actual=costs?costs.pending?null:costs.actual??(row?.status==='complete'?0:null):paid.some(s=>s.reservation_id&&s.cost_status==='reserved')?null:paid.length?paid.reduce((n,s)=>n+(s.cost_gbp??0),0):['pages','collection','comparisons'].includes(key)?0:null;
  const reserved=costs?.reserved??(paid.length?paid.reduce((n,s)=>n+(s.cost_status==='reserved'?s.initial_reserved_gbp??0:0),0):null),estimate=costs?.estimate??costs?.reserved??(paid.length?paid.reduce((n,s)=>n+Number(s.estimate_gbp??0),0):['pages','collection','comparisons'].includes(key)?0:null);
  const count=key==='understanding'?steps.rows.find(s=>s.key==='website')?.data?.count??null:key==='pages'?savedPages.size:key==='collection'?ads:key==='media'?images:key==='tagging'?tags:row?.data?.count??null;
  const detail=paused?ONBOARDING_ERRORS[run.error_kind]||ONBOARDING_ERRORS.provider:key==='media'?`${images.toLocaleString('en-GB')} of ${ads.toLocaleString('en-GB')} ads with an image or poster${row?.status==='needs_review'?'; others retry daily':''}`:key==='tagging'?`${tags.toLocaleString('en-GB')} of ${ads.toLocaleString('en-GB')} ads tagged`:key==='pages'&&row?.data?.noUkAds?'No UK Meta ads found':key==='competitors'&&row?.status==='complete'&&count<5?`${count} verified competitors found; fewer than five qualified`:key==='understanding'?`${steps.rows.find(s=>s.key==='website')?.data?.count||0} public pages read`:'';
  return {key,label,status:finalStatus,detail,count,estimatedGbp:estimate,reservedGbp:reserved,actualGbp:actual,costBasis:actual===null?null:['pages','collection','comparisons'].includes(key)?'observed':'estimated',checkedAt:iso(row?.updated_at)};
 });
 const matches=data.ownMatches||[],choices=data.choices.map(choice=>choicesState.rows.some(row=>row.domain===choice.domain&&row.action==='removed')?{...choice,state:'removed' as const}:brand?.competitorProfiles?.find(saved=>saved.domain===choice.domain)||choice);
 for(const choice of brand?.competitorProfiles||[])if(!choices.some(row=>row.domain===choice.domain))choices.push(choice);
 const review=matches.filter(p=>!savedPages.has(p.pageId)&&!p.highConfidence&&p.confidence>=50).slice(0,3);
 return {id:run.id,workspaceId:workspace,kind:run.kind,status:run.status,error:run.error_kind?ONBOARDING_ERRORS[run.error_kind]||ONBOARDING_ERRORS.provider:null,steps:views,pages:review,confirmedPages:matches.filter(p=>savedPages.has(p.pageId)),manualPages:[...savedPages].filter(id=>!matches.some(page=>page.pageId===id)),competitors:choices,understanding:profile.rows[0]?.profile||null,priceRange:profile.rows[0]?.price_range||null,sources:(profile.rows[0]?.pages||data.pages||[]).map((p:any)=>({url:p.url,title:p.title})),totals:{ads,images,tagged:tags,mediaPercent:ads?images/ads*100:null,taggedPercent:ads?tags/ads*100:null},needsReview:review.length+choices.filter(row=>['needs_review','suggested'].includes(row.state)).length,nextReviewAt:iso(profile.rows[0]?.next_review_at),updatedAt:iso(run.updated_at)!};
}
