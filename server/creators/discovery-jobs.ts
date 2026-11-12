import type {WorkerObserver} from "../infrastructure/worker-diagnostics.js";
import {workerClaimGate} from "../infrastructure/worker-recovery.js";
import { storedCreatorRun } from "./run-store.js";
import { reconcileCreatorSearch } from "./run-reconciliation.js";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { creatorHandle, evaluateCreator, nextCreatorRefresh, type CreatorBrief, type DiscoveryProfile } from "../../shared/creator-discovery.js";
import { ApifyCreatorProvider } from "./apify.js";
import { CreatorProviderError } from "./types.js";
import { CreatorVerificationError, InstagramCreatorVerifier, discoveryProfile, discoveryProfiles, publicCreatorUrl } from "./discovery-provider.js";
import { recordCreatorRejection, actorDiscoveryInput, discoverySteps, upsertDiscoveryProfile, type DiscoveryStep } from "./discovery-store.js";
import { claimMetaRequest, delayMetaRequests } from "../infrastructure/meta-rate.js";
export interface CreatorJobOptions extends WorkerObserver {
  env?: Record<string, string | undefined>; now?: () => Date;
  discovery?: Pick<ApifyCreatorProvider, "researchConfiguration" | "collectPublic"> & Partial<Pick<ApifyCreatorProvider,"acknowledge"|"inspectRun"|"inspectInput"|"inspectActor">>;
  verifier?: Pick<InstagramCreatorVerifier, "configured" | "verify">;
  thumbnail?: (workspace: string, profile: DiscoveryProfile) => Promise<DiscoveryProfile>;
  paceMs?: number; heartbeatMs?:number;
}
const providerFor = (o: CreatorJobOptions,pool:pg.Pool) => o.discovery ?? new ApifyCreatorProvider({ env: o.env,pool });
const verifierFor = (o: CreatorJobOptions) => o.verifier ?? new InstagramCreatorVerifier({ env: o.env, now: o.now });
export async function scheduleCreatorRefresh(pool: pg.Pool, now = new Date(), env: Record<string, string | undefined> = process.env) {
  // Expired unsaved discoveries are no longer needed for the research purpose.
  await pool.query("DELETE FROM creator_discovery_rejected WHERE checked_at<$1::timestamptz-interval '90 days'",[now]);
  await pool.query("DELETE FROM creator_discovery_results WHERE NOT saved AND used_at<$1::timestamptz-interval '90 days'", [now]);
  if (!new InstagramCreatorVerifier({ env }).configured()) return;
  const workspaces = (await pool.query(`SELECT DISTINCT r.workspace_id FROM creator_discovery_results r JOIN creator_discovery_settings s USING(workspace_id)
    WHERE r.saved AND r.next_refresh_at<=$1 AND NOT EXISTS(SELECT 1 FROM creator_discovery_runs j WHERE j.workspace_id=r.workspace_id AND j.status IN ('queued','running')) AND COALESCE((SELECT status FROM creator_discovery_runs j WHERE j.workspace_id=r.workspace_id AND j.kind='refresh' ORDER BY created_at DESC LIMIT 1),'complete') NOT IN ('paused','failed') LIMIT 100`, [now])).rows;
  for (const { workspace_id } of workspaces) await enqueueCreatorRefresh(pool, workspace_id, now);
}
export async function enqueueCreatorRefresh(pool: pg.Pool, workspace: string, now: Date) {
  const setting = (await pool.query("SELECT brief,brief_version FROM creator_discovery_settings WHERE workspace_id=$1", [workspace])).rows[0];
  if (!setting) return null;
  const rows = (await pool.query("SELECT handle FROM creator_discovery_results WHERE workspace_id=$1 AND saved AND next_refresh_at<=$2 ORDER BY handle LIMIT 1000", [workspace, now])).rows;
  if (!rows.length) return null;
  const id = randomUUID(), steps = rows.map(r => ({ kind: "verify", value: r.handle }));
  const added = await pool.query(`INSERT INTO creator_discovery_runs(id,workspace_id,kind,brief,brief_version,steps,phase,handles) VALUES($1,$2,'refresh',$3,$4,$5,'verify',$6) ON CONFLICT DO NOTHING RETURNING id`, [id, workspace, setting.brief, setting.brief_version, JSON.stringify(steps),JSON.stringify(rows.map(r=>r.handle))]);
  return added.rows[0]?.id ?? null;
}
async function adCreatorHandles(pool: pg.Pool, workspace: string) {
  // Direct profile links only. Partner names and people in thumbnails are not identities.
  const rows = (await pool.query(`SELECT DISTINCT ON (native_id) native_id,
    COALESCE(raw_payload->'branded_content_partner'->>'profile_url',raw_payload->'brandedContentPartner'->>'profileUrl',raw_payload->>'creator_profile_url') AS profile_url FROM ad_observations
    WHERE workspace_id=$1 AND raw_payload IS NOT NULL AND (raw_payload ? 'branded_content_partner' OR raw_payload ? 'brandedContentPartner' OR raw_payload ? 'creator_profile_url') ORDER BY native_id,observed_at DESC LIMIT 1000`, [workspace])).rows;
  const matches = new Map<string, string[]>();
  for (const row of rows) {
    const url = publicCreatorUrl(row.profile_url);
    const handle = url ? creatorHandle(new URL(url).pathname.replaceAll("/", "")) : null;
    if (handle) matches.set(handle, [...(matches.get(handle) ?? []), row.native_id].slice(0, 20));
  }
  for(const row of (await pool.query("SELECT handle,ad_ids FROM creator_discovery_ad_handles WHERE workspace_id=$1 LIMIT 1000",[workspace])).rows)matches.set(row.handle,[...(matches.get(row.handle)??[]),...row.ad_ids].slice(0,20));
  return matches;
}
export async function workCreatorDiscoveryOnce(pool: pg.Pool, options: CreatorJobOptions = {}): Promise<boolean> {
  const discovery = providerFor(options,pool), verifier = verifierFor(options), now = options.now?.() ?? new Date();
  const owner = randomUUID(), job = (await pool.query(`UPDATE creator_discovery_runs SET status=CASE WHEN reconcile_requested THEN status ELSE 'running' END,lease_owner=$1,lease_until=now()+interval '5 minutes'
    WHERE id=(SELECT id FROM creator_discovery_runs WHERE (reconcile_requested OR stop_requested OR ${workerClaimGate('creators','creator_discovery_runs.id')}) AND (status IN ('queued','running') OR reconcile_requested) AND available_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`, [owner])).rows[0];
  if (!job) return false;
  options.onClaim?.({id:job.id,owner,workspaceId:job.workspace_id});
  const controller=new AbortController();let heartbeatBusy=false;
  const heartbeat=setInterval(()=>{if(heartbeatBusy)return;heartbeatBusy=true;void pool.query("UPDATE creator_discovery_runs SET lease_until=now()+interval '5 minutes' WHERE id=$1 AND lease_owner=$2 AND (status='running' OR reconcile_requested) RETURNING id",[job.id,owner]).then(r=>{if(!r.rowCount)controller.abort();}).catch(()=>controller.abort()).finally(()=>heartbeatBusy=false);},options.heartbeatMs??30000);heartbeat.unref();
  try {
  if(job.reconcile_requested){
    try{const note=await reconcileCreatorSearch(pool,job,discovery);await pool.query("UPDATE creator_discovery_runs SET reconcile_requested=false,reconcile_note=$3,reconciled_at=now(),lease_owner=NULL,lease_until=NULL WHERE id=$1 AND lease_owner=$2",[job.id,owner,note]);}
    catch{await pool.query("UPDATE creator_discovery_runs SET reconcile_requested=false,reconcile_note='The provider charges could not be checked. Holds are unchanged.',lease_owner=NULL,lease_until=NULL WHERE id=$1 AND lease_owner=$2",[job.id,owner]);}
    clearInterval(heartbeat);return true;
  }
  let acknowledgement:string|undefined;
  let previewDeadline=Date.now()+60000;
  const handles = new Set<string>(Array.isArray(job.handles)?job.handles:[]);
  let status = "queued", error: string | null = null, delay = 0, nextStep = job.step, steps = job.steps as DiscoveryStep[], phase = job.phase, reserved = Number(job.reserved_gbp);
  const brief = job.brief as CreatorBrief, workspace = job.workspace_id as string;
  const shouldStop=async()=>Boolean((await pool.query("SELECT stop_requested FROM creator_discovery_runs WHERE id=$1 AND lease_owner=$2",[job.id,owner])).rows[0]?.stop_requested);
  try {
    const currentRun=await storedCreatorRun(pool,{searchId:job.id,phase:job.phase,step:job.step});
    const stopping=await shouldStop();
    if(stopping){const latest=(await pool.query("SELECT brief,brief_version FROM creator_discovery_settings WHERE workspace_id=$1",[workspace])).rows[0];if(latest){Object.assign(brief,latest.brief);job.brief_version=latest.brief_version;}}
    if (job.dispatch_started && !currentRun?.runId && !stopping) throw new CreatorProviderError("unavailable", "The previous paid lookup stopped unexpectedly. Check its charge before starting another search.");
    if(stopping && !currentRun?.runId){status="cancelled";error="Search stopped. Earlier results are kept.";}
    else if (nextStep >= steps.length) {
      if (phase === "discover") {
        const enrichHandles = (await pool.query("SELECT handle FROM creator_discovery_results WHERE workspace_id=$1 AND needs_enrichment AND handle=ANY($2::text[]) ORDER BY handle", [workspace, [...handles]])).rows.map(r => r.handle as string);
        steps = []; for (let i = 0; i < enrichHandles.length; i += 20) steps.push({ kind: "enrich", value: "", handles: enrichHandles.slice(i, i + 20) });
        phase = "enrich"; nextStep = 0;
      } else if (phase === "enrich") {
        const verifyHandles = verifier.configured() ? (await pool.query("SELECT handle FROM creator_discovery_results WHERE workspace_id=$1 AND verification_due AND handle=ANY($2::text[]) ORDER BY handle", [workspace, [...handles]])).rows : [];
        steps = verifyHandles.map(r => ({ kind: "verify", value: r.handle })); phase = "verify"; nextStep = 0;
      } else status = "complete";
      if (!steps.length && phase === "verify") status = "complete";
    } else {
      const step = steps[nextStep];
      if (step.kind === "verify") {
        if (!verifier.configured()) throw new CreatorVerificationError("configuration");
        delay = await claimMetaRequest(pool, options.paceMs ?? 20000);
        if (!delay) {
          const prior = (await pool.query("SELECT profile FROM creator_discovery_results WHERE workspace_id=$1 AND handle=$2", [workspace, step.value])).rows[0]?.profile as DiscoveryProfile | undefined;
          if (prior) {
            let profile = prior, successful = false;
            try { profile = await verifier.verify(prior); successful = true; }
            catch (e) {
              if (!(e instanceof CreatorVerificationError)) throw e;
              if (["configuration", "permissions", "rate_limited"].includes(e.reason)) {
                await upsertDiscoveryProfile(pool,workspace,{...prior,verificationReason:e.message},brief,job.brief_version,true,now.toISOString());
                throw e;
              }
              profile = { ...prior, verificationReason: e.message };
            }
            if (successful && options.thumbnail) profile = await options.thumbnail(workspace, profile);
            const due = nextCreatorRefresh(successful && profile.checkedAt ? profile.checkedAt : now.toISOString());
            await upsertDiscoveryProfile(pool, workspace, profile, brief, job.brief_version, true, due);
            await pool.query("UPDATE creator_discovery_results SET verification_due=false WHERE workspace_id=$1 AND handle=$2", [workspace, step.value]);
            if (successful) await pool.query("UPDATE creator_discovery_runs SET verified=verified+1 WHERE id=$1 AND lease_owner=$2", [job.id, owner]);
          }
          nextStep++;
        }
      } else if(step.kind==="ads" || step.kind==="competitor") {
        const ads=step.kind==="ads"?await adCreatorHandles(pool,workspace):new Map<string,string[]>();
        const profiles=step.kind==="ads" ? discoveryProfiles([...ads.keys()].map(username=>({username})),now.toISOString()).map(p=>({...p,appearsInAds:ads.get(p.handle)!,sources:[{kind:"collected-ad" as const,query:""}]})) : (await pool.query("SELECT profile FROM creator_discovery_results WHERE workspace_id=$1 AND profile->'sources' @> $2::jsonb ORDER BY handle LIMIT 199",[workspace,JSON.stringify([{kind:"competitor-mention",query:step.value}])])).rows.map(r=>r.profile as DiscoveryProfile);
        for(const profile of profiles){if(!handles.has(profile.handle) && handles.size>=brief.target+brief.seeds.length)break;if(await upsertDiscoveryProfile(pool,workspace,profile,brief,job.brief_version,false,now.toISOString()))handles.add(profile.handle);}
        nextStep++;
      } else {
        const config = discovery.researchConfiguration();
        if (!currentRun && (!config.configured || config.reserveGbp !== Number(job.per_batch_gbp) || config.conversion !== Number(job.conversion))) throw new CreatorProviderError("configuration", "Creator provider settings changed. Request a fresh cost estimate.");
        if (!currentRun && reserved + config.reserveGbp! > Number(job.max_cost_gbp) + .000001) throw new CreatorProviderError("budget_paused", "Creator research stopped at the agreed cost limit.");
        // Persist dispatch intent before charging; an expired lease cannot start this paid step again.
        const intent=await pool.query("UPDATE creator_discovery_runs SET dispatch_started=true,reserved_gbp=$3 WHERE id=$1 AND lease_owner=$2 AND status='running' RETURNING id", [job.id, owner, reserved+(currentRun?0:config.reserveGbp!)]);
        if(!intent.rowCount)throw new CreatorProviderError("cancelled","This search no longer holds its worker lease.");
        let result;let pending:CreatorProviderError|undefined;
        const sourceTarget = Math.min(199, Math.max(1, Math.ceil(brief.target / Math.max(1,discoverySteps(brief).filter(s=>!["ads","competitor"].includes(s.kind)).length))));
        const hashtag = step.kind === "hashtag";
        try { result = await discovery.collectPublic(stopping && currentRun ? {} : actorDiscoveryInput(step, brief.country, sourceTarget), stopping && currentRun ? 199 : hashtag ? 1 : step.kind === "seed" || step.kind === "enrich" ? 20 : sourceTarget,controller.signal,{scope:{workspaceId:workspace,searchId:job.id,phase,step:nextStep},shouldStop,...(hashtag?{source:"hashtag" as const}:{})}); }
        catch (e) {if(e instanceof CreatorProviderError && e.partialRows?.length){pending=e;result={rows:e.partialRows,accounting:e.accounting!};}else{if(e instanceof CreatorProviderError && !currentRun)reserved+=e.accounting?.reservedCostGbp??0;throw e;}}
        if(!currentRun)reserved += result.accounting.reservedCostGbp ?? config.reserveGbp!;
        if(await shouldStop()){const latest=(await pool.query("SELECT brief,brief_version FROM creator_discovery_settings WHERE workspace_id=$1",[workspace])).rows[0];if(latest){Object.assign(brief,latest.brief);job.brief_version=latest.brief_version;}}
        previewDeadline=Date.now()+60000;
        let remaining = Math.max(0, brief.target + brief.seeds.length - handles.size);
        const observedAt=currentRun?.startedAt ?? now.toISOString();
        const postSource=hashtag || step.kind==="partnership";
        const sourceRows=discoveryProfiles(result.rows,observedAt,(options.env ?? process.env).APIFY_TOKEN,postSource ? post=>Boolean(post.ownerUsername || post.owner?.username) : undefined);
        const disclosed=(p:DiscoveryProfile)=>p.posts.some(post=>post.paidPartnership || /(?:^|\s)#(?:ad|gifted|sponsored)\b|paid partnership/i.test(post.caption));
        if(step.kind==="partnership")sourceRows.sort((a,b)=>Number(disclosed(b))-Number(disclosed(a)));
        for (const profile of sourceRows) {
          if(["partnership","seed","hashtag"].includes(step.kind))profile.sources=[{kind:step.kind==="partnership" ? disclosed(profile)?"disclosed-competitor":"competitor-mention" : step.kind==="seed"?"seed":"hashtag",query:step.kind==="seed"?(step.handles??[]).join(","):step.value}];
          const existing = handles.has(profile.handle);
          if (!existing && remaining <= 0) continue;
          const enriched = ["enrich", "seed"].includes(step.kind);
          const safe = { ...profile, posts: profile.posts.map(p => ({ ...p, thumbnail: null })) };
          if (await upsertDiscoveryProfile(pool, workspace, safe, brief, job.brief_version, enriched, now.toISOString())) {
            // Reuse ordinary mentions later, after direct ad identities and seed lookalikes.
            if(step.kind==="partnership" && !disclosed(profile))continue;
            if (!existing) {remaining--;handles.add(profile.handle);}
            if (options.thumbnail && enriched && Date.now()<=previewDeadline-45000) { const retained = await options.thumbnail(workspace, profile); await upsertDiscoveryProfile(pool,workspace,retained,brief,job.brief_version,true,now.toISOString()); }
          }
          if (step.kind === "seed") for (const handle of profile.related) {
            if (remaining <= 0) break;
            const related = {...discoveryProfile({ username: handle }, now.toISOString())!,sources:[{kind:"seed" as const,query:profile.handle}]};
            if (await upsertDiscoveryProfile(pool, workspace, related, brief, job.brief_version, false, now.toISOString())&&!handles.has(handle)){remaining--;handles.add(handle);}
          }
        }
        if(pending)throw pending;
        if(await shouldStop()){
          if(result.accounting.billedCostGbp===null || !["SUCCEEDED","FAILED","ABORTED","TIMED-OUT"].includes(result.accounting.runStatus??""))throw new CreatorProviderError("pending","Search stopped. Waiting for its final charge.");
          status="cancelled";error="Search stopped. Partial results and the actual charge are saved.";
        }
        acknowledgement=result.accounting.reservationId;
        nextStep++;
      }
    }
  } catch (e) {
    if(!(e instanceof CreatorProviderError&&e.code==="pending"))options.onFailure?.(e);
    status = e instanceof CreatorProviderError && e.code === "pending" ? "queued" : e instanceof CreatorProviderError && e.code === "budget_paused" || e instanceof CreatorVerificationError && ["configuration", "permissions", "rate_limited"].includes(e.reason) ? "paused" : "failed";
    error = e instanceof CreatorProviderError || e instanceof CreatorVerificationError ? e.message : "Creator research could not finish. Earlier profiles are unchanged.";
    if(e instanceof CreatorProviderError && e.code==="pending")delay=60000;
    if (e instanceof CreatorVerificationError && e.reason === "rate_limited") await delayMetaRequests(pool, 3600000);
  }
  clearInterval(heartbeat);
  if(status!=="queued" && await shouldStop())status="cancelled";
  // Fence completion; a cancellation/deletion cannot be undone by the worker.
  const committed=await pool.query(`UPDATE creator_discovery_runs SET status=$3,error=$4,step=$5,steps=$6,phase=$7,reserved_gbp=$8,dispatch_started=false,
    found=$9,handles=$11,available_at=now()+($10*interval '1 millisecond'),lease_owner=NULL,lease_until=NULL
    WHERE id=$1 AND lease_owner=$2 AND status='running' RETURNING id`, [job.id, owner, status, error, nextStep, JSON.stringify(steps), phase, reserved, handles.size, delay, JSON.stringify([...handles])]);
  if(committed.rowCount && acknowledgement)await discovery.acknowledge?.(acknowledgement);
  if (status === "complete" && committed.rowCount) {
    const rows = (await pool.query("SELECT handle,profile FROM creator_discovery_results WHERE workspace_id=$1 AND handle=ANY($2::text[]) AND evaluation->'screen'->>'disposition' IS DISTINCT FROM 'Rejected' ORDER BY handle", [workspace,[...handles]])).rows;
    const seeds = (await pool.query("SELECT profile FROM creator_discovery_results WHERE workspace_id=$1 AND handle=ANY($2::text[])",[workspace,brief.seeds])).rows.map(r=>r.profile as DiscoveryProfile);
    for (const row of rows) {
      const evaluation=evaluateCreator(row.profile,brief,seeds);
      const updated=await pool.query("UPDATE creator_discovery_results SET evaluation=$3,brief_version=$4 WHERE workspace_id=$1 AND handle=$2 AND EXISTS(SELECT 1 FROM creator_discovery_settings WHERE workspace_id=$1 AND brief_version=$4)", [workspace,row.handle,JSON.stringify(evaluation),job.brief_version]);
      if(updated.rowCount)await recordCreatorRejection(pool,workspace,row.profile,evaluation,job.brief_version,new Date());
    }
  }
  return true;
  } finally { clearInterval(heartbeat); }
}
export async function enqueueCreatorDiscovery(pool: pg.Pool, workspace: string, quoteId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const quote = (await client.query("SELECT * FROM creator_discovery_quotes WHERE id=$1 AND workspace_id=$2 AND NOT used AND expires_at>now() FOR UPDATE", [quoteId, workspace])).rows[0];
    if (!quote) throw new Error("Cost estimate expired or already used.");
    const id = randomUUID();
    await client.query("INSERT INTO creator_discovery_settings(workspace_id,brief,brief_version) VALUES($1,$2,$3) ON CONFLICT(workspace_id) DO UPDATE SET brief=excluded.brief,brief_version=excluded.brief_version,updated_at=now()", [workspace, quote.brief, quote.brief_version]);
    await client.query(`INSERT INTO creator_discovery_runs(id,workspace_id,kind,brief,brief_version,steps,max_cost_gbp,per_batch_gbp,conversion) VALUES($1,$2,'discovery',$3,$4,$5,$6,$7,$8)`, [id, workspace, quote.brief, quote.brief_version, JSON.stringify(discoverySteps(quote.brief)), quote.max_cost_gbp, quote.per_batch_gbp, quote.conversion]);
    await client.query("UPDATE creator_discovery_results SET needs_enrichment=true,verification_due=true WHERE workspace_id=$1", [workspace]);
    await client.query("UPDATE creator_discovery_quotes SET used=true WHERE id=$1", [quoteId]);
    await client.query("DELETE FROM creator_discovery_validation WHERE workspace_id=$1", [workspace]);
    await client.query("COMMIT"); return id;
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}
