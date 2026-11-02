/** Typography at the display/export boundary; stored source evidence stays intact. */
export const plainDashes = (text: string): string => text.replace(/[\u2013\u2014]/g, "-");
export function displayData<T>(value: T): T {
  if (typeof value === "string") return (/^https?:\/\//i.test(value) ? value : plainDashes(value)) as T;
  if (Array.isArray(value)) return value.map(displayData) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /(?:id|url|sha256)$/i.test(key) ? item : displayData(item)])) as T;
  return value;
}
