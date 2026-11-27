// Compliance centre: certificates and service records per site. Shared by admins and client managers.
import { sb, D, $, esc, uid, today, addDays, fd, ft, toast, openModal, closeModal, confirmBox, rows, byId, ins, upd, fetchAll, ICON } from './core.js';

ICON.cert = '<path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13l2 2 4-4"/>';
const SOON = 30;
const MAX_MB = 20;
const S = { status: 'attention' };

// ---------- food hygiene rating (Food Standards Agency) ----------
const FHRS_LABEL = { 5: 'Very good', 4: 'Good', 3: 'Generally satisfactory', 2: 'Improvement necessary', 1: 'Major improvement necessary', 0: 'Urgent improvement necessary' };
const SC_HS = { 0: 'Very good', 5: 'Good', 10: 'Generally satisfactory', 15: 'Improvement necessary', 20: 'Major improvement necessary', 25: 'Urgent improvement necessary' };
const SC_CM = { 0: 'Very good', 5: 'Good', 10: 'Generally satisfactory', 20: 'Improvement necessary', 30: 'Major improvement necessary' };
const spaced = (t) => String(t || '').replace(/([a-z])([A-Z])/g, '$1 $2');
export function fhrsInfo(s) {
  const f = s && s.fhrs_id && s.fhrs; if (!f) return null;
  const r = String(f.rating || '');
  if (/^[0-5]$/.test(r)) return { big: r, label: `${r} · ${FHRS_LABEL[r]}`, cls: +r >= 4 ? 'ok' : +r === 3 ? 'warn' : 'bad', low: +r <= 2, f };
  if (/^pass/i.test(r)) return { big: 'Pass', label: spaced(r), cls: 'ok', low: false, f };
  if (/improvement/i.test(r)) return { big: '!', label: 'Improvement required', cls: 'bad', low: true, f };
  return { big: '–', label: spaced(r) || 'No rating yet', cls: '', low: false, f };
}
export const fhrsChip = (s) => { const i = fhrsInfo(s); return i ? `<span class="tag ${i.cls}">${esc(i.label)}</span>${i.f.newRatingPending ? ' <span class="tag">New rating pending</span>' : ''}` : '<span class="muted">Not linked</span>'; };
export const fhrsLow = (siteIds) => siteIds.map((id) => byId('sites', id)).filter((s) => fhrsInfo(s)?.low);
async function fsaCall(body) {
  const { data, error } = await sb.functions.invoke('fsa', { body });
  if (error || !data || !data.ok) throw new Error((data && data.error) || (error && error.message) || 'The food hygiene lookup failed');
  return data.data;
}
async function reloadHist(siteId) {
  const h = await fetchAll('site_fhrs_history', '*', (q) => q.eq('site_id', siteId)).catch(() => null);
  if (h) D.site_fhrs_history = rows('site_fhrs_history').filter((x) => x.site_id !== siteId).concat(h);
}
async function refreshFhrs(s, quiet) {
  try {
    const f = await fsaCall({ action: 'get', id: s.fhrs_id });
    if (!f) { if (!quiet) toast('The FSA no longer lists this business. Link the site again.', true); return; }
    await upd('sites', s.id, { fhrs: f, fhrs_checked_at: new Date().toISOString() });
    await reloadHist(s.id);
    if (!quiet) toast('Food hygiene rating updated');
  } catch (e) { if (!quiet) toast(e.message, true); }
}
const tried = new Set();
// Refresh ratings that were last checked more than a day ago (runs in the background, at most once per page load per site).
export function fhrsRefreshStale(sites, max = 20) {
  const day = Date.now() - 864e5;
  const due = sites.filter((s) => s && s.fhrs_id && !tried.has(s.id) && (!s.fhrs_checked_at || Date.parse(s.fhrs_checked_at) < day)).slice(0, max);
  if (!due.length) return;
  due.forEach((s) => tried.add(s.id));
  setTimeout(() => Promise.allSettled(due.map((s) => refreshFhrs(s, true))).then(() => window.__render()), 0);
}
const postcodeOf = (t) => (String(t || '').toUpperCase().match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/) || [''])[0];
let lastResults = {};
function fsaModal(sid) {
  const s = byId('sites', sid);
  openModal(`<h3>Find ${esc(s.name)} on the food hygiene register</h3><p class="muted" style="margin-top:-6px">Search the Food Standards Agency ratings by business name and postcode, then link the right one.</p>
  <div class="g2"><label>Business name<input id="fs-n" value="${esc(s.name)}"></label><label>Postcode or town<input id="fs-a" value="${esc(postcodeOf(s.address) || '')}"></label></div>
  <div class="row" style="margin-top:10px"><button class="btn pri" data-act="ccFsaSearch" data-s="${sid}">Search</button><span class="muted" id="fs-msg"></span></div>
  <div id="fs-res" style="margin-top:12px"></div>
  <div class="ft"><button class="btn" data-act="close">Close</button></div>`, true);
  const go = (e) => { if (e.key === 'Enter') { e.preventDefault(); document.querySelector('[data-act=ccFsaSearch]').click(); } };
  $('#fs-n').onkeydown = go; $('#fs-a').onkeydown = go;
}
async function fsaSearch(sid, btn) {
  const name = $('#fs-n').value.trim(), address = $('#fs-a').value.trim();
  if (!name && !address) return toast('Enter a business name or postcode', true);
  btn.disabled = true; $('#fs-msg').textContent = 'Searching the FSA register…';
  try {
    const list = await fsaCall({ action: 'search', name, address });
    lastResults = Object.fromEntries(list.map((r) => [String(r.id), r]));
    $('#fs-msg').textContent = list.length ? `${list.length} match${list.length > 1 ? 'es' : ''}` : '';
    $('#fs-res').innerHTML = list.length ? `<div class="pick">${list.map((r) => { const i = fhrsInfo({ fhrs_id: r.id, fhrs: r }); return `<div class="opt" style="align-items:center"><span style="flex:1"><b>${esc(r.name)}</b><br><span class="muted">${esc([r.address, r.postcode].filter(Boolean).join(', '))} · ${esc(r.type || '')}${r.ratingDate ? ' · inspected ' + fd(r.ratingDate) : ''}</span></span><span class="tag ${i.cls}">${esc(i.label)}</span><button class="btn sm pri" data-act="ccFsaLink" data-s="${sid}" data-id="${r.id}">Link</button></div>`; }).join('')}</div>`
      : '<p class="muted">No businesses found. Try just the postcode, or a shorter name.</p>';
  } catch (e) { $('#fs-msg').textContent = ''; toast(e.message, true); }
  btn.disabled = false;
}
function fhrsPanel(s) {
  const i = fhrsInfo(s), hist = rows('site_fhrs_history').filter((h) => h.site_id === s.id).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
  const head = `<div class="sect"><div><h3>Food hygiene rating</h3><p class="hint" style="margin-top:2px">Live from the Food Standards Agency${i && s.fhrs_checked_at ? ` · checked ${ft(s.fhrs_checked_at)}` : ''}</p></div>
  <div class="row">${i ? `<button class="btn sm" data-act="ccFsaRefresh" data-s="${s.id}">Refresh</button><button class="btn sm" data-act="ccFsaFind" data-s="${s.id}">Change</button><button class="btn sm ghost" data-act="ccFsaUnlink" data-s="${s.id}">Unlink</button>` : `<button class="btn sm pri" data-act="ccFsaFind" data-s="${s.id}">Find on the FSA register</button>`}</div></div>`;
  if (!i) return `<div class="panel" style="margin-bottom:16px">${head}<p class="muted" style="margin:0">Not linked yet. Link this site to its listing to show the current rating, inspection date and the inspector's scores. It updates automatically every day.</p></div>`;
  const f = i.f, sc = f.scores || {}, d = (map, v) => (v == null || v === '' ? '—' : map[+v] || '—');
  return `<div class="panel" style="margin-bottom:16px">${head}<div class="fhg">
  <div class="fhb ${i.cls}"><span>${esc(i.big)}</span><small>${esc(f.scheme === 'FHIS' ? 'FHIS' : 'Food hygiene')}</small></div>
  <div><b style="font-size:16px">${esc(i.label)}</b>${f.newRatingPending ? ' <span class="tag">New rating pending</span>' : ''}<br><span class="muted">Inspected ${fd(f.ratingDate)}</span>
  <p style="margin:8px 0 0"><b>${esc(f.name)}</b><br><span class="muted">${esc([f.address, f.postcode].filter(Boolean).join(', '))}</span><br><span class="muted">${esc(f.type || '')} · ${esc(f.authority || '')}</span></p>
  <p style="margin:8px 0 0"><a href="https://ratings.food.gov.uk/business/${encodeURIComponent(f.id)}" target="_blank" rel="noopener">View on the FSA website ↗</a></p></div>
  <div><table class="mini"><tbody><tr><td>Hygienic food handling</td><td><b>${d(SC_HS, sc.Hygiene)}</b></td></tr><tr><td>Cleanliness and condition of facilities and building</td><td><b>${d(SC_HS, sc.Structural)}</b></td></tr><tr><td>Management of food safety</td><td><b>${d(SC_CM, sc.ConfidenceInManagement)}</b></td></tr></tbody></table>
  ${hist.length > 1 ? `<h4 style="font-size:13px;margin:10px 0 4px">Rating history</h4>${hist.slice(0, 6).map((h) => `<div class="muted">${fd(h.rating_date)} · <b style="color:var(--ink)">${esc(spaced(h.rating))}</b></div>`).join('')}` : ''}</div></div></div>`;
}

export const docTypes = () => rows('compliance_doc_types').filter((t) => t.active).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
const history = (sid, tid) => rows('site_documents').filter((d) => d.site_id === sid && d.doc_type_id === tid).sort((a, b) => b.created_at.localeCompare(a.created_at));
const current = (sid, tid) => history(sid, tid)[0];
const addMonths = (d, m) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() + m); return x.toISOString().slice(0, 10); };
// Superadmin only (and not while viewing as a company): permanently delete a certificate, with a reason.
export const isSuper = () => !!(window.__me && window.__me.role === 'admin' && window.__me.is_super && !window.__viewAs);
function certDeleteModal(kind, id) {
  openModal(`<h3>Delete this certificate permanently?</h3><p>${kind === 'job' ? 'The issued certificate, its filed copy in the Compliance centre and the defects it raised are removed.' : 'This certificate record and its file are removed. The previous certificate (if any) becomes the current one again.'}</p>
  <p class="hint">Use this for test data or a certificate issued in error. The deletion and your reason are kept in the admin log.</p>
  <label>Reason (required)<textarea id="cd-r" style="min-height:60px" placeholder="e.g. Test certificate, issued to the wrong site"></textarea></label>
  <div class="ft"><button class="btn" data-act="close">Cancel</button><button class="btn dng" data-act="ccDelGo" data-kind="${kind}" data-id="${id}">Delete permanently</button></div>`);
}
async function certDelete(kind, id, btn) {
  const reason = ($('#cd-r')?.value || '').trim(); if (reason.length < 3) return toast('Give a reason', true);
  btn.disabled = true;
  const { data: paths, error } = await sb.rpc('delete_certificate', { kind, rid: id, reason });
  if (error) { btn.disabled = false; return toast(error.message, true); }
  if (paths && paths.length) await sb.storage.from('compliance').remove(paths).catch(() => {});
  if (kind === 'job') {
    const j = byId('service_jobs', id);
    D.actions = rows('actions').filter((x) => x.service_job_id !== id);
    if (j?.site_document_id) D.site_documents = rows('site_documents').filter((x) => x.id !== j.site_document_id);
    D.service_jobs = rows('service_jobs').filter((x) => x.id !== id);
    closeModal(); toast('Certificate deleted'); location.hash = '#/services';
  } else {
    D.site_documents = rows('site_documents').filter((x) => x.id !== id);
    closeModal(); toast('Certificate deleted'); window.__render();
  }
}
export function docStatus(d) {
  if (!d) return 'Missing';
  if (d.not_applicable) return 'Not applicable';
  if (!d.file_path && !d.issue_date) return 'Missing';
  if (d.expiry_date && d.expiry_date < today()) return 'Expired';
  if (d.expiry_date && d.expiry_date <= addDays(today(), SOON)) return 'Due soon';
  return 'Valid';
}
const TAG = { Valid: 'ok', 'Due soon': 'warn', Expired: 'bad', Missing: 'miss', 'Not applicable': '' };
const tag = (s) => `<span class="tag ${TAG[s]}">${esc(s)}</span>`;
export function siteCounts(sid) {
  const c = { Valid: 0, 'Due soon': 0, Expired: 0, Missing: 0, 'Not applicable': 0 };
  docTypes().forEach((t) => c[docStatus(current(sid, t.id))]++);
  return c;
}
export function ccTotals(siteIds) {
  const c = { Valid: 0, 'Due soon': 0, Expired: 0, Missing: 0, 'Not applicable': 0 };
  siteIds.forEach((sid) => { const s = siteCounts(sid); Object.keys(c).forEach((k) => (c[k] += s[k])); });
  return c;
}
export function ccAttention(siteIds, limit = 8) {
  const out = [];
  siteIds.forEach((sid) => docTypes().forEach((t) => { const d = current(sid, t.id), s = docStatus(d); if (s === 'Expired' || s === 'Due soon') out.push({ sid, t, d, s }); }));
  return out.sort((a, b) => (a.d.expiry_date || '').localeCompare(b.d.expiry_date || '')).slice(0, limit);
}

// ctx: { admin, clientName(id), clientFilter, base } — base is the route prefix, e.g. 'compliance'
export function ccView(route, ctx) {
  return route[1] ? ccSite(route[1], ctx) : ccOverview(ctx);
}
function siteLabel(s, ctx) { return ctx.admin ? `${ctx.clientName(s.client_id)} · ${s.name}` : s.name; }

function ccOverview(ctx) {
  const sites = rows('sites').filter((s) => (s.status || 'Open') !== 'Archived' && (!ctx.clientFilter || s.client_id === ctx.clientFilter))
    .sort((a, b) => (ctx.admin ? ctx.clientName(a.client_id).localeCompare(ctx.clientName(b.client_id)) : 0) || (b.is_head_office - a.is_head_office) || a.name.localeCompare(b.name));
  const ids = sites.map((s) => s.id), t = ccTotals(ids), att = ccAttention(ids, 12), low = fhrsLow(ids);
  fhrsRefreshStale(sites);
  const list = sites.filter((s) => { const c = siteCounts(s.id); return S.status === 'all' || c.Expired + c['Due soon'] + c.Missing > 0 || fhrsInfo(s)?.low; });
  const stat = (n, l, al) => `<div class="stat${al && n ? ' alert' : ''}"><span>${l}</span><b>${n}</b></div>`;
  return `<div class="page"><div class="sect"><div><h2>Compliance centre</h2><p class="hint">Certificates, surveys and service records for each site, with expiry dates. ${docTypes().length} document types are tracked per site.</p></div>
  ${ctx.admin ? '<button class="btn" data-act="ccTypes">Document types</button>' : ''}</div>
  <div class="stats">${stat(t.Valid, 'Valid')}${stat(t['Due soon'], `Due in ${SOON} days`, 1)}${stat(t.Expired, 'Expired', 1)}${stat(t.Missing, 'Missing', 1)}${stat(t['Not applicable'], 'Not applicable')}${stat(low.length, 'Food hygiene 2 or below', 1)}</div>
  ${low.length ? `<div class="panel" style="margin-bottom:16px"><h3 style="font-size:16px;margin-bottom:8px">Food hygiene ratings needing attention</h3>${low.map((s) => `<a class="li" href="#/${ctx.base}/${s.id}">${fhrsChip(s)}<span><b>${esc(siteLabel(s, ctx))}</b><br><span class="muted">Inspected ${fd(s.fhrs.ratingDate)} · ${esc(s.fhrs.authority || '')}</span></span></a>`).join('')}</div>` : ''}
  ${att.length ? `<div class="panel" style="margin-bottom:16px"><h3 style="font-size:16px;margin-bottom:8px">Expired and due soon</h3>${att.map(({ sid, t: ty, d, s }) => { const site = byId('sites', sid); return `<a class="li" href="#/${ctx.base}/${sid}">${tag(s)}<span><b>${esc(ty.name)}</b><br><span class="muted">${esc(siteLabel(site, ctx))} · ${s === 'Expired' ? 'expired' : 'expires'} ${fd(d.expiry_date)}</span></span></a>`; }).join('')}</div>` : ''}
  <div class="row" style="margin-bottom:10px">${ctx.admin ? `<select id="cc-client" data-ui="ccClient" style="width:auto"><option value="">All clients</option>${rows('clients').map((c) => `<option value="${c.id}"${ctx.clientFilter === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>` : ''}
  <div class="seg"><button class="${S.status === 'attention' ? 'on' : ''}" data-act="ccFilter" data-v="attention">Needs attention</button><button class="${S.status === 'all' ? 'on' : ''}" data-act="ccFilter" data-v="all">All sites</button></div></div>
  ${list.length ? `<div class="tw"><table class="stack"><thead><tr><th>Site</th><th>Food hygiene</th><th>Valid</th><th>Due soon</th><th>Expired</th><th>Missing</th><th>Progress</th></tr></thead><tbody>${list.map((s) => { const c = siteCounts(s.id), need = docTypes().length - c['Not applicable'], pc = need ? Math.round((c.Valid + c['Due soon']) / need * 100) : 100;
    return `<tr class="click" data-go="${ctx.base}/${s.id}"><td data-l="Site"><b>${esc(s.name)}</b>${ctx.admin ? `<br><span class="muted">${esc(ctx.clientName(s.client_id))}</span>` : ''}</td><td data-l="Food hygiene">${fhrsChip(s)}</td><td data-l="Valid">${c.Valid}</td><td data-l="Due soon">${c['Due soon'] ? `<span class="tag warn">${c['Due soon']}</span>` : 0}</td><td data-l="Expired">${c.Expired ? `<span class="tag bad">${c.Expired}</span>` : 0}</td><td data-l="Missing">${c.Missing ? `<span class="tag miss">${c.Missing}</span>` : 0}</td><td data-l="Progress"><div class="row" style="flex-wrap:nowrap"><div class="prog" style="flex:1"><i style="width:${pc}%"></i></div><span class="muted">${pc}%</span></div></td></tr>`; }).join('')}</tbody></table></div>`
    : `<div class="empty"><h3>${sites.length ? 'Every site is up to date' : 'No sites yet'}</h3><p class="muted">${sites.length ? 'Nothing expired, due soon or missing. Choose “All sites” to see everything.' : 'Sites appear here once a client is onboarded.'}</p></div>`}</div>`;
}

function ccSite(sid, ctx) {
  const s = byId('sites', sid); if (!s) return `<div class="page"><div class="empty"><h3>Site not found</h3></div></div>`;
  const c = siteCounts(sid);
  fhrsRefreshStale([s], 1);
  return `<div class="page"><a class="btn sm ghost" href="#/${ctx.base}">← Compliance centre</a>
  <div class="sect" style="margin-top:8px"><div><h2>${esc(s.name)}</h2><p class="hint">${ctx.admin ? esc(ctx.clientName(s.client_id)) + ' · ' : ''}${esc(s.address || 'No address recorded')}</p></div>
  <div class="row">${(s.status || 'Open') !== 'Open' ? `<span class="tag ${s.status === 'Archived' ? 'bad' : 'warn'}">${esc(s.status)}</span>` : ''}${tag('Valid')} ${c.Valid} ${tag('Due soon')} ${c['Due soon']} ${tag('Expired')} ${c.Expired} ${tag('Missing')} ${c.Missing}${ctx.siteDetails ? `<a class="btn sm" href="#/site/${sid}">Site details</a>` : ''}${ctx.admin ? `<button class="btn sm pri" data-act="svNew" data-s="${sid}">+ Service job</button>` : ''}</div></div>
  ${defectsPanel(sid)}
  ${fhrsPanel(s)}
  <h3 style="font-size:16px;margin:6px 0 10px">Certificates and service records</h3>
  <div class="tw"><table class="stack"><thead><tr><th>Document</th><th>Status</th><th>Issued</th><th>Expires</th><th>Provider / reference</th><th>File</th><th></th></tr></thead><tbody>${docTypes().map((t) => {
    const d = current(sid, t.id), st = docStatus(d), h = history(sid, t.id).filter((x) => x.file_path).length, live = d && !d.not_applicable && (d.file_path || d.issue_date);
    return `<tr><td data-l="Document"><b>${esc(t.name)}</b><br><span class="muted">${esc(t.category)}${t.validity_months ? ` · every ${t.validity_months >= 12 && t.validity_months % 12 === 0 ? (t.validity_months / 12) + (t.validity_months === 12 ? ' year' : ' years') : t.validity_months + ' months'}` : ''}</span></td>
    <td data-l="Status">${tag(st)}</td><td data-l="Issued">${live ? fd(d.issue_date) : '—'}</td><td data-l="Expires" class="${st === 'Expired' ? 'od-t' : ''}">${live ? fd(d.expiry_date) : '—'}</td>
    <td data-l="Provider">${live ? esc([d.provider, d.reference].filter(Boolean).join(' · ') || '—') : '—'}</td>
    <td data-l="File">${live && d.file_path ? `<button class="btn sm" data-act="ccOpen" data-id="${d.id}">View</button>` : '—'}${h > 1 ? ` <button class="btn sm ghost" data-act="ccHist" data-s="${sid}" data-t="${t.id}">History (${h})</button>` : ''}</td>
    <td><div class="row" style="flex-wrap:nowrap"><button class="btn sm ${st === 'Valid' || st === 'Not applicable' ? '' : 'pri'}" data-act="ccUpload" data-s="${sid}" data-t="${t.id}">${live ? 'Update' : 'Upload'}</button><button class="btn sm ghost" data-act="ccNA" data-s="${sid}" data-t="${t.id}">${st === 'Not applicable' ? 'Applies' : 'N/A'}</button>${ctx.admin && isSuper() && live ? `<button class="btn sm ghost dng" data-act="ccDel" data-kind="document" data-id="${d.id}" aria-label="Delete certificate">Delete</button>` : ''}</div></td></tr>`;
  }).join('')}</tbody></table></div>
  <p class="hint">Upload a PDF or photo of each certificate (up to ${MAX_MB} MB). The expiry date fills in from the document type's usual validity — change it if the certificate says otherwise. Earlier certificates are kept in the history.</p></div>`;
}

// Open defects found on Safetybiz service visits for this site (fire alarm, emergency lighting, extinguishers, PAT, fire risk assessment).
function defectsPanel(sid) {
  const list = rows('actions').filter((x) => x.site_id === sid && x.service_job_id && x.status !== 'Done').sort((a, b) => String(a.due_date || '9').localeCompare(String(b.due_date || '9')));
  if (!list.length) return '';
  const od = (x) => x.due_date && x.due_date < today();
  return `<div class="panel" style="margin-bottom:16px;border-left:4px solid var(--vh)"><h3 style="font-size:16px;margin-bottom:6px">Defects from service visits (${list.length})</h3>${list.map((x) => { const j = byId('service_jobs', x.service_job_id);
    const sv = x.severity || x.priority, hi = ['High', 'Substantial', 'Intolerable', 'Urgent'].includes(sv), mid = ['Medium', 'Moderate'].includes(sv);
    return `<div class="li"><span class="tag ${hi ? 'bad' : mid ? 'warn' : ''}">${esc(sv)}</span><span style="flex:1"><b>${esc(x.title)}</b><br><span class="muted">${j ? (window.__me ? `<a href="#/service/${j.id}">${esc(j.cert_no)}</a> · ` : `${esc(j.cert_no)} · `) : ''}${od(x) ? '<b style="color:var(--vh)">overdue</b> · ' : ''}due ${fd(x.due_date)}${x.status === 'In progress' ? ' · in progress' : ''}</span></span><button class="btn sm" data-act="ccDefDone" data-id="${x.id}">Mark done</button></div>`; }).join('')}</div>`;
}
function uploadModal(sid, tid) {
  const s = byId('sites', sid), t = byId('compliance_doc_types', tid), prev = current(sid, tid);
  openModal(`<h3>${esc(t.name)}</h3><p class="muted" style="margin-top:-6px">${esc(s.name)}</p>
  <div class="g2"><label class="full">Certificate file (PDF or photo)<input id="cu-file" type="file" accept="application/pdf,image/*"></label>
  <label>Issue / inspection date<input id="cu-issue" type="date" value="${today()}"></label><label>Expiry / next due date<input id="cu-exp" type="date" value="${t.validity_months ? addMonths(today(), t.validity_months) : ''}"></label>
  <label>Provider / contractor<input id="cu-prov" value="${esc(prev && !prev.not_applicable ? prev.provider || '' : '')}"></label><label>Certificate reference<input id="cu-ref"></label>
  <label class="full">Notes<textarea id="cu-notes" style="min-height:60px" placeholder="e.g. remedial works required, C2 observations"></textarea></label></div>
  <div class="ft"><button class="btn" data-act="close">Cancel</button><button class="btn pri" data-act="ccSave" data-s="${sid}" data-t="${tid}">Upload certificate</button></div>`);
  $('#cu-issue').onchange = (e) => { if (t.validity_months && e.target.value) $('#cu-exp').value = addMonths(e.target.value, t.validity_months); };
}
async function uploadSave(sid, tid, btn) {
  const f = $('#cu-file').files[0], s = byId('sites', sid);
  if (!f) return toast('Choose the certificate file', true);
  if (f.size > MAX_MB * 1024 * 1024) return toast(`That file is over ${MAX_MB} MB`, true);
  const issue = $('#cu-issue').value || null, exp = $('#cu-exp').value || null;
  if (issue && exp && exp < issue) return toast('The expiry date is before the issue date', true);
  btn.disabled = true; btn.textContent = 'Uploading…';
  const safe = f.name.replace(/[^\w.\-]+/g, '_').slice(-80), path = `${s.client_id}/${sid}/${uid()}-${safe}`;
  const { error } = await sb.storage.from('compliance').upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false });
  if (error) { btn.disabled = false; btn.textContent = 'Upload certificate'; return toast('Upload failed: ' + error.message, true); }
  const row = { site_id: sid, client_id: s.client_id, doc_type_id: tid, not_applicable: false, issue_date: issue, expiry_date: exp,
    provider: $('#cu-prov').value.trim() || null, reference: $('#cu-ref').value.trim() || null, notes: $('#cu-notes').value.trim() || null, file_path: path, file_name: f.name, file_size: f.size };
  closeModal();
  await ins('site_documents', row).catch(() => {});
  toast('Certificate uploaded'); window.__render();
}
async function openFile(d) {
  const w = window.open('', '_blank');
  const { data, error } = await sb.storage.from('compliance').createSignedUrl(d.file_path, 300);
  if (error) { if (w) w.close(); return toast('Could not open the file: ' + error.message, true); }
  if (w) w.location = data.signedUrl; else location.href = data.signedUrl;
}
function histModal(sid, tid) {
  const t = byId('compliance_doc_types', tid), list = history(sid, tid).filter((d) => d.file_path);
  openModal(`<h3>${esc(t.name)} — history</h3><div class="tw"><table><thead><tr><th>Issued</th><th>Expires</th><th>Provider</th><th>Uploaded</th><th>File</th></tr></thead><tbody>${list.map((d) => `<tr><td>${fd(d.issue_date)}</td><td>${fd(d.expiry_date)}</td><td>${esc(d.provider || '—')}</td><td>${ft(d.created_at)}</td><td><button class="btn sm" data-act="ccOpen" data-id="${d.id}">View</button></td></tr>`).join('')}</tbody></table></div>
  <div class="ft"><button class="btn" data-act="close">Close</button></div>`, true);
}
function typesModal() {
  const all = [...rows('compliance_doc_types')].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  openModal(`<h3>Document types</h3><p class="muted" style="margin-top:-6px">These are tracked for every site. Validity sets the default expiry date. Untick to stop tracking a type.</p>
  <div class="tw"><table><thead><tr><th>Document</th><th>Category</th><th>Validity (months)</th><th>Tracked</th></tr></thead><tbody>${all.map((t) => `<tr><td><input id="ct-${t.id}-n" data-b="compliance_doc_types|${t.id}|name" value="${esc(t.name)}" aria-label="Name"></td><td><input id="ct-${t.id}-c" data-b="compliance_doc_types|${t.id}|category" value="${esc(t.category)}" aria-label="Category" style="width:120px"></td><td><input id="ct-${t.id}-v" type="number" min="1" max="120" data-b="compliance_doc_types|${t.id}|validity_months" value="${t.validity_months ?? ''}" aria-label="Validity" style="width:90px"></td><td><input type="checkbox" data-b="compliance_doc_types|${t.id}|active"${t.active ? ' checked' : ''} aria-label="Tracked"></td></tr>`).join('')}</tbody></table></div>
  <div class="row" style="margin-top:12px"><input id="ct-new" placeholder="Add a document type, e.g. Pressure system examination" style="max-width:420px"><button class="btn" data-act="ccTypeAdd">Add</button></div>
  <div class="ft"><button class="btn pri" data-act="ccTypesDone">Done</button></div>`, true);
}

// Returns true if it handled the click.
export async function ccClick(d, btn) {
  switch (d.act) {
    case 'ccFilter': S.status = d.v; window.__render(); return true;
    case 'ccDefDone': if (await confirmBox('Mark this defect as fixed?', 'Mark done')) { await upd('actions', d.id, { status: 'Done', completed_on: today() }).catch(() => {}); toast('Defect marked as done'); window.__render(); } return true;
    case 'ccFsaFind': fsaModal(d.s); return true;
    case 'ccFsaSearch': await fsaSearch(d.s, btn); return true;
    case 'ccFsaLink': { const r = lastResults[d.id]; if (!r) return true; closeModal();
      await upd('sites', d.s, { fhrs_id: +r.id, fhrs: r, fhrs_checked_at: new Date().toISOString() }).catch(() => {}); await reloadHist(d.s); toast('Linked to the FSA listing'); window.__render(); return true; }
    case 'ccFsaRefresh': { btn.disabled = true; await refreshFhrs(byId('sites', d.s)); window.__render(); return true; }
    case 'ccFsaUnlink': if (await confirmBox('Unlink this site from its food hygiene listing? The rating history is kept.', 'Unlink')) { await upd('sites', d.s, { fhrs_id: null, fhrs: null, fhrs_checked_at: null }).catch(() => {}); window.__render(); } return true;
    case 'ccUpload': uploadModal(d.s, d.t); return true;
    case 'ccSave': await uploadSave(d.s, d.t, btn); return true;
    case 'ccOpen': { const doc = byId('site_documents', d.id); if (doc) await openFile(doc); return true; }
    case 'ccHist': histModal(d.s, d.t); return true;
    case 'ccDel': if (!isSuper()) return true; certDeleteModal(d.kind, d.id); return true;
    case 'ccDelGo': await certDelete(d.kind, d.id, btn); return true;
    case 'ccNA': { const isNA = docStatus(current(d.s, d.t)) === 'Not applicable'; const s = byId('sites', d.s);
      await ins('site_documents', { site_id: d.s, client_id: s.client_id, doc_type_id: d.t, not_applicable: !isNA }).catch(() => {}); window.__render(); return true; }
    case 'ccTypes': typesModal(); return true;
    case 'ccTypesDone': closeModal(); window.__render(); return true;
    case 'ccTypeAdd': { const n = $('#ct-new').value.trim(); if (!n) return true; await ins('compliance_doc_types', { name: n, category: 'General', sort: 999, active: true }).catch(() => {}); typesModal(); return true; }
  }
  return false;
}
