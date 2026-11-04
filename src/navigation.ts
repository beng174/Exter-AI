import { Activity, BarChart3, ClipboardCheck, Compass, FileChartColumnIncreasing, Globe2, Layers, MessageSquareText, Settings2, Sparkles, Target, Trophy, UsersRound } from "lucide-react";
import type { Page } from "../shared/types";

export type ViewId = "overview" | "brands" | "competitors" | "creatives" | "creative" | "formats" | "patterns" | "audience" | "winners" | "briefs" | "creators" | "scores" | "reports" | "ask" | "demo" | "data" | "settings" | "labelling";
export type NavigationGroup = "Overview" | "Research" | "Act" | "Share" | "Settings";
export interface NavigationItem {
  id: ViewId; label: string; group: NavigationGroup; icon: typeof Compass;
  ready: boolean; screen: Page | null; aliases?: readonly string[];
  demoOnly?: boolean; hidden?: boolean;
}
/** UI-00: readiness means an existing screen, not completion of a later UI rebuild. */
export const navigation: readonly NavigationItem[] = [
  { id:"overview", label:"Home", group:"Overview", icon:Compass, ready:true, screen:"overview" },
  { id:"brands", label:"Brand research", group:"Research", icon:Globe2, ready:true, screen:"brand", aliases:["brand"] },
  { id:"competitors", label:"Competitors", group:"Research", icon:BarChart3, ready:true, screen:"competitors" },
  { id:"creatives", label:"Creatives", group:"Research", icon:Layers, ready:true, screen:"ads", aliases:["ads"] },
  { id:"creative", label:"Creative detail", group:"Research", icon:Layers, ready:true, screen:"ads", hidden:true },
  { id:"formats", label:"Formats", group:"Research", icon:Activity, ready:true, screen:"formats" },
  { id:"patterns", label:"Patterns", group:"Research", icon:BarChart3, ready:false, screen:null },
  { id:"audience", label:"Audience and voice", group:"Research", icon:Target, ready:true, screen:"audiences", aliases:["audiences"] },
  { id:"winners", label:"Winners", group:"Act", icon:Trophy, ready:false, screen:null },
  { id:"briefs", label:"Opportunities and briefs", group:"Act", icon:Sparkles, ready:false, screen:null },
  { id:"creators", label:"Creators", group:"Act", icon:UsersRound, ready:true, screen:"creators" },
  { id:"scores", label:"Scores", group:"Act", icon:Activity, ready:false, screen:null },
  { id:"reports", label:"Reports", group:"Share", icon:FileChartColumnIncreasing, ready:true, screen:"reports" },
  { id:"ask", label:"Ask Exter", group:"Share", icon:MessageSquareText, ready:false, screen:null },
  { id:"demo", label:"Brand demo", group:"Share", icon:FileChartColumnIncreasing, ready:true, screen:"demo", demoOnly:true },
  { id:"data", label:"Data sources", group:"Settings", icon:Globe2, ready:true, screen:"sources", aliases:["sources"] },
  { id:"settings", label:"Budgets and tests", group:"Settings", icon:Settings2, ready:true, screen:"settings" },
  { id:"labelling", label:"Labelling", group:"Settings", icon:ClipboardCheck, ready:true, screen:"labelling" },
];
export const navigationGroups: readonly NavigationGroup[] = ["Overview","Research","Act","Share","Settings"];
export function visibleNavigation(demo=false) {
  return navigationGroups.map(label=>({label,items:navigation.filter(item=>item.group===label && item.ready && !item.hidden && (!item.demoOnly || demo))})).filter(group=>group.items.length);
}
export function viewForScreen(screen: Page): ViewId {
  return navigation.find(item=>item.screen===screen && !item.hidden)!.id;
}
export function resolveNavigation(input: string) {
  const url=new URL(input,"http://exter.local"), requested=url.searchParams.get("view") || "overview";
  const item=navigation.find(item=>item.id===requested || item.aliases?.includes(requested));
  const available=item?.ready && (!item.demoOnly || url.searchParams.get("demo")==="1");
  const selected=available?item:navigation[0];
  const id=selected.id==="creative" && !url.searchParams.get("id")?"creatives":selected.id;
  const canonical=navigation.find(item=>item.id===id)!;
  const redirect=requested!==id || id!=="creative" && url.searchParams.has("id");
  if(redirect) url.searchParams.set("view",id);
  if(id!=="creative")url.searchParams.delete("id");
  return {id,screen:canonical.screen!,url,redirect,brandId:url.searchParams.get("brandId"),adId:id==="creative"?url.searchParams.get("id"):null};
}
export const NAVIGATION_EVENT="exter:navigation";
export function navigateTo(view:ViewId|Page,brandId?:string,options:{replace?:boolean;adId?:string}={}) {
  const item=navigation.find(item=>item.id===view || item.screen===view && !item.hidden);
  const url=new URL(window.location.href);
  url.searchParams.set("view",item?.id || "overview");
  if(brandId)url.searchParams.set("brandId",brandId);
  if(options.adId)url.searchParams.set("id",options.adId);else url.searchParams.delete("id");
  const resolved=resolveNavigation(url.href);
  const current=resolveNavigation(window.location.href);
  const detail=resolved.id==="creative" && (current.id!=="creative" || Boolean(window.history.state?.exterCreative));
  if(resolved.url.href!==window.location.href)window.history[options.replace?"replaceState":"pushState"]({exterCreative:detail},"",resolved.url);
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
}
export function canonicaliseLocation() {
  const route=resolveNavigation(window.location.href);
  if(route.redirect)window.history.replaceState({},"",route.url);
  return route;
}

export function openCreativeRoute(adId:string,brandId:string) {
  navigateTo("creative",brandId,{adId,replace:resolveNavigation(window.location.href).id==="creative"});
}
export function closeCreativeRoute(brandId:string) {
  if(window.history.state?.exterCreative)window.history.back();
  else navigateTo("creatives",brandId,{replace:true});
}
