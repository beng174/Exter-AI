"""Isolated real-route fixtures plus read-only sample boundaries. No provider calls."""
from pathlib import Path
from urllib.parse import urlparse
import json,shutil,subprocess
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:3127'
OUT=Path('output/playwright/accuracy');OUT.mkdir(parents=True,exist_ok=True)
payload=json.loads(subprocess.check_output(['node','--import','tsx','--input-type=module','-e','import {accuracyUiFixture} from "./tests/fixtures/accuracy-ui.ts";console.log(JSON.stringify(accuracyUiFixture()));'],text=True))
fixture=payload['fixture'];brand=fixture['base']['library']['brand']['id'];ad=fixture['base']['library']['creatives'][0]['adId']
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1100},locale='en-GB',timezone_id='Europe/London')
 errors=[];external=[];writes=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 def local(route):
  req=route.request;path=urlparse(req.url).path
  if not req.url.startswith(BASE):external.append(req.url);route.abort();return
  if '/api/' not in path or 'demo=1' in req.url:route.continue_();return
  if req.method not in ('GET','HEAD'):
   writes.append(path)
   if path=='/api/accuracy/estimate':route.fulfill(json=payload['estimate']);return
   route.abort();return
  if path in ('/api/brands','/api/brand-identities'):route.fulfill(json=[fixture['base']['brand']])
  elif path=='/api/accuracy':route.fulfill(json=payload['accuracy'])
  elif path.endswith('/creatives'):route.fulfill(json=fixture['base']['library'])
  elif path.endswith('/creative-competitors'):route.fulfill(json={'competitors':[]})
  elif path.endswith('/demo'):route.fulfill(json={'opportunities':[]})
  elif path=='/api/brand-research':route.fulfill(json=None)
  elif path=='/api/owned/accounts':route.fulfill(json=fixture['owned']['value'])
  elif path=='/api/infrastructure/status':route.fulfill(json={})
  elif path=='/api/connections':route.fulfill(json={'connections':[]})
  elif path=='/api/public/meta/watchlists':route.fulfill(json=[])
  elif path=='/api/budgets':route.fulfill(json={'budgets':[]})
  elif path.startswith('/api/brand-logos/'):route.fulfill(status=204)
  else:route.continue_()
 page.route('**/*',local)
 for width in (1280,1440,1920,390):
  page.set_viewport_size({'width':width,'height':1100})
  for view in ('accuracy','scores','creative','creatives','winners'):
   page.goto(BASE+'/?view='+view+'&brandId='+brand+('&id='+ad if view=='creative' else ''),wait_until='networkidle')
   if view=='accuracy':
    expect(page.get_by_role('heading',name='Accuracy',exact=True)).to_be_visible()
    expect(page.get_by_role('table',name='Accuracy measurements')).to_be_visible()
    expect(page.locator('main')).to_contain_text('3,000 resolved test ads')
    page.get_by_text('Product in the opening · Won · ROAS',exact=True).click()
    expect(page.locator('main')).to_contain_text('Needs £150 spend and 10 purchases per variant')
    expect(page.locator('main')).to_contain_text('CPA is more than 20% worse')
   elif view in ('scores','creative'):
    expect(page.locator('.likelihood-value').first).to_contain_text('Estimated, not yet validated')
    expect(page.locator('.likelihood-value').first).to_contain_text('95% uncertainty range')
    expect(page.locator('.likelihood-value').first).to_contain_text('30 similar ads')
   elif view=='creatives':page.get_by_label('Sort',exact=True).select_option('likelihood');expect(page).to_have_url(__import__('re').compile('sort=likelihood'))
   elif view=='winners':
    page.get_by_label('Winners sort').select_option('likelihood');expect(page).to_have_url(__import__('re').compile('sort=likelihood'))
    expect(page.locator('.likelihood-value')).to_have_count(1)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(view,width)
   if width in (1440,390):page.screenshot(path=str(OUT/f'{view}-fixture-{width}.png'),full_page=True)
 # The draft uses the same inference API and shows validation, never a naked probability.
 page.goto(BASE+'/?view=scores&brandId='+brand,wait_until='networkidle')
 page.get_by_label('Draft analysis (JSON)').set_input_files({'name':'draft.json','mimeType':'application/json','buffer':json.dumps(payload['features']).encode()})
 page.get_by_role('button',name='Score draft',exact=True).click()
 expect(page.locator('.draft-likelihood')).to_contain_text('Estimated, not yet validated')
 assert writes==['/api/accuracy/estimate'],writes
 # Real fixture records never leak into sample; sample cannot run any check.
 page.goto(BASE+'/?view=accuracy&brandId=sample-northwick&demo=1',wait_until='networkidle')
 expect(page.locator('.reference-sample')).to_have_text('Sample data')
 expect(page.get_by_role('button',name='Check saved data')).to_be_disabled()
 assert 'Product in the opening' not in page.locator('main').inner_text()
 assert not external,external
 assert not errors,errors
 browser.close()
print('PASS: 5 ordinary screens at 1280/1440/1920/390, gated metadata, frozen thresholds, guardrail, draft parity and read-only samples. No provider requests.')
