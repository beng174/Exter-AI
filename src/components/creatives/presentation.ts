import { privateMetric, type BrowserCreative, type CreativePerformance } from "../../../shared/creative-browser";
import type { MetricName, OwnedMetric } from "../../../shared/owned-metrics";
import { hasValue } from "../ui/value";
export function metricText(metric: OwnedMetric | null | undefined, name: MetricName, currency?: string): string | null {
    if (!metric || metric.status !== "available" || !hasValue(metric.value))
        return null;
    const value = metric.value;
    if (["Spend", "CPM", "CPA"].includes(name))
        return currency ? new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value) : null;
    if (name.includes("rate") || name.startsWith("Retention") || ["Link CTR", "CVR"].includes(name))
        return `${(value * 100).toFixed(1)}%`;
    if (name === "Average watch time")
        return `${value.toFixed(1)}s`;
    return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(value);
}
export function metricReason(metric: OwnedMetric | null | undefined) {
    return metric?.status === "too early" ? "Too early: the spec's minimum sample has not been reached." : "Saved owned data does not support this metric in this reporting scope.";
}
export function onlyCohort(row: BrowserCreative, cohortId?: string): CreativePerformance | undefined {
    return row.owned && row.workspaceBrand ? cohortId ? row.performance.find(item=>item.id===cohortId) : row.performance.length===1 ? row.performance[0] : undefined : undefined;
}
export function cardMetrics(row: BrowserCreative, cohortId?: string) {
    if (!row.workspaceBrand)
        return [{ label: "Days running", value: row.daysRunning, basis: "Observed" as const, reason: "A source delivery start and observed endpoint are missing." }];
    const cohort = onlyCohort(row,cohortId);
    return (["Spend", "ROAS", "Hook rate"] as const).map(label => ({ label, value: metricText(cohort?privateMetric(row,cohort.id,label):null, label, cohort?.currency), basis: "Observed" as const, reason: row.performance.length > 1 ? "Select one account, currency and attribution scope in Creative detail." : metricReason(cohort?.metrics[label]) }));
}
export function creativeMeta(row: BrowserCreative) { return { sampleSize: 1, from: row.firstObservedAt, to: row.observedAt, lastChecked: row.observedAt }; }
export function timestamp(seconds: number) { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`; }
