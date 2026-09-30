#!/usr/bin/env python3
"""Put the content files into the live bundle.

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
# slot name -> source file
SLOTS = {
    'PHZDATAHTML': HERE / 'content' / 'phaza-data-page.html',
    'PHZPRIVHTML': HERE / 'content' / 'phaza-privacy-page.html',
}


def bundle_path() -> pathlib.Path:
    if len(sys.argv) > 1:
        return HERE / sys.argv[1]
    entry = re.search(r'/assets/(index-b\d+\.js)', (HERE / 'index.html').read_text())
    if not entry:
        sys.exit('cannot find the entry bundle in index.html')
    return HERE / 'assets' / entry.group(1)


def payload(src: pathlib.Path) -> str:
    html = src.read_text()
    # Strip the authoring comment: it explains the file to whoever edits it,
    # not to the browser.
    html = re.sub(r'^<!--.*?-->\s*', '', html, flags=re.S)
    html = re.sub(r'\n\s*\n', '\n', html).strip()
    # A template literal ends at a backtick and interpolates at ${.
    return html.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')


def main() -> None:
    target = bundle_path()
    js = target.read_text()

    for slot, src in SLOTS.items():
        mark_open, mark_end = slot + '=`', '`/*' + slot + '-END*/'
        if mark_open not in js:
            sys.exit('no ' + slot + ' slot in ' + target.name + ' -- that panel is not wired in yet')
        block = mark_open + payload(src) + mark_end
        start = js.index(mark_open)
        end = js.index(mark_end, start) + len(mark_end)
        js = js[:start] + block + js[end:]
        print(f'{slot}: {len(block):,} chars from {src.name}')

    target.write_text(js)


if __name__ == '__main__':
    main()
