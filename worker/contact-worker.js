/**
 * Phaza enquiry relay — Cloudflare Worker.
 *
 * The website posts the form here; this Worker emails it onward. Recipients
 * live in environment variables, never in the website, so they are not
 * visible to visitors or harvestable by scrapers.
 *
 * Deploy
 *   1. Cloudflare dashboard -> Workers -> Create -> paste this file.
 *   2. Settings -> Variables:
 *        RECIPIENTS   attarawneh@phaza.io,znasser@phaza.io
 *        FROM         enquiries@phaza.io        (must be a verified sender)
 *        RESEND_KEY   <secret>                  (encrypted)
 *        ALLOW_ORIGIN https://phaza.io
 *   3. Note the Worker URL, then put it in index.html:
 *        <meta name="phaza-contact-endpoint" content="https://…workers.dev" />
 *      and add that host to connect-src in the CSP meta tag.
 */
const FIELDS = ['purpose', 'name', 'organisation', 'country', 'email', 'message', 'page', 'sent_at'];

const esc = (s) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

export default {
  async fetch(request, env) {
    const origin = env.ALLOW_ORIGIN || 'https://phaza.io';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });
    if (request.headers.get('Origin') && request.headers.get('Origin') !== origin) {
      return new Response('Forbidden', { status: 403, headers: cors });
    }

    let data;
    try { data = await request.json(); } catch { return new Response('Bad request', { status: 400, headers: cors }); }

    // Honeypot: real people leave this empty. Accept silently so bots learn nothing.
    if (data.company_website) return new Response('{"ok":true}', { status: 200, headers: cors });

    for (const f of ['name', 'organisation', 'country', 'email']) {
      if (!String(data[f] || '').trim()) {
        return new Response('Missing fields', { status: 422, headers: cors });
      }
    }

    const rows = FIELDS.filter((f) => data[f])
      .map((f) => `<tr><td style="padding:4px 12px 4px 0;color:#888">${f}</td><td>${esc(data[f])}</td></tr>`)
      .join('');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.FROM,
        to: (env.RECIPIENTS || '').split(',').map((s) => s.trim()).filter(Boolean),
        reply_to: String(data.email),
        subject: `Phaza enquiry — ${esc(data.purpose || 'Enquiry')} — ${esc(data.organisation)}`,
        html: `<h2 style="font:600 16px system-ui">New enquiry from phaza.io</h2>
               <table style="font:14px system-ui;border-collapse:collapse">${rows}</table>`,
      }),
    });

    if (!res.ok) return new Response('Upstream error', { status: 502, headers: cors });
    return new Response('{"ok":true}', { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
  },
};
