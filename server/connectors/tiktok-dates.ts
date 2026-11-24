/** Ad queries accept completed UTC dates only; retain a calendar-year lower bound. */
export function tikTokPublishedWindow(now=new Date(),lag:1|2=1){
 const today=now.toISOString().slice(0,10),first=new Date(today+'T00:00:00Z'),month=first.getUTCMonth();
 first.setUTCFullYear(first.getUTCFullYear()-1);if(first.getUTCMonth()!==month)first.setUTCDate(0);
 return {from:first.toISOString().slice(0,10),to:new Date(now.getTime()-lag*86400000).toISOString().slice(0,10)};
}
export function isTikTokMaxDateError(message:unknown){
 return typeof message==='string'&&/ad_published_date_range\.max\b/i.test(message)&&/before today(?:['’]s)? date/i.test(message);
}
/** One further day is allowed for a source whose date has not rolled over yet. */
export function tikTokDateRecovery(config:{to?:string;dateRecoveryDay?:string},now=new Date()){
 const today=now.toISOString().slice(0,10),yesterday=tikTokPublishedWindow(now),fallback=tikTokPublishedWindow(now,2);
 if(config.dateRecoveryDay===today&&config.to&&config.to<=fallback.to)return null;
 return {...(config.to===yesterday.to?fallback:yesterday),dateRecoveryDay:today};
}
