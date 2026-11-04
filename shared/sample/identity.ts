export const SAMPLE_BRAND_ID = "sample-northwick";
export const SAMPLE_ID_PREFIX = "sample-";
export const isSampleId = (value: unknown): value is string => typeof value === "string" && value.startsWith(SAMPLE_ID_PREFIX);
