"""Reported collection states using fictional brands. No provider/network requests."""
from pathlib import Path
from urllib.parse import urlparse
import json,shutil,subprocess
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:3130';OUT=Path('output/playwright/meta-current-status');OUT.mkdir(parents=True,exist_ok=True)
F=json.loads(subprocess.check_output(['node','--import','tsx','tests/fixtures/meta-ui.ts']))
old={'id':1,'at':'2026-11-06T03:01:00Z','kind':'schema','message':'Meta rejected the collection end date. Deploy the latest worker, then retry.','graphCode':100,'graphSubcode':2334030,'httpStatus':400,'pageSize':100,'timedOut':False}
current={'id':2,'at':'2026-11-08T02:59:00Z','kind':'page_size','message':'Collection will retry with a smaller page.','graphCode':1,'graphSubcode':None,'httpStatus':500,'pageSize':50,'timedOut':False}
for i,w in enumerate(F['watchlists']):
 w['meta_page_size']=25 if i==2 else 100
 w['latestRun']={'id':'fixture-run-'+str(i),'status':['running','complete','queued'][i],'adsSaved':[231,8,1850][i],'pagesFetched':[5,3,19][i],'startedAt':'2026-11-06T03:00:00Z','stoppedAt':'2026-11-08T02:58:00Z' if i==1 else None,'pageSize':25 if i==2 else 100,'message':current['message'] if i==2 else None,'failures':[current,old] if i==2 else [old],'failureCount':2 if i==2 else 1,'currentFailure':current if i==2 else None,'nextAttemptAt':'2026-11-08T03:01:00Z' if i==2 else None}
errors=[];external=[];writes=[];checks=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox']);page=browser.new_page(locale='en-GB',timezone_id='Europe/London');page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  req=r.request;path=urlparse(req.url).path
  if not req.url.startswith(BASE):external.append(req.url);r.abort();return
  if not path.startswith('/api/'):r.continue_();return
  if req.method not in ('GET','HEAD'):writes.append(path);r.abort();return
  if path in ('/api/brands','/api/brand-identities'):r.fulfill(json=F['brands'])
  elif path.endswith('/creatives'):r.fulfill(json=F['library'])
  elif path.endswith('/creative-competitors'):r.fulfill(json={'competitors':F['library']['competitors']})
  elif path=='/api/brand-research':r.fulfill(body='null',content_type='application/json')
  elif path=='/api/public/meta/watchlists':r.fulfill(json=F['watchlists'])
  elif path=='/api/public/meta/source-status':r.fulfill(json=F['library']['metaSource'])
  elif path=='/api/infrastructure/status':r.fulfill(json={'meta':{'status':'configured','enabled':True},'database':'connected'})
  elif path=='/api/connections':r.fulfill(json={'connections':[]})
  elif path=='/api/budgets':r.fulfill(json={'budgets':[{'cost_type':'data_providers','monthly_budget_gbp':20,'used_gbp':0,'paused':False}]})
  elif path=='/api/owned/accounts':r.fulfill(json={'accounts':[],'liveDispatchEnabled':False})
  elif path=='/api/reports':r.fulfill(json=[])
  elif path=='/api/creator-research':r.fulfill(json={'results':[],'shortlist':[],'fits':[]})
  elif path=='/api/ad-media/status':r.fulfill(json={'enabled':False,'configured':False,'coverage':[],'runs':[],'disk':{'status':'unavailable','usedBytes':None,'remainingBytes':None,'totalBytes':None,'videoDownloadsPaused':True,'measuredAt':None}})
  elif path.endswith('/demo'):r.fulfill(json={'opportunities':[]})
  elif path.startswith('/api/brand-logos/'):r.fulfill(status=204)
  else:r.fulfill(status=404,json={'error':'No fixture for this path.'})
 page.route('**/*',route)
 for width in (1280,1440,1920,390):
  page.set_viewport_size({'width':width,'height':1100});page.goto(BASE+'/?brandId=fixture-meta&view=data',wait_until='networkidle')
  table=page.get_by_role('region',name='Meta collection by brand',exact=True)
  running=table.get_by_role('row').filter(has_text=F['brands'][0]['name']);complete=table.get_by_role('row').filter(has_text=F['brands'][1]['name']);queued=table.get_by_role('row').filter(has_text=F['brands'][2]['name'])
  expect(running).to_contain_text('Collecting ads.');expect(running.get_by_role('button',name='Collecting',exact=True)).to_be_disabled();expect(complete).to_contain_text('Finished 8 Nov 2026');expect(complete.get_by_role('button',name='Collect again')).to_be_enabled()
  for target in (running,complete):
   expect(target.get_by_text('Latest failure:',exact=False)).to_have_count(0);expect(target.get_by_text('Graph code 100',exact=False)).not_to_be_visible();expect(target.get_by_text('Failure history (1)',exact=True)).to_be_visible()
  expect(queued).to_contain_text('Retrying automatically with 25 ads per page.');expect(queued).to_contain_text('Next attempt after 8 Nov 2026');expect(queued.get_by_role('button',name='Queued',exact=True)).to_be_disabled()
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
  page.screenshot(path=str(OUT/f'DataSources-{width}.png'),full_page=True);table.screenshot(path=str(OUT/f'CollectionStatus-{width}.png'))
  complete.get_by_text('Failure history (1)',exact=True).click();expect(complete.get_by_text('Graph code 100',exact=False)).to_be_visible();expect(complete).to_contain_text('6 Nov 2026');complete.get_by_text('Failure history (1)',exact=True).click()
  page.get_by_role('button',name='Edit watchlist',exact=True).click();dialog=page.get_by_role('dialog',name='Edit watchlist',exact=True)
  expect(dialog).to_contain_text('Retrying automatically with 25 ads per page.');expect(dialog.get_by_role('button',name='Queued',exact=True)).to_be_disabled();expect(dialog.get_by_role('button',name='Collecting',exact=True)).to_be_disabled()
  dialog.screenshot(path=str(OUT/f'EditWatchlist-{width}.png'))
  checks.append({'width':width,'historicalErrorsCollapsed':True,'historyPreserved':True,'automatic25AdRetry':True,'activeActionsDisabled':True,'noPageOverflow':True})
 assert not external and not writes and not errors,(external,writes,errors)
 browser.close()
app=Image.open(OUT/'DataSources-1440.png').convert('RGB');ref=Image.open('design/reference/png/DataSources.png').convert('RGB');canvas=Image.new('RGB',(2880,max(app.height,ref.height)+40),'#eef1f5');canvas.paste(app,(0,40));canvas.paste(ref,(1440,40));draw=ImageDraw.Draw(canvas);draw.text((16,12),'APP: fictional collection status fixtures',fill='black');draw.text((1456,12),'REFERENCE: Data sources',fill='black');canvas.save(OUT/'DataSources-reference.png')
(OUT/'audit.json').write_text(json.dumps({'checks':checks,'externalRequests':external,'writes':writes,'pageErrors':errors,'providerCalls':0},indent=2))
print('PASS: current versus historical collection states, automatic retry, guarded actions and four widths; no provider calls')
