import {api} from "./api";
import {contextReads, libraryReads} from "./read-cache";

export function workspaceRead<T>(url: string, library = false) {
  const sample = new URLSearchParams(window.location.search).get("demo") === "1";
  const scoped = new URL(url, window.location.origin);
  scoped.searchParams.sort();
  // Mode is captured at acquisition, so sample data never fulfils a real read.
  if (sample) scoped.searchParams.set("demo", "1");
  const path = scoped.pathname + scoped.search;
  return (library ? libraryReads : contextReads).acquire<T>(`${sample ? "sample" : "real"}:${path}`,
    signal => api<T>(path, undefined, {signal, sample}));
}
