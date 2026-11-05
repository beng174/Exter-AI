import {reachScorecard,audienceReachTable} from "../../../shared/meta-research";
import {REACH_SHARE_NOTE} from "../../../shared/meta-public";
import { BrandText } from "../ui/BrandIdentity";
import { CompetitorsReadModel, FormatsReadModel, PatternsReadModel, AudienceReadModel, WinnersReadModel } from "./ResearchReadModels";
import type { CSSProperties } from "react";
import { ComparisonBars } from "../ui/ComparisonBars";
import { Caveat } from "../ui/Caveat";
import { brandVoice, brandSnapshots, comparisonGroups, evidenceUrl, launchShareTrend, longestRunning, mixGroups, productionFacts, selectResearchAds, RESEARCH_DIMENSIONS, type ResearchDimension, type EvidenceSelection, type BrandSnapshot } from "../../../shared/creative-research";
import { adCount, analysisUrl, creativeTitle, plainEnum, ukDate } from "../../../shared/creative-presentation";
import { CreativeRow } from "../ui/CreativeRow";
import { BarList, Heatmap, SectionCard, DataTable, DataLabel, hasValue, StatusChip, Unavailable } from "../ui";
import { CreativeTile, DimensionSwitch, EvidenceNumber, Measure, SafeLink, dimensionLabel, metadata, number, percent, type ScreenProps } from "./common";

interface DimensionProps {dimension:ResearchDimension;onDimension:(dimension:ResearchDimension)=>void}
const validDimension=(value:ResearchDimension)=>RESEARCH_DIMENSIONS.includes(value)?value:"format";
export function CompetitorsScreen({data,selection,dimension,onDimension}:ScreenProps&DimensionProps) {
  if(data.library.presentation)return <CompetitorsReadModel library={data.library} model={data.library.presentation}/>;
  dimension=validDimension(dimension);
  const {brands,hasReach}=reachScorecard(data.library,data.window,selection.platform);
  const metrics=[{id:"active",label:"Active ads"},{id:"launched",label:"New this week"},{id:"stopped",label:"Stopped this week"},{id:"medianDays",label:"Median days running"},{id:"shareActive",label:hasReach?"Share of voice by reach":"Share of active ads"}] as const;
  const selectionFor=(brand:BrandSnapshot,id:string)=>id in brand?(brand[id as keyof BrandSnapshot] as {selection:EvidenceSelection}).selection:{...selection,brand:brand.id};
  const values=brands.map(brand=>mixGroups(data.library.creatives,dimension,{...selection,brand:brand.id,kind:"active"}));
  const labels=[...new Set(values.flatMap(value=>value.groups.map(group=>group.value)))];
  const analysis={href:analysisUrl(data.library.brand.id),linkLabel:"Run analysis"};
  const collect={href:`/?view=settings&brandId=${encodeURIComponent(data.library.brand.id)}#demo-collection`,linkLabel:"Collect competitor ads"};
  return <>
    <SectionCard title="Scorecard" help="Select a number to see its ads" empty={!metrics.some(row=>brands.some(brand=>hasValue(brand[row.id].value)))&&{reason:"No comparable activity is saved.",...collect}} actions={<button className="button secondary" disabled title="Scorecard export is not available yet.">Export</button>} meta={metadata(data,selection)}>
      <Caveat>{hasReach?REACH_SHARE_NOTE:"Winner share, estimated spend and measures without saved evidence are omitted."}</Caveat>{brands.some(brand=>!brand.available)&&<p className="reference-muted">{brands.filter(brand=>!brand.available).length} configured competitors have no collected ads. <a href={collect.href}>Collect competitor ads</a></p>}
      <DataTable caption="You and configured competitors" basis="Observed" rowBasis={row=>brands.some(brand=>hasValue(brand[row.id].value))?row.id==="shareActive"&&hasReach?"Estimated":"Observed":"Unavailable"} rows={metrics.filter(row=>brands.some(brand=>hasValue(brand[row.id].value)))} rowKey={row=>row.id} onRow={row=>window.location.assign(evidenceUrl(data.library.brand.id,{...selection,...(row.id==="shareActive"&&hasReach?{reachCountry:"GB"}:{}),kind:row.id==="shareActive"&&hasReach?"all":row.id==="launched"?"launches":row.id==="stopped"?"stopped":row.id==="medianDays"?"running":"active",activityFrom:data.window.from||undefined,activityTo:data.window.to||undefined}))} columns={[
        {key:"measure",label:"Measure",value:row=>row.label},...brands.map(brand=>({key:brand.id,label:brand.workspaceBrand?"You":brand.name,align:"mixed" as const,header:<><span>{brand.workspaceBrand?"You":brand.name}</span>{!brand.available&&<small className="not-collected-header">Not collected</small>}</>,missing:()=>brand.available?<Unavailable compact reason="No comparable saved measure is available."/>:<span aria-hidden="true"/>,value:(row:typeof metrics[number])=>brand[row.id].value,render:(row:typeof metrics[number])=><Measure data={data} metric={brand[row.id]} suffix={row.id==="shareActive"?"%":""}/>}))
      ]}/>

    </SectionCard>
    <SectionCard title="Creative mix by brand" help="Share of each brand's active ads" actions={<DimensionSwitch value={dimension} onChange={onDimension}/>} empty={!labels.length&&{reason:"No supported labels are saved for the active captured sample.",...analysis}}>
      <div className="reference-mix"><div className="reference-mix-legend">{labels.map((value,index)=><span key={value}><i className={`mix-colour-${index%6}`}/>{dimensionLabel(dimension,value)}</span>)}</div>{brands.map((brand,index)=><div className="reference-mix-row" key={brand.id}><strong><BrandText size={16}>{brand.workspaceBrand?"You":brand.name}</BrandText></strong>{values[index].groups.length?<div className={`reference-mix-track ${dimension==="claim"?"mix-overlapping":""}`}>{values[index].groups.map(group=><button key={group.value} style={{"--mix-width":`${group.share}%`} as CSSProperties} className={`mix-colour-${labels.indexOf(group.value)%6}`} title={`${dimensionLabel(dimension,group.value)}: ${number(group.share)}%`} aria-label={`${brand.name}, ${dimensionLabel(dimension,group.value)}: ${number(group.share)}%`} onClick={()=>window.location.assign(evidenceUrl(data.library.brand.id,{...selection,brand:brand.id,kind:"active",dimension,value:group.value}))}/>)}</div>:<span className="reference-muted">{brand.available?"No saved labels":"Not collected"}</span>}<a href={evidenceUrl(data.library.brand.id,{...selection,brand:brand.id,kind:"active"})}>{brand.available?`${values[index].sample} ads`:""}</a></div>)}<DataLabel basis="Modelled"/></div>

      <Caveat><div className="research-coverage-list">{brands.map((brand,index)=><p key={brand.id}>{brand.name}: <EvidenceNumber data={data} value={brand.available?values[index].classified:null} selection={{...selection,brand:brand.id,kind:"active",dimension,value:"classified"}}/> classified; <EvidenceNumber data={data} value={brand.available?values[index].unclassified:null} selection={{...selection,brand:brand.id,kind:"active",dimension,value:"unclassified"}}/> unclassified.</p>)}</div></Caveat>
    </SectionCard>
    <SectionCard title="What each competitor leans on"  meta={metadata(data,{...selection,show:"competitors"})} empty={!brands.some(brand=>!brand.workspaceBrand&&brand.available)&&{reason:"Configured competitor evidence has not been collected.",...collect}}>
      <div className="research-competitor-grid">{brands.filter(brand=>!brand.workspaceBrand).map(brand=>{
        const groups=mixGroups(data.library.creatives,dimension,{...selection,brand:brand.id,kind:"active"});
        return <article className="research-competitor-card" key={brand.id}><h3>{brand.name}</h3>{groups.groups.length?<><BarList label={`Recorded ${dimension} labels`} basis="Observed" items={groups.groups.slice(0,3).map(group=>({id:group.value,label:dimensionLabel(dimension,group.value),value:group.count}))} meta={metadata(data,{...selection,brand:brand.id,kind:"active"})} onSelect={value=>window.location.assign(evidenceUrl(data.library.brand.id,{...selection,brand:brand.id,kind:"active",dimension,value}))}/><div className="research-creative-grid">{longestRunning(data.library.creatives,{...selection,brand:brand.id,dimension,value:groups.groups[0].value,kind:"active"},3).map(row=><CreativeTile key={row.adId} row={row} workspaceId={data.library.brand.id}/>)}</div></>:<Unavailable reason={brand.available?"This sample has no supported analysis labels.":"No captured sample is saved."} {...(brand.available?{href:analysisUrl(brand.id,undefined,data.library.brand.id),linkLabel:"Run analysis"}:collect)}/>}</article>;
      })}</div>
    </SectionCard>
  </>;
}
export function FormatsScreen({data,selection}:ScreenProps) {
  if(data.library.presentation)return <FormatsReadModel library={data.library} model={data.library.presentation}/>;
  const groups=comparisonGroups(data.library.creatives,"format",selection),coverage=mixGroups(data.library.creatives,"format",selection);
  const analysis={href:analysisUrl(data.library.brand.id),linkLabel:"Run analysis"};
  const productionSelection={...selection,kind:"running" as const,take:"5"};
  const all=productionFacts(data.library.creatives,productionSelection),own=productionFacts(data.library.creatives,{...productionSelection,show:"yours"}),competitors=productionFacts(data.library.creatives,{...productionSelection,show:"competitors"});
  const measures=[{id:"duration",label:"Median video length (seconds)",known:all.duration!==null,all:all.duration,yours:own.duration,competitors:competitors.duration,basis:"Observed" as const},{id:"talking",label:"Talking to camera (%)",known:all.talkingShare!==null,all:all.talkingShare,yours:own.talkingShare,competitors:competitors.talkingShare,basis:"Modelled" as const},{id:"hook",label:"Measured hook length",known:false,all:null,yours:null,competitors:null,basis:"Unavailable" as const},{id:"captions",label:"Captions on",known:false,all:null,yours:null,competitors:null,basis:"Unavailable" as const},{id:"presence",label:"Person on camera",known:false,all:null,yours:null,competitors:null,basis:"Unavailable" as const}];
  return <>
    <SectionCard title="Format league table" help="Select a format to filter Creatives" empty={!groups.length&&{reason:"No supported format analysis is saved.",...analysis}}>
      <DataTable caption="Format use in the saved category" basis="Modelled" meta={metadata(data,selection)} rows={groups} rowKey={row=>row.value} onRow={row=>window.location.assign(evidenceUrl(data.library.brand.id,row.selection))} columns={[
        {key:"format",label:"Format",value:row=>dimensionLabel("format",row.value)},
        {key:"mix",label:"Market and you",value:row=>row.yourShare??row.competitorShare,render:row=><ComparisonBars yours={row.yourShare} competitors={row.competitorShare} onYours={()=>window.location.assign(evidenceUrl(data.library.brand.id,{...row.selection,show:"yours"}))} onCompetitors={()=>window.location.assign(evidenceUrl(data.library.brand.id,{...row.selection,show:"competitors"}))}/>},
        {key:"days",label:"Median days",value:row=>row.medianDays,render:row=><EvidenceNumber value={row.medianDays} data={data} selection={{...row.selection,kind:"running"}}/>},
        {key:"trend",label:"Launch-share trend (points)",value:row=>launchShareTrend(data.library.creatives,"format",row.value,data.window,selection),render:row=><EvidenceNumber data={data} basis="Modelled" value={launchShareTrend(data.library.creatives,"format",row.value,data.window,selection)} selection={{...row.selection,kind:"launches",activityFrom:data.window.previousFrom||undefined,activityTo:data.window.to||undefined}}/>},
        {key:"win",label:"Category win rate",value:()=>null,unavailable:()=>({reason:"Working Score is not available yet."})},
        {key:"roas",label:"Your format ROAS",value:()=>null,unavailable:()=>({reason:"Your format results are not available yet."})}
      ]}/>

    </SectionCard>
    <SectionCard title="How winning ads are built" help="Longest-running ads are shown until Working Score is available" empty={!measures.some(item=>item.known)&&{reason:"No supported production measurements are saved for these creatives.",...analysis}}>
      <DataTable caption="Production evidence from longest-running ads" basis="Observed" rowBasis={row=>[row.all,row.yours,row.competitors].some(hasValue)?row.basis:"Unavailable"} meta={metadata(data,productionSelection)} rows={measures.filter(row=>row.known)} rowKey={row=>row.id} onRow={row=>window.location.assign(evidenceUrl(data.library.brand.id,{...productionSelection,...(row.known?{measure:row.id==="duration"?"duration" as const:"talkingKnown" as const}:{})}))} columns={[
        {key:"measure",label:"Measure",value:row=>row.label},
        {key:"all",label:"Longest running",value:row=>row.all,render:row=><EvidenceNumber value={row.all} data={data} basis={row.basis} selection={{...productionSelection,measure:row.id==="duration"?"duration":"talkingKnown"}}/>},
        {key:"yours",label:"Yours",value:row=>row.yours,render:row=><EvidenceNumber value={row.yours} data={data} basis={row.basis} selection={{...productionSelection,show:"yours",measure:row.id==="duration"?"duration":"talkingKnown"}}/>},
        {key:"competitors",label:"Competitors",value:row=>row.competitors,render:row=><EvidenceNumber value={row.competitors} data={data} basis={row.basis} selection={{...productionSelection,show:"competitors",measure:row.id==="duration"?"duration":"talkingKnown"}}/>}
      ]}/>
    </SectionCard>
  </>;
}
const actions=[{name:"Test now",when:"It wins often in the category and you use it 15 or more points less.",what:"A brief with three variants, linked to supporting ads."},{name:"Scale",when:"Your own winners sit where competitors barely go.",what:"More versions of the concept and new creators."},{name:"Fix",when:"You use it a lot but win less than the category.",what:"New hooks or formats for the same idea."},{name:"Reduce",when:"It wins rarely everywhere and you overuse it.",what:"Move budget to stronger tests."},{name:"Watch",when:"A competitor idea is new or rising in the saved week.",what:"Record it and check whether it keeps rising."}] as const;
export function PatternsScreen({data,selection,dimension,onDimension}:ScreenProps&DimensionProps) {
  if(data.library.presentation)return <PatternsReadModel library={data.library} model={data.library.presentation}/>;
  dimension=validDimension(dimension);
  const rows=comparisonGroups(data.library.creatives,dimension,selection);
  return <>
    <SectionCard title="You against the category" help="Select a row to see its ads" actions={<DimensionSwitch value={dimension} onChange={onDimension} first="hook"/>} empty={!rows.length&&{reason:"No supported labels are saved for this comparison.",href:analysisUrl(data.library.brand.id),linkLabel:"Run analysis"}}>
      <DataTable caption="Recorded creative patterns" basis="Modelled" meta={metadata(data,selection)} rows={rows} rowKey={row=>row.value} onRow={row=>window.location.assign(evidenceUrl(data.library.brand.id,row.selection))} columns={[
        {key:"value",label:dimension==="claim"?"Claim type":plainEnum(dimension),value:row=>dimensionLabel(dimension,row.value)},
        {key:"mix",label:"Category and you",value:row=>row.yourShare??row.competitorShare,render:row=><ComparisonBars yours={row.yourShare} competitors={row.competitorShare} onYours={()=>window.location.assign(evidenceUrl(data.library.brand.id,{...row.selection,show:"yours"}))} onCompetitors={()=>window.location.assign(evidenceUrl(data.library.brand.id,{...row.selection,show:"competitors"}))}/>},
        {key:"gap",label:"Usage gap (points)",value:row=>row.gap,render:row=><EvidenceNumber value={row.gap} data={data} basis="Modelled" selection={row.selection}/>},
        {key:"win",label:"Category win rate",value:()=>null,unavailable:()=>({reason:"Working Score is not built."})},
        {key:"demand",label:"Customer demand",value:()=>null,unavailable:()=>({reason:"Review grouping is not available yet."})},
        {key:"roas",label:"Your ROAS",value:()=>null,unavailable:()=>({reason:"Your comparisons by creative label are not available yet."})},
        {key:"action",label:"Action",value:()=>null,unavailable:()=>({reason:"Recommendations appear once creative results and customer needs can be compared."})}
      ]}/>
    </SectionCard>
    <SectionCard title="What each action means" >
      <div className="research-action-grid">{actions.map(item=><article key={item.name}><StatusChip status={item.name}/><p><strong>When:</strong> {item.when}</p><p><strong>Exter suggests:</strong> {item.what}</p></article>)}</div>
    </SectionCard>
  </>;
}
export function AudienceScreen({data,selection}:ScreenProps) {
  if(data.library.presentation)return <AudienceReadModel library={data.library} model={data.library.presentation}/>;
  const audience=audienceReachTable(data.library,selection);
  const quotes=data.research?.facts.filter(fact=>fact.label==="Customer review displayed by the brand")||[];
  const brands=brandSnapshots(data.library,data.window,selection.platform);
  const voices=brands.map(brand=>({...brand,...brandVoice(data.library.creatives,{...selection,brand:brand.id,kind:"active"})}));
  const researchHref=`/?view=brands&brandId=${encodeURIComponent(data.library.brand.id)}`;
  return <>
    <SectionCard title="Customer voice" help="Saved quotes from the brand website" empty={!quotes.length&&{reason:data.researchFailed?"Saved customer evidence could not be read.":"No source-linked customer reviews are saved.",href:researchHref,linkLabel:"Review brand sources"}}>
      <div className="research-review-grid">{quotes.map((quote,index)=><blockquote key={`${quote.sourceUrl}:${index}`}><p>{quote.quote}</p><SafeLink href={quote.sourceUrl}>Published source</SafeLink> <DataLabel basis="Observed"/></blockquote>)}</div>

    </SectionCard>
    <SectionCard title="Words customers use" empty={{reason:"Exact phrase counts will appear when review grouping is available.",href:researchHref,linkLabel:"View saved quotes"}}/>
    <SectionCard title="Who the ads reach" help="Published ad-library reach · Observed, not inferred" meta={metadata(data,selection)} empty={!audience.rows.length&&{reason:"No published demographic reach breakdown is available. Audience demographics are never inferred.",href:`/?view=data&brandId=${encodeURIComponent(data.library.brand.id)}`,linkLabel:"Review public sources"}}>
      <Caveat>Published lifetime reach counts at the saved check, summed across ads without deduplicating people. Age columns sum only published gender cells; missing cells are excluded, never counted as zero. Women shows published female reach. These are reached audiences, not targeting choices.</Caveat>
      <DataTable caption="Published age and gender reach" basis="Observed" rows={audience.rows} rowKey={r=>r.key} onRow={r=>window.location.assign(evidenceUrl(data.library.brand.id,{...selection,brand:r.brandId,kind:"all",demographicCountry:r.country}))} columns={[
        {key:"brand",label:"Brand",value:r=>r.brand,render:r=><><BrandText size={16}>{r.brand}</BrandText><small className="source-gives">{r.country==="GB"?"United Kingdom":r.country}</small></>},
        ...audience.ages.map(age=>({key:age,label:age,align:"number" as const,value:(r:typeof audience.rows[number])=>r.ages[age],render:(r:typeof audience.rows[number])=><a className="read-model-heat" href={evidenceUrl(data.library.brand.id,{...selection,brand:r.brandId,kind:"all",demographicCountry:r.country,reachAge:age})}>{number(r.ages[age],0)}</a>})),
        {key:"women",label:"Women",align:"number",value:r=>r.women,render:r=><a href={evidenceUrl(data.library.brand.id,{...selection,brand:r.brandId,kind:"all",demographicCountry:r.country,reachGender:"female"})}>{number(r.women,0)}</a>}
      ]}/>

    </SectionCard>
    <SectionCard title="How each brand talks" help="Tone, typical claim and call to action across each brand's active ads" empty={!voices.some(row=>row.claim||row.cta||row.offer)&&{reason:"No supported creative language analysis is saved.",href:analysisUrl(data.library.brand.id),linkLabel:"Run analysis"}}>
      <DataTable caption="Saved brand language" basis="Modelled" rowBasis={row=>[row.claim,row.offer,row.cta].some(hasValue)?"Modelled":"Unavailable"} meta={metadata(data,{...selection,kind:"active"})} rows={voices.filter(row=>[row.claim,row.offer,row.cta].some(hasValue))} rowKey={row=>row.id} onRow={row=>window.location.assign(evidenceUrl(data.library.brand.id,{...selection,brand:row.id,kind:"active"}))} columns={[{key:"brand",label:"Brand",value:row=>row.name},{key:"tone",label:"Tone",value:()=>null,unavailable:()=>({reason:"No explicit tone field is saved. Audience traits are not inferred from creative style."})},{key:"claim",label:"Typical recorded claim",value:row=>row.claim},{key:"offer",label:"Recorded offer",value:row=>row.offer?dimensionLabel("offer",row.offer):null},{key:"cta",label:"Call to action",value:row=>row.cta}]}/>
    </SectionCard>
  </>;
}
export function WinnersScreen({data,selection}:ScreenProps) {
  if(data.library.presentation)return <WinnersReadModel library={data.library} model={data.library.presentation}/>;
  const rows=longestRunning(data.library.creatives,selection);
  return <>
    <SectionCard title="Longest running" help="Working Score, labels, confidence and public signal scores are not available yet. Longest running is shown instead." empty={!rows.length&&{reason:"No supported source running durations are saved.",href:`/?view=settings&brandId=${encodeURIComponent(data.library.brand.id)}#demo-collection`,linkLabel:"Review collection"}}>
      <DataTable caption="Longest-running saved creatives" basis="Observed" meta={metadata(data,{...selection,kind:"running"})} rows={rows} rowKey={row=>row.adId} onRow={row=>window.location.assign(evidenceUrl(data.library.brand.id,{...selection,ad:row.adId}))} columns={[
        {key:"creative",label:"Creative",value:row=>creativeTitle(row),render:row=><CreativeRow row={row} showId/>},{key:"brand",label:"Brand",value:row=>row.brandName},{key:"format",label:"Format",value:row=>row.creativeFormat?plainEnum(row.creativeFormat):null,basis:()=>"Modelled"},
        {key:"days",label:"Days running",value:row=>row.daysRunning,render:row=><EvidenceNumber data={data} value={row.daysRunning} selection={{...selection,ad:row.adId}}/>}
      ]}/>
    </SectionCard>
    <SectionCard title="Your account winners" empty={{reason:"Your own winners appear once your ad account is connected and synced and winner comparisons are available.",href:`/?view=data&brandId=${encodeURIComponent(data.library.brand.id)}`,linkLabel:"Review owned sources"}}/>
  </>;
}
