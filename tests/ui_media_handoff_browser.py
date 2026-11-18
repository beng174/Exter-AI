"""Fictional retained-media pipeline fixture; no external requests or paid calls."""
import asyncio,base64,json,shutil,sys,time
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright,expect
F=json.loads(Path('/tmp/exter-media-preview-fixture.json').read_text())
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:3139'
OUT=Path('output/playwright/media-handoff');OUT.mkdir(parents=True,exist_ok=True)
BRAND={'id':'workspace','name':'Fictional Bottle House','domain':'bottles.fixture.example','category':'Reusable water bottles','primaryCategories':['reusable water bottles'],'color':'#427f94','initials':'FB','voice':[],'competitors':[],'mode':'imported','createdAt':'2026-11-18'}
async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox']);page=await browser.new_page(viewport={'width':1440,'height':1100},locale='en-GB',timezone_id='Europe/London')
  errors=[];external=[];reads=[];phase='before';images=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  async def route(r):
   req=r.request;p=urlparse(req.url).path
   if not req.url.startswith(BASE):external.append(req.url);await r.abort();return
   if not p.startswith('/api/'):
    await r.continue_();return
   if req.method!='GET':await r.abort();raise AssertionError('No writes are allowed.')
   if p in F['assets']:images.append(p);await r.fulfill(body=base64.b64decode(F['assets'][p]),content_type='image/png');return
   if p.endswith('/creatives'):
    reads.append({'phase':phase,'at':time.monotonic()});value={'brand':BRAND,'creatives':F[phase],'competitors':[],'sources':[],'ownedStatus':'not_configured','mediaReadStatus':'available','mediaCollectionEnabled':True,'dateRange':{'from':'2026-01-22','to':'2026-11-18'},'lastChecked':'2026-11-18','reportingRange':{'from':'2026-01-01','to':'2026-11-18'}}
   elif p in ['/api/brands','/api/brand-identities']:value=[BRAND]
   elif p.endswith('/creative-competitors'):value={'competitors':[]}
   elif p.startswith('/api/brand-logos/'):await r.fulfill(status=204);return
   else:await r.fulfill(status=404,json={'error':'No fixture for this read.'});return
   await r.fulfill(json=value)
  await page.route('**/*',route)
  await page.goto(BASE+'/?view=creatives&brandId=workspace')
  cards=page.locator('.ui-creative-card');await expect(cards).to_have_count(4)
  await expect(page.get_by_role('link',name='Manage previews')).to_have_attribute('href','/?view=data&brandId=workspace#ads-without-media')
  await expect(page.get_by_text('Preview not collected',exact=True)).to_have_count(4)
  for card in await cards.all():await expect(card.locator('h3')).to_have_count(1)
  assert 'During this backfill' not in await page.locator('main').inner_text()
  await page.screenshot(path=str(OUT/'pending-1440.png'))
  await page.set_viewport_size({'width':390,'height':844});await page.screenshot(path=str(OUT/'pending-390.png'))
  await page.set_viewport_size({'width':1440,'height':1100});phase='after'
  await page.wait_for_function("()=>{const images=[...document.querySelectorAll('.ui-creative-poster>img')];return images.length===4&&images.every(img=>img.complete&&img.naturalWidth===320)}",timeout=40000)
  assert len(reads)==2,reads
  await expect(page.get_by_text('Preview not collected',exact=True)).to_have_count(0)
  await expect(page.get_by_role('link',name='Manage previews')).to_have_count(0)
  await page.screenshot(path=str(OUT/'retained-1440.png'))
  await page.set_viewport_size({'width':390,'height':844});await page.screenshot(path=str(OUT/'retained-390.png'))
  assert not errors and not external,(errors,external)
  result={'ads':4,'decodedImages':len(images),'automaticRefreshes':len(reads)-1,'secondsToRefresh':round(reads[1]['at']-reads[0]['at'],1),'browserErrors':errors,'externalRequests':external}
  (OUT/'results.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));await browser.close()
asyncio.run(main())
