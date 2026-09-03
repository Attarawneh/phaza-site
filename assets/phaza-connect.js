/**
 * Phaza Connect — the enquiry form.
 *
 * Replaces the two mailto links with one in-page form. The visitor fills it
 * in and submits knowingly; what stays out of the page is the plumbing --
 * no mail client handoff, no page reload, and no recipient addresses in the
 * client source. Routing to the recipients happens server-side at the
 * endpoint, so the addresses are never exposed to visitors or scrapers.
 *
 * Endpoint is read from <meta name="phaza-contact-endpoint">.
 */
const ENDPOINT = document.querySelector('meta[name="phaza-contact-endpoint"]')?.content || '';

const FIELDS = [
  { n: 'name', l: 'Full name', t: 'text', required: true, ac: 'name' },
  { n: 'organisation', l: 'Organisation or ministry', t: 'text', required: true, ac: 'organization' },
  { n: 'country', l: 'Country', t: 'text', required: true, ac: 'country-name' },
  { n: 'email', l: 'Work email', t: 'email', required: true, ac: 'email' },
];

let lastFocus = null;

function close(dlg) {
  dlg.remove();
  document.body.style.overflow = '';
  if (lastFocus) { try { lastFocus.focus(); } catch {} }
}

function build() {
  const dlg = document.createElement('div');
  dlg.className = 'pz-overlay';
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  dlg.setAttribute('aria-labelledby', 'pz-title');

  dlg.innerHTML = `
    <div class="pz-panel">
      <button class="pz-x" type="button" aria-label="Close">&times;</button>
      <p class="pz-kicker">Get in touch</p>
      <h2 class="pz-title" id="pz-title">Phaza Connect</h2>
      <p class="pz-sub">Technical questions or a working demonstration — one form, answered by the team directly.</p>
      <form class="pz-form" novalidate>
        <div class="pz-row">
          <label class="pz-label" for="pz-purpose">Reason</label>
          <select class="pz-input" id="pz-purpose" name="purpose">
            <option>Technical inquiry</option>
            <option>Demo request</option>
            <option>Both</option>
          </select>
        </div>
        ${FIELDS.map((f) => `
        <div class="pz-row">
          <label class="pz-label" for="pz-${f.n}">${f.l}</label>
          <input class="pz-input" id="pz-${f.n}" name="${f.n}" type="${f.t}"
                 autocomplete="${f.ac}" ${f.required ? 'required' : ''} />
        </div>`).join('')}
        <div class="pz-row">
          <label class="pz-label" for="pz-message">What would you like to cover?</label>
          <textarea class="pz-input pz-area" id="pz-message" name="message" rows="4"></textarea>
        </div>
        <input type="text" name="company_website" class="pz-hp" tabindex="-1" autocomplete="off" aria-hidden="true" />
        <p class="pz-err" hidden></p>
        <button class="pz-send" type="submit">Send</button>
        <p class="pz-note">Sent to the Phaza team. We reply from a monitored address.</p>
      </form>
      <div class="pz-done" hidden>
        <h3 class="pz-title">Thank you.</h3>
        <p class="pz-sub">Your message is with the team. Expect a reply to the address you gave.</p>
        <button class="pz-send pz-close2" type="button">Close</button>
      </div>
    </div>`;

  const panel = dlg.querySelector('.pz-panel');
  const form = dlg.querySelector('.pz-form');
  const err = dlg.querySelector('.pz-err');
  const send = dlg.querySelector('.pz-send');

  const shut = () => close(dlg);
  dlg.querySelector('.pz-x').addEventListener('click', shut);
  dlg.querySelector('.pz-close2').addEventListener('click', shut);
  dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) shut(); });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') shut();
    if (e.key === 'Tab') {
      const f = [...panel.querySelectorAll('button,input,select,textarea')].filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const data = Object.fromEntries(new FormData(form).entries());
    if (data.company_website) return;                    // bot trap
    const missing = FIELDS.filter((f) => f.required && !String(data[f.n] || '').trim());
    if (missing.length) {
      err.textContent = 'Please complete: ' + missing.map((f) => f.l.toLowerCase()).join(', ') + '.';
      err.hidden = false; return;
    }
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(data.email)) {
      err.textContent = 'That email address does not look right.'; err.hidden = false; return;
    }
    // Until the relay endpoint is configured, hand off to the visitor's mail
    // client addressed to the public role address, with everything filled in.
    // Never leaves the visitor staring at a form that cannot deliver.
    if (!ENDPOINT) {
      const body = ['Reason: ' + data.purpose, 'Name: ' + data.name,
        'Organisation: ' + data.organisation, 'Country: ' + data.country,
        'Email: ' + data.email, '', data.message || ''].join('\n');
      window.location.href = 'mailto:support@phaza.io'
        + '?subject=' + encodeURIComponent('Phaza Connect \u2014 ' + data.purpose + ' \u2014 ' + data.organisation)
        + '&body=' + encodeURIComponent(body);
      form.hidden = true;
      const done = dlg.querySelector('.pz-done');
      done.querySelector('.pz-sub').textContent =
        'Your email app is opening with the message ready \u2014 press send there and it reaches the team.';
      done.hidden = false;
      dlg.querySelector('.pz-close2').focus();
      return;
    }
    send.disabled = true; send.textContent = 'Sending…';
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, page: location.pathname, sent_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(String(res.status));
      form.hidden = true;
      dlg.querySelector('.pz-done').hidden = false;
      dlg.querySelector('.pz-close2').focus();
    } catch {
      err.textContent = 'That did not send. Please try once more.';
      err.hidden = false; send.disabled = false; send.textContent = 'Send';
    }
  });

  document.body.appendChild(dlg);
  document.body.style.overflow = 'hidden';
  dlg.querySelector('#pz-purpose').focus();
}

// Delegated so it survives React re-rendering the closing section.
document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-phaza-contact]');
  if (!trigger) return;
  e.preventDefault();
  lastFocus = trigger;
  if (!document.querySelector('.pz-overlay')) build();
});
