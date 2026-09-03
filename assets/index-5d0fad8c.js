/* Legacy entry for browsers holding cached HTML from an earlier build.
   Discovers the current bundle from a no-store fetch of index.html, so a
   CDN-cached copy of this file stays correct. Guarded against re-entry: a
   shim must never import another shim. */
(async () => {
  if (window.__phazaEntryLoaded) return;
  window.__phazaEntryLoaded = 1;
  const IS_SHIM = /index-(DtPEwAVO|ce5f0c84|0aee01be|bf8941ff|72401566|5d0fad8c)\.js$/;
  try {
    const html = await fetch('/?_cb=' + Date.now(), { cache: 'no-store' }).then((r) => r.text());
    const css = html.match(/\/assets\/index-[A-Za-z0-9]+\.css/);
    if (css) {
      document.querySelectorAll('link[rel="stylesheet"]').forEach((l) => {
        if (/\/assets\/index-[A-Za-z0-9]+\.css/.test(l.getAttribute('href') || '')) {
          l.setAttribute('href', css[0]);
        }
      });
    }
    const js = html.match(/\/assets\/index-[A-Za-z0-9]+\.js/);
    if (js && !IS_SHIM.test(js[0])) { await import(js[0]); return; }
  } catch {}
  await import('/assets/index-b1.js');
})();
