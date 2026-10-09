# phaza.io

This repo **is** the live site. Whatever is on `main` is served at
https://phaza.io by GitHub Pages, usually within two minutes of a push. There
is no staging environment.

Don't delete `CNAME` (the custom domain), `.nojekyll`, or `404.html` (the SPA
fallback).

**If you are working with Claude Code, read [CLAUDE.md](CLAUDE.md)** — it has the
pipeline, the ordering rules and the failure modes. This file is the short
human version.

## Getting set up

```bash
git clone git@github.com:Attarawneh/phaza-site.git
cd phaza-site
python3 serve.py 8794          # http://localhost:8794/
```

Python 3 is all you need to build. Node is only used to syntax-check edited
JavaScript (`node --check assets/<file>.js`).

## Making a change

Content lives in `content/` — English at the top level, Arabic in `content/ar/`.
Edit the content file, never the generated `*/index.html`.

Then run the pipeline **in this order** and check the result locally:

```bash
python3 inject-pages.py
python3 build-pages.py
python3 release.py
python3 build-ar.py
python3 preflight.py
```

`release.py` must run before `build-ar.py`, and `preflight.py` must pass before
you push — it catches the one mistake that takes the site down silently (a
script whose integrity digest no longer matches the file, which the browser
blocks, leaving a blank page).

## Publishing

```bash
python3 preflight.py && git push origin main
```

Live in about two minutes. The HTML is cached for 10 minutes and the JavaScript
for 4 hours, so when you check a deploy, hard-refresh or add `?x=1` to the URL —
otherwise you will be looking at the old copy and think nothing shipped.

## What's on the site

| URL | |
|---|---|
| `/` | the scrolling journey (single-page app) |
| `/arabic-data-for-ai/` | the Salam data library |
| `/research/` | publications index |
| `/research/evaluating-arabic-language-models/` | Technical Note 01 |
| `/privacy/` | privacy policy |
| `/ar/…` | the same five in Arabic |

Every document exists twice: as a panel inside the app, and as a static page a
search engine can read. Both are generated from the same content file.

## Not live yet

The Arabic site and the research pages are published but carry `noindex`, are
absent from `sitemap.xml`, and the automatic language redirect is off. Those
three switches are listed in [CLAUDE.md](CLAUDE.md) and are Amer's call — they
are gated on confirming the commitments Technical Note 01 makes.

## History

The site was originally mirrored from a Replit build in August 2026. It is no
longer connected to it: content, the Arabic build and the publication pipeline
all live here now, and re-exporting from Replit would overwrite them. The
earlier cinematic Abu Dhabi map site is archived under
`Desktop/Phaza/Phaza Online/Website/`.
