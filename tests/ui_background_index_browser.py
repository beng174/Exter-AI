"""Browser smoke test of API responses captured from the 20,000-ad SQL fixture.
Run INDEX_FIXTURE_OUTPUT=/tmp/exter-index-browser-fixture.json npm run test:infrastructure,
then python tests/ui_background_index_browser.py against a local Vite preview.
No external requests, paid APIs or production data.
"""
import asyncio,json,os,shutil,sys
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.async_api import async_playwright,expect
F=json.loads(Path(os.environ.get('INDEX_FIXTURE_OUTPUT','/tmp/exter-index-browser-fixture.json')).read_text())
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:3137'
OUT=Path('output/playwright/background-index');OUT.mkdir(parents=True,exist_ok=True)
SCREENS=['brands','competitors','creatives','formats','patterns','audience','winners','briefs','creators','scores','data']
async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1440,'height':1100},locale='en-GB',timezone_id='Europe/London')
  errors=[];external=[];writes=[];partial=False;failed=False
  page.on('pageerror',lambda error:errors.append(str(error)))
  async def route(r):
   req=r.request;url=urlparse(req.url);p=url.path;q=parse_qs(url.query)
   if not req.url.startswith(BASE):external.append(req.url);await r.abort();return
   if not p.startswith('/api/'):
    await r.continue_();return
   if req.method not in ('GET','HEAD'):writes.append(p);await r.fulfill(status=403,json={'error':'Fixture workspace is read-only.'});return
   if p.endswith('/creatives'):
    if failed:await r.fulfill(status=503,json={'error':'Saved ads could not be read: Database statement timed out or was cancelled.'});return
    screen=q.get('screen',['creatives'])[0];value=F['pages']['partial' if partial else screen if screen in F['pages'] else 'creatives']
   elif p in ('/api/brands','/api/brand-identities'):value=[F['brand']]
   elif p.endswith('/creative-competitors'):value={'competitors':[]}
   elif p=='/api/brand-research':value=None
   elif p=='/api/public/meta/watchlists':value=[]
   elif p=='/api/infrastructure/status':value={'meta':{'status':'connected'},'database':'connected','budgets':[],'memory':{'heapUsedBytes':80000000,'heapLimitBytes':200000000,'heapPercent':40,'rssBytes':160000000,'measuredAt':'2026-11-10T00:00:00Z','warning':False}}
   elif p=='/api/connections':value={'connections':[]}
   elif p=='/api/budgets':value={'budgets':[]}
   elif p=='/api/owned/accounts':value={'accounts':[],'liveDispatchEnabled':False}
   elif p=='/api/infrastructure/worker':value={'failures':[]}
   elif p=='/api/creator-discovery/status':value={'runs':[],'segments':[],'creators':[]}
   elif p=='/api/creator-research':value={'brandId':F['brand']['id'],'brandName':F['brand']['name'],'candidates':[],'totalCandidates':0,'seeds':[],'searches':[],'limitations':[],'providerStatus':{'configured':False,'platforms':[]}}
   elif p.endswith('/demo'):value={'opportunities':[]}
   elif p=='/api/reports':value=[]
   elif p=='/api/ad-media/status':value={'enabled':False,'configured':False,'coverage':[],'runs':[],'disk':{'status':'unavailable'}}
   elif p.startswith('/api/brand-logos/'):
    await r.fulfill(status=204);return
   else:await r.fulfill(status=404,json={'error':'No fixture for this read.'});return
   await r.fulfill(body=json.dumps(value),content_type="application/json")
  await page.route('**/*',route)
  for screen in SCREENS:
   await page.goto(f'{BASE}/?view={screen}&brandId=workspace&previews=all')
   await expect(page.locator('main h1')).to_have_count(1)
   await page.wait_for_function("""()=>{const m=document.querySelector('main');return m&&!m.innerText.includes('Reading saved evidence…')&&!m.innerText.includes('Reading saved creative evidence…')&&m.querySelector('section')}""")
   text=await page.locator('main').inner_text()
   assert 'Saved ads could not be read' not in text and 'Saved evidence could not be read' not in text,(screen,text[:1000])
   assert 'Reading saved' not in text,(screen,text[:1000])
   await page.screenshot(path=str(OUT/f'{screen}-1440.png'),full_page=True)
   print(screen+' loaded',flush=True)
  partial=True
  await page.goto(BASE+'/?view=creatives&brandId=workspace')
  await expect(page.get_by_role('status').filter(has_text='Indexing ads: 500 of 20,000')).to_be_visible()
  assert await page.locator('.ui-creative-card').count()>0
  await page.screenshot(path=str(OUT/'partial-Creatives-1440.png'),full_page=True)
  failed=True
  await page.goto(BASE+'/?view=winners&brandId=workspace')
  await expect(page.locator('main')).to_contain_text('Database statement timed out or was cancelled.')
  await page.screenshot(path=str(OUT/'controlled-error-1440.png'),full_page=True)
  assert not errors,errors
  assert not external,external
  assert not writes,writes
  (OUT/'results.json').write_text(json.dumps({'screens':SCREENS,'partialIndex':True,'controlledError':True,'browserErrors':errors,'externalRequests':external,'writes':writes},indent=2)+'\n')
  await browser.close()
asyncio.run(main())
