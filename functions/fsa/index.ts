// Safetybiz One — Supabase Edge Function "fsa".
// Looks up UK food hygiene ratings from the Food Standards Agency's free public API
// (https://api.ratings.food.gov.uk). Only signed-in users of the app can call it.
//   { action: "search", name, address }  -> up to 15 matching businesses
//   { action: "get", id }                -> one business by its FHRS id
const API = 'https://api.ratings.food.gov.uk';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const pick = (e: Record<string, any>) => ({
  id: e.FHRSID,
  name: e.BusinessName,
  type: e.BusinessType,
  address: [e.AddressLine1, e.AddressLine2, e.AddressLine3, e.AddressLine4].filter(Boolean).join(', '),
  postcode: e.PostCode || '',
  rating: String(e.RatingValue ?? ''),
  ratingDate: e.RatingDate ? String(e.RatingDate).slice(0, 10) : null,
  scheme: e.SchemeType,
  newRatingPending: String(e.NewRatingPending).toLowerCase() === 'true',
  authority: e.LocalAuthorityName,
  authorityEmail: e.LocalAuthorityEmailAddress,
  authorityWeb: e.LocalAuthorityWebSite,
  scores: e.scores || {},
});
const reply = (body: unknown) => new Response(JSON.stringify(body), { headers: { ...cors, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const b = await req.json();
    let url: string;
    if (b.action === 'get') {
      if (!/^\d{1,9}$/.test(String(b.id))) throw new Error('Invalid id');
      url = `${API}/Establishments/${b.id}`;
    } else {
      const name = String(b.name || '').trim().slice(0, 100), address = String(b.address || '').trim().slice(0, 100);
      if (!name && !address) throw new Error('Enter a business name or postcode');
      const q = new URLSearchParams({ name, address, pageSize: '15', pageNumber: '1' });
      url = `${API}/Establishments?${q}`;
    }
    const r = await fetch(url, { headers: { 'x-api-version': '2', accept: 'application/json' } });
    if (r.status === 404) return reply({ ok: true, data: b.action === 'get' ? null : [] });
    if (!r.ok) throw new Error(`The FSA service replied ${r.status}`);
    const j = await r.json();
    return reply({ ok: true, data: b.action === 'get' ? pick(j) : (j.establishments || []).map(pick) });
  } catch (e) {
    return reply({ ok: false, error: String((e as Error).message || e) });
  }
});
