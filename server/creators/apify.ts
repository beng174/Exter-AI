import type pg from "pg";
import { finalActorStatus, storedCreatorRun, trackCreatorReservation, trackCreatorProgress, settleCreatorRun, type CreatorActorRun, type CreatorRunScope } from "./run-store.js";
import { reserveCost as reserveProviderCost } from "../infrastructure/budget.js";
import { infrastructureDatabase } from "../infrastructure/database.js";
import { assertProxySupport } from "../connectors/http.js";
import type { CreatorPost, CreatorPublicProfile } from "../../shared/creator-research.js";
import { CreatorProviderError, type CreatorDiscoveryProvider, type CreatorPlatform, type CreatorProviderAccounting, type CreatorProviderStatus, type CreatorSearchInput, type CreatorSearchResult } from "./types.js";

const API = "https://api.apify.com";
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_DATASET_PAGES = 2;
const PAGE_SIZE = 100;
const record = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const count = (value: unknown): number | null => {
  const parsed = typeof value === "string" && /^\d{1,16}(?:,\d{3})*$/.test(value) ? Number(value.replaceAll(",", "")) : value;
  return typeof parsed === "number" && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};
const validId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const handleValue = (value: unknown): string | null => typeof value === "string" && /^[A-Za-z0-9._]{1,64}$/.test(value.replace(/^@/, "")) ? value.replace(/^@/, "").toLowerCase() : null;
const profileUrl = (platform: CreatorPlatform, handle: string) => platform === "instagram" ? `https://www.instagram.com/${handle}/` : `https://www.tiktok.com/@${handle}`;

export interface ApifyCreatorOptions {
  token?: string;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  reserve?: (amountGbp: number, context: { platform: CreatorPlatform; actorId: string }) => Promise<{ reservationId: string; reservedGbp: number }>;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  now?: () => Date;
  requestTimeoutMs?: number;
  pollIntervalMs?: number;
  maxPolls?: number;
  pollWindowMs?:number; pool?:pg.Pool; resume?:CreatorActorRun;
  progress?:(run:CreatorActorRun)=>Promise<void>;settle?:(run:CreatorActorRun)=>Promise<void>;
}

function actorId(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace("/", "~");
  return /^[A-Za-z0-9_-]{1,100}(?:~[A-Za-z0-9_-]{1,100})?$/.test(normalized) ? normalized : null;
}
function scrubText(value: unknown, token: string, limit: number): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.split(token).join("[REDACTED]")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:apify_api_[A-Za-z0-9]+|AIza[0-9A-Za-z_-]{35})\b/g, "[REDACTED]")
    .replace(/((?:api[-_]?key|access[-_]?token|authorization|password|secret)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, raw => { try { const url = new URL(raw); url.username = ""; url.password = ""; url.search = ""; url.hash = ""; return url.href; } catch { return "[REDACTED URL]"; } }).slice(0, limit).trim();
}
function publicPostUrl(value: unknown, platform: CreatorPlatform, handle: string): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const host = platform === "instagram" ? "instagram.com" : "tiktok.com";
    if (url.protocol !== "https:" || ![host, `www.${host}`].includes(url.hostname) || url.port || url.username || url.password) return null;
    if (platform === "instagram" ? !/^\/(?:p|reel|tv)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname) : !new RegExp(`^/@${handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/video/\\d+/?$`, "i").test(url.pathname)) return null;
    return `https://www.${host}${url.pathname}`;
  } catch { return null; }
}
function timestamp(value: unknown): string | null {
  const date = typeof value === "number" ? new Date(value < 100000000000 ? value * 1000 : value) : typeof value === "string" ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function firstCount(...values: unknown[]): number | null {
  for (const value of values) { const parsed = count(value); if (parsed !== null) return parsed; }
  return null;
}

/** Normalizes only public, observed fields. Missing counts remain null, never estimates. */
export function normaliseApifyCreators(rows: unknown[], platform: CreatorPlatform, options: { observedAt: string; token?: string; maxProfiles: number; maxPostsPerProfile: number }): CreatorPublicProfile[] {
  const profiles = new Map<string, CreatorPublicProfile>();
  const token = options.token || "\u0000never-a-public-field\u0000";
  for (const raw of rows) {
    const row = record(raw), author = record(row.authorMeta ?? row.author ?? row.owner), authorStats = record(row.authorStats);
    const handle = [row.username, row.ownerUsername, author.username, author.uniqueId, author.unique_id, platform === "tiktok" ? author.name : null].map(handleValue).find(Boolean);
    if (!handle || handle.includes(token.toLowerCase())) continue;
    const url = profileUrl(platform, handle);
    const followers = firstCount(row.followersCount, row.followers, author.fans, author.followersCount, author.followerCount, authorStats.followerCount);
    const existing = profiles.get(handle);
    if (!existing && profiles.size >= options.maxProfiles) continue;
    const profile: CreatorPublicProfile = existing || {
      platform, handle, displayName: scrubText(row.fullName ?? author.nickName ?? author.nickname ?? author.fullName, token, 200) || handle,
      profileUrl: url, sourceUrl: url, evidenceUrl: url, bio: scrubText(row.biography ?? author.signature ?? author.bio, token, 4000),
      followers, following: firstCount(row.followsCount, row.following, author.following, authorStats.followingCount),
      postsCount: firstCount(row.postsCount, author.video, author.videoCount, authorStats.videoCount),
      country: scrubText(row.country ?? author.country, token, 100), category: scrubText(row.businessCategoryName ?? row.category ?? author.category, token, 200),
      observedAt: options.observedAt, recentPosts: [], evidence: [],
    };
    if (profile.followers === null && followers !== null) profile.followers = followers;
    profiles.set(handle, profile);
    const candidates = [...(Array.isArray(row.latestPosts) ? row.latestPosts.slice(0, 100) : []), ...(Array.isArray(row.recentPosts) ? row.recentPosts.slice(0, 100) : []), row];
    for (const candidate of candidates) {
      const post = record(candidate), stats = record(post.stats);
      let postUrl = publicPostUrl(post.webVideoUrl ?? post.url ?? post.postUrl, platform, handle);
      if (!postUrl && platform === "instagram" && typeof post.shortCode === "string" && /^[A-Za-z0-9_-]+$/.test(post.shortCode)) postUrl = `https://www.instagram.com/p/${post.shortCode}/`;
      if (!postUrl || postUrl.toLowerCase().includes(token.toLowerCase())) continue;
      if (profile.recentPosts.some(item => item.url === postUrl)) continue;
      const entry: CreatorPost = {
        id: (typeof post.id === "string" || typeof post.id === "number") && /^[A-Za-z0-9_-]{1,100}$/.test(String(post.id)) && !String(post.id).toLowerCase().includes(token.toLowerCase()) ? String(post.id) : postUrl.split("/").filter(Boolean).at(-1)!,
        url: postUrl, publishedAt: timestamp(post.timestamp ?? post.createTimeISO ?? post.createTime ?? post.takenAtTimestamp),
        caption: scrubText(post.caption ?? post.text ?? post.desc, token, 4000),
        views: firstCount(post.videoViewCount, post.videoPlayCount, post.playCount, stats.playCount, stats.viewCount),
        likes: firstCount(post.likesCount, post.diggCount, post.likeCount, stats.diggCount, stats.likeCount),
        comments: firstCount(post.commentsCount, post.commentCount, stats.commentCount), shares: firstCount(post.shareCount, post.sharesCount, stats.shareCount),
        observedAt: options.observedAt, evidenceUrl: postUrl,
      };
      profile.recentPosts.push(entry);
    }
  }
  for (const profile of profiles.values()) {
    // Public actors can return posts out of order; rank the observed sample by date.
    profile.recentPosts.sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
    profile.recentPosts = profile.recentPosts.slice(0, options.maxPostsPerProfile);
    profile.metricCoverage = { postsSampled: profile.recentPosts.length, postsWithViews: profile.recentPosts.filter(post => post.views !== null).length, postsWithLikes: profile.recentPosts.filter(post => post.likes !== null).length, postsWithComments: profile.recentPosts.filter(post => post.comments !== null).length, postsWithShares: profile.recentPosts.filter(post => post.shares !== null).length, followersAvailable: profile.followers !== null };
    profile.evidence = ["followers", "following", "postsCount", "country", "category"].map(field => ({ field, value: profile[field as "followers" | "following" | "postsCount" | "country" | "category"], evidenceUrl: profile.evidenceUrl, observedAt: options.observedAt }));
    for (const post of profile.recentPosts) for (const field of ["views", "likes", "comments", "shares"] as const)
      profile.evidence.push({ field: `post:${post.id}:${field}`, value: post[field], evidenceUrl: post.evidenceUrl, observedAt: options.observedAt });
  }
  return [...profiles.values()];
}

class CreatorRequestError extends CreatorProviderError {constructor(code:ConstructorParameters<typeof CreatorProviderError>[0],message:string,readonly temporary=false,readonly retryAfterMs=0){super(code,message);}}
export interface CreatorRunHooks {scope?:CreatorRunScope;progress?:(run:CreatorActorRun)=>Promise<void>; source?:"hashtag"; shouldStop?:()=>Promise<boolean>}
/** Paid starts are never retried. Only authenticated reads may retry. */
export class ApifyCreatorProvider implements CreatorDiscoveryProvider {
 private readonly env:Record<string,string|undefined>;private readonly token:string;private readonly timeout:number;
 constructor(private readonly options:ApifyCreatorOptions={}){
  this.env=options.env??process.env;this.token=options.token??this.env.APIFY_TOKEN??"";this.timeout=options.requestTimeoutMs??30000;
  if(!Number.isInteger(this.timeout)||this.timeout<1||this.timeout>60000||options.pollIntervalMs!==undefined&&(!Number.isInteger(options.pollIntervalMs)||options.pollIntervalMs<0||options.pollIntervalMs>15000)||options.maxPolls!==undefined&&(!Number.isInteger(options.maxPolls)||options.maxPolls<1)||options.pollWindowMs!==undefined&&(!(options.pollWindowMs>0)||options.pollWindowMs>1200000))throw new CreatorProviderError("configuration","Creator polling settings are invalid.");
 }
 status():CreatorProviderStatus {
  const platforms=(["instagram","tiktok"] as const).filter(p=>!!actorId(this.env[`APIFY_${p.toUpperCase()}_ACTOR_ID`])),configured=Boolean(this.token.trim()&&!/[\r\n]/.test(this.token)&&this.reserveAmount()!==null&&platforms.length);
  return {configured,platforms:configured?platforms:[],message:configured?"Public creator discovery is configured.":"Configure APIFY_TOKEN, APIFY_INSTAGRAM_ACTOR_ID and APIFY_REQUEST_RESERVE_GBP before searching."};
 }
 private reserveAmount(){const amount=Number(this.env.APIFY_REQUEST_RESERVE_GBP);return Number.isFinite(amount)&&amount>0&&amount<=10000?amount:null;}
 private pool(){return this.options.pool??infrastructureDatabase();}
 private tracking(){return !this.options.reserve || Boolean(this.options.pool);}
 private id(value:unknown):value is string{return validId(value)&&!value.includes(this.token||"\u0000");}
 private async json(path:string,init:RequestInit={},signal?:AbortSignal):Promise<unknown>{
  if(!this.token.trim()||/[\r\n]/.test(this.token))throw new CreatorProviderError("configuration","Configure the provider token before checking runs.");
  const url=new URL(path,API);if(url.origin!==API||url.username||url.password||url.hash)throw new CreatorProviderError("configuration","Unsupported provider destination.");
  let response:Response;
  try{response=await(this.options.fetch??fetch)(url,{...init,headers:{...init.headers,Authorization:`Bearer ${this.token}`},redirect:"manual",signal:signal?AbortSignal.any([signal,AbortSignal.timeout(this.timeout)]):AbortSignal.timeout(this.timeout)});}
  catch{throw new CreatorRequestError(signal?.aborted?"cancelled":"unavailable","The provider check could not finish. Its budget hold is kept.",!signal?.aborted);}
  if(!response.ok){await response.body?.cancel().catch(()=>{});const header=response.headers.get("retry-after")?.slice(0,100),seconds=header?Number(header):NaN,retryAfter=header?Math.min(60000,Math.max(0,Number.isFinite(seconds)?seconds*1000:Date.parse(header)-Date.now())):0;throw new CreatorRequestError([401,403].includes(response.status)?"authentication":response.status===429?"rate_limited":"unavailable",`Provider request failed (HTTP ${response.status}).`,response.status===429||response.status>=500,Number.isFinite(retryAfter)?retryAfter:0);}
  if(response.status===204)return {};
  if(Number(response.headers.get("content-length"))>MAX_BODY_BYTES){await response.body?.cancel().catch(()=>{});throw new CreatorProviderError("invalid_output","The provider response was too large.");}
  const reader=response.body?.getReader();if(!reader)throw new CreatorRequestError("unavailable","The provider response was empty.",true);
  const chunks:Uint8Array[]=[];let bytes=0;
  try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>MAX_BODY_BYTES){await reader.cancel();throw new CreatorProviderError("invalid_output","The provider response was too large.");}chunks.push(part.value);}}
  catch(e){if(e instanceof CreatorProviderError)throw e;throw new CreatorRequestError("unavailable","The provider response stopped before it finished.",true);}finally{reader.releaseLock();}
  try{return JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new CreatorProviderError("invalid_output","The provider returned invalid JSON.");}
 }
 private async pause(ms:number,signal?:AbortSignal){
  if(signal?.aborted)throw new CreatorProviderError("cancelled","Creator discovery stopped waiting. The paid run is kept.");
  if(this.options.sleep)return this.options.sleep(ms,signal);
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{signal?.removeEventListener("abort",abort);resolve();},ms);function abort(){clearTimeout(timer);reject(new CreatorProviderError("cancelled","Creator discovery stopped waiting. The paid run is kept."));}signal?.addEventListener("abort",abort,{once:true});});
 }
 private async read(path:string,signal?:AbortSignal){
  for(let attempt=0;;attempt++)try{return await this.json(path,{},signal);}catch(e){if(!(e instanceof CreatorRequestError)||!e.temporary||attempt===5)throw e;await this.pause(Math.max(e.retryAfterMs,Math.min(30000,1000*2**attempt)),signal);}
 }
 private state(value:unknown,prior:CreatorActorRun):CreatorActorRun {
  const run=record(record(value).data);
  if(!this.id(run.id)||prior.runId&&run.id!==prior.runId)throw new CreatorProviderError("invalid_output","The provider run identity could not be verified.");
  const status=["READY","RUNNING","SUCCEEDED","FAILED","ABORTED","ABORTING","TIMED-OUT","TIMING-OUT"].includes(run.status)?run.status:"UNKNOWN";
  return {...prior,runId:run.id,datasetId:this.id(run.defaultDatasetId)?run.defaultDatasetId:prior.datasetId,status,usageUsd:finalActorStatus(status)&&typeof run.usageTotalUsd==="number"&&Number.isFinite(run.usageTotalUsd)&&run.usageTotalUsd>=0?run.usageTotalUsd:null};
 }
 private async progress(row:CreatorActorRun,hooks:CreatorRunHooks,signal?:AbortSignal){
  if(this.tracking())await trackCreatorProgress(this.pool(),row);
  if(row.datasetId&&!finalActorStatus(row.status))try{const meta=record(record(await this.read(`/v2/datasets/${row.datasetId}`,signal)).data);if(Number.isSafeInteger(meta.itemCount)&&meta.itemCount>=0)row.found=meta.itemCount;}catch{/* Missing progress never terminates paid work. */}
  if(this.tracking())await trackCreatorProgress(this.pool(),row);
  await this.options.progress?.(row);await hooks.progress?.(row);
 }
 researchConfiguration(){const reserve=this.reserveAmount(),conversion=Number(this.env.EXTER_AD_MEDIA_GBP_PER_USD||"0.8"),configured=this.status().configured&&actorId(this.env.APIFY_INSTAGRAM_ACTOR_ID)==="apify~instagram-scraper"&&Number.isFinite(conversion)&&conversion>0&&conversion<=2&&reserve!==null&&reserve/conversion>=.01;return {configured,reserveGbp:reserve,conversion,reason:configured?"Public creator discovery is configured.":"Set up creator discovery, its actor and a conservative cost reserve."};}
 async collectPublic(input:Record<string,unknown>,maximum:number,signal?:AbortSignal,hooks:CreatorRunHooks={}){
  const c=this.researchConfiguration();if(!c.configured||c.reserveGbp===null||!Number.isInteger(maximum)||maximum<1||maximum>199)throw new CreatorProviderError("configuration",c.reason);
  return this.execute(input,maximum,"instagram",signal,hooks);
 }
 private async execute(input:Record<string,unknown>,maximum:number,platform:CreatorPlatform,signal?:AbortSignal,hooks:CreatorRunHooks={}){
  const actor=platform==="instagram" && hooks.source==="hashtag" ? "apify~instagram-hashtag-analytics-scraper" : actorId(this.env[`APIFY_${platform.toUpperCase()}_ACTOR_ID`]),reserve=this.reserveAmount(),conversion=Number(this.env.EXTER_AD_MEDIA_GBP_PER_USD||"0.8");
  const accounting:CreatorProviderAccounting={reservedCostGbp:null,billedCostGbp:null,requestAttempts:0,runIds:[]};
  if(signal?.aborted)throw new CreatorProviderError("cancelled","Creator discovery was cancelled before dispatch.",accounting);
  if(!this.token.trim()||!actor||reserve===null||!Number.isFinite(conversion)||conversion<=0||conversion>2)throw new CreatorProviderError("configuration","Check the provider and cost settings.",accounting);
  assertProxySupport(Boolean(this.options.fetch),this.env);
  let row:CreatorActorRun|null=this.options.resume??(this.tracking()?await storedCreatorRun(this.pool(),hooks.scope??{}):null),rows:unknown[]=[];
  const account=()=>{if(!row)return;accounting.reservedCostGbp=row.reservedGbp;accounting.reservationId=row.reservationId;accounting.runIds=row.runId?[row.runId]:[];accounting.runStatus=row.status;accounting.billedCostUsd=row.usageUsd;accounting.billedCostGbp=row.usageUsd===null?null:Math.round(row.usageUsd*row.conversion*1e6)/1e6;};
  try{
   if(!row){
    if(await hooks.shouldStop?.())throw new CreatorProviderError("cancelled","Search stopped before another paid lookup.");
    let hold:{reservationId:string;reservedGbp:number};try{hold=this.options.reserve?await this.options.reserve(reserve,{platform,actorId:actor}):{reservationId:await reserveProviderCost(this.pool(),"data_providers","apify",reserve),reservedGbp:reserve};if(!hold.reservationId||!Number.isFinite(hold.reservedGbp)||hold.reservedGbp<reserve)throw new Error();}catch{throw new CreatorProviderError("budget_paused","Creator research stopped at the data-provider budget.",accounting);}
    row={...hold,conversion,runId:null,datasetId:null,status:"STARTING",found:null,usageUsd:null,startedAt:(this.options.now?.()??new Date()).toISOString()};account();
    if(this.tracking())await trackCreatorReservation(this.pool(),hooks.scope??{},row,actor);
    accounting.requestAttempts++;
    const charge=Math.floor(reserve/conversion*100)/100;
    row=this.state(await this.json(`/v2/acts/${actor}/runs?timeout=${platform==="instagram"?900:120}&maxItems=${maximum}&maxTotalChargeUsd=${charge}&restartOnError=false`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)},signal),row);
   }else if(!row.runId)throw new CreatorProviderError("pending","The earlier paid start needs its run ID before it can continue.",accounting);
   else row=this.state(await this.read(`/v2/actor-runs/${row.runId}`,signal),row);
   let abortSent=false;
   const honourStop=async()=>{
    if(!row || finalActorStatus(row.status) || abortSent || !await hooks.shouldStop?.())return;
    try{row=this.state(await this.json(`/v2/actor-runs/${row.runId}/abort`,{method:"POST"},signal),row);abortSent=true;}
    catch{throw new CreatorProviderError("pending","The stop is requested. Waiting for the provider to confirm it.");}
   };
   await honourStop();
   const window=this.options.pollWindowMs??1200000,started=Date.parse(row.startedAt),now=()=>Math.max(0,(this.options.now?.()??new Date()).getTime()-started);
   let waited=now(),polls=0;
   const waitSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(Math.max(1,window-now()))]):AbortSignal.timeout(Math.max(1,window-now()));
   account();await this.progress(row,hooks,waitSignal);
   try{while(!finalActorStatus(row.status)&&Math.max(now(),waited)<window&&polls<(this.options.maxPolls??Infinity)){
    const elapsed=Math.max(now(),waited),delay=this.options.pollIntervalMs??(elapsed<60000?5000:elapsed<120000?10000:15000);
    await this.pause(Math.min(delay,window-elapsed),waitSignal);waited+=delay;polls++;
    await honourStop();
    row=this.state(await this.read(`/v2/actor-runs/${row.runId}`,waitSignal),row);account();await this.progress(row,hooks,waitSignal);
   }}catch(e){if(!waitSignal.aborted || signal?.aborted)throw e;}
   if(finalActorStatus(row.status)&&row.usageUsd===null)try{row=this.state(await this.read(`/v2/actor-runs/${row.runId}`,signal),row);account();await this.progress(row,hooks);}catch{/* Unknown real charges retain their hold. */}
   if(finalActorStatus(row.status)&&row.usageUsd!==null){if(this.options.settle)await this.options.settle(row);else if(this.tracking())await settleCreatorRun(this.pool(),row);}
   if(row.datasetId)for(let offset=0;offset<maximum;offset+=PAGE_SIZE){const limit=Math.min(PAGE_SIZE,maximum-offset),items=await this.read(`/v2/datasets/${row.datasetId}/items?clean=true&format=json&limit=${limit}&offset=${offset}`,signal);if(!Array.isArray(items)||items.length>limit)throw new CreatorProviderError("invalid_output","The provider returned an unsupported result page.");rows.push(...items);if(items.length<limit)break;}
   if(!finalActorStatus(row.status))throw new CreatorProviderError("pending","The provider run is still waiting for a final check. No new paid run was started.");
   if(!row.datasetId && row.status==="SUCCEEDED")throw new CreatorProviderError("invalid_output","The provider did not supply a result dataset.");
   if(row.datasetId)row.found=Math.max(row.found??0,rows.length);account();await this.progress(row,hooks);return {rows,accounting};
  }catch(e){account();const error=e instanceof CreatorProviderError?e:new CreatorProviderError("unavailable","Public creator lookup could not finish. Earlier profiles are unchanged.");
   if(row?.runId && (e instanceof CreatorRequestError && e.temporary || e instanceof CreatorProviderError && e.code==="cancelled"))error.code="pending";
   error.accounting=accounting;error.partialRows=rows;throw error;
  }
 }
 async inspectActor(source?:"hashtag"){return this.read(`/v2/acts/${source==="hashtag"?"apify~instagram-hashtag-analytics-scraper":actorId(this.env.APIFY_INSTAGRAM_ACTOR_ID)}`);}
 async inspectRun(id:string){if(!this.id(id))throw new CreatorProviderError("configuration","Check the provider run ID.");return this.read(`/v2/actor-runs/${id}`);}
 async inspectInput(storeId:string){if(!this.id(storeId))throw new CreatorProviderError("configuration","The run input could not be checked.");return this.read(`/v2/key-value-stores/${storeId}/records/INPUT`);}
 async acknowledge(reservationId:string){
  if(!this.tracking())return;
  const row=(await this.pool().query("UPDATE creator_provider_runs SET read_complete=true WHERE reservation_id=$1 AND status IN ('SUCCEEDED','FAILED','ABORTED','TIMED-OUT') RETURNING dataset_id",[reservationId])).rows[0];
  if(row?.dataset_id&&this.id(row.dataset_id))try{await this.json(`/v2/datasets/${row.dataset_id}`,{method:"DELETE"});}catch{/* Provider retention policy remains in force. */}
 }
 async search(input:CreatorSearchInput):Promise<CreatorSearchResult>{
  if(!["instagram","tiktok"].includes(input.platform)||!input.country?.trim()||input.country.length>100||!input.category?.trim()||input.category.length>200||(input.query?.length??0)>400)throw new CreatorProviderError("configuration","Provide a platform, country and category within the supported search limits.");
  const maxProfiles=input.maxProfiles??5,maxPosts=input.maxPostsPerProfile??12;
  if(!Number.isInteger(maxProfiles)||maxProfiles<1||maxProfiles>20||!Number.isInteger(maxPosts)||maxPosts<1||maxPosts>20||(input.seedHandles?.length??0)>20||input.seedHandles?.some(h=>!handleValue(h)))throw new CreatorProviderError("configuration","Creator search supports 1–20 profiles, 1–20 recent posts and valid explicit seed handles.");
  const query=[input.query?.trim()||input.category.trim(),input.country.trim()].join(" "),handles=input.seedHandles?.map(h=>handleValue(h)!);
  const actorInput=input.platform==="instagram"?{resultsType:"details",resultsLimit:maxProfiles,addParentData:true,...(handles?.length?{directUrls:handles.map(h=>profileUrl(input.platform,h))}:{search:query,searchType:"user",searchLimit:maxProfiles})}:{...(handles?.length?{profiles:handles}:{searchQueries:[query]}),resultsPerPage:Math.min(PAGE_SIZE,maxProfiles*maxPosts),shouldDownloadVideos:false,shouldDownloadCovers:false,shouldDownloadSubtitles:false};
  const result=await this.execute(actorInput,MAX_DATASET_PAGES*PAGE_SIZE,input.platform,input.signal,{scope:{workspaceId:input.workspaceId}}),profiles=normaliseApifyCreators(result.rows,input.platform,{observedAt:(this.options.now?.()??new Date()).toISOString(),token:this.token,maxProfiles,maxPostsPerProfile:maxPosts});
  const warnings=["Country and category are search terms, not verified creator residence or audience geography.","Missing public metrics stay unavailable. These figures do not show sales.",result.accounting.billedCostGbp===null?"Final billing is not available. The budget hold is kept.":"The provider reported the USD charge; GBP uses the saved exchange rate."];
  if(result.rows.length===200)warnings.push("Dataset pagination was capped at 200 public records.");
  if(result.accounting.runStatus!=="SUCCEEDED")warnings.push("The run stopped early. Available partial results were saved.");
  return {profiles,accounting:result.accounting,warnings};
 }
}
