import { displayData, plainDashes } from "../../shared/presentation";
import {invalidateWorkspaceReads} from "./read-cache";
export async function api<T>(url: string, body?: unknown, options: {signal?: AbortSignal; sample?: boolean} = {}): Promise<T> {
  const sample = options.sample ?? (typeof window!=="undefined" && new URLSearchParams(window.location.search).get("demo")==="1");
  if(sample) {
    if(body!==undefined && !url.startsWith("/api/ask")) throw new Error("Sample workspace is read-only.");
    const scoped=new URL(url,window.location.origin);scoped.searchParams.set("demo","1");url=scoped.pathname+scoped.search;
  }
  const response = await fetch(
    url,
    body === undefined
      ? {signal: options.signal}
      : {
          signal: options.signal,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(plainDashes(data?.error || `Request failed (${response.status})`));
  }
  if (body !== undefined && !url.startsWith("/api/ask")) invalidateWorkspaceReads();
  return displayData(await response.json());
}
export const number = (value: number) =>
  new Intl.NumberFormat("en", {
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
export const percent = (value: number) => `${value.toFixed(2)}%`;
