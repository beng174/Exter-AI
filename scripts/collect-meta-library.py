#!/usr/bin/env python3
r"""Capture a bounded public Meta Ad Library result in an ordinary browser.

Usage (from the repository root):
    python3 scripts/collect-meta-library.py --page-id 172851066181411 \
        --country GB --status active --max-records 30 \
        --output /tmp/valentte-meta-active.json

Requires Python Playwright and Chromium (CHROMIUM_PATH can select the executable).
The inherited HTTP(S) proxy and normal certificate verification are preserved.
No login, challenge solving, direct API request, pagination, or spoofed
browser identity is used. Public results embedded in the normally rendered page
are parsed; an initial HTTP error alone is not treated as proof of no results.

This captures only the initial result batch, not every ad or a continuous feed.
Access and Meta's embedded schema can change. Source counts can include variants
and grouped ads; they are not a verified count of distinct creatives. Delivery
dates are not organic post dates, and library availability is not engagement.
Raw output includes public copy and temporary media URLs: keep it outside source
control, then use the platform importer to retain bounded evidence. Missing
results or an access challenge cause failure without overwriting the output.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import shutil
import sys
from urllib.parse import unquote, urlencode, urlsplit, urlunsplit


class ScriptContent(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_script = False
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "script":
            self.in_script = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "script":
            self.in_script = False

    def handle_data(self, data: str) -> None:
        if self.in_script:
            self.parts.append(data)


def extract_public_results(content: str, page_id: str) -> tuple[list[dict], list[int], bool]:
    """Read JSON already present in the public DOM; never execute script text."""
    parser = ScriptContent()
    parser.feed(content)
    rows: dict[str, dict] = {}
    counts: list[int] = []
    captcha_required = False

    def visit(value: object, depth: int = 0) -> None:
        nonlocal captcha_required
        if depth > 40:
            return
        if isinstance(value, dict):
            if value.get("xfb_ad_library_is_captcha_required") is True:
                captcha_required = True
            connection = value.get("search_results_connection")
            if isinstance(connection, dict):
                count = connection.get("count")
                if isinstance(count, int) and not isinstance(count, bool) and count not in counts:
                    counts.append(count)
            ad_id = value.get("ad_archive_id")
            snapshot = value.get("snapshot")
            branded_content = snapshot.get("branded_content") if isinstance(snapshot, dict) else None
            snapshot_matches = isinstance(snapshot, dict) and (
                str(snapshot.get("page_id")) == page_id
                or (isinstance(branded_content, dict) and str(branded_content.get("page_id")) == page_id)
            )
            if (
                isinstance(ad_id, str)
                and ad_id.isdigit()
                and str(value.get("page_id")) == page_id
                and snapshot_matches
            ):
                rows[ad_id] = value
            for nested in value.values():
                visit(nested, depth + 1)
        elif isinstance(value, list):
            for nested in value:
                visit(nested, depth + 1)
        elif isinstance(value, str) and value.startswith(("{", "[")):
            try:
                parsed = json.loads(value)
            except ValueError:
                return
            visit(parsed, depth + 1)

    for part in parser.parts:
        try:
            parsed = json.loads(part)
        except ValueError:
            continue
        visit(parsed)
    return list(rows.values()), counts, captcha_required


def proxy_settings() -> dict[str, str] | None:
    address = next(
        (os.environ[key] for key in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy") if os.environ.get(key)),
        None,
    )
    if not address:
        return None
    parsed = urlsplit(address)
    if not parsed.scheme or not parsed.hostname:
        raise ValueError("The configured proxy address is invalid.")
    host = parsed.hostname
    if ":" in host:
        host = f"[{host}]"
    if parsed.port:
        host += f":{parsed.port}"
    settings = {"server": urlunsplit((parsed.scheme, host, "", "", ""))}
    if parsed.username is not None:
        settings["username"] = unquote(parsed.username)
    if parsed.password is not None:
        settings["password"] = unquote(parsed.password)
    return settings


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--page-id", required=True, help="Verified advertiser page ID, not a profile ID or name")
    parser.add_argument("--country", default="GB", help="Two-letter Ad Library country filter (default GB)")
    parser.add_argument("--status", choices=("all", "active"), default="active")
    parser.add_argument("--max-records", type=int, default=30, help="Initial-result cap, from 1 to 30")
    parser.add_argument("--output", type=Path, required=True, help="Local raw JSON path, preferably under /tmp")
    args = parser.parse_args()
    args.country = args.country.upper()
    if not re.fullmatch(r"\d{5,25}", args.page_id):
        parser.error("--page-id must be a numeric advertiser page ID.")
    if not re.fullmatch(r"[A-Z]{2}", args.country):
        parser.error("--country must have two letters.")
    if not 1 <= args.max_records <= 30:
        parser.error("--max-records must be between 1 and 30.")
    return args


def main() -> int:
    args = arguments()
    executable = os.environ.get("CHROMIUM_PATH") or shutil.which("chromium") or shutil.which("chromium-browser")
    if not executable:
        print("Chromium is unavailable; install it or set CHROMIUM_PATH.", file=sys.stderr)
        return 1
    try:
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError, sync_playwright
    except ImportError:
        print("Python Playwright is unavailable; install the playwright package.", file=sys.stderr)
        return 1
    url = "https://www.facebook.com/ads/library/?" + urlencode({
        "active_status": args.status,
        "ad_type": "all",
        "country": args.country,
        "view_all_page_id": args.page_id,
        "search_type": "page",
        "media_type": "all",
    })
    try:
        with sync_playwright() as playwright:
            launch = {"headless": True, "executable_path": executable, "args": ["--no-sandbox"]}
            proxy = proxy_settings()
            if proxy:
                launch["proxy"] = proxy
            browser = playwright.chromium.launch(**launch)
            try:
                context = browser.new_context(viewport={"width": 1440, "height": 1000})
                page = context.new_page()
                response = page.goto(url, wait_until="domcontentloaded", timeout=30000)
                try:
                    page.wait_for_function(
                        "() => document.body && (document.body.innerText.includes('Library ID:') || "
                        "document.body.innerText.includes('No ads match your search criteria'))",
                        timeout=15000,
                    )
                except PlaywrightTimeoutError:
                    pass
                content = page.content()
                rows, counts, captcha_required = extract_public_results(content, args.page_id)
                if captcha_required or not rows:
                    raise ValueError(
                        "No verified public ad records were available in the rendered result. "
                        "Access may be restricted, the advertiser ID may be wrong, or no results may match. "
                        "No challenge was bypassed; this does not establish that the brand has no ads."
                    )
                if args.status == "active":
                    rows = [row for row in rows if row.get("is_active") is True]
                    if not rows:
                        raise ValueError("The response supplied no verified active records; output was not written.")
                result = {
                    "observedAt": datetime.now(timezone.utc).isoformat(),
                    "requestUrl": url,
                    "renderedUrl": page.url,
                    "status": response.status if response else None,
                    "advertiserPageId": args.page_id,
                    "country": args.country,
                    "requestedActiveStatus": args.status,
                    "searchResultCounts": counts,
                    "coverage": "Bounded initial rendered result; no pagination or complete-coverage claim.",
                    "ads": rows[:args.max_records],
                }
            finally:
                browser.close()
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps({
            "output": str(args.output), "observedAt": result["observedAt"],
            "advertiserPageId": args.page_id, "capturedRecords": len(result["ads"]),
            "searchResultCounts": counts, "initialHttpStatus": result["status"],
            "note": "Public creatives and delivery dates only; engagement availability must be checked separately.",
        }))
        return 0
    except Exception as error:
        # Do not print request internals, proxy URLs, credentials, or raw page copy.
        if isinstance(error, ValueError):
            print(str(error), file=sys.stderr)
        else:
            print(f"Public browser collection failed ({type(error).__name__}); output was not written.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
