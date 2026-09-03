/* Legacy entry kept for browsers holding cached HTML from an earlier build.
   Loads the current bundle rather than duplicating it. */
try {
  document.querySelectorAll('link[rel="stylesheet"]').forEach((l) => {
    if (/index-(DpOubK7I|391a40ef)\.css/.test(l.getAttribute('href') || '')) {
      l.setAttribute('href', '/assets/index-391a40ef.css');
    }
  });
} catch {}
import('/assets/index-72401566.js');
