import {similarCompetitors,mediaFormat} from "./public-comparisons.js";
import type { DemoGalleryCreative } from "./creative-gallery.js";
import type { DemoAdScore } from "./brand-demo.js";
import { measurementEligible, selectResearchAds, type EvidenceSelection } from "./creative-research.js";
import { creativeTitle } from "./creative-presentation.js";
import {countryReach,type PublicReach,type PublicAdDetails,type MetaSourceHealth} from "./meta-public.js";
import type { OwnedMetric, MetricName } from "./owned-metrics.js";
export interface CreativePerformance {
    id: string;
    accountId: string;
    platform: string;
    currency: string;
    attribution: string;
    conversionEvent: string;
    from: string;
    to: string;
    lastChecked: string | null;
    benchmarkSampleSize: number;
    metrics: Record<MetricName, OwnedMetric>;
    benchmark: Record<MetricName, OwnedMetric>;
}
import type { WorkspacePresentation, CreativePresentation } from "./workspace-presentation.js";
export interface BrowserCreative extends DemoGalleryCreative {
    previewState?:import("./ad-media.js").PreviewState;
    adFormat?:"video"|"static_image"|"carousel"|"catalogue"|null;
    headlines?:string[];
    landingPaths?:string[];
    productCategories?:string[]|null;
    productCategoryModel?:string;
    categorySourceHash?:string;
    publicReach?:PublicReach;
    publicDetails?:PublicAdDetails;
    reachObservedAt?:string;
    platform: string;
    publicEvidence?:boolean;
    presentation?:CreativePresentation;
    owned: boolean;
    workspaceBrand: boolean;
    sourceKind: "public" | "owned";
    placements: string[];
    score: DemoAdScore | null;
    scoreError?: boolean;
    performance: CreativePerformance[];
    scenes: {
        startSeconds: number;
        label: string;
    }[];
}
export interface CreativeCompetitor { key:string;brandId:string|null;name:string;status:string }
export interface CreativeBrowserResponse {
    mediaReadStatus?:"available"|"unavailable"|"not_configured";
    categoryReadStatus?:"available"|"unavailable"|"not_configured";
    metaSource?:MetaSourceHealth;
    presentation?:WorkspacePresentation;
    conversation?:{question:string;answer:string;sources:string[]}[];
    competitors:CreativeCompetitor[];
    brand: {
        id: string;
        name: string;
        domain: string;
        primaryCategories?:string[];
    };
    creatives: BrowserCreative[];
    sources: {
        brandId: string | null;
        name: string;
        status: string;
        message?: string;
    }[];
    ownedStatus: "available" | "not_configured" | "error";
    dateRange: {
        from: string | null;
        to: string | null;
    };
    lastChecked: string | null;
    reportingRange: {
        from: string;
        to: string;
    };
}
export interface BrowserFilters extends EvidenceSelection {
    cohort?: string;
    show?: string;
    brand?: string;
    platform?: string;
    format?: string;
    hook?: string;
    angle?: string;
    offer?: string;
    ugc?: string;
    status?: string;
    from?: string;
    to?: string;
    search?: string;
    sort?: string;
    layout?: string;
    similarTo?:string;
}
export const BROWSER_FILTERS = ["similarTo","category","adFormat","demographicCountry","reachAge","reachGender","reachCountry","measure","take","dimension","value","kind","activityFrom","activityTo","asOf","ad","cohort", "show", "brand", "platform", "format", "hook", "angle", "offer", "ugc", "status", "from", "to", "search", "sort", "layout"] as const;
export function browserFilters(params: URLSearchParams): BrowserFilters {
    return Object.fromEntries(BROWSER_FILTERS.flatMap(key => params.get(key) ? [[key, params.get(key)!]] : []));
}
export function filterBrowserCreatives(rows: BrowserCreative[], filters: BrowserFilters,primary:readonly string[]=[]) {
    const match = (selected: string | undefined, value: string | null | undefined) => !selected || selected === "all" || value === selected;
    const needle = filters.search?.trim().toLocaleLowerCase();
    const researchSelection=filters.kind||filters.dimension||filters.asOf||filters.ad||filters.demographicCountry?new Set(selectResearchAds(rows,{...filters,take:undefined,measure:undefined}).map(row=>row.adId)):null;
    const anchor=filters.similarTo?rows.find(row=>row.adId===filters.similarTo):undefined,similar=filters.similarTo?new Set(anchor?similarCompetitors(anchor,rows,{category:filters.category,adFormat:filters.adFormat},primary).map(row=>row.adId):[]):null;
    const result = rows.filter(row => (!similar||similar.has(row.adId))&& (!filters.category||filters.category==="all"||Boolean(row.productCategories?.some(c=>(filters.category==="mine"?primary:filters.category!.split(",")).includes(c))))&&(!filters.adFormat||filters.adFormat==="same"||mediaFormat(row)===filters.adFormat)&& (!filters.reachCountry||countryReach(row.publicReach,filters.reachCountry)!==null)&& (!researchSelection||researchSelection.has(row.adId))&& (!filters.show || filters.show === "all" || filters.show === "yours" && row.workspaceBrand || filters.show === "competitors" && !row.workspaceBrand) &&
        (!filters.cohort || row.workspaceBrand && row.owned && row.performance.some(item => item.id === filters.cohort)) &&
        match(filters.brand, row.brandId) && match(filters.platform, row.platform) &&
        (!filters.format || filters.format === "all" || [row.creativeFormat, row.mediaKind].includes(filters.format)) &&
        match(filters.hook, row.hookType) && match(filters.angle, row.angle) && match(filters.offer, row.offerType) &&
        (!filters.ugc || filters.ugc === "all" || (filters.ugc === "yes" ? row.ugc === true : filters.ugc === "no" ? row.ugc === false : row.ugc === null)) &&
        match(filters.status, row.deliveryStatus || "unknown") &&
        (!filters.from || row.performance.length > 0 || Boolean(row.observedAt && row.observedAt.slice(0, 10) >= filters.from)) &&
        (!filters.to || row.performance.length > 0 || Boolean(row.observedAt && row.observedAt.slice(0, 10) <= filters.to)) &&
        (!needle || row.searchText.toLocaleLowerCase().includes(needle)));
    const ordered=result.sort((a, b) => {
        if (filters.sort === "days")
            return (b.daysRunning ?? -1) - (a.daysRunning ?? -1) || a.adId.localeCompare(b.adId);
        if (filters.sort === "title")
            return creativeTitle(a).localeCompare(creativeTitle(b)) || a.adId.localeCompare(b.adId);
        return (b.observedAt || "").localeCompare(a.observedAt || "") || a.adId.localeCompare(b.adId);
    });
    const take=Number(filters.take);const limited=filters.take&&Number.isInteger(take)&&take>0&&take<=100?ordered.slice(0,take):ordered;return filters.measure?limited.filter(row=>measurementEligible(row,filters.measure!)):limited;
}
export function similarPublicCreatives(selected: BrowserCreative, rows: BrowserCreative[]) {
    return similarCompetitors(selected,rows);
}
export function creativeUrl(base: string, brandId: string, adId?: string) {
    const url = new URL(base, "http://exter.local");
    url.searchParams.set("view", adId ? "creative" : "creatives");
    url.searchParams.set("brandId", brandId);
    if (adId)
        url.searchParams.set("id", adId);
    else
        url.searchParams.delete("id");
    return url.pathname + url.search + url.hash;
}
export function privateMetric(creative: BrowserCreative, cohortId: string | undefined, name: MetricName): OwnedMetric | null {
    if (!creative.owned || !creative.workspaceBrand)
        return null;
    const cohort = cohortId ? creative.performance.find(item => item.id === cohortId) : creative.performance.length === 1 ? creative.performance[0] : undefined;
    return cohort?.metrics[name] || null;
}
