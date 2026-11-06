"""Coverage and safe Meta diagnostics. Fictional fixtures; every external request is blocked."""
from pathlib import Path
from urllib.parse import urlparse
import json,shutil,subprocess
from PIL import Image,ImageOps,ImageDraw
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:3130';OUT=Path('output/playwright/media-coverage');OUT.mkdir(parents=True,exist_ok=True)
F=json.loads(subprocess.check_output(['node','--import','tsx','tests/fixtures/meta-ui.ts']))
for w in F['watchlists']:
 w['latestRun']={'id':'fixture-graph-run','status':'failed','adsSaved':7752,'pagesFetched':78,'pageSize':100,'startedAt':'2026-11-06T03:00:00Z','stoppedAt':'2026-11-06T03:01:00Z','message':'Review the collection date before retrying.','failureCount':1,'failures':[{'id':1,'at':'2026-11-06T03:01:00Z','kind':'schema','message':'Check the collection settings.','graphCode':100,'graphSubcode':2334030,'httpStatus':400,'pageSize':100,'timedOut':False,'userTitle':'Invalid delivery date','userMessage':'Choose a date no later than today. [link removed]'}]}
reasons={k:0 for k in ('not_requested','not_returned','expired','unsupported','wrong_page','budget','disk','provider')}
coverage=[]
for i,b in enumerate(F['brands']):
 r=reasons.copy();r.update({'not_requested':[4500,800,200][i],'not_returned':[260,20,4][i],'expired':20,'unsupported':10,'wrong_page':2})
 coverage.append({'brandKey':b['id'],'brandName':b['name'],'official':[6000,1200,600][i],'images':[1208,348,364][i],'videos':[84,20,8][i],'requested':[1500,400,400][i],'returned':[1240,380,396][i],'matched':[1238,378,394][i],'missing':sum(r.values()),'reasons':r,'historyIncomplete':i==0})
health={'enabled':True,'configured':True,'disk':{'status':'available','usedBytes':3*1024**3,'remainingBytes':7*1024**3,'totalBytes':10*1024**3,'videoDownloadsPaused':False,'measuredAt':'2026-11-06T12:00:00Z'},'coverage':coverage,'runs':[{'id':'fixture-run','brandKey':F['brands'][1]['id'],'status':'complete','startedAt':'2026-11-06T11:50:00Z','finishedAt':'2026-11-06T12:00:00Z','results':21,'adsWithMedia':20,'costGbp':.00844,'reservedGbp':.21004,'costStatus':'settled','gbpPerUsd':.84,'error':None,'diagnostics':{'requested':500,'returned':20,'matched':20,'actorInput':500,'actorRequested':None,'actorReturned':20,'actorQueries':500,'stopReasons':['end_of_results'],'input':{'pageId':'13','countries':['GB'],'from':'2025-11-06','to':'2026-11-05','maxAds':500,'maxAdsPerQuery':500,'mode':'adArchiveIds','requested':500,'activeStatus':'all','adType':'all'}}}]}
external=[];writes=[];errors=[];checks=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox']);page=browser.new_page(locale='en-GB',timezone_id='Europe/London');page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  req=r.request;path=urlparse(req.url).path
  if not req.url.startswith(BASE):external.append(req.url);r.abort();return
  if not path.startswith('/api/'):r.continue_();return
  if req.method not in ('GET','HEAD'):
   writes.append(req.post_data_json);assert path=='/api/ad-media/collect';r.fulfill(status=202,json={'queued':True});return
  if path in ('/api/brands','/api/brand-identities'):r.fulfill(json=F['brands'])
  elif path=='/api/ad-media/status':r.fulfill(json=health)
  elif path.endswith('/creatives'):r.fulfill(json=F['library'])
  elif path.endswith('/creative-competitors'):r.fulfill(json={'competitors':F['library']['competitors']})
  elif path=='/api/brand-research':r.fulfill(body='null',content_type='application/json')
  elif path=='/api/public/meta/watchlists':r.fulfill(json=F['watchlists'])
  elif path=='/api/infrastructure/status':r.fulfill(json={'meta':{'status':'configured'},'database':'connected','mediaDisk':health['disk']})
  elif path=='/api/connections':r.fulfill(json={'connections':[]})
  elif path=='/api/budgets':r.fulfill(json={'month':'2026-11','budgets':[{'cost_type':'data_providers','monthly_budget_gbp':20,'used_gbp':.21004,'paused':False,'pause_reason':None,'remaining_gbp':17.78996,'threshold_gbp':18,'request_reserve_gbp':None}]})
  elif path=='/api/owned/accounts':r.fulfill(json={'accounts':[],'liveDispatchEnabled':False})
  elif path=='/api/reports':r.fulfill(json=[])
  elif path=='/api/creator-research':r.fulfill(json={'results':[],'shortlist':[],'fits':[]})
  elif path.endswith('/demo'):r.fulfill(json={'opportunities':[]})
  elif path.startswith('/api/brand-logos/'):r.fulfill(status=204)
  else:r.fulfill(status=404,json={'error':'No fixture for '+path})
 page.route('**/*',route)
 for width in (1280,1440,1920,390):
  page.set_viewport_size({'width':width,'height':1100});page.goto(BASE+'/?brandId=fixture-meta&view=data',wait_until='networkidle')
  panel=page.locator('.ad-media-runs');expect(panel.get_by_text('Official ads',exact=True)).to_have_count(3);expect(panel).to_contain_text('4,500 not requested yet');expect(panel).to_contain_text('2 wrong Page')
  panel.locator('.ad-media-details summary').click();expect(panel.get_by_text('Actor input IDs',exact=True)).to_be_visible();expect(panel).to_contain_text('Not recorded');expect(panel).to_contain_text('maximum 500')
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
  if width>=1280:assert panel.locator('.ui-table-scroll').evaluate('(e)=>e.scrollWidth<=e.clientWidth'),'Media table overflow'
  page.screenshot(path=str(OUT/f'DataSources-{width}.png'),full_page=True);panel.screenshot(path=str(OUT/f'MediaCoverage-{width}.png'))
  meta=page.get_by_role('region',name='Meta collection by brand',exact=True);expect(meta).to_contain_text('Invalid delivery date');expect(meta).to_contain_text('subcode 2334030')
  meta.screenshot(path=str(OUT/f'MetaErrors-{width}.png'))
  page.get_by_role('button',name='Edit watchlist',exact=True).click();dialog=page.get_by_role('dialog',name='Edit watchlist',exact=True);expect(dialog).to_contain_text('Invalid delivery date');expect(dialog).to_contain_text('Choose a date no later than today.')
  dialog.screenshot(path=str(OUT/f'EditWatchlist-{width}.png'));page.keyboard.press('Escape')
  checks.append({'width':width,'threeBrands':True,'inputAndActorCounts':True,'sanitisedMetaErrors':True,'noPageOverflow':True})
 # No action in this preview can reach a provider.
 assert not writes and not external and not errors,(writes,external,errors)
 browser.close()
app=Image.open(OUT/'DataSources-1440.png').convert('RGB');ref=Image.open('design/reference/png/DataSources.png').convert('RGB')
canvas=Image.new('RGB',(2880,max(app.height,ref.height)+40),'#eef1f5');canvas.paste(app,(0,40));canvas.paste(ref,(1440,40));draw=ImageDraw.Draw(canvas);draw.text((16,12),'APP: fictional diagnostics, real-workspace API shapes',fill='black');draw.text((1456,12),'REFERENCE: Data sources',fill='black');canvas.save(OUT/'DataSources-reference.png')
(OUT/'audit.json').write_text(json.dumps({'checks':checks,'providerCalls':0,'externalRequests':external,'pageErrors':errors},indent=2))
print('PASS: coverage, actor counts and Meta user errors at 1280/1440/1920/390; no providers')
