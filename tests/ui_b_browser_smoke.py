"""UI-02/UI-03 against the isolated retained-capture server, never production.
Screenshots use real saved captures only. Separate intercepted fixtures test populated states.
Run npm run build; node --import tsx tests/fixtures/m1-server.ts; python this file.
"""
from pathlib import Path
import json, os, re, shutil, subprocess
from playwright.sync_api import sync_playwright, expect
base=os.environ.get('UI_B_URL','http://127.0.0.1:3118')
out=Path('output/playwright');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1100},locale='en-GB')
    errors=[];external=[];posts=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    def route(request):
        if request.request.method=='POST':posts.append(request.request.url)
        if request.request.url.startswith(base):request.continue_()
        else:external.append(request.request.url);request.abort()
    page.route('**/*',route)
    page.goto(base+'/?view=ads&brandId=valentte',wait_until='networkidle')
    expect(page).to_have_url(base+'/?view=creatives&brandId=valentte')
    expect(page.locator('.ui-creative-card')).to_have_count(58)
    expect(page.get_by_role('heading',name='Creatives',exact=True)).to_be_visible()
    expect(page.locator('.workspace-switch')).not_to_contain_text('Type: Unavailable')
    expect(page.locator('.wordmark')).to_contain_text('EXTER AI')
    expect(page.get_by_role('button',name='Help',exact=True)).to_be_visible()
    configured=page.request.get(base+'/api/brands/valentte/creative-competitors').json()['competitors']
    stored=page.request.get(base+'/api/brands/valentte/creatives').json()
    assert stored['competitors']==configured and len(configured)==3
    expect(page.locator('.workspace-switch')).to_contain_text('3 competitors')
    expect(page.locator('.creative-owned-gap')).to_have_count(1)
    expect(page.locator('.ui-creative-card .ui-unavailable p')).to_have_count(0)
    expect(page.locator('.ui-creative-card a')).to_have_count(0)
    assert all('{{' not in text for text in page.locator('.ui-creative-card h3').all_text_contents())
    expect(page.locator('.ui-creative-card').first.get_by_text('Not synced',exact=True)).to_have_count(3)

    page.evaluate('window.scrollTo(0, 4000)')
    rect=page.locator('#main-sidebar').bounding_box()
    assert rect['y']==0 and rect['height']==1100,rect
    page.evaluate('window.scrollTo(0, 0)')
    page.screenshot(path=str(out/'ui-b-creatives-1440.png'))
    page.get_by_role('button',name='Table',exact=True).click()
    expect(page.locator('table tbody tr')).to_have_count(58)
    expect(page.locator('table td .ui-unavailable p')).to_have_count(0)
    expect(page.locator('table td a')).to_have_count(0)
    page.get_by_role('link',name='Connect account',exact=True).press('Enter')
    expect(page).to_have_url(re.compile(r'view=data'))
    page.go_back();expect(page.locator('table tbody tr')).to_have_count(58)
    page.locator('table tbody tr').first.focus();page.keyboard.press('Enter')
    expect(page).to_have_url(re.compile(r'view=creative.*id='))
    expect(page.get_by_role('dialog')).to_have_count(0)
    expect(page.get_by_role('region',name='Source and running history',exact=True)).to_be_visible()
    assert page.evaluate('scrollY')==0,'Opening detail starts at its header'
    first=page.url
    page.get_by_role('button',name='Next creative',exact=True).click()
    assert page.url!=first
    page.reload(wait_until='networkidle')
    expect(page.get_by_role('region',name='What is said and shown',exact=True)).to_be_visible()
    page.go_back();expect(page).to_have_url(re.compile(r'view=creatives.*layout=table'))
    expect(page.locator('table tbody tr')).to_have_count(58)
    page.get_by_role('button',name='Grid',exact=True).click()
    search=page.get_by_role('searchbox',name='Search copy, transcript and on-screen text')
    search.fill('this-query-is-absent');expect(page.get_by_text('No ads match these filters',exact=True)).to_be_visible()
    search.fill('');expect(page.locator('.ui-creative-card')).to_have_count(58)
    # Filtered next follows the URL-backed days-running order.
    page.get_by_label('Sort',exact=True).select_option('days')
    expected=page.locator('.ui-creative-open').nth(1).get_attribute('aria-label')[5:]
    page.locator('.ui-creative-open').first.click()
    page.get_by_role('button',name='Next creative',exact=True).click()
    expect(page.get_by_role('heading',level=1)).to_have_text(expected)
    expect(page.get_by_role('region',name='Performance',exact=True)).to_contain_text('not synced')
    detail=page.url
    # Pick a retained record with a resolved title for the visual review.
    saved=page.request.get(base+'/api/brands/valentte/creatives').json()['creatives']
    choices=[row for row in saved if '{{' not in row['title'] and len(row['title'])>10]
    selected=next((row for row in choices if len(row['copy'])>240 and not row.get('copyTruncated') and row.get('deliveryStatus')=='active'),choices[0])
    detail=base+'/?view=creative&brandId=valentte&id='+selected['adId']
    for width in (1440,390):
        page.set_viewport_size({'width':width,'height':1800})
        page.goto(base+'/?view=creatives&brandId=valentte',wait_until='networkidle')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),('library',width)
        grid=page.locator('.creative-browser-grid');card=page.locator('.ui-creative-card').first
        if width==390:assert abs(grid.bounding_box()['width']-card.bounding_box()['width'])<2,'Mobile cards must use one column'
        page.screenshot(path=str(out/f'ui-b-creatives-{width}.png'))
        if width==390:
            page.get_by_label('Toggle navigation').click()
            expect(page.get_by_role('navigation',name='Main navigation')).to_be_visible()
            expect(page.locator('.workspace-switch')).not_to_contain_text('Type: Unavailable')
            page.keyboard.press('Escape')
        page.goto(detail,wait_until='networkidle')
        expect(page.get_by_role('dialog')).to_have_count(0)
        expect(page.get_by_role('region',name='Creative score',exact=True)).to_contain_text('No saved analysis')
        expect(page.locator('.ui-section-empty .ui-meta-line')).to_have_count(0)
        assert 'n = Unavailable' not in page.inner_text('main')
        assert 'Unavailable to Unavailable' not in page.inner_text('main')
        expect(page.get_by_role('region',name='Creative media',exact=True).get_by_role('link',name='Open original ad',exact=True)).to_have_attribute('href',selected['sourceUrl'])
        expect(page.get_by_role('region',name='Creative score',exact=True).get_by_role('link',name='Run analysis',exact=True)).to_have_attribute('href',re.compile(r'view=settings.*analysisAdId=.*#gemini-smoke-test'))
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),('detail',width)
        page.screenshot(path=str(out/f'ui-b-creative-detail-{width}.png'),full_page=True)
    # Populated synthetic evidence and outcomes are checked separately, never screenshot content.
    fixture=json.loads(subprocess.check_output(['node','--import','tsx','--input-type=module','-e',"import {browserCreative,ownedDay} from './tests/fixtures/creative-browser.ts';import {ownedMetrics} from './shared/owned-metrics.ts';const metrics=ownedMetrics([ownedDay()]);const c={id:'scope-a',accountId:'account-a',platform:'Meta',currency:'GBP',attribution:'7d_click',conversionEvent:'purchase',from:'2026-11-01',to:'2026-11-04',lastChecked:'2026-11-04',benchmarkSampleSize:1,metrics,benchmark:metrics};console.log(JSON.stringify({brand:{id:'valentte',name:'Fixture advertiser',domain:'fixture.example'},creatives:[browserCreative({brandId:'valentte',copy:'Fixture retained first line.\\n'+'A complete retained sentence. '.repeat(25)+'END_OF_SAVED_COPY',placements:['FACEBOOK','INSTAGRAM','AUDIENCE_NETWORK'],title:'{{product.name}}',owned:true,sourceKind:'owned',videoUrl:'/fixture-media',scenes:[{startSeconds:1,label:'Fixture scene'}],performance:[c]}),browserCreative({adId:'competitor',brandId:'competitor-a',workspaceBrand:false})],competitors:[{key:'brand:competitor-a',brandId:'competitor-a',name:'Fixture competitor',status:'complete'}],sources:[],ownedStatus:'available',dateRange:{from:'2026-11-01',to:'2026-11-04'},lastChecked:'2026-11-04',reportingRange:{from:'2026-11-01',to:'2026-11-04'}}))"],text=True))
    media=Path('work/ui-b-fixture.mp4')
    subprocess.run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=navy:size=64x48:rate=10','-t','2','-threads','1','-c:v','libx264','-pix_fmt','yuv420p','-y',str(media)],check=True)
    page.route('**/api/brands/valentte/creatives?*',lambda request:request.fulfill(json=fixture))
    page.route('**/api/brands/valentte/creative-competitors',lambda request:request.fulfill(json={'competitors':fixture['competitors']}))
    def serve_media(request):
        content=media.read_bytes();header=request.request.headers.get('range');start,end=0,len(content)-1
        if header:
            parts=header.removeprefix('bytes=').split('-');start=int(parts[0] or 0);end=min(int(parts[1]) if parts[1] else end,end)
        headers={'Accept-Ranges':'bytes','Content-Length':str(end-start+1)}
        if header:headers['Content-Range']=f'bytes {start}-{end}/{len(content)}'
        request.fulfill(status=206 if header else 200,body=content[start:end+1],content_type='video/mp4',headers=headers)
    page.route('**/fixture-media',serve_media)
    page.goto(base+'/?view=creative&brandId=valentte&id=creative-a',wait_until='networkidle')
    expect(page.get_by_role('region',name='Performance',exact=True)).to_contain_text('£100.00')
    expect(page.get_by_role('region',name='Viewer retention',exact=True)).to_contain_text('50.0%')
    history=page.get_by_role('region',name='Source and running history',exact=True)
    expect(history).to_contain_text('Still running')
    expect(history).to_contain_text('Facebook, Instagram, Audience Network')
    expect(history).to_contain_text('Active')
    assert '{{' not in page.get_by_role('heading',level=1).inner_text()
    expect(page.locator('.ui-expandable-copy>p').first).not_to_contain_text('END_OF_SAVED_COPY')
    page.get_by_role('button',name='Show more',exact=True).click()
    expect(page.locator('.ui-expandable-copy>p').first).to_have_text(fixture['creatives'][0]['copy'])
    page.get_by_role('button',name='Show less',exact=True).click()
    expect(page.locator('.ui-expandable-copy>p').first).not_to_contain_text('END_OF_SAVED_COPY')

    page.locator('.creative-scenes button').click()
    page.wait_for_function('document.querySelector("video").currentTime >= .9')
    fixture['ownedStatus']='error';performance=fixture['creatives'][0]['performance'];fixture['creatives'][0]['performance']=[]
    page.goto(base+'/?view=creatives&brandId=valentte',wait_until='networkidle')
    expect(page.get_by_role('region',name='Owned metrics availability',exact=True)).to_contain_text('could not be read')
    expect(page.locator('.ui-creative-card').filter(has_text='You ·').locator('dd')).to_have_text(['Unavailable','Unavailable','Unavailable'])
    fixture['ownedStatus']='available';fixture['creatives'][0]['performance']=performance
    page.goto(base+'/?view=creative&brandId=valentte&id=competitor',wait_until='networkidle')
    expect(page.get_by_role('region',name='Viewer retention',exact=True)).to_have_count(0)
    expect(page.get_by_role('region',name='Performance',exact=True)).not_to_contain_text('ROAS')
    # A gap link opens the existing analysis control and never dispatches work.
    page.unroute('**/api/brands/valentte/creatives?*')
    page.unroute('**/api/brands/valentte/creative-competitors')
    page.goto(detail,wait_until='networkidle')
    page.get_by_role('region',name='Creative score',exact=True).get_by_role('link',name='Run analysis',exact=True).click()
    expect(page).to_have_url(re.compile(r'view=settings.*#gemini-smoke-test'))
    expect(page.get_by_role('button',name='Test one ad',exact=True)).to_be_disabled()
    assert not posts,posts
    assert not errors,errors
    assert not external,external
    browser.close()
print('PASS UI-B polished gaps, real fix links, UK source formatting, title/copy disclosure and shared competitor count;  grid/table parity, aliases, full-page detail, filtered next, history/reload, fixed sidebar, mobile layout, real-capture screenshots and separate fixture playback/outcome/privacy checks. Fixtures are not live verification.')
