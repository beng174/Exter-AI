import type pg from "pg";
import { reserveCost } from "../infrastructure/budget.js";
export const META_COVERAGE = "Commercial ads delivered in the UK or EU; searchable for one year. Public reach is not conversions or sales. Media requires a separate browser capture.";
export const META_FIELDS = "id,page_id,page_name,ad_creation_time,ad_delivery_start_time,ad_delivery_stop_time,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_descriptions,ad_creative_link_captions,ad_snapshot_url,publisher_platforms,languages,target_ages,target_gender,target_locations,eu_total_reach,total_reach_by_location,age_country_gender_reach_breakdown,beneficiary_payers";
export function metaStatus() {
  return { status: process.env.META_ACCESS_TOKEN ? "configured" : "not_connected", message: process.env.META_ACCESS_TOKEN ? "Meta configured; collection permission is verified on the next run." : "Meta not connected", coverage: META_COVERAGE };
}
export class MetaCollectionError extends Error {
  constructor(public reason: "rate_limited" | "permission" | "unavailable" | "schema", message: string) { super(message); }
}
export interface MetaQuery { pageIds?: string[]; searchTerm?: string; countries: string[]; after?: string | null }
export class MetaLibraryConnector {
  constructor(private readonly options: { token?: string; version?: string; fetch?: typeof fetch } = {}) {}
  async page(query: MetaQuery) {
    const token = this.options.token ?? process.env.META_ACCESS_TOKEN;
    if (!token) throw new MetaCollectionError("permission", "Meta not connected");
    const version = this.options.version ?? process.env.META_API_VERSION ?? "v25.0";
    if (!/^v\d+\.0$/.test(version)) throw new MetaCollectionError("schema", "Invalid META_API_VERSION.");
    if (!query.countries.length || query.countries.some(c => !/^[A-Z]{2}$/.test(c))) throw new MetaCollectionError("schema", "Use two-letter reached-country codes.");
    if ((!query.pageIds?.length && !query.searchTerm) || query.pageIds?.some(id => !/^\d+$/.test(id))) throw new MetaCollectionError("schema", "Provide Meta page IDs or a category search term.");
    const url = new URL(`https://graph.facebook.com/${version}/ads_archive`);
    url.searchParams.set("fields", META_FIELDS);
    url.searchParams.set("ad_reached_countries", JSON.stringify(query.countries));
    url.searchParams.set("ad_active_status", "ALL");
    url.searchParams.set("limit", "100");
    if (query.pageIds?.length) url.searchParams.set("search_page_ids", JSON.stringify(query.pageIds));
    if (query.searchTerm) url.searchParams.set("search_terms", query.searchTerm);
    if (query.after) url.searchParams.set("after", query.after);
    let response: Response;
    try { response = await (this.options.fetch ?? fetch)(url, { headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(30000) }); }
    catch { throw new MetaCollectionError("unavailable", "Meta request unavailable; collection will resume from its saved cursor."); }
    if (!response.ok) throw new MetaCollectionError(response.status === 429 ? "rate_limited" : [400,401,403].includes(response.status) ? "permission" : "unavailable", `Meta collection failed (HTTP ${response.status}). Check app approval and permissions.`);
    // Never store paging URLs or provider error messages: they may contain credentials.
    if (Number(response.headers.get("content-length")) > 10000000) throw new MetaCollectionError("schema", "Meta page exceeds size limit.");
    const raw = await response.text();
    if (raw.length > 10000000) throw new MetaCollectionError("schema", "Meta page exceeds size limit.");
    let body: any;
    try { body = JSON.parse(raw); } catch { throw new MetaCollectionError("schema", "Meta returned invalid JSON."); }
    if (body.error || !Array.isArray(body.data) || body.data.length > 100 || body.data.some((r: any) => !r || typeof r.id !== "string" || !/^\d+$/.test(r.id))) throw new MetaCollectionError("schema", "Meta returned an unsupported ad schema.");
    const after = body.paging?.next ? body.paging?.cursors?.after : null;
    if (body.paging?.next && (typeof after !== "string" || !after || after === query.after || after.length > 2000 || after.includes(token))) throw new MetaCollectionError("schema", "Meta pagination cursor is invalid.");
    // Explicit allowlist; recursively remove the token even from an unexpected source field.
    const rows = body.data.map((row: any) => JSON.parse(JSON.stringify(Object.fromEntries(META_FIELDS.split(",").filter(key => key in row).map(key => [key,row[key]]))).split(token).join("[redacted]")));
    let usage = 0;
    for (const header of ["x-app-usage", "x-business-use-case-usage"]) {
      try {
        const data = JSON.parse(response.headers.get(header) || "{}");
        const walk = (v: any) => { if (v && typeof v === "object") for (const [k,n] of Object.entries(v)) { if (["call_count","total_cputime","total_time"].includes(k) && typeof n === "number") usage = Math.max(usage,n); else walk(n); } };
        walk(data);
      } catch { /* Malformed usage headers do not erase a successfully collected page. */ }
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    return { rows, after: after as string | null, backoffMs: usage >= 80 ? 60000 : Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000,3600000) : 0 };
  }
}
function observedReach(row: any) {
  return {
    eu: row.eu_total_reach === undefined || row.eu_total_reach === null ? { type: "unavailable", value: null } : { type: "observed", value: row.eu_total_reach },
    locations: row.total_reach_by_location === undefined || row.total_reach_by_location === null ? { type: "unavailable", value: null } : { type: "observed", value: row.total_reach_by_location },
  };
}
export async function collectMetaPage(pool: pg.Pool, runId: string, connector = new MetaLibraryConnector(), leaseOwner?: string) {
  const result = await pool.query("SELECT r.*,w.workspace_id,w.page_ids,w.search_terms,w.countries FROM collection_runs r JOIN watchlists w ON w.id=r.watchlist_id WHERE r.id=$1", [runId]);
  const run = result.rows[0];
  if (!run || run.status === "complete") return { complete: true, backoffMs: 0 };
  const config = run.config || run;
  const queries: MetaQuery[] = [
    ...(config.page_ids.length ? [{ pageIds: config.page_ids, countries: config.countries }] : []),
    ...config.search_terms.map((searchTerm: string) => ({ searchTerm, countries: config.countries })),
  ];
  if (!queries.length) throw new MetaCollectionError("schema", "Watchlist has no advertisers or search terms.");
  await reserveCost(pool,"data_providers","meta",0);
  const page = await connector.page({ ...queries[run.query_index], after: run.cursor });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query("SELECT cursor,query_index,status FROM collection_runs WHERE id=$1 FOR UPDATE", [runId]);
    if (leaseOwner) {
      const lease = await client.query("SELECT id FROM collection_jobs WHERE id=$1 AND lease_owner=$2 AND lease_until>now() FOR UPDATE", [runId,leaseOwner]);
      if (!lease.rowCount) throw new Error("Collection lease expired.");
    }
    if (locked.rows[0].cursor !== run.cursor || locked.rows[0].query_index !== run.query_index || locked.rows[0].status === "complete") {
      await client.query("ROLLBACK"); return { complete: false, backoffMs: 0 };
    }
    if (page.after) {
      const cursor = await client.query("INSERT INTO collection_cursors VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING cursor", [runId,run.query_index,page.after]);
      if (!cursor.rowCount) throw new MetaCollectionError("schema", "Meta pagination contains a cycle.");
    }
    let added = 0, updated = 0;
    for (const row of page.rows) {
      const active = row.ad_delivery_stop_time ? "inactive" : "unknown";
      // Missing stop time alone does not prove an ad is currently active.
      const inserted = await client.query(`INSERT INTO public_ads(platform,native_id,advertiser_id,start_time,stop_time)
        VALUES('Meta',$1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING native_id`, [String(row.id),row.page_id ?? null,row.ad_delivery_start_time ?? null,row.ad_delivery_stop_time ?? null]);

      await client.query("UPDATE public_ads SET advertiser_id=COALESCE($2,advertiser_id),start_time=COALESCE($3,start_time),stop_time=COALESCE($4,stop_time) WHERE platform='Meta' AND native_id=$1", [String(row.id),row.page_id ?? null,row.ad_delivery_start_time ?? null,row.ad_delivery_stop_time ?? null]);
      const observation = await client.query(`INSERT INTO ad_observations(platform,native_id,run_id,workspace_id,active_status,reach,raw_payload)
        VALUES('Meta',$1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING native_id`, [String(row.id),runId,run.workspace_id,active,observedReach(row),row]);
      if (observation.rowCount) { if (inserted.rowCount) added++; else updated++; }
    }
    const nextIndex = page.after ? run.query_index : run.query_index + 1;
    const complete = nextIndex >= queries.length;
    await client.query(`UPDATE collection_runs SET records_new=records_new+$2,records_updated=records_updated+$3,cursor=$4,query_index=$5,
      status=$6,finished_at=CASE WHEN $7 THEN now() ELSE NULL END,last_successful_check=CASE WHEN $7 THEN now() ELSE last_successful_check END,errors='[]' WHERE id=$1`,
      [runId,added,updated,page.after,nextIndex,complete ? "complete" : "running",complete]);
    await client.query("COMMIT");
    return { complete, backoffMs: page.backoffMs };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
