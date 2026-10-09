# phaza.io — how to work in this repo

This repo **is** the live site. Whatever is on `main` is served at https://phaza.io
by GitHub Pages, usually within two minutes of a push. There is no staging.

Read this before changing anything. The pipeline has an order, and two of the
steps fail silently if you get it wrong.

---

## The rule that breaks the site

`release.py` publishes each asset under a content-hashed name and writes an SRI
digest into every page. **If a bundle is edited after `release.py` ran, the
browser blocks the script and phaza.io renders as a bare loading orb.** Nothing
in the page tells a visitor why.

So: never edit `assets/index-b*.js` and then push without re-running the
pipeline, and always run `python3 preflight.py` before `git push`.

---

## Where content lives

| You want to change | Edit |
|---|---|
| A document page, English | `content/phaza-{data,privacy,eval,research}-page.html` |
| The same page, Arabic | `content/ar/phaza-…-page.html` (its own source, not a translation layer) |
| Journey copy (the scrolling home page) | the string inside `assets/index-b*.js`, **and** its key in `content/ar/journey-strings.json` |
| Form copy (contact / CV upload) | `assets/phaza-connect.js`, `assets/phaza-careers.js`, **and** `content/ar/ui-strings.json` |
| Page titles, meta descriptions, JSON-LD | `build-pages.py` (English) and `build-ar.py` (Arabic) |

The two JSON files map **the exact English string** to its Arabic. If you change
an English string that has an entry, change the key too, or the Arabic silently
stops being applied — `build-ar.py` prints `not found in the bundle: …` when that
happens. Read its output.

**English and Arabic are one change, not two.** The site makes claims about how
Phaza operates; the two languages saying different things is a defect, and it has
happened before.

---

## The pipeline, in this order

```bash
python3 inject-pages.py     # content/*.html  -> slots in the bundle
python3 build-pages.py      # the crawlable static pages + JSON-LD + hreflang
python3 release.py          # new bNNN tag, content hashes, SRI, legacy shims
python3 build-ar.py         # the whole Arabic site, built FROM the released bundle
python3 preflight.py        # every page: script present, digest matches
```

`release.py` **must** run before `build-ar.py`. Release renames the code-split
chunk (`AbuDhabiMap-bNNN.js`); an Arabic bundle built first imports a chunk that
no longer exists, and `/ar/` loads nothing.

Local preview: `python3 serve.py 8794` (or the `phaza-site` launch config), then
http://localhost:8794/. Syntax-check edited JS with
`~/.phaza-node/bin/node --check assets/<file>.js`.

Publish: `git push origin main`.

---

## URLs

```
/                                              the journey (SPA)
/arabic-data-for-ai/                           data library
/research/                                     publications index
/research/evaluating-arabic-language-models/   Technical Note 01
/privacy/                                      privacy policy
/ar/…                                          the same five, in Arabic
/arabic-ai-evaluation/                         soft redirect to the note's new URL
```

Each document is an SPA panel **and** a static page: the static copy is what a
crawler reads, the panel is what a visitor sees. Both come from the same content
file, so edit the content file, never the generated `*/index.html`.

Adding a publication: one entry in `content/phaza-research-page.html` (and its
Arabic twin) plus one dict in `build-pages.py`. The note keeps its URL across
versions; earlier versions get a versioned address rather than being overwritten.

---

## Arabic

`build-ar.py` builds the Arabic site **from the English bundle** — it is not a
fork. It swaps strings, flips `PHZAR`, rebases the router and every internal
href under `/ar/`, and swaps whole documents into the panel slots.

Two things that have bitten before:

- **The RTL layer hands every element the Arabic face with `!important`**, because
  JetBrains Mono has no Arabic. Index numerals (`01`–`05`) are Latin digits and
  are explicitly exempted in `phaza-brand.css`; without the exemption they lose
  their tracking and stop lining up with the icon above them. If you add a new
  numeral slot, exempt it too — unless it holds Arabic letters, like the أ–هـ
  step markers, which carry `.phz-step-ar`.
- **Arabic is injected into JS string literals as `\uXXXX` escapes.** An escape
  that lands outside a string becomes a valid identifier and the bundle throws
  `Unexpected identifier`. If that happens, the replacement matched code rather
  than text.

---

## Not yet live — do not flip without Amer

| Switch | Where |
|---|---|
| Arabic + research out of `noindex` | `REVIEW = True` in `build-ar.py`; `'review': True` on `RESEARCH` and `NOTE01` in `build-pages.py` |
| Those URLs into the sitemap | `sitemap.xml` (currently lists only `/`, `/arabic-data-for-ai/`, `/privacy/`) |
| Send Arabic-speaking visitors to `/ar/` | `assets/phaza-lang.js` — the `if(1)return;` on line 6 disables it |

These are gated on Amer confirming Technical Note 01's method commitments
(blind review, adjudication, retiring contaminated test sets, running every
compared model in-house) and the privacy policy's retention periods.

---

## House rules

- Never write "FZCO" — the company is "Phaza".
- Never mention Hub71 in any public copy or outreach.
- No licence or registration numbers, and no capital figures, in public copy.
- The site sets no cookies and stores nothing in the browser. The privacy policy
  says so in both languages, and a visitor can verify it in devtools — so do not
  add analytics, third-party fonts, embeds, or `localStorage`.
