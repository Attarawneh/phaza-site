# phaza.io — deployed site

This repo IS the live site: whatever is on `main` is served at **https://phaza.io**
via GitHub Pages (custom domain via the `CNAME` file — don't delete it, or
`.nojekyll`, or `404.html`, which is the SPA fallback).

Push to `main` → live in ~2 minutes. Browsers cache the JS/favicon, so
hard-refresh (or add `?x` to the URL) when checking a deploy.

## Where things live

- **Source of truth (design/content):** the Replit team workspace
  *ARES Workspace → "Photo Extractor"* (the repl name is historical — it's the
  Phaza site). Work there happens with the Replit agent; the app publishes
  privately to photo-extractor.replit.app.
- **This repo:** a static mirror of that build, deployed to phaza.io.
  It was captured from the published Replit app on 2026-08-31.

## Hand-patches applied ON TOP of the Replit build

These exist ONLY in this repo — they are NOT in the Replit source. If you
re-export/re-mirror from Replit, they will be LOST unless re-applied (or,
better, first ported into the Replit source):

1. **Phaza P mark inside the hero orb** — pure CSS in `index.html`
   (`#opening::after` + the `phaza-orb-icon-in` keyframes in the inline
   `<style>` block). Also: the real favicon (`favicon.svg`,
   `apple-touch-icon.png`) and cleaned meta description replaced Replit's
   placeholders.
2. **Salam orb scan-wave + twinkle** — a small edit inside the minified
   `assets/index-DtPEwAVO.js`, in the particle draw loop (search for
   `wv=Ee?Math.max` to find it). On the Salam sections the orb dots twinkle
   in orb cyan continuously, and a brighter band sweeps left→right every ~3s.

## History note

The previous site (the cinematic Abu Dhabi map journey, with full source) is
archived on the original machine under
`Desktop/Phaza/Phaza Online/Website/` (source + build), in case anything
needs to be recovered from it.

## Deploy rule (learned the hard way)

GitHub Pages serves `/assets/*` with `max-age=14400`, so Cloudflare can hold a
file for four hours. **Any file whose CONTENT changes must also change NAME.**

The entry bundle and the map chunk import each other, so they move together
under one deploy tag (`index-b<N>.js` + `AbuDhabiMap-b<N>.js`). If only one
moves, the CDN can serve a mismatched pair from two different deploys, React
initialises twice, and the page goes blank with minified error #321.

Never delete a previously published entry filename. Old names stay as small
self-resolving shims: they read the current entry out of a no-store fetch of
`index.html`, so a browser holding cached HTML still lands on the current
build. `sw.js` is a tombstone that uninstalls the pre-rebuild service worker.

## Releasing

Run `python3 release.py`, then commit and push. It moves the entry bundle and
map chunk to a new deploy tag together, regenerates the legacy shims, and
recomputes Subresource Integrity for the entry and stylesheet. Do not rename
those files by hand -- that is what caused the blank-page incidents.

## Hardening in place

- **CSP** (meta, in `index.html`): `default-src 'self'`, no inline scripts, no
  `eval`, `object-src 'none'`. Allowed egress is only the map tile host and
  ArcGIS imagery. An injected inline script is refused by the browser.
- **Subresource Integrity** on the entry bundle and stylesheet: if anything in
  the delivery path alters them, the browser refuses to execute.
- **Referrer-Policy** `strict-origin-when-cross-origin`.
- No training/pipeline status is present in the DOM or the bundle.

Two things CSP cannot set from a meta tag and that need Cloudflare rules:
`frame-ancestors` (clickjacking) and `X-Content-Type-Options: nosniff`.
