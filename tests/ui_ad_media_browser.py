"""Fictional retained-media/API fixtures only. No provider traffic is allowed."""
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from io import BytesIO
import json,shutil,subprocess
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:3118';OUT=Path('output/playwright/ad-media');OUT.mkdir(parents=True,exist_ok=True)
F=json.loads(subprocess.check_output(['node','--import','tsx','tests/fixtures/meta-ui.ts']))
row=F['library']['creatives'][1]
row.update({'thumbnailUrl':'/api/ad-media/files/fixture-meta/fixture-rival/1002/'+'a'*64,'videoUrl':None,'imageUrls':[],'mediaKind':'video','mediaAvailable':True,'mediaStatus':'stored'})
image=Image.new('RGB',(720,1280),'#d4b894');draw=ImageDraw.Draw(image);draw.rounded_rectangle((170,360,550,940),radius=32,fill='#f6ead6');draw.rectangle((250,470,470,680),fill='#fff8e8');draw.text((255,710),'FICTIONAL CANDLE',fill='#2b3437');stream=BytesIO();image.save(stream,format='PNG');poster=stream.getvalue()
health={'enabled':True,'configured':True,'disk':{'status':'available','usedBytes':3*1024**3,'remainingBytes':7*1024**3,'totalBytes':10*1024**3,'videoDownloadsPaused':False,'measuredAt':'2026-11-05T12:00:00Z'},'runs':[{'id':'fixture-run','brandKey':row['brandId'],'status':'complete','startedAt':'2026-11-05T11:50:00Z','finishedAt':'2026-11-05T12:00:00Z','results':500,'adsWithMedia':480,'costGbp':.20004,'reservedGbp':.20004,'costStatus':'settled','gbpPerUsd':.8,'error':None}]}
external=[];writes=[];errors=[];checks=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox']);page=browser.new_page(locale='en-GB',timezone_id='Europe/London');page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  req=r.request;path=urlparse(req.url).path
  if not req.url.startswith(BASE):external.append(req.url);r.abort();return
  if parse_qs(urlparse(req.url).query).get('demo')==['1'] or not path.startswith('/api/'):r.continue_();return
  if path=='/api/ad-media/collect' and req.method=='POST':writes.append(req.post_data_json);r.fulfill(status=202,json={'queued':True});return
  if req.method not in ('GET','HEAD'):raise AssertionError('Unexpected fixture write: '+path)
  if path in ('/api/brands','/api/brand-identities'):r.fulfill(json=F['brands'])
  elif path.startswith('/api/ad-media/files/'):r.fulfill(body=poster,content_type='image/png')
  elif path=='/api/ad-media/status':r.fulfill(json=health)
  elif path.endswith('/creatives'):r.fulfill(json=F['library'])
  elif path.endswith('/creative-competitors'):r.fulfill(json={'competitors':F['library']['competitors']})
  elif path=='/api/brand-research':r.fulfill(body='null',content_type='application/json')
  elif path=='/api/public/meta/watchlists':r.fulfill(json=F['watchlists'])
  elif path=='/api/infrastructure/status':r.fulfill(json={'meta':{'status':'configured'},'database':'connected','mediaDisk':health['disk']})
  elif path=='/api/connections':r.fulfill(json={'connections':[]})
  elif path=='/api/budgets':r.fulfill(json={'month':'2026-11','budgets':[{'cost_type':'data_providers','monthly_budget_gbp':20,'used_gbp':.20004,'paused':False,'pause_reason':None,'remaining_gbp':17.79996,'threshold_gbp':18,'request_reserve_gbp':None}]})
  elif path=='/api/owned/accounts':r.fulfill(json={'accounts':[],'liveDispatchEnabled':False})
  elif path=='/api/reports':r.fulfill(json=[])
  elif path=='/api/creator-research':r.fulfill(json={'results':[],'shortlist':[],'fits':[]})
  elif path.endswith('/demo'):r.fulfill(json={'opportunities':[]})
  elif path.startswith('/api/brand-logos/'):r.fulfill(status=204)
  else:r.continue_()
 page.route('**/*',route)
 for width in (1280,1440,1920,390):
  page.set_viewport_size({'width':width,'height':1100});page.goto(BASE+'/?brandId=fixture-meta&view=data',wait_until='networkidle')
  expect(page.get_by_text('Disk used',exact=True)).to_be_visible();expect(page.get_by_text('7 GiB',exact=False).first).to_be_visible()
  budget=page.get_by_role('region',name='Budgets and schedule',exact=True);expect(budget.get_by_role('table',name='Ad Library media costs')).to_be_visible();expect(budget).to_contain_text('£0.20004 estimated')
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
  if width>=1280:assert budget.locator('.ui-table-scroll').evaluate('(e)=>e.scrollWidth<=e.clientWidth'), 'Media costs must fit the desktop column'
  page.screenshot(path=str(OUT/f'DataSources-{width}.png'),full_page=True)
  budget.screenshot(path=str(OUT/f'MediaCosts-{width}.png'))
  button=page.get_by_role('button',name='Collect missing media');button.click();expect(button).to_be_enabled();assert writes[-1]=={'workspaceId':'fixture-meta'}
  health['enabled']=False;page.reload(wait_until='networkidle');expect(page.get_by_role('button',name='Collect missing media')).to_be_disabled();health['enabled']=True
  page.goto(BASE+'/?brandId=fixture-meta&view=creative&id=fixture-ad-1',wait_until='networkidle');expect(page.locator('#creative-media img')).to_be_visible();assert page.locator('#creative-media img').evaluate('(i)=>i.naturalWidth')==720
  page.screenshot(path=str(OUT/f'CreativeDetail-{width}.png'),full_page=True)
  row.update({'thumbnailUrl':None,'mediaAvailable':False,'mediaStatus':'not-stored'});page.reload(wait_until='networkidle');expect(page.locator('#creative-media')).to_contain_text('Ad copy preview');expect(page.locator('#creative-media')).not_to_contain_text('Unavailable');row.update({'thumbnailUrl':'/api/ad-media/files/fixture-meta/fixture-rival/1002/'+'a'*64,'mediaAvailable':True,'mediaStatus':'stored'})
  checks.append({'width':width,'storedPoster':True,'textFallback':True,'scopedCollectAction':True,'offButtonDisabled':True,'noPageOverflow':True})
 page.goto(BASE+'/?demo=1&view=data',wait_until='networkidle');expect(page.get_by_text('Sample data',exact=True).first).to_be_visible();expect(page.get_by_role('button',name='Collect missing media')).to_have_count(0)
 assert not external and not errors,(external,errors)
 (OUT/'audit.json').write_text(json.dumps({'checks':checks,'externalRequests':external,'pageErrors':errors,'fixtureWrites':writes,'providerCalls':0},indent=2));browser.close()
print('PASS: media UI at 1280/1440/1920/390, retained poster, text fallback, scoped action, off and sample guards; no provider calls')
