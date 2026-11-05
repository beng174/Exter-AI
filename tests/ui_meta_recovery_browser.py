"""Per-brand diagnostics and explicit retry fixtures. All external requests are blocked."""
from pathlib import Path
from urllib.parse import urlparse,parse_qs
import json,shutil,subprocess,copy
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:3118';OUT=Path('output/playwright/meta-recovery');OUT.mkdir(parents=True,exist_ok=True)
F=json.loads(subprocess.check_output(['node','--import','tsx','tests/fixtures/meta-ui.ts']))
def reset():
 for i,w in enumerate(F['watchlists']):
  w['meta_page_size']=50
  w['latestRun']={'id':'fixture-run-'+str(i),'status':['failed','paused','complete'][i],'adsSaved':[7752,120,300][i],'pagesFetched':[78,2,4][i],'startedAt':'2026-11-05T03:00:00Z','stoppedAt':'2026-11-05T09:00:00Z','pageSize':50,'message':'Meta collection reached its retry limit. Saved pages are retained; retry collection to resume the saved progress.' if i==0 else None,'failures':[{'id':1,'at':'2026-11-05T09:00:00Z','kind':'retry_limit','message':'Earlier evidence is retained.','graphCode':1,'graphSubcode':99,'httpStatus':500,'pageSize':50,'timedOut':False}] if i==0 else [],'failureCount':1 if i==0 else 0}
reset();writes=[];external=[];errors=[];checks=[];budget_paused=False;fail_poll=False
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 page=browser.new_page(locale='en-GB',timezone_id='Europe/London');page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  req=r.request;path=urlparse(req.url).path
  if not req.url.startswith(BASE):external.append(req.url);r.abort();return
  if parse_qs(urlparse(req.url).query).get('demo')==['1'] or not path.startswith('/api/'):r.continue_();return
  if req.method not in ('GET','HEAD'):
   writes.append({'path':path,'body':req.post_data_json})
   assert path=='/api/public/meta/collect',writes
   assert req.post_data_json=={'watchlistId':F['watchlists'][0]['id'],'workspaceId':F['brand']['id']}
   F['watchlists'][0]['latestRun'].update({'status':'queued','stoppedAt':None,'message':None})
   r.fulfill(status=202,json={'runId':F['watchlists'][0]['latestRun']['id']});return
  if path in ('/api/brands','/api/brand-identities'):r.fulfill(json=F['brands'])
  elif path.endswith('/creatives'):r.fulfill(json=F['library'])
  elif path.endswith('/creative-competitors'):r.fulfill(json={'competitors':F['library']['competitors']})
  elif path=='/api/brand-research':r.fulfill(body='null',content_type='application/json')
  elif path=='/api/public/meta/watchlists':
   if fail_poll:r.fulfill(status=503,json={'error':'Fixture progress unavailable.'})
   else:r.fulfill(json=F['watchlists'])
  elif path=='/api/public/meta/source-status':
   states=[w['latestRun']['status'] for w in F['watchlists']];status=next((s for s in ['paused','failed','running','queued'] if s in states),'connected');r.fulfill(json={'status':status,'enabled':True,'lastSuccessfulCheck':'2026-11-05T09:00:00Z','message':'Saved collection health.'})
  elif path=='/api/infrastructure/status':r.fulfill(json={'meta':{'status':'configured','enabled':True},'database':'connected','storage':{'status':'available','sizeBytes':128*1024**2,'measuredAt':'2026-11-05T09:00:00Z','growthBytesPerDay':2*1024**2,'baselineAt':'2026-11-03T09:00:00Z','intervalHours':48,'message':'Measured daily average.'}})
  elif path=='/api/connections':r.fulfill(json={'connections':[]})
  elif path=='/api/budgets':r.fulfill(json={'budgets':[{'cost_type':'data_providers','monthly_budget_gbp':20,'used_gbp':0,'paused':budget_paused,'pause_reason':'budget_unset' if budget_paused else None}]})
  elif path=='/api/owned/accounts':r.fulfill(json={'accounts':[],'liveDispatchEnabled':False})
  elif path=='/api/reports':r.fulfill(json=[])
  elif path=='/api/creator-research':r.fulfill(json={'results':[],'shortlist':[],'fits':[]})
  elif path.endswith('/demo'):r.fulfill(json={'opportunities':[]})
  elif path.startswith('/api/brand-logos/'):r.fulfill(status=204)
  else:r.continue_()
 page.route('**/*',route)
 for width in (1440,390):
  for view in ('data','competitors'):
   reset();page.set_viewport_size({'width':width,'height':1100});page.goto(BASE+'/?brandId=fixture-meta&view='+view,wait_until='networkidle')
   if view=='data':
    table=page.get_by_role('region',name='Meta collection by brand',exact=True);target=table.get_by_role('row').filter(has_text=F['brand']['name']);expect(target).to_contain_text('7,752');expect(target).to_contain_text('78');expect(target).to_contain_text('Graph code 1');expect(target).to_contain_text('HTTP 500');expect(target).to_contain_text('Stopped 5 Nov 2026')
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
    page.screenshot(path=str(OUT/f'DataSources-{width}.png'),full_page=True)
    target.get_by_role('button',name='Retry collection',exact=True).click();expect(page.get_by_role('region',name='Meta collection by brand',exact=True).get_by_role('row').filter(has_text=F['brand']['name'])).to_contain_text('Queued')
    reset();page.reload(wait_until='networkidle')
   page.get_by_role('button',name='Edit watchlist',exact=True).click();dialog=page.get_by_role('dialog',name='Edit watchlist',exact=True);target=dialog.locator('.meta-watchlist-target').filter(has_text=F['brand']['name']).first
   expect(target).to_contain_text('7,752');expect(target).to_contain_text('78');expect(target).to_contain_text('Graph code 1');expect(target).to_contain_text('subcode 99')
   dialog.screenshot(path=str(OUT/f'EditWatchlist-{view}-{width}.png'))
   field=target.get_by_role('textbox');original=field.input_value();field.fill('99');expect(target.get_by_role('button',name='Retry collection',exact=True)).to_be_disabled();field.fill(original)
   before=len(writes);target.get_by_role('button',name='Retry collection',exact=True).click();page.wait_for_timeout(200);assert len(writes)==before+1
   checks.append({'view':view,'width':width,'retry':True,'writes':'one scoped collection POST, no Page save'})
 budget_paused=True;reset();page.goto(BASE+'/?brandId=fixture-meta&view=data',wait_until='networkidle');target=page.get_by_role('region',name='Meta collection by brand',exact=True).get_by_role('row').filter(has_text=F['brand']['name']);expect(target.get_by_role('button',name='Retry collection',exact=True)).to_be_disabled()
 budget_paused=False;reset()
 for w in F['watchlists']:w['latestRun']['status']='complete'
 F['watchlists'][0]['latestRun']['status']='queued';page.goto(BASE+'/?brandId=fixture-meta&view=data',wait_until='networkidle')
 target=page.get_by_role('region',name='Meta collection by brand',exact=True).get_by_role('row').filter(has_text=F['brand']['name'])
 fail_poll=True;expect(page.get_by_text('Progress could not be refreshed. Saved details are still shown.',exact=True)).to_be_visible(timeout=8000);expect(target).to_contain_text('Queued')
 fail_poll=False;F['watchlists'][0]['latestRun'].update({'status':'running','pagesFetched':79});expect(target).to_contain_text('Running',timeout=8000);expect(target).to_contain_text('79');expect(page.get_by_text('Progress could not be refreshed. Saved details are still shown.',exact=True)).to_have_count(0)
 F['watchlists'][0]['latestRun'].update({'status':'complete','pagesFetched':80});expect(target).to_contain_text('Complete',timeout=8000);expect(target).to_contain_text('80')
 page.goto(BASE+'/?brandId=sample-northwick&demo=1&view=data',wait_until='networkidle');expect(page.get_by_role('region',name='Meta collection by brand',exact=True)).to_have_count(0)
 assert len(writes)==6,writes
 assert not external,external
 assert not errors,errors
 browser.close()
(OUT/'audit.json').write_text(json.dumps(checks,indent=2)+'\n')
print('Four entry-point/width cases, six explicit scoped retries, unsaved Page/budget/sample guards; no external requests.')
