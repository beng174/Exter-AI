"""Large fictional workspace loading comparison. All APIs are fixtures; external access is blocked.
Build the parent and changed revisions, serve their dist directories, then run with
before http://127.0.0.1:3136 or after http://127.0.0.1:3137.
"""
import asyncio,json,shutil,subprocess,sys,time
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.async_api import async_playwright,expect
PHASE=sys.argv[1] if len(sys.argv)>1 else 'after'
BASE=sys.argv[2] if len(sys.argv)>2 else 'http://127.0.0.1:3137'
OUT=Path('output/playwright/workspace-loading');OUT.mkdir(parents=True,exist_ok=True)
F=json.loads(subprocess.check_output(['node','--import','tsx','tests/fixtures/workspace-loading-data.ts']))
VIEWS=[('Home','overview'),('BrandResearch','brands'),('Competitors','competitors'),('Creatives','creatives'),('CreativeDetail','creative'),('Formats','formats'),('Patterns','patterns'),('Audience','audience'),('Winners','winners'),('Briefs','briefs'),('Creators','creators'),('Scores','scores'),('Ask','ask'),('Reports','reports'),('DataSources','data')]
async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1440,'height':1100},locale='en-GB',timezone_id='Europe/London')
  errors=[];external=[];writes=[];requests=[];libraries=[];documents=[];steps=[];bodies={}
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.on('request',lambda request:documents.append(request.url) if request.is_navigation_request() and request.frame==page.main_frame else None)
  async def route(r):
   req=r.request;url=urlparse(req.url);path=url.path;q=parse_qs(url.query);sample=q.get('demo')==['1'];S=F['sample'];L=S['library'] if sample else F['library'];brands=S['brands'] if sample else F['brands']
   if not req.url.startswith(BASE):external.append(req.url);await r.abort();return
   if not path.startswith('/api/'):
    await r.continue_();return
   requests.append(path)
   if req.method not in ('GET','HEAD'):
    writes.append(path);await r.fulfill(status=403,json={'error':'Fixture workspace is read-only.'});return
   if path.endswith('/creatives'):
    libraries.append({'sample':sample,'query':url.query});await asyncio.sleep(.6)
    window={'from':'2026-11-02','to':'2026-11-08'} if q.get('window')==['research'] else L['reportingRange'].copy()
    for key in ('from','to'):
     if key in q:window[key]=q[key][0]
    key=(sample,window['from'],window['to'])
    if key not in bodies:bodies[key]=json.dumps({**L,'reportingRange':window},separators=(',',':'))
    libraries[-1]['bytes']=len(bodies[key].encode());await r.fulfill(body=bodies[key],content_type='application/json');return
   await asyncio.sleep(.15)
   if path in ('/api/brands','/api/brand-identities'):value=brands
   elif path.endswith('/creative-competitors'):value={'competitors':L['competitors']}
   elif path=='/api/brand-research':value=S['research'] if sample else None
   elif path=='/api/public/meta/watchlists':value=[]
   elif path=='/api/infrastructure/status':value={'meta':{'status':'connected'},'database':'connected'}
   elif path=='/api/connections':value={'connections':[]}
   elif path=='/api/budgets':value={'budgets':[]}
   elif path=='/api/owned/accounts':value={'accounts':[],'liveDispatchEnabled':False}
   elif path=='/api/reports':value=S['reports'] if sample else []
   elif path=='/api/creator-research':value=S['creators'] if sample else {'brandId':F['brand']['id'],'brandName':F['brand']['name'],'candidates':[],'totalCandidates':0,'seeds':[],'searches':[],'limitations':[],'providerStatus':{'configured':False,'platforms':[]}}
   elif path.endswith('/demo'):value=S['drafts'] if sample else {'opportunities':[]}
   elif path=='/api/ad-media/status':value={'enabled':False,'configured':False,'coverage':[],'runs':[],'disk':{'status':'unavailable'}}
   elif path.startswith('/api/brand-logos/'):
    await r.fulfill(status=204);return
   else:
    await r.fulfill(status=404,json={'error':'No fixture for this read.'});return
   await r.fulfill(json=value)
  await page.route('**/*',route)
  async def ready(view):
   await expect(page.locator('main.reference-ui')).to_have_attribute('data-screen',view)
   await page.wait_for_function("""()=>{const m=document.querySelector('main.reference-ui');return m&&m.querySelector('section')&&!m.innerText.includes('Reading saved evidence…')&&!m.innerText.includes('Reading saved creative evidence…')}""")
   await expect(page.locator('main h1')).to_have_count(1)
   assert not await page.get_by_text('Saved evidence could not be read.',exact=True).count()
  async def step(label,view,action):
   initial=len(libraries);start=time.monotonic();await action();await ready(view)
   steps.append({'step':label,'ms':round((time.monotonic()-start)*1000),'libraryRequests':len(libraries)-initial});print(PHASE,steps[-1],flush=True)
  async def sidebar(view):await page.locator(f'#main-sidebar .nav-item[href*="view={view}&"]').click()
  await step('Cold Home','overview',lambda:page.goto(BASE+'/?view=overview&brandId=loading-fixture'))
  await page.screenshot(path=str(OUT/f'{PHASE}-Home-1440.png'),full_page=True)
  await step('Weekly report link','reports',lambda:page.get_by_role('link',name='Weekly report',exact=True).click())
  await step('Creatives','creatives',lambda:sidebar('creatives'))
  await page.screenshot(path=str(OUT/f'{PHASE}-Creatives-1440.png'),full_page=True)
  await step('Creative detail','creative',lambda:page.locator('.ui-creative-open').first.click())
  await page.screenshot(path=str(OUT/f'{PHASE}-CreativeDetail-1440.png'),full_page=True)
  await step('Winners','winners',lambda:sidebar('winners'))
  await page.screenshot(path=str(OUT/f'{PHASE}-Winners-1440.png'),full_page=True)
  await step('Scores','scores',lambda:sidebar('scores'))
  await step('Data sources','data',lambda:sidebar('data'))
  await step('Return Home','overview',lambda:sidebar('overview'))
  await step('Market count link','creatives',lambda:page.locator('.reference-source-count').click())
  await step('Browser back','overview',lambda:page.go_back())
  comparison={'steps':steps,'libraryRequests':len(libraries),'uncompressedLibraryBytes':sum(row.get('bytes',0) for row in libraries),'documentLoads':len(documents),'apiRequests':len(requests)}
  if PHASE=='after':
   assert comparison['libraryRequests']==2,comparison
   assert comparison['documentLoads']==1,comparison
   assert requests.count('/api/infrastructure/status')==1,requests
   assert '/api/creator-research' not in requests and not any(path.endswith('/demo') for path in requests),requests
   # A filter row and an evidence link keep their URL and loaded library in the app.
   await sidebar('winners');await ready('winners');await page.locator('main tbody tr').first.click();await ready('creatives')
   assert len(libraries)==2 and len(documents)==1
   await page.goto(BASE+'/?view=creatives&brandId=loading-fixture&layout=table');await ready('creatives')
   await expect(page.locator('main tbody tr')).to_have_count(50)
   paging=page.locator('.ui-table-pagination');await expect(paging).to_contain_text('Showing 1 to 50 of 7,800')
   await paging.get_by_role('button',name='Next',exact=True).click();await expect(paging).to_contain_text('Showing 51 to 100 of 7,800')
   await expect(page.locator('main tbody tr')).to_have_count(50)
   await page.get_by_role('columnheader',name='Source',exact=True).get_by_role('button').click();await expect(paging).to_contain_text('Showing 1 to 50 of 7,800')
   await expect(page.locator('main tbody tr').first).to_contain_text('Fictional Hearth')
   assert all('Fictional Hearth' in cell for cell in await page.locator('main tbody td[data-label=Source]').all_text_contents()),'Sort must use all 7,800 rows'
   await paging.get_by_role('button',name='Next',exact=True).click();await expect(paging).to_contain_text('Showing 51 to 100 of 7,800')
   await paging.get_by_role('button',name='Previous',exact=True).click();await expect(paging).to_contain_text('Showing 1 to 50 of 7,800')
   # Direct detail links, explicit reporting dates, and sample-to-real isolation.
   await page.goto(BASE+'/?view=creative&id=loading-ad-0&brandId=loading-fixture');await ready('creative')
   assert 'A quiet evening' in await page.locator('main h1').inner_text()
   await page.goto(BASE+'/?view=overview&brandId=loading-fixture&from=2026-10-25&to=2026-10-31');await ready('overview')
   assert any('from=2026-10-25' in row['query'] and 'to=2026-10-31' in row['query'] for row in libraries)
   await page.goto(BASE+'/?view=overview&demo=1&brandId='+F['sample']['id']);await ready('overview')
   for name,view in VIEWS:
    if view=='creative':
     await page.goto(BASE+'/?view=creative&id='+F['sample']['library']['creatives'][0]['adId']+'&demo=1&brandId='+F['sample']['id'])
    else:await sidebar(view)
    print('Checking sample',view,flush=True);await ready(view);await expect(page.locator('.ui-page-header')).to_contain_text('Sample data')
    assert not await page.locator('main').get_by_text(F['brand']['name'],exact=True).count(),view
   await page.set_viewport_size({'width':390,'height':1000});await page.reload();await ready('data');assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
   await page.screenshot(path=str(OUT/'after-DataSources-sample-390.png'),full_page=True)
   comparison['sampleScreens']=len(VIEWS);comparison['mobileOverflow']=False
   await page.set_viewport_size({'width':1440,'height':1100});await page.goto(BASE+'/?view=overview&brandId=loading-fixture');await ready('overview')
   for name,view in VIEWS:
    if view=='creative':await page.goto(BASE+'/?view=creative&id=loading-ad-0&brandId=loading-fixture')
    else:await sidebar(view)
    print('Checking real',view,flush=True);await ready(view)
    assert 'Sample data' not in await page.locator('main h1').inner_text(),view
   comparison['realScreens']=len(VIEWS)
   for width in (1280,1920):
    await page.set_viewport_size({'width':width,'height':1100})
    for sample in (False,True):
     brand=F['sample']['id'] if sample else F['brand']['id'];flag='&demo=1' if sample else ''
     await page.goto(BASE+'/?view=overview&brandId='+brand+flag);await ready('overview')
     for _,view in VIEWS:
      if view=='creative':
       ad=F['sample']['library']['creatives'][0]['adId'] if sample else 'loading-ad-0'
       await page.goto(BASE+'/?view=creative&id='+ad+'&brandId='+brand+flag)
      else:await sidebar(view)
      await ready(view);assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth'),(sample,width,view)
   comparison['screenWidthCases']=90
   await page.set_viewport_size({'width':390,'height':1000});await page.goto(BASE+'/?view=creatives&layout=table&brandId=loading-fixture');await ready('creatives')
   await expect(page.locator('main tbody tr')).to_have_count(50);assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
   await page.screenshot(path=str(OUT/'after-Creatives-table-390.png'),full_page=True)
  assert not errors and not external and not writes,(errors,external,writes)
  (OUT/f'{PHASE}-timings.json').write_text(json.dumps(comparison,indent=2)+'\n')
  print(json.dumps(comparison,indent=2));await browser.close()
asyncio.run(main())
