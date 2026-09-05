/* Phaza Careers — the "upload your CV" door.
 *
 * The flow is two honest steps. The file goes up first and the portal
 * reads it on the spot; whatever the CV already answers — name, email,
 * phone, LinkedIn — is never asked again. The popup asks ONLY for the
 * gaps, then the application lands on the screening desk and a copy goes
 * to the careers mailbox.
 *
 * Reuses Phaza Connect's dialog styling (.pz-*) so the two doors read as
 * one system; only the drop zone's own dress is added here.
 */
(() => {
  const META = document.querySelector('meta[name="phaza-contact-endpoint"]');
  const ENDPOINT = META?.content?.trim() || '';
  if (!ENDPOINT) return;

  const ACCEPT = '.pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp';
  const MAX_MB = 100;

  const ASK = {
    full_name: { label: 'Your name', type: 'text', required: true, autocomplete: 'name' },
    email: { label: 'Email', type: 'email', required: true, autocomplete: 'email' },
    phone: { label: 'Phone', type: 'tel', required: true, autocomplete: 'tel', hint: 'With country code — +962 …' },
    linkedin_url: { label: 'LinkedIn', type: 'text', required: false, autocomplete: 'url', hint: 'linkedin.com/in/you (optional)' },
  };

  let lastFocus = null;

  /* The drop zone's own clothes; everything else is Connect's. */
  const style = document.createElement('style');
  style.textContent = `
    .pz-drop { border: 1.5px dashed rgba(0, 205, 255, .35); border-radius: 12px;
      padding: 2.1rem 1.2rem; text-align: center; cursor: pointer;
      transition: border-color .18s ease, background .18s ease; }
    .pz-drop:hover, .pz-drop.is-over { border-color: #00CDFF; background: rgba(0, 205, 255, .06); }
    .pz-drop b { color: #00CDFF; font-weight: 600; }
    .pz-drop small { display: block; margin-top: .45rem; opacity: .55; }
    .pz-found { font-size: .8rem; opacity: .75; margin: .2rem 0 .6rem; line-height: 1.55; }
    .pz-found b { opacity: 1; }
    .pz-reading { display: flex; gap: .6rem; align-items: center; justify-content: center;
      padding: 2rem 0; opacity: .8; }
    .pz-reading::before { content: ''; width: 1rem; height: 1rem; border-radius: 999px;
      border: 2px solid rgba(0,205,255,.25); border-top-color: #00CDFF;
      animation: pzc-spin .8s linear infinite; }
    @keyframes pzc-spin { to { transform: rotate(360deg); } }
    .pz-careers-fab { position: fixed; left: 1.1rem; bottom: 1.1rem; z-index: 60;
      font: 500 .78rem/1 Inter, system-ui, sans-serif; letter-spacing: .02em;
      color: #cfeaf5; background: rgba(10, 16, 24, .72); backdrop-filter: blur(10px);
      border: 1px solid rgba(0, 205, 255, .28); border-radius: 999px;
      padding: .55rem .95rem; cursor: pointer;
      transition: border-color .18s ease, color .18s ease; }
    .pz-careers-fab:hover { border-color: #00CDFF; color: #fff; }
    @media (max-width: 640px) { .pz-careers-fab { left: .7rem; bottom: .7rem; } }
    .pz-drop-inline { max-width: 34rem; margin: 0 auto; color: #cfeaf5;
      font: 400 .95rem/1.5 Inter, system-ui, sans-serif;
      background: rgba(10, 16, 24, .55); backdrop-filter: blur(6px); }
    .pz-drop-inline small { font-family: ui-monospace, monospace; font-size: .62rem;
      letter-spacing: .14em; text-transform: uppercase; }
  `;
  document.head.appendChild(style);

  const shut = (dlg) => {
    dlg.dataset.userClosed = '1';
    dlg.remove();
    document.body.style.overflow = '';
    lastFocus?.focus?.();
  };

  function build(initialFile) {
    const dlg = document.createElement('div');
    dlg.className = 'pz-overlay pz-careers';
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-labelledby', 'pzc-title');

    dlg.innerHTML = `
      <div class="pz-panel">
        <button class="pz-x" type="button" aria-label="Close">&times;</button>
        <p class="pz-kicker">Careers</p>
        <h2 class="pz-title" id="pzc-title">Join the team</h2>
        <p class="pz-sub">Send your CV. We read every one — and only ask for what it does not already say.</p>

        <div class="pzc-step" data-step="pick">
          <div class="pz-drop" role="button" tabindex="0" aria-label="Upload your CV">
            <b>Choose your CV</b> or drop it here
            <small>PDF or Word — any reasonable size</small>
          </div>
          <input type="file" accept="${ACCEPT}" hidden />
          <p class="pz-err" role="alert" hidden></p>
        </div>

        <div class="pzc-step" data-step="reading" hidden>
          <div class="pz-reading">Reading your CV…</div>
        </div>

        <form class="pzc-step pz-form" data-step="ask" hidden novalidate>
          <p class="pz-found"></p>
          <div class="pzc-fields"></div>
          <p class="pz-err" role="alert" hidden></p>
          <button class="pz-send" type="submit">Send my application</button>
          <p class="pz-note">Goes straight to the hiring team at careers@phaza.io.</p>
        </form>

        <div class="pzc-step pz-done" data-step="done" hidden>
          <h3 class="pz-title">Thank you.</h3>
          <p class="pz-sub">Your CV is with the team. If there is a fit, we reply to the address you gave.</p>
          <button class="pz-send pz-close2" type="button">Close</button>
        </div>
      </div>`;

    const show = (name) => dlg.querySelectorAll('.pzc-step')
      .forEach((s) => { s.hidden = s.dataset.step !== name; });
    const errAt = (step, message) => {
      const slot = dlg.querySelector(`[data-step="${step}"] .pz-err`);
      if (slot) { slot.textContent = message; slot.hidden = false; }
    };

    const drop = dlg.querySelector('.pz-drop');
    const file = dlg.querySelector('input[type=file]');
    const form = dlg.querySelector('[data-step="ask"]');
    let token = null;

    const inspect = async (picked) => {
      if (!picked) return;
      if (picked.size > MAX_MB * 1024 * 1024) {
        errAt('pick', `That file is over ${MAX_MB}MB — a CV should travel lighter.`);
        return;
      }
      show('reading');
      try {
        const body = new FormData();
        body.append('cv', picked, picked.name);
        const r = await fetch(`${ENDPOINT}?action=cv-inspect`, { method: 'POST', body });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.token) {
          show('pick');
          errAt('pick', d.error || d.message || statusWords(r.status));
          return;
        }
        token = d.token;

        /* Nothing missing: the CV said it all. Send without asking. */
        if (!d.missing?.length) { await submit({}); return; }

        const knows = Object.entries(d.found || {})
          .filter(([, v]) => v).map(([, v]) => `<b>${escapeHtml(String(v))}</b>`);
        dlg.querySelector('.pz-found').innerHTML = knows.length
          ? `Your CV already tells us: ${knows.join(' · ')}. Just a couple more things:`
          : 'A couple of details your CV does not mention:';

        dlg.querySelector('.pzc-fields').innerHTML = d.missing
          .filter((k) => ASK[k])
          .map((k) => `
            <div class="pz-row">
              <label class="pz-label" for="pzc-${k}">${ASK[k].label}${ASK[k].required ? '' : ' <span class="pz-opt">(optional)</span>'}</label>
              <input class="pz-input" id="pzc-${k}" name="${k}" type="${ASK[k].type}"
                autocomplete="${ASK[k].autocomplete}" ${ASK[k].hint ? `placeholder="${ASK[k].hint}"` : ''} />
            </div>`).join('');
        show('ask');
        dlg.querySelector('.pzc-fields input')?.focus();
      } catch {
        show('pick');
        errAt('pick', 'The connection dropped mid-upload — check your network and try again, or email careers@phaza.io.');
      }
    };

    const submit = async (fields) => {
      show('reading');
      try {
        const r = await fetch(`${ENDPOINT}?action=cv-submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, ...fields }),
        });
        const d = await r.json().catch(() => ({}));
        if (r.status === 410) {           // stash expired while they typed
          token = null;
          show('pick');
          errAt('pick', d.error || 'That took a while — please choose your file again.');
          return;
        }
        if (!r.ok) {
          show('ask');
          errAt('ask', d.error || d.message || statusWords(r.status));
          return;
        }
        show('done');
        dlg.querySelector('.pz-close2').focus();
      } catch {
        show('ask');
        errAt('ask', 'The connection dropped — your file is still with us for a few minutes, just press send again.');
      }
    };

    drop.addEventListener('click', () => file.click());
    drop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); }
    });
    file.addEventListener('change', () => inspect(file.files?.[0]));
    ['dragover', 'dragenter'].forEach((t) => drop.addEventListener(t, (e) => {
      e.preventDefault(); drop.classList.add('is-over');
    }));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => {
      e.preventDefault(); drop.classList.remove('is-over');
      if (t === 'drop') inspect(e.dataTransfer?.files?.[0]);
    }));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fields = {};
      let bad = null;
      form.querySelectorAll('.pz-input').forEach((input) => {
        const v = input.value.trim();
        if (v) fields[input.name] = v;
        const spec = ASK[input.name];
        if (spec?.required && !v) bad = bad || input;
        if (input.name === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) bad = bad || input;
      });
      if (bad) { errAt('ask', 'A couple of fields still need you — the ones we could not read from the CV.'); bad.focus(); return; }
      submit(fields);
    });

    dlg.querySelector('.pz-x').addEventListener('click', () => shut(dlg));
    dlg.querySelector('.pz-close2').addEventListener('click', () => shut(dlg));
    dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) shut(dlg); });
    dlg.addEventListener('keydown', (e) => { if (e.key === 'Escape') shut(dlg); });

    document.body.appendChild(dlg);
    document.body.style.overflow = 'hidden';
    drop.focus();
    if (initialFile) inspect(initialFile);

    /* Some browser extensions (Adobe Acrobat's PDF interception, watched
       doing exactly this) tear foreign dialogs out of the DOM the moment a
       PDF is picked — the applicant sees everything vanish with no word of
       why. The dialog defends itself: removed by anything other than its
       own close controls, it steps straight back in and carries on. */
    new MutationObserver(() => {
      if (!document.body.contains(dlg) && dlg.dataset.userClosed !== '1') {
        document.body.appendChild(dlg);
        document.body.style.overflow = 'hidden';
      }
    }).observe(document.body, { childList: true });
  }

  /* When the server gives no words, the status code still has some. */
  const statusWords = (status) => ({
    413: `That file is too large for the network to carry — the ceiling is ${MAX_MB}MB.`,
    403: 'This form only works from phaza.io itself — open the live site and try there.',
    422: 'That file type is not one we can read — send a PDF or Word document.',
    429: 'A lot of tries in a short time — give it a minute and try again.',
  })[status] || (status >= 500
    ? 'The careers desk hit a snag on our side — try again in a minute, or email careers@phaza.io.'
    : `That did not go through (HTTP ${status || 'network error'}). Try once more, or email careers@phaza.io.`);

  const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const open = (from, withFile) => {
    lastFocus = from || document.activeElement;
    if (!document.querySelector('.pz-careers')) build(withFile);
  };

  /* Doors in, in order of subtlety:
     1. anything marked data-phaza-careers (survives React re-renders);
     2. a quiet fixed pill so the door exists even where no section carries it;
     3. a line inside Phaza Connect when it opens — people reaching out are
        exactly the people who might be applying. */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-phaza-careers]');
    if (!t) return;
    e.preventDefault();
    open(t);
  });

  /* The map's old "Drop your CV." zone (data-testid=dropzone-cv) posted to
     /api/careers/cv — an endpoint that does not exist here; every CV dropped
     on it died with "Couldn't send". The bundle ships without source, so the
     zone is commandeered in the capture phase: a click opens the real door,
     a dropped file walks straight into it. */
  const OLD_ZONE = '[data-testid="dropzone-cv"]';

  /* The map section's own box is REPLACED, not just intercepted: the old
     button is hidden and a working drop zone — same one the dialog uses —
     takes its exact place. React re-renders re-run this via the observer
     below, so the swap survives the scene unmounting and mounting again. */
  const replaceOldZone = () => {
    document.querySelectorAll(OLD_ZONE).forEach((zone) => {
      if (zone.dataset.pzcReplaced) return;
      zone.dataset.pzcReplaced = '1';
      zone.style.display = 'none';

      const box = document.createElement('div');
      box.className = 'pz-drop pz-drop-inline';
      box.setAttribute('role', 'button');
      box.setAttribute('tabindex', '0');
      box.setAttribute('aria-label', 'Upload your CV');
      box.innerHTML = '<b>Choose your CV</b> or drop it here<small>PDF or Word — read the moment it arrives</small>';

      /* Straight to the file browser — no intermediate popup. The dialog
         only appears once a file is chosen, already reading it. */
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.accept = ACCEPT;
      picker.hidden = true;
      box.appendChild(picker);
      picker.addEventListener('change', () => {
        if (picker.files?.[0]) { open(box, picker.files[0]); picker.value = ''; }
      });

      box.addEventListener('click', () => picker.click());
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); picker.click(); }
      });
      ['dragenter', 'dragover'].forEach((t) => box.addEventListener(t, (e) => {
        e.preventDefault(); box.classList.add('is-over');
      }));
      ['dragleave', 'drop'].forEach((t) => box.addEventListener(t, (e) => {
        e.preventDefault(); box.classList.remove('is-over');
        if (t === 'drop') open(box, e.dataTransfer?.files?.[0] || undefined);
      }));

      zone.parentNode?.insertBefore(box, zone);
    });
  };
  replaceOldZone();
  new MutationObserver(replaceOldZone).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', (e) => {
    const zone = e.target.closest(OLD_ZONE);
    if (!zone) return;
    e.preventDefault();
    e.stopPropagation();
    open(zone);
  }, true);
  ['dragenter', 'dragover'].forEach((t) => document.addEventListener(t, (e) => {
    if (e.target.closest?.(OLD_ZONE)) e.preventDefault();
  }, true));
  document.addEventListener('drop', (e) => {
    const zone = e.target.closest?.(OLD_ZONE);
    if (!zone) return;
    e.preventDefault();
    e.stopPropagation();
    open(zone, e.dataTransfer?.files?.[0] || undefined);
  }, true);

  new MutationObserver(() => {
    const connect = document.querySelector('.pz-overlay:not(.pz-careers) .pz-form');
    if (!connect || connect.querySelector('.pzc-cross')) return;
    const line = document.createElement('p');
    line.className = 'pz-note pzc-cross';
    line.innerHTML = 'Joining the team instead? <a href="#" data-phaza-careers style="color:#00CDFF">Upload your CV</a>.';
    connect.appendChild(line);
  }).observe(document.body, { childList: true });
})();
