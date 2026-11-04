import test from "node:test";
import assert from "node:assert/strict";
import { navigation, navigationGroups, visibleNavigation, resolveNavigation, viewForScreen, navigateTo, canonicaliseLocation, openCreativeRoute, closeCreativeRoute } from "../src/navigation.js";
import type { Page } from "../shared/types.js";

test("UI-00 config has unique canonical IDs, ordered groups and only existing ready screens",()=>{
  assert.equal(new Set(navigation.map(item=>item.id)).size,navigation.length);
  assert.deepEqual(navigationGroups,["Overview","Research","Act","Share","Settings"]);
  const screens:Page[]=["overview","brand","competitors","ads","formats","audiences","creators","reports","sources","settings","demo","labelling"];
  for(const item of navigation) {
    assert.ok(navigationGroups.includes(item.group));
    if(item.ready)assert.ok(item.screen && screens.includes(item.screen),item.id);
    else assert.equal(item.screen,null,item.id);
  }
  for(const screen of screens)assert.equal(resolveNavigation(`/?view=${viewForScreen(screen)}&demo=1`).screen,screen);
  const visible=visibleNavigation().flatMap(group=>group.items.map(item=>item.id));
  assert.deepEqual(visible,["overview","brands","competitors","creatives","formats","audience","creators","reports","data","settings","labelling"]);
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
