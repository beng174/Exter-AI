/** Regenerate the explicit, fictional sample values from Exter's approved designs. */
import {readFileSync,writeFileSync} from 'node:fs';
const names=['Main','Brands','Competitors','Creatives','CreativeDetail','Formats','Patterns','Audience','Winners','Briefs','Creators','Scores','Ask','Reports','DataSources'];
const values={};
for(const name of names){
 const html=readFileSync(`design/screens/${name}.dc.html`,'utf8');
 const start=html.indexOf('renderVals() {')+'renderVals() {'.length;
 const end=html.lastIndexOf('\n  }\n}');
 if(start<14||end<=start)throw new Error(`Missing renderVals: ${name}`);
 values[name]=new Function(html.slice(start,end))();
}
// Static sections live outside renderVals in the approved HTML.
values.Main.attention=[{title:'Possible fatigue: Cosy evenings, static',text:'Cost per purchase is up 46% against its first two weeks while frequency rose to 3.8. A signal, not a verdict.',action:'View creative',adId:'sample-ad-005',view:'creatives'},{title:'Meta Ad Library is not connected yet',text:'Reach, share of voice and spend ranges switch on once Meta approves access. Until then competitor numbers rely on browser capture.',action:'Data sources',view:'data',adId:''}];
values.Competitors.summary='260 active ads across 6 brands · checked today 03:00 · select a number to see its ads';
values.Brands.checkedNote='Public sources, checked today at 03:12';
values.Main.accountNote='Meta · last 7 days · purchases, 7-day click and 1-day view · Observed';
values.Main.changeNote='18 ads launched, 7 stopped, 2 new angles · Observed';
values.Main.scorecardNote='Weekly scorecard · 5 competitors · 214 active ads';
values.Briefs.creatorProfile='UK based, women 25 to 44, home or lifestyle content, warm talking to camera, under 50K followers.';
values.Briefs.claimCheck='Claim check: hook 2 (“looks twice the price”) is comparative. Keep it as a customer quote, or hold evidence that would satisfy ASA rules.';
values.Reports.commentary='The sample week favours refill demos and gifting. Test three gift-box hooks, keep the refill ritual running and review the static creative for fatigue.';
values.Reports.client={status:'Active',expires:'3 Dec 2026',opened:'4 times, last Mon 09:12'};
values.DataSources.naming={example:'REFILL__UGC__PROBLEM__AMA__V2',coverage:'43 of 46 ad names match · 3 flagged',separator:'Underscore'};
values.DataSources.schedule=[{key:'Collection',value:'Daily at 03:00'},{key:'Your account sync',value:'Daily at 06:00 · last 7 days re-pulled'},{key:'Weekly data pack',value:'Monday at 06:00'}];
values.DataSources.users[0]={...values.DataSources.users[0],i:'R',n:'Rowan'};
values.DataSources.users=values.DataSources.users.map(user=>({...user,d:user.d.replace('Exter Media','Exter AI')}));
values.CreativeDetail.working={score:81,label:'Proven winner',confidence:'High confidence · driven by scaling and survival'};
values.CreativeDetail.score=83;
values.CreativeDetail.marketNote='How your 5 competitors use the same hook and angle · 214 active ads';
values.CreativeDetail.subtitle='Meta · video 0:24, vertical · running since 9 Oct 2026 · the same file in 3 ads';
values.CreativeDetail.mediaLabel='Saved file · 0:24 · captions on';
values.CreativeDetail.predictiveNote='Predictive score: not available yet. It ships once it beats simple baselines on newer ads, after about 3,000 resolved ads.';
values.CreativeDetail.retention={average:'9.8 sec',benchmark:'7.4 sec',points:[{label:'Start',creative:1,benchmark:1},{label:'25%',creative:.61,benchmark:.52},{label:'50%',creative:.44,benchmark:.35},{label:'75%',creative:.33,benchmark:.26},{label:'95%',creative:.25,benchmark:.19},{label:'End',creative:.21,benchmark:.16}]};
values.CreativeDetail.copy='Stop buying new candles. Refill the jar you already love, with 50 hours of burn in every refill.';
values.CreativeDetail.copyNote='Headline: Refill kits from £18 · Button: Shop now';
values.CreativeDetail.claimCheck='Claim check: “burns for 50 hours” is a performance claim. Keep the burn-test evidence on file in case it needs substantiating under ASA rules.';
values.CreativeDetail.readingNote='Read once by the low-cost pipeline on 10 Oct and checked by a strategist. Unknown fields stay unknown.';
values.CreativeDetail.market=[{label:'18%',value:'18%',note:'of competitors’ ads open with a problem hook; 41% of those are proven winners'},{label:'19 ads',value:'19 ads',note:'use a refill angle; the longest has run 64 days'},{label:'58',value:'58',note:'reviews mention running out or buying again'}];
values.CreativeDetail.retention.note='Keeps 9 more viewers in every 100 than your average at the halfway point. The biggest drop comes before the product appears at 0:05.';
values.Audience.reviewCount=1240;
values.Creators.summary='42 creators found · 6 shown · sorted by relevance to this brief';
for(const brand of values.Brands.brands)brand.domain=brand.domain?.replace(/\.(?:co\.uk|com)$/i,'.example');
for(const candidate of values.Brands.candidates)candidate.domain=candidate.domain.replace(/\.(?:co\.uk|com)$/i,'.example');
writeFileSync('shared/sample/values.json',JSON.stringify(values,null,2)+'\n');
