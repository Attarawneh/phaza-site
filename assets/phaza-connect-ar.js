/**
 * Phaza Connect — the enquiry form.
 *
 * The visitor fills the form and it is delivered straight to the team from
 * the website. No mail-client handoff, no page reload, and the recipient
 * addresses are never in the page: routing happens at the endpoint, so
 * visitors and scrapers cannot read who receives it.
 *
 * Endpoint comes from <meta name="phaza-contact-endpoint">.
 */
const ENDPOINT = document.querySelector('meta[name="phaza-contact-endpoint"]')?.content?.trim() || '';

/* ---- Does this read as something a person wrote? --------------------------
   Mirrors sense_reason() in worker/relay.php; the server is the authority and
   this copy exists so the visitor hears about it before pressing Send.
   Script-aware on purpose: the vowel and consonant tests run only on Latin and
   Cyrillic, because Arabic does not write short vowels and CJK does not use
   spaces, so applying them everywhere would reject good Arabic or Chinese. */

const RE_CODE = /<\?php|<\/?[a-z][a-z0-9]*[\s/>]|\bfunction\s*[\w$]*\s*\(|=>|\b(?:var|let|const)\s+\w+\s*=|\bimport\s+[\w{]|\bdef\s+\w+\s*\(|#include|\bSELECT\b.*\bFROM\b|\bDROP\s+TABLE\b|\bUNION\s+SELECT\b|\$_(?:GET|POST|SERVER|REQUEST)|\bcurl\s+-|\brm\s+-rf\b|\{\s*"[^"]+"\s*:/is;
const RE_RUN = /(.)\1{5,}/u;
const RE_LONG = /\S{31,}/u;
const RE_SPACELESS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u;
const RE_LATINISH = /[\p{Script=Latin}\p{Script=Cyrillic}]/u;
const RE_OTHER_SCRIPT = /[\p{Script=Arabic}\p{Script=Han}\p{Script=Hebrew}\p{Script=Hangul}\p{Script=Devanagari}\p{Script=Thai}]/u;
const RE_VOWEL = /[aeiouyàáâäãåèéêëìíîïòóôöõùúûüæøœыаеиоуэюя]/iu;

const SENSE_MSG = {
  code: 'Please write in plain language rather than code. Salam reads every message that reaches us — give it something to read.',
  links: '\u0639\u062f\u062f \u0627\u0644\u0631\u0648\u0627\u0628\u0637 \u0643\u0628\u064a\u0631. \u064a\u0631\u062c\u0649 \u0648\u0635\u0641 \u0627\u0633\u062a\u0641\u0633\u0627\u0631\u0643 \u0628\u0643\u0644\u0645\u0627\u062a\u0643.',
  repeat: '\u0627\u0644\u0646\u0635 \u0645\u0643\u0631\u0631. \u0627\u0643\u062a\u0628\u0647 \u0645\u0631\u0629 \u0648\u0627\u062d\u062f\u0629 \u0628\u0643\u0644\u0645\u0627\u062a\u0643 \u2014 \u0633\u0644\u0627\u0645 \u064a\u0642\u0631\u0623\u0647 \u0643\u0627\u0645\u0644\u0627\u064b.',
  duplicate: '\u0633\u0628\u0642 \u0623\u0646 \u0623\u0631\u0633\u0644\u062a \u0647\u0630\u0647 \u0627\u0644\u0631\u0633\u0627\u0644\u0629\u061b \u0642\u0631\u0623\u0647\u0627 \u0633\u0644\u0627\u0645 \u0641\u064a \u0627\u0644\u0645\u0631\u0629 \u0627\u0644\u0623\u0648\u0644\u0649\u060c \u0641\u0623\u0636\u0641 \u0627\u0644\u062c\u062f\u064a\u062f \u0641\u0642\u0637.',
  gibberish: 'That does not read as language. Salam reads every message that reaches us — please write a sentence, in whichever language you prefer.',
};

function senseReason(text, short) {
  const t = String(text || '').trim();
  if (!t) return null;

  if (RE_CODE.test(t)) return 'code';
  if (RE_RUN.test(t)) return 'gibberish';
  if (RE_LONG.test(t) && !RE_SPACELESS.test(t)) return 'gibberish';

  const letters = (t.match(/\p{L}/gu) || []).length;
  const dense = t.replace(/\s+/gu, '').length;
  if (dense >= 8 && letters / Math.max(dense, 1) < 0.45) return 'gibberish';

  if (RE_LATINISH.test(t) && !RE_OTHER_SCRIPT.test(t)) {
    if (/[bcdfghjklmnpqrstvwxz]{6,}/i.test(t)) return 'gibberish';
    for (const raw of t.split(/\s+/u)) {
      const w = raw.replace(/[^\p{L}]/gu, '');
      if (w.length >= 6 && /^[\p{Script=Latin}]+$/u.test(w) && !RE_VOWEL.test(w)) return 'gibberish';
    }
  }

  if (short) return null;

  if ((t.match(/https?:\/\/|www\./gi) || []).length >= 3) return 'links';

  const units = t.split(/[\r\n]+|(?<=[.!?؟。])\s+/u)
    .map((u) => u.trim().toLowerCase()).filter(Boolean);
  if (units.length) {
    const counts = {};
    for (const u of units) counts[u] = (counts[u] || 0) + 1;
    if (Math.max(...Object.values(counts)) >= 3) return 'repeat';
  }

  const words = t.toLowerCase().split(/\s+/u).filter(Boolean);
  if (words.length >= 12 && new Set(words).size / words.length < 0.35) return 'repeat';

  return null;
}

const senseCheck = (v, short) => {
  const r = senseReason(v, short);
  return r ? SENSE_MSG[r] : '';
};

const RE_EMAIL = /^[^\s@]+@[^\s@,]+\.[a-z]{2,}$/i;
const RE_URL = /https?:\/\/|www\./i;

const FIELDS = [
  { n: 'name', l: '\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644', t: 'text', ac: 'name', max: 80,
    check: (v) => !v ? '\u064a\u0631\u062c\u0649 \u0625\u062f\u062e\u0627\u0644 \u0627\u0633\u0645\u0643 \u0627\u0644\u0643\u0627\u0645\u0644.'
      : v.length < 2 ? '\u064a\u0628\u062f\u0648 \u0627\u0644\u0627\u0633\u0645 \u0642\u0635\u064a\u0631\u0627\u064b \u0623\u0643\u062b\u0631 \u0645\u0646 \u0627\u0644\u0644\u0627\u0632\u0645.'
      : RE_URL.test(v) ? '\u064a\u0631\u062c\u0649 \u0625\u062f\u062e\u0627\u0644 \u0627\u0633\u0645\u060c \u0644\u0627 \u0631\u0627\u0628\u0637.'
      : senseCheck(v, true) },
  { n: 'organisation', l: '\u0627\u0644\u062c\u0647\u0629 \u0623\u0648 \u0627\u0644\u0648\u0632\u0627\u0631\u0629', t: 'text', ac: 'organization', max: 120,
    check: (v) => !v ? '\u0623\u062e\u0628\u0631\u0646\u0627 \u0628\u0627\u0644\u062c\u0647\u0629 \u0627\u0644\u062a\u064a \u062a\u0645\u062b\u0651\u0644\u0647\u0627.'
      : v.length < 2 ? '\u064a\u0628\u062f\u0648 \u0647\u0630\u0627 \u0642\u0635\u064a\u0631\u0627\u064b \u0623\u0643\u062b\u0631 \u0645\u0646 \u0627\u0644\u0644\u0627\u0632\u0645.'
      : senseCheck(v, true) },
  { n: 'country', l: '\u0627\u0644\u062f\u0648\u0644\u0629', t: 'text', ac: 'country-name', max: 60,
    check: (v) => !v ? '\u064a\u0631\u062c\u0649 \u0625\u062f\u062e\u0627\u0644 \u062f\u0648\u0644\u062a\u0643.'
      : v.length < 2 ? '\u064a\u0631\u062c\u0649 \u0643\u062a\u0627\u0628\u0629 \u0627\u0633\u0645 \u0627\u0644\u062f\u0648\u0644\u0629 \u0643\u0627\u0645\u0644\u0627\u064b.'
      : /\d/.test(v) ? '\u0644\u0627 \u064a\u0646\u0628\u063a\u064a \u0623\u0646 \u064a\u062d\u062a\u0648\u064a \u0627\u0633\u0645 \u0627\u0644\u062f\u0648\u0644\u0629 \u0639\u0644\u0649 \u0623\u0631\u0642\u0627\u0645.'
      : senseCheck(v, true) },
  { n: 'email', l: '\u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a \u0644\u0644\u0639\u0645\u0644', t: 'email', ac: 'email', max: 120,
    check: (v) => !v ? '\u064a\u0631\u062c\u0649 \u0625\u062f\u062e\u0627\u0644 \u0628\u0631\u064a\u062f \u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a \u0644\u0646\u062a\u0645\u0643\u0651\u0646 \u0645\u0646 \u0627\u0644\u0631\u062f.'
      : !RE_EMAIL.test(v) ? '\u0647\u0630\u0627 \u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a \u063a\u064a\u0631 \u0635\u0627\u0644\u062d.'
      : v.length > 120 ? '\u0647\u0630\u0627 \u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0637\u0648\u064a\u0644 \u0623\u0643\u062b\u0631 \u0645\u0646 \u0627\u0644\u0644\u0627\u0632\u0645.' : '' },
  { n: 'message', l: '\u0645\u0627 \u0627\u0644\u0630\u064a \u062a\u0648\u062f\u0651 \u0623\u0646 \u0646\u063a\u0637\u0651\u064a\u0647\u061f', t: 'area', max: 2000, optional: true,
    check: (v) => v.length > 2000 ? '\u064a\u0631\u062c\u0649 \u0623\u0644\u0651\u0627 \u064a\u062a\u062c\u0627\u0648\u0632 \u0627\u0644\u0646\u0635 2000 \u062d\u0631\u0641.'
      : senseCheck(v, false) },
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

  const field = (f) => `
    <div class="pz-row">
      <label class="pz-label" for="pz-${f.n}">${f.l}${f.optional ? ' <span class="pz-opt">(\u0627\u062e\u062a\u064a\u0627\u0631\u064a)</span>' : ''}</label>
      ${f.t === 'area'
        ? `<textarea class="pz-input pz-area" id="pz-${f.n}" name="${f.n}" rows="4" maxlength="${f.max}"
             aria-describedby="pz-e-${f.n}"></textarea>`
        : `<input class="pz-input" id="pz-${f.n}" name="${f.n}" type="${f.t}" autocomplete="${f.ac}"
             maxlength="${f.max}" aria-describedby="pz-e-${f.n}" />`}
      <p class="pz-fe" id="pz-e-${f.n}" hidden></p>
    </div>`;

  dlg.innerHTML = `
    <div class="pz-panel">
      <button class="pz-x" type="button" aria-label="\u0625\u063a\u0644\u0627\u0642">&times;</button>
      <p class="pz-kicker">\u062a\u0648\u0627\u0635\u0644 \u0645\u0639\u0646\u0627</p>
      <h2 class="pz-title" id="pz-title">\u062a\u0648\u0627\u0635\u0644 \u0645\u0639 \u0641\u0627\u0632\u0627</h2>
      <p class="pz-sub">\u0623\u0633\u0626\u0644\u0629 \u062a\u0642\u0646\u064a\u0629 \u0623\u0648 \u0639\u0631\u0636 \u0639\u0645\u0644\u064a \u2014 \u0646\u0645\u0648\u0630\u062c \u0648\u0627\u062d\u062f\u060c \u064a\u062c\u064a\u0628 \u0639\u0646\u0647 \u0627\u0644\u0641\u0631\u064a\u0642 \u0645\u0628\u0627\u0634\u0631\u0629.</p>
      <form class="pz-form" novalidate>
        <div class="pz-row">
          <label class="pz-label" for="pz-purpose">\u0633\u0628\u0628 \u0627\u0644\u062a\u0648\u0627\u0635\u0644</label>
          <select class="pz-input" id="pz-purpose" name="purpose">
            <option>\u0627\u0633\u062a\u0641\u0633\u0627\u0631 \u062a\u0642\u0646\u064a</option><option>\u0637\u0644\u0628 \u0639\u0631\u0636 \u062a\u0648\u0636\u064a\u062d\u064a</option><option>\u0643\u0644\u0627\u0647\u0645\u0627</option>
          </select>
        </div>
        ${FIELDS.map(field).join('')}
        <input type="text" name="company_website" class="pz-hp" tabindex="-1" autocomplete="off" aria-hidden="true" />
        <p class="pz-err" role="alert" hidden></p>
        <button class="pz-send" type="submit">\u0625\u0631\u0633\u0627\u0644</button>
        <p class="pz-note">\u062a\u0635\u0644 \u0631\u0633\u0627\u0644\u062a\u0643 \u0625\u0644\u0649 \u0641\u0631\u064a\u0642 \u0641\u0627\u0632\u0627 \u0645\u0628\u0627\u0634\u0631\u0629\u060c \u0648\u0646\u0631\u062f \u0639\u0644\u064a\u0643 \u0639\u0644\u0649 \u0628\u0631\u064a\u062f\u0643 \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a.</p>
      </form>
      <div class="pz-done" hidden>
        <h3 class="pz-title">\u0634\u0643\u0631\u0627\u064b \u0644\u0643.</h3>
        <p class="pz-sub">\u0648\u0635\u0644\u062a \u0631\u0633\u0627\u0644\u062a\u0643 \u0625\u0644\u0649 \u0627\u0644\u0641\u0631\u064a\u0642\u060c \u0648\u0633\u0646\u0631\u062f \u0639\u0644\u064a\u0643 \u0639\u0644\u0649 \u0628\u0631\u064a\u062f\u0643 \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a.</p>
        <button class="pz-send pz-close2" type="button">\u0625\u063a\u0644\u0627\u0642</button>
      </div>
    </div>`;

  const panel = dlg.querySelector('.pz-panel');
  const form = dlg.querySelector('.pz-form');
  const err = dlg.querySelector('.pz-err');
  const send = dlg.querySelector('.pz-send');

  const showFieldError = (f, msg) => {
    const input = dlg.querySelector('#pz-' + f.n);
    const slot = dlg.querySelector('#pz-e-' + f.n);
    slot.textContent = msg; slot.hidden = !msg;
    input.classList.toggle('pz-bad', !!msg);
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    return !msg;
  };

  const validate = (f) => showFieldError(f, f.check(String(dlg.querySelector('#pz-' + f.n).value || '').trim()));

  FIELDS.forEach((f) => {
    const input = dlg.querySelector('#pz-' + f.n);
    input.addEventListener('blur', () => validate(f));
    input.addEventListener('input', () => {                    // clear as they fix it
      if (input.classList.contains('pz-bad')) validate(f);
    });
  });

  const shut = () => close(dlg);
  dlg.querySelector('.pz-x').addEventListener('click', shut);
  dlg.querySelector('.pz-close2').addEventListener('click', shut);
  dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) shut(); });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') shut();
    if (e.key === 'Tab') {
      const f = [...panel.querySelectorAll('button,input,select,textarea')]
        .filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    if (send.disabled) return;                                  // no double submit

    const results = FIELDS.map(validate);
    if (results.includes(false)) {
      const firstBad = dlg.querySelector('.pz-bad');
      if (firstBad) firstBad.focus();
      err.textContent = '\u064a\u0631\u062c\u0649 \u062a\u0635\u062d\u064a\u062d \u0627\u0644\u062d\u0642\u0648\u0644 \u0627\u0644\u0645\u0638\u0644\u064e\u0651\u0644\u0629.';
      err.hidden = false;
      return;
    }

    const data = Object.fromEntries(new FormData(form).entries());
    if (data.company_website) return;                           // bot trap
    Object.keys(data).forEach((k) => { data[k] = String(data[k]).trim(); });

    if (!ENDPOINT) {
      err.textContent = '\u062e\u062f\u0645\u0629 \u0627\u0644\u0625\u0631\u0633\u0627\u0644 \u0642\u064a\u062f \u0627\u0644\u062a\u0648\u0635\u064a\u0644 \u062d\u0627\u0644\u064a\u0627\u064b. \u064a\u0631\u062c\u0649 \u0645\u0631\u0627\u0633\u0644\u062a\u0646\u0627 \u0639\u0644\u0649 support@phaza.io \u0641\u064a \u0647\u0630\u0647 \u0627\u0644\u0623\u062b\u0646\u0627\u0621.';
      err.hidden = false;
      return;
    }

    send.disabled = true; send.textContent = 'Sending…';
    try {
      // Relay fields. _cc puts the second recipient on the same message; the
      // relay decides delivery, so neither address is in this file.
      const payload = {
        ...data,
        _subject: `Phaza Connect \u2014 ${data.purpose} \u2014 ${data.organisation}`,
        _cc: 'znasser@phaza.io',
        _template: 'table',
        _captcha: 'false',
        page: location.pathname,
        sent_at: new Date().toISOString(),
      };
      delete payload.company_website;
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        // The server runs the same rules and has the last word; show its
        // reason against the field it names rather than a generic failure.
        const body = await res.json().catch(() => null);
        if (body?.error) {
          const f = FIELDS.find((x) => x.n === body.field);
          if (f) {
            showFieldError(f, body.error);
            dlg.querySelector('#pz-' + f.n)?.focus();
          } else {
            err.textContent = body.error;
            err.hidden = false;
          }
          send.disabled = false;
          send.textContent = '\u0625\u0631\u0633\u0627\u0644';
          return;
        }
        throw new Error(String(res.status));
      }
      form.hidden = true;
      dlg.querySelector('.pz-done').hidden = false;
      dlg.querySelector('.pz-close2').focus();
    } catch {
      err.textContent = '\u062a\u0639\u0630\u0651\u0631 \u0627\u0644\u0625\u0631\u0633\u0627\u0644. \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649\u060c \u0623\u0648 \u0631\u0627\u0633\u0644\u0646\u0627 \u0639\u0644\u0649 support@phaza.io.';
      err.hidden = false; send.disabled = false; send.textContent = '\u0625\u0631\u0633\u0627\u0644';
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
