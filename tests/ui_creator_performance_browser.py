"""Creator performance UI fixtures. No production records or provider requests."""
import json,shutil,subprocess,re
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from PIL import Image,ImageDraw
OUT=Path('docs/review/creator-performance');OUT.mkdir(parents=True,exist_ok=True)
BASE='http://127.0.0.1:3143'
F=json.loads(subprocess.check_output(['node','--import','tsx','tests/fixtures/meta-ui.ts']))
C=json.loads(subprocess.check_output(['node','--import','tsx','tests/fixtures/creator-performance-ui.ts']))
external=[];errors=[];actions=[];checks=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 page=browser.new_page(locale='en-GB',timezone_id='Europe/London');page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  req=r.request;path=urlparse(req.url).path
  if not req.url.startswith(BASE):external.append(req.url);r.abort();return
  if not path.startswith('/api/'):r.continue_();return
  if path.startswith('/api/brand-logos/'):r.fulfill(status=404);return
  if path in ['/api/brands','/api/brand-identities']:value=F['brands']
  elif path.endswith('/creatives'):value=F['library']
  elif path.endswith('/creative-competitors'):value={'competitors':F['library']['competitors']}
  elif path.endswith('/onboarding') or path=='/api/brand-research':value=None
  elif path=='/api/public/meta/watchlists':value=F['watchlists']
  elif path in ['/api/budgets','/api/infrastructure/status']:value={'budgets':[]}
  elif path=='/api/connections':value={'connections':[]}
  elif path=='/api/creator-discovery':value=C['snapshot']
  elif path=='/api/creator-performance':value=C['performance']
  elif path=='/api/creator-performance/creator':value=C['details']
  elif path=='/api/creator-discovery/quote':
   body=req.post_data_json;assert body['brief']['seeds']==['one.creator','two_creator','third'];assert body['brief']['minFollowers']==10000;assert 'candles' in body['brief']['keywords'];actions.append('quote');value={'id':'fixture-quote','maxCostGbp':3,'batches':4,'expiresAt':'2026-12-01','available':True,'reason':'Fixture cost limit.'}
  elif path=='/api/creator-performance/import':
   body=req.post_data_json;assert body['scope']['product']=='Starter kit';assert body['scope']['account']=='reported';assert body['scope']['currency']=='GBP';assert 'new-campaign' in body['csv'];actions.append('import');C['performance']['cohorts'][0]['creators']=13;value={'inserted':1}
  else:r.fulfill(status=404,json={'error':'No fixture for '+path});return
  r.fulfill(json=value)
 page.route('**/*',route)
 for width in [1280,1440,1920,390]:
  page.set_viewport_size({'width':width,'height':1100});page.goto(BASE+'/?view=creators&brandId='+F['brand']['id'],wait_until='networkidle')
  expect(page.get_by_role('heading',name='Creators',exact=True)).to_be_visible();expect(page.locator('.creator-research-card')).to_have_count(2)
  expect(page.get_by_text('Forecast available after 50 creator outcomes (12 so far)',exact=True)).to_be_visible();expect(page.get_by_role('button',name='Train forecast on saved outcomes')).to_be_disabled()
  assert 'Predicted ROAS' not in page.locator('main').inner_text()
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
  checks.append({'width':width,'noOverflow':True,'qualifiedCreators':2,'forecastGated':True})
  if width in [1440,390]:page.screenshot(path=str(OUT/f'Creators-{width}.png'),full_page=True)
 page.set_viewport_size({'width':1440,'height':1100})
 page.get_by_label('Describe the creators you need',exact=True).fill('UK micro creators about candles with UGC and Sales Signal at least 60')
 page.get_by_role('button',name='Review chosen filters',exact=True).click();expect(page.get_by_label('Chosen search filters')).to_contain_text('Minimum Sales Signal: 60');expect(page.locator('.creator-research-card')).to_have_count(1)
 page.get_by_label('Sort by',exact=True).select_option('sales');page.get_by_label('Find creators like these',exact=True).fill('@one.creator, @two_creator, third');page.get_by_role('button',name='Use these seed creators').click();expect(page.get_by_label('Seed creators',exact=True)).to_have_value('one.creator, two_creator, third')
 page.get_by_role('button',name='Estimate cost',exact=True).click();expect(page.get_by_role('button',name='Find creators',exact=True)).to_be_visible();assert actions==['quote']
 page.get_by_text('How this signal is calculated',exact=True).click();expect(page.get_by_role('table',name='Sales Signal breakdown')).to_be_visible()
 page.get_by_text('Ads and campaign results',exact=True).click();expect(page.get_by_role('table',name='Ads featuring this creator')).to_be_visible();expect(page.get_by_role('table',name='Owned creator performance')).to_be_visible();expect(page.get_by_role('table',name='Creator campaign outcomes')).to_be_visible()
 page.get_by_text('Who these ads reached',exact=True).click();expect(page.get_by_role('table',name='Published reach by age and gender')).to_be_visible()
 for width in [1440,390]:
  page.set_viewport_size({'width':width,'height':1100});assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),page.evaluate("()=>[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,20).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,text:e.textContent.slice(0,90)}))");page.locator('.creator-research-card').first.scroll_into_view_if_needed();page.screenshot(path=str(OUT/f'Creator-detail-{width}.png'),full_page=True)
 page.get_by_text('Import campaign history',exact=True).click();page.get_by_label('Product or price tier',exact=True).fill('Starter kit')
 history='creator_handle,brand,platform,start_date,end_date,spend,revenue,roas,cpa,content_type,campaign_id,purchases,ad_ids\nharper_creator,Fixture Candle House,Meta,2026-01-01,2026-01-14,100,250,2.5,10,video,new-campaign,10,\n'
 page.get_by_label('Campaign CSV',exact=True).set_input_files({'name':'campaigns.csv','mimeType':'text/csv','buffer':history.encode()});expect(page.get_by_text('1 campaign record added.',exact=True)).to_be_visible();expect(page.get_by_text('Forecast available after 50 creator outcomes (13 so far)',exact=True)).to_be_visible()
 assert actions==['quote','import'];assert not errors and not external,(errors,external)
 browser.close()
ref=Image.open('design/reference/png/Creators.png').convert('RGB');app=Image.open(OUT/'Creators-1440.png').convert('RGB');canvas=Image.new('RGB',(app.width+ref.width,max(app.height,ref.height)+40),'#f7f8fa');canvas.paste(app,(0,40));canvas.paste(ref,(app.width,40));draw=ImageDraw.Draw(canvas);draw.text((16,12),'App: fictional creator performance fixtures',fill='#17223b');draw.text((app.width+16,12),'Approved Creators reference',fill='#17223b');canvas.save(OUT/'Creators-reference-comparison.png')
(OUT/'audit.json').write_text(json.dumps({'checks':checks,'actions':actions,'externalRequests':external,'pageErrors':errors,'providerCalls':0,'note':'Fixtures only. No production measurement or release of validation gates.'},indent=2)+'\n')
