import { Caveat } from "../ui/Caveat";
import { Disabled } from "../workspace/ActionWorkspace";
import { useEffect, useState } from "react";
import { browserFilters, filterBrowserCreatives, type BrowserFilters, type BrowserCreative, type CreativeBrowserResponse } from "../../../shared/creative-browser";
import { NAVIGATION_EVENT, openCreativeRoute, type resolveNavigation } from "../../navigation";
import { creativeTitle, creativeSecondary, plainEnum, ukDate } from "../../../shared/creative-presentation";
import { api } from "../../lib/api";
import { PageHeader, CreativeCard, DataTable, DataLabel, MetaLine, EmptyState, Unavailable, type UnavailableProps } from "../ui";
import { CreativeFilters } from "./CreativeFilters";
import { CreativeDetailPage } from "./CreativeDetailPage";
import { cardMetrics, creativeMeta, onlyCohort, metricReason } from "./presentation";
import "./CreativeBrowserPage.css";
export function CreativeBrowserPage({ brandId, route, refresh }: {
    brandId: string;
    route: ReturnType<typeof resolveNavigation>;
    refresh: number;
}) {
    const [data, setData] = useState<CreativeBrowserResponse | null>(null), [error, setError] = useState(false), [loading, setLoading] = useState(true), [attempt, setAttempt] = useState(0), [datesOpen, setDatesOpen] = useState(false), [visibleCount,setVisibleCount]=useState(8);
    const filters = browserFilters(route.url.searchParams);
    useEffect(()=>setVisibleCount(8),[JSON.stringify(filters)]);
    useEffect(() => {
        let active = true;
        setLoading(true);
        setError(false);
        const query = new URLSearchParams();
        if (filters.from)
            query.set("from", filters.from);
        if (filters.to)
            query.set("to", filters.to);
        api<CreativeBrowserResponse>(`/api/brands/${encodeURIComponent(brandId)}/creatives?${query}`).then(value => { if (active)
            setData(value); }).catch(() => { if (active) {
            setData(null);
            setError(true);
        } }).finally(() => { if (active)
            setLoading(false); });
        return () => { active = false; };
    }, [brandId, filters.from, filters.to, refresh, attempt]);
    const change = (patch: BrowserFilters) => { const url = new URL(window.location.href); for (const [key, value] of Object.entries(patch)) {
        if (!value || value === "all")
            url.searchParams.delete(key);
        else
            url.searchParams.set(key, value);
    } window.history.pushState({}, "", url); window.dispatchEvent(new Event(NAVIGATION_EVENT)); };
    if (error)
        return <div className="creative-browser"><PageHeader title={route.id === "creative" ? "Creative detail" : "Creatives"}/><Unavailable reason="Saved creative evidence could not be read." action={{label:"Retry",onClick:()=>setAttempt(value=>value+1)}}/><button className="button secondary" onClick={() => change({ from: "", to: "" })}>Clear dates and retry</button></div>;
    if (loading || !data)
        return <div className="creative-browser" aria-busy="true"><PageHeader title={route.id === "creative" ? "Creative detail" : "Creatives"}/><p role="status">Reading saved creative evidence…</p></div>;
    const rows = filterBrowserCreatives(data.creatives, filters), open = (row: BrowserCreative) => openCreativeRoute(row.adId, brandId);
    if (route.id === "creative")
        return <CreativeDetailPage data={data} adId={route.adId!} filtered={rows} onOpen={open} onRefresh={()=>setAttempt(value=>value+1)}/>;
    const meta = { sampleSize: rows.length, from: data.dateRange.from, to: data.dateRange.to, lastChecked: data.lastChecked };
    const coverage=data.sources.filter(source=>!["complete","succeeded","collected"].includes(source.status));
    const missingOwned=rows.filter(row=>row.workspaceBrand&&cardMetrics(row,filters.cohort).some(metric=>metric.value===null));
    const ambiguous=missingOwned.find(row=>row.performance.length>1&&!filters.cohort);
    const ownedGap:UnavailableProps=data.ownedStatus==="error"?{reason:"Saved owned metrics could not be read.",action:{label:"Retry",onClick:()=>setAttempt(value=>value+1)}}:data.ownedStatus==="not_configured"?{reason:"Owned metrics are not synced.",href:`/?view=data&brandId=${encodeURIComponent(brandId)}`,linkLabel:"Connect account"}:ambiguous?{reason:"Choose one account reporting scope to see owned metrics.",action:{label:"Choose scope",onClick:()=>open(ambiguous)}}:{reason:"Some owned metrics lack reported data or the minimum sample in this date range.",action:{label:"Change dates",onClick:()=>setDatesOpen(true)}};
    return <div className="creative-browser"><PageHeader title="Creatives" subtitle="Every ad from you and your competitors, read and tagged the same way." actions={<div className="creative-header-actions"><div className="creative-layout-toggle" role="group" aria-label="Creative layout"><button aria-pressed={filters.layout !== "table"} onClick={() => change({ layout: "grid" })}>Grid</button><button aria-pressed={filters.layout === "table"} onClick={() => change({ layout: "table" })}>Table</button></div><Disabled reason="Creative CSV export is not available yet.">Export CSV</Disabled></div>}/>
    <CreativeFilters creatives={data.creatives} filters={filters} onChange={change} datesOpen={datesOpen} onDatesOpen={setDatesOpen}/>
    <div className="creative-results"><span>Showing {filters.layout === "table" ? rows.length : Math.min(visibleCount, rows.length)} of {rows.length} · {rows.slice(0, filters.layout === "table" ? rows.length : visibleCount).filter(row=>row.workspaceBrand).length} yours, {rows.slice(0, filters.layout === "table" ? rows.length : visibleCount).filter(row=>!row.workspaceBrand).length} from competitors <DataLabel basis="Observed"/></span><span>{data.dateRange.from&&data.dateRange.to?`${ukDate(data.dateRange.from)} to ${ukDate(data.dateRange.to)}`:""}</span></div>
    {(missingOwned.length>0||data.ownedStatus==="error")&&<div className="creative-owned-gap" role="region" aria-label="Owned metrics availability"><Unavailable label="" {...ownedGap}/></div>}
    <Caveat><p>Owned account outcomes: {ukDate(data.reportingRange.from)} to {ukDate(data.reportingRange.to)}. Account, currency, attribution and conversion-event scopes stay separate.</p><MetaLine {...meta}/>{coverage.length>0&&<p>{coverage.map(source=>`${source.name}: ${source.status==="not-started"?"not collected":plainEnum(source.status)}`).join("; ")}</p>}</Caveat>
    {filters.layout === "table" ? <DataTable<BrowserCreative> caption="Stored creatives" basis="Observed" rows={rows} rowKey={row => row.adId} onRow={open} meta={meta} columns={[
                { key: "title", label: "Creative", value: row => creativeTitle(row), sortable: true }, { key: "brand", label: "Source", value: row => row.workspaceBrand ? `You · ${row.brandName}` : row.brandName, sortable: true },
                { key: "platform", label: "Platform", value: row => plainEnum(row.platform), sortable: true }, { key: "format", label: "Format", value: row => row.creativeFormat?plainEnum(row.creativeFormat):null, basis: () => "Modelled", sortable: true },
                { key: "hook", label: "Hook", value: row => row.hookType?plainEnum(row.hookType):null, basis: () => "Modelled", sortable: true }, { key: "angle", label: "Angle", value: row => row.angle?plainEnum(row.angle):null, basis: () => "Modelled", sortable: true },
                { key: "offer", label: "Offer", value: row => row.offerType?plainEnum(row.offerType):null, basis:()=>"Modelled", sortable:true },
                { key: "duration", label:"Duration (seconds)",value:row=>row.durationSeconds,sortable:true },
                { key: "days", label: "Days running", value: row => row.daysRunning, sortable: true }, ...(["Spend", "ROAS", "Hook rate"] as const).map(label => ({ key: label, label, unavailable:(row:BrowserCreative)=>({label:data.ownedStatus!=="error"&&row.workspaceBrand&&!row.performance.length?"Not synced" as const:"Unavailable" as const,reason:row.workspaceBrand?data.ownedStatus==="error"?"Saved owned metrics could not be read.":metricReason(onlyCohort(row,filters.cohort)?.metrics[label]):"Private competitor outcomes are not public.",unlock:row.workspaceBrand?"A successful owned sync in one reporting scope unlocks eligible values.":"Only your authorised accounts can supply private outcomes.",...(row.workspaceBrand?{href:`/?view=data&brandId=${encodeURIComponent(brandId)}`}:{})}), value: (row: BrowserCreative) => row.workspaceBrand ? cardMetrics(row,filters.cohort).find(metric => metric.label === label)?.value : null, render: (row: BrowserCreative) => <>{cardMetrics(row,filters.cohort).find(metric => metric.label === label)?.value}</> }))
            ]}/> : rows.length ? <div className="creative-browser-grid">{rows.slice(0,visibleCount).map(row => <CreativeCard key={row.adId} title={creativeTitle(row)} secondary={creativeSecondary(row)} thumbnail={row.thumbnailUrl} duration={row.durationSeconds} source={row.workspaceBrand ? `You · ${row.brandName}` : row.brandName} facts={[plainEnum(row.platform),row.mediaKind!=="unknown"?plainEnum(row.mediaKind):null,row.deliveryStartAt?`since ${ukDate(row.deliveryStartAt)}`:null].filter(Boolean).join(" · ")} format={row.creativeFormat?plainEnum(row.creativeFormat):null} tags={[row.hookType, row.angle, row.offerType].filter((value): value is string => Boolean(value)).map(plainEnum)} metrics={cardMetrics(row,filters.cohort).map(metric=>data.ownedStatus==="error"&&row.workspaceBrand?{...metric,missingLabel:"Unavailable" as const,reason:"Saved owned metrics could not be read. Retry the saved-data request."}:metric)} meta={onlyCohort(row,filters.cohort)?{sampleSize:1,from:onlyCohort(row,filters.cohort)!.from,to:onlyCohort(row,filters.cohort)!.to,lastChecked:onlyCohort(row,filters.cohort)!.lastChecked}:creativeMeta(row)} onOpen={() => open(row)}/>)}</div> : data.sources.some(source=>source.status==="error")?<Unavailable reason="Saved source records could not be read for this selection." action={{label:"Retry",onClick:()=>setAttempt(value=>value+1)}}/>: <EmptyState title="No ads match these filters" description="Change the filters to explore other saved creatives. Missing source data is listed above." action={{ label: "Clear filters", onClick: () => change(Object.fromEntries(Object.keys(filters).map(key => [key, ""]))) }}/>}
    {filters.layout!=="table"&&rows.length>visibleCount&&<div className="creative-show-more"><button className="button secondary" onClick={()=>setVisibleCount(value=>value+24)}>Show {Math.min(24,rows.length-visibleCount)} more</button></div>}
  </div>;
}
