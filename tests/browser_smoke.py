"""Browser integration smoke test, isolated from the development database.

Run from the repository root: python3 tests/browser_smoke.py
Requires Python Playwright and a Chromium executable (CHROMIUM_PATH overrides).
The test creates a temporary database, starts its own app on a free local port,
and stops its processes and deletes its database when finished.
"""

import datetime
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import tempfile
import time
import urllib.request

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]


def navigate(page, label, mobile=False):
    if mobile:
        page.get_by_role('button', name='Toggle navigation', exact=True).click()
    page.get_by_role('button', name=label, exact=label != 'Creator discovery').click()


def run_checks(base_url):
    with sync_playwright() as playwright:
        executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('chromium-browser')
        launch = {'headless': True, 'args': ['--no-sandbox']}
        if executable:
            launch['executable_path'] = executable
        browser = playwright.chromium.launch(**launch)
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base_url, wait_until='networkidle')
        expect(page.locator('.main-loading')).not_to_be_visible()
        expect(page.get_by_role('heading', name='A wider lens. A clearer advantage.', exact=True)).to_be_visible()
        dashboard = page.request.get(base_url + '/api/dashboard?brandId=rhode').json()
        assert dashboard['metrics']['ads'] > 0
        page.get_by_role('combobox', name='Filter platform', exact=True).select_option('TikTok')
        expect(page.locator('.ad-card').first).to_be_visible()
        expect(page.locator('.ad-card-top').first).to_contain_text('TikTok')
        page.get_by_role('combobox', name='Date range', exact=True).select_option('7')
        expect(page.locator('.main-loading')).not_to_be_visible()
        page.get_by_role('combobox', name='Date range', exact=True).select_option('30')
        page.get_by_role('combobox', name='Filter platform', exact=True).select_option('all')
        print('PASS overview and platform/date filters', flush=True)

        navigate(page, 'Ad library')
        expect(page.locator('.ad-card').first).to_be_visible()
        page.get_by_role('textbox', name='Search ads and brands', exact=True).fill('no-such-ad-qa-search')
        expect(page.get_by_role('heading', name='No creatives found', exact=True)).to_be_visible()
        page.get_by_role('textbox', name='Search ads and brands', exact=True).fill('Glossier')
        expect(page.locator('.ad-card').first).to_be_visible()
        expect(page.locator('.ad-card-top').first).to_contain_text('Glossier')
        page.locator('.ad-image').first.click()
        expect(page.get_by_role('dialog', name='Creative analysis', exact=True)).to_be_visible()
        expect(page.get_by_text('Illustrative sample', exact=True)).to_be_visible()
        page.get_by_role('button', name='Close creative', exact=True).click()
        print('PASS ad search, empty state and creative detail', flush=True)

        navigate(page, 'Competitors')
        expect(page.get_by_text('The competitive landscape', exact=True)).to_be_visible()
        expect(page.locator('.rv-table tbody tr')).to_have_count(4)
        navigate(page, 'Audience & voice')
        expect(page.get_by_text('What customers are saying', exact=True)).to_be_visible()
        assert page.locator('.rv-review').count() > 0
        print('PASS competitor landscape and audience review themes', flush=True)

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
        page.get_by_role('textbox', name='Search creators', exact=True).fill('no-such-creator')
        expect(page.get_by_text('No matching creators', exact=True)).to_be_visible()
        print('PASS creator shortlist persistence, dialog and search', flush=True)

        navigate(page, 'Reports')
        page.get_by_role('button', name='Generate research report', exact=True).click()
        expect(page.get_by_role('dialog')).to_be_visible()
        expect(page.locator('.rv-report-content')).to_contain_text('FICTIONAL SAMPLE DATA')
        with page.expect_download() as download:
            page.get_by_role('link', name='Download Markdown', exact=True).click()
        assert download.value.suggested_filename.endswith('.md')
        page.keyboard.press('Escape')
        expect(page.locator('.rv-report-row')).to_have_count(1)
        print('PASS report generation, sample disclosure and download', flush=True)

        page.get_by_role('button', name='Ask Exter', exact=True).click()
        expect(page.get_by_role('dialog', name='Ask your intelligence', exact=True)).to_be_visible()
        page.locator('.suggested-questions button').first.click()
        expect(page.locator('.chat-answer')).to_contain_text('Sample-data answer')
        expect(page.locator('.chat-answer')).to_contain_text('not evidence of conversion lift')
        page.get_by_role('button', name='Close assistant', exact=True).click()
        print('PASS grounded research assistant and measurement disclosure', flush=True)

        navigate(page, 'Data sources')
        expect(page.get_by_text('No external platform is being monitored in real time.', exact=False)).to_be_visible()
        with page.expect_download() as download:
            page.get_by_role('button', name='Download template', exact=True).click()
        with open(download.value.path()) as handle:
            template = json.load(handle)
        assert template[0]['owned'] is True
        print('PASS source disclosures and import template', flush=True)

        response = page.request.post(base_url + '/api/brands', data={'name': 'QA Workspace', 'domain': 'qa.example.com', 'category': 'Beauty & skincare'})
        assert response.ok
        brand = response.json()
        page.evaluate('(brand) => localStorage.setItem("exter-brand",brand)', brand['id'])
        page.reload(wait_until='networkidle')
        navigate(page, 'Competitors')
        expect(page.get_by_text('Your competitive landscape starts here', exact=True)).to_be_visible()
        navigate(page, 'Creator discovery')
        expect(page.get_by_text('No matching creators', exact=True)).to_be_visible()
        navigate(page, 'Audience & voice')
        expect(page.get_by_text('Review research is not connected', exact=True)).to_be_visible()
        print('PASS unknown-brand empty states; no fabricated research', flush=True)

        navigate(page, 'Data sources')
        editor = page.get_by_role('textbox', name='Or paste your JSON data', exact=True)
        editor.fill('{not json}')
        page.get_by_role('button', name='Import and analyse', exact=True).click()
        expect(page.get_by_role('alert')).to_be_visible()
        rows = [{'brand': 'QA Workspace', 'platform': 'Meta', 'title': 'QA creative', 'angle': 'Product education', 'audience': 'Skincare enthusiasts', 'impressions': 10000, 'engagements': 450, 'publishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'owned': True, 'spend': 100, 'conversions': 10, 'revenue': 350}]
        editor.fill(json.dumps(rows))
        page.get_by_role('button', name='Import and analyse', exact=True).click()
        expect(page.get_by_role('status')).to_contain_text('1 ads imported')
        dashboard = page.request.get(base_url + '/api/dashboard?brandId=' + brand['id']).json()
        assert dashboard['metrics']['ads'] == 1 and dashboard['metrics']['conversions'] == 10
        navigate(page, 'Overview')
        expect(page.get_by_role('heading', name='Owned conversion evidence', exact=True)).to_be_visible()
        expect(page.locator('.evidence-tables')).to_contain_text('Product education')
        expect(page.locator('.evidence-tables')).to_contain_text('Skincare enthusiasts')
        expect(page.locator('.evidence-row').first).to_contain_text('10.00')
        assert page.locator('.imported-creative').count() > 0
        assert page.locator('img[src=""]').count() == 0
        navigate(page, 'Ad library')
        page.locator('.ad-image').first.click()
        expect(page.get_by_text('No creative image supplied', exact=True)).to_be_visible()
        page.keyboard.press('Escape')
        print('PASS malformed import error, retained success, owned angle/audience CPA, and imported creative placeholder', flush=True)

        page.set_viewport_size({'width': 390, 'height': 844})
        for label in ['Overview', 'Ad library', 'Competitors', 'Audience & voice', 'Creator discovery', 'Reports', 'Data sources']:
            navigate(page, label, mobile=True)
            width = page.evaluate('({scroll:document.documentElement.scrollWidth,width:window.innerWidth})')
            assert width['scroll'] <= width['width'], (label, width)
        screenshot = os.environ.get('EXTER_TEST_SCREENSHOT')
        if screenshot:
            page.screenshot(path=screenshot, full_page=True)
        print('PASS all seven views at 390px without document overflow', flush=True)
        assert not errors, errors
        print('PASS no browser JavaScript errors', flush=True)
        browser.close()


def main():
    with tempfile.TemporaryDirectory(prefix='exter-browser-test-') as directory:
        with socket.socket() as temporary_socket:
            temporary_socket.bind(('127.0.0.1', 0))
            port = temporary_socket.getsockname()[1]
        environment = {**os.environ, 'PORT': str(port), 'EXTER_DB_PATH': str(Path(directory) / 'test.db'), 'NODE_ENV': 'development'}
        with open(Path(directory) / 'server.log', 'w+') as log:
            process = subprocess.Popen([str(ROOT / 'node_modules/.bin/tsx'), 'server/index.ts'], cwd=ROOT, env=environment, stdout=log, stderr=log, start_new_session=True)
            base_url = f'http://127.0.0.1:{port}'
            try:
                for _ in range(100):
                    if process.poll() is not None:
                        log.seek(0)
                        raise RuntimeError('Test server exited: ' + log.read())
                    try:
                        with urllib.request.urlopen(base_url + '/api/health', timeout=1) as response:
                            if response.status == 200:
                                break
                    except OSError:
                        time.sleep(.2)
                else:
                    raise RuntimeError('Test server did not become ready.')
                run_checks(base_url)
            finally:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=10)


if __name__ == '__main__':
    main()
