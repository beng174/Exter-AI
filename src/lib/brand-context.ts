import type { Brand } from "../../shared/types";
/** UI-00: omit unknown roles rather than inventing a client relationship. */
export function brandContext(brand?: Brand & {
    role?: string;
}, competitorCount:number|null|undefined=Array.isArray(brand?.competitors)?brand.competitors.length:undefined) {
    const role = brand?.mode === "demo" ? "Sample" : brand?.role === "client" ? "Client" : brand?.role === "prospect" ? "Prospect" : null;
    const competitors = competitorCount==null?"Competitors unavailable":competitorCount===0?"No competitors added":`${competitorCount} ${competitorCount===1?"competitor":"competitors"}`;
    return [role, competitors].filter(Boolean).join(" · ");
}
