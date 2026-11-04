import type { Brand } from "../../shared/types";
/** UI-00: omit unknown roles rather than inventing a client relationship. */
export function brandContext(brand?: Brand & {
    role?: string;
}) {
    const role = brand?.role === "client" ? "Client" : brand?.role === "prospect" ? "Prospect" : null;
    const competitors = brand ? brand.competitors.length ? `${brand.competitors.length} ${brand.competitors.length === 1 ? "competitor" : "competitors"}` : "No competitors added" : "Competitors unavailable";
    return [role, competitors].filter(Boolean).join(" · ");
}
