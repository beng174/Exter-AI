"""Reference fidelity and UI-E/F on an isolated retained-capture preview.
Screenshots contain genuine saved records only; populated fixtures run separately.
Run npm run build; node --import tsx tests/fixtures/m1-server.ts; python this file.
"""
from pathlib import Path
import json,os,re,shutil
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('UI_FIDELITY_URL','http://127.0.0.1:3118')
out=Path('output/playwright');out.mkdir(parents=True,exist_ok=True)
SCREENS={'Main':('overview','This week'),'Brands':('brands','Brand research'),'Competitors':('competitors','Competitors'),'Creatives':('creatives','Creatives'),'CreativeDetail':('creative',''),'Formats':('formats','Formats'),'Patterns':('patterns','Patterns'),'Audience':('audience','Audience and voice'),'Winners':('winners','Winners'),'Briefs':('briefs','Opportunities and briefs'),'Creators':('creators','Creators'),'Scores':('scores','Scores'),'Ask':('ask','Ask Exter'),'Reports':('reports','Reports'),'DataSources':('data','Data sources')}
def run():
 with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1100},locale='en-GB',timezone_id='Europe/London')
    errors=[];external=[];mutations=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    def route(request):
        if request.request.method not in ('GET','HEAD'):mutations.append(request.request.url)
        if request.request.url.startswith(base):request.continue_()
        else:external.append(request.request.url);request.abort()
    page.route('**/*',route)
    saved=page.request.get(base+'/api/brands/valentte/creatives').json()['creatives']
    selected=next((row for row in saved if row['copy'] and not row.get('copyTruncated')),saved[0])
    geometry={}
    for name,(view,title) in SCREENS.items():
        url=base+'/?view='+view+'&brandId=valentte'+('&id='+selected['adId'] if view=='creative' else '')
        page.goto(url,wait_until='networkidle')
        expect(page.locator('main h1')).to_have_count(1)
        if title:expect(page.get_by_role('heading',level=1)).to_have_text(title)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),name
        assert page.locator('.topbar').is_hidden(),name
        expect(page.locator('.ui-page-eyebrow')).to_be_visible()
        expect(page.locator('.main-footer')).to_contain_text('Exter AI')
        assert not re.search(r'\b(?:CA|UI)-\d+',page.inner_text('main')),name
        assert 'Sample data' not in page.inner_text('main'),name
        expect(page.locator('.ui-creative-card .ui-meta-line')).to_have_count(0)
        page.screenshot(path=str(out/f'fidelity-{name}-1440.png'),full_page=True)
        geometry[name]=page.locator('main').evaluate('(el)=>({mainX:el.getBoundingClientRect().x,padding:getComputedStyle(el).padding,headerY:el.querySelector("h1").getBoundingClientRect().y,sections:Array.from(el.querySelectorAll(".ui-section-card")).map(s=>({title:s.querySelector("h2")?.textContent,x:s.getBoundingClientRect().x,width:s.getBoundingClientRect().width,padding:getComputedStyle(s).padding,radius:getComputedStyle(s).borderRadius}))})')
        if name=='Competitors':
            table=page.get_by_role('region',name='You and configured competitors',exact=True)
            expect(table.locator('thead .not-collected-header')).to_have_count(0)
            expect(page.get_by_role('region',name='Scorecard',exact=True)).to_contain_text('3 configured competitors have no collected ads')
            assert table.locator('tbody td').filter(has_text='Not collected').count()==0
        if name=='Winners':
            expect(page.get_by_role('columnheader',name='Working Score',exact=True)).to_have_count(0)
            expect(page.locator('.reference-creative-row')).not_to_have_count(0)
        if name=='Creatives':
            expect(page.locator('.ui-creative-card')).to_have_count(8)
            page.get_by_role('button',name='Show 24 more',exact=True).click();expect(page.locator('.ui-creative-card')).to_have_count(32)
            page.locator('.ui-creative-open').nth(20).click();expect(page).to_have_url(re.compile(r'view=creative.*id='))
            page.go_back();expect(page.locator('.ui-creative-card')).to_have_count(32)
        if name=='Scores':expect(page.get_by_role('button',name=re.compile('^Score draft:'))).to_be_disabled()
    page.goto(base+'/?view=overview&brandId=valentte',wait_until='networkidle')
    page.locator('.ui-page-header').get_by_role('button',name='Ask Exter',exact=True).click()
    expect(page).to_have_url(re.compile(r'view=ask'))
    expect(page.get_by_role('dialog')).to_have_count(0)
    page.go_back();expect(page.get_by_role('heading',level=1)).to_have_text('This week')
    for alias,canonical in [('ads','creatives'),('brand','brands'),('audiences','audience'),('sources','data')]:
        page.goto(base+'/?view='+alias+'&brandId=valentte',wait_until='networkidle');expect(page).to_have_url(base+'/?view='+canonical+'&brandId=valentte')
    page.goto(base+'/?view=data&brandId=valentte',wait_until='networkidle')
    expect(page.get_by_role('region',name='Budgets and schedule',exact=True)).to_be_visible()
    page.goto(base+'/?view=settings&brandId=valentte#monthly-budgets',wait_until='networkidle')
    expect(page).to_have_url(base+'/?view=data&brandId=valentte#monthly-budgets')
    page.get_by_role('navigation',name='Main navigation').get_by_role('link',name='Tests and preparation',exact=True).click()
    expect(page).to_have_url(base+'/?view=settings&brandId=valentte')
    page.goto(base+'/?view=settings&brandId=valentte',wait_until='networkidle')
    expect(page.get_by_role('region',name='Budgets and schedule',exact=True)).to_have_count(0)
    expect(page.locator('#gemini-smoke-test')).to_be_visible()
    for name,view in [('DataSources','data'),('Briefs','briefs')]:
        page.set_viewport_size({'width':390,'height':1000})
        page.goto(base+'/?view='+view+'&brandId=valentte',wait_until='networkidle')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),name
        page.screenshot(path=str(out/f'fidelity-{name}-390.png'),full_page=True)
        page.get_by_label('Toggle navigation').click();expect(page.get_by_role('navigation',name='Main navigation')).to_be_visible();page.keyboard.press('Escape')
    page.set_viewport_size({'width':1440,'height':1100})
    page.goto(base+'/?view=overview&brandId=valentte',wait_until='networkidle')
    page.screenshot(path=str(out/'fidelity-Sidebar-1440.png'))
    page.locator('#main-sidebar').screenshot(path=str(out/'fidelity-Sidebar-component.png'))
    assert not errors,errors
    assert not external,external
    assert not mutations,mutations
    browser.close()
    Path('work/ui-fidelity-geometry.json').write_text(json.dumps(geometry,indent=2))
 for name in [*SCREENS,'Sidebar']:
    app=Image.open(out/('fidelity-Sidebar-component.png' if name=='Sidebar' else f'fidelity-{name}-1440.png')).convert('RGB');ref=Image.open(f'design/reference/png/{name}.png').convert('RGB')
    # Each original remains at its original pixel size. The small label band is outside both images.
    canvas=Image.new('RGB',(app.width+ref.width,max(app.height,ref.height)+36),'#e5e7eb');draw=ImageDraw.Draw(canvas)
    draw.text((16,10),'APP: genuine saved records',fill='#1f2937');draw.text((app.width+16,10),'APPROVED REFERENCE: placeholder values',fill='#1f2937')
    canvas.paste(app,(0,36));canvas.paste(ref,(app.width,36));canvas.save(out/f'fidelity-{name}-comparison.png',optimize=True)
 print('PASS all 15 reference screens and sidebar: ready routes, headers, honest missing frames, no internal spec IDs, evidence cards, aliases/history, budgets placement, desktop/mobile overflow and side-by-side reference captures; no external requests or mutations')
if __name__=='__main__':run()
