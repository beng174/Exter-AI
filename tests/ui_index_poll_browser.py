"""Fixture-only regression for an index refresh that takes longer than five seconds."""
import asyncio,json,shutil,sys,time
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.async_api import async_playwright,expect
F=json.loads(Path('/tmp/exter-index-browser-fixture.json').read_text())
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:3138'
OUT=Path('output/playwright/read-queue');OUT.mkdir(parents=True,exist_ok=True)
async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox']);results=[]
  for view in ['creatives','overview']:
   page=await browser.new_page(viewport={'width':1440,'height':1100},locale='en-GB',timezone_id='Europe/London');errors=[];failed=[];calls=[];active=0;peak=0;external=[]
   page.on('pageerror',lambda error:errors.append(str(error)))
   page.on('requestfailed',lambda req:failed.append(req.url))
   async def route(r):
    nonlocal active,peak
    url=urlparse(r.request.url);p=url.path
    if not r.request.url.startswith(BASE):external.append(r.request.url);await r.abort();return
    if not p.startswith('/api/'):
     await r.continue_();return
    if r.request.method!='GET':await r.abort();return
    if p.endswith('/creatives'):
     n=len(calls)+1;row={'number':n,'start':time.monotonic()};calls.append(row);active+=1;peak=max(peak,active)
     if n==2:await asyncio.sleep(6.5)
     if n==3:await r.fulfill(status=503,json={'error':'The creative library is busy. Please try again shortly.'})
     else:
      value=json.loads(json.dumps(F['pages']['partial' if n<4 else 'creatives']))
      if n==2:value['sql']['indexing']['indexed']=1000
      await r.fulfill(json=value)
     active-=1;row['end']=time.monotonic();return
    if p in ['/api/brands','/api/brand-identities']:value=[F['brand']]
    elif p.endswith('/creative-competitors'):value={'competitors':[]}
    elif p=='/api/brand-research':value=None
    elif p=='/api/public/meta/watchlists':value=[]
    elif p=='/api/infrastructure/status':value={'database':'connected'}
    elif p=='/api/connections':value={'connections':[]}
    elif p=='/api/budgets':value={'budgets':[]}
    elif p.startswith('/api/brand-logos/'):await r.fulfill(status=204);return
    else:await r.fulfill(status=404,json={'error':'No fixture for this read.'});return
    await r.fulfill(body=json.dumps(value),content_type='application/json')
   await page.route('**/*',route)
   await page.goto(f'{BASE}/?view={view}&brandId=workspace')
   await expect(page.get_by_role('status').filter(has_text='Indexing ads: 500 of 20,000')).to_be_visible()
   await expect(page.get_by_role('status').filter(has_text='Indexing ads: 1,000 of 20,000')).to_be_visible(timeout=14000)
   assert len(calls)==2 and peak==1,(calls,peak)
   await expect(page.get_by_role('status').filter(has_text='Showing earlier results.')).to_be_visible(timeout=8000)
   assert await page.locator('main section').count()>0
   assert await page.get_by_text('Clear dates and retry',exact=True).count()==0
   await page.screenshot(path=str(OUT/f'{view}-refresh-delay-1440.png'))
   await page.wait_for_function("()=>document.querySelector('main')&&!document.querySelector('main').innerText.includes('Showing earlier results.')",timeout=8000)
   assert len(calls)==4 and peak==1,(calls,peak)
   assert calls[2]['start']-calls[1]['end']>=4.8,calls
   await page.screenshot(path=str(OUT/f'{view}-recovered-1440.png'))
   assert not errors and not failed and not external,(errors,failed,external)
   results.append({'view':view,'reads':len(calls),'peakConcurrentReads':peak,'slowRefreshSeconds':round(calls[1]['end']-calls[1]['start'],2),'browserErrors':errors,'failedRequests':failed});await page.close()
  (OUT/'results.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results));await browser.close()
asyncio.run(main())
