"""UI-04 through UI-10: isolated saved-capture screenshots, separate intercepted fixtures.
Run npm run build, start tests/fixtures/m1-server.ts, then python this file.
No provider requests, source collection, mutations or sample seeding.
"""
from pathlib import Path
import json, os, re, shutil, subprocess
from playwright.sync_api import sync_playwright, expect
base=os.environ.get('UI_CD_URL','http://127.0.0.1:3118')
out=Path('output/playwright');out.mkdir(parents=True,exist_ok=True)
views={'overview':('This week','Home'),'brands':('Brand research','Brand research'),'competitors':('Competitors','Competitors'),'formats':('Formats','Formats'),'patterns':('Patterns','Patterns'),'audience':('Audience and voice','Audience & voice'),'winners':('Winners','Winners')}
fixture=json.loads(subprocess.check_output(['node','--import','tsx','--input-type=module','-e','import {researchFixture} from "./tests/fixtures/research.ts"; console.log(JSON.stringify(researchFixture().library));'],text=True))
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1100},locale='en-GB')
    errors=[];external=[];mutations=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    def route(request):
        req=request.request
        if req.method not in ('GET','HEAD'):mutations.append(req.url)
        if req.url.startswith(base):request.continue_()
        else:external.append(req.url);request.abort()
    page.route('**/*',route)
    for view,(title,label) in views.items():
        page.goto(base+'/?view='+view+'&brandId=valentte',wait_until='networkidle')
        expect(page.get_by_role('heading',level=1)).to_have_text(title)
        expect(page.locator('.research-workspace')).to_have_attribute('data-view',view)
        expect(page.get_by_role('navigation',name='Main navigation').get_by_role('link',name=label,exact=True)).to_have_attribute('aria-current','page')
        expect(page.locator('.rws-tabs')).to_have_count(0)
        expect(page.locator('.breadcrumb strong')).to_have_text(label)
        expect(page.locator('.breadcrumb > span')).to_have_text('Overview' if view=='overview' else 'Act' if view=='winners' else 'Research')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),view
        text=page.inner_text('main')
        assert 'n = Unavailable' not in text and 'Unavailable to Unavailable' not in text
        expect(page.locator('.ui-creative-card .ui-meta-line')).to_have_count(0)
        page.screenshot(path=str(out/f'ui-cd-{view}-1440.png'),full_page=True)
    # Real count follows its exact public-evidence URL and browser back restores the screen.
    page.goto(base+'/?view=overview&brandId=valentte',wait_until='networkidle')
    link=page.get_by_role('region',name='You against the market',exact=True).locator('a.research-number').first
    link.click();expect(page).to_have_url(re.compile(r'view=creatives.*kind=active'))
    expect(page.locator('.ui-creative-card')).not_to_have_count(0)
    page.go_back();expect(page.get_by_role('heading',level=1)).to_have_text('This week')
    # Mobile captures use the same genuine saved records; tables scroll internally.
    page.set_viewport_size({'width':390,'height':1000})
    for view in ('overview','competitors'):
        page.goto(base+'/?view='+view+'&brandId=valentte',wait_until='networkidle')
        expect(page.get_by_label('Toggle navigation')).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),view
        page.screenshot(path=str(out/f'ui-cd-{view}-390.png'),full_page=True)
    page.get_by_label('Toggle navigation').click()
    expect(page.get_by_role('navigation',name='Main navigation').get_by_role('link',name='Patterns',exact=True)).to_be_visible()
    page.keyboard.press('Escape')
    # Synthetic populated cases are isolated from all screenshot captures above.
    def saved_library(route):route.fulfill(json=fixture)
    page.route('**/api/brands/valentte/creatives*',saved_library)
    page.set_viewport_size({'width':1440,'height':1100})
    for view,(title,_) in views.items():
        page.goto(base+'/?view='+view+'&brandId=valentte',wait_until='networkidle')
        expect(page.get_by_role('heading',level=1)).to_have_text(title)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),('fixture',view)
    page.goto(base+'/?view=overview&brandId=valentte',wait_until='networkidle')
    account=page.get_by_role('region',name='Your account',exact=True)
    expect(account).to_contain_text('Choose one account scope')
    expect(account.locator('.ui-metric-tile')).to_have_count(0)
    page.get_by_label('Account scope',exact=True).select_option('account-a-gbp')
    expect(account).to_contain_text('£100.00')
    expect(account).not_to_contain_text('$100.00')
    page.get_by_label('Account scope',exact=True).select_option('account-b-usd')
    expect(account).to_contain_text('US$100.00')
    expect(account).not_to_contain_text('£100.00')
    page.goto(base+'/?view=competitors&brandId=valentte',wait_until='networkidle')
    mix=page.get_by_role('region',name='Creative mix by brand',exact=True)
    expect(mix.locator('.reference-mix')).to_be_visible()
    page.locator('.workspace-data-note > summary').click()
    classified=page.locator('.workspace-data-note a[href*="value=classified"]').first
    classified.click();expect(page).to_have_url(re.compile(r'dimension=format&value=classified'))
    expect(page.locator('.ui-creative-card')).to_have_count(2)
    # A chart and a keyboard table row use the same canonical evidence route.
    page.goto(base+'/?view=competitors&brandId=valentte',wait_until='networkidle')
    page.locator('.reference-mix-track button').first.click()
    expect(page).to_have_url(re.compile(r'view=creatives.*kind=active.*dimension=format'))
    expect(page.locator('.ui-creative-card')).not_to_have_count(0)
    page.goto(base+'/?view=patterns&brandId=valentte',wait_until='networkidle')
    page.locator('.ui-data-table tbody tr').first.focus();page.keyboard.press('Enter')
    expect(page).to_have_url(re.compile(r'view=creatives.*dimension=hook'))
    expect(page.locator('.ui-creative-card')).not_to_have_count(0)
    # Card rule: copy title, m:ss, hidden empty tags/format, compact evidence chip, ID fallback.
    fixture['creatives'][0].update({'durationSeconds':11.9322,'hookType':'question','offerType':'none','angle':'gifting'})
    fixture['creatives'][1].update({'copy':'','creativeFormat':None,'angle':None,'hookType':None,'offerType':None,'analysis':None})
    page.goto(base+'/?view=creatives&brandId=valentte&sort=title',wait_until='networkidle')
    expect(page.locator('.ui-creative-duration').filter(has_text='0:12')).to_have_count(1)
    card=page.locator('.ui-creative-card').filter(has=page.get_by_role('heading',name='First line own-new',exact=True))
    expect(card.locator('.ui-creative-tags')).not_to_contain_text('None')
    chip=card.locator('.ui-creative-tags .ui-data-label')
    expect(chip).to_have_text('Modelled')
    assert chip.bounding_box()['width']<card.bounding_box()['width']/2
    fallback=page.locator('.ui-creative-card').filter(has=page.get_by_role('heading',name='Fixture advertiser ad',exact=True))
    expect(fallback.locator('.ui-creative-id')).to_contain_text(fixture['creatives'][1]['nativeId'])
    expect(fallback.locator('.ui-creative-format')).to_have_count(0)
    expect(page.locator('.ui-creative-card .ui-meta-line')).to_have_count(0)
    assert not mutations,mutations
    assert not errors,errors
    assert not external,external
    browser.close()
print('PASS UI-C/UI-D seven ready screens, genuine-capture desktop/mobile screenshots, exact count drill-down/back, populated fixtures, separate account currencies and creative card rules; no provider calls or mutations')
