"""The unchanged checklist made visible in the existing real and sample pages."""
from pathlib import Path
from urllib.parse import parse_qs,urlparse
import shutil,re,json,subprocess
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:3118'
OUT=Path('output/playwright/alignment');OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1100},locale='en-GB',timezone_id='Europe/London')
 external=[];errors=[];fixture=None
 page.on('pageerror',lambda e:errors.append(str(e)))
 def local(route):
  if not route.request.url.startswith(BASE):external.append(route.request.url);route.abort()
  elif fixture is not None and 'demo=1' not in route.request.url and '/api/' in route.request.url:
   path=urlparse(route.request.url).path
   if path in ('/api/brands','/api/brand-identities'):route.fulfill(json=[fixture['base']['brand']])
   elif path.endswith('/creatives'):route.fulfill(json=fixture['base']['library'])
   elif path.endswith('/creative-competitors'):route.fulfill(json={'competitors':[]})
   elif path.endswith('/demo'):route.fulfill(json={'opportunities':[]})
   elif path=='/api/brand-research':route.fulfill(json=None)
   elif path=='/api/creator-research':route.fulfill(json=fixture['creators']['value'])
   elif path=='/api/reports':route.fulfill(json=[])
   elif path=='/api/owned/accounts':route.fulfill(json=fixture['owned']['value'])
   elif path=='/api/infrastructure/status':route.fulfill(json={})
   elif path=='/api/connections':route.fulfill(json={'connections':[]})
   elif path=='/api/public/meta/watchlists':route.fulfill(json=[])
   elif path=='/api/budgets':route.fulfill(json={'budgets':[]})
   elif path.startswith('/api/brand-logos/'):route.fulfill(status=204)
   else:route.continue_()
  else:route.continue_()
 page.route('**/*',local)
 for sample in (False,True):
  brand='sample-northwick' if sample else 'valentte';flag='&demo=1' if sample else ''
  library=page.request.get(BASE+'/api/brands/'+brand+'/creatives?'+('demo=1' if sample else '')).json()
  scored=[r for r in library['creatives'] if r.get('score')]
  if not sample and not scored:
   # The retained preview has no completed score. Exercise the ordinary page branch
   # with an explicitly synthetic API fixture, without seeding any real record.
   code='import {workspaceFixture} from "./tests/fixtures/workspace.ts"; import {sampleCreatives} from "./shared/sample/workspace.ts"; const f=workspaceFixture();const row=f.base.library.creatives[0];row.copy="{{product.brand}}";row.title="{{product.name}}";row.score={...sampleCreatives[0].score,adId:row.adId,nativeId:row.nativeId};f.base.library.creatives=[row];console.log(JSON.stringify(f));'
   fixture=json.loads(subprocess.check_output(['node','--import','tsx','--input-type=module','-e',code],text=True));brand=fixture['base']['library']['brand']['id'];scored=fixture['base']['library']['creatives']
  if sample:fixture=None
  assert scored,'A recorded or synthetic fixture score exists'
  page.goto(BASE+'/?view=scores&brandId='+brand+flag,wait_until='networkidle')
  picker=page.get_by_label('Select saved score',exact=True)
  assert all('{{' not in label and '}}' not in label for label in picker.locator('option').all_text_contents())
  section=page.locator('.creative-score-breakdown').first
  expect(section.locator('tbody tr')).to_have_count(5)
  assert 'How this score works' in section.inner_text()
  assert section.locator('details').get_attribute('open') is None
  assert not re.search('rubric|heuristic|model-reported',section.locator('tbody').inner_text(),re.I)
  for chip in section.locator('.ui-status-chip').all():
   assert chip.evaluate('e=>e.scrollWidth<=e.clientWidth+1'),chip.inner_text()
  page.screenshot(path=str(OUT/f'score-Scores-{"sample" if sample else "fixture"}-1440.png'),full_page=True)
  if sample:
   expect(section.locator('.creative-score-headline')).to_contain_text('4 of 5 checks assessed')
   expect(section.locator('.creative-score-headline')).to_contain_text('Provisional')
   expect(section.locator('tfoot')).to_contain_text('80 of 80 assessed points = 100. 20 points not assessed.')
   assert '100 / 100' not in section.inner_text()
   link=section.locator('td:last-child a').filter(has_text='0:23').first
   link.click();expect(page).to_have_url(re.compile(r't=23'))
   expect(page.locator('.read-model-player')).to_contain_text('0:23 / 0:24')
   page.get_by_role('button',name='Next creative',exact=True).click()
   assert 't' not in parse_qs(urlparse(page.url).query),'A different creative starts at its own beginning'
   page.go_back()
   page.goto(BASE+'/?view=creative&brandId='+brand+flag+'&id=sample-ad-001&t=23',wait_until='networkidle')
  else:page.goto(BASE+'/?view=creative&brandId='+brand+'&id='+scored[0]['adId'],wait_until='networkidle')
  detail=page.get_by_role('region',name='Creative score',exact=True)
  expect(detail.locator('tbody tr')).to_have_count(5)
  detail.screenshot(path=str(OUT/f'score-CreativeDetail-{"sample" if sample else "fixture"}-1440.png'))
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 assert not external,external
 browser.close()
print('PASS ordinary-route fixture and sample score coverage, complete five-check breakdown, plain reasons, fitting chips, title picker, totals and source moment links. No external requests.')
