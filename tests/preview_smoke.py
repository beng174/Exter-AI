"""Exercise the standalone test drive directly from file://, without a server.

Usage: python3 tests/preview_smoke.py [/absolute/path/to/Exter-AI-Test-Drive.html]
Managed browsers that disallow file:// can use --http. This fallback serves
only the standalone HTML from a temporary Python HTTP server; it does not run
the application backend. It does not establish file:// compatibility.
Requires Python Playwright plus Chromium (CHROMIUM_PATH may select the binary).
EXTER_PREVIEW_SCREENSHOT optionally saves a final desktop screenshot.
The browser uses a fresh temporary profile, so real user demo data is untouched.
"""

import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import sys
from threading import Thread

from playwright.sync_api import expect, sync_playwright


DEFAULT_ARTIFACT = Path('/workspace/preview/Exter-AI-Test-Drive.html')


def navigate(page, label, mobile=False):
    if mobile:
        page.get_by_role('button', name='Toggle navigation', exact=True).click()
    page.get_by_role('button', name=label, exact=label != 'Creator discovery').click()


def fetch_json(page, path):
    return page.evaluate('async path => { const response = await fetch(path); if (!response.ok) throw new Error(await response.text()); return response.json(); }', path)


def run_checks(artifact, url=None):
    if not artifact.is_file():
        raise SystemExit(f'Build the standalone test drive first: missing {artifact}')
    with sync_playwright() as playwright:
        executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('chromium-browser')
        launch = {'headless': True, 'args': ['--no-sandbox']}
        if executable:
            launch['executable_path'] = executable
        browser = playwright.chromium.launch(**launch)
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
        page = context.new_page()
        errors, failed_requests, external_requests = [], [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('requestfailed', lambda request: failed_requests.append(f'{request.url}: {request.failure}'))
        target_url = url or artifact.resolve().as_uri()
        page.on('request', lambda request: external_requests.append(request.url) if request.url.startswith(('http://', 'https://')) and not (request.url == target_url and request.resource_type == 'document') else None)
        page.goto(target_url, wait_until='networkidle')
        expect(page.get_by_role('heading', name='Valentte, in focus.', exact=True)).to_be_visible()
        case_id=page.evaluate('window.__EXTER_RESEARCH_BRAND__')
        case=fetch_json(page,'/api/brand-research?brandId='+case_id)
        assert case['analysisStatus']=='complete' and case['analysis']['provenance']=='model'
        assert case['category']=='Home fragrance & gifting' and len(case['competitorCandidates'])==3
        assert fetch_json(page,'/api/dashboard?brandId='+case_id)['metrics']['ads']==0
        expect(page.get_by_role('heading',name='Ad-format winner: not yet measurable',exact=True)).to_be_visible()
        with page.expect_download() as research_download:
            page.get_by_role('button',name='Download research report',exact=True).click()
        report_text=Path(research_download.value.path()).read_text()
        assert 'Valentte' in report_text and 'not yet measurable' in report_text
        page.get_by_role('button',name='Ask Exter',exact=True).click()
        page.locator('.suggested-questions button').first.click()
        expect(page.locator('.chat-answer')).to_contain_text('cannot identify a winning ad format')
        page.get_by_role('button',name='Close assistant',exact=True).click()
        page.set_viewport_size({'width':390,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.set_viewport_size({'width':1440,'height':1000})
        page.get_by_role('button',name='Change brand workspace',exact=True).click()
        page.locator('.brand-options button').filter(has_text='Rhode').click()
        print('PASS real Valentte snapshot, own-model provenance, zero fabricated ads, honest answer and downloadable research',flush=True)
        expect(page.get_by_role('heading', name='A wider lens. A clearer advantage.', exact=True)).to_be_visible()
        expect(page.locator('.main-loading')).not_to_be_visible()
        brands = fetch_json(page, '/api/brands')
        assert len(brands) == 5
        initial = fetch_json(page, '/api/dashboard?brandId=rhode')
        assert initial['mode'] == 'demo' and initial['metrics']['ads'] > 0
        images = page.locator('.ad-image img')
        assert images.count() > 0
        for image in images.all():
            image.scroll_into_view_if_needed()
            expect(image).to_have_js_property('complete', True)
            assert image.evaluate('image => image.src.startsWith("data:image/") && image.naturalWidth > 0'), image.get_attribute('src')[:100]
        page.evaluate('window.scrollTo(0,0)')
        print('PASS standalone dashboard, sample metrics and embedded photography', flush=True)

        page.get_by_role('combobox', name='Filter platform', exact=True).select_option('TikTok')
        expect(page.locator('.ad-card-top').first).to_contain_text('TikTok')
        page.get_by_role('combobox', name='Date range', exact=True).select_option('7')
        filtered = fetch_json(page, '/api/dashboard?brandId=rhode&platform=TikTok&range=7')
        assert filtered['metrics']['ads'] <= initial['metrics']['ads']
        assert all(ad['platform'] == 'TikTok' for ad in filtered['ads'])
        page.get_by_role('combobox', name='Date range', exact=True).select_option('30')
        page.get_by_role('combobox', name='Filter platform', exact=True).select_option('all')
        navigate(page, 'Content library')
        page.get_by_role('textbox', name='Search ads and brands', exact=True).fill('no-such-ad-qa-search')
        expect(page.get_by_role('heading', name='No creatives found', exact=True)).to_be_visible()
        page.get_by_role('textbox', name='Search ads and brands', exact=True).fill('Glossier')
        expect(page.locator('.ad-card-top').first).to_contain_text('Glossier')
        page.locator('.ad-image').first.click()
        expect(page.get_by_role('dialog', name='Creative analysis', exact=True)).to_be_visible()
        expect(page.locator('.adi-provenance')).to_contain_text('sample')
        page.get_by_role('button', name='Close creative', exact=True).click()
        print('PASS filters, creative search, empty state and ad details offline', flush=True)

        navigate(page, 'Creative formats')
        expect(page.locator('.fmt-platform-card')).to_have_count(3)
        expect(page.locator('.fmt-platform-card').first).to_contain_text('Meta')
        page.get_by_label('Rank creative formats by', exact=True).select_option('cpa')
        expect(page.locator('.fmt-platform-card').first).to_contain_text('CPA')
        page.get_by_label('Format content source', exact=True).select_option('organic')
        expect(page.locator('.fmt-platform-card').first).to_be_visible()
        page.get_by_label('Rank creative formats by', exact=True).select_option('engagement')
        page.get_by_label('Format content source', exact=True).select_option('all')
        page.locator('.fmt-example-button').first.click()
        expect(page.get_by_role('tab', name='Inferred audience', exact=True)).to_be_visible()
        page.get_by_role('tab', name='Inferred audience', exact=True).click()
        expect(page.get_by_role('term').filter(has_text='Gender')).to_be_visible()
        page.get_by_role('tab', name='Attention map', exact=True).click()
        expect(page.get_by_role('heading', name='Attention map not supplied', exact=True)).to_be_visible()
        page.get_by_role('button', name='Close creative', exact=True).click()
        print('PASS per-platform formats, owned CPA, organic filter, inferred audience and missing attention map', flush=True)

        navigate(page, 'Competitors')
        expect(page.locator('.rv-table tbody tr')).to_have_count(4)
        navigate(page, 'Audience & voice')
        expect(page.get_by_text('What customers are saying', exact=True)).to_be_visible()
        assert page.locator('.rv-review').count() > 0
        navigate(page, 'Creator discovery')
        expect(page.locator('.rv-creator-card').first).to_be_visible()
        page.locator('.rv-bookmark').first.click()
        expect(page.locator('.rv-shortlist-count')).to_contain_text('1 shortlisted')
        page.reload(wait_until='networkidle')
        navigate(page, 'Creator discovery')
        expect(page.locator('.rv-shortlist-count')).to_contain_text('1 shortlisted')
        page.locator('.rv-bookmark').first.click()
        expect(page.locator('.rv-shortlist-count')).to_contain_text('0 shortlisted')
        page.get_by_role('button', name='View match details').first.click()
        expect(page.get_by_role('dialog')).to_be_visible()
        page.keyboard.press('Escape')
        expect(page.get_by_role('dialog')).not_to_be_visible()
        print('PASS competitors, audience/reviews and localStorage shortlist persistence', flush=True)

        navigate(page, 'Reports')
        page.get_by_role('button', name='Generate research report', exact=True).click()
        expect(page.get_by_role('dialog')).to_be_visible()
        expect(page.locator('.rv-report-content')).to_contain_text('FICTIONAL SAMPLE DATA')
        with page.expect_download() as download:
            page.get_by_role('link', name='Download Markdown', exact=True).click()
        assert download.value.suggested_filename.endswith('.md')
        assert 'FICTIONAL SAMPLE DATA' in Path(download.value.path()).read_text()
        page.keyboard.press('Escape')
        with page.expect_download() as top_download:
            page.get_by_role('button', name='Export report', exact=True).click()
        assert top_download.value.suggested_filename.endswith('.md')
        assert 'FICTIONAL SAMPLE DATA' in Path(top_download.value.path()).read_text()
        page.reload(wait_until='networkidle')
        navigate(page, 'Reports')
        expect(page.locator('.rv-report-row')).to_have_count(2)
        page.get_by_role('button', name='Ask Exter', exact=True).click()
        page.locator('.suggested-questions button').first.click()
        expect(page.locator('.chat-answer')).to_contain_text('Sample-data answer')
        page.get_by_role('button', name='Close assistant', exact=True).click()
        print('PASS persisted reports, offline Markdown download and grounded assistant', flush=True)

        navigate(page, 'Data sources')
        expect(page.get_by_text('Research the market before you win the account.', exact=True)).to_be_visible()
        with page.expect_download() as template_download:
            page.get_by_role('button', name='Download template', exact=True).click()
        template = json.loads(Path(template_download.value.path()).read_text())
        assert template[0]['owned'] is True
        page.get_by_role('button', name='Change brand workspace', exact=True).click()
        modal = page.get_by_role('dialog', name='Brand workspace', exact=True)
        modal.get_by_role('textbox', name='Brand name', exact=True).fill('Offline QA Brand')
        modal.get_by_role('textbox', name='Website', exact=False).fill('offline-qa.example.com')
        modal.get_by_role('button', name='Create workspace', exact=True).click()
        expect(modal).not_to_be_visible()
        brands = fetch_json(page, '/api/brands')
        brand = next(brand for brand in brands if brand['name'] == 'Offline QA Brand')
        empty = fetch_json(page, '/api/dashboard?brandId=' + brand['id'])
        assert empty['metrics']['ads'] == 0 and empty['creators'] == [] and empty['reviews'] == []
        print('PASS brand creation through UI with honest empty research', flush=True)

        navigate(page, 'Data sources')
        editor = page.get_by_role('textbox', name='Or paste your JSON data', exact=True)
        editor.fill('{invalid json}')
        page.get_by_role('button', name='Import and analyse', exact=True).click()
        expect(page.get_by_role('alert')).to_be_visible()
        common = {'brand': 'Offline QA Brand', 'platform': 'Meta', 'title': 'Offline creative', 'angle': 'Product education', 'audience': 'Routine builders', 'impressions': 10000, 'engagements': 450, 'publishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'owned': True}
        rows = [{**common, 'spend': 100, 'conversions': 10, 'revenue': 350}, {**common, 'spend': 100, 'conversions': 10, 'revenue': 350}, {**common, 'title': 'Proof from customers', 'angle': 'Social proof', 'audience': 'First-time buyers', 'spend': 100, 'conversions': 5, 'revenue': 200}, {**common, 'brand': 'QA Competitor', 'title': 'Competitor creative', 'angle': 'Product education', 'owned': False, 'engagements': 850}]
        editor.fill(json.dumps(rows))
        page.get_by_role('button', name='Import and analyse', exact=True).click()
        expect(page.get_by_role('status')).to_contain_text('4 ads imported')
        imported = fetch_json(page, '/api/dashboard?brandId=' + brand['id'])
        assert imported['mode'] == 'imported' and imported['metrics']['ads'] == 4
        assert imported['metrics']['conversions'] == 25 and imported['metrics']['spend'] == 300
        angle = next(item for item in imported['angles'] if item['name'] == 'Product education')
        assert angle['conversions'] == 20 and angle['cpa'] == 10
        audience = next(item for item in imported['audiencePerformance'] if item['name'] == 'Routine builders')
        assert audience['conversions'] == 20 and audience['cpa'] == 10
        navigate(page, 'Overview')
        expect(page.get_by_role('heading', name='Owned conversion evidence', exact=True)).to_be_visible()
        angle_table = page.locator('.evidence-table').filter(has=page.get_by_role('heading', name='By creative angle', exact=True))
        audience_table = page.locator('.evidence-table').filter(has=page.get_by_role('heading', name='By audience', exact=True))
        expect(angle_table.locator('.evidence-row').filter(has_text='Product education')).to_contain_text('10.00')
        expect(audience_table.locator('.evidence-row').filter(has_text='Routine builders')).to_contain_text('10.00')
        print('PASS JSON validation, import isolation and owned angle/audience conversion/CPA analytics', flush=True)

        navigate(page, 'Content library')
        expect(page.locator('.imported-creative').first).to_be_visible()
        page.locator('.ad-image').first.click()
        expect(page.get_by_text('No creative image supplied', exact=True)).to_be_visible()
        page.get_by_role('button', name='Close creative', exact=True).click()
        page.reload(wait_until='networkidle')
        persisted = fetch_json(page, '/api/dashboard?brandId=' + brand['id'])
        assert persisted['metrics']['ads'] == 4 and persisted['metrics']['conversions'] == 25
        navigate(page, 'Reports')
        page.get_by_role('button', name='Generate research report', exact=True).click()
        expect(page.locator('.rv-report-content')).to_contain_text('USER-IMPORTED DATA')
        with page.expect_download() as imported_download:
            page.get_by_role('link', name='Download Markdown', exact=True).click()
        content = Path(imported_download.value.path()).read_text()
        assert 'USER-IMPORTED DATA' in content and 'Offline QA Brand' in content
        page.keyboard.press('Escape')
        print('PASS imported image placeholders, import reload persistence and real-data report download', flush=True)

        page.set_viewport_size({'width': 390, 'height': 844})
        for label in ['Overview', 'Brand research', 'Content library', 'Creative formats', 'Competitors', 'Audience & voice', 'Creator discovery', 'Reports', 'Data sources']:
            navigate(page, label, mobile=True)
            width = page.evaluate('({scroll:document.documentElement.scrollWidth,width:window.innerWidth})')
            assert width['scroll'] <= width['width'], (label, width)
        page.set_viewport_size({'width': 1440, 'height': 1000})
        page.once('dialog', lambda dialog: dialog.accept())
        page.get_by_role('button', name='Reset demo', exact=True).click()
        expect(page.get_by_role('heading', name='A wider lens. A clearer advantage.', exact=True)).to_be_visible()
        assert len(fetch_json(page, '/api/brands')) == 5
        reset = fetch_json(page, '/api/dashboard?brandId=rhode')
        assert reset['mode'] == 'demo' and reset['metrics']['ads'] == initial['metrics']['ads']
        assert fetch_json(page, '/api/reports?brandId=rhode') == []
        print('PASS all nine views at 390px and confirmed demo reset', flush=True)
        screenshot = os.environ.get('EXTER_PREVIEW_SCREENSHOT')
        if screenshot:
            page.screenshot(path=screenshot, full_page=True)
        assert not errors, errors
        assert not failed_requests, failed_requests
        assert not external_requests, external_requests
        print('PASS no browser errors, failed requests or external network requests', flush=True)
        context.close()
        browser.close()


if __name__ == '__main__':
    positional = [argument for argument in sys.argv[1:] if not argument.startswith('--')]
    artifact = Path(positional[0]).expanduser() if positional else DEFAULT_ARTIFACT
    if '--http' in sys.argv:
        class ArtifactHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path != '/Exter-AI-Test-Drive.html':
                    self.send_error(404)
                    return
                content = artifact.read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)

            def log_message(self, *_arguments):
                pass

        server = ThreadingHTTPServer(('127.0.0.1', 0), ArtifactHandler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            run_checks(artifact, f'http://127.0.0.1:{server.server_port}/Exter-AI-Test-Drive.html')
        finally:
            server.shutdown()
            server.server_close()
    else:
        run_checks(artifact)
