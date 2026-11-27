// Safetybiz One — Supabase Edge Function "companies-house".
// Looks up UK companies on the Companies House Public Data API so onboarding can fill in the company's details.
// Only Safetybiz administrators can call it. Needs the secret CH_API_KEY (a free "REST" API key for a live application
// from https://developer.company-information.service.gov.uk).
//   { action: "search", q }        -> up to 10 matching companies
//   { action: "get", number }      -> one company: profile, registered office, SIC codes and current directors
//   { action: "ping" }              -> { connected: true } when the API key works (no company data)
import { createClient } from 'npm:@supabase/supabase-js@2';

const API = 'https://api.company-information.service.gov.uk';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown) => new Response(JSON.stringify(body), { headers: { ...cors, 'content-type': 'application/json' } });
const addr = (a: Record<string, string> = {}) =>
  [a.care_of ? 'c/o ' + a.care_of : '', a.po_box ? 'PO Box ' + a.po_box : '', a.premises, a.address_line_1, a.address_line_2, a.locality, a.region, a.postal_code]
    .filter(Boolean).join(', ').replace(/^(\d+[A-Za-z]?), /, '$1 ');
// Companies House names are in capitals: "ZK GROUP LTD" -> "ZK Group Ltd" (short words with no vowels, like ZK or GDK, stay in capitals).
const KEEP: Record<string, string> = { LTD: 'Ltd', LIMITED: 'Limited', LLP: 'LLP', PLC: 'PLC', UK: 'UK', CIC: 'CIC', AND: 'and', OF: 'of', THE: 'the' };
const title = (s = '') => s.split(/(\s+)/).map((w, i) => {
  if (!w.trim()) return w;
  const u = w.toUpperCase(), k = KEEP[u.replace(/[^A-Z]/g, '')];
  if (k) return i === 0 ? k[0].toUpperCase() + k.slice(1) : w.replace(/[A-Za-z]+/, k);
  if (/^[^AEIOUY]{1,4}$/i.test(u.replace(/[^A-Z]/g, '')) && /[A-Z]/.test(u)) return u;
  return w.toLowerCase().replace(/(^|[-'(&/])([a-z])/g, (m, a, b) => a + b.toUpperCase());
}).join('');
// Officer names come as "SURNAME, First Middle".
const person = (n = '') => { const [s, f] = n.split(', '); return title([f, s].filter(Boolean).join(' ')); };

async function ch(path: string) {
  const key = Deno.env.get('CH_API_KEY');
  if (!key) throw new Error('Companies House is not connected yet: add the CH_API_KEY secret to this function');
  const r = await fetch(API + path, { headers: { authorization: 'Basic ' + btoa(key + ':'), accept: 'application/json' } });
  if (r.status === 404) return null;
  if (r.status === 401) throw new Error('Companies House did not accept the API key');
  if (r.status === 429) throw new Error('Too many Companies House lookups just now; try again in a few minutes');
  if (!r.ok) throw new Error(`Companies House replied ${r.status}`);
  return r.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const b = await req.json();
    // Health check for setup: says whether the API key works, and returns no company data.
    if (b.action === 'ping') { const j = await ch('/search/companies?q=tesco&items_per_page=1'); return reply({ ok: true, data: { connected: !!(j && j.items) } }); }
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const { data: ok } = await sb.rpc('is_admin');
    if (ok !== true) return reply({ ok: false, error: 'Only Safetybiz administrators can look up Companies House' });
    if (b.action === 'get') {
      const n = String(b.number || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{8}$/.test(n)) throw new Error('Enter an 8-character company number');
      const [p, o] = await Promise.all([ch(`/company/${n}`), ch(`/company/${n}/officers?items_per_page=50&register_type=directors`)]);
      if (!p) return reply({ ok: true, data: null });
      const directors = ((o && o.items) || []).filter((x: any) => !x.resigned_on && /director/.test(x.officer_role || ''))
        .map((x: any) => ({ name: person(x.name), role: x.officer_role === 'corporate-director' ? 'Corporate director' : 'Director', appointed: x.appointed_on || null }));
      return reply({ ok: true, data: {
        number: p.company_number, name: title(p.company_name), status: p.company_status, type: p.type,
        incorporated: p.date_of_creation || null, address: addr(p.registered_office_address), sic: p.sic_codes || [], directors,
      } });
    }
    const q = String(b.q || '').trim().slice(0, 100);
    if (q.length < 2) throw new Error('Enter at least 2 characters of the company name or number');
    const j = await ch(`/search/companies?${new URLSearchParams({ q, items_per_page: '10' })}`);
    const items = ((j && j.items) || []).map((x: any) => ({
      number: x.company_number, name: title(x.title), status: x.company_status, incorporated: x.date_of_creation || null, address: x.address_snippet || '',
    }));
    return reply({ ok: true, data: items });
  } catch (e) {
    return reply({ ok: false, error: String((e as Error).message || e) });
  }
});
