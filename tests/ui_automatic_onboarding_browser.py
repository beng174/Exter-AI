"""Real-workspace-shaped fictional fixtures; all external traffic is blocked."""
from pathlib import Path
from urllib.parse import urlparse
from io import BytesIO
import json,shutil,subprocess
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:3141';OUT=Path('docs/review/automatic-onboarding');OUT.mkdir(parents=True,exist_ok=True)
F=json.loads(subprocess.check_output(['node','--import','tsx','tests/fixtures/automatic-onboarding-ui.ts']))
image=Image.new('RGB',(400,500),'#dce9e8');draw=ImageDraw.Draw(image);draw.rounded_rectangle((145,100,255,430),radius=24,fill='#4b8290');draw.rectangle((170,70,230,115),fill='#304e57');buffer=BytesIO();image.save(buffer,format='PNG');poster=buffer.getvalue()
errors=[];external=[];writes=[];checks=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox']);page=browser.new_page(locale='en-GB',timezone_id='Europe/London');page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  req=r.request;path=urlparse(req.url).path
  if not req.url.startswith(BASE):external.append(req.url);r.abort();return
  if path=='/fixture-bottle.png':r.fulfill(body=poster,content_type='image/png');return
  if not path.startswith('/api/'):r.continue_();return
  if req.method not in ('GET','HEAD'):
   body=req.post_data_json;writes.append({'path':path,'body':body})
   if path.endswith('/page-picture'):r.fulfill(status=204);return
   if path=='/api/onboarding/start':
    assert set(body)=={'name','website'};assert body['name']==F['brand']['name'];r.fulfill(status=202,json={'brand':F['brand'],'runId':'fixture-setup'});return
   if path.endswith('/confirm-page'):
    candidate=F['onboarding']['pages'].pop(0);assert body['pageId']==candidate['pageId'];F['onboarding']['confirmedPages'].append(candidate);r.fulfill(json={'confirmed':True});return
   if path.endswith('/competitor'):
    assert body['action'] in ('remove','add','swap');r.fulfill(json={'saved':True});return
   r.fulfill(status=403,json={'error':'Fixture mutation is disabled.'});return
  if path=='/api/brands':value=[F['brand']]
  elif path=='/api/brand-identities':value=F['identities']
  elif path.endswith('/onboarding'):value=F['onboarding']
  elif path.endswith('/creatives'):value=F['library']
  elif path.endswith('/creative-competitors'):value={'competitors':F['library']['competitors']}
  elif path=='/api/brand-research':value=F['research']
  elif path=='/api/public/meta/watchlists':value=F['watchlists']
  elif path=='/api/infrastructure/status':value={'meta':{'status':'configured'},'database':'connected','mediaDisk':{'status':'unavailable'}}
  elif path=='/api/connections':value={'connections':[]}
  elif path=='/api/budgets':value={'budgets':[]}
  elif path=='/api/owned/accounts':value={'accounts':[],'liveDispatchEnabled':False}
  elif path=='/api/reports':value=[]
  elif path=='/api/creator-research':value={'results':[],'shortlist':[],'fits':[]}
  elif path.endswith('/demo'):value={'opportunities':[]}
  elif path=='/api/public-categories/status':value={'enabled':True,'configured':True,'batches':[],'quote':{'ads':5,'estimatedGbp':.0002,'reserveGbp':.1,'hash':'a'*64}}
  elif path=='/api/ad-media/status':value={'enabled':True,'configured':True,'coverage':[],'runs':[],'disk':{'status':'unavailable'}}
  elif path=='/api/ad-media/missing':value={'ads':[],'total':0,'offset':0,'limit':50}
  elif path.startswith('/api/brand-logos/'):r.fulfill(status=204);return
  else:r.fulfill(status=404,json={'error':'No fixture for '+path});return
  r.fulfill(json=value) if value is not None else r.fulfill(body='null',content_type='application/json')
 page.route('**/*',route)
 for width in (1280,1440,1920,390):
  page.set_viewport_size({'width':width,'height':1100});page.goto(BASE+'/?view=brands&brandId=fixture-bottles',wait_until='networkidle')
  panel=page.locator('#brand-setup');expect(panel).to_contain_text('Brand setup');expect(panel).to_contain_text('reusable water bottles')
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),width
  costs=panel.locator('.onboarding-checklist>li')
  for item in costs.all():
   assert item.evaluate('(e)=>e.scrollWidth<=e.clientWidth+1'),('Checklist clipping',width)
  if width in (1440,390):
   panel.screenshot(path=str(OUT/f'Progress-{width}.png'));page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(OUT/f'BrandResearch-{width}.png'),full_page=True)
   page.get_by_role('button',name='Add brand',exact=True).click();expect(page.get_by_role('dialog',name='Brand workspace')).to_be_visible()
   modal=page.get_by_role('dialog',name='Brand workspace');expect(modal.get_by_label('Brand name',exact=True)).to_be_visible();expect(modal.get_by_label('Website',exact=True)).to_be_visible();expect(modal.locator('select')).to_have_count(0)
   modal.screenshot(path=str(OUT/f'AddBrand-{width}.png'));modal.get_by_role('button',name='Close workspace selection').click()
   page.goto(BASE+'/?view=data&brandId=fixture-bottles',wait_until='networkidle');expect(page.locator('#brand-setup')).to_be_visible();page.screenshot(path=str(OUT/f'DataSources-{width}.png'),full_page=True)
   page.get_by_role('button',name='Edit watchlist',exact=True).first.click();dialog=page.get_by_role('dialog',name='Edit watchlist');expect(dialog).to_contain_text('Fictional Bottle Works');expect(dialog.locator('input[value="1001"]')).to_be_visible();expect(dialog.locator('input[value="1002"]')).to_be_visible();expect(dialog.locator('input[value="1003"]')).to_be_visible();dialog.screenshot(path=str(OUT/f'Watchlist-{width}.png'));dialog.get_by_role('button',name='Close',exact=True).click()
  checks.append({'width':width,'noOverflow':True,'costCardsFit':True})
 page.set_viewport_size({'width':1440,'height':1100});page.goto(BASE+'/?view=brands&brandId=fixture-bottles',wait_until='networkidle');page.get_by_role('button',name='Add brand',exact=True).click();modal=page.get_by_role('dialog',name='Brand workspace');modal.get_by_label('Brand name',exact=True).fill(F['brand']['name']);modal.get_by_label('Website',exact=True).fill(F['brand']['domain']);modal.get_by_role('button',name='Start automatic setup').click();expect(modal).not_to_be_visible()
 page.locator('#brand-setup').get_by_role('button',name='Confirm Page',exact=True).click();expect(page.locator('#brand-setup').get_by_role('button',name='Confirm Page',exact=True)).to_have_count(0)
 page.locator('#brand-setup').get_by_role('button',name='Remove',exact=True).first.click();assert [w for w in writes if w['path'].endswith('/competitor')][-1]['body']['action']=='remove'
 page.locator('#brand-setup').get_by_text('Suggested competitors (1)',exact=True).click();page.locator('#brand-setup').get_by_label('Replace competitor for '+F['onboarding']['competitors'][-1]['name'],exact=True).select_option(F['onboarding']['competitors'][0]['domain']);page.locator('#brand-setup').get_by_role('button',name='Swap',exact=True).click();assert [w for w in writes if w['path'].endswith('/competitor')][-1]['body']['action']=='swap'
 F['onboarding']['status']='complete';page.goto(BASE+'/?view=brands&brandId=fixture-bottles',wait_until='networkidle');expect(page.locator('#brand-setup').get_by_role('button',name='View setup details',exact=True)).to_be_visible();expect(page.locator('.onboarding-checklist')).to_have_count(0);page.locator('#brand-setup').get_by_role('button',name='View setup details',exact=True).click();expect(page.locator('.onboarding-checklist')).to_be_visible()
 assert not external and not errors,(external,errors)
 (OUT/'audit.json').write_text(json.dumps({'checks':checks,'providerCalls':0,'externalRequests':external,'pageErrors':errors,'fixtureActions':writes},indent=2)+'\n');browser.close()
print('PASS: name/website only, live checklist, candidate confirm, remove/swap, multi-Page override, four widths, no providers')
# Keep the approved references beside the full fixture app renders for review.
for screen,reference in [('BrandResearch','Brands'),('DataSources','DataSources')]:
 app_image=Image.open(OUT/f'{screen}-1440.png').convert('RGB')
 ref_image=Image.open(Path('design/reference/png')/f'{reference}.png').convert('RGB')
 canvas=Image.new('RGB',(app_image.width+ref_image.width,max(app_image.height,ref_image.height)+40),'#eef1f5')
 labels=ImageDraw.Draw(canvas);labels.text((16,14),'Exter app - fictional real-workspace-shaped fixtures',fill='#172333');labels.text((app_image.width+16,14),'Approved reference - sample values',fill='#172333')
 canvas.paste(app_image,(0,40));canvas.paste(ref_image,(app_image.width,40));canvas.save(OUT/f'{screen}-comparison.png',optimize=True)
