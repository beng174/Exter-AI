"""Isolated TikTok UI fixtures. No live source or model calls."""
from pathlib import Path
from urllib.parse import urlparse
import io,json,subprocess,shutil
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:3144';OUT=Path('docs/review/tiktok-commercial');OUT.mkdir(parents=True,exist_ok=True)
F=json.loads(subprocess.check_output(['node','--import','tsx','tests/fixtures/tiktok-ui.ts']));errors=[];external=[];writes=[];checks=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox']);page=browser.new_page(locale='en-GB',timezone_id='Europe/London');page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  req=r.request;path=urlparse(req.url).path
  if not req.url.startswith(BASE):external.append(req.url);r.abort();return
  if path.startswith('/fixture-tiktok-preview-'):
   idx=int(path.split('-')[-1].split('.')[0]);img=Image.new('RGB',(400,500),['#bdb1a2','#9db09d','#a5b4c3'][idx]);d=ImageDraw.Draw(img);d.rounded_rectangle((140,180,260,340),radius=12,fill='#f7f0df');d.text((150,250),'Fictional candle',fill='#233342');b=io.BytesIO();img.save(b,format='PNG');r.fulfill(body=b.getvalue(),content_type='image/png');return
  if not path.startswith('/api/'):r.continue_();return
  if path.startswith('/api/brand-logos/'):r.fulfill(status=404);return
  if req.method not in ['GET','HEAD']:writes.append(path);r.fulfill(json={'queued':True,'saved':True});return
  if path in ['/api/brands','/api/brand-identities']:value=F['brands']
  elif path.endswith('/creatives'):value=F['library']
  elif path.endswith('/creative-competitors'):value={'competitors':F['library']['competitors']}
  elif path=='/api/public/tiktok':value=F['tiktok']
  elif path=='/api/public/meta/watchlists':value=[]
  elif path=='/api/infrastructure/status':value={'database':'connected','tiktok':{'configured':True,'status':'configured'}}
  elif path=='/api/owned/accounts':value={'accounts':[],'liveDispatchEnabled':False}
  elif path in ['/api/budgets','/api/infrastructure/jobs']:value={'budgets':[]}
  elif path=='/api/connections':value={'connections':[]}
  elif path.endswith('/onboarding') or path=='/api/brand-research':value=None
  elif path=='/api/reports':value=[]
  elif path=='/api/creator-research':value={'results':[],'shortlist':[],'fits':[]}
  elif path.endswith('/demo'):value={'opportunities':[]}
  else:r.fulfill(status=404,json={'error':'No fixture for '+path});return
  r.fulfill(json=value)
 page.route('**/*',route)
 screens={'Creatives':'creatives','CreativeDetail':'creative&id=public%3ATikTok%3A1000','Winners':'winners','Patterns':'patterns','Competitors':'competitors','DataSources':'data'}
 for width in [1280,1440,1920,390]:
  page.set_viewport_size({'width':width,'height':1100})
  for name,view in screens.items():
   page.goto(BASE+'/?brandId='+F['brand']['id']+'&platform=TikTok&view='+view,wait_until='networkidle');expect(page.locator('main h1')).to_have_count(1);assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),(name,width)
   if name=='Creatives':expect(page.locator('.ui-creative-card').first).to_contain_text('18K');expect(page.locator('.ui-creative-card').first).to_contain_text('Estimated')
   if name=='CreativeDetail':expect(page.get_by_role('link',name='Run analysis',exact=True).first).to_have_attribute('href',__import__('re').compile('analysisAdId=tiktok%3Att-0%3A1000'));expect(page.get_by_role('region',name='Working Score',exact=True)).to_contain_text('High confidence');expect(page.get_by_role('region',name='Performance',exact=True)).to_contain_text('18K')
   if name=='DataSources':expect(page.get_by_role('table',name='TikTok advertiser coverage',exact=True)).to_contain_text('100.0%');expect(page.get_by_role('row').filter(has_text='TikTok Commercial Content API')).to_contain_text('Connected')
   if width==1440:
    page.evaluate('scrollTo(0,0)');page.screenshot(path=str(OUT/(name+'-1440.png')),full_page=True);app=Image.open(OUT/(name+'-1440.png')).convert('RGB');ref=Image.open('design/reference/png/'+name+'.png').convert('RGB');canvas=Image.new('RGB',(2880,max(app.height,ref.height)+40),'#f7f8fa');canvas.paste(app,(0,40));canvas.paste(ref,(1440,40));draw=ImageDraw.Draw(canvas);draw.text((16,12),'APP: FICTIONAL TIKTOK FIXTURES, NOT LIVE VERIFICATION',fill='black');draw.text((1460,12),'APPROVED EXTER REFERENCE',fill='black');canvas.save(OUT/(name+'-comparison.png'))
   if width==390 and name in ['DataSources','CreativeDetail']:page.screenshot(path=str(OUT/(name+'-390.png')),full_page=True)
   checks.append({'screen':name,'width':width,'noOverflow':True})
 # Editing uses the same watchlist dialog, and reads never start discovery or collection.
 page.set_viewport_size({'width':1440,'height':1100});page.goto(BASE+'/?brandId='+F['brand']['id']+'&view=competitors&platform=TikTok',wait_until='networkidle');page.get_by_role('button',name='Edit watchlist',exact=True).click();expect(page.get_by_role('dialog',name='Edit watchlist')).to_contain_text('TikTok advertisers');assert not writes
 page.get_by_role('button',name='Edit advertiser',exact=True).first.click();expect(page.get_by_label('Business name',exact=True)).to_have_value('Fictional Candle House');page.get_by_role('button',name='Cancel',exact=True).click();page.keyboard.press('Escape')
 assert not errors and not external,(errors,external);browser.close()
(OUT/'audit.json').write_text(json.dumps({'checks':checks,'pageErrors':errors,'externalRequests':external,'providerCalls':0,'note':'Fixtures only. Live ION8 smoke test waits for deployment.'},indent=2)+'\n')
