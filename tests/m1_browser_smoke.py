"""Check an isolated M1 preview at M1_URL, using genuine retained captures only.
No external calls; production media/paid outputs are deliberately not fabricated.
Start tests/fixtures/m1-server.ts after npm run build for local review.
"""
import os
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

base = os.environ.get('M1_URL', 'http://127.0.0.1:3118')
out = Path('output/playwright')
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=shutil.which('chromium'), args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    external = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    def route(request):
        if request.request.url.startswith(base):
            request.continue_()
        else:
            external.append(request.request.url)
            request.abort()
    page.route('**/*', route)
    page.goto(base + '/?view=overview', wait_until='networkidle')
    expect(page.get_by_role('heading',name='Overview',exact=True)).to_be_visible()
    expect(page.get_by_label('Stored evidence summary')).to_contain_text('58 ads in this sample')
    assert 'Rhode' not in page.inner_text('body')
    page.screenshot(path=str(out / 'm1-overview.png'), full_page=True)
    page.get_by_role('button',name='View evidence').first.click()
    expect(page.locator('.cg-card')).to_have_count(58)
    page.goto(base + '/?view=ads&brandId=valentte',wait_until='networkidle')
    expect(page.locator('.cg-card')).to_have_count(58)
    page.screenshot(path=str(out / 'm1-library.png'), full_page=True)
    page.get_by_label('Search transcript and on-screen text').fill('no-such-creative-phrase')
    expect(page.get_by_role('heading',name='No creatives match these filters')).to_be_visible()
    page.get_by_role('button',name='Clear filters').first.click()
    page.get_by_label('Media format',exact=True).select_option('image')
    assert 0 < page.locator('.cg-card').count() < 58
    page.get_by_role('button',name='Clear filters').first.click()
    page.locator('.cg-card-open').first.click()
    expect(page.get_by_role('dialog')).to_be_visible()
    expect(page.get_by_role('heading',name='Analysis not available yet')).to_be_visible()
    first = page.locator('#cg-detail-title').inner_text()
    page.get_by_label('Next ad',exact=True).click()
    assert page.locator('#cg-detail-title').inner_text() != first
    page.get_by_label('Previous ad',exact=True).click()
    assert page.locator('#cg-detail-title').inner_text() == first
    bounds = page.get_by_role('dialog').bounding_box()
    assert bounds['y'] >= 0 and bounds['y'] + bounds['height'] <= 1000, bounds
    page.screenshot(path=str(out / 'm1-ad-detail.png'))
    page.keyboard.press('Escape')
    expect(page.get_by_role('dialog')).to_have_count(0)
    page.get_by_label('Brand',exact=True).select_option('ion8')
    expect(page.get_by_role('heading',name='No source creatives collected yet')).to_be_visible()
    for width in (1024,390):
        page.set_viewport_size({'width':width,'height':1000})
        for view in ('overview','ads','brand','competitors'):
            page.goto(base + '/?view=' + view + '&brandId=valentte',wait_until='networkidle')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width,view)
            assert not any(char in page.inner_text('body') for char in ('\u2013','\u2014'))
        if width == 390:
            page.get_by_label('Toggle navigation').click()
            expect(page.get_by_role('button',name='Creative library',exact=True)).to_be_visible()
    # Deliberately synthetic playback fixture, separate from genuine-capture screenshots.
    import json, subprocess, tempfile
    with tempfile.TemporaryDirectory(prefix='exter-m1-player-') as temp:
        media = Path(temp) / 'player.mp4'
        subprocess.run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=navy:size=64x48:rate=10','-t','3','-threads','1','-filter_threads','1','-c:v','libx264','-pix_fmt','yuv420p','-y',str(media)],check=True)
        fixture_page = browser.new_page(viewport={'width':1280,'height':1000})
        def fixtures(route):
            url = route.request.url
            if not url.startswith(base):
                route.abort()
            elif url.endswith('/m1-player.mp4'):
                route.fulfill(path=str(media),content_type='video/mp4')
            elif url.endswith('/demo/creatives'):
                payload = route.fetch().json()
                first = payload['creatives'][0]
                timed = lambda value: {'value':value,'confidence':0.1,'timestamps':[{'startSeconds':1,'endSeconds':2}]}
                first.update({'videoUrl':base+'/m1-player.mp4','mediaKind':'video','mediaAvailable':True,'durationSeconds':3,'thumbnailUrl':None,'analysis':{'id':'explicit-player-fixture','mediaKind':'video','createdAt':'2026-11-01T00:00:00Z','promptVersion':'test-fixture','fields':{'hook':timed('Fictional playback fixture'),'format':timed('studio'),'angle':timed('gifting'),'cta':timed('Shop now'),'keyClaims':[],'onScreenText':[timed('TEST FIXTURE')],'spokenTranscript':[timed('Synthetic speech fixture')],'creatorEvidence':[],'personTalkingToCamera':timed(False)}}})
                route.fulfill(json=payload)
            else:
                route.continue_()
        fixture_page.route('**/*',fixtures)
        fixture_page.goto(base+'/?view=ads&brandId=valentte',wait_until='networkidle')
        fixture_page.locator('.cg-card-open').first.click()
        expect(fixture_page.get_by_role('heading',name='Creative analysis',exact=True)).to_be_visible()
        expect(fixture_page.locator('.m1-honesty').first).to_contain_text('Internal preview')
        fixture_page.locator('video').evaluate('(video) => new Promise(resolve => { if(video.readyState >= 1) resolve(); else video.addEventListener("loadedmetadata", resolve, {once:true}); })')
        fixture_page.get_by_label('Play from 0:01').first.click()
        fixture_page.wait_for_function('document.querySelector("video").currentTime >= 1')
        fixture_page.close()
    assert not errors, errors
    assert not external, external
    browser.close()
print('PASS genuine 58-ad captures, evidence links, filtering/search, detail navigation, empty workspace, mobile navigation and overflow. Production paid analyses/media unavailable locally.')
