import meta from "./owned/meta-report.json";
import tiktok from "./owned/tiktok-report.json";
import type { FetchLike } from "../../server/connectors/types.js";
import type { OwnedAccount } from "../../server/owned/types.js";
export const fixtureEnv={EXTER_META_ACCESS_TOKEN:"non-working-fixture-marker",EXTER_TIKTOK_ACCESS_TOKEN:"non-working-fixture-marker"};
export const fixtureAccount=(patch:Partial<OwnedAccount>={}):OwnedAccount=>({id:"first",workspace_id:"workspace",platform:"Meta",account_id:"11",currency:"GBP",attribution:"7d_click,1d_view",conversion_event:"purchase",enabled:true,status:"pending",last_successful_sync:null,latest_data_date:null,last_error:null,...patch});
export const fixtureFetch=(observe?:(url:URL,init?:RequestInit)=>void):FetchLike=>async(target,init)=>{
  const url=new URL(String(target));observe?.(url,init);
  if(url.pathname.endsWith('/ads'))return Response.json({data:[{id:"1111",name:"Fixture creative",creative:{id:"3333",video_id:"4444"}}]});
  if(url.pathname.endsWith('/insights'))return Response.json(meta);
  if(url.pathname.endsWith('/ad/get/'))return Response.json({code:0,data:{list:[{ad_id:"1111",ad_name:"Fixture creative",adgroup_name:"Fixture ad set",campaign_name:"Fixture campaign",video_id:"4444"}],page_info:{total_page:1}}});
  if(url.pathname.endsWith('/report/integrated/get/'))return Response.json(tiktok);
  throw new Error("Unexpected fixture destination");
};
