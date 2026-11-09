import { House, Building2, Eye, Grid2X2, Layers2, MessageSquare, Gauge, Database, UserRound, BarChart3, ClipboardCheck, Compass, FileChartColumnIncreasing, Globe2, Layers, MessageSquareText, Settings2, Sparkles, Target, Trophy, UsersRound } from "lucide-react";
import type { Page } from "../shared/types";

export type ViewId = "overview" | "brands" | "competitors" | "creatives" | "creative" | "formats" | "patterns" | "audience" | "winners" | "briefs" | "creators" | "scores" | "reports" | "ask" | "demo" | "data" | "settings" | "labelling";
export type NavigationGroup = "Overview" | "Research" | "Act" | "Share" | "Settings";
export interface NavigationItem {
  id: ViewId; label: string; group: NavigationGroup; icon: typeof Compass;
  ready: boolean; screen: Page | null; aliases?: readonly string[];
  demoOnly?: boolean; hidden?: boolean; rebuilt?: "UI-11" | "UI-12" | "UI-13" | "UI-14" | "UI-15" | "UI-16" | "UI-02" | "UI-03" | "UI-04" | "UI-05" | "UI-06" | "UI-07" | "UI-08" | "UI-09" | "UI-10";
}
/** UI-00: readiness means an existing screen, not completion of a later UI rebuild. */
export const navigation: readonly NavigationItem[] = [
  { id:"overview", label:"Home", group:"Overview", icon:House, ready:true, screen:"overview", rebuilt:"UI-04" },
  { id:"brands", label:"Brand research", group:"Research", icon:Building2, ready:true, screen:"brand", rebuilt:"UI-05", aliases:["brand"] },
  { id:"competitors", label:"Competitors", group:"Research", icon:Eye, ready:true, screen:"competitors", rebuilt:"UI-06" },
  { id:"creatives", label:"Creatives", group:"Research", icon:Grid2X2, ready:true, screen:"ads", rebuilt:"UI-02", aliases:["ads"] },
  { id:"creative", label:"Creative detail", group:"Research", icon:Grid2X2, ready:true, screen:"ads", rebuilt:"UI-03", hidden:true },
  { id:"formats", label:"Formats", group:"Research", icon:Layers2, ready:true, screen:"formats", rebuilt:"UI-07" },
  { id:"patterns", label:"Patterns", group:"Research", icon:BarChart3, ready:true, screen:"patterns", rebuilt:"UI-08" },
  { id:"audience", label:"Audience & voice", group:"Research", icon:MessageSquare, ready:true, screen:"audiences", rebuilt:"UI-09", aliases:["audiences"] },
  { id:"winners", label:"Winners", group:"Act", icon:Trophy, ready:true, screen:"winners", rebuilt:"UI-10" },
  { id:"briefs", label:"Opportunities & briefs", group:"Act", icon:Target, ready:true, screen:"briefs", rebuilt:"UI-11" },
  { id:"creators", label:"Creators", group:"Act", icon:UserRound, ready:true, screen:"creators", rebuilt:"UI-12" },
  { id:"scores", label:"Scores", group:"Act", icon:Gauge, ready:true, screen:"scores", rebuilt:"UI-13" },
  { id:"reports", label:"Reports", group:"Share", icon:FileChartColumnIncreasing, ready:true, screen:"reports", rebuilt:"UI-15" },
  { id:"ask", label:"Ask Exter", group:"Share", icon:MessageSquareText, ready:true, screen:"ask", rebuilt:"UI-14" },
  { id:"demo", label:"Brand demo", group:"Share", icon:FileChartColumnIncreasing, ready:true, screen:"demo", demoOnly:true },
  { id:"data", label:"Data sources", group:"Settings", icon:Database, ready:true, screen:"sources", rebuilt:"UI-16", aliases:["sources"] },
  { id:"settings", label:"Tests and preparation", group:"Settings", icon:Settings2, ready:true, screen:"settings" },
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
  const selected=available?(item.id==="settings"&&url.hash==="#monthly-budgets"?navigation.find(item=>item.id==="data")!:item):navigation[0];
  const id=selected.id==="creative" && !url.searchParams.get("id")?"creatives":selected.id;
  const canonical=navigation.find(item=>item.id===id)!;
  const redirect=requested!==id || id!=="creative" && url.searchParams.has("id");
  if(redirect) url.searchParams.set("view",id);
  if(id!=="creative")url.searchParams.delete("id");
  return {id,screen:canonical.screen!,url,redirect,brandId:url.searchParams.get("brandId"),adId:id==="creative"?url.searchParams.get("id"):null};
}
export const NAVIGATION_EVENT="exter:navigation";
/** Follow workspace links without discarding already loaded session data. */
export function navigateHref(input: string | URL) {
  const current=new URL(window.location.href),url=new URL(input,current);
  if(url.origin!==current.origin||url.pathname!=="/")return false;
  if(current.searchParams.get("demo")==="1"&&!url.searchParams.has("demo"))url.searchParams.set("demo","1");
  if(!url.searchParams.has("brandId")&&current.searchParams.has("brandId"))url.searchParams.set("brandId",current.searchParams.get("brandId")!);
  const resolved=resolveNavigation(url.href);
  const detail=resolved.id==="creative"&&(resolveNavigation(current.href).id!=="creative"||Boolean(window.history.state?.exterCreative));
  if(resolved.url.href!==current.href)window.history.pushState({exterCreative:detail},"",resolved.url);
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
  if(!resolved.url.hash)window.scrollTo(0,0);
  return true;
}
export function followWorkspaceLink(event: MouseEvent) {
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const link=event.target instanceof Element?event.target.closest<HTMLAnchorElement>("a[href]"):null;
  if(!link||link.hasAttribute("download")||link.target&&link.target!=="_self"||link.getAttribute("rel")?.split(/\s+/).includes("external"))return;
  if(link.getAttribute("href")?.startsWith("#"))return;
  if(navigateHref(link.href))event.preventDefault();
}
export function navigateTo(view:ViewId|Page,brandId?:string,options:{replace?:boolean;adId?:string}={}) {
  const item=navigation.find(item=>item.id===view || item.screen===view && !item.hidden);
  const url=new URL(window.location.href);
  if(item?.id!=="creative"||options.adId!==url.searchParams.get("id")){url.searchParams.delete("t");url.searchParams.delete("slide");}
  if(item?.id!==resolveNavigation(window.location.href).id)url.hash="";
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
