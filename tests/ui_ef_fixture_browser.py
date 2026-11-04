"""Synthetic UI-E/F interaction fixtures only. Never used for reference screenshots."""
import json,shutil,subprocess,re
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
base='http://127.0.0.1:3118'
fixture=json.loads(subprocess.check_output(['node','--import','tsx','--input-type=module','-e','import {workspaceFixture} from "./tests/fixtures/workspace.ts"; console.log(JSON.stringify(workspaceFixture()));'],text=True))
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox']);page=browser.new_page(viewport={'width':1440,'height':1100},locale='en-GB');errors=[];posts=[];external=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 def route(r):
  req=r.request;path=urlparse(req.url).path
  if not req.url.startswith(base):external.append(req.url);r.abort();return
  if path.startswith('/api/brands/') and path.endswith('/creatives'):r.fulfill(json=fixture['base']['library']);return
  if path.startswith('/api/brands/') and path.endswith('/demo'):r.fulfill(json={'opportunities':[]});return
  if path=='/api/creator-research':r.fulfill(json=fixture['creators']['value']);return
  if path=='/api/reports' and req.method=='GET':r.fulfill(json=fixture['reports']['value']);return
  if path=='/api/owned/accounts' and req.method=='GET':r.fulfill(json=fixture['owned']['value']);return
  if path=='/api/budgets':r.fulfill(json={'month':'2026-11','currency':'GBP','timezone':'UTC','budgets':[{'cost_type':'inference','monthly_budget_gbp':100,'used_gbp':38,'paused':False,'pause_reason':None,'threshold_gbp':90,'remaining_gbp':52,'request_reserve_gbp':1},{'cost_type':'data_providers','monthly_budget_gbp':20,'used_gbp':0,'paused':False,'pause_reason':None,'threshold_gbp':18,'remaining_gbp':18,'request_reserve_gbp':None}]});return
  if req.method in ('POST','PUT'):
   posts.append((path,req.post_data_json))
   if path=='/api/ask':r.fulfill(json={'answer':'Saved source-backed answer.','sources':[fixture['base']['library']['creatives'][0]['adId']]});return
   if path=='/api/creator-research/shortlist':fixture['creators']['value']['candidates'][0]['shortlisted']=True;r.fulfill(json={'saved':True});return
   if path=='/api/reports':r.fulfill(json=fixture['reports']['value'][0]);return
   if path=='/api/owned/accounts':r.fulfill(json={'saved':True});return
   if path=='/api/budgets/inference':r.fulfill(json={'budget':{'cost_type':'inference','monthly_budget_gbp':100,'used_gbp':38,'paused':False,'threshold_gbp':90,'remaining_gbp':52,'request_reserve_gbp':1,'pause_reason':None}});return
   raise AssertionError('Unexpected mutation '+path)
  r.continue_()
 page.route('**/*',route)
 for view in ('briefs','creators','scores','ask','reports','data'):
  page.goto(base+'/?view='+view+'&brandId=valentte',wait_until='networkidle')
  expect(page.locator('.action-workspace')).to_have_attribute('data-view',view)
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),view
 assert not posts,posts
 # Header route opens a page; submitted answer uses existing saved-data API, with true source links.
 page.goto(base+'/?view=ask&brandId=valentte',wait_until='networkidle')
 page.get_by_label('Ask a question',exact=True).fill('What does the saved evidence say?');page.get_by_role('button',name='Ask',exact=True).click()
 expect(page.get_by_role('region',name='Answer',exact=True)).to_contain_text('Saved source-backed answer.')
 source=page.get_by_role('region',name='Sources for this answer',exact=True).locator('a').first
 expect(source).to_have_attribute('href',re.compile(r'view=creatives.*ad=own-new'))
 expect(page.get_by_role('region',name='Earlier questions',exact=True)).to_contain_text('What does the saved evidence say?')
 # No fake numeric fit percentages; shortlist retains its existing scoped API.
 page.goto(base+'/?view=creators&brandId=valentte',wait_until='networkidle')
 expect(page.locator('.creator-reference-card')).to_contain_text('Fixture creator')
 page.get_by_role('button',name='Shortlist',exact=True).click();expect(page.get_by_role('button',name='Shortlisted',exact=True)).to_be_visible()
 expect(page.get_by_role('link',name='Export shortlist',exact=True)).to_have_attribute('href',re.compile(r'/api/creator-research/report.*brandId=workspace-a'))
 # Saved scores select actual checklist data; unsupported draft upload stays disabled.
 page.goto(base+'/?view=scores&brandId=valentte',wait_until='networkidle')
 expect(page.get_by_role('region',name='Selected result',exact=True)).to_contain_text('Hook in 2 seconds')
 expect(page.get_by_role('button',name=re.compile('^Score draft:'))).to_be_disabled()
 expect(page.get_by_role('columnheader',name='Working Score',exact=True)).to_have_count(0)
 page.get_by_role('region',name='Recent creative scores',exact=True).locator('tbody tr').first.focus();page.keyboard.press('Enter')
 expect(page).to_have_url(re.compile(r'view=creative.*id=own-new'))
 # Reports retain real generation/download; weekly-pack/PDF/client-link controls are disabled.
 page.goto(base+'/?view=reports&brandId=valentte',wait_until='networkidle')
 expect(page.get_by_role('link',name='Download saved report',exact=True)).to_have_attribute('href','/api/reports/fixture-report/download')
 page.get_by_role('button',name='Generate report',exact=True).click();expect(page.get_by_role('button',name='Generate report',exact=True)).to_be_enabled()
 # Off-by-default dispatch is visible as disabled controls. Account metadata has no credential field.
 page.goto(base+'/?view=data&brandId=valentte',wait_until='networkidle')
 account=page.get_by_role('region',name='Your ad accounts',exact=True)
 expect(account.get_by_role('button',name='Sync now',exact=True)).to_be_disabled()
 expect(account).to_contain_text('GBP');expect(account).to_contain_text('3 Nov 2026')
 account.get_by_role('button',name='Add account',exact=True).click()
 account.get_by_label('Account ID',exact=True).fill('99887766');account.get_by_label('Currency',exact=True).fill('USD')
 account.get_by_role('button',name='Save account metadata',exact=True).click()
 expect(account.get_by_role('button',name='Add account',exact=True)).to_be_visible()
 budget=page.get_by_role('region',name='Budgets and schedule',exact=True)
 expect(budget).to_contain_text('£38.00 of £100.00 this month')
 budget.get_by_text('Edit budget',exact=True).first.click();budget.get_by_role('button',name='Save budget',exact=True).first.click();expect(budget).to_contain_text('monthly budget saved')
 for path,body in posts:
  if path=='/api/owned/accounts':assert set(body)=={'workspaceId','platform','accountId','currency','attribution','conversionEvent'} and body['workspaceId']=='workspace-a' and body['currency']=='USD'
  assert '/sync' not in path and '/search' not in path and '/fit' not in path,posts
 assert not errors,errors
 assert not external,external
 browser.close()
print('PASS separate synthetic fixtures: Ask source citations/history, scoped shortlist/export, saved scores and disabled drafts, report generation/download, safe account metadata, existing budget edit, no live dispatch')
