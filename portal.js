// Safetybiz One client portal: client managers and staff.
import {
  sb, D, $, esc, uid, today, fd, ft, chip, scoreOf, isOd, ratingCard, toast, openModal, closeModal, confirmBox,
  fetchAll, rows, byId, ins, upd, del, niceError, shell, signFormHTML, mountPad, submitSignOff,
} from './core.js';
import { assessmentPDF, signOffsPDF, ctlScore, pct } from './pdf.js';
import { ccView, ccClick, fhrsChip, siteCounts } from './compliance.js';

const S = { me: null, sigs: {}, f: {}, viewed: {} };
let route = [];
// Managers here are regional / area managers (company administrators use the builder). The database limits them to their own sites.
const isMgr = () => S.me.role === 'client_admin' || S.me.role === 'manager';
const MGR_TITLE = { brand: 'Brand manager', region: 'Regional manager', area: 'Area manager' };
const myUnit = () => byId('org_units', S.me.unit_id);

export async function loadPortal(me) {
  S.me = me;
  const ackCols = 'id,assessment_id,version,user_id,email,full_name,job_title,method,site_id,statement,acknowledged_at';
  const tasks = [fetchAll('clients'), fetchAll('sites'), fetchAll('published_assessments'), fetchAll('actions'), fetchAll('acknowledgements', ackCols)];
  if (isMgr()) tasks.push(fetchAll('portal_invites'), fetchAll('profiles'), fetchAll('compliance_doc_types'), fetchAll('site_documents'), fetchAll('org_units'), fetchAll('site_fhrs_history'));
  const [clients, sites, pubs, actions, acks, invites = [], profiles = [], cdt = [], sdocs = [], units = [], fhist = []] = await Promise.all(tasks);
  Object.assign(D, { clients, sites, published_assessments: pubs, actions, acknowledgements: acks, portal_invites: invites, profiles, compliance_doc_types: cdt, site_documents: sdocs, org_units: units, site_fhrs_history: fhist });
}

// latest published version of each assessment
function latest() {
  const m = {};
  for (const p of rows('published_assessments')) if (!m[p.assessment_id] || m[p.assessment_id].version < p.version) m[p.assessment_id] = p;
  return Object.values(m).map((p) => ({ ...p.snapshot.assessment, id: p.assessment_id, version: p.version, published_at: p.published_at, note: p.note, snap: p.snapshot }))
    .filter((a) => a.status !== 'Archived').sort((a, b) => (a.title || '').localeCompare(b.title || ''));
}
const sName = (id) => byId('sites', id)?.name || '';
const company = () => rows('clients')[0]?.name || '';
const mySigned = (a) => rows('acknowledgements').find((k) => k.assessment_id === a.id && k.version === a.version && k.method === 'Own account' && k.user_id === S.me.id);
const audience = (a) => rows('portal_invites').filter((i) => i.role === 'client_admin' || !i.site_id || i.site_id === a.site_id);
const signedUsers = (a) => new Set(rows('acknowledgements').filter((k) => k.assessment_id === a.id && k.version === a.version && k.method === 'Own account').map((k) => k.user_id));
const profByEmail = (e) => rows('profiles').find((p) => p.email === e);

export function portalView(r) {
  route = r;
  const L = latest(), todo = L.filter((a) => !mySigned(a)).length;
  const nav = [{ k: 'home', href: '', icon: 'ra', label: isMgr() ? 'Risk assessments' : 'My risk assessments', c: todo || '' }];
  const openActs = rows('actions').filter((x) => x.status !== 'Done').length;
  if (isMgr()) nav.push({ k: 'actions', href: 'actions', icon: 'acts', label: 'Actions', c: openActs || '' }, { k: 'compliance', href: 'compliance', icon: 'cert', label: 'Compliance centre' }, { k: 'records', href: 'records', icon: 'sign', label: 'Sign-off records' }, { k: 'staff', href: 'staff', icon: 'staff', label: 'Staff' });
  let active = 'home', title = isMgr() ? 'Risk assessments' : 'My risk assessments', body;
  if (r[0] === 'a') { title = 'Risk assessment'; body = vAssessment(r[1]); }
  else if (r[0] === 'actions' && isMgr()) { active = 'actions'; title = 'Actions'; body = vActions(); }
  else if (r[0] === 'records' && isMgr()) { active = 'records'; title = 'Sign-off records'; body = vRecords(); }
  else if (r[0] === 'staff' && isMgr()) { active = 'staff'; title = 'Staff'; body = vStaff(); }
  else if (r[0] === 'compliance' && isMgr()) { active = 'compliance'; title = 'Compliance centre'; body = ccView(r, { admin: false, base: 'compliance' }); }
  else body = vHome(L);
  return shell({ nav, active, title, body, me: { group: company().toUpperCase(), name: S.me.full_name || S.me.email, sub: S.me.role === 'manager' ? (myUnit() ? `${MGR_TITLE[myUnit().kind]} · ${myUnit().name}` : 'Manager') : isMgr() ? 'Manager' : (S.me.job_title || 'Staff') } });
}

function vHome(L) {
  const first = (S.me.full_name || '').split(' ')[0];
  if (!L.length) return `<div class="page"><h2 style="margin-bottom:6px">Hello${first ? ', ' + esc(first) : ''}</h2><div class="empty"><h3>No risk assessments yet</h3><p class="muted">When Safetybiz publishes a risk assessment for ${isMgr() ? 'your company' : 'your site'}, it will appear here for you to read and sign.</p></div></div>`;
  const todo = L.filter((a) => !mySigned(a));
  let stats = '';
  if (isMgr()) {
    const outstanding = L.reduce((n, a) => n + audience(a).filter((i) => { const p = profByEmail(i.email); return !p || !signedUsers(a).has(p.id); }).length, 0);
    const open = rows('actions').filter((x) => x.status !== 'Done'), od = open.filter(isOd);
    stats = `<div class="stats"><div class="stat"><span>Risk assessments</span><b>${L.length}</b></div><div class="stat"><span>Sites</span><b>${rows('sites').length}</b></div><div class="stat${outstanding ? ' alert' : ''}"><span>Sign-offs outstanding</span><b>${outstanding}</b></div><div class="stat"><span>Open actions</span><b>${open.length}</b></div><div class="stat${od.length ? ' alert' : ''}"><span>Overdue actions</span><b>${od.length}</b></div></div>`;
  }
  const bySite = {}; L.forEach((a) => (bySite[a.site_id] ||= []).push(a));
  const mine = (S.me.full_name || '').trim().toLowerCase(), myActs = mine.length > 2 ? rows('actions').filter((x) => x.status !== 'Done' && (x.owner || '').toLowerCase().includes(mine)) : [];
  const nTodo = todo.length + myActs.length;
  const todoBlock = `<div class="panel" style="margin-bottom:16px"><h3 style="font-size:17px;margin-bottom:10px">${nTodo ? `What you need to do <span class="muted" style="font-weight:500">(${nTodo})</span>` : 'What you need to do'}</h3>
    ${todo.map((a) => `<a class="todo" href="#/a/${a.id}"><span class="n">✍</span><span style="flex:1"><b>Read and sign: ${esc(a.title || 'Untitled')}</b><br><span class="muted">${esc(sName(a.site_id))} · version ${a.version}${mySigned({ ...a, version: a.version - 1 }) ? ' · updated since you last signed' : ''}</span></span><span class="btn sm pri">Open</span></a>`).join('')}
    ${myActs.map((x) => { const a = L.find((y) => y.id === x.assessment_id); return `<a class="todo" href="#/a/${x.assessment_id}"><span class="n">!</span><span style="flex:1"><b>${esc(x.title)}</b><br><span class="muted">Action for you${a ? ' · ' + esc(a.title) : ''} · due ${fd(x.due_date)}${isOd(x) ? ' · <b style="color:var(--vh)">overdue</b>' : ''}</span></span></a>`; }).join('')}
    ${nTodo ? '' : '<div class="todo done"><span class="n" style="background:var(--soft);color:#1f7d6d">✓</span><span><b>You\'re all up to date</b><br><span class="muted">Nothing to sign and no actions waiting for you.</span></span></div>'}</div>`;
  const siteBlock = isMgr() ? `<div class="panel" style="margin-bottom:16px"><div class="sect" style="margin-bottom:8px"><h3>Your sites</h3><a class="btn sm" href="#/compliance">Compliance centre</a></div><div class="tw"><table class="stack"><thead><tr><th>Site</th><th>Food hygiene</th><th>Certificates</th><th>Open actions</th></tr></thead><tbody>${rows('sites').map((st) => { const c = siteCounts(st.id), oa = rows('actions').filter((x) => x.status !== 'Done' && L.find((a) => a.id === x.assessment_id && a.site_id === st.id)).length;
    return `<tr class="click" data-go="compliance/${st.id}"><td data-l="Site"><b>${esc(st.name)}</b></td><td data-l="Food hygiene">${fhrsChip(st)}</td><td data-l="Certificates">${c.Expired ? `<span class="tag bad">${c.Expired} expired</span> ` : ''}${c['Due soon'] ? `<span class="tag warn">${c['Due soon']} due soon</span> ` : ''}${c.Missing ? `<span class="tag miss">${c.Missing} missing</span>` : ''}${!c.Expired && !c['Due soon'] && !c.Missing ? '<span class="tag ok">Up to date</span>' : ''}</td><td data-l="Open actions">${oa}</td></tr>`; }).join('')}</tbody></table></div></div>`
    : (() => { const st = byId('sites', S.me.site_id); return st && st.fhrs_id ? `<div class="panel" style="margin-bottom:16px"><span class="muted">Your site</span><br><b>${esc(st.name)}</b> · food hygiene rating ${fhrsChip(st)}</div>` : ''; })();
  return `<div class="page"><div class="sect"><div><h2>Hello${first ? ', ' + esc(first) : ''}</h2><p class="muted" style="margin:4px 0 0">${isMgr() ? `You look after ${rows('sites').length} site${rows('sites').length === 1 ? '' : 's'}.` : nTodo ? 'Here is what needs doing.' : 'You\'re up to date.'}</p></div></div>${stats}${isMgr() ? siteBlock + (todo.length ? todoBlock : '') : todoBlock + siteBlock}
  <h3 style="font-size:16px;margin:18px 0 4px">All risk assessments</h3>
  ${Object.keys(bySite).map((sid) => `<h3 style="font-size:16px;margin:18px 0 10px">${esc(sName(sid) || 'Site')}</h3><div class="cards">${bySite[sid].map((a) => card(a)).join('')}</div>`).join('')}</div>`;
}
function card(a) {
  const signed = mySigned(a), aud = isMgr() ? audience(a) : [], n = isMgr() ? aud.filter((i) => { const p = profByEmail(i.email); return p && signedUsers(a).has(p.id); }).length : 0;
  const acts = rows('actions').filter((x) => x.assessment_id === a.id && x.status !== 'Done').length;
  return `<a class="pcard" href="#/a/${a.id}"><div class="row" style="justify-content:space-between;align-items:flex-start"><b style="font-size:16px">${esc(a.title || 'Untitled')}</b>${signed ? '<span class="tag ok">Signed</span>' : '<span class="tag warn">To sign</span>'}</div>
  <div class="muted" style="margin:4px 0 10px">Version ${a.version} · ${fd(a.published_at)} · renewal ${fd(a.review_date)}</div>
  <div class="row">${chip(scoreOf(a, 'res'))}<span class="muted">with ${(a.snap.hazards || []).reduce((n, h) => n + (h.controls || []).length, 0) + (a.snap.controls || []).length} controls</span>${acts ? `<span class="tag">${acts} open action${acts > 1 ? 's' : ''}</span>` : ''}</div>
  ${isMgr() && aud.length ? `<div class="row" style="margin-top:12px"><div class="prog" style="flex:1"><i style="width:${Math.round((n / aud.length) * 100)}%"></i></div><span class="muted">${n} of ${aud.length} portal users signed</span></div>` : ''}</a>`;
}

function vAssessment(id) {
  const a = latest().find((x) => x.id === id);
  if (!a) return `<div class="page"><div class="empty"><h3>Not available</h3><p class="muted">This assessment isn't published to you.</p><a class="btn" href="#/">Back</a></div></div>`;
  if (!S.viewed[id]) { S.viewed[id] = 1; sb.rpc('log_portal_view', { aid: id }).then(() => {}); }
  const sn = a.snap, acts = rows('actions').filter((x) => x.assessment_id === id).sort((x, y) => (x.status === 'Done') - (y.status === 'Done'));
  const acks = rows('acknowledgements').filter((k) => k.assessment_id === id).sort((x, y) => y.acknowledged_at.localeCompare(x.acknowledged_at));
  const signed = mySigned(a);
  if (isMgr() && !S.sigs[id]) loadSigs(id);
  return `<div class="page"><div class="row"><a class="btn sm ghost" href="#/">← Back</a><div class="row sp"><button class="btn sm" data-act="pdf" data-id="${id}">Export PDF</button>${isMgr() ? `<button class="btn sm" data-act="ackPdf" data-id="${id}">Sign-offs PDF</button>` : ''}</div></div>
  <div class="panel" style="margin-top:10px"><h2 style="font-size:clamp(22px,3vw,30px)">${esc(a.title || 'Untitled')}</h2>
  <div class="meta" style="margin:6px 0 12px"><span>${esc(sn.client?.name || '')} · ${esc(sn.site?.name || '')}</span><b style="color:var(--ink)">Version ${a.version}</b><span>Published ${fd(a.published_at)}</span><span>Renewal ${fd(a.review_date)}</span><span>${esc(a.ref)}</span></div>
  ${a.description ? `<p style="max-width:72ch;margin:0 0 16px">${esc(a.description)}</p>` : ''}${ratingCard(a)}</div>
  <div class="panel"><h3 style="font-size:16px;margin-bottom:10px">People exposed</h3><div class="row">${(a.people_exposed || []).map((p) => `<span class="tag">${esc(p)}</span>`).join('') || '<span class="muted">Not specified</span>'}</div></div>
  ${(sn.hazards || []).map((h, i) => { const sc = ctlScore(h.controls || []), rs = (h.risk_l || 0) * (h.risk_s || 0), ha = acts.filter((x) => x.assessment_hazard_id === h.id);
    return `<div class="panel"><div class="sect" style="margin-bottom:6px"><h3><span class="hn" style="font-size:13px;padding:4px 8px;margin-right:6px">${i + 1}</span>${esc(h.title)}</h3><span class="muted">${pct(sc)}</span></div>${h.description ? `<p style="margin:0 0 8px">${esc(h.description)}</p>` : ''}
    ${(h.controls || []).map((c) => ctlLine(c)).join('') || '<p class="muted">No control measures listed.</p>'}
    <div class="g3" style="margin-top:10px"><div><span class="muted">Risk score</span><br>${chip(rs)}</div><div><span class="muted">Person affected</span><br>${esc((h.people_affected || []).join(', ') || '—')}</div><div><span class="muted">Actions</span><br>${ha.length ? ha.map((x) => `${esc(x.title)} <span class="tag ${x.status === 'Done' ? 'ok' : isOd(x) ? 'bad' : ''}">${esc(x.status)}</span>`).join('<br>') : 'None'}</div></div></div>`; }).join('') || '<div class="panel"><p class="muted">No hazards listed.</p></div>'}
  ${(sn.controls || []).length ? `<div class="panel"><h3 style="font-size:16px;margin-bottom:6px">General controls</h3>${sn.controls.map((c) => ctlLine(c)).join('')}</div>` : ''}
  ${acts.length || isMgr() ? `<div class="panel"><div class="sect" style="margin-bottom:10px"><h3>Actions</h3>${isMgr() ? `<button class="btn sm" data-act="raise" data-id="${id}">+ Raise action</button>` : ''}</div>${acts.length ? '' : '<p class="muted">No actions.</p>'}<div class="tw"><table class="stack"><thead><tr><th>Action</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>${acts.map((x) => `<tr class="${isOd(x) ? 'od' : ''}"><td data-l="Action">${esc(x.title)}</td><td data-l="Owner">${esc(x.owner || '—')}</td><td data-l="Due">${fd(x.due_date)}</td><td data-l="Status">${isMgr() ? `<select id="ax-${x.id}-s" data-ax="${x.id}|status">${['Open', 'In progress', 'Done'].map((v) => `<option${x.status === v ? ' selected' : ''}>${v}</option>`).join('')}</select>` : `<span class="tag ${x.status === 'Done' ? 'ok' : isOd(x) ? 'bad' : ''}">${esc(x.status)}${isOd(x) ? ' · overdue' : ''}</span>`}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
  ${a.summary || a.approved_at ? `<div class="panel"><h3 style="font-size:16px;margin-bottom:8px">Summary and approval</h3>${a.summary ? `<p style="margin:0 0 10px">${esc(a.summary)}</p>` : ''}${a.approved_at ? `<p class="muted" style="margin:0">Approved by <b>${esc(a.approved_by)}</b> on ${ft(a.approved_at)}</p>${a.approval_signature && String(a.approval_signature).startsWith('data:image/') ? `<img src="${esc(a.approval_signature)}" alt="Approver's signature" style="max-width:260px;margin-top:6px;border:1px solid var(--line);border-radius:6px;background:#fff">` : ''}` : ''}</div>` : ''}
  <div class="panel" id="sign"><h3 style="font-size:16px;margin-bottom:10px">Acknowledgement</h3>
  ${signed ? `<p><span class="tag ok">Signed</span> You signed version ${a.version} on ${ft(signed.acknowledged_at)}.</p>` : `${signFormHTML({ version: a.version, method: 'Own account', name: S.me.full_name || '', job: S.me.job_title || '' })}<div class="row" style="margin-top:14px"><button class="btn pri" data-act="sign" data-id="${id}">Sign and submit</button></div>`}
  ${isMgr() ? `<div class="sect" style="margin-top:22px"><h3>Sign-off record</h3><button class="btn sm" data-act="inPerson" data-id="${id}">Record in-person sign-off</button></div>${whoSigned(a)}${ackRows(acks, S.sigs[id] || {})}` : acks.length ? `<h4 style="margin:18px 0 6px">Your sign-offs</h4>${ackRows(acks, {})}` : ''}</div></div>`;
}
function vActions() {
  const L = latest(), f = S.f.act || 'open';
  const list = rows('actions').filter((x) => L.some((a) => a.id === x.assessment_id) && (f === 'all' || (f === 'open' && x.status !== 'Done') || (f === 'overdue' && isOd(x)) || (f === 'done' && x.status === 'Done')))
    .sort((x, y) => (x.status === 'Done') - (y.status === 'Done') || String(x.due_date || '9').localeCompare(String(y.due_date || '9')));
  return `<div class="page"><div class="sect"><h2>Actions</h2><div class="seg">${[['open', 'Open'], ['overdue', 'Overdue'], ['done', 'Done'], ['all', 'All']].map(([k, l]) => `<button class="${f === k ? 'on' : ''}" data-act="actFilter" data-v="${k}">${l}</button>`).join('')}</div></div>
  ${list.length ? `<div class="tw"><table class="stack"><thead><tr><th>Action</th><th>Site · assessment</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>${list.map((x) => { const a = L.find((y) => y.id === x.assessment_id);
    return `<tr class="${isOd(x) ? 'od' : ''}"><td data-l="Action"><b>${esc(x.title)}</b><br><span class="muted">${esc(x.priority)} priority</span></td><td data-l="Site · assessment">${esc(sName(a.site_id))}<br><a href="#/a/${a.id}">${esc(a.title)}</a></td><td data-l="Owner"><input id="ax-${x.id}-o" data-ax="${x.id}|owner" value="${esc(x.owner || '')}" aria-label="Owner" style="min-width:140px"></td><td data-l="Due" class="${isOd(x) ? 'od-t' : ''}">${fd(x.due_date)}</td>
    <td data-l="Status"><select id="ax-${x.id}-s" data-ax="${x.id}|status">${['Open', 'In progress', 'Done'].map((v) => `<option${x.status === v ? ' selected' : ''}>${v}</option>`).join('')}</select></td></tr>`; }).join('')}</tbody></table></div>` : `<div class="empty"><h3>No actions here</h3><p class="muted">Actions raised on your sites' risk assessments appear here.</p></div>`}</div>`;
}
function raiseModal(a) {
  openModal(`<h3>Raise an action — ${esc(a.title)}</h3><p class="muted" style="margin-top:-6px">${esc(sName(a.site_id))}</p><div class="g2"><label class="full">What needs doing<textarea id="pa-t" style="min-height:70px"></textarea></label>
  <label>Owner<input id="pa-o"></label><label>Due date<input id="pa-d" type="date"></label><label>Priority<select id="pa-p">${['Low', 'Medium', 'High', 'Urgent'].map((p) => `<option${p === 'Medium' ? ' selected' : ''}>${p}</option>`).join('')}</select></label>
  <label>Hazard<select id="pa-h"><option value="">General</option>${(a.snap.hazards || []).map((h) => `<option value="${h.id}">${esc(h.title)}</option>`).join('')}</select></label></div>
  <div class="ft"><button class="btn" data-act="close">Cancel</button><button class="btn pri" data-act="raiseSave" data-id="${a.id}">Raise action</button></div>`);
}

const ctlLine = (c) => `<div class="li"><span class="tag ${c.state === 'Planned' ? 'bad' : c.state === 'N/A' ? '' : 'ok'}">${c.state === 'Planned' ? 'Not in place' : c.state === 'N/A' ? 'N/A' : 'In place'}</span><span><b>${esc(c.title)}</b> <span class="muted">· ${esc(c.type)}</span>${c.description ? `<br><span>${esc(c.description)}</span>` : ''}</span></div>`;
function whoSigned(a) {
  const aud = audience(a), su = signedUsers(a);
  if (!aud.length) return '';
  return `<div class="row" style="margin-bottom:12px">${aud.map((i) => { const p = profByEmail(i.email), ok = p && su.has(p.id); return `<span class="tag ${ok ? 'ok' : 'warn'}" title="${esc(i.email)}">${ok ? '✓' : '…'} ${esc(i.full_name || i.email)}</span>`; }).join('')}</div>`;
}
function ackRows(acks, sigs, showRA) {
  if (!acks.length) return '<p class="muted">No sign-offs yet.</p>';
  return `<div class="tw"><table class="stack"><thead><tr><th>Signed</th><th>Name</th><th>Job title</th>${showRA ? '<th>Assessment</th><th>Site</th>' : ''}<th>Version</th><th>Method</th><th>Signature</th></tr></thead><tbody>${acks.map((k) => `<tr><td data-l="Signed">${ft(k.acknowledged_at)}</td><td data-l="Name"><b>${esc(k.full_name)}</b></td><td data-l="Job title">${esc(k.job_title || '—')}</td>${showRA ? `<td data-l="Assessment"><a href="#/a/${k.assessment_id}">${esc(raTitle(k.assessment_id))}</a></td><td data-l="Site">${esc(sName(k.site_id))}</td>` : ''}<td data-l="Version">v${k.version}</td><td data-l="Method">${esc(k.method)}</td><td data-l="Signature">${sigs[k.id] ? `<img class="sig" src="${esc(sigs[k.id])}" alt="Signature">` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}
const raTitle = (aid) => latest().find((a) => a.id === aid)?.title || '';
async function loadSigs(aid) {
  S.sigs[aid] = {};
  const q = sb.from('acknowledgements').select('id,signature');
  const { data } = await (aid === '*' ? q : q.eq('assessment_id', aid));
  (data || []).forEach((r) => (S.sigs[aid][r.id] = r.signature && r.signature.startsWith('data:image/') ? r.signature : ''));
  window.__render();
}

function filteredAcks() {
  const f = S.f;
  return rows('acknowledgements').filter((k) => (!f.s || k.site_id === f.s) && (!f.a || k.assessment_id === f.a) && (!f.q || (k.full_name + ' ' + (k.job_title || '')).toLowerCase().includes(f.q.toLowerCase())) && (!f.from || k.acknowledged_at.slice(0, 10) >= f.from) && (!f.to || k.acknowledged_at.slice(0, 10) <= f.to))
    .sort((a, b) => b.acknowledged_at.localeCompare(a.acknowledged_at));
}
function vRecords() {
  const f = S.f, list = filteredAcks(), L = latest();
  if (!S.sigs['*']) loadSigs('*');
  const outstanding = L.flatMap((a) => audience(a).filter((i) => { const p = profByEmail(i.email); return !p || !signedUsers(a).has(p.id); }).map((i) => ({ a, i })));
  return `<div class="page"><div class="panel" style="margin-bottom:16px"><div class="row">
  <input id="rf-q" type="search" data-f="q" value="${esc(f.q || '')}" placeholder="Search by name…" style="max-width:220px">
  <select id="rf-s" data-f="s" style="width:auto"><option value="">All sites</option>${rows('sites').map((s) => `<option value="${s.id}"${f.s === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
  <select id="rf-a" data-f="a" style="width:auto;max-width:260px"><option value="">All assessments</option>${L.map((a) => `<option value="${a.id}"${f.a === a.id ? ' selected' : ''}>${esc(a.title)}</option>`).join('')}</select>
  <label>From<input id="rf-from" type="date" data-f="from" value="${esc(f.from || '')}" style="width:auto"></label><label>To<input id="rf-to" type="date" data-f="to" value="${esc(f.to || '')}" style="width:auto"></label>
  <button class="btn pri sp" data-act="recPdf">Export PDF</button></div></div>
  ${outstanding.length ? `<div class="panel" style="margin-bottom:16px"><h3 style="font-size:16px;margin-bottom:8px">Still to sign the current version (${outstanding.length})</h3>${outstanding.slice(0, 30).map(({ a, i }) => `<div class="li"><span class="tag warn">To sign</span><span><b>${esc(i.full_name || i.email)}</b> · <a href="#/a/${a.id}">${esc(a.title)}</a> v${a.version}<br><span class="muted">${esc(i.email)}${profByEmail(i.email) ? '' : ' · hasn\'t signed in yet'}</span></span></div>`).join('')}</div>` : ''}
  <div class="sect"><h2>${list.length} sign-off${list.length === 1 ? '' : 's'}</h2></div>${ackRows(list, S.sigs['*'] || {}, true)}</div>`;
}

function vStaff() {
  const inv = [...rows('portal_invites')].sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email));
  const sites = rows('sites');
  return `<div class="page"><div class="sect"><div><h2>Staff</h2><p class="hint">Add your staff so they can read and sign risk assessments. Staff see their site (or all sites). Managers see everything and keep the records.</p></div><button class="btn pri" data-act="addStaff">+ Add staff member</button></div>
  <div class="tw"><table class="stack"><thead><tr><th>Name</th><th>Email</th><th>Job title</th><th>Role</th><th>Site</th><th>Status</th><th>Sign-offs</th><th></th></tr></thead><tbody>${inv.map((i) => { const p = profByEmail(i.email), me = p && p.id === S.me.id; return `<tr><td data-l="Name"><b>${esc(i.full_name || '—')}</b>${me ? ' <span class="muted">(you)</span>' : ''}</td><td data-l="Email">${esc(i.email)}</td><td data-l="Job title">${esc(i.job_title || '—')}</td>
  <td data-l="Role">${me ? 'Manager' : S.me.role === 'manager' ? 'Staff' : `<select id="st-${i.id}-r" data-st="${i.id}|role"><option value="staff"${i.role === 'staff' ? ' selected' : ''}>Staff</option><option value="client_admin"${i.role === 'client_admin' ? ' selected' : ''}>Manager</option></select>`}</td>
  <td data-l="Site"><select id="st-${i.id}-s" data-st="${i.id}|site_id">${S.me.role === 'manager' ? '' : '<option value="">All sites</option>'}${sites.map((s) => `<option value="${s.id}"${i.site_id === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></td>
  <td data-l="Status">${p ? '<span class="tag ok">Joined</span>' : '<span class="tag">Invited</span>'}</td><td data-l="Sign-offs">${p ? rows('acknowledgements').filter((k) => k.user_id === p.id && k.method === 'Own account').length : 0}</td>
  <td>${me ? '' : `<button class="btn sm ghost" data-act="delStaff" data-id="${i.id}">Remove</button>`}</td></tr>`; }).join('')}</tbody></table></div>
  <p class="hint">Send new staff the portal address: <b>${esc(location.origin + location.pathname)}</b>. They sign in with their email — no password needed. Staff without email can sign in person on your device from any risk assessment.</p></div>`;
}

export async function portalClick(e, b) {
  const d = b.dataset;
  if (d.act && d.act.startsWith('cc') && isMgr() && (await ccClick(d, b))) return;
  const a = latest().find((x) => x.id === (d.id || route[1]));
  switch (d.act) {
    case 'close': return closeModal();
    case 'actFilter': S.f.act = d.v; return window.__render();
    case 'raise': return raiseModal(a);
    case 'raiseSave': { const t = $('#pa-t').value.trim(); if (!t) return toast('Describe what needs doing', true);
      const row = { assessment_id: a.id, assessment_hazard_id: $('#pa-h').value || null, title: t, owner: $('#pa-o').value.trim() || null, due_date: $('#pa-d').value || null, priority: $('#pa-p').value, source: 'manual', status: 'Open' };
      closeModal(); await ins('actions', row).catch(() => {}); toast('Action raised'); return window.__render(); }
    case 'sign': { const r = await submitSignOff({ assessmentId: a.id, version: a.version, method: 'Own account' }); if (!r) return; delete r.signature; rows('acknowledgements').push(r); delete S.sigs[a.id]; toast('Thank you — your sign-off is recorded'); return window.__render(); }
    case 'inPerson': openModal(`<h3>Record an in-person sign-off</h3><p class="muted">For staff without a login. Hand them your device to read version ${a.version} and sign.</p>${signFormHTML({ version: a.version, method: 'In person' })}<div class="ft"><button class="btn" data-act="close">Cancel</button><button class="btn pri" data-act="inPersonSave" data-id="${a.id}">Save sign-off</button></div>`); return mountPad();
    case 'inPersonSave': { const r = await submitSignOff({ assessmentId: a.id, version: a.version, method: 'In person' }); if (!r) return; delete r.signature; rows('acknowledgements').push(r); delete S.sigs[a.id]; delete S.sigs['*']; closeModal(); toast('Sign-off recorded'); return window.__render(); }
    case 'pdf': {
      const acks = rows('acknowledgements').filter((k) => k.assessment_id === a.id).sort((x, y) => y.acknowledged_at.localeCompare(x.acknowledged_at));
      const { data } = await sb.from('acknowledgements').select('id,signature').eq('assessment_id', a.id); const sg = Object.fromEntries((data || []).map((r) => [r.id, r.signature]));
      const la = rows('actions').filter((x) => x.assessment_id === a.id);
      return assessmentPDF({ ...a, client: a.snap.client?.name || '', site: a.snap.site?.name || '', siteAddress: a.snap.site?.address || '', people: a.people_exposed || [], hazards: (a.snap.hazards || []).map((h) => ({ ...h, actions: la.filter((x) => x.assessment_hazard_id === h.id) })), controls: a.snap.controls || [],
        versionLabel: `Version ${a.version} · published ${fd(a.published_at)}`, actions: rows('actions').filter((x) => x.assessment_id === a.id), audits: [], acks: acks.map((k) => ({ ...k, signature: sg[k.id] })) });
    }
    case 'ackPdf': case 'recPdf': {
      const list = d.act === 'ackPdf' ? rows('acknowledgements').filter((k) => k.assessment_id === a.id) : filteredAcks();
      const { data } = await sb.from('acknowledgements').select('id,signature').in('id', list.map((k) => k.id).slice(0, 500)); const sg = Object.fromEntries((data || []).map((r) => [r.id, r.signature]));
      return signOffsPDF({ title: 'Acknowledgement record', subtitle: `${company()}${d.act === 'ackPdf' ? ' · ' + a.title : ''}`, acks: list.map((k) => ({ ...k, signature: sg[k.id], _assessment: raTitle(k.assessment_id), _site: sName(k.site_id) })) });
    }
    case 'addStaff': openModal(`<h3>Add staff member</h3><div class="g2"><label>Full name<input id="sf-n"></label><label>Email<input id="sf-e" type="email"></label><label>Job title<input id="sf-j"></label><label>Role<select id="sf-r"><option value="staff">Staff — reads and signs</option>${S.me.role === 'manager' ? '' : '<option value="client_admin">Manager — all sites and records</option>'}</select></label><label class="full">Site<select id="sf-s">${S.me.role === 'manager' ? '' : '<option value="">All sites</option>'}${rows('sites').map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label></div><div class="ft"><button class="btn" data-act="close">Cancel</button><button class="btn pri" data-act="addStaffSave">Add</button></div>`); return;
    case 'addStaffSave': {
      const email = $('#sf-e').value.trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Enter a valid email', true);
      if (S.me.role === 'manager' && !$('#sf-s').value) return toast('Choose their site', true);
      const row = { email, role: $('#sf-r').value, client_id: S.me.client_id, site_id: $('#sf-s').value || null, full_name: $('#sf-n').value.trim() || null, job_title: $('#sf-j').value.trim() || null };
      closeModal(); await ins('portal_invites', row).catch(() => {}); D.profiles = await fetchAll('profiles'); toast('Added — send them the portal address'); return window.__render();
    }
    case 'delStaff': if (await confirmBox('Remove this person\'s access? Their past sign-offs are kept.', 'Remove access')) { await del('portal_invites', d.id).catch(() => {}); window.__render(); } return;
  }
}
export function portalField(el, isChange) {
  if (el.dataset.f) { S.f[el.dataset.f] = el.value; return true; }
  if (el.dataset.ax) { const [id, f] = el.dataset.ax.split('|'), patch = { [f]: el.value || null }; if (f === 'status') patch.completed_on = el.value === 'Done' ? today() : null; upd('actions', id, patch, isChange ? 0 : 700).catch(() => {}); return isChange; }
  if (el.dataset.st) { const [id, f] = el.dataset.st.split('|'); upd('portal_invites', id, { [f]: el.value || null }).catch(() => {}); return true; }
  return false;
}
