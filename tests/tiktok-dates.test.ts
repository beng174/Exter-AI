import test from 'node:test';
import assert from 'node:assert/strict';
import {TikTokCommercialConnector} from '../server/connectors/tiktok-commercial.js';
import {tikTokPublishedWindow,isTikTokMaxDateError,tikTokDateRecovery} from '../server/connectors/tiktok-dates.js';
const env={TIKTOK_CLIENT_KEY:'fixture-key',TIKTOK_CLIENT_SECRET:'fixture-secret'};
for(const at of ['2026-11-24T00:30:00Z','2026-11-24T23:30:00Z','2026-07-24T00:30:00Z','2026-07-24T23:30:00Z'])test(`TK-02 max is yesterday at UTC ${at}, even when caller asks for today or the future`,async()=>{
 const now=new Date(at),window=tikTokPublishedWindow(now);let calls=0;
 const client=new TikTokCommercialConnector({env,now:()=>now.getTime(),fetch:async(url,init)=>{if(String(url).includes('oauth'))return Response.json({access_token:'fixture-token',expires_in:7200});calls++;const range=JSON.parse(String(init?.body)).filters.ad_published_date_range;assert.equal(range.max,at.slice(0,7).replaceAll('-','')+'23');assert.equal(range.min,window.from.replaceAll('-',''));return Response.json({data:{ads:[],has_more:false},error:{code:'ok'}});}});
 for(const publishedTo of [at.slice(0,10),'2027-01-01'])await client.page({countries:['GB'],publishedFrom:window.from,publishedTo});assert.equal(calls,2);
});
test('TK-02 leap/year boundaries keep a valid calendar minimum and historical max stays fixed across midnight',async()=>{
 for(const [at,from,to]of [['2024-02-29T23:30:00Z','2023-02-28','2024-02-28'],['2026-01-01T00:30:00Z','2025-01-01','2025-12-31']])assert.deepEqual(tikTokPublishedWindow(new Date(at)),{from,to});
 let clock=Date.parse('2024-02-29T23:30:00Z'),count=0;const q={countries:['GB'],publishedFrom:'2023-02-28',publishedTo:'2024-02-28'};
 const client=new TikTokCommercialConnector({env,now:()=>clock,fetch:async(url,init)=>{if(String(url).includes('oauth'))return Response.json({access_token:'fixture-token',expires_in:7200});const body=JSON.parse(String(init?.body));assert.equal(body.filters.ad_published_date_range.max,'20240228');return Response.json({data:{ads:[{ad:{id:String(++count)}}],has_more:count===1,...(count===1?{search_id:'fixture-cursor'}:{})},error:{code:'ok'}});}});
 const first=await client.page(q);clock=Date.parse('2024-03-01T00:30:00Z');await client.page({...q,cursor:first.cursor!});assert.equal(count,2);
 let calls=0;const invalid=new TikTokCommercialConnector({env,now:()=>clock,fetch:async()=>{calls++;throw new Error('No request expected.');}});await assert.rejects(invalid.page({countries:['GB'],publishedFrom:'2024-03-01',publishedTo:'2024-03-02'}),/date range/);assert.equal(calls,0);
});
test('TK-02 only the specific max-date rejection recovers, with one two-day fallback per UTC day',()=>{
 const now=new Date('2026-11-24T00:30:00Z');assert(isTikTokMaxDateError("filters.ad_published_date_range.max: 20261124 is invalid. Please provide a value before today's date."));assert(!isTikTokMaxDateError('Invalid token'));assert(!isTikTokMaxDateError("ad_published_date_range.min must be before today's date."));
 assert.deepEqual(tikTokDateRecovery({to:'2026-11-24'},now),{from:'2025-11-24',to:'2026-11-23',dateRecoveryDay:'2026-11-24'});
 const fallback=tikTokDateRecovery({to:'2026-11-23'},now)!;assert.equal(fallback.to,'2026-11-22');assert.equal(tikTokDateRecovery(fallback,now),null);assert.equal(tikTokDateRecovery(fallback,new Date('2026-11-25T00:30:00Z'))?.to,'2026-11-24');
});
