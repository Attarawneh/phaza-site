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
