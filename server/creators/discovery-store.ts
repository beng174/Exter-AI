import {creatorRunViews,legacyCreatorHolds} from "./run-store.js";
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { z } from "zod";
import { CREATOR_STYLES, CREATOR_RULE_VERSION, creatorHandle, emptyDiscovery, evaluateCreator, matchesCreator, type CreatorBrief, type CreatorFilters, type DiscoveryCreator, type DiscoveryProfile, type DiscoverySnapshot, type RejectedCreator, type CreatorEvaluation } from "../../shared/creator-discovery.js";
const handles = z.array(z.string().max(31).transform(v => creatorHandle(v)).refine((v): v is string => v !== null)).max(30);
const terms = z.array(z.string().trim().min(1).max(100)).max(30);
export const briefSchema = z.object({ category: z.string().trim().min(2).max(160), keywords: terms, hashtags: z.array(z.string().trim().regex(/^#?[\p{L}\p{N}_]{1,80}$/u).transform(v => v.replace(/^#/, ""))).max(20), competitors: handles, country: z.enum(["GB", "ALL"]), minFollowers: z.number().int().min(0).max(100000000), maxFollowers: z.number().int().positive().max(100000000), seeds: handles, exclusions: terms, styles: z.array(z.enum(CREATOR_STYLES)).max(5), target: z.number().int().min(1).max(1000) }).strict().refine(b => b.minFollowers <= b.maxFollowers, "Follower range is reversed.");
export const filtersSchema = z.object({ tier: z.enum(["Nano", "Micro", "Mid", "Macro", ""]).optional(), niche: z.string().max(100).optional(), engagement: z.enum(["Under 1%", "1 to 3%", "3% or more", ""]).optional(), uk: z.enum(["High", "Medium", "Low", "Unknown", ""]).optional(), style: z.string().max(50).optional(), worked: z.boolean().optional(), ads: z.boolean().optional(), minFit: z.number().min(0).max(100).optional(), saved: z.boolean().optional(), review: z.boolean().optional() }).strict();
export function briefDigest(brief: CreatorBrief) { return createHash("sha256").update(JSON.stringify([CREATOR_RULE_VERSION, brief.category, brief.keywords, brief.hashtags, brief.competitors, brief.country, brief.minFollowers, brief.maxFollowers, brief.seeds, brief.exclusions, brief.styles, brief.target])).digest("hex"); }
export function suppressionHash(workspace: string, handle: string) { return createHash("sha256").update(JSON.stringify([workspace, handle])).digest("hex"); }
export interface DiscoveryStep { kind: "hashtag" | "keyword" | "competitor" | "seed" | "enrich" | "verify"; value: string; handles?: string[] }
export function discoverySteps(brief: CreatorBrief): DiscoveryStep[] {
  const steps: DiscoveryStep[] = [];
  for (const value of [...new Set(brief.hashtags)]) steps.push({ kind: "hashtag", value });
  for (const value of [...new Set(brief.keywords.length ? brief.keywords : [brief.category])]) steps.push({ kind: "keyword", value });
  for (const value of [...new Set(brief.competitors)]) steps.push({ kind: "competitor", value });
  for (let i = 0; i < brief.seeds.length; i += 20) steps.push({ kind: "seed", value: "", handles: brief.seeds.slice(i, i + 20) });
  return steps;
}
export function discoveryBatchCount(brief: CreatorBrief) { return discoverySteps(brief).length + Math.ceil((brief.target + brief.seeds.length) / 20); }
export function actorDiscoveryInput(step: DiscoveryStep, country: string, target: number): Record<string, unknown> {
  const limit = Math.min(100, target);
  if (step.kind === "hashtag") return { directUrls: [`https://www.instagram.com/explore/tags/${step.value}/`], resultsType: "posts", resultsLimit: limit, addParentData: true };
  if (step.kind === "competitor") return { directUrls: [`https://www.instagram.com/${step.value}/`], resultsType: "mentions", resultsLimit: limit, addParentData: true };
  if (step.kind === "seed" || step.kind === "enrich") return { directUrls: step.handles!.map(h => `https://www.instagram.com/${h}/`), resultsType: "details", resultsLimit: 1 };
  return { search: `${step.value}${country === "GB" ? " UK" : ""}`, searchType: "user", searchLimit: limit, resultsType: "details", resultsLimit: 1 };
}
export async function readDiscoveryCreators(pool: pg.Pool, workspace: string): Promise<DiscoveryCreator[]> {
  const rows = (await pool.query(`SELECT (profile-'posts'-'related'-'audit') || jsonb_build_object('related','[]'::jsonb,'audit',NULL,'posts',
    (SELECT COALESCE(jsonb_agg(p || jsonb_build_object('caption',left(p->>'caption',240))),'[]'::jsonb)
      FROM jsonb_array_elements(profile->'posts') WITH ORDINALITY AS t(p,n) WHERE n<=3)) AS profile,
    evaluation,saved,brief_version,next_refresh_at FROM creator_discovery_results WHERE workspace_id=$1 AND (NOT EXISTS(SELECT 1 FROM creator_discovery_settings WHERE workspace_id=$1) OR brief_version=(SELECT brief_version FROM creator_discovery_settings WHERE workspace_id=$1)) ORDER BY handle LIMIT 5001`, [workspace])).rows;
  if (rows.length > 5000) throw new Error("Creator list exceeds the read limit.");
  return rows.map(r => ({ profile: r.profile, evaluation: r.evaluation, saved: r.saved, briefVersion: r.brief_version, nextRefreshAt: new Date(r.next_refresh_at).toISOString() }));
}
export async function recordCreatorRejection(client: Pick<pg.PoolClient,"query">, workspace:string, profile:DiscoveryProfile, evaluation:CreatorEvaluation, version:string, at:Date) {
  if(evaluation.screen.disposition==="Rejected") await client.query(`INSERT INTO creator_discovery_rejected(workspace_id,handle,name,evaluation,brief_version,checked_at,official_followers,official_checked_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(workspace_id,handle) DO UPDATE SET name=excluded.name,evaluation=excluded.evaluation,brief_version=excluded.brief_version,checked_at=excluded.checked_at,official_followers=COALESCE(excluded.official_followers,creator_discovery_rejected.official_followers),official_checked_at=COALESCE(excluded.official_checked_at,creator_discovery_rejected.official_checked_at)`,[workspace,profile.handle,profile.name,JSON.stringify(evaluation),version,at,profile.verification==="Verified"?profile.followers:null,profile.verification==="Verified"?profile.checkedAt:null]);
  else await client.query("DELETE FROM creator_discovery_rejected WHERE workspace_id=$1 AND handle=$2",[workspace,profile.handle]);
}
export async function readCreatorRejections(pool:pg.Pool,workspace:string):Promise<RejectedCreator[]> {
  const rows=(await pool.query(`SELECT r.* FROM creator_discovery_rejected r JOIN creator_discovery_settings s USING(workspace_id) WHERE r.workspace_id=$1 AND r.brief_version=s.brief_version ORDER BY handle LIMIT 5001`,[workspace])).rows;
  if(rows.length>5000)throw new Error("Rejected list exceeds the read limit.");
  return rows.map(r=>({handle:r.handle,name:r.name,profileUrl:`https://www.instagram.com/${r.handle}/`,evaluation:r.evaluation,briefVersion:r.brief_version,checkedAt:new Date(r.checked_at).toISOString()}));
}
/** Recheck stored profiles only. No provider requests, extractions or paid work. */
export async function rescreenCreatorRules(pool:pg.Pool,workspace:string,now=new Date()) {
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`creator:${workspace}`]);
    const setting=(await client.query("SELECT brief,brief_version FROM creator_discovery_settings WHERE workspace_id=$1",[workspace])).rows[0];
    if(!setting){await client.query("COMMIT");return;}
    const version=briefDigest(setting.brief), changed=version!==setting.brief_version;
    if(changed){
      await client.query("UPDATE creator_discovery_settings SET brief_version=$2 WHERE workspace_id=$1",[workspace,version]);
      await client.query("UPDATE creator_discovery_runs SET status='cancelled',lease_owner=NULL,lease_until=NULL WHERE workspace_id=$1 AND status IN ('queued','running')",[workspace]);
    }
    const seeds=(await client.query("SELECT profile FROM creator_discovery_results WHERE workspace_id=$1 AND handle=ANY($2::text[])",[workspace,setting.brief.seeds])).rows.map(r=>r.profile as DiscoveryProfile);
    let cursor="", touched=changed;
    while(true){
      const batch=(await client.query(`SELECT handle,profile FROM creator_discovery_results WHERE workspace_id=$1 AND handle>$2 AND (evaluation->'screen'->>'disposition' IS DISTINCT FROM 'Rejected' OR evaluation->>'ruleVersion' IS DISTINCT FROM $4) AND ($3 OR evaluation->>'ruleVersion' IS DISTINCT FROM $4 OR brief_version<>$5 OR (evaluation->'screen'->>'disposition'='Results' AND (evaluation->'screen'->>'activeUntil')::timestamptz<$6) OR (evaluation->'screen'->>'disposition'<>'Rejected' AND (evaluation->'screen'->>'screenedAt')::timestamptz<$6::timestamptz-interval '1 day')) ORDER BY handle LIMIT 100`,[workspace,cursor,changed,CREATOR_RULE_VERSION,version,now])).rows;
      if(!batch.length)break;
      for(const row of batch){const evaluation=evaluateCreator(row.profile,setting.brief,seeds,now);
        await client.query("UPDATE creator_discovery_results SET evaluation=$3,brief_version=$4 WHERE workspace_id=$1 AND handle=$2",[workspace,row.handle,JSON.stringify(evaluation),version]);
        await recordCreatorRejection(client,workspace,row.profile,evaluation,version,now);
      }
      touched=true;cursor=batch.at(-1)!.handle;
    }
    if(touched)await client.query("DELETE FROM creator_discovery_validation WHERE workspace_id=$1",[workspace]);
    await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
export async function discoverySnapshot(pool: pg.Pool, workspace: string, now=new Date()): Promise<DiscoverySnapshot> {
  await rescreenCreatorRules(pool,workspace,now);
  const value = emptyDiscovery(), settings = (await pool.query("SELECT brief,brief_version FROM creator_discovery_settings WHERE workspace_id=$1", [workspace])).rows[0];
  value.brief = settings?.brief ?? null; value.briefVersion = settings?.brief_version ?? null;
  value.creators = (await readDiscoveryCreators(pool, workspace)).filter(c=>c.evaluation.screen?.disposition!=="Rejected");
  value.rejected=await readCreatorRejections(pool,workspace);
  value.segments = (await pool.query("SELECT id,name,filters,created_at FROM creator_discovery_segments WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100", [workspace])).rows.map(r => ({ ...r, createdAt: new Date(r.created_at).toISOString(), count: value.creators.filter(c => matchesCreator(c, r.filters)).length }));
  value.runs = (await pool.query("SELECT id,kind,status,found,verified,step,jsonb_array_length(steps) AS total_steps,reserved_gbp::float8,error,created_at FROM creator_discovery_runs WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 10", [workspace])).rows.map(r => ({ id: r.id, kind: r.kind, status: r.status, found: r.found, verified: r.verified, step: r.step, totalSteps: r.total_steps, reservedGbp: r.reserved_gbp, error: r.error, createdAt: new Date(r.created_at).toISOString() }));
  const providers=await creatorRunViews(pool,value.runs.map(r=>r.id));
  for(const run of value.runs){const record=(await pool.query("SELECT * FROM creator_discovery_runs WHERE id=$1 AND workspace_id=$2",[run.id,workspace])).rows[0];run.providerRuns=providers.filter(p=>p.searchId===run.id);run.reconcilePending=record.reconcile_requested;run.reconcileNote=record.reconcile_note;run.legacyHolds=["failed","paused","cancelled"].includes(run.status)?await legacyCreatorHolds(pool,record):[];}
  const validation = (await pool.query("SELECT results FROM creator_discovery_validation WHERE workspace_id=$1 AND brief_version=$2", [workspace, value.briefVersion])).rows[0];
  value.precision = validation?.results ?? [];
  value.clientReady = value.precision.length === 3 && value.precision.every(p => p.clientReady && p.ruleVersion === CREATOR_RULE_VERSION);
  return value;
}
export async function upsertDiscoveryProfile(pool: pg.Pool, workspace: string, profile: DiscoveryProfile, brief: CreatorBrief, version: string, enriched: boolean, next: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`creator:${workspace}`]);
    const context=(await client.query("SELECT brief_version FROM creator_discovery_settings WHERE workspace_id=$1",[workspace])).rows[0];
    if(context&&context.brief_version!==version){await client.query("COMMIT");return false;}
    profile={...profile,related:[]};
    const suppression = await client.query("SELECT 1 FROM creator_discovery_suppression WHERE workspace_id=$1 AND handle_hash=$2", [workspace, suppressionHash(workspace, profile.handle)]);
    if (suppression.rowCount) {await client.query("COMMIT");return false;}
    const priorRow=(await client.query("SELECT profile,evaluation FROM creator_discovery_results WHERE workspace_id=$1 AND handle=$2",[workspace,profile.handle])).rows[0];
    const prior=priorRow?.profile as DiscoveryProfile|undefined, rejectedBefore=priorRow?.evaluation?.screen?.disposition==="Rejected";
    if(rejectedBefore && !enriched){await client.query("COMMIT");return false;}
    if(prior)profile={...profile,discoveredAt:prior.discoveredAt,appearsInAds:[...new Set([...prior.appearsInAds,...profile.appearsInAds])]};
    if (prior && !enriched) profile={...prior,appearsInAds:[...new Set([...prior.appearsInAds,...profile.appearsInAds])]};
    else if(!rejectedBefore && prior?.verification==="Verified" && profile.verification!=="Verified" && profile.verificationReason==="Official numbers have not been checked.") profile={...profile,followers:prior.followers,mediaCount:prior.mediaCount,posts:prior.posts,verification:prior.verification,verificationReason:prior.verificationReason,checkedAt:prior.checkedAt,appearsInAds:[...new Set([...prior.appearsInAds,...profile.appearsInAds])]};
    if(profile.verification==="Verified" && profile.checkedAt && profile.followers!==null){
      const rejected=(await client.query("SELECT official_followers,official_checked_at FROM creator_discovery_rejected WHERE workspace_id=$1 AND handle=$2",[workspace,profile.handle])).rows[0];
      const rejectedAt=rejected?.official_checked_at?new Date(rejected.official_checked_at).toISOString():null;
      const useRejected=rejectedAt && (!prior?.checkedAt || Date.parse(rejectedAt)>=Date.parse(prior.checkedAt));
      const baselineAt=useRejected?rejectedAt:prior?.checkedAt, baselineCount=useRejected && rejected.official_followers!==null?Number(rejected.official_followers):prior?.followers;
      if(baselineAt && profile.checkedAt!==baselineAt && baselineCount!=null) profile={...profile,growth:{from:baselineAt,to:profile.checkedAt,previousFollowers:baselineCount,followers:profile.followers}};
    }
    const seeds = (await client.query("SELECT profile FROM creator_discovery_results WHERE workspace_id=$1 AND handle=ANY($2::text[])", [workspace, brief.seeds])).rows.map(r => r.profile as DiscoveryProfile);
    const evaluation = evaluateCreator(profile, brief, seeds);
    await recordCreatorRejection(client,workspace,profile,evaluation,version,new Date());
    if (evaluation.screen.disposition === "Rejected") {
      if(prior) await client.query("UPDATE creator_discovery_results SET evaluation=$3,brief_version=$4,verification_due=false WHERE workspace_id=$1 AND handle=$2",[workspace,profile.handle,JSON.stringify(evaluation),version]);
      await client.query("DELETE FROM creator_discovery_validation WHERE workspace_id=$1",[workspace]);
      await client.query("COMMIT");return false;
    }
    await client.query(`INSERT INTO creator_discovery_results(workspace_id,handle,profile,evaluation,brief_version,needs_enrichment,next_refresh_at)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(workspace_id,handle) DO UPDATE SET
      profile=excluded.profile,evaluation=excluded.evaluation,brief_version=excluded.brief_version,
      needs_enrichment=CASE WHEN $8 THEN false ELSE creator_discovery_results.needs_enrichment END,
      verification_due=true,next_refresh_at=CASE WHEN $8 THEN excluded.next_refresh_at ELSE creator_discovery_results.next_refresh_at END`,
    [workspace, profile.handle, JSON.stringify(profile), JSON.stringify(evaluation), version, !enriched, next, enriched]);
    await client.query("DELETE FROM creator_discovery_validation WHERE workspace_id=$1",[workspace]);
    await client.query("COMMIT");return true;
  } catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}

export async function deleteDiscoveryCreator(pool: pg.Pool, workspace: string, handle: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`creator:${workspace}`]);
    await client.query("INSERT INTO creator_discovery_suppression(workspace_id,handle_hash) VALUES($1,$2) ON CONFLICT DO NOTHING", [workspace, suppressionHash(workspace, handle)]);
    // Cancel active jobs before removing the profile; a leased worker checks suppression again.
    await client.query("UPDATE creator_discovery_runs SET status=CASE WHEN status IN ('queued','running') THEN 'cancelled' ELSE status END,steps='[]',handles='[]',brief=jsonb_set(brief,'{seeds}','[]'),lease_until=NULL,lease_owner=NULL WHERE workspace_id=$1", [workspace]);
    await client.query("DELETE FROM creator_discovery_results WHERE workspace_id=$1 AND handle=$2", [workspace, handle]);
    await client.query("DELETE FROM creator_discovery_rejected WHERE workspace_id=$1 AND handle=$2",[workspace,handle]);
    await client.query("DELETE FROM creator_discovery_ad_handles WHERE workspace_id=$1 AND handle=$2",[workspace,handle]);
    await client.query("DELETE FROM creator_discovery_validation WHERE workspace_id=$1", [workspace]);
    await client.query("DELETE FROM creator_discovery_quotes WHERE workspace_id=$1", [workspace]);
    await client.query("UPDATE creator_discovery_settings SET brief=jsonb_set(brief,'{seeds}',COALESCE((SELECT jsonb_agg(v.handle) FROM jsonb_array_elements_text(brief->'seeds') AS v(handle) WHERE v.handle<>$2),'[]')) WHERE workspace_id=$1", [workspace, handle]);
    const setting=(await client.query("SELECT brief,brief_version FROM creator_discovery_settings WHERE workspace_id=$1",[workspace])).rows[0];
    if(setting){const updatedVersion=briefDigest(setting.brief);if(updatedVersion!==setting.brief_version){
      await client.query("UPDATE creator_discovery_settings SET brief_version=$2 WHERE workspace_id=$1",[workspace,updatedVersion]);
      const seeds=(await client.query("SELECT profile FROM creator_discovery_results WHERE workspace_id=$1 AND handle=ANY($2::text[])",[workspace,setting.brief.seeds])).rows.map(r=>r.profile as DiscoveryProfile);
      let cursor="";
      while(true){const batch=(await client.query("SELECT handle,profile FROM creator_discovery_results WHERE workspace_id=$1 AND handle>$2 AND evaluation->'screen'->>'disposition' IS DISTINCT FROM 'Rejected' ORDER BY handle LIMIT 100",[workspace,cursor])).rows;if(!batch.length)break;
        for(const row of batch){const evaluation=evaluateCreator(row.profile,setting.brief,seeds);await client.query("UPDATE creator_discovery_results SET evaluation=$3,brief_version=$4 WHERE workspace_id=$1 AND handle=$2",[workspace,row.handle,JSON.stringify(evaluation),updatedVersion]);await recordCreatorRejection(client,workspace,row.profile,evaluation,updatedVersion,new Date());}
        cursor=batch.at(-1)!.handle;
      }
    }}
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
export async function saveCreatorSegment(pool: pg.Pool, workspace: string, name: string, filters: CreatorFilters) {
  if ((await pool.query("SELECT id FROM creator_discovery_segments WHERE workspace_id=$1 LIMIT 100", [workspace])).rowCount! >= 100) throw new Error("Segment limit reached.");
  const id = randomUUID(); await pool.query("INSERT INTO creator_discovery_segments(id,workspace_id,name,filters) VALUES($1,$2,$3,$4)", [id, workspace, name, JSON.stringify({...filters,review:false})]); return id;
}
