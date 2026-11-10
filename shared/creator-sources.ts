import { creatorHandle } from "./creator-discovery.js";
import type { Brand } from "./types.js";

const tag = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 80);
export function creatorSourceSuggestions(brand: Pick<Brand,"primaryCategories"|"category"|"discoveryKeywords"|"competitors">, knownHandles: string[] = []) {
  const topics = [...new Set([...(brand.primaryCategories ?? []), ...(brand.discoveryKeywords ?? []), brand.category])]
    .filter(v => v && !/^(?:not yet understood|unavailable|unknown)$/i.test(v)).slice(0, 8);
  const tags = new Set<string>();
  const add = (s: string) => { const t = tag(s); if (t) tags.add(t); };
  for (const topic of topics) { add(topic); add(`${topic}lover`); add(`${topic}uk`); }
  const home = /candle|fragrance|home|interior|gifting/i.test(topics.join(" "));
  for (const t of home ? ["ukhomeblogger","ukinteriors","homedecor","cosyhome","homeroutine","interiorscreator","uklifestyleblogger","homeinspiration","ukcontentcreator","homeblogger"] : ["ukblogger","ukcontentcreator","uklifestyle","ukcreators","uklifestyleblogger","britishblogger","ukugc","ukdigitalcreator","ukbloggers","ukcreatorcommunity"]) add(t);
  const confirmed = [...new Set(knownHandles.map(creatorHandle).filter((v):v is string => Boolean(v)))];
  const suggested = brand.competitors.map(name => creatorHandle(name.replace(/[^a-z0-9]/gi,""))).filter((v):v is string => Boolean(v));
  const competitors = [...new Set([...confirmed, ...suggested])].slice(0, 8);
  return { hashtags:[...tags].slice(0,20), competitors, keywords:topics, unconfirmedHandles:competitors.filter(h=>!confirmed.includes(h)) };
}
