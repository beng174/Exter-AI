"""Database health UI fixtures only. All external requests and writes are blocked."""
from pathlib import Path
from urllib.parse import urlparse,parse_qs
import json,shutil,subprocess
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:3118';OUT=Path('output/playwright/storage');OUT.mkdir(parents=True,exist_ok=True)
F=json.loads(subprocess.check_output(['node','--import','tsx','tests/fixtures/meta-ui.ts']))
health={'status':'available','sizeBytes':128*1024**2,'measuredAt':'2026-11-05T09:00:00Z','growthBytesPerDay':2*1024**2,'baselineAt':'2026-11-03T09:00:00Z','intervalHours':48,'message':'Physical Postgres database size; daily growth is averaged over the measured interval.'}
checks=[];external=[];writes=[];errors=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 page=browser.new_page(locale='en-GB',timezone_id='Europe/London');page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  req=r.request;path=urlparse(req.url).path
  if not req.url.startswith(BASE):external.append(req.url);r.abort();return
  if parse_qs(urlparse(req.url).query).get('demo')==['1'] or not path.startswith('/api/'):r.continue_();return
  if req.method not in ('GET','HEAD'):writes.append(path);r.fulfill(status=409,json={'error':'Fixture writes are disabled.'});return
  if path=='/api/brands' or path=='/api/brand-identities':r.fulfill(json=F['brands'])
  elif path.endswith('/creatives'):r.fulfill(json=F['library'])
  elif path.endswith('/creative-competitors'):r.fulfill(json={'competitors':F['library']['competitors']})
  elif path=='/api/brand-research':r.fulfill(body='null',content_type='application/json')
  elif path=='/api/public/meta/watchlists':r.fulfill(json=F['watchlists'])
  elif path=='/api/infrastructure/status':r.fulfill(json={'meta':{'status':'configured','enabled':True},'tiktok':{'status':'not_connected'},'database':'connected','storage':health})
  elif path=='/api/connections':r.fulfill(json={'connections':[]})
  elif path=='/api/budgets':r.fulfill(json={'budgets':[]})
  elif path=='/api/owned/accounts':r.fulfill(json={'accounts':[],'liveDispatchEnabled':False})
  elif path=='/api/reports':r.fulfill(json=[])
  elif path=='/api/creator-research':r.fulfill(json={'results':[],'shortlist':[],'fits':[]})
  elif path.endswith('/demo'):r.fulfill(json={'opportunities':[]})
  elif path.startswith('/api/brand-logos/'):r.fulfill(status=204)
  else:r.continue_()
 page.route('**/*',route)
 for width in (1280,1440,390):
  page.set_viewport_size({'width':width,'height':1100});page.goto(BASE+'/?brandId=fixture-meta&view=data',wait_until='networkidle')
  row=page.get_by_role('region',name='Source health',exact=True).get_by_role('row').filter(has_text='Collection database')
  expect(row).to_contain_text('128 MiB');expect(row).to_contain_text('+2 MiB');expect(row).to_contain_text('Average since 3 Nov 2026');expect(row.locator('.ui-data-label')).to_have_count(2)
  expect(row.locator('.ui-source-mark svg')).to_have_count(1)
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
  assert row.locator('.ui-storage-detail').evaluate('e=>e.scrollWidth<=e.clientWidth')
  checks.append({'screen':'DataSources','mode':'real-fixture','width':width,'overflow':False})
  page.screenshot(path=str(OUT/f'DataSources-{width}.png'),full_page=True)
  health['growthBytesPerDay']=0;row.get_by_role('button',name='Refresh',exact=True).click();expect(row.locator('.ui-storage-detail')).to_contain_text('0 B');health['growthBytesPerDay']=2*1024**2
 health.update({'growthBytesPerDay':None,'baselineAt':None,'intervalHours':None,'message':'Daily growth is available after measurements at least 24 hours apart.'})
 page.set_viewport_size({'width':1440,'height':1100});page.reload(wait_until='networkidle');detail=page.locator('.ui-storage-detail');expect(detail).to_contain_text('Unavailable');expect(detail).to_contain_text('24 hours');expect(detail.locator('.ui-data-label')).to_have_count(1);detail.screenshot(path=str(OUT/'first-day.png'))
 health.update({'status':'unavailable','sizeBytes':None,'measuredAt':None,'message':'Database storage could not be measured. Check database permissions and migrations.'})
 page.reload(wait_until='networkidle');expect(page.get_by_role('row').filter(has_text='Collection database')).to_contain_text('could not be measured');expect(page.locator('.ui-storage-detail')).to_have_count(0)
 for width in (1440,390):
  page.set_viewport_size({'width':width,'height':1100});page.goto(BASE+'/?brandId=sample-northwick&demo=1&view=data',wait_until='networkidle')
  expect(page.get_by_role('row').filter(has_text='Collection database')).to_contain_text('Read-only sample fixtures');expect(page.locator('.ui-storage-detail')).to_have_count(0);assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
  page.screenshot(path=str(OUT/f'DataSources-sample-{width}.png'),full_page=True);checks.append({'screen':'DataSources','mode':'sample','width':width,'overflow':False})
 assert not external,external
 assert not writes,writes
 assert not errors,errors
 browser.close()
(OUT/'audit.json').write_text(json.dumps(checks,indent=2)+'\n')
print('Passed',len(checks),'screen/width fixtures, Refresh, first-day and unavailable states; no external requests or mutations.')
