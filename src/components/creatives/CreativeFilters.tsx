import { CalendarDays, ChevronDown, Plus, RotateCcw, Search } from "lucide-react";
import { plainEnum, ukDate } from "../../../shared/creative-presentation";
import type { BrowserCreative, BrowserFilters } from "../../../shared/creative-browser";
import "./CreativeFilters.css";

type Option = string | { value: string; label: string };
export function CreativeFilters({ creatives, filters, onChange, datesOpen, onDatesOpen }: {
    creatives: readonly BrowserCreative[];
    filters: BrowserFilters;
    onChange: (patch: BrowserFilters) => void;
    datesOpen: boolean;
    onDatesOpen: (open: boolean) => void;
}) {
    const values = (field: keyof BrowserCreative) => [...new Set(creatives.map(row => row[field]).filter((value): value is string => typeof value === "string" && Boolean(value) && !["unknown", "Unavailable"].includes(value)))].sort();
    const select = (key: keyof BrowserFilters, label: string, options: Option[]) => <label className="creative-filter-pill" key={key}>
        <span className="sr-only">{label}</span>
        <select aria-label={label} value={filters[key] || "all"} onChange={event => onChange({ [key]: event.target.value })}>
            <option value="all">{label}: All</option>
            {options.map(item => { const option = typeof item === "string" ? { value: item, label: plainEnum(item) } : item; return <option key={option.value} value={option.value}>{label}: {option.label}</option>; })}
        </select>
    </label>;
    const selectedDates = [filters.from, filters.to].map(date => date ? ukDate(date)?.replace(/ \d{4}$/, "") : null);
    const dateLabel = selectedDates.some(Boolean) ? `${selectedDates[0] || "Any start"} to ${selectedDates[1] || "Any end"}` : null;
    return <section id="creative-filters" className="creative-filter-card" aria-label="Creative filters">
        <div className="creative-filter-top">
            <div className="creative-show" role="group" aria-label="Show creatives">{[["yours", "Yours"], ["competitors", "Competitors"], ["all", "Both"]].map(([value, label]) => <button key={value} aria-pressed={(filters.show || "all") === value} onClick={() => onChange({ show: value })}>{label} <span>{creatives.filter(row => value === "all" || value === "yours" && row.workspaceBrand || value === "competitors" && !row.workspaceBrand).length}</span></button>)}</div>
            <label className="creative-search"><Search size={16} aria-hidden="true"/><span className="sr-only">Search copy, transcript and on-screen text</span><input type="search" value={filters.search || ""} placeholder="Search transcripts, on-screen text and ad copy" onChange={event => onChange({ search: event.target.value })}/></label>
            <label className="creative-sort">Sort by<select aria-label="Sort" value={filters.sort || "newest"} onChange={event => onChange({ sort: event.target.value })}><option value="newest">Last observed</option><option value="days">Days running</option><option value="title">Ad title</option></select></label>
        </div>
        <div className="creative-filter-pills">
            <details className="creative-date-filter" open={datesOpen} onToggle={event => onDatesOpen(event.currentTarget.open)}>
                <summary><CalendarDays size={14} aria-hidden="true"/>Date range{dateLabel ? `: ${dateLabel}` : ""}<ChevronDown size={14} aria-hidden="true"/></summary>
                <div className="creative-filter-panel"><label>Observed from<input type="date" value={filters.from || ""} max={filters.to} onChange={event => onChange({ from: event.target.value })}/></label><label>Observed to<input type="date" value={filters.to || ""} min={filters.from} onChange={event => onChange({ to: event.target.value })}/></label><button onClick={() => { onChange({ from: "", to: "" }); onDatesOpen(false); }}>All dates</button><button onClick={() => onDatesOpen(false)}>Done</button></div>
            </details>
            {select("brand", "Brand", [...new Map(creatives.map(row => [row.brandId, { value: row.brandId, label: row.brandName }])).values()])}
            {select("format", "Format", [...new Set([...values("creativeFormat"), ...values("mediaKind")])])}
            {select("hook", "Hook", values("hookType"))}
            {select("angle", "Angle", values("angle"))}
            {select("offer", "Offer", values("offerType"))}
            {select("ugc", "UGC with proof", [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unknown", label: "Unavailable" }])}
            <details className="creative-extra-filters"><summary>Add filter<Plus size={14} aria-hidden="true"/></summary><div className="creative-filter-panel">{!filters.platform && select("platform", "Platform", values("platform"))}{!filters.status && select("status", "Status at capture", [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "unknown", label: "Unavailable" }])}<button onClick={() => onChange(Object.fromEntries(Object.keys(filters).filter(key => key !== "layout").map(key => [key, ""])))}><RotateCcw size={14} aria-hidden="true"/>Reset filters</button></div></details>
            {filters.platform && select("platform", "Platform", values("platform"))}
            {filters.status && select("status", "Status at capture", [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "unknown", label: "Unavailable" }])}
        </div>
    </section>;
}
