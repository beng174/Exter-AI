"""Exter readability regression fixtures. No external requests or provider calls.
Build, start tests/fixtures/m1-server.ts, then run this file with before or after.
"""
from pathlib import Path
from urllib.parse import urlparse,parse_qs
import json,shutil,subprocess,sys,copy
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:3118';OUT=Path('output/playwright/readability');OUT.mkdir(parents=True,exist_ok=True)
phase=sys.argv[1] if len(sys.argv)>1 else 'after'
F=json.loads(subprocess.check_output(['node','--import','tsx','tests/fixtures/meta-ui.ts']))
long_copy='Fixture Hearth makes a quiet evening feel special. '+('Thoughtfully made fragrance brings warmth to your home, with a scent for every room and every season. '*6)+'The complete original copy stays available for a careful read.'
F['library']['creatives'][1]['copy']=long_copy
# A legacy brand has a name and ID, but no website field. The requested alias is not its canonical ID.
F['brands'][1].pop('domain',None)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 page=browser.new_page(locale='en-GB',timezone_id='Europe/London');errors=[];external=[];writes=[];fail_brands=False
 page.on('pageerror',lambda error:errors.append(str(error)))
 def route(r):
  req=r.request;path=urlparse(req.url).path
  if not req.url.startswith(BASE):external.append(req.url);r.abort();return
  if parse_qs(urlparse(req.url).query).get('demo')==['1'] or not path.startswith('/api/'):r.continue_();return
  if req.method not in ('GET','HEAD'):writes.append(path);r.fulfill(status=409,json={'error':'No fixture actions allowed.'});return
  if path=='/api/brands':r.fulfill(status=503,json={'error':'Fixture metadata unavailable.'}) if fail_brands else r.fulfill(json=F['brands'])
  elif path=='/api/brand-identities':r.fulfill(json=F['brands'])
  elif path.endswith('/creatives'):r.fulfill(json=F['library'])
  elif path.endswith('/creative-competitors'):r.fulfill(json={'competitors':F['library']['competitors']})
  elif path=='/api/brand-research':r.fulfill(body='null',content_type='application/json')
  elif path=='/api/public/meta/watchlists':r.fulfill(json=F['watchlists'])
  elif path=='/api/infrastructure/status':r.fulfill(json={'meta':{'status':'configured','enabled':True},'database':'connected'})
  elif path=='/api/connections':r.fulfill(json={'connections':[]})
  elif path=='/api/budgets':r.fulfill(json={'budgets':[]})
  elif path=='/api/owned/accounts':r.fulfill(json={'accounts':[],'liveDispatchEnabled':False})
  elif path=='/api/reports':r.fulfill(json=[])
  elif path=='/api/creator-research':r.fulfill(json={'results':[],'shortlist':[],'fits':[]})
  elif path.endswith('/demo'):r.fulfill(json={'opportunities':[]})
  elif path.startswith('/api/brand-logos/'):r.fulfill(status=204)
  else:r.continue_()
 page.route('**/*',route)
 results=[]
 for width in (1440,390):
  page.set_viewport_size({'width':width,'height':1100})
  for name,view in [('Home','overview'),('CreativeDetail','creative&id=fixture-ad-1'),('DataSources','data')]:
   page.goto(BASE+'/?brandId=fixture-alias&view='+view,wait_until='networkidle')
   if phase=='after':
    expect(page.locator('main h1')).to_have_count(1);expect(page.get_by_role('alert')).to_have_count(0)
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),(name,width)
    if name=='Home':expect(page.locator('.ui-page-eyebrow')).to_contain_text(F['brand']['name'])
    if name=='CreativeDetail':
     assert len(page.locator('main h1').inner_text())<=150
     assert page.locator('main h1 .brand-mark').count()==0
     for tile in page.locator('.ui-metric-tile').all():
      assert tile.bounding_box()['height']<180
      value=tile.locator('.ui-metric-value');assert value.evaluate("el=>getComputedStyle(el).textAlign")=='left'
     page.get_by_role('button',name='Show more',exact=True).click();expect(page.get_by_role('region',name='Source and running history',exact=True)).to_contain_text('The complete original copy stays available for a careful read.')
    if name=='DataSources':
     expect(page.locator('.ui-source-label')).to_have_count(10)
     expect(page.get_by_role('region',name='Source health',exact=True).locator('th')).to_have_text(['Source','Status','Detail','Action'])
     expect(page.locator('.ui-source-mark img')).to_have_count(8)
     assert page.locator('.ui-source-mark img').evaluate_all("imgs=>imgs.every(i=>i.alt===''&&i.complete&&i.naturalWidth>0)")
   page.screenshot(path=str(OUT/f'{phase}-{name}-{width}.png'),full_page=True)
   results.append({'screen':name,'width':width,'headingLength':len(page.locator('main h1').inner_text()),'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth')})
 if phase=='after':
  fail_brands=True;page.set_viewport_size({'width':1440,'height':1100});page.goto(BASE+'/?brandId=fixture-meta&view=overview',wait_until='networkidle')
  expect(page.get_by_role('alert')).to_contain_text('Brand list');expect(page.locator('.ui-page-eyebrow')).to_contain_text(F['brand']['name'])
  fail_brands=False;page.get_by_role('button',name='Retry brand list',exact=True).click();expect(page.get_by_role('alert')).to_have_count(0)
  for width in (1440,390):
   page.set_viewport_size({'width':width,'height':1100});page.goto(BASE+'/?brandId=sample-northwick&demo=1&view=data',wait_until='networkidle')
   expect(page.locator('.ui-source-label')).to_have_count(10);assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
   page.screenshot(path=str(OUT/f'after-DataSources-sample-{width}.png'),full_page=True)
 assert not errors,errors
 assert not external,external
 assert not writes,writes
 browser.close()
(OUT/f'{phase}-audit.json').write_text(json.dumps(results,indent=2)+'\n')
if phase=='after':
 for name in ('Home','CreativeDetail','DataSources'):
  for width in (1440,390):
   first=Image.open(OUT/f'before-{name}-{width}.png').convert('RGB');last=Image.open(OUT/f'after-{name}-{width}.png').convert('RGB')
   pair=Image.new('RGB',(first.width+last.width,max(first.height,last.height)+36),'#f7f9fb');d=ImageDraw.Draw(pair);d.text((16,10),'BEFORE: fictional fixtures',fill='black');d.text((first.width+16,10),'AFTER: same data',fill='black');pair.paste(first,(0,36));pair.paste(last,(first.width,36));pair.save(OUT/f'{name}-comparison-{width}.png')
print(phase,':',len(results),'screen/width cases; no external requests or mutations')
