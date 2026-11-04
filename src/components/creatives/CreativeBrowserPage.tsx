import { useEffect, useState } from "react";
import { Grid2X2, List, Search, RotateCcw } from "lucide-react";
import { browserFilters, filterBrowserCreatives, type BrowserFilters, type BrowserCreative, type CreativeBrowserResponse } from "../../../shared/creative-browser";
import { NAVIGATION_EVENT, openCreativeRoute, type resolveNavigation } from "../../navigation";
import { adCount, creativeTitle, creativeSecondary, plainEnum, ukDate } from "../../../shared/creative-presentation";
import { api } from "../../lib/api";
import { PageHeader, FilterBar, CreativeCard, DataTable, DataLabel, MetaLine, EmptyState, Unavailable, type UnavailableProps } from "../ui";
import { CreativeDetailPage } from "./CreativeDetailPage";
import { cardMetrics, creativeMeta, onlyCohort, metricReason } from "./presentation";
import "./CreativeBrowserPage.css";
export function CreativeBrowserPage({ brandId, route, refresh }: {
    brandId: string;
    route: ReturnType<typeof resolveNavigation>;
    refresh: number;
}) {
    const [data, setData] = useState<CreativeBrowserResponse | null>(null), [error, setError] = useState(false), [loading, setLoading] = useState(true), [attempt, setAttempt] = useState(0), [expanded, setExpanded] = useState(() => window.innerWidth >= 720);
    const filters = browserFilters(route.url.searchParams);
    useEffect(() => { const media = window.matchMedia("(min-width:720px)"); const update = () => setExpanded(media.matches); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
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
    const values = (field: keyof BrowserCreative) => [...new Set(data.creatives.map(row => row[field]).filter((value): value is string => typeof value === "string" && Boolean(value) && value !== "unknown" && value !== "Unavailable"))].sort();
    const select = (key: keyof BrowserFilters, label: string, options: string[] | {
        value: string;
        label: string;
    }[]) => <label key={key}>{label}<select aria-label={label} value={filters[key] || (key === "sort" ? "newest" : "all")} onChange={event => change({ [key]: event.target.value })}>{key !== "sort" && <option value="all">All</option>}{options.map(item => typeof item === "string" ? <option key={item} value={item}>{plainEnum(item)}</option> : <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>;
    const meta = { sampleSize: rows.length, from: data.dateRange.from, to: data.dateRange.to, lastChecked: data.lastChecked };
    const coverage=data.sources.filter(source=>!["complete","succeeded","collected"].includes(source.status));
    const missingOwned=rows.filter(row=>row.workspaceBrand&&cardMetrics(row,filters.cohort).some(metric=>metric.value===null));
    const ambiguous=missingOwned.find(row=>row.performance.length>1&&!filters.cohort);
    const ownedGap:UnavailableProps=data.ownedStatus==="error"?{reason:"Saved owned metrics could not be read.",action:{label:"Retry",onClick:()=>setAttempt(value=>value+1)}}:data.ownedStatus==="not_configured"?{reason:"Owned metrics are not synced.",href:`/?view=data&brandId=${encodeURIComponent(brandId)}`,linkLabel:"Connect account"}:ambiguous?{reason:"Choose one account reporting scope to see owned metrics.",action:{label:"Choose scope",onClick:()=>open(ambiguous)}}:{reason:"Some owned metrics lack reported data or the minimum sample in this date range.",action:{label:"Change dates",onClick:()=>setExpanded(true)}};
    return <div className="creative-browser"><PageHeader title="Creatives" subtitle="Every ad from you and your competitors, read and tagged the same way." actions={<div className="creative-layout-toggle" role="group" aria-label="Creative layout"><button aria-pressed={filters.layout !== "table"} onClick={() => change({ layout: "grid" })}><Grid2X2 size={16}/> Grid</button><button aria-pressed={filters.layout === "table"} onClick={() => change({ layout: "table" })}><List size={16}/> Table</button></div>}/>
    <section id="creative-filters" className="creative-filter-card" aria-label="Creative filters"><div className="creative-filter-top"><div className="creative-show" role="group" aria-label="Show creatives"><span>Show</span>{[["all", "Both"], ["yours", "Yours"], ["competitors", "Competitors"]].map(([value, label]) => <button key={value} aria-pressed={(filters.show || "all") === value} onClick={() => change({ show: value })}>{label} <span>{data.creatives.filter(row => value === "all" || value === "yours" && row.workspaceBrand || value === "competitors" && !row.workspaceBrand).length}</span></button>)}<DataLabel basis="Observed"/></div><label className="creative-search"><Search size={16}/><span className="sr-only">Search copy, transcript and on-screen text</span><input type="search" value={filters.search || ""} placeholder="Search copy, transcript, on-screen text" onChange={event => change({ search: event.target.value })}/></label>{select("sort", "Sort", [{ value: "newest", label: "Last observed" }, { value: "days", label: "Days running" }, { value: "title", label: "Ad title" }])}</div>
    <details className="creative-advanced-filters" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}><summary>Filters</summary><FilterBar label="Filter stored creatives">{select("brand", "Brand", [...new Map(data.creatives.map(row => [row.brandId, { value: row.brandId, label: row.brandName }])).values()])}{select("platform", "Platform", values("platform"))}{select("format", "Format", [...new Set([...values("creativeFormat"), ...values("mediaKind")])])}{select("hook", "Hook", values("hookType"))}{select("angle", "Angle", values("angle"))}{select("offer", "Offer", values("offerType"))}{select("ugc", "UGC", [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unknown", label: "Unavailable" }])}{select("status", "Status at capture", [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "unknown", label: "Unavailable" }])}<label>Observed from<input type="date" value={filters.from || ""} max={filters.to} onChange={event => change({ from: event.target.value })}/></label><label>Observed to<input type="date" value={filters.to || ""} min={filters.from} onChange={event => change({ to: event.target.value })}/></label><button className="button secondary" onClick={() => change(Object.fromEntries(Object.keys(filters).map(key => [key, ""])))}><RotateCcw size={14}/> Reset</button></FilterBar></details>
    <div className="creative-results"><span><button onClick={() => change({ show: filters.show || "all" })}>{adCount(rows.length)}</button> <DataLabel basis="Observed"/></span><span>Saved evidence only. Dates filter source observations and the owned reporting window.</span></div><MetaLine {...meta}/><p className="creative-note">Owned outcomes: {ukDate(data.reportingRange.from)} to {ukDate(data.reportingRange.to)}. Account, currency and attribution scopes stay separate.</p>{filters.cohort&&<div className="creative-note">One account reporting scope is selected. <button className="button secondary" onClick={()=>change({cohort:""})}>Clear reporting scope</button></div>}</section>
    {coverage.length>0&&<section className="creative-source-notes" aria-label="Source coverage"><Unavailable label="" reason={coverage.map(source=>`${source.name}: ${source.status==="not-started"?"not collected":plainEnum(source.status).toLowerCase()}`).join("; ")+"."} {...(coverage.some(source=>source.status==="error")?{action:{label:"Retry",onClick:()=>setAttempt(value=>value+1)}}:{href:`/?view=settings&brandId=${encodeURIComponent(brandId)}#demo-collection`,linkLabel:"Collect competitor ads"})}/></section>}
    {(missingOwned.length>0||data.ownedStatus==="error")&&<section className="creative-owned-gap" aria-label="Owned metrics availability"><Unavailable label="" {...ownedGap}/></section>}
    {filters.layout === "table" ? <DataTable<BrowserCreative> caption="Stored creatives" basis="Observed" rows={rows} rowKey={row => row.adId} onRow={open} meta={meta} columns={[
                { key: "title", label: "Creative", value: row => creativeTitle(row), sortable: true }, { key: "brand", label: "Source", value: row => row.workspaceBrand ? `You · ${row.brandName}` : row.brandName, sortable: true },
                { key: "platform", label: "Platform", value: row => plainEnum(row.platform), sortable: true }, { key: "format", label: "Format", value: row => row.creativeFormat?plainEnum(row.creativeFormat):null, basis: () => "Modelled", sortable: true },
                { key: "hook", label: "Hook", value: row => row.hookType?plainEnum(row.hookType):null, basis: () => "Modelled", sortable: true }, { key: "angle", label: "Angle", value: row => row.angle?plainEnum(row.angle):null, basis: () => "Modelled", sortable: true },
                { key: "offer", label: "Offer", value: row => row.offerType?plainEnum(row.offerType):null, basis:()=>"Modelled", sortable:true },
                { key: "duration", label:"Duration (seconds)",value:row=>row.durationSeconds,sortable:true },
                { key: "days", label: "Days running", value: row => row.daysRunning, sortable: true }, ...(["Spend", "ROAS", "Hook rate"] as const).map(label => ({ key: label, label, unavailable:(row:BrowserCreative)=>({label:data.ownedStatus!=="error"&&row.workspaceBrand&&!row.performance.length?"Not synced" as const:"Unavailable" as const,reason:row.workspaceBrand?data.ownedStatus==="error"?"Saved owned metrics could not be read.":metricReason(onlyCohort(row,filters.cohort)?.metrics[label]):"Private competitor outcomes are not public.",unlock:row.workspaceBrand?"A successful owned sync in one reporting scope unlocks eligible values.":"Only your authorised accounts can supply private outcomes.",...(row.workspaceBrand?{href:`/?view=data&brandId=${encodeURIComponent(brandId)}`}:{})}), value: (row: BrowserCreative) => row.workspaceBrand ? cardMetrics(row,filters.cohort).find(metric => metric.label === label)?.value : null, render: (row: BrowserCreative) => <>{cardMetrics(row,filters.cohort).find(metric => metric.label === label)?.value}</> }))
            ]}/> : rows.length ? <div className="creative-browser-grid">{rows.map(row => <CreativeCard key={row.adId} title={creativeTitle(row)} secondary={creativeSecondary(row)} thumbnail={row.thumbnailUrl} duration={row.durationSeconds} source={row.workspaceBrand ? `You · ${row.brandName}` : row.brandName} format={row.creativeFormat?plainEnum(row.creativeFormat):null} tags={[row.hookType, row.angle, row.offerType].filter((value): value is string => Boolean(value)).map(plainEnum)} metrics={cardMetrics(row,filters.cohort).map(metric=>data.ownedStatus==="error"&&row.workspaceBrand?{...metric,missingLabel:"Unavailable" as const,reason:"Saved owned metrics could not be read. Retry the saved-data request."}:metric)} meta={onlyCohort(row,filters.cohort)?{sampleSize:1,from:onlyCohort(row,filters.cohort)!.from,to:onlyCohort(row,filters.cohort)!.to,lastChecked:onlyCohort(row,filters.cohort)!.lastChecked}:creativeMeta(row)} onOpen={() => open(row)}/>)}</div> : data.sources.some(source=>source.status==="error")?<Unavailable reason="Saved source records could not be read for this selection." action={{label:"Retry",onClick:()=>setAttempt(value=>value+1)}}/>: <EmptyState title="No ads match these filters" description="Change the filters to explore other saved creatives. Missing source data is listed above." action={{ label: "Clear filters", onClick: () => change(Object.fromEntries(Object.keys(filters).map(key => [key, ""]))) }}/>}
  </div>;
}
