"""The complete fictional workspace through the real app and API. No provider calls.
Run npm run build; node --import tsx tests/fixtures/m1-server.ts; python this file.
"""
from pathlib import Path
from urllib.parse import urlparse,parse_qs
import json,re,shutil
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:3118'
OUT=Path('output/playwright');OUT.mkdir(parents=True,exist_ok=True)
SCREENS={
 'Main':('overview',['What to work on','You against the market','Your account','Top working ads','What changed','Needs attention']),
 'Brands':('brands',['Northwick Candle Co.','What the public sources say','Positioning signals','Competitor set','Profiles, creators and limits']),
 'Competitors':('competitors',['Scorecard','Creative mix by brand','What each competitor leans on']),
 'Creatives':('creatives',[]),
 'CreativeDetail':('creative&id=sample-ad-001',['Scenes · jump to a moment','Source and running history','Performance','Creative score','Viewer retention','What is said and shown','How Exter reads it','In the market']),
 'Formats':('formats',['Format league table','How winning ads are built']),
 'Patterns':('patterns',['You against the category','What each action means']),
 'Audience':('audience',['Customer voice','Words customers use','Who the ads reach','How each brand talks']),
 'Winners':('winners',['Working Score','Your account winners']),
 'Briefs':('briefs',['7 opportunities this week','Gift-ready unboxing','The brief']),
 'Creators':('creators',['Ama','Hana','Cleo','Priya','Megan','Sofia']),
 'Scores':('scores',['Score a draft','Gift box, version 2','Recent scores','Predictive score']),
 'Ask':('ask',['Answer','Sources for this answer','Earlier questions']),
 'Reports':('reports',['Weekly packs','Client link','Northwick Candle Co. · 27 Oct to 2 Nov']),
 'DataSources':('data',['Source health','Your ad accounts','Ad naming convention','Budgets and schedule','Users and client access'])
}
checks=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1100},locale='en-GB',timezone_id='Europe/London')
 errors=[];external=[];bad=[];writes=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.on('response',lambda response:bad.append((response.status,response.url)) if response.status>=400 else None)
 def route(r):
  req=r.request
  if not req.url.startswith(BASE):external.append(req.url);r.abort();return
  if req.method not in ('GET','HEAD'):writes.append((req.method,req.url))
  r.continue_()
 page.route('**/*',route)
 page.goto(BASE+'/?view=overview&brandId=valentte',wait_until='networkidle')
 assert 'Northwick' not in page.locator('main').inner_text()
 expect(page.locator('.reference-sample')).to_have_count(0)
 real_preference=page.evaluate('localStorage.getItem("exter-brand")')
 bad.clear()
 for name,(view,headings) in SCREENS.items():
  page.goto(BASE+'/?demo=1&brandId=sample-northwick&view='+view,wait_until='networkidle')
  expect(page.locator('main h1')).to_have_count(1)
  expect(page.locator('.reference-sample')).to_have_text('Sample data')
  expect(page.get_by_label('Switch brand',exact=True)).to_contain_text('Sample · 5 competitors')
  expect(page.locator('main .ui-section-empty')).to_have_count(0)
  assert page.locator('main h2').all_text_contents()==headings,(name,page.locator('main h2').all_text_contents())
  assert not re.search(r'\b(?:CA|UI)-\d+',page.locator('main').inner_text()),name
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),name
  # Every internal link retains the flag, including links opened in a new tab.
  assert page.locator('a[href]').evaluate_all('els=>els.every(a=>{const u=new URL(a.href,location.origin);return u.origin!==location.origin||u.pathname!=="/"||u.searchParams.get("demo")==="1"})'),name
  if name=='Creatives':
   expect(page.locator('.ui-creative-card')).to_have_count(8)
   expect(page.locator('.read-model-filter-options')).to_have_count(0)
   expect(page.locator('.creative-results')).to_contain_text('Showing 8 of 260')
   assert all(value!='Unavailable' for value in page.locator('.ui-creative-card dd').all_text_contents())
  if name=='Winners':expect(page.get_by_role('columnheader',name='Score',exact=True)).to_be_visible()
  if name=='Competitors':
   tracks=page.locator('.reference-mix-track');expect(tracks).to_have_count(6)
   assert tracks.locator('button').evaluate_all('els=>els.length>0 && els.every(e=>e.getBoundingClientRect().width>0 && e.getBoundingClientRect().height>=18)'), 'Visible mix bars'
  if name=='Creators':expect(page.locator('.creator-reference-card')).to_have_count(6)
  if name=='Scores':
   expect(page.get_by_role('region',name='Predictive score',exact=True)).to_contain_text('Not validated yet')
   expect(page.get_by_role('button',name='Score draft',exact=True)).to_be_disabled()
  if name=='Reports':expect(page.locator('.report-sections>section')).to_have_count(8)
  if name=='DataSources':
   expect(page.get_by_role('region',name='Source health',exact=True).locator('tbody tr')).to_have_count(9)
   assert all(not button.is_enabled() for button in page.get_by_role('button',name='Sync now',exact=True).all())
  page.screenshot(path=str(OUT/f'sample-{name}-1440.png'),full_page=True)
  checks.append({'screen':name,'sections':headings,'populated':True,'width':1440})
 assert not errors,errors
 assert not bad,bad
 assert not writes,writes
 assert not external,external
 # Read-only interactions work without provider-backed writes.
 page.goto(BASE+'/?demo=1&brandId=sample-northwick&view=ask',wait_until='networkidle')
 page.get_by_label('Ask a question',exact=True).fill('Which of our ads are tiring?')
 page.get_by_role('button',name='Ask',exact=True).click()
 expect(page.get_by_role('region',name='Answer',exact=True)).to_contain_text('frequency rose to 3.8')
 assert len(writes)==1 and '/api/ask?' in writes[0][1],writes
 page.goto(BASE+'/?demo=1&brandId=sample-northwick&view=creatives',wait_until='networkidle')
 page.locator('.ui-creative-open').first.click();expect(page).to_have_url(re.compile('demo=1.*view=creative'))
 page.locator('.read-model-scenes button').nth(2).click();expect(page.locator('.read-model-player')).to_contain_text('0:11 / 0:24')
 page.get_by_role('button',name='Creatives',exact=True).click();expect(page).to_have_url(re.compile('view=creatives'))
 page.locator('.ui-creative-open').nth(1).click()
 expect(page.get_by_role('region',name='Viewer retention',exact=True)).to_have_count(0)
 assert 'ROAS' not in page.get_by_role('region',name='Performance',exact=True).inner_text()
 page.goto(BASE+'/?demo=1&brandId=sample-northwick&view=overview',wait_until='networkidle')
 page.get_by_role('link',name='Weekly report',exact=True).click();expect(page).to_have_url(re.compile('demo=1'))
 page.go_back();expect(page.get_by_role('heading',level=1)).to_have_text('This week')
 page.get_by_label('Switch brand',exact=True).click()
 expect(page.get_by_role('dialog',name='Brand workspace',exact=True)).to_contain_text('Sample data')
 assert 'Valentte' not in page.get_by_role('dialog',name='Brand workspace',exact=True).inner_text()
 expect(page.get_by_role('button',name='Create workspace',exact=True)).to_be_disabled()
 page.keyboard.press('Escape')
 assert page.evaluate('localStorage.getItem("exter-brand")')==real_preference
 # Legacy operator links remain labelled and cannot escape the read-only sample.
 for view in ('demo','settings','labelling'):
  page.goto(BASE+'/?demo=1&brandId=sample-northwick&view='+view,wait_until='networkidle')
  expect(page.locator('.reference-sample')).to_have_text('Sample data')
  assert 'demo=1' in page.url
 # The 390px check covers the most dense table and brief; screenshots requested at 1440px.
 for view in ('overview','competitors','creatives','briefs','data'):
  page.set_viewport_size({'width':390,'height':1000})
  page.goto(BASE+'/?demo=1&brandId=sample-northwick&view='+view,wait_until='networkidle')
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),view
  expect(page.locator('.reference-sample')).to_have_text('Sample data')
 page.set_viewport_size({'width':1440,'height':1100})
 page.goto(BASE+'/?demo=1&brandId=sample-northwick&view=overview',wait_until='networkidle')
 page.locator('#main-sidebar').screenshot(path=str(OUT/'sample-Sidebar-1440.png'))
 page.goto(BASE+'/?view=overview',wait_until='networkidle')
 expect(page.locator('.reference-sample')).to_have_count(0)
 assert 'Northwick' not in page.locator('main').inner_text()
 assert page.evaluate('localStorage.getItem("exter-brand")')==real_preference
 assert not errors,errors
 assert not external,external
 assert len(writes)==1,writes
 browser.close()
for name in [*SCREENS,'Sidebar']:
 app=Image.open(OUT/f'sample-{name}-1440.png').convert('RGB');ref=Image.open(f'design/reference/png/{name}.png').convert('RGB')
 canvas=Image.new('RGB',(app.width+ref.width,max(app.height,ref.height)+36),'#e5e7eb');draw=ImageDraw.Draw(canvas)
 draw.text((16,10),'APP: explicit fictional sample workspace',fill='#1f2937');draw.text((app.width+16,10),'APPROVED REFERENCE: fictional sample values',fill='#1f2937')
 canvas.paste(app,(0,36));canvas.paste(ref,(app.width,36));canvas.save(OUT/f'sample-{name}-comparison.png',optimize=True)
Path('work/sample-acceptance.json').write_text(json.dumps(checks,indent=2))
print('PASS all 15 sample screens and sidebar: populated reference section order, Sample labels, isolated brand selection and API data, read-only actions, canned Ask with sources, creative history/scenes, no competitor private outcomes, link/new-tab flag preservation, mobile overflow and 16 app/reference pairs. No external requests. Fixtures are not live verification.')
