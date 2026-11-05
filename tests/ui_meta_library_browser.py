"""Public reach UI fixtures, never live verification.
Run npm run build, start tests/fixtures/m1-server.ts, then python3 this file.
All browser requests stay local; the preview also disables provider logo fetches.
"""
from pathlib import Path
from urllib.parse import urlparse
import json,shutil,subprocess,copy,io
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright,expect
BASE="http://127.0.0.1:3118"
F=json.loads(subprocess.check_output(["node","--import","tsx","tests/fixtures/meta-ui.ts"]));OUT=Path("output/playwright/meta-library");OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which("chromium"),args=["--no-sandbox"])
 page=browser.new_page(viewport={"width":1440,"height":1100},locale="en-GB",timezone_id="Europe/London")
 errors=[];external=[];writes=[];lookups=[];candidate_mode=False;confirmed_page=None
 candidate_calls=0
 portrait=Image.new("RGB",(64,64),"#21336b");draw=ImageDraw.Draw(portrait);draw.ellipse((21,10,43,32),fill="#dce7f2");draw.ellipse((12,34,52,77),fill="#dce7f2");buffer=io.BytesIO();portrait.save(buffer,format="PNG");png=buffer.getvalue()
 page.on("pageerror",lambda e:errors.append(str(e)))
 def route(r):
  global candidate_calls,confirmed_page
  req=r.request;path=urlparse(req.url).path
  if not req.url.startswith(BASE):external.append(req.url);r.abort();return
  if not path.startswith("/api/"):r.continue_();return
  if path=="/api/public/meta/page-candidates":
   lookups.append(req.post_data_json);candidate_calls+=1
   assert candidate_mode and req.post_data_json["brandKey"]=="name:fixture hearth"
   value={"id":"fixture-lookup","brandKey":"name:fixture hearth","brandName":"Fixture Hearth","websiteDomain":"fixture-hearth.example","adsSearched":27,"complete":True,"limited":False,"canSearchMore":False,"checkedAt":"2026-11-05T09:00:00Z","candidates":[
    {"pageId":"991","pageName":"Fixture Hearth Studio","adCount":5,"domainMatchedAds":4,"nameMatch":0.66,"example":{"id":"6101","copy":"A warm welcome, made for your evening.","url":"https://www.facebook.com/ads/library/?id=6101"}},
    {"pageId":"992","pageName":"Fixture Hearth","adCount":20,"domainMatchedAds":0,"nameMatch":1,"example":{"id":"6201","copy":"A fictional example from another Page.","url":"https://www.facebook.com/ads/library/?id=6201"}},
    {"pageId":"993","pageName":"Fictional Market","adCount":2,"domainMatchedAds":0,"nameMatch":0,"example":{"id":"6301","copy":"A second fictional advertiser.","url":"https://www.facebook.com/ads/library/?id=6301"}}]}
   if candidate_calls==1:r.fulfill(status=429,json={**value,"candidates":[],"adsSearched":0,"complete":False,"waiting":True,"retryAfterSeconds":1},headers={"Retry-After":"1"})
   else:r.fulfill(json=value)
   return
  if path.startswith("/api/public/meta/page-candidates/") and path.endswith("/picture"):
   assert req.post_data_json["workspaceId"]=="fixture-meta"
   r.fulfill(body=png,content_type="image/png");return
  if req.method not in ("GET","HEAD"):
   if path.startswith("/api/public/meta/watchlists/") and candidate_mode:confirmed_page=req.post_data_json["pageIds"][0]
   writes.append({"path":path,"body":req.post_data_json});r.fulfill(json={"saved":True});return
  if path in ("/api/brands","/api/brand-identities"):r.fulfill(json=F["brands"])
  elif path.endswith("/creatives"):r.fulfill(json=F["library"])
  elif path.endswith("/creative-competitors"):r.fulfill(json={"competitors":F["library"]["competitors"]})
  elif path=="/api/brand-research":r.fulfill(body="null",content_type="application/json")
  elif path=="/api/public/meta/watchlists":
   lists=copy.deepcopy(F["watchlists"])
   if candidate_mode:lists[1]["page_ids"]=[confirmed_page] if confirmed_page else []
   r.fulfill(json=lists)
  elif path=="/api/infrastructure/status":r.fulfill(json={"meta":{"status":"configured","enabled":True},"database":"connected"})
  elif path=="/api/connections":r.fulfill(json={"connections":[]})
  elif path=="/api/budgets":r.fulfill(json={"budgets":[]})
  elif path=="/api/owned/accounts":r.fulfill(json={"accounts":[],"liveDispatchEnabled":False})
  elif path=="/api/reports":r.fulfill(json=[])
  elif path=="/api/creator-research":r.fulfill(json={"results":[],"shortlist":[],"fits":[]})
  elif path.endswith("/demo"):r.fulfill(json={"opportunities":[]})
  elif path.startswith("/api/brand-logos/"):r.fulfill(status=204)
  else:r.continue_()
 page.route("**/*",route)
 screens={"Main":"overview","Competitors":"competitors","Creatives":"creatives","CreativeDetail":"creative&id=fixture-ad-1","Audience":"audience","DataSources":"data"}
 for width in (1280,1440,1920,390):
  page.set_viewport_size({"width":width,"height":1100})
  for name,view in screens.items():
   page.goto(BASE+"/?brandId=fixture-meta&view="+view,wait_until="networkidle")
   assert page.locator("main h1").count()==1,(name,width)
   assert not page.evaluate("document.documentElement.scrollWidth>innerWidth"),(name,width)
   if name in ("Main","Competitors"):
    row=page.get_by_role("row").filter(has_text="Share of voice by reach")
    expect(row.locator(".ui-table-basis")).to_contain_text("Estimated")
   if name=="Creatives":expect(page.locator(".ui-creative-card").first).to_contain_text("UK reach")
   if name=="CreativeDetail":expect(page.get_by_role("region",name="Performance",exact=True)).to_contain_text("3,000")
   if name=="Audience":expect(page.get_by_role("region",name="Who the ads reach",exact=True)).to_contain_text("1,800")
   if name=="DataSources":
    row=page.get_by_role("row").filter(has_text="Meta Ad Library API")
    expect(row).to_contain_text("Connected");expect(row).to_contain_text("5 Nov 2026")
   if width==1440:
    page.screenshot(path=str(OUT/(name+"-fixture-1440.png")),full_page=True)
    app=Image.open(OUT/(name+"-fixture-1440.png")).convert("RGB");ref=Image.open("design/reference/png/"+name+".png").convert("RGB")
    canvas=Image.new("RGB",(2880,max(app.height,ref.height)+44),"#f5f5f5");canvas.paste(app,(0,44));canvas.paste(ref,(1440,44));d=ImageDraw.Draw(canvas);d.text((24,14),"APP: FICTIONAL FIXTURE DATA, NOT LIVE VERIFICATION",fill="black");d.text((1464,14),"APPROVED REFERENCE",fill="black");canvas.save(OUT/(name+"-comparison.png"))
  page.goto(BASE+"/?brandId=fixture-meta&view=competitors",wait_until="networkidle")
  page.get_by_role("button",name="Edit watchlist",exact=True).click();dialog=page.get_by_role("dialog",name="Edit watchlist",exact=True)
  expect(dialog).to_be_visible();assert dialog.locator(".meta-watchlist-target>label").evaluate_all("labels=>labels.every(l=>getComputedStyle(l).display==='grid'&&getComputedStyle(l).textAlign==='left')");expect(dialog.locator("input")).to_have_count(3);expect(dialog).to_contain_text("view_all_page_id")
  if width==1440:dialog.screenshot(path=str(OUT/"watchlist-fixture-1440.png"))
  if width==390:dialog.screenshot(path=str(OUT/"watchlist-fixture-390.png"))
  page.keyboard.press("Escape");expect(dialog).not_to_be_visible()
  page.goto(BASE+"/?brandId=fixture-meta&view=data",wait_until="networkidle")
  page.get_by_role("button",name="Edit watchlist",exact=True).click();expect(page.get_by_role("dialog")).to_be_visible();page.keyboard.press("Escape")
 # Missing Page IDs start suggestions only, from both entry points; confirmation alone saves.
 assert not lookups and not writes
 candidate_mode=True
 for width in (1440,390):
  page.set_viewport_size({"width":width,"height":1100})
  for view in ("competitors","data"):
   confirmed_page=None
   page.goto(BASE+"/?brandId=fixture-meta&view="+view,wait_until="networkidle")
   page.get_by_role("button",name="Edit watchlist",exact=True).click();dialog=page.get_by_role("dialog",name="Edit watchlist",exact=True)
   expect(dialog.get_by_role("button",name="Confirm Fixture Hearth Studio for Fixture Hearth",exact=True)).to_be_visible(timeout=10000)
   expect(dialog).to_contain_text("27 ads searched");expect(dialog).to_contain_text("4 links to fixture-hearth.example")
   expect(dialog.locator(".meta-page-suggestions li")).to_have_count(3)
   expect(dialog.locator(".meta-page-suggestions li").first).to_contain_text("Fixture Hearth Studio")
   expect(dialog.locator(".meta-page-picture img").first).to_have_attribute("alt","")
   assert dialog.locator(".meta-page-picture img").first.evaluate("img=>img.complete&&img.naturalWidth>0")
   assert not writes,"Suggestions must never save automatically"
   assert not page.evaluate("document.documentElement.scrollWidth>innerWidth")
   assert dialog.evaluate("el=>el.scrollWidth<=el.clientWidth")
   dialog.screenshot(path=str(OUT/f"page-suggestions-{view}-{width}.png"))
   page.keyboard.press("Escape")
 page.goto(BASE+"/?brandId=fixture-meta&view=competitors",wait_until="networkidle");page.get_by_role("button",name="Edit watchlist",exact=True).click()
 page.get_by_role("button",name="Confirm Fixture Hearth Studio for Fixture Hearth",exact=True).click();page.wait_for_timeout(500)
 assert len(writes)==1 and writes[0]["body"]["pageIds"]==["991"] and writes[0]["body"]["brandKey"]=="name:fixture hearth",writes
 # Manual entry remains a separate, explicit metadata save.
 candidate_mode=False;confirmed_page=None;writes.clear()
 # Check saving calls only metadata, never a provider or collection action.
 page.goto(BASE+"/?brandId=fixture-meta&view=competitors",wait_until="networkidle");page.get_by_role("button",name="Edit watchlist",exact=True).click()
 page.get_by_label("Fixture Hearth Meta Page ID",exact=True).fill("99");page.get_by_role("button",name="Save Page IDs",exact=True).click();page.wait_for_timeout(500)
 assert len(writes)==1 and writes[0]["path"].startswith("/api/public/meta/watchlists/") and writes[0]["body"]["pageIds"]==["99"],writes
 assert not errors,errors
 assert not external,external
 browser.close()
print("24 screen/width checks plus suggestions at 1440px and 390px in both entry points, explicit confirmation, manual save and no external requests passed")
