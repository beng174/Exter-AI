import { hasValue } from "./value";
import { DataLabel } from "./DataLabel";
import { Unavailable } from "./Unavailable";
import "./RetentionChart.css";
export interface RetentionPoint {
    label: string;
    creative: number | null;
    benchmark: number | null;
}
/** Plots existing owned rates only; missing checkpoints break each line. */
export function RetentionChart({ points, onCreative, onBenchmark, compactLegend=false }: {
    points: RetentionPoint[];
    compactLegend?:boolean;
    onCreative: () => void;
    onBenchmark: () => void;
}) {
    if (!points.some(point => hasValue(point.creative) || hasValue(point.benchmark)))
        return <Unavailable reason="No retention checkpoints exist in this reporting scope." unlock="Saved retention counts and video starts unlock this chart."/>;
    const max = Math.max(1, ...points.flatMap(point => [point.creative, point.benchmark].filter((value): value is number => hasValue(value))));
    const x = (index: number) => 48 + index * 520 / Math.max(1, points.length - 1), y = (value: number) => 170 - 140 * value / max;
    const lines = (key: "creative" | "benchmark") => points.flatMap((point, index) => {
        const previous = points[index - 1]?.[key], value = point[key];
        return index > 0 && hasValue(previous) && hasValue(value) ? [<line key={`${key}:${index}`} className={`retention-${key}`} x1={x(index - 1)} y1={y(previous)} x2={x(index)} y2={y(value)}/>] : [];
    });
    return <div className="ui-retention-chart">{!compactLegend&&<><DataLabel basis="Observed"/><p>This creative (solid) · account benchmark (dashed). Text values are in the table below.</p></>}<svg viewBox="0 0 620 220" role="img" aria-label="Saved retention checkpoints. Missing values break the line; the table gives every known value."><line x1="48" y1="170" x2="590" y2="170" className="retention-axis"/><text x="8" y="30">{Math.round(max * 100)}%</text><text x="8" y="174">0%</text>{lines("benchmark")}{lines("creative")}{points.map((point, index) => <g key={point.label}><text x={x(index)} y="205" textAnchor="middle">{point.label.replace("Retention ", "")}</text>{(["creative", "benchmark"] as const).flatMap(key => hasValue(point[key]) ? [<g key={key} role="button" tabIndex={0} aria-label={`${point.label}, ${key}: ${(point[key]! * 100).toFixed(1)} percent. Open supporting ads.`} onClick={key === "creative" ? onCreative : onBenchmark} onKeyDown={event => { if (["Enter", " "].includes(event.key)) {
            event.preventDefault();
            (key === "creative" ? onCreative : onBenchmark)();
        } }}><circle className="retention-target" stroke="transparent" strokeWidth="44" vectorEffect="non-scaling-stroke" cx={x(index)} cy={y(point[key]!)} r="23"/><circle className={`retention-point-${key}`} cx={x(index)} cy={y(point[key]!)} r="4"/></g>] : [])}</g>)}</svg></div>;
}
