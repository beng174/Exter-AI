"""Public reach UI fixtures, never live verification.
Run npm run build, start tests/fixtures/m1-server.ts, then python3 this file.
All browser requests stay local; the preview also disables provider logo fetches.
"""
from pathlib import Path
from urllib.parse import urlparse
import json,shutil,subprocess
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright,expect
BASE="http://127.0.0.1:3118"
F=json.loads(subprocess.check_output(["node","--import","tsx","tests/fixtures/meta-ui.ts"]));OUT=Path("output/playwright/meta-library");OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which("chromium"),args=["--no-sandbox"])
 page=browser.new_page(viewport={"width":1440,"height":1100},locale="en-GB",timezone_id="Europe/London")
 errors=[];external=[];writes=[]
 page.on("pageerror",lambda e:errors.append(str(e)))
 def route(r):
  req=r.request;path=urlparse(req.url).path
  if not req.url.startswith(BASE):external.append(req.url);r.abort();return
  if not path.startswith("/api/"):r.continue_();return
  if req.method not in ("GET","HEAD"):
   writes.append({"path":path,"body":req.post_data_json});r.fulfill(json={"saved":True});return
  if path in ("/api/brands","/api/brand-identities"):r.fulfill(json=F["brands"])
  elif path.endswith("/creatives"):r.fulfill(json=F["library"])
  elif path.endswith("/creative-competitors"):r.fulfill(json={"competitors":F["library"]["competitors"]})
  elif path=="/api/brand-research":r.fulfill(json=None)
  elif path=="/api/public/meta/watchlists":r.fulfill(json=F["watchlists"])
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
  expect(dialog).to_be_visible();assert dialog.locator(".meta-watchlist-editor>label").evaluate_all("labels=>labels.every(l=>getComputedStyle(l).display==='grid'&&getComputedStyle(l).textAlign==='left')");expect(dialog.locator("input")).to_have_count(3);expect(dialog).to_contain_text("view_all_page_id")
  if width==1440:dialog.screenshot(path=str(OUT/"watchlist-fixture-1440.png"))
  if width==390:dialog.screenshot(path=str(OUT/"watchlist-fixture-390.png"))
  page.keyboard.press("Escape");expect(dialog).not_to_be_visible()
  page.goto(BASE+"/?brandId=fixture-meta&view=data",wait_until="networkidle")
  page.get_by_role("button",name="Edit watchlist",exact=True).click();expect(page.get_by_role("dialog")).to_be_visible();page.keyboard.press("Escape")
 # Check saving calls only metadata, never a provider or collection action.
 page.goto(BASE+"/?brandId=fixture-meta&view=competitors",wait_until="networkidle");page.get_by_role("button",name="Edit watchlist",exact=True).click()
 page.get_by_label("Fixture Hearth Meta Page ID",exact=True).fill("99");page.get_by_role("button",name="Save Page IDs",exact=True).click();page.wait_for_timeout(500)
 assert len(writes)==1 and writes[0]["path"].startswith("/api/public/meta/watchlists/") and writes[0]["body"]["pageIds"]==["99"],writes
 assert not errors,errors
 assert not external,external
 browser.close()
print("24 affected screen/width checks, both watchlist entry points, Escape and metadata-only save passed; no external requests")
