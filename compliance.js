// Compliance centre: certificates and service records per site. Shared by admins and client managers.
import { sb, $, esc, uid, today, addDays, fd, ft, toast, openModal, closeModal, rows, byId, ins, ICON } from './core.js';

ICON.cert = '<path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13l2 2 4-4"/>';
const SOON = 30;
const MAX_MB = 20;
const S = { status: 'attention' };

export const docTypes = () => rows('compliance_doc_types').filter((t) => t.active).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
const history = (sid, tid) => rows('site_documents').filter((d) => d.site_id === sid && d.doc_type_id === tid).sort((a, b) => b.created_at.localeCompare(a.created_at));
const current = (sid, tid) => history(sid, tid)[0];
const addMonths = (d, m) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() + m); return x.toISOString().slice(0, 10); };
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
  const sites = rows('sites').filter((s) => !ctx.clientFilter || s.client_id === ctx.clientFilter)
    .sort((a, b) => (ctx.admin ? ctx.clientName(a.client_id).localeCompare(ctx.clientName(b.client_id)) : 0) || (b.is_head_office - a.is_head_office) || a.name.localeCompare(b.name));
  const ids = sites.map((s) => s.id), t = ccTotals(ids), att = ccAttention(ids, 12);
  const list = sites.filter((s) => { const c = siteCounts(s.id); return S.status === 'all' || c.Expired + c['Due soon'] + c.Missing > 0; });
  const stat = (n, l, al) => `<div class="stat${al && n ? ' alert' : ''}"><span>${l}</span><b>${n}</b></div>`;
  return `<div class="page"><div class="sect"><div><h2>Compliance centre</h2><p class="hint">Certificates, surveys and service records for each site, with expiry dates. ${docTypes().length} document types are tracked per site.</p></div>
  ${ctx.admin ? '<button class="btn" data-act="ccTypes">Document types</button>' : ''}</div>
  <div class="stats">${stat(t.Valid, 'Valid')}${stat(t['Due soon'], `Due in ${SOON} days`, 1)}${stat(t.Expired, 'Expired', 1)}${stat(t.Missing, 'Missing', 1)}${stat(t['Not applicable'], 'Not applicable')}</div>
  ${att.length ? `<div class="panel" style="margin-bottom:16px"><h3 style="font-size:16px;margin-bottom:8px">Expired and due soon</h3>${att.map(({ sid, t: ty, d, s }) => { const site = byId('sites', sid); return `<a class="li" href="#/${ctx.base}/${sid}">${tag(s)}<span><b>${esc(ty.name)}</b><br><span class="muted">${esc(siteLabel(site, ctx))} · ${s === 'Expired' ? 'expired' : 'expires'} ${fd(d.expiry_date)}</span></span></a>`; }).join('')}</div>` : ''}
  <div class="row" style="margin-bottom:10px">${ctx.admin ? `<select id="cc-client" data-ui="ccClient" style="width:auto"><option value="">All clients</option>${rows('clients').map((c) => `<option value="${c.id}"${ctx.clientFilter === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>` : ''}
  <div class="seg"><button class="${S.status === 'attention' ? 'on' : ''}" data-act="ccFilter" data-v="attention">Needs attention</button><button class="${S.status === 'all' ? 'on' : ''}" data-act="ccFilter" data-v="all">All sites</button></div></div>
  ${list.length ? `<div class="tw"><table class="stack"><thead><tr><th>Site</th><th>Valid</th><th>Due soon</th><th>Expired</th><th>Missing</th><th>Progress</th></tr></thead><tbody>${list.map((s) => { const c = siteCounts(s.id), need = docTypes().length - c['Not applicable'], pc = need ? Math.round((c.Valid + c['Due soon']) / need * 100) : 100;
    return `<tr class="click" data-go="${ctx.base}/${s.id}"><td data-l="Site"><b>${esc(s.name)}</b>${ctx.admin ? `<br><span class="muted">${esc(ctx.clientName(s.client_id))}</span>` : ''}</td><td data-l="Valid">${c.Valid}</td><td data-l="Due soon">${c['Due soon'] ? `<span class="tag warn">${c['Due soon']}</span>` : 0}</td><td data-l="Expired">${c.Expired ? `<span class="tag bad">${c.Expired}</span>` : 0}</td><td data-l="Missing">${c.Missing ? `<span class="tag miss">${c.Missing}</span>` : 0}</td><td data-l="Progress"><div class="row" style="flex-wrap:nowrap"><div class="prog" style="flex:1"><i style="width:${pc}%"></i></div><span class="muted">${pc}%</span></div></td></tr>`; }).join('')}</tbody></table></div>`
    : `<div class="empty"><h3>${sites.length ? 'Every site is up to date' : 'No sites yet'}</h3><p class="muted">${sites.length ? 'Nothing expired, due soon or missing. Choose “All sites” to see everything.' : 'Sites appear here once a client is onboarded.'}</p></div>`}</div>`;
}

function ccSite(sid, ctx) {
  const s = byId('sites', sid); if (!s) return `<div class="page"><div class="empty"><h3>Site not found</h3></div></div>`;
  const c = siteCounts(sid);
  return `<div class="page"><a class="btn sm ghost" href="#/${ctx.base}">← Compliance centre</a>
  <div class="sect" style="margin-top:8px"><div><h2>${esc(s.name)}</h2><p class="hint">${ctx.admin ? esc(ctx.clientName(s.client_id)) + ' · ' : ''}${esc(s.address || 'No address recorded')}</p></div>
  <div class="row">${tag('Valid')} ${c.Valid} ${tag('Due soon')} ${c['Due soon']} ${tag('Expired')} ${c.Expired} ${tag('Missing')} ${c.Missing}</div></div>
  <div class="tw"><table class="stack"><thead><tr><th>Document</th><th>Status</th><th>Issued</th><th>Expires</th><th>Provider / reference</th><th>File</th><th></th></tr></thead><tbody>${docTypes().map((t) => {
    const d = current(sid, t.id), st = docStatus(d), h = history(sid, t.id).filter((x) => x.file_path).length, live = d && !d.not_applicable && (d.file_path || d.issue_date);
    return `<tr><td data-l="Document"><b>${esc(t.name)}</b><br><span class="muted">${esc(t.category)}${t.validity_months ? ` · every ${t.validity_months >= 12 && t.validity_months % 12 === 0 ? (t.validity_months / 12) + (t.validity_months === 12 ? ' year' : ' years') : t.validity_months + ' months'}` : ''}</span></td>
    <td data-l="Status">${tag(st)}</td><td data-l="Issued">${live ? fd(d.issue_date) : '—'}</td><td data-l="Expires" class="${st === 'Expired' ? 'od-t' : ''}">${live ? fd(d.expiry_date) : '—'}</td>
    <td data-l="Provider">${live ? esc([d.provider, d.reference].filter(Boolean).join(' · ') || '—') : '—'}</td>
    <td data-l="File">${live && d.file_path ? `<button class="btn sm" data-act="ccOpen" data-id="${d.id}">View</button>` : '—'}${h > 1 ? ` <button class="btn sm ghost" data-act="ccHist" data-s="${sid}" data-t="${t.id}">History (${h})</button>` : ''}</td>
    <td><div class="row" style="flex-wrap:nowrap"><button class="btn sm ${st === 'Valid' || st === 'Not applicable' ? '' : 'pri'}" data-act="ccUpload" data-s="${sid}" data-t="${t.id}">${live ? 'Update' : 'Upload'}</button><button class="btn sm ghost" data-act="ccNA" data-s="${sid}" data-t="${t.id}">${st === 'Not applicable' ? 'Applies' : 'N/A'}</button></div></td></tr>`;
  }).join('')}</tbody></table></div>
  <p class="hint">Upload a PDF or photo of each certificate (up to ${MAX_MB} MB). The expiry date fills in from the document type's usual validity — change it if the certificate says otherwise. Earlier certificates are kept in the history.</p></div>`;
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
    case 'ccUpload': uploadModal(d.s, d.t); return true;
    case 'ccSave': await uploadSave(d.s, d.t, btn); return true;
    case 'ccOpen': { const doc = byId('site_documents', d.id); if (doc) await openFile(doc); return true; }
    case 'ccHist': histModal(d.s, d.t); return true;
    case 'ccNA': { const isNA = docStatus(current(d.s, d.t)) === 'Not applicable'; const s = byId('sites', d.s);
      await ins('site_documents', { site_id: d.s, client_id: s.client_id, doc_type_id: d.t, not_applicable: !isNA }).catch(() => {}); window.__render(); return true; }
    case 'ccTypes': typesModal(); return true;
    case 'ccTypesDone': closeModal(); window.__render(); return true;
    case 'ccTypeAdd': { const n = $('#ct-new').value.trim(); if (!n) return true; await ins('compliance_doc_types', { name: n, category: 'General', sort: 999, active: true }).catch(() => {}); typesModal(); return true; }
  }
  return false;
}
