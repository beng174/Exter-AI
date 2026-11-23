/** CP-04. Imported outcomes are reported observations, never verified conversions. */
import {creatorHandle} from './creator-discovery.js';
export interface CreatorOutcomeScope {account:string;currency:string;attribution:string;event:string;category:string;product:string;format:string}
export interface CreatorAdOutcome {adId:string;familyId:string;roas:number;benchmark:number}
export interface CreatorCampaign {adOutcomes?:CreatorAdOutcome[];id:string;handle:string;brand:string;platform:string;from:string;to:string;scope:CreatorOutcomeScope;spend:number|null;revenue:number|null;roas:number|null;cpa:number|null;purchases:number|null;hookRate:number|null;holdRate:number|null;adIds:string[];source:'Imported'|'Owned';recordedAt:string;features:number[]|null;featureAt:string|null;fixture:boolean}
export const creatorCohort=(c:Pick<CreatorCampaign,'platform'|'scope'>)=>JSON.stringify([c.platform,c.scope.account,c.scope.currency,c.scope.attribution,c.scope.event,c.scope.category,c.scope.product,c.scope.format]);
export const CREATOR_HISTORY_HEADER='creator_handle,brand,platform,start_date,end_date,spend,revenue,roas,cpa,content_type,campaign_id,purchases,ad_ids';
export function parseCsv(csv:string):string[][] {
 if(new TextEncoder().encode(csv).length>1_000_000)throw new Error('Choose a CSV smaller than 1 MB.');
 const rows:string[][]=[],row:string[]=[];let field='',quoted=false,closed=false;
 for(let i=0;i<csv.length;i++){const c=csv[i];if(c==='"'){if(quoted&&csv[i+1]==='"'){field+='"';i++;}else if(quoted){quoted=false;closed=true;}else if(!field&&!closed)quoted=true;else throw new Error('Invalid CSV quoting.');}
 else if(c===','&&!quoted){row.push(field);field='';closed=false;}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&csv[i+1]==='\n')i++;row.push(field);if(row.some(f=>f.trim()))rows.push([...row]);row.length=0;field='';closed=false;}else{if(closed&&!/\s/.test(c))throw new Error('Invalid CSV quoting.');if(!closed)field+=c;}}
 if(quoted)throw new Error('A CSV quote is not closed.');if(field||row.length){row.push(field);rows.push(row);}return rows;
}
export function historyCampaigns(csv:string,brand:string,scope:Omit<CreatorOutcomeScope,'format'>,at:string,fixture=false):CreatorCampaign[]{
 const rows=parseCsv(csv),headers=rows.shift()?.map(s=>s.trim().replace(/^\uFEFF/,'').toLowerCase())||[];
 const required=CREATOR_HISTORY_HEADER.split(',').slice(0,10),allowed=CREATOR_HISTORY_HEADER.split(',');
 if(required.some(h=>!headers.includes(h))||headers.some(h=>!allowed.includes(h))||new Set(headers).size!==headers.length)throw new Error('Use the creator campaign CSV template headers.');
 if(!rows.length||rows.length>500)throw new Error('Import between 1 and 500 campaigns.');
 const day=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 return rows.map((values,index)=>{const fail=(message:string):never=>{throw new Error(`Row ${index+2}: ${message}`);};if(values.length!==headers.length)fail('Check the number of fields.');
  const r=Object.fromEntries(headers.map((h,i)=>[h,values[i].trim()])),handle=creatorHandle(r.creator_handle);if(!handle)fail('Use a valid creator handle.');if(r.brand.toLowerCase()!==brand.trim().toLowerCase())fail('Only this workspace brand can have outcomes.');
  if(!['Meta','Instagram','TikTok'].includes(r.platform))fail('Choose Meta, Instagram or TikTok.');
  if(!day(r.start_date)||!day(r.end_date)||r.start_date>r.end_date||r.end_date>=at.slice(0,10))fail('Use valid past campaign dates.');
  const format=r.content_type.toLowerCase().replaceAll(' ','_'),formats:Record<string,string>={image:'static_image',static:'static_image',static_image:'static_image',video:'video',carousel:'carousel',catalogue:'catalogue'};if(!formats[format])fail('Use video, static image, carousel or catalogue.');
  const number=(key:string)=>{if(!r[key])return null;if(!/^\d+(?:\.\d+)?$/.test(r[key]))return fail(`Check ${key}.`);const n=Number(r[key]);if(!Number.isFinite(n)||n>1e12)return fail(`Check ${key}.`);return n;};
  const spend=number('spend'),revenue=number('revenue'),reportedRoas=number('roas'),reportedCpa=number('cpa'),purchases=number('purchases');
  if(purchases!==null&&!Number.isSafeInteger(purchases))fail('Purchases must be a whole number.');
  const roas=spend!==null&&spend>0&&revenue!==null?revenue/spend:reportedRoas,cpa=spend!==null&&purchases!==null&&purchases>0?spend/purchases:reportedCpa;
  if(spend===0&&(reportedRoas!==null||revenue!==null&&revenue>0))fail('ROAS needs positive spend.');
  if(purchases===0&&reportedCpa!==null)fail('CPA needs purchases.');
  if(reportedRoas!==null&&roas!==null&&Math.abs(reportedRoas-roas)>Math.max(.01,Math.abs(roas)*.01))fail('ROAS does not match revenue divided by spend.');
  if(reportedCpa!==null&&cpa!==null&&Math.abs(reportedCpa-cpa)>Math.max(.01,Math.abs(cpa)*.01))fail('CPA does not match spend divided by purchases.');
  if([spend,revenue,roas,cpa].every(v=>v===null))fail('Add at least one reported outcome.');
  const adIds=(r.ad_ids||'').split(/[;\s]+/).filter(Boolean);if(adIds.length>100||adIds.some(id=>!/^\d{1,40}$/.test(id)))fail('Check owned ad IDs.');
  if(r.campaign_id&&!/^[\w .:-]{1,100}$/.test(r.campaign_id))fail('Use a short campaign identifier.');
  return {id:r.campaign_id||'',handle:handle!,brand,platform:r.platform,from:r.start_date,to:r.end_date,scope:{...scope,format:formats[format]},spend,revenue,roas,cpa,purchases,hookRate:null,holdRate:null,adIds,source:'Imported',recordedAt:at,features:null,featureAt:null,fixture};
 });
}
