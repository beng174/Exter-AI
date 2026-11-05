"""Public Performance fixtures only. No provider request or write is allowed."""
from pathlib import Path
from urllib.parse import urlparse,parse_qs
import json,shutil,subprocess,copy
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:3118';OUT=Path('output/playwright/public-signals');OUT.mkdir(parents=True,exist_ok=True)
F=json.loads(subprocess.check_output(['node','--import','tsx','tests/fixtures/meta-ui.ts']))
row=F['library']['creatives'][1];row['publicReach']={'eu':{'type':'observed','value':1400},'locations':{'type':'observed','value':[{'country':'GB','reach':3500},{'country':'FR','reach':900},{'country':'DE','reach':500}]},'demographics':{'type':'observed','value':[{'country':'GB','age':'25-34','gender':'female','reach':2100},{'country':'GB','age':'25-34','gender':'male','reach':0},{'country':'GB','age':'35-44','gender':'female','reach':1400}]}}
row['publicDetails']={'targetAges':['25-34','35-44'],'targetGenders':['Women'],'targetLocations':['United Kingdom','France'],'platforms':['Facebook','Instagram','Audience Network'],'languages':['English','French']};row['daysRunning']=35
duplicate=copy.deepcopy(row);duplicate.update({'adId':'fixture-version','nativeId':'1009'});F['library']['creatives'].append(duplicate)
checks=[];external=[];writes=[];errors=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 page=browser.new_page(locale='en-GB',timezone_id='Europe/London');page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  req=r.request;path=urlparse(req.url).path
  if not req.url.startswith(BASE):external.append(req.url);r.abort();return
  if parse_qs(urlparse(req.url).query).get('demo')==['1'] or not path.startswith('/api/'):r.continue_();return
  if req.method not in ('GET','HEAD'):writes.append(path);r.fulfill(status=409,json={'error':'Fixture writes disabled.'});return
  if path in ('/api/brands','/api/brand-identities'):r.fulfill(json=F['brands'])
  elif path.endswith('/creatives'):r.fulfill(json=F['library'])
  elif path.endswith('/creative-competitors'):r.fulfill(json={'competitors':F['library']['competitors']})
  elif path=='/api/brand-research':r.fulfill(body='null',content_type='application/json')
  elif path=='/api/public/meta/watchlists':r.fulfill(json=F['watchlists'])
  elif path=='/api/infrastructure/status':r.fulfill(json={'meta':{'status':'configured'},'database':'connected'})
  elif path=='/api/connections':r.fulfill(json={'connections':[]})
  elif path=='/api/budgets':r.fulfill(json={'budgets':[]})
  elif path=='/api/owned/accounts':r.fulfill(json={'accounts':[],'liveDispatchEnabled':False})
  elif path=='/api/reports':r.fulfill(json=[])
  elif path=='/api/creator-research':r.fulfill(json={'results':[],'shortlist':[],'fits':[]})
  elif path.endswith('/demo'):r.fulfill(json={'opportunities':[]})
  elif path.startswith('/api/brand-logos/'):r.fulfill(status=204)
  else:r.continue_()
 page.route('**/*',route)
 for width in (1440,390):
  page.set_viewport_size({'width':width,'height':1100});page.goto(BASE+'/?brandId=fixture-meta&view=creative&id=fixture-ad-1',wait_until='networkidle')
  performance=page.get_by_role('region',name='Performance',exact=True)
  for label in ('UK reach','EU reach','France reach','Germany reach','Days running','Reach per day','Versions','Target ages','Target gender','Target locations','Platforms','Languages'):
   expect(performance.get_by_role('article',name=label,exact=True)).to_be_visible()
  expect(performance.get_by_role('article',name='Versions',exact=True)).to_contain_text('2')
  expect(performance.get_by_role('article',name='Reach per day',exact=True).locator('button')).to_have_attribute('title','3,500 UK reach ÷ 35 days running = 100 reach per day. Average over the saved running period.')
  expect(performance.get_by_role('region',name='Reach by age and gender',exact=True)).to_have_count(1)
  expect(performance.get_by_label('Reach by age and gender',exact=True)).to_contain_text('2,100')
  assert 'Unavailable' not in performance.inner_text()
  assert all(word not in performance.inner_text() for word in ('Spend','Impressions','Clicks','Conversions','ROAS','CPA'))
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
  assert performance.locator('.ui-metric-tile').evaluate_all('tiles=>tiles.every(t=>t.scrollWidth<=t.clientWidth)')
  performance.screenshot(path=str(OUT/f'Performance-{width}.png'));page.screenshot(path=str(OUT/f'CreativeDetail-{width}.png'),full_page=True)
  checks.append({'mode':'public-competitor','width':width,'missingTilesHidden':True,'privateOutcomes':False})
 # A workspace brand's public ad also stays public until actual owned reporting exists.
 page.goto(BASE+'/?brandId=fixture-meta&view=creative&id=fixture-ad-0',wait_until='networkidle');performance=page.get_by_role('region',name='Performance',exact=True);expect(performance).to_contain_text('Public signals only');expect(page.get_by_role('region',name='Viewer retention',exact=True)).to_have_count(0)
 # Known zero stays visible, while missing signals and zero-day denominators stay hidden.
 row['publicReach']={'eu':{'type':'unavailable','value':None},'locations':{'type':'observed','value':[{'country':'GB','reach':0}]},'demographics':{'type':'unavailable','value':None}};row['publicDetails']={'targetAges':[],'targetGenders':[],'targetLocations':[],'platforms':[],'languages':[]};row['daysRunning']=0;row['copy']='';row['placements']=[];row['mediaSha256']=None
 page.goto(BASE+'/?brandId=fixture-meta&view=creative&id=fixture-ad-1',wait_until='networkidle');performance=page.get_by_role('region',name='Performance',exact=True);expect(performance.get_by_role('article',name='UK reach',exact=True)).to_contain_text('0');expect(performance.get_by_role('article',name='Reach per day',exact=True)).to_have_count(0);expect(performance.get_by_role('article',name='Target ages',exact=True)).to_have_count(0)
 row['publicReach']={'eu':{'type':'unavailable','value':None},'locations':{'type':'unavailable','value':None},'demographics':{'type':'unavailable','value':None}};row['daysRunning']=None
 page.reload(wait_until='networkidle');performance=page.get_by_role('region',name='Performance',exact=True);expect(performance).to_contain_text('Public signals only');expect(performance.locator('.ui-metric-tile')).to_have_count(0);assert 'Unavailable' not in performance.inner_text()
 page.goto(BASE+'/?brandId=sample-northwick&demo=1&view=creative&id=sample-ad-002',wait_until='networkidle');expect(page.locator('.reference-sample')).to_contain_text('Sample data')
 assert not external,external
 assert not writes,writes
 assert not errors,errors
 browser.close()
(OUT/'audit.json').write_text(json.dumps(checks,indent=2)+'\n')
print('Public Performance at 1440px/390px plus workspace-public, zero, missing and sample states; no external requests or writes.')
