/** Synthetic UI-C/UI-D fixtures only. Never imported by the app or screenshot server. */
import type { Brand } from "../../shared/types.js";
import type { BrowserCreative, CreativeBrowserResponse } from "../../shared/creative-browser.js";
import type { VideoAnalysisFields } from "../../shared/video-analysis.js";
import { ownedMetrics } from "../../shared/owned-metrics.js";
import { browserCreative, ownedDay } from "./creative-browser.js";
const field=<T extends string|boolean>(value:T)=>({value,confidence:.5,timestamps:[{startSeconds:0,endSeconds:1}]});
export function researchFixture() {
  const fields:VideoAnalysisFields={hook:field("Saved opening words"),format:field("studio"),angle:field("gifting"),keyClaims:[{...field("Saved source claim"),claim_type:["performance","performance"]}],spokenTranscript:[field("Saved spoken words")],onScreenText:[field("Saved overlay")],cta:field("Read more"),personTalkingToCamera:field(true),creatorEvidence:[]};
  const analysis={id:"fixture-analysis",createdAt:"2026-11-04T00:00:00Z",promptVersion:"exter-native-video-v2",mediaKind:"video" as const,fields};
  const make=(adId:string,patch:Partial<BrowserCreative>={})=>browserCreative({adId,publicEvidence:true,copy:`First line ${adId}\nFull saved source copy`,observedAt:"2026-11-04T00:00:00Z",firstObservedAt:"2026-11-01T00:00:00Z",deliveryStartAt:"2026-11-01T00:00:00Z",daysRunning:3,creativeFormat:"studio",analysis,...patch});
  const creatives=[make("own-new"),make("own-older",{deliveryStartAt:"2026-10-25T00:00:00Z",daysRunning:10,creativeFormat:"UGC",hookType:"question",durationSeconds:47.923}),make("own-stop",{deliveryStatus:"inactive",deliveryStartAt:"2026-10-20T00:00:00Z",deliveryStopAt:"2026-11-02T00:00:00Z",daysRunning:13}),make("market-new",{brandId:"competitor-a",brandName:"Fixture competitor",workspaceBrand:false,daysRunning:5,creativeFormat:"UGC"}),make("market-older",{brandId:"competitor-a",brandName:"Fixture competitor",workspaceBrand:false,deliveryStartAt:"2026-10-22T00:00:00Z",daysRunning:13,hookType:"question"})];
  const metrics=ownedMetrics([ownedDay()]);
  creatives[0].owned=true;creatives[0].sourceKind="owned";creatives[0].performance=[{id:"account-a-gbp",accountId:"account-a",platform:"Meta",currency:"GBP",attribution:"7d_click",conversionEvent:"purchase",from:"2026-10-29",to:"2026-11-04",lastChecked:"2026-11-04T00:00:00Z",benchmarkSampleSize:1,metrics,benchmark:metrics},{id:"account-b-usd",accountId:"account-b",platform:"Meta",currency:"USD",attribution:"1d_view",conversionEvent:"purchase",from:"2026-10-29",to:"2026-11-04",lastChecked:"2026-11-04T00:00:00Z",benchmarkSampleSize:1,metrics,benchmark:metrics}];
  const brand:Brand={id:"workspace-a",name:"Fixture advertiser",domain:"fixture.example",category:"Home fragrance & gifting",color:"#123456",initials:"FA",voice:[],competitors:["competitor-a"],mode:"imported",createdAt:"2026-10-01"};
  const library:CreativeBrowserResponse={brand,creatives,competitors:[{key:"brand:competitor-a",brandId:"competitor-a",name:"Fixture competitor",status:"complete"}],sources:[{brandId:"competitor-a",name:"Fixture competitor",status:"complete"}],ownedStatus:"available",dateRange:{from:"2026-11-01T00:00:00Z",to:"2026-11-04T00:00:00Z"},lastChecked:"2026-11-04T00:00:00Z",reportingRange:{from:"2026-10-29",to:"2026-11-04"}};
  return {brand,library,analysis,make};
}
