import test from "node:test";
import assert from "node:assert/strict";
import { navigation, navigationGroups, visibleNavigation, resolveNavigation, viewForScreen, navigateTo, navigateHref, followWorkspaceLink, canonicaliseLocation, openCreativeRoute, closeCreativeRoute } from "../src/navigation.js";
import type { Page } from "../shared/types.js";

test("UI-00 config has unique canonical IDs, ordered groups and only existing ready screens",()=>{
  assert.equal(new Set(navigation.map(item=>item.id)).size,navigation.length);
  assert.deepEqual(navigationGroups,["Overview","Research","Act","Share","Settings"]);
  const screens:Page[]=["overview","brand","competitors","ads","formats","audiences","creators","reports","sources","settings","demo","accuracy","labelling","patterns","winners","briefs","scores","ask"];
  for(const item of navigation) {
    assert.ok(navigationGroups.includes(item.group));
    if(item.ready)assert.ok(item.screen && screens.includes(item.screen),item.id);
    else assert.equal(item.screen,null,item.id);
  }
  for(const screen of screens)assert.equal(resolveNavigation(`/?view=${viewForScreen(screen)}&demo=1`).screen,screen);
  const visible=visibleNavigation().flatMap(group=>group.items.map(item=>item.id));
  assert.deepEqual(visible,["overview","brands","competitors","creatives","formats","patterns","audience","winners","briefs","creators","scores","reports","ask","data","settings","accuracy","labelling"]);
  assert.ok(visibleNavigation(true).flatMap(group=>group.items).some(item=>item.id==="demo"));
});
test("UI-00 legacy aliases redirect canonically and preserve brand, filters and hashes",()=>{
  for(const [alias,id] of Object.entries({brand:"brands",ads:"creatives",audiences:"audience",sources:"data"})) {
    const route=resolveNavigation(`https://exter.example/?view=${alias}&brandId=real-brand&angle=gifting#evidence`);
    assert.equal(route.id,id);assert.equal(route.redirect,true);assert.equal(route.url.searchParams.get("brandId"),"real-brand");assert.equal(route.url.searchParams.get("angle"),"gifting");assert.equal(route.url.hash,"#evidence");
    assert.equal(resolveNavigation(route.url.href).redirect,false);
  }
});
test("UI-00 unready/unknown pages and unflagged demos cannot be selected",()=>{
  for(const item of navigation.filter(item=>!item.ready))assert.equal(resolveNavigation(`/?view=${item.id}&brandId=known`).id,"overview");
  assert.equal(resolveNavigation("/?view=unknown").id,"overview");
  assert.equal(resolveNavigation("/?view=demo").id,"overview");
  assert.equal(resolveNavigation("/?view=creative").id,"creatives");
  assert.equal(resolveNavigation("/?view=creative&id=source-ad&brandId=known").adId,"source-ad");
});
test("UI-00 aliases replace history, page changes push and creative close returns through history",()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,"window");
  const events=new EventTarget();
  let cursor=0;
  const entries=[{href:"https://exter.example/?view=ads&brandId=brand",state:null as any}];
  const mock={location:{get href(){return entries[cursor].href;}},history:{get state(){return entries[cursor].state;},replaceState(state:any,_title:string,url:URL){entries[cursor]={state,href:String(url)};},pushState(state:any,_title:string,url:URL){entries.splice(++cursor);entries.push({state,href:String(url)});},back(){if(cursor)cursor--;events.dispatchEvent(new Event("popstate"));}},dispatchEvent:(event:Event)=>events.dispatchEvent(event)};
  Object.defineProperty(globalThis,"window",{value:mock,configurable:true});
  try {
    canonicaliseLocation();assert.equal(entries.length,1);assert.equal(resolveNavigation(mock.location.href).id,"creatives");
    navigateTo("brands","brand");assert.equal(entries.length,2);assert.equal(resolveNavigation(mock.location.href).id,"brands");
    mock.history.back();assert.equal(resolveNavigation(mock.location.href).id,"creatives");
    openCreativeRoute("first","brand");assert.equal(resolveNavigation(mock.location.href).adId,"first");
    openCreativeRoute("next","brand");assert.equal(entries.length,2);assert.equal(resolveNavigation(mock.location.href).adId,"next");
    closeCreativeRoute("brand");assert.equal(resolveNavigation(mock.location.href).id,"creatives");
  } finally {if(original)Object.defineProperty(globalThis,"window",original);else Reflect.deleteProperty(globalThis,"window");}
});

test("UI-02/UI-03 canonical creatives and full-page detail are rebuilt and ready",()=>{
  assert.equal(navigation.find(item=>item.id==="creatives")?.rebuilt,"UI-02");
  assert.equal(navigation.find(item=>item.id==="creative")?.rebuilt,"UI-03");
  for(const id of ["creatives","creative"]){const item=navigation.find(item=>item.id===id)!;assert.equal(item.ready,true);}
  const route=resolveNavigation("/?view=creative&brandId=workspace-a&id=creative-a&angle=gifting&layout=table");
  assert.equal(route.id,"creative");assert.equal(route.adId,"creative-a");assert.equal(route.url.searchParams.get("layout"),"table");
});

test("UI-C/UI-D all seven rebuilt routes are ready with correct sidebar titles/groups",()=>{for(const [id,code] of Object.entries({overview:"04",brands:"05",competitors:"06",formats:"07",patterns:"08",audience:"09",winners:"10"})){const item=navigation.find(item=>item.id===id)!;assert.equal(item.ready,true);assert.equal(item.rebuilt,`UI-${code}`);assert.equal(resolveNavigation(`/?view=${id}&brandId=known`).id,id);}assert.equal(navigation.find(item=>item.id==="winners")?.group,"Act");});

test("UI-E/UI-F all remaining screens are ready and budgets retain only operator preparation under Settings",()=>{
  for(const id of ["briefs","creators","scores","ask","reports","data"]){const item=navigation.find(item=>item.id===id)!;assert.equal(item.ready,true);assert.match(item.rebuilt!,/^UI-1[1-6]$/);assert.equal(resolveNavigation(`/?view=${id}`).id,id);}
  assert.equal(navigation.find(item=>item.id==="settings")?.label,"Tests and preparation");
  assert.equal(navigation.find(item=>item.id==="audience")?.label,"Audience & voice");
  assert.equal(navigation.find(item=>item.id==="briefs")?.label,"Opportunities & briefs");
});

test("UI-16 old budget bookmarks redirect to Data sources without losing their target",()=>{
 const route=resolveNavigation("/?view=settings&brandId=real-brand#monthly-budgets");assert.equal(route.id,"data");assert.equal(route.url.searchParams.get("view"),"data");assert.equal(route.url.searchParams.get("brandId"),"real-brand");assert.equal(route.url.hash,"#monthly-budgets");assert.equal(route.redirect,true);
});

test("workspace links keep history, filters and sample scope without intercepting native link actions",()=>{
 const originalWindow=Object.getOwnPropertyDescriptor(globalThis,"window"),originalElement=Object.getOwnPropertyDescriptor(globalThis,"Element");
 let href="https://exter.example/?view=overview&brandId=sample-northwick&demo=1",pushes=0,prevented=false;
 class Link {target="";attrs=new Map([["href","/?view=ads&angle=gifting"]]);get href(){return new URL(this.attrs.get("href")!,href).href;}closest(){return this;}hasAttribute(key:string){return this.attrs.has(key);}getAttribute(key:string){return this.attrs.get(key)||null;}}
 const link=new Link(),event={target:link,button:0,defaultPrevented:false,metaKey:false,ctrlKey:false,shiftKey:false,altKey:false,preventDefault(){prevented=true;}};
 Object.defineProperty(globalThis,"Element",{value:Link,configurable:true});
 Object.defineProperty(globalThis,"window",{value:{location:{get href(){return href;}},history:{state:null,pushState(_s:unknown,_t:string,url:URL){href=String(url);pushes++;}},dispatchEvent(){},scrollTo(){}},configurable:true});
 try{
  followWorkspaceLink(event as unknown as MouseEvent);assert.equal(prevented,true);assert.equal(pushes,1);const route=resolveNavigation(href);assert.equal(route.id,"creatives");assert.equal(route.url.searchParams.get("angle"),"gifting");assert.equal(route.url.searchParams.get("demo"),"1");assert.equal(route.brandId,"sample-northwick");
  for(const patch of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1},{defaultPrevented:true}]){prevented=false;followWorkspaceLink({...event,...patch} as unknown as MouseEvent);assert.equal(prevented,false);}
  for(const attrs of [{href:"#about-data"},{href:"https://external.example/"},{href:"/api/reports/one/download"},{href:"/?view=reports",download:"report"},{href:"/?view=reports",rel:"external"}]){link.attrs=new Map(Object.entries(attrs));prevented=false;followWorkspaceLink(event as unknown as MouseEvent);assert.equal(prevented,false);}
  link.attrs=new Map([["href","/?view=reports"]]);link.target="_blank";prevented=false;followWorkspaceLink(event as unknown as MouseEvent);assert.equal(prevented,false);
  assert.equal(navigateHref("https://external.example/"),false);assert.equal(pushes,1);
 }finally{if(originalWindow)Object.defineProperty(globalThis,"window",originalWindow);else Reflect.deleteProperty(globalThis,"window");if(originalElement)Object.defineProperty(globalThis,"Element",originalElement);else Reflect.deleteProperty(globalThis,"Element");}
});
