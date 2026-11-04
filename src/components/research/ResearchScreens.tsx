import { brandVoice, brandSnapshots, comparisonGroups, evidenceUrl, launchShareTrend, longestRunning, mixGroups, productionFacts, selectResearchAds, RESEARCH_DIMENSIONS, type ResearchDimension, type EvidenceSelection, type BrandSnapshot } from "../../../shared/creative-research";
import { adCount, analysisUrl, creativeTitle, plainEnum, ukDate } from "../../../shared/creative-presentation";
import { BarList, Heatmap, SectionCard, DataTable, DataLabel, StatusChip, Unavailable } from "../ui";
import { CreativeTile, DimensionSwitch, EvidenceNumber, Measure, SafeLink, dimensionLabel, metadata, number, percent, type ScreenProps } from "./common";

interface DimensionProps {dimension:ResearchDimension;onDimension:(dimension:ResearchDimension)=>void}
const validDimension=(value:ResearchDimension)=>RESEARCH_DIMENSIONS.includes(value)?value:"format";
export function CompetitorsScreen({data,selection,dimension,onDimension}:ScreenProps&DimensionProps) {
  dimension=validDimension(dimension);
  const brands=brandSnapshots(data.library,data.window,selection.platform);
  const metrics=[{id:"active",label:"Active at capture"},{id:"launched",label:"New in saved week"},{id:"stopped",label:"Stopped in saved week"},{id:"medianDays",label:"Median days running"},{id:"shareActive",label:"Share of active ads"},{id:"winnerShare",label:"Proven winner share"},{id:"estimatedSpend",label:"Estimated spend"}] as const;
  const selectionFor=(brand:BrandSnapshot,id:string)=>id in brand?(brand[id as keyof BrandSnapshot] as {selection:EvidenceSelection}).selection:{...selection,brand:brand.id};
  const values=brands.map(brand=>mixGroups(data.library.creatives,dimension,{...selection,brand:brand.id,kind:"active"}));
  const labels=[...new Set(values.flatMap(value=>value.groups.map(group=>group.value)))];
  const analysis={href:analysisUrl(data.library.brand.id),linkLabel:"Run analysis"};
  const collect={href:`/?view=settings&brandId=${encodeURIComponent(data.library.brand.id)}#demo-collection`,linkLabel:"Collect competitor ads"};
  return <>
    <SectionCard title="Scorecard" help="Observed source snapshots. Missing brands and unknown fields stay unavailable; earlier active snapshots are not inferred." meta={metadata(data,selection)}>
      <DataTable caption="You and configured competitors" basis="Observed" rows={metrics} rowKey={row=>row.id} onRow={row=>window.location.assign(evidenceUrl(data.library.brand.id,{...selection,kind:row.id==="launched"?"launches":row.id==="stopped"?"stopped":row.id==="medianDays"?"running":"active",activityFrom:data.window.from||undefined,activityTo:data.window.to||undefined}))} columns={[
        {key:"measure",label:"Measure",value:row=>row.label},...brands.map(brand=>({key:brand.id,label:brand.workspaceBrand?`You · ${brand.name}`:brand.name,value:(row:typeof metrics[number])=>row.id==="winnerShare"||row.id==="estimatedSpend"?null:brand[row.id].value,render:(row:typeof metrics[number])=>row.id!=="winnerShare"&&row.id!=="estimatedSpend"?<Measure data={data} metric={brand[row.id]} suffix={row.id==="shareActive"?"%":""}/>:null,unavailable:(row:typeof metrics[number])=>({reason:row.id==="winnerShare"?"The Working Score is not built.":row.id==="estimatedSpend"?"Public reach and approved spend ranges are unavailable.":"This configured brand has no comparable captured measure."})}))
      ]}/>
      <p className="research-note">Status counts use the last recorded capture. Share needs complete status coverage across the configured set. Competitor private outcomes are never shown.</p>
    </SectionCard>
    <SectionCard title="Creative mix by brand" help="Share of each brand's active captured ads with a recorded label. Missing classifications remain in the denominator." actions={<DimensionSwitch value={dimension} onChange={onDimension}/>} empty={!labels.length&&{reason:"No supported labels are saved for the active captured sample.",...analysis}}>
      <Heatmap label="Recorded creative mix" basis="Modelled" columns={brands.map(brand=>brand.name)} rows={labels.map(value=>({id:value,label:dimensionLabel(dimension,value),values:values.map(group=>group.sample&&group.classified?(group.groups.find(item=>item.value===value)?.share||0):null)}))} meta={metadata(data,{...selection,kind:"active"})} onSelect={(value,column)=>window.location.assign(evidenceUrl(data.library.brand.id,{...selection,brand:brands[column].id,kind:"active",dimension,value}))}/>
      <div className="research-coverage-list">{brands.map((brand,index)=><p key={brand.id}>{brand.name}: <EvidenceNumber data={data} value={brand.available?values[index].classified:null} selection={{...selection,brand:brand.id,kind:"active",dimension,value:"classified"}}/> classified; <EvidenceNumber data={data} value={brand.available?values[index].unclassified:null} selection={{...selection,brand:brand.id,kind:"active",dimension,value:"unclassified"}}/> unclassified.</p>)}</div>
    </SectionCard>
    <SectionCard title="What each competitor leans on" help="Most common supported labels, with example source ads. Counts describe the saved sample, not success." meta={metadata(data,{...selection,show:"competitors"})} empty={!brands.some(brand=>!brand.workspaceBrand&&brand.available)&&{reason:"Configured competitor evidence has not been collected.",...collect}}>
      <div className="research-competitor-grid">{brands.filter(brand=>!brand.workspaceBrand).map(brand=>{
        const groups=mixGroups(data.library.creatives,dimension,{...selection,brand:brand.id,kind:"active"});
        return <article className="research-competitor-card" key={brand.id}><h3>{brand.name}</h3>{groups.groups.length?<><BarList label={`Recorded ${dimension} labels`} basis="Observed" items={groups.groups.slice(0,3).map(group=>({id:group.value,label:dimensionLabel(dimension,group.value),value:group.count}))} meta={metadata(data,{...selection,brand:brand.id,kind:"active"})} onSelect={value=>window.location.assign(evidenceUrl(data.library.brand.id,{...selection,brand:brand.id,kind:"active",dimension,value}))}/><div className="research-creative-grid">{longestRunning(data.library.creatives,{...selection,brand:brand.id,dimension,value:groups.groups[0].value,kind:"active"},3).map(row=><CreativeTile key={row.adId} row={row} workspaceId={data.library.brand.id}/>)}</div></>:<Unavailable reason={brand.available?"This sample has no supported analysis labels.":"No captured sample is saved."} {...(brand.available?{href:analysisUrl(brand.id,undefined,data.library.brand.id),linkLabel:"Run analysis"}:collect)}/>}</article>;
      })}</div>
    </SectionCard>
  </>;
}
export function FormatsScreen({data,selection}:ScreenProps) {
  const groups=comparisonGroups(data.library.creatives,"format",selection),coverage=mixGroups(data.library.creatives,"format",selection);
  const analysis={href:analysisUrl(data.library.brand.id),linkLabel:"Run analysis"};
  const productionSelection={...selection,kind:"running" as const,take:"5"};
  const all=productionFacts(data.library.creatives,productionSelection),own=productionFacts(data.library.creatives,{...productionSelection,show:"yours"}),competitors=productionFacts(data.library.creatives,{...productionSelection,show:"competitors"});
  const measures=[{id:"duration",label:"Median video length (seconds)",known:all.duration!==null,all:all.duration,yours:own.duration,competitors:competitors.duration,basis:"Observed" as const},{id:"talking",label:"Talking to camera (%)",known:all.talkingShare!==null,all:all.talkingShare,yours:own.talkingShare,competitors:competitors.talkingShare,basis:"Modelled" as const},{id:"hook",label:"Measured hook length",known:false,all:null,yours:null,competitors:null,basis:"Unavailable" as const},{id:"captions",label:"Captions on",known:false,all:null,yours:null,competitors:null,basis:"Unavailable" as const},{id:"presence",label:"Person on camera",known:false,all:null,yours:null,competitors:null,basis:"Unavailable" as const}];
  return <>
    <SectionCard title="Format league table" help="Recorded creative formats. Shares use the full captured sample; unknown labels stay in the denominator. Category win rate is unavailable until Working Score exists." empty={!groups.length&&{reason:"No supported format analysis is saved.",...analysis}}>
      <DataTable caption="Format use in the saved category" basis="Modelled" meta={metadata(data,selection)} rows={groups} rowKey={row=>row.value} onRow={row=>window.location.assign(evidenceUrl(data.library.brand.id,row.selection))} columns={[
        {key:"format",label:"Format",value:row=>dimensionLabel("format",row.value)},
        {key:"you",label:"Your ads",value:row=>row.yours,render:row=><EvidenceNumber value={row.yours} data={data} selection={{...row.selection,show:"yours"}}/>},
        {key:"market",label:"Competitor ads",value:row=>row.competitors,render:row=><EvidenceNumber value={row.competitors} data={data} selection={{...row.selection,show:"competitors"}}/>},
        {key:"yourShare",label:"Your share",value:row=>row.yourShare,render:row=><EvidenceNumber value={row.yourShare} suffix="%" data={data} basis="Modelled" selection={{...row.selection,show:"yours"}}/>},
        {key:"marketShare",label:"Competitor share",value:row=>row.competitorShare,render:row=><EvidenceNumber value={row.competitorShare} suffix="%" data={data} basis="Modelled" selection={{...row.selection,show:"competitors"}}/>},
        {key:"days",label:"Median days",value:row=>row.medianDays,render:row=><EvidenceNumber value={row.medianDays} data={data} selection={{...row.selection,kind:"running"}}/>},
        {key:"trend",label:"Launch-share trend (points)",value:row=>launchShareTrend(data.library.creatives,"format",row.value,data.window,selection),render:row=><EvidenceNumber data={data} basis="Modelled" value={launchShareTrend(data.library.creatives,"format",row.value,data.window,selection)} selection={{...row.selection,kind:"launches",activityFrom:data.window.previousFrom||undefined,activityTo:data.window.to||undefined}}/>},
        {key:"win",label:"Category win rate",value:()=>null,unavailable:()=>({reason:"Working Score is not built yet."})},
        {key:"roas",label:"Your format ROAS",value:()=>null,unavailable:()=>({reason:"Format-level owned comparisons require CA-07; private outcomes are never inferred."})}
      ]}/>
      <p className="research-note">Launch-share trend compares explicit source starts in two equal windows, not reconstructed historical active totals. Unclassified ads: <EvidenceNumber value={coverage.unclassified} data={data} selection={{...selection,dimension:"format",value:"unclassified"}}/>.</p>
    </SectionCard>
    <SectionCard title="How longest-running ads are built" help="Five longest-running saved creatives in each group. This replaces the design's winner comparison until Working Score exists. No measured hook length, captions or person-presence fields are inferred." empty={!measures.some(item=>item.known)&&{reason:"No supported production measurements are saved for these creatives.",...analysis}}>
      <DataTable caption="Production evidence from longest-running ads" basis="Observed" meta={metadata(data,productionSelection)} rows={measures} rowKey={row=>row.id} onRow={row=>window.location.assign(evidenceUrl(data.library.brand.id,{...productionSelection,...(row.known?{measure:row.id==="duration"?"duration" as const:"talkingKnown" as const}:{})}))} columns={[
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
  dimension=validDimension(dimension);
  const rows=comparisonGroups(data.library.creatives,dimension,selection);
  return <>
    <SectionCard title="You against the category" help="Usage gap is competitors' recorded share minus yours, in percentage points. No Priority or action is assigned without its full calculation." actions={<DimensionSwitch value={dimension} onChange={onDimension}/>} empty={!rows.length&&{reason:"No supported labels are saved for this comparison.",href:analysisUrl(data.library.brand.id),linkLabel:"Run analysis"}}>
      <DataTable caption="Recorded creative patterns" basis="Modelled" meta={metadata(data,selection)} rows={rows} rowKey={row=>row.value} onRow={row=>window.location.assign(evidenceUrl(data.library.brand.id,row.selection))} columns={[
        {key:"value",label:dimension==="claim"?"Claim type":plainEnum(dimension),value:row=>dimensionLabel(dimension,row.value)},
        {key:"you",label:"Your share",value:row=>row.yourShare,render:row=><EvidenceNumber value={row.yourShare} suffix="%" data={data} basis="Modelled" selection={{...row.selection,show:"yours"}}/>},
        {key:"market",label:"Competitor share",value:row=>row.competitorShare,render:row=><EvidenceNumber value={row.competitorShare} suffix="%" data={data} basis="Modelled" selection={{...row.selection,show:"competitors"}}/>},
        {key:"gap",label:"Usage gap (points)",value:row=>row.gap,render:row=><EvidenceNumber value={row.gap} data={data} basis="Modelled" selection={row.selection}/>},
        {key:"win",label:"Category win rate",value:()=>null,unavailable:()=>({reason:"Working Score is not built."})},
        {key:"demand",label:"Customer demand",value:()=>null,unavailable:()=>({reason:"Review themes and their links to creative needs are not built."})},
        {key:"roas",label:"Your ROAS",value:()=>null,unavailable:()=>({reason:"Dimension-level owned comparisons require CA-07."})},
        {key:"action",label:"Action",value:()=>null,unavailable:()=>({reason:"Priority needs win rate, usage gap and customer demand. No action is inferred."})}
      ]}/>
    </SectionCard>
    <SectionCard title="What each action means" help="Definitions only. They are not recommendations for the current sample.">
      <div className="research-action-grid">{actions.map(item=><article key={item.name}><StatusChip status={item.name}/><p><strong>When:</strong> {item.when}</p><p><strong>Exter suggests:</strong> {item.what}</p></article>)}</div>
    </SectionCard>
  </>;
}
export function AudienceScreen({data,selection}:ScreenProps) {
  const quotes=data.research?.facts.filter(fact=>fact.label==="Customer review displayed by the brand")||[];
  const brands=brandSnapshots(data.library,data.window,selection.platform);
  const voices=brands.map(brand=>({...brand,...brandVoice(data.library.creatives,{...selection,brand:brand.id,kind:"active"})}));
  const researchHref=`/?view=brands&brandId=${encodeURIComponent(data.library.brand.id)}`;
  return <>
    <SectionCard title="Customer voice" help="Exact customer quotes displayed by the brand. Publisher-supplied, not independently verified; no theme grouping is inferred." empty={!quotes.length&&{reason:data.researchFailed?"Saved customer evidence could not be read.":"No source-linked customer reviews are saved.",href:researchHref,linkLabel:"Review brand sources"}}>
      <div className="research-review-grid">{quotes.map((quote,index)=><blockquote key={`${quote.sourceUrl}:${index}`}><p>{quote.quote}</p><SafeLink href={quote.sourceUrl}>Published source</SafeLink> <DataLabel basis="Observed"/></blockquote>)}</div>
      {data.research&&ukDate(data.research.observedAt)&&<p className="research-note">Source checked {ukDate(data.research.observedAt)}. Needs, objections, outcomes and desires remain ungrouped until the review-theme item is built.</p>}
    </SectionCard>
    <SectionCard title="Words customers use" empty={{reason:"Phrase counts need the review-theme calculation.",href:researchHref,linkLabel:"View saved quotes"}}/>
    <SectionCard title="Who the ads reach" empty={{reason:"No published demographic reach breakdown is available. Audience demographics are never inferred.",href:`/?view=data&brandId=${encodeURIComponent(data.library.brand.id)}`,linkLabel:"Review public sources"}}/>
    <SectionCard title="How each brand talks" help="Saved machine-read claims, offers and CTA text in active captured ads. Tone is unavailable unless explicitly recorded." empty={!voices.some(row=>row.claim||row.cta||row.offer)&&{reason:"No supported creative language analysis is saved.",href:analysisUrl(data.library.brand.id),linkLabel:"Run analysis"}}>
      <DataTable caption="Saved brand language" basis="Modelled" meta={metadata(data,{...selection,kind:"active"})} rows={voices} rowKey={row=>row.id} onRow={row=>window.location.assign(evidenceUrl(data.library.brand.id,{...selection,brand:row.id,kind:"active"}))} columns={[{key:"brand",label:"Brand",value:row=>row.name},{key:"tone",label:"Tone",value:()=>null,unavailable:()=>({reason:"No explicit tone field is saved. Audience traits are not inferred from creative style."})},{key:"claim",label:"Typical recorded claim",value:row=>row.claim},{key:"offer",label:"Recorded offer",value:row=>row.offer?dimensionLabel("offer",row.offer):null},{key:"cta",label:"Call to action",value:row=>row.cta}]}/>
    </SectionCard>
  </>;
}
export function WinnersScreen({data,selection}:ScreenProps) {
  const rows=longestRunning(data.library.creatives,selection);
  return <>
    <SectionCard title="Working Score" empty={{reason:"Working Score and confidence are not calculated yet. Longest running is shown instead.",href:evidenceUrl(data.library.brand.id,{...selection,kind:"running"},{sort:"days"}),linkLabel:"Explore saved ads"}}/>
    <SectionCard title="Longest running" help="Observed source-endpoint longevity. This is not a sales, performance or winner ranking." empty={!rows.length&&{reason:"No supported source running durations are saved.",href:`/?view=settings&brandId=${encodeURIComponent(data.library.brand.id)}#demo-collection`,linkLabel:"Review collection"}}>
      <DataTable caption="Longest-running saved creatives" basis="Observed" meta={metadata(data,{...selection,kind:"running"})} rows={rows} rowKey={row=>row.adId} onRow={row=>window.location.assign(evidenceUrl(data.library.brand.id,{...selection,ad:row.adId}))} columns={[
        {key:"creative",label:"Creative",value:row=>creativeTitle(row),render:row=><span className="research-table-title" title={creativeTitle(row)}>{creativeTitle(row)}</span>},{key:"brand",label:"Brand",value:row=>row.brandName},{key:"format",label:"Format",value:row=>row.creativeFormat?plainEnum(row.creativeFormat):null,basis:()=>"Modelled"},
        {key:"label",label:"Working label",value:()=>null,unavailable:()=>({reason:"Working Score is not built; no Proven winner or Rising label is assigned."})},{key:"score",label:"Working Score",value:()=>null},{key:"confidence",label:"Confidence",value:()=>null},
        {key:"survival",label:"Survival",value:()=>null},{key:"scaling",label:"Scaling",value:()=>null},{key:"reach",label:"Reach velocity",value:()=>null},{key:"organic",label:"Organic response",value:()=>null},
        {key:"days",label:"Days running",value:row=>row.daysRunning,render:row=><EvidenceNumber data={data} value={row.daysRunning} selection={{...selection,ad:row.adId}}/>}
      ]}/>
    </SectionCard>
    <SectionCard title="Your account winners" empty={{reason:"The owned winners board requires CA-06. No winner, margin or calibration result is inferred from saved account metrics.",href:`/?view=data&brandId=${encodeURIComponent(data.library.brand.id)}`,linkLabel:"Review owned sources"}}/>
  </>;
}
