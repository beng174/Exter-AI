import { Caveat } from "../ui/Caveat";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import type { BrowserCreative, CreativeBrowserResponse } from "../../../shared/creative-browser";
import { creativeUrl, similarPublicCreatives } from "../../../shared/creative-browser";
import { analysisUrl, creativeTitle, creativeSecondary, plainEnum, ukDate, adCount } from "../../../shared/creative-presentation";
import type { MetricName } from "../../../shared/owned-metrics";
import type { VideoField } from "../../../shared/video-analysis";
import type { ImageField } from "../../../shared/image-analysis";
import { closeCreativeRoute, NAVIGATION_EVENT } from "../../navigation";
import { PageHeader, SectionCard, MetricTile, DataLabel, MetaLine, Unavailable, CreativeCard, DataTable, RetentionChart, ExpandableCopy, hasValue, type UnavailableProps } from "../ui";
import { cardMetrics, creativeMeta, metricReason, metricText, timestamp } from "./presentation";
import "./CreativeDetailPage.css";

type EvidenceField=VideoField<string|boolean>|ImageField<string|boolean>;
interface DetailProps {data:CreativeBrowserResponse;filtered:BrowserCreative[];onOpen:(row:BrowserCreative)=>void;onRefresh?:()=>void}
export function CreativeDetailPage({data,adId,filtered,onOpen,onRefresh}:DetailProps&{adId:string}) {
  const row=data.creatives.find(item=>item.adId===adId);
  if(!row)return <div className="creative-browser"><PageHeader title="Creative detail"/><SectionCard title="Saved creative" empty={{reason:"This creative is not in the workspace's saved evidence.",href:creativeUrl(window.location.href,data.brand.id),linkLabel:"Back to Creatives"}}/></div>;
  return <Detail key={row.adId} row={row} data={data} filtered={filtered} onOpen={onOpen} onRefresh={onRefresh}/>;
}
function Detail({row,data,filtered,onOpen,onRefresh}:DetailProps&{row:BrowserCreative}) {
  const video=useRef<HTMLVideoElement>(null);
  const [mediaError,setMediaError]=useState(false),[slide,setSlide]=useState(0),[scope,setScope]=useState(row.performance.length===1?row.performance[0].id:"");
  useEffect(()=>{window.scrollTo(0,0);},[row.adId]);
  const own=row.workspaceBrand&&row.owned,cohort=own?row.performance.find(item=>item.id===scope):undefined;
  const index=filtered.findIndex(item=>item.adId===row.adId),title=creativeTitle(row);
  const meta=creativeMeta(row),fields=row.analysis?.fields,videoFields=row.analysis?.mediaKind==="video"?row.analysis.fields:null;
  const analysisMeta={...meta,from:row.analysis?.createdAt,to:row.analysis?.createdAt,lastChecked:row.analysis?.createdAt};
  const ownedMeta={sampleSize:cohort?1:null,from:cohort?.from,to:cohort?.to,lastChecked:cohort?.lastChecked};
  const retentionMeta={...ownedMeta,sampleSize:cohort?.benchmarkSampleSize};
  const library=creativeUrl(window.location.href,data.brand.id);
  const original={href:row.sourceUrl||library,linkLabel:row.sourceUrl?"Open original ad":"Back to Creatives"};
  const analyse={href:analysisUrl(row.brandId,row.nativeId,data.brand.id),linkLabel:"Run analysis"};
  const connect={href:`/?view=data&brandId=${encodeURIComponent(data.brand.id)}`,linkLabel:"Connect account"};
  const dates={href:library,linkLabel:"Change dates"};
  const retry={action:{label:"Retry",onClick:onRefresh||(()=>window.location.reload())}};
  const collection={href:`/?view=settings&brandId=${encodeURIComponent(data.brand.id)}#demo-collection`,linkLabel:"Collect competitor ads"};
  const evidence=()=>document.getElementById("creative-source")?.scrollIntoView({behavior:"smooth"});
  const seek=(seconds:number)=>{if(video.current&&!mediaError){video.current.currentTime=seconds;video.current.focus();video.current.scrollIntoView({behavior:"smooth",block:"center"});}};
  const renderField=(field:EvidenceField|undefined,isEnum=false)=>{
    if(!hasValue(field?.value))return <Unavailable compact reason="This field was not recorded in the saved analysis."/>;
    const value=typeof field!.value==="boolean"?(field!.value?"Yes":"No"):isEnum?plainEnum(String(field!.value)):String(field!.value);
    return <><strong>{value}</strong> <DataLabel basis="Modelled"/>{field&&"timestamps" in field&&field.timestamps.map((time,index)=><button className="creative-time" key={index} disabled={!row.videoUrl||mediaError} onClick={()=>seek(time.startSeconds)}>{timestamp(time.startSeconds)} to {timestamp(time.endSeconds)}</button>)}{field&&"imageIndices" in field&&field.imageIndices.map(number=><button className="creative-time" key={number} disabled={!row.imageUrls[number-1]||mediaError} onClick={()=>{setSlide(number-1);document.getElementById("creative-media")?.scrollIntoView({behavior:"smooth"});}}>Slide {number} · Modelled</button>)}</>;
  };
  const history=(label:string,value:string|number|null)=> <div key={label}><dt>{label}</dt><dd>{hasValue(value)?<><button className="creative-evidence-value" onClick={evidence}>{value}</button></>:<Unavailable compact reason={`The saved source did not include ${label.toLowerCase()}. View the original ad.`}/>}</dd></div>;
  const transcript=videoFields?.audio_segments?videoFields.audio_segments.filter(segment=>segment.kind==="spoken"&&hasValue(segment.text)).map(segment=>({value:segment.text,confidence:segment.confidence,timestamps:[{startSeconds:segment.startSeconds,endSeconds:segment.endSeconds}]})):["music-only","silent"].includes(String(videoFields?.audio_type?.value))?[]:videoFields?.spokenTranscript||[];
  const spoken=transcript.filter(field=>hasValue(field.value)),onScreen=fields?.onScreenText.filter(field=>hasValue(field.value))||[];
  const tags=Object.entries(fields?.tags||{});
  const readings:{label:string;field?:EvidenceField;isEnum?:boolean}[]=fields?[
    {label:"Format",field:fields.format,isEnum:true},{label:"Hook",field:fields.hook},{label:"Hook type",field:fields.hook_type,isEnum:true},
    {label:"Angle",field:fields.angle,isEnum:true},{label:"Angle evidence",field:fields.angle_explanation},
    {label:"Offer",field:fields.offer_type,isEnum:true},{label:"Offer evidence",field:"offer_explanation" in fields?fields.offer_explanation:"offer" in fields?fields.offer:undefined},
    {label:"CTA",field:fields.cta},{label:"Audio",field:videoFields?.audio_type,isEnum:true}
  ]:[];
  const claims=fields?.keyClaims.filter(claim=>hasValue(claim.value))||[];
  const similar=similarPublicCreatives(row,data.creatives);
  const openMarket=()=>{const url=new URL(library,window.location.origin);["search","brand","platform","hook","offer","ugc","status","cohort"].forEach(key=>url.searchParams.delete(key));url.searchParams.set("show","competitors");for(const [key,value] of [["angle",row.angle],["format",row.creativeFormat]]){if(value)url.searchParams.set(key!,value);else url.searchParams.delete(key!);}window.history.pushState({},"",url);window.dispatchEvent(new Event(NAVIGATION_EVENT));};
  const openBenchmark=()=>{if(!cohort)return;const url=new URL(library,window.location.origin);["brand","search","format","hook","angle","offer","ugc","status"].forEach(key=>url.searchParams.delete(key));url.searchParams.set("show","yours");url.searchParams.set("cohort",cohort.id);url.searchParams.set("from",cohort.from);url.searchParams.set("to",cohort.to);window.history.pushState({},"",url);window.dispatchEvent(new Event(NAVIGATION_EVENT));};
  const retentionNames:MetricName[]=["Retention 25%","Retention 50%","Retention 75%","Retention 95%","Retention 100%"];
  const hasRetention=Boolean(cohort&&retentionNames.some(name=>hasValue(cohort.metrics[name].value)||hasValue(cohort.benchmark[name].value)));
  const performanceGap:UnavailableProps=data.ownedStatus==="error"?{reason:"Saved owned metrics could not be read.",...retry}:data.ownedStatus==="not_configured"?{reason:"Owned metrics are not synced.",...connect}:{reason:"No owned rows for this ad in this date range.",...dates};
  const scoreGap:UnavailableProps=row.scoreError?{reason:"The saved checklist could not be read.",...retry}:{reason:fields?"The saved fields do not support a checklist score.":"No saved analysis supports a checklist score.",...analyse};
  const unknownMatch=!row.angle&&!row.creativeFormat;
  const marketGap:UnavailableProps|false=unknownMatch?{reason:"An analysed angle or format is needed to find similar ads.",...analyse}:similar.length?false:data.sources.some(source=>source.status==="error")?{reason:"Saved competitor evidence could not be read.",...retry}:data.sources.some(source=>!["complete","succeeded","collected"].includes(source.status))?{reason:"Configured competitor ads are not fully collected.",...collection}:{label:"",reason:"No similar competitor ads in this saved sample.",href:`/?view=creatives&brandId=${encodeURIComponent(data.brand.id)}&show=competitors`,linkLabel:"Browse competitor ads"};
  const hasReadings=readings.some(item=>hasValue(item.field?.value))||claims.length>0;
  return <div className="creative-detail creative-browser">
    <PageHeader title={title} subtitle={<>{plainEnum(row.platform)}{row.mediaKind!=="unknown"?` · ${plainEnum(row.mediaKind)}`:""}{row.deliveryStartAt?` · running since ${ukDate(row.deliveryStartAt)}`:""}{row.sourceUrl&&<> · <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer">Open in {row.platform==="Meta"?"Meta Ad Library":"ad library"}</a></>}</>} eyebrow={<a href={library} onClick={event=>{if(!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();closeCreativeRoute(data.brand.id);}}}>Creatives</a>} actions={<>
      <button className="button secondary" aria-label="Previous creative" disabled={index<=0} onClick={()=>onOpen(filtered[index-1])}><ArrowLeft size={18}/></button>
      <button className="button secondary" aria-label="Next creative" disabled={index<0||index===filtered.length-1} onClick={()=>onOpen(filtered[index+1])}><ArrowRight size={18}/></button>
      <a className="button secondary" href="#creative-market">Compare with market</a><button className="button primary" disabled title="Adding saved creatives to briefs is not available yet.">Add to brief</button>
    </>}/>
    <div className="creative-detail-columns">
      <div className="creative-detail-media-column">
        {!mediaError&&(row.videoUrl||row.imageUrls[slide])?<div className="creative-media" id="creative-media">{row.videoUrl?<video ref={video} controls playsInline preload="metadata" poster={row.thumbnailUrl||undefined} src={row.videoUrl} onError={()=>setMediaError(true)} aria-label={`Saved video: ${title}`}/>:<img src={row.imageUrls[slide]} alt={`Saved creative${row.imageUrls.length>1?`, slide ${slide+1}`:""}`} onError={()=>setMediaError(true)}/>}</div>:<div id="creative-media" className="creative-media" role="region" aria-label="Creative media"><Unavailable label="" reason={mediaError?"The retained file could not be displayed.":"No retained media file is available."} {...original}/></div>}
        {row.imageUrls.length>1&&<div className="creative-slide-controls" role="group" aria-label="Creative slides">{row.imageUrls.map((_,index)=><button key={index} aria-pressed={slide===index} onClick={()=>{setSlide(index);setMediaError(false);}}>Slide {index+1} · Observed</button>)}</div>}
        <SectionCard title="Scenes · jump to a moment" meta={analysisMeta} empty={!row.scenes.length&&{reason:"No scene boundaries are stored in this analysis.",...original}}>
          <div className="creative-scenes">{row.scenes.map((scene,index)=><button key={index} disabled={!row.videoUrl||mediaError} onClick={()=>seek(scene.startSeconds)}><strong>{timestamp(scene.startSeconds)}</strong><span>{scene.label}</span><DataLabel basis="Modelled"/></button>)}</div>
        </SectionCard>
        <div id="creative-source"><SectionCard title="Source and running history"  actions={<DataLabel basis="Observed"/>} meta={meta}>
          <dl className="creative-history">
            {history("Source",plainEnum(row.platform))}{history("First seen",ukDate(row.firstObservedAt))}{history("Last seen",ukDate(row.observedAt))}
            {history("Delivery start",ukDate(row.deliveryStartAt))}{history("Delivery stop",!row.deliveryStopAt&&row.deliveryStatus==="active"?"Still running":ukDate(row.deliveryStopAt))}
            {history("Days running",row.daysRunning)}{history("Status at capture",row.deliveryStatus&&row.deliveryStatus!=="unknown"?plainEnum(row.deliveryStatus):null)}
            {history("Placements",row.placements.length?row.placements.map(plainEnum).join(", "):null)}{history("Source CTA",null)}
          </dl>
          {row.daysRunningBasis&&ukDate(row.daysRunningAsOf)&&<Caveat>Days since the source-listed start, as of {ukDate(row.daysRunningAsOf)}. Status reflects the last saved capture, not verified continuous delivery.</Caveat>}
          <h3>Ad copy <DataLabel basis="Observed"/></h3><ExpandableCopy text={row.copy} truncated={row.copyTruncated} sourceUrl={row.sourceUrl}/>
        </SectionCard></div>
      </div>
      <div className="creative-detail-evidence-column">
        <SectionCard title="Performance" help={row.workspaceBrand?"Your saved account outcomes":"Public signals only"} meta={row.workspaceBrand?ownedMeta:meta} empty={row.workspaceBrand&&!cohort&&row.performance.length===0?performanceGap:!row.workspaceBrand&&!hasValue(row.daysRunning)?{reason:"The source did not supply running history.",...original}:false}>
          {own&&row.performance.length>0&&<label className="creative-scope">Reporting scope<select aria-label="Reporting scope" value={scope} onChange={event=>setScope(event.target.value)}><option value="">Choose one account and reporting scope</option>{row.performance.map(item=><option key={item.id} value={item.id}>{plainEnum(item.platform)} · {item.accountId} · {item.currency} · {plainEnum(item.attribution)} · {plainEnum(item.conversionEvent)} · {ukDate(item.from)} to {ukDate(item.to)}</option>)}</select></label>}
          {!row.workspaceBrand?<MetricTile label="Days running" value={row.daysRunning} basis="Observed" onEvidence={evidence}/>:cohort?<><div className="creative-performance">{(["Spend","ROAS","CPA","Hook rate","Hold rate","Frequency"] as const).map(name=><MetricTile key={name} label={name} value={metricText(cohort.metrics[name],name,cohort.currency)} basis="Observed" onEvidence={evidence} reason={metricReason(cohort.metrics[name])}/>)}</div>
            <Caveat>{cohort.currency} · {plainEnum(cohort.attribution)} · {plainEnum(cohort.conversionEvent)}. Benchmark: all ads in the same account and dates. Missing values lack required data or the minimum sample.</Caveat></>:<Unavailable reason="Choose one account scope to see its metrics." label=""/>}
        </SectionCard>

        <SectionCard title="Creative score" help="Best-practice checklist · Estimated, rules-based" meta={{...analysisMeta,lastChecked:row.score?.analysedAt||analysisMeta.lastChecked}} empty={!row.score&&scoreGap}>
          {row.score&&<><MetricTile label="Creative score out of 100" value={row.score.score} basis="Estimated" onEvidence={evidence} reason="Known checklist evidence is insufficient to calculate a score."/>
            <Caveat>{row.score.method}{row.score.provisional?" Provisional: some criteria are unknown.":""}</Caveat>
            <div className="creative-checklist">{row.score.criteria.map(criterion=><article key={criterion.id}><strong>{criterion.label}</strong>{criterion.status==="unknown"?<Unavailable compact reason={criterion.explanation}/>:<><span>{criterion.status==="met"?"Met":"Not met"}</span><p>{criterion.explanation}</p><DataLabel basis="Estimated"/>{criterion.evidence.map((item,index)=><div key={index}><p>{item.quote}</p>{item.timestamps?.map((time,i)=><button className="creative-time" key={i} disabled={!row.videoUrl||mediaError} onClick={()=>seek(time.startSeconds)}>{timestamp(time.startSeconds)} to {timestamp(time.endSeconds)}</button>)}</div>)}</>}</article>)}</div>
          </>}
        </SectionCard>
        {row.workspaceBrand&&<SectionCard title="Viewer retention"  meta={retentionMeta} empty={!hasRetention&&{reason:!cohort?"No owned retention data is selected.":"No retention counts were reported in this date range.",...(!cohort&&data.ownedStatus==="not_configured"?connect:dates)}}>
          {cohort&&hasRetention&&<><RetentionChart points={retentionNames.map(name=>({label:name,creative:cohort.metrics[name].value,benchmark:cohort.benchmark[name].value}))} onCreative={evidence} onBenchmark={openBenchmark}/>
            <DataTable caption="Retention checkpoints" basis="Observed" meta={retentionMeta} rows={retentionNames.map(name=>({name,creative:metricText(cohort.metrics[name],name),benchmark:metricText(cohort.benchmark[name],name)}))} rowKey={item=>item.name} columns={[{key:"name",label:"Checkpoint",value:item=>item.name},{key:"creative",label:"This creative",value:item=>item.creative},{key:"benchmark",label:"Account benchmark",value:item=>item.benchmark}]} onRow={openBenchmark}/>
          </>}
        </SectionCard>}
        <SectionCard title="What is said and shown" help="Transcript and on-screen text with timestamps" meta={analysisMeta} empty={!spoken.length&&!onScreen.length&&!tags.some(([,field])=>hasValue(field.value))&&{reason:fields?"No speech, on-screen text or tags were recorded.":"No saved analysis supports this section.",...analyse}}>
          <h3>Spoken transcript</h3>{spoken.length?<ol className="creative-evidence-lines">{spoken.map((field,index)=><li key={index}>{renderField(field)}</li>)}</ol>:<Unavailable compact reason="No spoken words were recorded. Song lyrics are excluded from speech."/>}
          <h3>On-screen text</h3>{onScreen.length?<ol className="creative-evidence-lines">{onScreen.map((field,index)=><li key={index}>{renderField(field)}</li>)}</ol>:<Unavailable compact reason="No on-screen text was recorded."/>}
          <h3>Tags</h3>{tags.length?tags.map(([name,field])=><div className="creative-tag-field" key={name}>{plainEnum(name)}: {renderField(field)}</div>):<Unavailable compact reason="No supported tags were recorded."/>}
        </SectionCard>
        <SectionCard title="How Exter reads it"  meta={analysisMeta} empty={!hasReadings&&{reason:"No supported creative readings were saved.",...analyse}}>
          <div className="creative-readings">{readings.map(item=><div key={item.label}><h3>{item.label}</h3>{renderField(item.field,item.isEnum)}</div>)}</div>
          <h3>Claims</h3>{claims.length?claims.map((claim,index)=><div className="creative-claim" key={index}>{renderField(claim)}<p>Claim types: {claim.claim_type?.length?claim.claim_type.map(plainEnum).join(", "):<Unavailable compact reason="No claim type was recorded."/>}</p>{claim.may_need_substantiation_asa&&<p className="creative-claim-note">This claim may need substantiation (ASA). Keep supporting evidence on file.</p>}</div>):<Unavailable compact reason="No supported claims were recorded."/>}
          {row.analysis&&<Caveat>Analysis saved {ukDate(row.analysis.createdAt)}. Human review is not implied.</Caveat>}
        </SectionCard>
        <div id="creative-market"><SectionCard title="In the market" help="How your competitors use the same hook and angle" meta={{sampleSize:similar.length,from:data.dateRange.from,to:data.dateRange.to,lastChecked:data.lastChecked}} empty={marketGap}>
          <button className="creative-evidence-value" onClick={openMarket}>{adCount(similar.length)} with similar creative labels</button> <DataLabel basis="Observed"/>
          <div className="creative-similar-grid">{similar.slice(0,3).map(item=><CreativeCard key={item.adId} title={creativeTitle(item)} secondary={creativeSecondary(item)} thumbnail={item.thumbnailUrl} source={item.brandName} duration={item.durationSeconds} format={item.creativeFormat?plainEnum(item.creativeFormat):null} tags={[item.hookType,item.angle].filter((value):value is string=>Boolean(value)).map(plainEnum)} metrics={cardMetrics(item)} meta={creativeMeta(item)} onOpen={()=>onOpen(item)}/>)}</div>
        </SectionCard></div>
      </div>
    </div>
  </div>;
}
