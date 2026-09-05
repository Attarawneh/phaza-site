/* Holds the opening frame until the application has actually mounted.
   #root ships static copy for crawlers and no-JS readers, so without this the
   first paint is unstyled prose that React then throws away -- a flash of the
   wrong page every cold load. The cover is painted by index.html itself, so it
   is up before this file, the bundle, or the stylesheet have arrived.
   The Content-Security-Policy has no 'unsafe-inline' for scripts, which is why
   this lives in a file rather than a <script> block in the page. */

const cover = document.getElementById('phz-boot');

if (cover) {
  const root = document.getElementById('root');
  const start = Date.now();

  /* Long enough that a warm cache does not flash the mark for three frames,
     short enough that nobody waits on it. */
  const MIN_SHOWN_MS = 620;
  /* If the app never mounts, the cover must still go: a broken bundle should
     leave the reader with the static copy, not a logo forever. The stylesheet
     carries the same failsafe as an animation, in case this file is the thing
     that failed. */
  const GIVE_UP_MS = 9000;

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    setTimeout(() => {
      cover.classList.add('phz-boot-out');
      setTimeout(() => cover.remove(), 800);
    }, Math.max(0, MIN_SHOWN_MS - (Date.now() - start)));
  };

  if (root) {
    /* React replacing the static markup is the honest signal that the page
       behind this one is real. One frame later so its first paint lands
       under the cover rather than after it. */
    const seen = new MutationObserver(() => {
      seen.disconnect();
      requestAnimationFrame(finish);
    });
    seen.observe(root, { childList: true });
    setTimeout(() => { seen.disconnect(); finish(); }, GIVE_UP_MS);
  } else {
    finish();
  }
}
