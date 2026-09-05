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
    instagram_url: { label: 'Instagram', type: 'text', required: false, autocomplete: 'url', hint: '@yourhandle (optional)' },
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
    .pzc-bars { display: grid; gap: .7rem; margin: .9rem 0 1.2rem; }
    .pzc-bar-row { display: flex; justify-content: space-between; font-size: .8rem;
      color: #cfeaf5; margin-bottom: .25rem; }
    .pzc-track { height: 6px; border-radius: 999px; background: rgba(255,255,255,.08); overflow: hidden; }
    .pzc-fill { height: 100%; border-radius: inherit;
      background: linear-gradient(90deg, #00CDFF, #8A2BE2);
      animation: pzc-grow .8s cubic-bezier(.22,.9,.3,1) both; }
    @keyframes pzc-grow { from { width: 0 !important; } }
    .pzc-decline { display: block; width: 100%; margin-top: .55rem; background: none; border: 0;
      color: rgba(255,255,255,.55); font-size: .78rem; cursor: pointer; padding: .4rem; }
    .pzc-decline:hover { color: #fff; }
    .pzc-file { border: 1px dashed rgba(0,205,255,.3); border-radius: 9px; padding: .6rem .8rem;
      font-size: .78rem; color: rgba(255,255,255,.6); cursor: pointer;
      transition: border-color .15s ease, color .15s ease; }
    .pzc-file:hover { border-color: #00CDFF; color: #fff; }
    .pzc-file.is-set { border-style: solid; border-color: rgba(0,205,255,.6); color: #00CDFF; }
    .pzc-consent { display: flex; gap: .6rem; align-items: flex-start; margin: 1rem 0 .4rem;
      font-size: .74rem; line-height: 1.5; color: rgba(255,255,255,.75); cursor: pointer; }
    .pzc-consent input { margin-top: .2rem; accent-color: #00CDFF; }
    .pz-careers .pz-panel, .pz-careers .pz-send, .pz-careers .pzc-decline {
      font-family: Inter, system-ui, -apple-system, sans-serif; }
    .pz-careers .pz-send { text-transform: none; letter-spacing: .01em;
      font-weight: 600; font-size: .92rem; }
    .pz-careers .pzc-verdict { font-size: .95rem; line-height: 1.6; color: #dfeefb; }
    .pz-careers .pzc-verdict b { color: #00CDFF; font-weight: 650; }
    .pz-careers #pzc-title { font-weight: 300; letter-spacing: .01em; }
    .pzc-orb { width: 3.2rem; height: 3.2rem; border-radius: 999px; flex: none;
      background: conic-gradient(from 0deg, #00F0FF, #21A0FF, #8A2BE2, #00F0FF);
      filter: blur(1px) saturate(1.2);
      animation: pzc-orb-spin 2.4s linear infinite, pzc-orb-breathe 2.8s ease-in-out infinite;
      box-shadow: 0 0 28px rgba(0, 205, 255, .35), 0 0 60px rgba(138, 43, 226, .2); }
    .pzc-ai-line { font-size: .86rem; color: #cfeaf5; }
    .pz-reading { flex-direction: column; gap: 1rem; }
    .pz-reading::before { content: none; }
    @keyframes pzc-orb-spin { to { transform: rotate(360deg); } }
    @keyframes pzc-orb-breathe { 50% { scale: 1.12; filter: blur(2.5px) saturate(1.4); } }
    @media (prefers-reduced-motion: reduce) {
      .pzc-orb { animation: none; }
    }
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

        <div class="pzc-step" data-step="pick">
          <p class="pz-sub">Send your CV. We read it on the spot and show you honestly where you fit.</p>
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

        <div class="pzc-step" data-step="result" hidden>
          <p class="pz-sub pzc-verdict"></p>
          <div class="pzc-bars"></div>
          <p class="pz-err" role="alert" hidden></p>
          <button class="pz-send pzc-proceed" type="button">I&rsquo;d like to proceed</button>
          <button class="pzc-decline" type="button">Not right now</button>
        </div>

        <form class="pzc-step pz-form" data-step="details" hidden novalidate>
          <p class="pz-sub">A few things your CV didn&rsquo;t carry, to complete your file:</p>
          <div class="pzc-fields"></div>
          <div class="pzc-uploads"></div>
          <label class="pzc-consent">
            <input type="checkbox" name="scout_consent" value="1" />
            <span>I approve Phaza researching my public professional presence and social
            activity through its channels as part of evaluating my application.</span>
          </label>
          <p class="pz-err" role="alert" hidden></p>
          <button class="pz-send" type="submit">Complete my application</button>
          <p class="pz-note">Goes straight to the hiring team at careers@phaza.io.</p>
        </form>

        <div class="pzc-step pz-done" data-step="done" hidden>
          <h3 class="pz-title pzc-done-title">Thank you.</h3>
          <p class="pz-sub pzc-done-sub">Your application is with the team. We reply to the address you gave.</p>
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
    const form = dlg.querySelector('[data-step="details"]');
    let token = null;

    const post = async (action, payload, isForm = false) => {
      const opts = { method: 'POST' };
      if (isForm) { opts.body = payload; }
      else { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(payload); }
      const r = await fetch(`${ENDPOINT}?action=${action}`, opts);
      const d = await r.json().catch(() => ({}));
      return { r, d };
    };

    let missing = [];
    let firstName = '';
    let aiTimer = null;

    /* The analysis wears its intelligence: a breathing orb and a line that
       tells the truth about what is happening, phrase by phrase. */
    const AI_LINES = [
      'Reading your experience…',
      'Mapping your skills to Phaza\u2019s functions…',
      'Weighing the evidence…',
      'Writing the honest answer…',
    ];
    const aiShow = () => {
      show('reading');
      const slot = dlg.querySelector('.pz-reading');
      slot.innerHTML = '<div class="pzc-orb"></div><span class="pzc-ai-line">' + AI_LINES[0] + '</span>';
      let i = 0;
      clearInterval(aiTimer);
      aiTimer = setInterval(() => {
        i = (i + 1) % AI_LINES.length;
        const line = dlg.querySelector('.pzc-ai-line');
        if (line) line.textContent = AI_LINES[i];
      }, 2600);
    };
    const aiStop = () => clearInterval(aiTimer);

    const inspect = async (picked) => {
      if (!picked) return;
      if (picked.size > MAX_MB * 1024 * 1024) {
        errAt('pick', `That file is over ${MAX_MB}MB — a CV should travel lighter.`);
        return;
      }
      show('reading');
      dlg.querySelector('.pz-reading').textContent = 'Reading your CV…';
      try {
        const body = new FormData();
        body.append('cv', picked, picked.name);
        const { r, d } = await post('cv-inspect', body, true);
        if (!r.ok || !d.token) {
          show('pick');
          errAt('pick', d.error || d.message || statusWords(r.status));
          return;
        }
        token = d.token;
        firstName = String(d.found?.full_name || '').trim().split(/\s+/)[0] || '';
        analyze();
      } catch {
        show('pick');
        errAt('pick', 'The connection dropped mid-upload — check your network and try again, or email careers@phaza.io.');
      }
    };

    /* The CV goes to the same screener the hiring team uses, scored against
       the functions Phaza actually runs on — and the applicant is shown the
       result before being asked for anything more. */
    const analyze = async () => {
      aiShow();
      try {
        const { r, d } = await post('cv-analyze', { token });
        if (!r.ok || !d.ok) {
          show('pick');
          errAt('pick', d.error || statusWords(r.status));
          return;
        }
        poll(0);
      } catch {
        show('pick');
        errAt('pick', 'The connection dropped — try again, or email careers@phaza.io.');
      }
    };

    let pollFaults = 0;
    const poll = async (tries) => {
      if (tries > 40) {            // ~2 minutes: stop spinning, keep the truth
        showResult(null);
        return;
      }
      try {
        const { d } = await post('cv-status', { token });
        if (d.state === 'screened') { missing = d.missing || []; showResult(d); return; }
        if (d.state === 'not_cv') {
          show('pick');
          errAt('pick', 'That file does not read as a CV — send the document that tells your work story.');
          return;
        }
        // One sour answer is a hiccup, not a verdict — only three in a row
        // gives up on showing the score.
        if (d.state === 'failed' || !d.ok) {
          pollFaults += 1;
          if (pollFaults >= 3) { showResult(null); return; }
        } else {
          pollFaults = 0;
        }
      } catch { /* transient; keep polling */ }
      setTimeout(() => poll(tries + 1), 3000);
    };

    const showResult = (d) => {
      aiStop();
      dlg.querySelector('#pzc-title').textContent = firstName ? `Welcome, ${firstName}.` : 'Welcome.';
      const verdict = dlg.querySelector('.pzc-verdict');
      const bars = dlg.querySelector('.pzc-bars');
      if (!d) {
        verdict.textContent = 'Your CV is in — the deeper read finishes on our side. Complete your file and the team takes it from there.';
        bars.innerHTML = '';
        if (!missing.length) missing = ['full_name', 'email', 'phone', 'linkedin_url'];
      } else {
        verdict.innerHTML = {
          strong: 'A <b>strong match</b>. Your experience lines up closely with work we are hiring for:',
          promising: 'A <b>promising match</b>. Parts of your experience line up well with:',
          early: 'An <b>early-stage match</b> today — the closest areas to your experience:',
        }[d.band];
        bars.innerHTML = (d.top || []).map((t) => `
          <div class="pzc-bar">
            <div class="pzc-bar-row"><span>${escapeHtml(t.function || '')}</span><span>${t.score}</span></div>
            <div class="pzc-track"><div class="pzc-fill" style="width:${Math.max(3, t.score)}%"></div></div>
          </div>`).join('');
      }
      show('result');
      dlg.querySelector('.pzc-proceed').focus();
    };

    const UPLOADS = [
      { n: 'photo', label: 'A headshot', hint: 'A clear photo of your face', accept: '.png,.jpg,.jpeg,.webp' },
      { n: 'id_doc', label: 'ID card', hint: 'Optional at this stage — passport or national ID', accept: '.pdf,.png,.jpg,.jpeg,.webp', optional: true },
    ];

    const buildDetails = () => {
      dlg.querySelector('.pzc-fields').innerHTML = ['full_name', 'email', 'phone', 'linkedin_url']
        .filter((k) => missing.includes(k)).concat(['instagram_url'])
        .map((k) => {
          const f = ASK[k];
          return `
            <div class="pz-row">
              <label class="pz-label" for="pzc-${k}">${f.label}${f.required ? '' : ' <span class="pz-opt">(optional)</span>'}</label>
              <input class="pz-input" id="pzc-${k}" name="${k}" type="${f.type}"
                autocomplete="${f.autocomplete}" ${f.hint ? `placeholder="${f.hint}"` : ''} />
            </div>`;
        }).join('');

      dlg.querySelector('.pzc-uploads').innerHTML = UPLOADS.map((u) => `
        <div class="pz-row">
          <label class="pz-label">${u.label}${u.optional ? ' <span class="pz-opt">(optional)</span>' : ''}</label>
          <div class="pzc-file" data-slot="${u.n}" role="button" tabindex="0">${u.hint}</div>
          <input type="file" name="${u.n}" accept="${u.accept}" hidden />
        </div>`).join('');

      dlg.querySelectorAll('.pzc-file').forEach((el) => {
        const input = el.nextElementSibling;
        el.addEventListener('click', () => input.click());
        input.addEventListener('change', () => {
          el.textContent = input.files?.[0]?.name || el.textContent;
          el.classList.toggle('is-set', !!input.files?.length);
        });
      });
      show('details');
      dlg.querySelector('.pzc-fields input, .pzc-file')?.focus();
    };

    dlg.querySelector('.pzc-proceed').addEventListener('click', buildDetails);
    dlg.querySelector('.pzc-decline').addEventListener('click', async () => {
      show('reading');
      dlg.querySelector('.pz-reading').textContent = 'Noted…';
      try { await post('cv-complete', { token, proceed: false }); } catch { /* their choice stands regardless */ }
      dlg.querySelector('.pzc-done-title').textContent = 'Understood.';
      dlg.querySelector('.pzc-done-sub').textContent = 'Your CV stays with us — if the fit strengthens, we know where to find you.';
      show('done');
    });

    const submit = async () => {
      const body = new FormData();
      body.append('token', token);
      body.append('proceed', '1');
      let bad = null;
      form.querySelectorAll('.pz-input').forEach((input) => {
        const v = input.value.trim();
        if (v) body.append(input.name, v);
        const spec = ASK[input.name];
        if (spec?.required && !v) bad = bad || input;
        if (input.name === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) bad = bad || input;
      });
      if (bad) { errAt('details', 'A couple of fields still need you.'); bad.focus(); return; }
      form.querySelectorAll('input[type=file]').forEach((input) => {
        if (input.files?.[0]) body.append(input.name, input.files[0], input.files[0].name);
      });
      if (form.querySelector('[name=scout_consent]').checked) body.append('scout_consent', '1');

      show('reading');
      dlg.querySelector('.pz-reading').textContent = 'Completing your application…';
      try {
        const { r, d } = await post('cv-complete', body, true);
        if (r.status === 410) {
          token = null;
          show('pick');
          errAt('pick', d.error || 'That took a while — please choose your file again.');
          return;
        }
        if (!r.ok) {
          buildDetails();
          errAt('details', d.error || d.message || statusWords(r.status));
          return;
        }
        show('done');
        dlg.querySelector('.pz-close2').focus();
      } catch {
        buildDetails();
        errAt('details', 'The connection dropped — your file is still with us, press complete again.');
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

    form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });

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
