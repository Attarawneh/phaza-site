#!/usr/bin/env python3
"""Publish the panel pages at their own URLs, for readers and for crawlers.

A panel inside the journey is invisible to a search engine: its text only
exists after someone clicks, so nothing can rank and nothing can be linked.
This writes a real HTML file per panel, carrying the same content as static
markup -- present before a line of JavaScript runs -- inside the same document
shell as the homepage. The bundle boots on it, sees the path, and opens that
panel straight away, so a person gets the sphere, the motion and the styling
exactly as they would from the journey, while a crawler reads the prose
underneath.

    python3 build-pages.py     # then release.py

Content comes from content/, the same files the panels use, so the two can
never drift apart.
"""

import html
import json
import pathlib
import re

HERE = pathlib.Path(__file__).parent

DATA = {
    'src': HERE / 'content' / 'phaza-data-page.html',
    'out': HERE / 'arabic-data-for-ai' / 'index.html',
    'path': '/arabic-data-for-ai/',
    'doc': False,
    'title': 'Arabic Datasets for AI Training, Evaluation & Dialects | Phaza',
    'desc': ('Rights-cleared Arabic text, speech and multimodal data for LLM training, evaluation, '
             'ASR and voice AI — Modern Standard Arabic and country dialects from Jordan across the '
             'Levant, Gulf, Nile and Maghreb, from the pipeline behind Salam.'),
}
PRIVACY = {
    'src': HERE / 'content' / 'phaza-privacy-page.html',
    'out': HERE / 'privacy' / 'index.html',
    'path': '/privacy/',
    'doc': True,
    'title': 'Privacy Policy — Phaza',
    'desc': ('How Phaza handles personal data on phaza.io: no cookies, no trackers, no third-party '
             'fonts, and nothing used to train models — what the forms collect, how long it is kept, '
             'and how to exercise your rights.'),
}
NOTE01 = {
    'src': HERE / 'content' / 'phaza-eval-page.html',
    'out': HERE / 'arabic-ai-evaluation' / 'index.html',
    'path': '/arabic-ai-evaluation/',
    'doc': True,
    'title': 'Evaluating Arabic Language Models — Phaza Technical Note 01',
    'desc': ('How Phaza evaluates Arabic models: testing by country, variety, register, domain and '
             'channel rather than one aggregate score — held-out sets, blind adjudication, '
             'contamination control, and what we will and will not publish.'),
    'scholarly': True,
    'review': True,
}
PAGES = (DATA, PRIVACY, NOTE01)


def content(page: dict) -> str:
    """The panel's markup, made static: buttons become links, and controls that
    only mean something inside the application are dropped."""
    s = re.sub(r'^<!--.*?-->\s*', '', page['src'].read_text(), flags=re.S)
    s = re.sub(r'<button type="button" class="phz-data-btn" data-phz-go="closing">(.*?)</button>',
               r'<a class="phz-data-btn" href="/#contact">\1</a>', s)
    s = re.sub(r'\s*<button type="button" class="phz-data-btn phz-data-btn-ghost" data-phz-close>.*?</button>',
               '', s)
    return s.strip()


def faq_schema(page: dict) -> list:
    """FAQPage entries read back out of the rendered questions, so the markup
    and the structured data cannot disagree."""
    out = []
    for q, a in re.findall(r'<summary>(.*?)</summary>\s*<p>(.*?)</p>', page['src'].read_text(), re.S):
        out.append({
            '@type': 'Question',
            'name': html.unescape(re.sub(r'\s+', ' ', q)).strip(),
            'acceptedAnswer': {
                '@type': 'Answer',
                'text': html.unescape(re.sub(r'<[^>]+>', '', re.sub(r'\s+', ' ', a))).strip(),
            },
        })
    return out


def graph(page: dict) -> str:
    url = 'https://phaza.io' + page['path']
    name = re.sub(r'\s*[—|].*$', '', page['title']).strip()
    g = [
        {
            '@type': 'WebPage',
            '@id': url + '#page',
            'url': url,
            'name': page['title'],
            'description': page['desc'],
            'isPartOf': {'@id': 'https://phaza.io/#website'},
            'publisher': {'@id': 'https://phaza.io/#org'},
            'inLanguage': 'en',
            'primaryImageOfPage': {'@id': 'https://phaza.io/#logo'},
            'breadcrumb': {'@id': url + '#breadcrumb'},
        },
        {
            '@type': 'BreadcrumbList',
            '@id': url + '#breadcrumb',
            'itemListElement': [
                {'@type': 'ListItem', 'position': 1, 'name': 'Phaza', 'item': 'https://phaza.io/'},
                {'@type': 'ListItem', 'position': 2, 'name': name},
            ],
        },
    ]
    if page.get('scholarly'):
        g[0]['@type'] = ['WebPage', 'ScholarlyArticle']
        g[0]['headline'] = 'Evaluating Arabic language models'
        g[0]['datePublished'] = '2026-10-08'
        g[0]['version'] = '1.0'
        g[0]['author'] = {'@id': 'https://phaza.io/#org'}
        g[0]['about'] = ['Arabic natural language processing', 'Large language model evaluation']
    if not page['doc']:
        g[0]['about'] = {'@id': url + '#service'}
        g.append({
            '@type': 'Service',
            '@id': url + '#service',
            'name': 'Arabic data for AI training and evaluation',
            'serviceType': 'AI training data collection, annotation and evaluation',
            'description': page['desc'],
            'provider': {'@id': 'https://phaza.io/#org'},
            'url': url,
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
        })
    faq = faq_schema(page)
    if faq:
        g.append({'@type': 'FAQPage', '@id': url + '#faq', 'mainEntity': faq})
    return json.dumps({'@context': 'https://schema.org', '@graph': g}, indent=6, ensure_ascii=False)


def build(page: dict) -> None:
    url = 'https://phaza.io' + page['path']
    shell = (HERE / 'index.html').read_text()

    shell = re.sub(r'<title>.*?</title>', '<title>' + page['title'] + '</title>', shell, flags=re.S)
    for pat in (r'(<meta name="description" content=")[^"]*(")',
                r'(<meta property="og:description" content=")[^"]*(")',
                r'(<meta name="twitter:description" content=")[^"]*(")'):
        shell = re.sub(pat, r'\1' + page['desc'] + r'\2', shell)
    for pat in (r'(<meta property="og:title" content=")[^"]*(")',
                r'(<meta name="twitter:title" content=")[^"]*(")'):
        shell = re.sub(pat, r'\1' + page['title'] + r'\2', shell)
    shell = shell.replace('<link rel="canonical" href="https://phaza.io/" />',
                          '<link rel="canonical" href="' + url + '" />')
    shell = shell.replace('<meta property="og:url" content="https://phaza.io/" />',
                          '<meta property="og:url" content="' + url + '" />')
    if page.get('review'):
        shell = re.sub(r'<meta name="robots" content="[^"]*" />',
                       '<meta name="robots" content="noindex, nofollow" />', shell)

    # the homepage's entity graph describes the homepage; this page has its own
    shell = re.sub(r'<script type="application/ld\+json">.*?</script>',
                   '<script type="application/ld+json">\n' + graph(page) + '\n</script>',
                   shell, count=1, flags=re.S)

    # and its own copy, in place of the homepage's crawler text
    start = shell.index('<div id="root">')
    end = shell.index('</body>', start)
    tail = shell[shell.rindex('</div>', start, end):end]
    cls = 'phz-data phz-doc' if page['doc'] else 'phz-data'
    body = ('<div id="root">'
            '<!-- Served as HTML so it exists without JavaScript. The application replaces this on '
            'mount and shows the same content as the panel. -->\n'
            '<main class="' + cls + '">\n' + content(page) + '\n</main>')
    shell = shell[:start] + body + tail + shell[end:]

    page['out'].parent.mkdir(exist_ok=True)
    page['out'].write_text(shell)
    print(f"wrote {page['out'].relative_to(HERE)} ({len(shell):,} bytes, "
          f"{len(faq_schema(page))} FAQ entries)")


if __name__ == '__main__':
    for p in PAGES:
        build(p)
