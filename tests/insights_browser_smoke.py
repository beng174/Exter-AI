"""Readable infographic regression checks using isolated, explicitly fictional data.
Run after npm run build: python tests/insights_browser_smoke.py
No live providers or production database are used.
"""
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]

def main():
    with tempfile.TemporaryDirectory(prefix='exter-insights-browser-') as directory:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        with open(Path(directory) / 'server.log', 'w+') as log:
            environment = {**os.environ, 'PORT': str(port)}
            process = subprocess.Popen(['node', '--import', 'tsx', 'tests/fixtures/insights-server.ts'], cwd=ROOT, env=environment, stdout=log, stderr=log)
            base = f'http://127.0.0.1:{port}'
            try:
                for _ in range(80):
                    try:
                        if urllib.request.urlopen(base + '/api/health').status == 200:
                            break
                    except Exception:
                        time.sleep(.25)
                else:
                    log.seek(0)
                    raise AssertionError(log.read())
                with sync_playwright() as pw:
                    browser = pw.chromium.launch(executable_path=shutil.which('chromium'), headless=True, args=['--no-sandbox'])
                    page = browser.new_page(viewport={'width': 1280, 'height': 1000}, device_scale_factor=1.25)
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.goto(base + '/?view=overview&brandId=valentte', wait_until='networkidle')
                    chart = page.get_by_role('article', name='Hooks', exact=True)
                    expect(chart).to_be_visible()
                    expect(chart).to_contain_text('14 ads in this sample')
                    expect(chart.get_by_role('button', name='Product reveal & demo', exact=True)).to_be_visible()
                    assert '0% classified' not in page.inner_text('body')
                    expect(chart.locator('.population-map')).to_be_visible()
                    page.get_by_role('button', name='Offers', exact=True).click()
                    offers = page.get_by_role('article', name='Offers', exact=True)
                    expect(offers).to_contain_text('Not recorded')
                    expect(offers).to_contain_text('85.7%')
                    page.get_by_role('button', name='Hooks', exact=True).click()
                    chart.get_by_role('button', name='Product reveal & demo', exact=True).click()
                    expect(page.get_by_text('Showing 6 supporting ads.', exact=True)).to_be_visible()
                    assert page.locator('.cg-card').count() == 6
                    print('PASS 14 legacy analyses populate charts; missing offers remain visible; segment opens six supporting ads', flush=True)
                    page.goto(base + '/?view=audiences&brandId=valentte', wait_until='networkidle')
                    expect(page.get_by_role('article', name='Audience needs in the creative', exact=True)).to_be_visible()
                    expect(page.get_by_role('article', name='Messaging styles', exact=True)).to_be_visible()
                    expect(page.get_by_text('Warm', exact=True)).to_be_visible()
                    page.get_by_role('article', name='Messaging styles', exact=True).get_by_role('button', name='Bars', exact=True).click()
                    expect(page.get_by_role('article', name='Messaging styles', exact=True).locator('.population-map')).to_have_count(0)
                    print('PASS real-workspace audience route, voice data and chart display controls', flush=True)
                    page.goto(base + '/?view=competitors&brandId=valentte', wait_until='networkidle')
                    expect(page.locator('.comparison-matrix')).to_contain_text('14 analysed ads')
                    expect(page.locator('.comparison-matrix')).to_contain_text('7 analysed ads')
                    expect(page.locator('.comparison-matrix')).to_contain_text('Not collected')
                    print('PASS competitor matrix distinguishes analysed samples from uncollected brands', flush=True)
                    page.goto(base + '/?view=ads&brandId=outcome-fixture', wait_until='networkidle')
                    expect(page.get_by_role('article', name='Reported conversions by ad', exact=True)).to_contain_text('10 conversions in this sample')
                    expect(page.locator('.owned-results-kpis')).to_contain_text('GBP 20')
                    expect(page.locator('.owned-results .insights-table')).to_contain_text('GBP 10')
                    expect(page.locator('.owned-results .insights-table')).to_contain_text('3×')
                    print('PASS owned conversion chart, zero results, matched CPA and ROAS', flush=True)
                    for width in (1024, 390):
                        page.set_viewport_size({'width':width,'height':1000})
                        for view in ('overview','audiences','competitors','ads'):
                            page.goto(base + '/?view=' + view + '&brandId=valentte', wait_until='networkidle')
                            dimensions = page.evaluate('({width:innerWidth, scroll:document.documentElement.scrollWidth})')
                            assert dimensions['scroll'] <= dimensions['width'], (view, dimensions)
                    page.set_viewport_size({'width':1280,'height':1000})
                    page.goto(base + '/demo/valentte', wait_until='networkidle')
                    expect(page.get_by_role('article', name='Hooks', exact=True)).to_be_visible()
                    expect(page.get_by_role('article', name='Audience needs in the creative', exact=True)).to_be_visible()
                    if os.environ.get('EXTER_INSIGHTS_SCREENSHOT'):
                        page.goto(base + '/?view=overview&brandId=valentte', wait_until='networkidle')
                        page.screenshot(path=os.environ['EXTER_INSIGHTS_SCREENSHOT'], full_page=True)
                    assert not errors, errors
                    print('PASS client report, 125% display scale, 1024px/mobile overflow and no browser errors', flush=True)
                    browser.close()
            finally:
                process.terminate()
                process.wait(timeout=10)

if __name__ == '__main__':
    main()
