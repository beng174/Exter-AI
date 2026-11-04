"""UI-00/UI-01 on the isolated M1 retained-capture server, never production.
Run npm run build, start node --import tsx tests/fixtures/m1-server.ts, then this file.
No provider requests or sample seeding are allowed.
"""
from pathlib import Path
import os
import shutil
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('UI_A_URL','http://127.0.0.1:3118')
out=Path('output/playwright');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1100})
    errors=[];external=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    def route(request):
        if request.request.url.startswith(base):request.continue_()
        else:external.append(request.request.url);request.abort()
    page.route('**/*',route)
    page.goto(base+'/?view=ads&brandId=valentte&sort=days',wait_until='networkidle')
    expect(page).to_have_url(base+'/?view=creatives&brandId=valentte&sort=days')
    nav=page.get_by_role('navigation',name='Main navigation')
    for name in ('Overview','Research','Act','Share','Settings'):
        expect(nav.get_by_role('region',name=name)).to_be_visible()
    for hidden in ('Patterns','Winners','Opportunities and briefs','Scores','Ask Exter','Brand demo'):
        expect(nav.get_by_role('link',name=hidden,exact=True)).to_have_count(0)
    expect(page.locator('.ui-creative-card')).to_have_count(58)
    nav.get_by_role('link',name='Brand research',exact=True).click()
    expect(page).to_have_url(base+'/?view=brands&brandId=valentte&sort=days')
    expect(nav.get_by_role('link',name='Brand research',exact=True)).to_have_attribute('aria-current','page')
    page.go_back();expect(nav.get_by_role('link',name='Creatives',exact=True)).to_have_attribute('aria-current','page')
    page.go_forward();expect(nav.get_by_role('link',name='Brand research',exact=True)).to_have_attribute('aria-current','page')
    for alias,new in [('brand','brands'),('audiences','audience'),('sources','data')]:
        page.goto(base+'/?view='+alias+'&brandId=valentte',wait_until='networkidle')
        expect(page).to_have_url(base+'/?view='+new+'&brandId=valentte')
    # Every ready page uses its existing screen rather than an unready placeholder.
    for view in ('overview','brands','competitors','creatives','formats','audience','creators','reports','data','settings','labelling'):
        page.goto(base+'/?view='+view+'&brandId=valentte',wait_until='networkidle')
        expect(page.locator('main')).to_be_visible()
        assert page.locator('main h1').count()==1,view
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),view
    page.goto(base+'/?view=winners&brandId=valentte',wait_until='networkidle')
    expect(page).to_have_url(base+'/?view=overview&brandId=valentte')
    page.screenshot(path=str(out/'ui-a-1440.png'),full_page=True)
    assert 'Rhode' not in page.inner_text('body')
    page.goto(base+'/?view=creatives&brandId=valentte',wait_until='networkidle')
    page.locator('.ui-creative-open').first.click()
    expect(page).to_have_url(__import__('re').compile(r'view=creative&brandId=valentte&id='))
    expect(page.get_by_role('region',name='Source and running history',exact=True)).to_be_visible()
    page.get_by_label('Next creative',exact=True).click()
    page.go_back()
    expect(page).to_have_url(base+'/?view=creatives&brandId=valentte')
    expect(page.get_by_role('dialog')).to_have_count(0)
    page.go_forward();expect(page.get_by_role('region',name='Source and running history',exact=True)).to_be_visible()
    page.locator('main').get_by_role('link',name='Creatives',exact=True).click();expect(page.get_by_role('dialog')).to_have_count(0)
    # The explicit flag only reveals the existing demo entry. No samples are seeded.
    page.goto(base+'/?view=overview&brandId=valentte&demo=1',wait_until='networkidle')
    expect(nav.get_by_role('link',name='Brand demo',exact=True)).to_be_visible()
    for width in (959,390):
        page.set_viewport_size({'width':width,'height':1000})
        page.goto(base+'/?view=overview&brandId=valentte',wait_until='networkidle')
        expect(page.get_by_label('Toggle navigation')).to_be_visible()
        expect(nav).not_to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),width
        if width==390:page.screenshot(path=str(out/'ui-a-390.png'),full_page=True)
        page.get_by_label('Toggle navigation').click();expect(nav).to_be_visible()
        page.wait_for_function('document.getElementById("main-sidebar").getBoundingClientRect().left >= 0')
        expect(page.get_by_label('Toggle navigation')).to_have_attribute('aria-expanded','true')
        if width==390:page.screenshot(path=str(out/'ui-a-390-navigation.png'))
        page.keyboard.press('Escape');expect(nav).not_to_be_visible()
        page.get_by_label('Toggle navigation').click()
        nav.get_by_role('link',name='Creatives',exact=True).click();expect(nav).not_to_be_visible()
        expect(page.locator('.ui-creative-card')).to_have_count(58)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),width
    assert not errors,errors
    assert not external,external
    browser.close()
print('PASS UI-A grouped navigation, ready guards, aliases, back/forward, full-page creative URLs, existing screens, demo hiding, 1440px/390px screenshots and mobile overflow')
