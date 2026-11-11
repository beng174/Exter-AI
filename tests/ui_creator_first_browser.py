"""Real-workspace API fixtures, including reported handles; no external requests."""
import copy,json,shutil,subprocess,re
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright,expect
OUT=Path('docs/review/creator-first');OUT.mkdir(parents=True,exist_ok=True)
BASE='http://127.0.0.1:3143'
F=json.loads(subprocess.check_output(['node','--import','tsx','tests/fixtures/meta-ui.ts']))
C=json.loads(subprocess.check_output(['node','--import','tsx','tests/fixtures/creator-ui.ts']))
external=[];errors=[];actions=[];checks=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 page=browser.new_page(locale='en-GB',timezone_id='Europe/London');page.on('pageerror',lambda e:errors.append(str(e)))
 snapshot=copy.deepcopy(C['snapshot'])
 def route(r):
  req=r.request;path=urlparse(req.url).path
  if not req.url.startswith(BASE):external.append(req.url);r.abort();return
  if not path.startswith('/api/'):r.continue_();return
  if path.startswith('/api/brand-logos/'):r.fulfill(status=404);return
  if path in ('/api/brands','/api/brand-identities'):value=F['brands']
  elif path.endswith('/creatives'):value=F['library']
  elif path.endswith('/creative-competitors'):value={'competitors':F['library']['competitors']}
  elif path.endswith('/onboarding') or path=='/api/brand-research':value=None
  elif path=='/api/public/meta/watchlists':value=F['watchlists']
  elif path=='/api/connections':value={'connections':[]}
  elif path=='/api/creator-discovery':value=snapshot
  elif path=='/api/creator-discovery/stop':
   actions.append('stop');snapshot['runs'][0]['stopRequested']=True;snapshot['runs'][0]['status']='cancelled';snapshot['runs'][0]['providerRuns'][0].update({'status':'ABORTED','costGbp':.1,'heldGbp':0,'usageUsd':.125});value={'stopping':True}
  elif path=='/api/creator-discovery/rescreen':actions.append('rescreen');value={'rechecked':True}
  elif path=='/api/creator-discovery/quote':
   body=req.post_data_json;assert body['brief']['hashtags']==['editedfixture'];assert body['brief']['competitors']==['edited_competitor'];actions.append('quote');value={'id':'fixture-quote','maxCostGbp':3,'batches':4,'expiresAt':'2026-12-01','available':True,'reason':'Fixture cost limit.'}
  else:r.fulfill(status=404,json={'error':'No fixture: '+path});return
  r.fulfill(json=value)
 page.route('**/*',route)
 for width in [1280,1440,1920,390]:
  page.set_viewport_size({'width':width,'height':1100});page.goto(BASE+'/?view=creators&brandId='+F['brand']['id'],wait_until='networkidle')
  expect(page.get_by_role('heading',name='Creators',exact=True)).to_be_visible();expect(page.get_by_role('button',name='Stop search',exact=True).first).to_be_visible()
  expect(page.get_by_text('Observed (public profile)',exact=True).first).to_be_visible();expect(page.get_by_text('Found through Disclosed competitor post: birch_glow')).to_be_visible()
  assert 'London Clothing' not in page.locator('.creator-discovery-grid').inner_text();assert 'Anika Rowan' not in page.locator('.creator-discovery-grid').inner_text()
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
  checks.append({'width':width,'noOverflow':True,'observedCounts':True,'strictResults':True,'stopVisible':True})
  if width in [1440,390]:page.screenshot(path=str(OUT/f'Creators-{width}.png'),full_page=True)
 page.set_viewport_size({'width':1440,'height':1100});page.get_by_role('button',name='Rejected · 3',exact=True).click();expect(page.get_by_role('link',name='London Clothing @01londonclothing',exact=True)).to_be_visible();expect(page.get_by_text('@anika16115',exact=True)).to_be_visible();expect(page.get_by_role('button',name='Outside follower range · 1',exact=True)).to_be_visible();page.screenshot(path=str(OUT/'Rejected-1440.png'),full_page=True)
 page.get_by_role('button',name='Stop search',exact=True).first.click();expect(page.get_by_role('button',name='Stop search',exact=True)).to_have_count(0)
 page.get_by_role('button',name='Recheck saved results',exact=True).click();expect(page.get_by_text('Saved profiles rechecked. No paid search was made.',exact=True)).to_be_visible()
 page.locator('.creator-search-brief>summary').click();page.get_by_role('button',name='Use suggested sources',exact=True).click()
 expect(page.get_by_label('Hashtags',exact=True)).to_have_value(re.compile(r'.*,.*'))
 assert len(page.get_by_label('Hashtags',exact=True).input_value().split(','))>=10
 page.get_by_label('Hashtags',exact=True).fill('editedfixture');page.get_by_label('Competitor handles',exact=True).fill('edited_competitor');page.get_by_label('Category',exact=True).click();page.get_by_role('button',name='Estimate cost',exact=True).click();expect(page.get_by_role('button',name='Find creators',exact=True)).to_be_visible()
 page.set_viewport_size({'width':390,'height':1100});assert not page.evaluate('document.documentElement.scrollWidth>innerWidth');page.screenshot(path=str(OUT/'Brief-390.png'),full_page=True)
 assert actions==['stop','rescreen','quote'];assert not external and not errors,(external,errors)
 browser.close()
reference=Image.open('design/reference/png/Creators.png').convert('RGB');app=Image.open(OUT/'Creators-1440.png').convert('RGB')
canvas=Image.new('RGB',(app.width+reference.width,max(app.height,reference.height)+40),'#f7f8fa');canvas.paste(app,(0,40));canvas.paste(reference,(app.width,40));d=ImageDraw.Draw(canvas);d.text((16,12),'App: fictional real-workspace fixtures',fill='#17223b');d.text((app.width+16,12),'Approved reference (sample values)',fill='#17223b');canvas.save(OUT/'Creators-reference-comparison.png')
(OUT/'audit.json').write_text(json.dumps({'checks':checks,'actions':actions,'externalRequests':external,'pageErrors':errors,'providerCalls':0,'note':'Fixtures only. No production rescreen or client-accuracy validation.'},indent=2))
