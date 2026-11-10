"""Supplied archive IDs with fictional responses; no production or provider access."""
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from io import BytesIO
import json,shutil,subprocess,copy
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright,expect
OUT=Path('docs/review/media-backfill');OUT.mkdir(parents=True,exist_ok=True)
F=json.loads(subprocess.check_output(['node','--import','tsx','tests/fixtures/meta-ui.ts']))
ids=['4202123139999399','1654480715998688','794644396558199','748549117960441','2040543976838113','1885631332089043']
brand=F['brand'];brand.update({'name':'Valentte','domain':'valentte.example','competitors':['Aery Living'],'primaryCategories':['candles']})
rival={**brand,'id':'name:aery living','name':'Aery Living','domain':'aery.example','competitors':[]};F['brands']=[brand,rival]
lib=F['library'];lib['brand']=brand;lib['competitors']=[{'key':rival['id'],'name':rival['name'],'status':'collected','brandId':None}];lib['sources']=[{'brandId':rival['id'],'name':rival['name'],'status':'collected'}]
base=copy.deepcopy(lib['creatives'][0]);lib['creatives']=[]
for i,native in enumerate(ids+['900000000000001','900000000000002','900000000000003']):
 own=i<7;row={**base,'adId':'public:Meta:'+native,'nativeId':native,'brandId':brand['id'] if own else rival['id'],'brandName':brand['name'] if own else rival['name'],'workspaceBrand':own,'copy':'{{product.brand}} · {{product.name}}' if i<4 else 'The first full line of a fictional candle ad for quiet evenings. More copy stays in the detail page. Another long sentence must not stretch this table row.\nSecond line.','adFormat':'catalogue' if i<4 else 'static_image','daysRunning':430-i*13,'deliveryStartAt':'2025-08-21','deliveryStatus':'active','thumbnailUrl':None if own else '/fixture/poster.png','imageUrls':[],'videoUrl':None,'mediaAvailable':not own,'mediaStatus':'not-stored' if own else 'stored','mediaKind':'image','creativeFormat':None,'hookType':None,'angle':None,'offerType':None,'productCategories':[],'previewState':{'failedDays':0,'reason':'not_requested','lastAttemptAt':None}}
 lib['creatives'].append(row)
for i,w in enumerate(F['watchlists']):w.update({'brand_key':brand['id'] if i==0 else rival['id'],'page_ids':['12001' if i==0 else '12002']})
F['watchlists']=F['watchlists'][:2]
def picture(name,colour,logo=False):
 im=Image.new('RGB',(64,64) if logo else (320,400),'white' if logo else '#ece0d0');d=ImageDraw.Draw(im)
 if logo:d.rounded_rectangle((4,4,60,60),radius=8,outline=colour,width=3);d.text((9,26),name,fill=colour)
 else:d.rounded_rectangle((75,140,245,320),radius=12,fill=colour);d.rectangle((85,125,235,145),fill='#aa8f67');d.text((105,215),'CANDLE',fill='white')
 b=BytesIO();im.save(b,format='PNG');return b.getvalue()
poster=picture('', '#53706c');logo=picture('Saved','#1c3d67',True)
external=[];errors=[];checks=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox']);page=browser.new_page(locale='en-GB',timezone_id='Europe/London');page.on('pageerror',lambda e:errors.append(str(e)))
 for phase,baseurl in [('before','http://127.0.0.1:3141'),('after','http://127.0.0.1:3142')]:
  page.unroute_all();data=copy.deepcopy(F)
  if phase=='after':
   for i,row in enumerate(data['library']['creatives'][:6]):row.update({'thumbnailUrl':'/fixture/poster.png','imageUrls':['/fixture/poster.png'],'mediaAvailable':True,'mediaStatus':'stored','catalogueProduct':{'title':f'Fictional candle collection {i+1}','description':'Two candles for quiet evenings.'} if i<4 else None})
  def route(r):
   req=r.request;path=urlparse(req.url).path
   if not req.url.startswith(baseurl):external.append(req.url);r.abort();return
   if path=='/fixture/poster.png':r.fulfill(body=poster,content_type='image/png');return
   if not path.startswith('/api/'):r.continue_();return
   if path.startswith('/api/brand-logos/'):r.fulfill(body=logo,content_type='image/png');return
   if path in ('/api/brands','/api/brand-identities'):value=data['brands']
   elif path.endswith('/creatives'):value=data['library']
   elif path.endswith('/creative-competitors'):value={'competitors':data['library']['competitors']}
   elif path.endswith('/onboarding') or path=='/api/brand-research':r.fulfill(body='null',content_type='application/json');return
   elif path=='/api/public/meta/watchlists':value=data['watchlists']
   elif path=='/api/connections':value={'connections':[]}
   elif path=='/api/infrastructure/status':value={'database':'connected','meta':{'status':'configured'}}
   elif path=='/api/ad-media/status':value={'enabled':True,'configured':True,'coverage':[],'runs':[],'disk':{'status':'unavailable'}}
   elif path=='/api/ad-media/missing':value={'total':0,'offset':0,'limit':50,'ads':[]}
   elif path=='/api/public-categories/status':value={'batches':[],'quote':{'ads':0,'estimatedGbp':0,'reserveGbp':0,'hash':'a'*64}}
   elif path=='/api/budgets':value={'month':'2026-11','budgets':[]}
   else:r.fulfill(status=404,json={'error':'Fixture missing: '+path});return
   r.fulfill(json=value)
  page.route('**/*',route)
  for width in ((1440,390) if phase=='before' else (1280,1440,1920,390)):
   page.set_viewport_size({'width':width,'height':1100});page.goto(baseurl+'/?view=winners&brandId='+brand['id'],wait_until='networkidle')
   expect(page.get_by_role('heading',name='Winners',exact=True)).to_be_visible()
   if phase=='after':
    expect(page.get_by_label('Only ads with previews',exact=True)).to_be_checked();assert '{{product.' not in page.locator('main').inner_text();assert 'Valentte ad' not in page.locator('main').inner_text()
    expect(page.locator('img[src="/fixture/poster.png"]').first).to_be_visible();assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
    titles=page.locator('.reference-creative-row strong');assert all(t.evaluate('(e)=>e.getBoundingClientRect().height<=44') for t in titles.all())
    logos=page.locator('.reference-creative-row .brand-mark img');assert logos.count()>0;assert all(l.evaluate('(e)=>e.complete && e.naturalWidth>0 && Number(getComputedStyle(e).opacity)===1') for l in logos.all())
    checks.append({'width':width,'noOverflow':True,'titlesTwoLines':True,'savedLogosVisible':True})
   if width in (1440,390):page.screenshot(path=str(OUT/f'{phase}-Winners-{width}.png'),full_page=True)
  if phase=='after':
   page.get_by_label('Only ads with previews',exact=True).uncheck();expect(page.get_by_role('group',name='Preview loading',exact=True).first).to_be_visible();page.screenshot(path=str(OUT/'after-Winners-with-loading-390.png'),full_page=True)
   page.set_viewport_size({'width':1440,'height':1100});page.goto(baseurl+'/?view=creatives&brandId='+brand['id'],wait_until='networkidle');assert '{{product.' not in page.locator('main').inner_text();page.screenshot(path=str(OUT/'after-Creatives-1440.png'),full_page=True)
 assert not external and not errors,(external,errors)
 (OUT/'audit.json').write_text(json.dumps({'checks':checks,'providerCalls':0,'externalRequests':external,'pageErrors':errors,'note':'Supplied IDs, fictional media/copy/logo fixtures. No production trace.'},indent=2));browser.close()
for width in (1440,390):
 a=Image.open(OUT/f'before-Winners-{width}.png');b=Image.open(OUT/f'after-Winners-{width}.png');im=Image.new('RGB',(a.width+b.width,max(a.height,b.height)+32),'#edf0f5');d=ImageDraw.Draw(im);d.text((12,10),'Before - fixture reproduction',fill='#172333');d.text((a.width+12,10),'After - fixture recovery',fill='#172333');im.paste(a,(0,32));im.paste(b,(a.width,32));im.save(OUT/f'Winners-before-after-{width}.png')
a=Image.open(OUT/'after-Winners-1440.png');b=Image.open('design/reference/png/Winners.png');im=Image.new('RGB',(a.width+b.width,max(a.height,b.height)+32),'#edf0f5');im.paste(a,(0,32));im.paste(b,(a.width,32));im.save(OUT/'Winners-reference-comparison.png')
print('PASS: fixture before/after, supplied archive IDs, four widths, default preview filter, catalogue titles and saved-logo images; no provider calls')
