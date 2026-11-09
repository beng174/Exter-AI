"""Public media and like-for-like UI: fictional API fixtures; all external requests blocked."""
import asyncio,io,json,shutil,subprocess
from PIL import Image,ImageDraw
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright,expect
BASE='http://127.0.0.1:3138';OUT=Path('output/playwright/public-media-comparisons');OUT.mkdir(parents=True,exist_ok=True)
F=json.loads(subprocess.check_output(['node','--import','tsx','tests/fixtures/public-media-ui.ts']))
# A tiny raster fixture supplies the stored-image response; no remote file is fetched.
raster=Image.new('RGB',(400,500),'#e7dfd2');draw=ImageDraw.Draw(raster);draw.rounded_rectangle((134,200,266,360),16,fill='#f8f4eb',outline='#b4a68f',width=2);draw.rectangle((136,196,264,212),fill='#91745e');draw.text((170,266),'SAMPLE',fill='#69554a');buffer=io.BytesIO();raster.save(buffer,format='PNG');PNG=buffer.getvalue()
VIEWS=[('Home','overview'),('BrandResearch','brands'),('Competitors','competitors'),('Creatives','creatives'),('CreativeDetail','creative'),('Formats','formats'),('Patterns','patterns'),('Winners','winners'),('Briefs','briefs'),('DataSources','data')]
async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
  page=await browser.new_page(locale='en-GB',timezone_id='Europe/London');errors=[];external=[];writes=[];cases=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  async def route(r):
   req=r.request;path=urlparse(req.url).path
   if not req.url.startswith(BASE):external.append(req.url);await r.abort();return
   if path=='/fixture-video.mp4':await r.fulfill(status=204);return
   if not path.startswith('/api/'):await r.continue_();return
   if req.method not in ('GET','HEAD'):
    writes.append(path)
    if path.endswith('/primary-categories'):
     F['library']['brand']['primaryCategories']=req.post_data_json['categories'];await r.fulfill(json={'primaryCategories':F['library']['brand']['primaryCategories']});return
    await r.fulfill(status=403,json={'error':'Fixture action is disabled.'});return
   if path in ('/api/brands','/api/brand-identities'):value=F['brands']
   elif path.endswith('/creatives'):value=F['library']
   elif path.endswith('/creative-competitors'):value={'competitors':F['library']['competitors']}
   elif path=='/api/brand-research':value=None
   elif path=='/api/public/meta/watchlists':value=[]
   elif path=='/api/infrastructure/status':value={'meta':{'status':'connected'},'database':'connected'}
   elif path=='/api/connections':value={'connections':[]}
   elif path=='/api/budgets':value={'budgets':[]}
   elif path=='/api/owned/accounts':value={'accounts':[],'liveDispatchEnabled':False}
   elif path=='/api/reports':value=[]
   elif path=='/api/creator-research':value={'candidates':[],'totalCandidates':0,'providerStatus':{'configured':False,'platforms':[]}}
   elif path.endswith('/demo'):value={'opportunities':[]}
   elif path=='/api/public-categories/status':value={'enabled':True,'configured':True,'batches':[{'id':'fixture-batch','status':'running','ads':420,'error':None,'createdAt':'2026-11-08T20:00:00Z','finishedAt':None,'costGbp':.03,'costStatus':'reserved'}]}
   elif path=='/api/ad-media/status':value={'enabled':True,'configured':True,'coverage':[],'runs':[],'disk':{'status':'unavailable'}}
   elif path.startswith('/api/ad-media/files/'):
    await r.fulfill(body=PNG,content_type='image/png');return
   elif path.startswith('/api/brand-logos/'):
    await r.fulfill(status=204);return
   else:await r.fulfill(status=404,json={'error':'No fixture for this read.'});return
   await r.fulfill(json=value)
  await page.route('**/*',route)
  async def ready(view):
   await expect(page.locator('main.reference-ui')).to_have_attribute('data-screen',view)
   await page.wait_for_function("""()=>{const m=document.querySelector('main.reference-ui');return m&&m.querySelector('section')&&!m.innerText.includes('Reading saved evidence…')&&!m.innerText.includes('Reading saved creative evidence…')}""")
   await expect(page.locator('main h1')).to_have_count(1)
   assert not errors,errors
  async def go(view):
   suffix='&id=fixture-public-0' if view=='creative' else ''
   await page.goto(BASE+'/?brandId=public-ui&view='+view+suffix);await ready(view)
  await page.set_viewport_size({'width':1440,'height':1100});await go('overview')
  market=page.get_by_role('region',name='Saved activity scorecard',exact=True)
  await expect(market).to_contain_text('Video · you 46 ads · competitors 312');await expect(market).to_contain_text('Static image · you 12 ads · competitors 20')
  share=market.get_by_role('row').filter(has_text='Share of voice by reach').first
  average_href=await share.locator('a.research-number').nth(1).get_attribute('href');assert 'reachCountry=GB' in average_href and 'kind=all' in average_href and 'adFormat=video' in average_href
  await expect(page.get_by_text('Hidden: Carousel.',exact=False)).to_be_visible()
  await expect(page.get_by_role('region',name='Your account',exact=True)).to_contain_text('£100.00')
  await page.get_by_label('Comparison category',exact=True).select_option('fashion')
  await expect(market).to_contain_text('Video · you 0 ads · competitors 15')
  await expect(page.get_by_role('region',name='Your account',exact=True)).to_contain_text('£100.00')
  await go('competitors');switch=page.get_by_role('group',name='Chart format',exact=True)
  await expect(switch.get_by_role('button',name='Video',exact=True)).to_have_attribute('aria-pressed','true')
  await switch.get_by_role('button',name='Static image',exact=True).click();await expect(switch.get_by_role('button',name='Static image',exact=True)).to_have_attribute('aria-pressed','true')
  await expect(page.get_by_role('region',name='You and configured competitors',exact=True)).to_contain_text('Video · you 46 ads · competitors 312')
  await go('creatives');await expect(page.get_by_label('Media coverage',exact=True)).to_contain_text('420 ads')
  cards=page.locator('.ui-creative-card')
  for i in (0,1,2):
   await page.goto(BASE+f'/?brandId=public-ui&view=creatives&ad=fixture-public-{i}');await ready('creatives');await expect(cards).to_have_count(1)
   if i==2:
    await expect(cards).to_contain_text('No preview from Meta');assert 'expired' in await cards.locator('.ui-ad-preview').get_attribute('title')
   else:await expect(cards).not_to_contain_text('No preview from Meta')
   await expect(cards).to_contain_text('Modelled');await expect(cards).to_contain_text('Open in Ad Library')
  await go('creative');await expect(page.get_by_role('region',name='In the market',exact=True)).to_contain_text('312 similar ads')
  await expect(page.get_by_label('Comparison format',exact=True)).to_be_disabled()
  await page.get_by_role('button',name='312 similar ads',exact=True).click();await ready('creatives');assert 'similarTo=fixture-public-0' in page.url and 'adFormat=video' in page.url
  await expect(page.get_by_label('Media coverage',exact=True)).to_contain_text('420 ads')
  await go('brands');await page.get_by_role('button',name='Edit categories',exact=True).click()
  await page.get_by_role('checkbox',name='home fragrance',exact=True).uncheck();await page.get_by_role('checkbox',name='candles',exact=True).uncheck();await page.get_by_role('checkbox',name='fashion',exact=True).check();await page.get_by_role('button',name='Save categories',exact=True).click()
  await expect(page.locator('.research-primary-categories')).to_contain_text('fashion');assert F['library']['brand']['primaryCategories']==['fashion']
  F['library']['brand']['primaryCategories']=['home fragrance','candles']
  for width in (1280,1440,1920):
   await page.set_viewport_size({'width':width,'height':1100})
   for name,view in VIEWS:
    await go(view);assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth'),(name,width)
    if width==1440:await page.screenshot(path=str(OUT/f'{name}-1440.png'),full_page=True)
    cases.append({'screen':name,'width':width})
  for name,view in [('Home','overview'),('Creatives','creatives'),('CreativeDetail','creative'),('DataSources','data')]:
   await page.set_viewport_size({'width':390,'height':1000});await go(view);assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth'),name
   await page.screenshot(path=str(OUT/f'{name}-390.png'),full_page=True);cases.append({'screen':name,'width':390})
  assert not errors and not external and len(writes)==1,(errors,external,writes)
  await browser.close();(OUT/'audit.json').write_text(json.dumps({'cases':cases,'providerCalls':0,'externalRequests':0,'fixtureCategorySaves':len(writes)},indent=2)+'\n')
  print('PASS',len(cases),'screen/width cases, grouped samples, hidden groups, chart switch, private-account preservation, preview days, matching links and category editing; no external/provider calls.')
asyncio.run(main())
