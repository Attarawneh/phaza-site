#!/usr/bin/env python3
"""Publish the data library at its own URL, for readers and for crawlers.

The panel inside the journey is invisible to a search engine: its text only
exists after someone clicks, so nothing can rank and nothing can be linked.
This writes /arabic-data-for-ai/index.html, which carries the same content as
static HTML -- present before a line of JavaScript runs -- inside the same
document shell as the homepage. The bundle boots on it, sees the path, and
opens the panel straight away, so a person gets the sphere, the motion and the
Arabic exactly as they would from the journey, while a crawler reads the prose
underneath.

    python3 build-data-page.py     # then release.py

Content comes from content/phaza-data-page.html, the same file the panel uses,
so the two can never drift apart.
"""

import html
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent
SRC = HERE / 'content' / 'phaza-data-page.html'
OUT = HERE / 'arabic-data-for-ai' / 'index.html'
PATH = '/arabic-data-for-ai/'
URL = 'https://phaza.io' + PATH

TITLE = 'Arabic Datasets for AI Training, Evaluation & Dialects | Phaza'
DESC = ('Rights-cleared Arabic text, speech and multimodal data for LLM training, evaluation, '
        'ASR and voice AI — Modern Standard Arabic and country dialects from Jordan across the '
        'Levant, Gulf, Nile and Maghreb, from the pipeline behind Salam.')


def content() -> str:
    """The panel's markup, made static: buttons become links, and the
    'back to the journey' control has nowhere to go from here."""
    s = re.sub(r'^<!--.*?-->\s*', '', SRC.read_text(), flags=re.S)
    s = re.sub(r'<button type="button" class="phz-data-btn" data-phz-go="closing">(.*?)</button>',
               r'<a class="phz-data-btn" href="/#contact">\1</a>', s)
    s = re.sub(r'\s*<button type="button" class="phz-data-btn phz-data-btn-ghost" data-phz-close>.*?</button>',
               '', s)
    return s.strip()


def faq_schema() -> list:
    """FAQPage entries, read back out of the rendered questions so the markup
    and the structured data cannot disagree."""
    out = []
    for q, a in re.findall(r'<summary>(.*?)</summary>\s*<p>(.*?)</p>', SRC.read_text(), re.S):
        out.append({
            '@type': 'Question',
            'name': html.unescape(re.sub(r'\s+', ' ', q)).strip(),
            'acceptedAnswer': {
                '@type': 'Answer',
                'text': html.unescape(re.sub(r'<[^>]+>', '', re.sub(r'\s+', ' ', a))).strip(),
            },
        })
    return out


def graph() -> str:
    g = [
        {
            '@type': 'WebPage',
            '@id': URL + '#page',
            'url': URL,
            'name': TITLE,
            'description': DESC,
            'isPartOf': {'@id': 'https://phaza.io/#website'},
            'about': {'@id': URL + '#service'},
            'inLanguage': 'en',
            'primaryImageOfPage': {'@id': 'https://phaza.io/#logo'},
            'breadcrumb': {'@id': URL + '#breadcrumb'},
        },
        {
            '@type': 'BreadcrumbList',
            '@id': URL + '#breadcrumb',
            'itemListElement': [
                {'@type': 'ListItem', 'position': 1, 'name': 'Phaza', 'item': 'https://phaza.io/'},
                {'@type': 'ListItem', 'position': 2, 'name': 'Arabic data for AI'},
            ],
        },
        {
            '@type': 'Service',
            '@id': URL + '#service',
            'name': 'Arabic data for AI training and evaluation',
            'serviceType': 'AI training data collection, annotation and evaluation',
            'description': DESC,
            'provider': {'@id': 'https://phaza.io/#org'},
            'url': URL,
            'areaServed': [
                {'@type': 'Country', 'name': n} for n in
                ['Jordan', 'Palestine', 'Lebanon', 'Syria', 'Iraq', 'Saudi Arabia',
                 'United Arab Emirates', 'Qatar', 'Kuwait', 'Bahrain', 'Oman', 'Yemen',
                 'Egypt', 'Sudan', 'Libya', 'Morocco', 'Algeria', 'Tunisia', 'Mauritania']
            ],
            'availableLanguage': [
                {'@type': 'Language', 'name': 'Arabic', 'alternateName': 'ar'},
                {'@type': 'Language', 'name': 'English', 'alternateName': 'en'},
            ],
            'hasOfferCatalog': {
                '@type': 'OfferCatalog',
                'name': 'Routes into the corpus',
                'itemListElement': [
                    {'@type': 'Offer', 'itemOffered': {'@type': 'Service', 'name': n}}
                    for n in ['Ready-to-licence Arabic datasets', 'Bespoke Arabic data collection',
                              'Arabic AI evaluation sets', 'Annotation and linguistic services']
                ],
            },
        },
        {'@type': 'FAQPage', '@id': URL + '#faq', 'mainEntity': faq_schema()},
    ]
    return json.dumps({'@context': 'https://schema.org', '@graph': g}, indent=6, ensure_ascii=False)


def main() -> None:
    shell = (HERE / 'index.html').read_text()

    # the page's own identity
    shell = re.sub(r'<title>.*?</title>', '<title>' + TITLE + '</title>', shell, flags=re.S)
    shell = re.sub(r'(<meta name="description" content=")[^"]*(")', r'\1' + DESC + r'\2', shell)
    shell = re.sub(r'(<meta property="og:title" content=")[^"]*(")', r'\1' + TITLE + r'\2', shell)
    shell = re.sub(r'(<meta name="twitter:title" content=")[^"]*(")', r'\1' + TITLE + r'\2', shell)
    for tag in ('og:description', 'twitter:description'):
        shell = re.sub(r'(<meta (?:property|name)="' + tag + r'" content=")[^"]*(")',
                       r'\1' + DESC + r'\2', shell)
    shell = shell.replace('<link rel="canonical" href="https://phaza.io/" />',
                          '<link rel="canonical" href="' + URL + '" />')
    shell = shell.replace('<meta property="og:url" content="https://phaza.io/" />',
                          '<meta property="og:url" content="' + URL + '" />')

    # the homepage's entity graph describes the homepage; this page has its own
    shell = re.sub(r'<script type="application/ld\+json">.*?</script>',
                   '<script type="application/ld+json">\n' + graph() + '\n</script>',
                   shell, count=1, flags=re.S)

    # and its own copy, in place of the homepage's crawler text
    start = shell.index('<div id="root">')
    end = shell.index('</body>', start)
    tail = shell[shell.rindex('</div>', start, end):end]
    body = ('<div id="root">'
            '<!-- The data library, served as HTML so it exists without JavaScript. '
            'The application replaces this on mount and opens the same content as the panel. -->\n'
            '<main class="phz-data">\n' + content() + '\n</main>')
    shell = shell[:start] + body + tail + shell[end:]

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(shell)
    print(f'wrote {OUT.relative_to(HERE)} ({len(shell):,} bytes, {len(faq_schema())} FAQ entries)')


if __name__ == '__main__':
    main()
