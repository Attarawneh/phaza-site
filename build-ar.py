#!/usr/bin/env python3
"""Build the Arabic site from the English one.

There is one application. The Arabic site is the same bundle with its visible
strings swapped from content/ar/journey-strings.json and a flag flipped, served
at /ar/ with dir="rtl". Keeping it generated rather than forked means an edit to
the journey reaches both languages, and the two can never drift into different
products -- which is the usual fate of a translated website.

    python3 build-ar.py        # after release.py has tagged the English entry

Writes assets/index-ar-<tag>.js, ar/index.html, and updates the English pages'
hreflang alternates.
"""

import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent
A = HERE / 'assets'
STRINGS = HERE / 'content' / 'ar' / 'journey-strings.json'
UI = HERE / 'content' / 'ar' / 'ui-strings.json'
# the panels carry whole documents, not strings: the Arabic build swaps the
# slot contents for their Arabic source files
DOCS = {
    'PHZDATAHTML': HERE / 'content' / 'ar' / 'phaza-data-page.html',
    'PHZPRIVHTML': HERE / 'content' / 'ar' / 'phaza-privacy-page.html',
    'PHZEVALHTML': HERE / 'content' / 'ar' / 'phaza-eval-page.html',
}
OUT = HERE / 'ar' / 'index.html'

# While the Arabic copy is under review it is published but not indexed: a
# reviewer can open it, a search engine cannot list it. Set to False to let
# the Arabic site into the index.
REVIEW = True
NOINDEX = '<meta name="robots" content="noindex, nofollow" />'

TITLE = 'فازا — ذكاء اصطناعي سيادي للحكومات والمؤسسات'
DESC = ('فازا تبني منظومة الذكاء السيادي للحكومات والمؤسسات: سلام، نموذج لغوي كبير عربيٌّ منذ الرمز الأول، '
        'يُسلَّم مع المعرفة والبنية التحتية والتطبيقات والوكلاء منظومةً واحدة مملوكة لك.')

# Countries where the site should open in Arabic. Detection is by the reader's
# own language preference and their time zone -- no geolocation lookup, no
# third party, nothing stored, which keeps the privacy policy true.
AR_ZONES = ['Asia/Amman', 'Asia/Jerusalem', 'Asia/Hebron', 'Asia/Beirut', 'Asia/Damascus',
            'Asia/Baghdad', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Qatar', 'Asia/Bahrain',
            'Asia/Kuwait', 'Asia/Muscat', 'Asia/Aden', 'Africa/Cairo', 'Africa/Khartoum',
            'Africa/Tripoli', 'Africa/Tunis', 'Africa/Algiers', 'Africa/Casablanca',
            'Africa/El_Aaiun', 'Africa/Nouakchott', 'Africa/Djibouti', 'Africa/Mogadishu',
            'Indian/Comoro']


def esc(text: str) -> str:
    """Arabic into a JS string literal the bundle already quotes."""
    return ''.join(c if ord(c) < 128 else '\\u%04x' % ord(c) for c in text)


def entry_name() -> str:
    m = re.search(r'/assets/(index-b\d+\.js)', (HERE / 'index.html').read_text())
    if not m:
        sys.exit('cannot find the English entry in index.html')
    return m.group(1)


def build_bundle(src_name: str) -> str:
    js = (A / src_name).read_text()
    table = json.loads(STRINGS.read_text())

    missing = [k for k, v in table.items() if not v.strip()]
    if missing:
        sys.exit(f'{len(missing)} strings still untranslated, first: {missing[0][:60]}')

    # A headline is often built from fragments -- "Meet " + a gradient span --
    # so the literal in the bundle can carry the spaces that hold it together.
    # Those spaces are preserved around the Arabic.
    swapped, missed = 0, []
    for en, ar in sorted(table.items(), key=lambda kv: -len(kv[0])):
        for lead, trail in (('', ''), ('', ' '), (' ', ''), (' ', ' ')):
            needle = '"' + lead + en + trail + '"'
            if needle in js:
                js = js.replace(needle, '"' + lead + esc(ar) + trail + '"')
                swapped += 1
                break
        else:
            missed.append(en)

    import re as _re
    for slot, src in DOCS.items():
        doc = _re.sub(r'^<!--.*?-->\s*', '', src.read_text(), flags=_re.S).strip()
        doc = doc.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
        open_m, end_m = slot + '=`', '`/*' + slot + '-END*/'
        a = js.index(open_m)
        b = js.index(end_m, a) + len(end_m)
        js = js[:a] + open_m + esc(doc) + end_m + js[b:]
        print(f'  {slot}: {len(doc):,} chars of Arabic')

    # the deep links live under /ar/ in this build, and land back on the
    # Arabic root rather than the English one
    for seg in ('arabic-data-for-ai', 'privacy', 'arabic-ai-evaluation'):
        js = js.replace('location.pathname.indexOf("/%s")===0' % seg,
                        'location.pathname.indexOf("/ar/%s")===0' % seg)
    js = js.replace('history.replaceState(null,"","/")', 'history.replaceState(null,"","/ar/")')

    # Every href the app writes for its own documents has to point at the
    # Arabic copy, or a middle-click — or a handler that does not intercept —
    # drops an Arabic reader onto the English page.
    rebased = 0
    for seg in ('arabic-data-for-ai', 'privacy', 'arabic-ai-evaluation'):
        for pat in ('href:"/%s/"' % seg, ',"/%s/"]' % seg):
            rebased += js.count(pat)
            js = js.replace(pat, pat.replace('"/%s/"' % seg, '"/ar/%s/"' % seg))
    print(f'  document hrefs rebased under /ar/: {rebased}')

    js = js.replace('const PHZAR=false;', 'const PHZAR=true;', 1)
    # the router owns "/" only; under /ar/ it would answer with its 404 page,
    # so the Arabic build mounts the journey at the Arabic root instead
    before = js.count('{path:"/"')
    js = js.replace('{path:"/"', '{path:"/ar"', 1)
    js = js.replace('{path:"/ar"', '{path:"/ar/"', 0)  # no-op, kept explicit
    if before == 0:
        sys.exit('could not find the route to move under /ar/')
    out_name = src_name.replace('index-b', 'index-ar-b')
    (A / out_name).write_text(js)
    print(f'{out_name}: {swapped}/{len(table)} strings swapped')
    if missed:
        print('  not found in the bundle:', ', '.join(repr(m[:40]) for m in missed[:8]))
    return out_name


def build_widget(name: str) -> str:
    """The contact and careers widgets are their own files, so they get their
    own Arabic builds. Keyboard key names and header names are code and are
    never in the table."""
    src = A / (name + '.js')
    js = src.read_text()
    table = json.loads(UI.read_text())
    # Every strategy runs for every string: the same words appear as a quoted
    # literal in one place, as markup text in another and as an aria-label in a
    # third, and stopping at the first match left the other two in English.
    swapped = 0
    for en, ar in sorted(table.items(), key=lambda kv: -len(kv[0])):
        before = js
        for q in ('"', "'", '`'):
            js = js.replace(q + en + q, q + esc(ar) + q)
        # Markup text is wrapped across lines in the templates, so the words
        # are matched with any whitespace between them, not a literal run.
        flex = r'\s+'.join(re.escape(w) for w in en.split())
        js = re.sub(r'(?<=>)(\s*)' + flex + r'(\s*)(?=<)',
                    lambda m: m.group(1) + esc(ar) + m.group(2), js)
        js = re.sub(r'((?:aria-label|title|placeholder|alt)=")' + re.escape(en) + r'(")',
                    lambda m: m.group(1) + esc(ar) + m.group(2), js)
        if js != before:
            swapped += 1

    out = name + '-ar.js'
    (A / out).write_text(js)
    print(f'{out}: {swapped} strings swapped')
    return out


def crawler_copy() -> str:
    """Arabic prose for readers without JavaScript, and for a crawler deciding
    what this page is about."""
    return """<header><h1>فازا — ذكاء اصطناعي سيادي للحكومات</h1>
<p>تبني فازا منظومة الذكاء السيادي للحكومات: سلام، نموذج لغوي سيادي عربيٌّ منذ الرمز الأول، يُسلَّم مع المعرفة والبنية التحتية والتطبيقات والوكلاء منظومةً واحدة مملوكة. مبنيّ عبر الإمارات والأردن لأمم تخطّط لعقود قادمة.</p></header>
<main>
<section><h2>تعرّف على سلام — النموذج اللغوي السيادي</h2>
<p>سلام يقرأ ويستدلّ ويتكلّم العربية منذ الرمز الأول. مزيج خبراء متناثر، مُدرَّب من الصفر دون أي أساس مفتوح المصدر، على 125 إلى 1000 مليار رمز مُخلّص الحقوق، والعربية والإنجليزية نِدّان. ليس تحسيناً لنموذج جاهز، ولا غلافاً فوق نموذج غيرك. الأوزان تنتقل مع الصفقة: مملوكة لك، لا مستأجرة منك.</p>
<ul>
<li>سلام نانو (v1): 48 خبيراً، 7.8 مليار معامل، 125 مليار رمز تدريب — الصياغة والترجمة وأعمال اللغة اليومية.</li>
<li>سلام كور (v2): 96 خبيراً، 14.4 مليار معامل، 250 مليار رمز تدريب — إجابات مؤصَّلة بسجلاتك وقوانينك.</li>
<li>سلام برو (v4): 192 خبيراً، 27.6 مليار معامل، 500 مليار رمز تدريب — تحليل متعدد الخطوات عبر الوزارات والبيانات.</li>
<li>سلام ماكس (v8): 384 خبيراً، 54 مليار معامل، 1000 مليار رمز تدريب — عمل حكومي شامل بعمق احترافي.</li>
<li>سلام الوطني (v16): 224 خبيراً، كلٌّ منها أعمق مرتين، 150 مليار معامل، أكثر من 20 تريليون رمز تدريب — ذكاء أمة بأكمله داخل أسوارها، على هيكل سيادي واحد.</li>
</ul></section>
<section><h2>مُدرَّب على أمّتك</h2>
<p>اللغة والقانون والتراث والعلم والسجل العام — مُخلّصة الحقوق وقابلة للتدقيق. حزم المعرفة من الدول الشريكة مُرخَّصة، لا منهوبة من الشبكة.</p>
<p>والمسار نفسه يزوّد غيرنا ببيانات عربية: <a href="/arabic-data-for-ai/">مجموعات بيانات عربية لتدريب الذكاء الاصطناعي وتقييمه</a> — نصوصاً وأصواتاً وبيانات متعددة الوسائط، تُجمع دولةً دولة من الأردن إلى الشام والخليج ووادي النيل والمغرب العربي.</p></section>
<section><h2>يعمل حيث تقول أنت</h2>
<p>معزول تماماً على أرض وطنية، أو على سحابة سيادية داخل حدودك. لا استدلال يغادر النطاق، ولا شيء يتصل بالخارج. يُشترى مرة، ويُملك تماماً.</p></section>
<section><h2>ثمانية وكلاء، وإجابة واحدة مسؤولة</h2>
<p>أطلس يخطّط المدينة. فلو يحرّكها. غريد يمدّها بالطاقة. تيرا تحمي بيئتها. سيفيك يخدم ناسها. بروسبر ينمّي اقتصادها. سنتينل يحفظ أمنها. وفازا ون يجيب عنهم جميعاً.</p></section>
<section><h2>تواصل</h2>
<p>تعمل فازا من الإمارات العربية المتحدة والأردن. استخدم نموذج تواصل فازا في هذه الصفحة للاستفسارات التقنية والعروض، أو راسلنا على support@phaza.io.</p></section>
</main>"""


def build_page(bundle: str) -> None:
    shell = (HERE / 'index.html').read_text()
    shell = shell.replace('<html lang="en">', '<html lang="ar" dir="rtl">', 1)
    shell = re.sub(r'<title>.*?</title>', '<title>' + TITLE + '</title>', shell, flags=re.S)
    for pat in (r'(<meta name="description" content=")[^"]*(")',
                r'(<meta property="og:description" content=")[^"]*(")',
                r'(<meta name="twitter:description" content=")[^"]*(")'):
        shell = re.sub(pat, r'\1' + DESC + r'\2', shell)
    for pat in (r'(<meta property="og:title" content=")[^"]*(")',
                r'(<meta name="twitter:title" content=")[^"]*(")'):
        shell = re.sub(pat, r'\1' + TITLE + r'\2', shell)
    shell = shell.replace('<link rel="canonical" href="https://phaza.io/" />',
                          '<link rel="canonical" href="https://phaza.io/ar/" />\n'
                          '    <meta property="og:locale" content="ar_JO" />')
    shell = shell.replace('<meta property="og:url" content="https://phaza.io/" />',
                          '<meta property="og:url" content="https://phaza.io/ar/" />')
    if REVIEW:
        shell = re.sub(r'<meta name="robots" content="[^"]*" />', NOINDEX, shell)
    shell = shell.replace('"inLanguage": "en"', '"inLanguage": "ar"')
    shell = re.sub(r'/assets/index-b\d+\.js', '/assets/' + bundle, shell)
    # integrity is computed for the English bundle; this page carries its own
    shell = re.sub(r'<script type="module" crossorigin integrity="[^"]*"', '<script type="module" crossorigin', shell)
    shell = shell.replace('<script src="/assets/phaza-lang.js"></script>\n    ', '')
    for widget in ('phaza-connect', 'phaza-careers'):
        shell = re.sub(r'/assets/' + widget + r'(?:\.[a-f0-9]+)?\.js', '/assets/' + build_widget(widget), shell)

    start = shell.index('<div id="root">')
    end = shell.index('</body>', start)
    tail = shell[shell.rindex('</div>', start, end):end]
    shell = (shell[:start] + '<div id="root"><!-- نسخة ثابتة للزواحف وللقراءة بلا جافاسكربت. -->\n'
             + crawler_copy() + tail + shell[end:])

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(shell)
    print(f'ar/index.html written ({len(shell):,} bytes)')


def alternates() -> None:
    """Each language points at the other, both point at themselves, and the
    root tells a search engine which to show where."""
    links = ('    <link rel="alternate" hreflang="en" href="https://phaza.io/" />\n'
             '    <link rel="alternate" hreflang="ar" href="https://phaza.io/ar/" />\n'
             '    <link rel="alternate" hreflang="x-default" href="https://phaza.io/" />\n')
    for f in ('index.html', 'ar/index.html'):
        p = HERE / f
        s = p.read_text()
        s = re.sub(r'\n? *<link rel="alternate" hreflang="[^"]*" href="[^"]*" />', '', s)
        s = s.replace('    <link rel="canonical"', links + '    <link rel="canonical"', 1)
        p.write_text(s)
    print('hreflang alternates set on both roots')


def redirect_snippet() -> None:
    """An Arabic-speaking reader landing on the English root is sent to the
    Arabic one. ?lang=en switches that off for the visit, and the switch in the
    corner always wins -- no storage, no cookie, nothing to consent to."""
    js = ("(function(){if(1)return;try{var p=location.pathname;"
          "if(p!=='/'&&p!=='/index.html')return;"
          "if(location.search.indexOf('lang=en')>-1)return;"
          "var z=%s;"
          "var l=(navigator.languages||[navigator.language||'']).join(',');"
          "var tz='';try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||''}catch(e){}"
          "if(/\\bar\\b|^ar|,ar/.test(l)||z.indexOf(tz)>-1){location.replace('/ar/')}"
          "}catch(e){}})();" % json.dumps(AR_ZONES))
    (A / 'phaza-lang.js').write_text(
        '/* Opens the site in Arabic for readers in the Arabic-speaking world.\n'
        '   Decided from the browser\'s own language list and time zone -- no\n'
        '   geolocation service, no cookie, nothing written to the device, so the\n'
        '   privacy policy stays true. ?lang=en opts out for the visit, and the\n'
        '   switch in the corner of the second screen always wins. */\n' + js + '\n')
    p = HERE / 'index.html'
    s = p.read_text()
    if 'phaza-lang' not in s:
        s = s.replace('<script type="module" src="/assets/phaza-boot',
                      '<script src="/assets/phaza-lang.js"></script>\n'
                      '    <script type="module" src="/assets/phaza-boot', 1)
        p.write_text(s)
    print('language redirect written')


# Each Arabic document also gets its own URL, so a link, a search result or a
# shared message lands on the Arabic page rather than the English one.
AR_DOCS = [
    {'slug': 'arabic-data-for-ai', 'src': DOCS['PHZDATAHTML'], 'doc': False,
     'title': 'مجموعات بيانات عربية لتدريب الذكاء الاصطناعي وتقييمه | فازا',
     'desc': ('بيانات عربية مُخلَّصة الحقوق — نصوص وأصوات ووسائط متعددة — لتدريب النماذج اللغوية '
              'وتقييمها والتعرّف على الكلام، بالفصحى وبلهجات الدول من الأردن إلى الشام والخليج '
              'ووادي النيل والمغرب العربي، من المسار الذي يدرّب سلام.')},
    {'slug': 'arabic-ai-evaluation', 'src': DOCS['PHZEVALHTML'], 'doc': True,
     'title': 'تقييم النماذج اللغوية العربية — مذكّرة فازا التقنية 01',
     'desc': ('كيف تقيس فازا النماذج العربية: اختبار بحسب الدولة والنمط والسجل والمجال والقناة بدل '
              'نتيجة مجمَّعة واحدة — مجموعات محجوزة، وفصل معمّى في الخلاف، وضبط للتسرّب، وما ننشره وما لن ننشره.')},
    {'slug': 'privacy', 'src': DOCS['PHZPRIVHTML'], 'doc': True,
     'title': 'سياسة الخصوصية — فازا',
     'desc': ('كيف تتعامل فازا مع البيانات الشخصية على phaza.io: لا ملفات تعريف ارتباط، ولا متتبّعات، '
              'ولا خطوط من طرف ثالث، ولا استخدام للبيانات في تدريب النماذج.')},
]


def build_doc_pages(bundle: str) -> None:
    import re as _re
    shell_src = (HERE / 'ar' / 'index.html').read_text()
    for d in AR_DOCS:
        url = 'https://phaza.io/ar/' + d['slug'] + '/'
        s = shell_src
        s = _re.sub(r'<title>.*?</title>', '<title>' + d['title'] + '</title>', s, flags=_re.S)
        for pat in (r'(<meta name="description" content=")[^"]*(")',
                    r'(<meta property="og:description" content=")[^"]*(")',
                    r'(<meta name="twitter:description" content=")[^"]*(")'):
            s = _re.sub(pat, r'\1' + d['desc'] + r'\2', s)
        for pat in (r'(<meta property="og:title" content=")[^"]*(")',
                    r'(<meta name="twitter:title" content=")[^"]*(")'):
            s = _re.sub(pat, r'\1' + d['title'] + r'\2', s)
        s = s.replace('<link rel="canonical" href="https://phaza.io/ar/" />',
                      '<link rel="canonical" href="' + url + '" />')
        if REVIEW:
            s = re.sub(r'<meta name="robots" content="[^"]*" />', NOINDEX, s)
        s = s.replace('<meta property="og:url" content="https://phaza.io/ar/" />',
                      '<meta property="og:url" content="' + url + '" />')
        s = _re.sub(r'\n? *<link rel="alternate" hreflang="[^"]*" href="[^"]*" />', '', s)
        s = s.replace('    <link rel="canonical"',
                      '    <link rel="alternate" hreflang="en" href="https://phaza.io/' + d['slug'] + '/" />\n'
                      '    <link rel="alternate" hreflang="ar" href="' + url + '" />\n'
                      '    <link rel="canonical"', 1)
        body = _re.sub(r'^<!--.*?-->\s*', '', d['src'].read_text(), flags=_re.S).strip()
        cls = 'phz-data phz-doc' if d['doc'] else 'phz-data'
        start = s.index('<div id="root">')
        end = s.index('</body>', start)
        tail = s[s.rindex('</div>', start, end):end]
        s = (s[:start] + '<div id="root"><!-- نسخة ثابتة للزواحف وللقراءة بلا جافاسكربت. -->\n'
             + '<main class="' + cls + '">\n' + body + '\n</main>' + tail + s[end:])
        out = HERE / 'ar' / d['slug'] / 'index.html'
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(s)
        print(f"ar/{d['slug']}/index.html written ({len(s):,} bytes)")


if __name__ == '__main__':
    redirect_snippet()
    bundle = build_bundle(entry_name())
    build_page(bundle)
    build_doc_pages(bundle)
    alternates()
