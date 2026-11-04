"""Final filter/Basis acceptance. Screenshot retained records; intercept synthetic fixtures separately.
Run npm run build and node --import tsx tests/fixtures/m1-server.ts first.
"""
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import json, shutil, subprocess, re
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:3118'
OUT = Path('output/playwright')
SCREENS = [('Home', 'overview'), ('Brand research', 'brands'), ('Competitors', 'competitors'), ('Creatives', 'creatives&layout=table'), ('Formats', 'formats'), ('Patterns', 'patterns'), ('Audience', 'audience'), ('Winners', 'winners'), ('Scores', 'scores')]
fixture = json.loads(subprocess.check_output(['node', '--import', 'tsx', '--input-type=module', '-e', 'import {workspaceFixture} from "./tests/fixtures/workspace.ts"; console.log(JSON.stringify(workspaceFixture()));'], text=True))
audit = []
errors, external, mutations = [], [], []

def basis_tables(page, mode, width, screen):
    tables = page.locator('.ui-data-table').filter(has=page.locator('th.ui-table-basis'))
    for table in tables.all():
        caption = table.locator('caption').inner_text()
        for scroll in (0, 100000):
            table.locator('.ui-table-scroll').evaluate('(el,x)=>el.scrollLeft=x', scroll)
            cells = table.locator('.ui-table-basis').evaluate_all('''els=>els.map(el=>{
                const box=el.getBoundingClientRect(), region=el.closest('.ui-table-scroll').getBoundingClientRect();
                const chip=el.querySelector('.ui-data-label'), c=chip?.getBoundingClientRect();
                return {text:el.textContent,cellWidth:box.width,viewportWidth:region.width,
                    fits:!c || (c.x>=region.x-1 && c.right<=region.right+1 && c.x>=box.x-1 && c.right<=box.right+1),
                    singleLine:!c || c.height<24,whiteSpace:chip?getComputedStyle(chip).whiteSpace:null};
            })''')
            assert all(cell['fits'] and cell['singleLine'] for cell in cells), (mode, width, screen, caption, cells)
            assert all(cell['whiteSpace'] in ('nowrap',None) for cell in cells)
        table.locator('.ui-table-scroll').evaluate('(el)=>el.scrollLeft=0')
        if mode=='synthetic':
            table.screenshot(path=f'work/polish-table-{re.sub(r"[^a-zA-Z]+","-",caption)}-{width}.png')
        audit.append({'mode':mode,'width':width,'screen':screen,'table':caption,'rows':len(cells)-1,'basisCellsFit':True})

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=shutil.which('chromium'), args=['--no-sandbox'])
    page = browser.new_page(locale='en-GB', timezone_id='Europe/London')
    page.on('pageerror', lambda error: errors.append(str(error)))
    def retained_route(route):
        req=route.request
        if not req.url.startswith(BASE): external.append(req.url);route.abort();return
        if req.method not in ('GET','HEAD'): mutations.append(req.url);route.abort();return
        route.continue_()
    page.route('**/*', retained_route)
    for width in (1440, 1280):
        page.set_viewport_size({'width':width,'height':1100})
        for screen,view in SCREENS:
            page.goto(BASE+'/?view='+view+'&brandId=valentte', wait_until='networkidle')
            expect(page.locator('main h1')).to_have_count(1)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,screen)
            basis_tables(page,'retained',width,screen)
            if screen in ('Home','Competitors'):
                row=page.locator('.ui-data-table tbody tr').filter(has_text='Share of voice')
                expect(row.locator('td[data-label="Basis"]')).to_have_text('Unavailable')
                assert row.locator('.ui-data-label-observed').count()==0
                page.screenshot(path=str(OUT/f'polish-after-{screen}-{width}.png'),full_page=True)
            if screen=='Home':
                table=page.get_by_role('region',name='Saved activity scorecard',exact=True)
                assert table.evaluate('el=>el.scrollWidth<=el.clientWidth+1'),width
        page.goto(BASE+'/?view=creatives&brandId=valentte',wait_until='networkidle')
        expect(page.locator('.creative-results')).to_contain_text('Showing 8 of 58')
        for label in ('Brand','Format','Hook','Angle','Offer','UGC with proof'):
            control=page.get_by_label(label,exact=True)
            expect(control).to_be_visible()
            assert label in control.locator('option:checked').inner_text()
        expect(page.get_by_text('Sort by',exact=False)).to_be_visible()
        expect(page.locator('.creative-date-filter summary')).to_have_text('Date range')
        expect(page.locator('input[type=date]')).to_have_count(2)
        assert not any(el.is_visible() for el in page.locator('input[type=date]').all())
        page.screenshot(path=str(OUT/f'polish-after-Creatives-{width}.png'),full_page=True)
    # Existing URL and browser history semantics remain intact.
    page.get_by_label('Sort',exact=True).select_option('days');expect(page).to_have_url(re.compile('sort=days'))
    expect(page.locator('.ui-creative-card')).to_have_count(8)
    page.go_back();expect(page.get_by_label('Sort',exact=True)).to_have_value('newest')
    page.get_by_role('button',name='Show 24 more',exact=True).click();expect(page.locator('.creative-results')).to_contain_text('Showing 32 of 58')
    page.get_by_role('button',name='Table',exact=True).click();expect(page.locator('.creative-results')).to_contain_text('Showing 58 of 58')
    page.get_by_role('button',name='Grid',exact=True).click()
    page.locator('.creative-date-filter summary').click();expect(page.get_by_label('Observed from',exact=True)).to_be_visible()
    page.get_by_label('Observed from',exact=True).fill('2026-10-30');expect(page).to_have_url(re.compile('from=2026-10-30'))
    if page.locator('.creative-date-filter').get_attribute('open') is None: page.locator('.creative-date-filter summary').click()
    page.get_by_role('button',name='All dates',exact=True).click()
    assert 'from=' not in page.url
    page.locator('.creative-extra-filters summary').click()
    assert page.locator('.creative-extra-filters .creative-filter-panel').evaluate('el=>{const r=el.getBoundingClientRect();return r.x>=260 && r.right<=innerWidth}')
    page.get_by_label('Platform',exact=True).select_option('Meta')
    expect(page).to_have_url(re.compile('platform=Meta'))
    page.locator('.creative-extra-filters').get_by_role('button',name='Reset filters',exact=True).click();assert 'platform=' not in page.url
    page.get_by_label('Search copy, transcript and on-screen text',exact=True).fill('no saved creative matches this phrase')
    expect(page.locator('.creative-results')).to_contain_text('Showing 0 of 0');expect(page.get_by_role('heading',name='No ads match these filters',exact=True)).to_be_visible()
    page.go_back();expect(page.locator('.ui-creative-card')).to_have_count(8)
    # Narrow layout is a regression check, not a substitute for the two requested widths.
    page.set_viewport_size({'width':390,'height':1000});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.locator('.creative-date-filter summary').click();expect(page.get_by_label('Observed from',exact=True)).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.locator('.creative-date-filter summary').click()
    if page.locator('.creative-extra-filters').get_attribute('open') is None: page.locator('.creative-extra-filters summary').click()
    expect(page.locator('.creative-extra-filters .creative-filter-panel')).to_be_visible()
    assert page.locator('.creative-extra-filters .creative-filter-panel').evaluate('el=>{const r=el.getBoundingClientRect();return r.x>=0 && r.right<=innerWidth}')
    page.locator('.creative-extra-filters').get_by_role('button',name='Reset filters',exact=True).click()
    page.close()
    # Populated fixture tables are intentionally separate from retained-record screenshots.
    page=browser.new_page(locale='en-GB',timezone_id='Europe/London')
    page.on('pageerror',lambda error:errors.append(str(error)))
    def fixture_route(route):
        req=route.request;path=urlparse(req.url).path
        if not req.url.startswith(BASE):external.append(req.url);route.abort();return
        if req.method not in ('GET','HEAD'):mutations.append(req.url);route.abort();return
        if path.startswith('/api/brands/') and path.endswith('/creatives'):route.fulfill(json=fixture['base']['library']);return
        if path.startswith('/api/brands/') and path.endswith('/demo'):route.fulfill(json={'opportunities':[]});return
        if path=='/api/creator-research':route.fulfill(json=fixture['creators']['value']);return
        if path=='/api/reports':route.fulfill(json=fixture['reports']['value']);return
        if path=='/api/owned/accounts':route.fulfill(json=fixture['owned']['value']);return
        route.continue_()
    page.route('**/*',fixture_route)
    for width in (1440,1280):
        page.set_viewport_size({'width':width,'height':1100})
        for screen,view in SCREENS:
            page.goto(BASE+'/?view='+view+'&brandId=valentte',wait_until='networkidle')
            basis_tables(page,'synthetic',width,screen)
    captions={item['table'] for item in audit}
    assert len(captions)==10,captions
    page.goto(BASE+'/?view=creatives&brandId=valentte',wait_until='networkidle')
    for label,value,key in [('Brand','competitor-a','brand'),('Format','UGC','format'),('Hook','question','hook'),('Angle','gifting','angle'),('Offer','offer','offer'),('UGC with proof','yes','ugc')]:
        # Select only values actually present in this synthetic fixture.
        control=page.get_by_label(label,exact=True)
        options=control.locator('option').evaluate_all('els=>els.map(el=>el.value)')
        selected=value if value in options else next(value for value in options if value!='all')
        control.select_option(selected);assert parse_qs(urlparse(page.url).query)[key]==[selected]
        page.go_back();expect(control).to_have_value('all')
    assert not errors,errors
    assert not external,external
    assert not mutations,mutations
    browser.close()
Path('work/polish-basis-audit.json').write_text(json.dumps(audit,indent=2))
for width in (1440,1280):
    for screen in ('Creatives','Home','Competitors'):
        before=Image.open(OUT/f'polish-before-{screen}-{width}.png').convert('RGB')
        after=Image.open(OUT/f'polish-after-{screen}-{width}.png').convert('RGB')
        canvas=Image.new('RGB',(width*2,max(before.height,after.height)+36),'#e5e7eb');draw=ImageDraw.Draw(canvas)
        draw.text((16,10),f'BEFORE: {screen}, {width}px',fill='#1f2937');draw.text((width+16,10),f'AFTER: {screen}, {width}px',fill='#1f2937')
        canvas.paste(before,(0,36));canvas.paste(after,(width,36));canvas.save(OUT/f'polish-{screen}-{width}-comparison.png',optimize=True)
print(f'PASS: {len(audit)} table/width/data-mode checks, all 10 Basis tables at 1440px and 1280px; filter labels, counts, URL/history and mobile overflow; six before/after pairs. No external requests or mutations. Fixtures are not live verification.')
