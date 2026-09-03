/* Legacy entry for browsers holding cached HTML from an earlier build.
   It discovers the current bundle from a fresh copy of index.html rather
   than hard-coding a hashed name, so this file never needs updating and a
   CDN-cached copy of it stays correct indefinitely. */
(async () => {
  const SELF = /index-(DtPEwAVO|ce5f0c84|0aee01be|bf8941ff)\.js$/;
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
    if (js && !SELF.test(js[0])) { await import(js[0]); return; }
  } catch {}
  await import('/assets/index-72401566.js');
})();
