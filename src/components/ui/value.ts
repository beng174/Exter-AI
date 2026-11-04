export type DataBasis = "Observed" | "Estimated" | "Modelled" | "Unavailable";
export type DisplayValue = string | number | boolean | null | undefined;
export function hasValue(value: DisplayValue): value is string | number | boolean {
  return value !== null && value !== undefined && (typeof value !== "number" || Number.isFinite(value)) && (typeof value !== "string" || Boolean(value.trim()) && !/^(unknown|unsure|unavailable|n\/a)$/i.test(value.trim()));
}
export const displayValue = (value: DisplayValue) => hasValue(value) ? String(value) : "Unavailable";
