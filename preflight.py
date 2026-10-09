#!/usr/bin/env python3
"""Check the site is publishable before you push.

The one failure that takes phaza.io down silently is a script whose SRI digest
no longer matches the file on disk: the browser blocks it and the page renders
as a bare loading orb with nothing in the console a visitor would see. That
happens whenever a bundle is edited after release.py computed its hash, so
this runs the check for every page, in both languages.

    python3 preflight.py        # exits non-zero if anything is wrong
"""

import base64
import hashlib
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent

PAGES = [
    'index.html', '404.html',
    'arabic-data-for-ai/index.html', 'privacy/index.html',
    'research/index.html', 'research/evaluating-arabic-language-models/index.html',
    'arabic-ai-evaluation/index.html',
    'ar/index.html', 'ar/arabic-data-for-ai/index.html', 'ar/privacy/index.html',
    'ar/research/index.html', 'ar/research/evaluating-arabic-language-models/index.html',
    'ar/arabic-ai-evaluation/index.html',
]


def main() -> int:
    problems = []
    for name in PAGES:
        page = HERE / name
        if not page.exists():
            problems.append(f'{name}: missing')
            continue
        html = page.read_text()

        for m in re.finditer(r'src="/?(assets/[^"?]+)[^"]*"', html):
            # the ?v= cache-buster is part of the URL, not of the filename
            if not (HERE / m.group(1)).exists():
                problems.append(f'{name}: references {m.group(1)}, which is not in the repo')

        for m in re.finditer(r'<script[^>]*src="/?([^"]+)"[^>]*integrity="sha384-([^"]+)"', html):
            src, want = m.group(1), m.group(2)
            asset = HERE / src.lstrip('/')
            if not asset.exists():
                continue  # already reported above
            got = base64.b64encode(hashlib.sha384(asset.read_bytes()).digest()).decode()
            if got != want:
                problems.append(
                    f'{name}: integrity does not match {src} — '
                    f'run release.py (then build-ar.py) and try again')

    if problems:
        print('PREFLIGHT FAILED')
        for p in problems:
            print('  -', p)
        return 1
    print(f'preflight ok — {len(PAGES)} pages, every script present and matching its digest')
    return 0


if __name__ == '__main__':
    sys.exit(main())
