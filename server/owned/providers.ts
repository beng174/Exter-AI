import { providerJson } from "../connectors/http.js";
import { reportDate, safeNumber, type ConnectorEnv, type FetchLike } from "../connectors/types.js";
import type { OwnedDay } from "../../shared/owned-metrics.js";
import { OwnedSyncError, ownedFailure, type OwnedAccount } from "./types.js";

export const META_OWNED_FIELDS = ["ad_id","ad_name","adset_name","campaign_name","date_start","date_stop","spend","impressions","inline_link_clicks","actions","action_values","account_currency","video_thruplay_watched_actions","video_play_actions","video_p25_watched_actions","video_p50_watched_actions","video_p75_watched_actions","video_p95_watched_actions","video_p100_watched_actions","video_avg_time_watched_actions","frequency"];
export const TIKTOK_OWNED_METRICS = ["spend","impressions","clicks","conversion","video_watched_2s","video_watched_6s","video_play_actions","video_views_p25","video_views_p50","video_views_p75","video_views_p95","video_views_p100","average_video_play","frequency"];
const purchases = ["omni_purchase","purchase","offsite_conversion.fb_pixel_purchase"];
const numeric = (value:unknown) => safeNumber(value,"owned metric",true);
const fail = (reason:OwnedSyncError["reason"]):never => { throw new OwnedSyncError(reason,ownedFailure(reason)); };
const id = (value:unknown):string => {
  if (typeof value === "number" && Number.isSafeInteger(value)) value=String(value);
  if(typeof value !== "string" || !/^\d{1,40}$/.test(value)) return fail("schema");
  return value;
};
const name = (value:unknown):string|null => typeof value==="string" ? value.slice(0,500) : null;
function action(values:unknown, types:string[]):number|null {
  if(!Array.isArray(values)) return null;
  for(const type of types) { const entry=values.find(item=>item?.action_type===type); if(entry) return numeric(entry.value); }
  return null;
}
export function ownedToken(account:OwnedAccount,env:ConnectorEnv):string {
  const token=env[account.platform==="Meta"?"EXTER_META_ACCESS_TOKEN":"EXTER_TIKTOK_ACCESS_TOKEN"]?.trim();
  return token || fail("not_connected");
}
export async function pullOwnedDays(account:OwnedAccount,from:string,to:string,options:{fetch:FetchLike;env:ConnectorEnv;now?:Date;beforeRequest?:()=>Promise<void>}):Promise<OwnedDay[]> {
  const token=ownedToken(account,options.env), now=options.now || new Date();
  const meta=account.platform==="Meta";
  const version=options.env.EXTER_META_GRAPH_VERSION || "v25.0";
  if(meta && (!/^v\d+\.0$/.test(version) || Number(version.slice(1,-2))<25)) fail("schema");
  if(!/^\d{1,40}$/.test(account.account_id)) fail("schema");
  const attribution=account.attribution.split(",");
  if(meta && (!attribution.length || attribution.some(value=>!["1d_click","7d_click","1d_view"].includes(value)))) fail("schema");
  if(!meta && account.attribution!=="account_configured") fail("schema");
  async function request(url:URL) {
    await options.beforeRequest?.();
    let status=0;
    try {
      const body=await providerJson(async (target,init)=> {
        const response=await options.fetch(target,init); status=response.status; return response;
      },url,{headers:meta?{Authorization:`Bearer ${token}`}:{"Access-Token":token}},meta?"graph.facebook.com":"business-api.tiktok.com");
      if(meta && body.error) fail([190,10,200].includes(Number(body.error.code))?"permission":"temporary");
      if(!meta && body.code!==0) fail([40100,40101,40102,40001].includes(Number(body.code))?"permission":"temporary");
      return body;
    } catch(error) {
      if(error instanceof OwnedSyncError) throw error;
      return fail(status===401 || status===403?"permission":"temporary");
    }
  }
  async function pages(url:URL):Promise<any[]> {
    const result:any[]=[], seen=new Set<string>();
    for(let page=1;page<=500;page++) {
      if(!meta)url.searchParams.set("page",String(page));
      const body=await request(url), values=meta?body.data:body.data?.list;
      if(!Array.isArray(values)) fail("schema");
      result.push(...values);
      if(result.length>100000)fail("schema");
      if(meta) {
        if(!body.paging?.next)return result;
        const cursor=body.paging?.cursors?.after;
        if(typeof cursor!=="string" || !cursor || cursor.length>2000 || seen.has(cursor))fail("schema");
        seen.add(cursor);url.searchParams.set("after",cursor);
      } else {
        const total=body.data?.page_info?.total_page;
        if(!Number.isSafeInteger(total) || total<0 || total>500)fail("schema");
        if(page>=total)return result;
      }
    }
    return fail("schema");
  }
  try {
    const metadataUrl=new URL(meta?`https://graph.facebook.com/${version}/act_${account.account_id}/ads`:"https://business-api.tiktok.com/open_api/v1.3/ad/get/");
    if(meta) { metadataUrl.searchParams.set("fields","id,name,adset{name},campaign{name},creative{id,video_id,image_hash}");metadataUrl.searchParams.set("limit","500"); }
    else {metadataUrl.searchParams.set("advertiser_id",account.account_id);metadataUrl.searchParams.set("page_size","1000");}
    const metadata=await pages(metadataUrl), byId=new Map(metadata.map(row=>[id(meta?row.id:row.ad_id),row]));
    // Some reporting metadata omits parent names. Resolve them by exact IDs,
    // rather than treating an ID or an inferred label as a campaign name.
    const parents=new Map<string,any>(), campaigns=new Map<string,any>();
    if(!meta && metadata.some(row=>row.adgroup_id && !row.adgroup_name)) {
      const parentUrl=new URL("https://business-api.tiktok.com/open_api/v1.3/adgroup/get/");
      parentUrl.searchParams.set("advertiser_id",account.account_id);parentUrl.searchParams.set("page_size","1000");
      for(const row of await pages(parentUrl))parents.set(id(row.adgroup_id),row);
    }
    if(!meta && metadata.some(row=>row.campaign_id && !row.campaign_name)) {
      const campaignUrl=new URL("https://business-api.tiktok.com/open_api/v1.3/campaign/get/");
      campaignUrl.searchParams.set("advertiser_id",account.account_id);campaignUrl.searchParams.set("page_size","1000");
      for(const row of await pages(campaignUrl))campaigns.set(id(row.campaign_id),row);
    }
    const url=new URL(meta?`https://graph.facebook.com/${version}/act_${account.account_id}/insights`:"https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/");
    const params=meta?{level:"ad",fields:META_OWNED_FIELDS.join(","),time_increment:"1",time_range:JSON.stringify({since:from,until:to}),action_attribution_windows:JSON.stringify(attribution),limit:"500"}
      :{advertiser_id:account.account_id,report_type:"BASIC",data_level:"AUCTION_AD",dimensions:JSON.stringify(["ad_id","stat_time_day"]),metrics:JSON.stringify(TIKTOK_OWNED_METRICS),start_date:from,end_date:to,page_size:"1000"};
    for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
    const rows=await pages(url), output:OwnedDay[]=[];
    for(const row of rows) {
      const adId=id(meta?row.ad_id:row.dimensions?.ad_id), ad=byId.get(adId), m=meta?row:row.metrics;
      if(!m || typeof m!=="object")fail("schema");
      const day=reportDate(meta?row.date_start:row.dimensions?.stat_time_day);
      if(day<from || day>to)fail("schema");
      const currency=meta?row.account_currency:account.currency;
      if(typeof currency!=="string" || !/^[A-Z]{3}$/.test(currency))fail("schema");
      const assets=meta?[ad?.creative?.id,ad?.creative?.video_id,ad?.creative?.image_hash]:[ad?.video_id,...(Array.isArray(ad?.image_ids)?ad.image_ids:[])];
      const video=(key:string)=>meta?action(m[key],["video_view"]):numeric(m[key]);
      output.push({platform:account.platform,accountId:account.account_id,adId,day,currency,attribution:account.attribution,conversionEvent:account.conversion_event,pulledAt:now.toISOString(),
        adName:name(meta?row.ad_name || ad?.name:ad?.ad_name),adSetName:name(meta?row.adset_name || ad?.adset?.name:ad?.adgroup_name || parents.get(String(ad?.adgroup_id))?.adgroup_name),campaignName:name(meta?row.campaign_name || ad?.campaign?.name:ad?.campaign_name || campaigns.get(String(ad?.campaign_id))?.campaign_name),assetIds:assets.filter((value):value is string=>typeof value==="string" && value.length<=200),
        spend:numeric(m.spend),impressions:numeric(m.impressions),linkClicks:numeric(meta?m.inline_link_clicks:m.clicks),
        earlyViews:meta?action(m.actions,["video_view"]):numeric(m.video_watched_2s),longerViews:meta?video("video_thruplay_watched_actions"):numeric(m.video_watched_6s),videoStarts:video("video_play_actions"),
        retention25:video(meta?"video_p25_watched_actions":"video_views_p25"),retention50:video(meta?"video_p50_watched_actions":"video_views_p50"),retention75:video(meta?"video_p75_watched_actions":"video_views_p75"),retention95:video(meta?"video_p95_watched_actions":"video_views_p95"),retention100:video(meta?"video_p100_watched_actions":"video_views_p100"),
        averageWatchTime:video(meta?"video_avg_time_watched_actions":"average_video_play"),frequency:numeric(m.frequency),purchases:meta?action(m.actions,purchases):numeric(m.conversion),purchaseValue:meta?action(m.action_values,purchases):null});
    }
    return output;
  } catch(error) {
    if(error instanceof OwnedSyncError)throw error;
    return fail("schema");
  }
}
