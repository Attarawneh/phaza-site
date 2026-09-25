#!/usr/bin/env python3
"""Put content/phaza-data-page.html into the live bundle.

The data library is a long, ordinary document, so it is authored as HTML
rather than as hand-minified JSX: the panel component renders it verbatim.
This script is how the file gets there. Edit the HTML, run this, then
release.py.

    python3 inject-data-page.py [assets/index-bNN.js]

Idempotent: re-running replaces the string already in the bundle.
"""

import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent
SRC = HERE / 'content' / 'phaza-data-page.html'

MARK_OPEN = 'PHZDATAHTML=`'
MARK_END = '`/*PHZDATAHTML-END*/'


def bundle_path() -> pathlib.Path:
    if len(sys.argv) > 1:
        return HERE / sys.argv[1]
    entry = re.search(r'/assets/(index-b\d+\.js)', (HERE / 'index.html').read_text())
    if not entry:
        sys.exit('cannot find the entry bundle in index.html')
    return HERE / 'assets' / entry.group(1)


def payload() -> str:
    html = SRC.read_text()
    # Strip the authoring comment: it explains the file to whoever edits it,
    # not to the browser.
    html = re.sub(r'^<!--.*?-->\s*', '', html, flags=re.S)
    html = re.sub(r'\n\s*\n', '\n', html).strip()
    # A template literal ends at a backtick and interpolates at ${.
    return html.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')


def main() -> None:
    target = bundle_path()
    js = target.read_text()
    block = MARK_OPEN + payload() + MARK_END

    if MARK_OPEN in js:
        start = js.index(MARK_OPEN)
        end = js.index(MARK_END, start) + len(MARK_END)
        js = js[:start] + block + js[end:]
        how = 'replaced'
    else:
        sys.exit('no PHZDATAHTML slot in ' + target.name + ' -- the panel is not wired in yet')

    target.write_text(js)
    print(f'{how} the data page in {target.name}: {len(block):,} chars')


if __name__ == '__main__':
    main()
