import {readBrandResearch,saveBrandResearch} from "../brand-research.js";
import type {BrandResearch} from "../../shared/brand-research.js";
import {randomUUID,createHash} from "node:crypto";
import type pg from "pg";
import type {DatabaseSync} from "node:sqlite";
import {readBrand} from "../db.js";
import type {Brand} from "../../shared/types.js";
import type {BrandUnderstanding,CompetitorChoice,IdentityMatch,WebsitePage} from "../../shared/onboarding/types.js";
import {captionDomain} from "../../shared/meta-page-candidates.js";
import {nextMonth,priceRange} from "../../shared/onboarding/rules.js";
export const competitorKey=(name:string)=>`name:${name.trim().toLocaleLowerCase()}`;
export function onboardingBrand(db:DatabaseSync,name:unknown,website:unknown){
 if(typeof name!=="string"||!name.trim()||name.trim().length>80||typeof website!=="string"||website.length>240)throw new Error('input');
 const domain=captionDomain(website);if(!domain||/(?:^|\.)(?:localhost|local|internal|invalid|lan|home)$/.test(domain))throw new Error('input');
 const existing=(db.prepare('SELECT data FROM brands').all() as {data:string}[]).map(row=>JSON.parse(row.data) as Brand).find(brand=>brand.mode!=="demo"&&captionDomain(brand.domain)===domain);
 if(existing)return existing;
 const brand:Brand={id:randomUUID(),name:name.trim(),domain,category:"Not yet understood",color:'#0C1F96',initials:name.trim().split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase(),voice:[],competitors:[],mode:'imported',createdAt:new Date().toISOString()};
 db.prepare('INSERT INTO brands VALUES(?,?)').run(brand.id,JSON.stringify(brand));return brand;
}
export {enqueueOnboarding} from "./queue.js";
export async function applyUnderstanding(pool:pg.Pool,db:DatabaseSync,workspace:string,profile:BrandUnderstanding,pages:WebsitePage[],kind:string){
 const client=await pool.connect();let updated:Brand;let brand:Brand;
 try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`public-categories:${workspace}`]);
  const current=readBrand(db,workspace);if(!current||current.mode==='demo')throw new Error('workspace');brand=current;
  const manual=brand.primaryCategoriesSource==='manual'||brand.primaryCategories!==undefined&&brand.primaryCategoriesSource!=='onboarding',categories=manual||kind==='monthly'?brand.primaryCategories??profile.categories:profile.categories;
  const keywordOverride=(await client.query("SELECT search_terms FROM watchlists WHERE workspace_id=$1 AND purpose='discovery' AND managed_by='manual' ORDER BY revision DESC,id LIMIT 1",[workspace])).rows[0];
  updated={...readBrand(db,workspace)!,category:categories[0]||brand.category,primaryCategories:categories,primaryCategoriesSource:manual?'manual':'onboarding',discoveryKeywords:keywordOverride?.search_terms||profile.keywords};
  await client.query(`INSERT INTO workspace_category_vocabularies(workspace_id,categories) VALUES($1,$2) ON CONFLICT(workspace_id) DO UPDATE SET categories=excluded.categories,updated_at=now()`,[workspace,JSON.stringify(categories)]);
  db.prepare('UPDATE brands SET data=? WHERE id=?').run(JSON.stringify(updated),workspace);await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 await pool.query(`INSERT INTO brand_onboarding_profiles(workspace_id,profile,pages,price_range,next_review_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(workspace_id) DO UPDATE SET profile=excluded.profile,pages=excluded.pages,price_range=excluded.price_range,next_review_at=excluded.next_review_at,updated_at=now()`,[workspace,JSON.stringify(profile),JSON.stringify(pages),JSON.stringify(priceRange(pages)),nextMonth(new Date())]);
 const previous=readBrandResearch(db,workspace),sources=pages.map((page,index)=>({id:`setup-source-${index}`,url:page.url,title:page.title,kind:'website' as const,observedAt:page.checkedAt,textExcerpt:page.text,status:'available' as const})),sourceUrls=new Set(sources.map(source=>source.url));
 const facts=profile.claims.map(claim=>({label:'Website product claim',value:claim.text,quote:claim.quote,sourceUrl:pages[claim.source].url,kind:'brand_claim' as const}));
 const research:BrandResearch={...(previous||{}),brandId:workspace,brandName:brand.name,domain:brand.domain,category:updated.category,observedAt:new Date().toISOString(),sources:[...sources,...(previous?.sources||[]).filter(source=>!sourceUrls.has(source.url))],facts:[...facts,...(previous?.facts||[]).filter(fact=>!sourceUrls.has(fact.sourceUrl))],analysis:previous?.analysis||null,analysisStatus:previous?.analysisStatus||'analysis_unavailable',socialProfiles:previous?.socialProfiles||pages.flatMap(page=>page.socialLinks.map(url=>({platform:'Facebook',url}))),creatorFeatures:previous?.creatorFeatures||[],competitorCandidates:previous?.competitorCandidates||[],limitations:previous?.limitations||['Website statements are brand claims, not independently verified facts.'],proposedTests:previous?.proposedTests||[],understanding:profile,priceRange:priceRange(pages)};
 if(previous){db.exec('CREATE TABLE IF NOT EXISTS brand_research_history (brand_id TEXT NOT NULL,content_hash TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(brand_id,content_hash))');const data=JSON.stringify(previous);db.prepare('INSERT OR IGNORE INTO brand_research_history VALUES(?,?,?,?)').run(workspace,createHash('sha256').update(data).digest('hex'),data,new Date().toISOString());}
 saveBrandResearch(db,research);
 return updated;
}
async function savePages(client:pg.PoolClient,workspace:string,key:string,pages:string[],force=false){
 const manual=(await client.query("SELECT id FROM watchlists WHERE workspace_id=$1 AND brand_key=$2 AND managed_by='manual' AND (jsonb_array_length(page_ids)>0 OR revision>1)",[workspace,key])).rows;
 if(manual.length&&!force)return false;
 for(const page of pages){const id=`auto:${randomUUID()}`;if(force){const enabled=await client.query("UPDATE watchlists SET enabled=true,revision=revision+CASE WHEN enabled THEN 0 ELSE 1 END,managed_by='manual' WHERE workspace_id=$1 AND brand_key=$2 AND page_ids->>0=$3 RETURNING id",[workspace,key,page]);if(enabled.rowCount)continue;}
  await client.query(`INSERT INTO watchlists(id,workspace_id,brand_key,page_ids,countries,managed_by) VALUES($1,$2,$3,$4,'["GB"]',$5) ON CONFLICT DO NOTHING`,[id,workspace,key,JSON.stringify([page]),force?'manual':'onboarding']);}
 return true;
}
export async function saveAutomaticPages(pool:pg.Pool,workspace:string,key:string,pages:string[],force=false){
 const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[workspace]);const saved=await savePages(client,workspace,key,pages,force);await client.query('COMMIT');return saved;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function applyCompetitor(pool:pg.Pool,db:DatabaseSync,workspace:string,choice:CompetitorChoice){
 const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[workspace]);
  if((await client.query("SELECT 1 FROM brand_onboarding_choices WHERE workspace_id=$1 AND domain=$2 AND action='removed'",[workspace,choice.domain])).rowCount){await client.query('COMMIT');return;}
  const brand=readBrand(db,workspace);if(!brand||brand.mode==='demo')throw new Error('workspace');
  const profiles=[...(brand.competitorProfiles||[]).filter(row=>row.domain!==choice.domain),choice];
  db.prepare('UPDATE brands SET data=? WHERE id=?').run(JSON.stringify({...brand,competitorProfiles:profiles,competitors:[...new Set([...brand.competitors,choice.name])]}),workspace);
  const existing=(db.prepare('SELECT data FROM brands').all() as {data:string}[]).map(row=>JSON.parse(row.data) as Brand).find(row=>row.mode!=='demo'&&captionDomain(row.domain)===choice.domain);
  await savePages(client,workspace,existing?.id||competitorKey(choice.name),choice.pageIds,choice.state==='confirmed');
  await client.query("INSERT INTO brand_onboarding_choices(workspace_id,domain,action) VALUES($1,$2,'added') ON CONFLICT(workspace_id,domain) DO UPDATE SET action='added',updated_at=now()",[workspace,choice.domain]);await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function applyOwnPages(pool:pg.Pool,db:DatabaseSync,workspace:string,pages:IdentityMatch[],force=false){
 if(!pages.length)return;const saved=await saveAutomaticPages(pool,workspace,workspace,pages.map(page=>page.pageId),force);if(!saved)return;const brand=readBrand(db,workspace);if(brand&&!brand.metaPageId)db.prepare('UPDATE brands SET data=? WHERE id=?').run(JSON.stringify({...brand,metaPageId:pages[0].pageId}),workspace);
}
