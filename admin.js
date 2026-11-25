// Admin (your company) side.
import {
  sb, D, $, esc, uid, today, addDays, fd, ft, nowIso, band, chip, scoreOf, reduction, isOd, picker, ratingCard,
  CTYPES, CATS, PEOPLE, STATUSES, ASTAT, PRI, QS, auditScore, auditOutcome, ocol, toast, openModal, closeModal, confirmBox,
  fetchAll, rows, byId, ins, upd, del, queue, niceError, field, area, sel, shell, signFormHTML, mountPad, submitSignOff, onRerender,
} from './core.js';
import { assessmentPDF, signOffsPDF, ctlScore, pct } from './pdf.js';
import { ccView, ccClick, ccTotals, ccAttention } from './compliance.js';

const S = { me: null, sel: new Set(), ccClient: '', q: '', fClient: '', fStatus: '', af: 'open', draft: null, logs: {}, sigs: {}, hq: '', hcat: '', cq: '', so: {}, tq: '', tsec: '' };
let route = [];
// Company administrators (client_admin) use this same builder, limited by the database to their own company.
const CO = () => S.me.role === 'client_admin';
const SUPER = () => S.me.role === 'admin' && !!S.me.is_super;
const myCo = () => S.me.client_id;

// ---------- load ----------
export async function loadAdmin(me) {
  S.me = me;
  const ackCols = 'id,assessment_id,version,user_id,email,full_name,job_title,method,site_id,statement,acknowledged_at';
  const [clients, sites, invites, profiles, hreg, creg, hrc, ras, hz, ctl, acts, audits, pubs, acks, topics, thz, tct, cdt, sdocs] = await Promise.all([
    fetchAll('clients'), fetchAll('sites'), fetchAll('portal_invites'), fetchAll('profiles'), fetchAll('hazard_register'), fetchAll('control_register'),
    fetchAll('hazard_register_controls'), fetchAll('assessments'), fetchAll('assessment_hazards'), fetchAll('assessment_controls'), fetchAll('actions'),
    fetchAll('audits'), fetchAll('published_assessments', 'id,assessment_id,client_id,site_id,version,note,published_at,published_by'), fetchAll('acknowledgements', ackCols),
    fetchAll('topic_library'), fetchAll('topic_hazards'), fetchAll('topic_controls'), fetchAll('compliance_doc_types'), fetchAll('site_documents'),
  ]);
  Object.assign(D, { clients, sites, portal_invites: invites, profiles, hazard_register: hreg, control_register: creg, hazard_register_controls: hrc, assessments: ras,
    assessment_hazards: hz, assessment_controls: ctl, actions: acts, audits, published_assessments: pubs, acknowledgements: acks, topic_library: topics, topic_hazards: thz, topic_controls: tct, compliance_doc_types: cdt, site_documents: sdocs });
}

// ---------- lookups ----------
const cName = (id) => byId('clients', id)?.name || 'Unknown client';
const sName = (id) => byId('sites', id)?.name || '';
const clientSites = (cid) => rows('sites').filter((s) => s.client_id === cid).sort((a, b) => (b.is_head_office - a.is_head_office) || a.name.localeCompare(b.name));
const raHz = (aid) => rows('assessment_hazards').filter((h) => h.assessment_id === aid).sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at));
const raCtl = (aid) => rows('assessment_controls').filter((c) => c.assessment_id === aid).sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at));
const raActs = (aid) => rows('actions').filter((x) => x.assessment_id === aid);
const raAcks = (aid) => rows('acknowledgements').filter((x) => x.assessment_id === aid).sort((a, b) => b.acknowledged_at.localeCompare(a.acknowledged_at));
const raPubs = (aid) => rows('published_assessments').filter((x) => x.assessment_id === aid).sort((a, b) => b.version - a.version);
const live = () => rows('assessments').filter((a) => a.status !== 'Archived');
const person = (id) => { const p = byId('profiles', id); return p ? p.full_name || p.email : id ? 'Someone' : 'System'; };
const newRef = () => 'RA-' + today().replace(/-/g, '').slice(2) + '-' + uid().replace(/-/g, '').slice(0, 5).toUpperCase();
const ratingLine = (a) => `${chip(scoreOf(a, 'res'), true)}<div class="muted" style="font-size:12px">with ${raCtl(a.id).length} controls</div>`;
const pubTag = (a) => (a.published_version ? `<span class="tag ok">Published v${a.published_version}</span>` : '<span class="tag">Not published</span>');
const statusTag = (s) => `<span class="tag${s === 'Active' ? ' ok' : s === 'Under review' ? ' warn' : ''}">${esc(s)}</span>`;
const empty = (h, p, btn = '') => `<div class="empty"><h3>${h}</h3><p class="muted">${p}</p>${btn}</div>`;

// people who can see an assessment in the portal
function audienceFor(a) {
  return rows('portal_invites').filter((i) => i.client_id === a.client_id && (i.role === 'client_admin' || !i.site_id || i.site_id === a.site_id));
}

// ---------- view ----------
export function adminView(r) {
  route = r;
  const [p0, p1, p2] = r;
  const open = rows('actions').filter((x) => x.status !== 'Done').length;
  const nav = [
    { k: 'dash', href: '', icon: 'dash', label: 'Dashboard' },
    { k: 'clients', href: 'clients', icon: 'clients', label: 'Clients and sites', c: rows('clients').length },
    { k: 'ras', href: 'ras', icon: 'ra', label: 'Risk assessments', c: live().length },
    { k: 'compliance', href: 'compliance', icon: 'cert', label: 'Compliance centre', c: (() => { const t = ccTotals(rows('sites').map((x) => x.id)); return t.Expired + t['Due soon'] || ''; })() },
    { k: 'topics', href: 'topics', icon: 'lib', label: 'Topic library', c: rows('topic_library').filter((t) => t.active).length },
    { k: 'hazards', href: 'hazards', icon: 'hz', label: 'Hazard register' },
    { k: 'controls', href: 'controls', icon: 'ctl', label: 'Control register' },
    { k: 'actions', href: 'actions', icon: 'acts', label: 'Actions', c: open },
    { k: 'signoffs', href: 'signoffs', icon: 'sign', label: 'Sign-offs' },
    { k: 'team', href: 'team', icon: 'team', label: 'Team and administrators' },
  ];
  if (CO()) {
    const keep = { dash: 1, ras: 1, compliance: 1, topics: 1, actions: 1, signoffs: 1 };
    nav.splice(0, nav.length, ...nav.filter((n) => keep[n.k]));
    nav.splice(1, 0, { k: 'clients', href: 'client/' + myCo(), icon: 'clients', label: 'Sites and staff', c: rows('sites').length });
  }
  let active = 'dash', title = 'Dashboard', body;
  if (CO() && ['clients', 'hazards', 'controls', 'team'].includes(p0)) { active = 'clients'; title = 'Sites and staff'; body = vClient(myCo()); }
  else if (p0 === 'clients') { active = 'clients'; title = 'Clients and sites'; body = vClients(); }
  else if (p0 === 'client') { active = 'clients'; title = 'Client'; body = vClient(p1); }
  else if (p0 === 'ras') { active = 'ras'; title = 'Risk assessments'; body = vRAs(); }
  else if (p0 === 'ra') { active = 'ras'; title = 'Risk assessment'; body = vRA(p1, p2 || 'details'); }
  else if (p0 === 'compliance') { active = 'compliance'; title = 'Compliance centre'; body = ccView(r, CO() ? { admin: false, base: 'compliance' } : { admin: true, base: 'compliance', clientName: cName, clientFilter: S.ccClient }); }
  else if (p0 === 'topics') { active = 'topics'; title = 'Topic library'; body = vTopics(); }
  else if (p0 === 'hazards') { active = 'hazards'; title = 'Hazard register'; body = vHazReg(); }
  else if (p0 === 'controls') { active = 'controls'; title = 'Control register'; body = vCtlReg(); }
  else if (p0 === 'actions') { active = 'actions'; title = 'Actions'; body = vActions(); }
  else if (p0 === 'signoffs') { active = 'signoffs'; title = 'Sign-offs'; body = vSignoffs(); }
  else if (p0 === 'team') { active = 'team'; title = 'Team and administrators'; body = vTeam(); }
  else body = vDash();
  return shell({ nav, active, title, body, me: { group: CO() ? (byId('clients', myCo())?.name || 'COMPANY').toUpperCase() : 'RISK MANAGEMENT', name: S.me.full_name || S.me.email, sub: CO() ? 'Company administrator' : SUPER() ? 'Superadmin' : 'Administrator' } });
}

// ---------- dashboard ----------
function vDash() {
  const L = live(), acts = rows('actions').filter((x) => byId('assessments', x.assessment_id)?.status !== 'Archived');
  const soon = addDays(today(), 30), month = addDays(today(), -30);
  const od = acts.filter(isOd), due = L.filter((a) => a.review_date && a.review_date <= soon).sort((a, b) => a.review_date.localeCompare(b.review_date));
  const hi = [...L].filter((a) => scoreOf(a, 'res') || scoreOf(a, 'init')).sort((a, b) => (scoreOf(b, 'res') || scoreOf(b, 'init')) - (scoreOf(a, 'res') || scoreOf(a, 'init'))).slice(0, 6);
  const cc = ccTotals(rows('sites').map((x) => x.id)), ccAtt = ccAttention(rows('sites').map((x) => x.id), 4);
  const recent = [...rows('acknowledgements')].sort((a, b) => b.acknowledged_at.localeCompare(a.acknowledged_at)).slice(0, 6);
  const st = [CO() ? [rows('sites').length, 'Sites'] : [rows('clients').length, 'Clients'], [L.length, 'Live risk assessments'], [L.filter((a) => scoreOf(a, 'res') >= 10).length, 'High risk with controls', 1],
    [acts.filter((x) => x.status !== 'Done').length, 'Open actions'], [od.length, 'Overdue actions', 1], [due.length, 'Renewals due in 30 days', 1],
    [rows('acknowledgements').filter((a) => a.acknowledged_at >= month).length, 'Sign-offs in last 30 days'], [cc.Expired, 'Certificates expired', 1], [cc['Due soon'], 'Certificates due in 30 days', 1]];
  const st1 = `<div class="stats">${st.map(([n, l, al]) => `<div class="stat${al && n ? ' alert' : ''}"><span>${l}</span><b>${n}</b></div>`).join('')}</div>`;
  if (!rows('clients').length) return `<div class="page">${st1}${empty('Start by onboarding a client', 'Add the client\'s head office and sites, then create risk assessments for them from your hazard and control registers.', '<button class="btn pri" data-act="onboard">+ Onboard a client</button>')}</div>`;
  return `<div class="page"><div class="sect"><div><h2>Risk overview</h2><p class="muted" style="margin:4px 0 0">${CO() ? 'Your sites, highest risks' : 'Every client, their highest risks'} and what needs doing next.</p></div><div class="row">${CO() ? '' : '<button class="btn" data-act="onboard">+ Onboard client</button>'}<button class="btn pri" data-act="newRA">+ Create risk assessment</button></div></div>${st1}
  <div class="g2" style="margin-bottom:18px"><div class="panel"><h3 style="font-size:16px;margin-bottom:8px">Highest risk ratings</h3>${hi.length ? hi.map((a) => `<a class="li" href="#/ra/${a.id}/rating">${chip(scoreOf(a, 'res') || scoreOf(a, 'init'), true)}<span><b>${esc(a.title || 'Untitled')}</b><br><span class="muted">${esc(cName(a.client_id))} · ${esc(sName(a.site_id))}${scoreOf(a, 'res') ? '' : ' · not rated with controls'}</span></span></a>`).join('') : '<p class="muted">Nothing rated yet.</p>'}</div>
  <div class="panel"><h3 style="font-size:16px;margin-bottom:8px">Needs attention</h3>${od.slice(0, 5).map((x) => { const a = byId('assessments', x.assessment_id); return `<a class="li" href="#/ra/${x.assessment_id}/actions"><span class="tag bad">Overdue</span><span><b>${esc(x.title || 'Untitled action')}</b><br><span class="muted">Due ${fd(x.due_date)} · ${esc(x.owner || 'No owner')} · ${esc(cName(a?.client_id))}</span></span></a>`; }).join('')}
  ${due.slice(0, 4).map((a) => `<a class="li" href="#/ra/${a.id}/details"><span class="tag warn">Renewal</span><span><b>${esc(a.title || 'Untitled')}</b><br><span class="muted">${a.review_date < today() ? 'Was due' : 'Due'} ${fd(a.review_date)} · ${esc(cName(a.client_id))}</span></span></a>`).join('')}
  ${L.filter((a) => !a.published_version && a.status === 'Active').slice(0, 3).map((a) => `<a class="li" href="#/ra/${a.id}/publish"><span class="tag">Unpublished</span><span><b>${esc(a.title || 'Untitled')}</b><br><span class="muted">Active but ${CO() ? 'staff' : 'the client'} can't see it yet</span></span></a>`).join('')}
  ${ccAtt.map(({ sid, t, d, s: st }) => { const site = byId('sites', sid); return `<a class="li" href="#/compliance/${sid}"><span class="tag ${st === 'Expired' ? 'bad' : 'warn'}">${st === 'Expired' ? 'Expired' : 'Due soon'}</span><span><b>${esc(t.name)}</b><br><span class="muted">${esc(cName(site?.client_id))} · ${esc(site?.name)} · ${fd(d.expiry_date)}</span></span></a>`; }).join('')}
  ${!od.length && !due.length && !ccAtt.length ? '<p class="muted">Nothing overdue, no renewals and no certificates due in the next 30 days.</p>' : ''}</div></div>
  <div class="panel"><div class="sect"><h3>Latest sign-offs</h3><a class="btn sm" href="#/signoffs">All sign-offs</a></div>${recent.length ? recent.map((k) => { const a = byId('assessments', k.assessment_id); return `<a class="li" href="#/ra/${k.assessment_id}/publish"><span class="tag ok">Signed</span><span><b>${esc(k.full_name)}</b>${k.job_title ? ', ' + esc(k.job_title) : ''}<br><span class="muted">${esc(a?.title || '')} v${k.version} · ${esc(cName(a?.client_id))} · ${ft(k.acknowledged_at)}${k.method === 'In person' ? ' · in person' : ''}</span></span></a>`; }).join('') : '<p class="muted">No sign-offs yet. Publish an assessment and invite the client\'s staff.</p>'}</div></div>`;
}

// ---------- clients ----------
function vClients() {
  const cs = [...rows('clients')].sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="page"><div class="sect"><h2>Clients</h2><button class="btn pri" data-act="onboard">+ Onboard client</button></div>
  ${cs.length ? `<div class="tw"><table class="stack"><thead><tr><th>Client</th><th>Head office</th><th>Sites</th><th>Risk assessments</th><th>Portal users</th><th>Open actions</th></tr></thead><tbody>${cs.map((c) => {
    const ras = rows('assessments').filter((a) => a.client_id === c.id), ho = clientSites(c.id).find((s) => s.is_head_office);
    return `<tr class="click" data-go="client/${c.id}"><td data-l="Client"><b>${esc(c.name)}</b><br><span class="muted">${esc(c.contact_name || '')}</span></td><td data-l="Head office">${esc(ho?.address || c.address || '—')}</td><td data-l="Sites">${clientSites(c.id).length}</td><td data-l="Risk assessments">${ras.length}</td><td data-l="Portal users">${rows('portal_invites').filter((i) => i.client_id === c.id).length}</td><td data-l="Open actions">${rows('actions').filter((x) => x.status !== 'Done' && ras.some((a) => a.id === x.assessment_id)).length}</td></tr>`;
  }).join('')}</tbody></table></div>` : empty('No clients yet', 'Onboard a client with their head office, sites and a manager for the portal.', '<button class="btn pri" data-act="onboard">+ Onboard client</button>')}</div>`;
}

function onboardModal() {
  openModal(`<h3>Onboard a client</h3><div class="g2">
  <label class="full">Company name<input id="ob-name" placeholder="e.g. Harbourside Joinery Ltd"></label>
  <label class="full">Head office address<textarea id="ob-addr" style="min-height:60px"></textarea></label>
  <label>Contact name<input id="ob-cn"></label><label>Contact email<input id="ob-ce" type="email"></label><label>Phone<input id="ob-ph"></label></div>
  <h4 style="margin:18px 0 6px">Other sites</h4><p class="hint" style="margin:0 0 6px">A Head office site is added automatically. One site per line: <b>Site name — address</b></p>
  <textarea id="ob-sites" placeholder="Warehouse — Unit 4, Quay Road&#10;Shop — 12 High Street"></textarea>
  <h4 style="margin:18px 0 6px">Company administrator (optional)</h4><p class="hint" style="margin:0 0 6px">Linked to this company only. They can build and publish its risk assessments, add sites and staff, and keep the sign-off records and certificates.</p>
  <div class="g3"><label>Name<input id="ob-mn"></label><label>Email<input id="ob-me" type="email"></label><label>Job title<input id="ob-mj"></label></div>
  <div class="ft"><button class="btn" data-act="close">Cancel</button><button class="btn pri" data-act="onboardSave">Onboard client</button></div>`, true);
}
async function onboardSave() {
  const name = $('#ob-name').value.trim(); if (!name) return toast('Enter the company name', true);
  const c = { id: uid(), name, address: $('#ob-addr').value.trim() || null, contact_name: $('#ob-cn').value.trim() || null, contact_email: $('#ob-ce').value.trim() || null, phone: $('#ob-ph').value.trim() || null };
  const siteLines = $('#ob-sites').value || '';
  const mn = $('#ob-mn').value.trim(), me = $('#ob-me').value.trim().toLowerCase(), mj = $('#ob-mj').value.trim();
  if (me && !/^\S+@\S+\.\S+$/.test(me)) return toast('Enter a valid manager email', true);
  closeModal();
  try {
    await ins('clients', c);
    D.sites = rows('sites').concat(await fetchAll('sites', '*', (q) => q.eq('client_id', c.id)));
    for (const ln of siteLines.split('\n').map((s) => s.trim()).filter(Boolean)) { const [n, ...ad] = ln.split(/\s+[—–-]\s+/); await ins('sites', { client_id: c.id, name: n.trim(), address: ad.join(' - ').trim() || null }); }
    if (me) await ins('portal_invites', { email: me, role: 'client_admin', client_id: c.id, full_name: mn || null, job_title: mj || null });
    toast('Client onboarded'); location.hash = '#/client/' + c.id;
  } catch (e) { /* toast already shown */ }
}

function vClient(id) {
  const c = byId('clients', id); if (!c) return `<div class="page">${empty('Client not found', '')}</div>`;
  const sites = clientSites(id), ras = rows('assessments').filter((a) => a.client_id === id), inv = rows('portal_invites').filter((i) => i.client_id === id);
  const joined = (email) => rows('profiles').some((p) => p.email === email);
  const portal = location.origin + location.pathname;
  return `<div class="page">${CO() ? '' : '<a class="btn sm ghost" href="#/clients">← All clients</a>'}
  <div class="sect" style="margin-top:8px"><h2>${esc(c.name)}</h2><div class="row"><button class="btn" data-act="newRA" data-client="${id}">+ Create risk assessment</button>${SUPER() ? `<button class="btn dng" data-act="delClient" data-id="${id}">Delete client</button>` : ''}</div></div>
  <div class="panel"><h3 style="font-size:16px;margin-bottom:12px">Head office and contact</h3><div class="g2">${field(`clients|${id}|name`, c.name, 'Company name')}${field(`clients|${id}|contact_name`, c.contact_name, 'Contact name')}${field(`clients|${id}|contact_email`, c.contact_email, 'Contact email', 'email')}${field(`clients|${id}|phone`, c.phone, 'Phone')}${area(`clients|${id}|notes`, c.notes, 'Notes', ' class="full"')}</div></div>
  <div class="panel"><div class="sect"><h3>Sites</h3><button class="btn sm" data-act="addSite" data-id="${id}">+ Add site</button></div>
  <div class="tw"><table class="stack"><thead><tr><th>Site</th><th>Address</th><th>Site contact</th><th>Phone</th><th>Assessments</th><th>Compliance</th><th></th></tr></thead><tbody>${sites.map((s) => `<tr><td data-l="Site"><input id="s-${s.id}-n" data-b="sites|${s.id}|name" value="${esc(s.name)}" aria-label="Site name">${s.is_head_office ? '<span class="muted">Head office</span>' : ''}</td><td data-l="Address"><input id="s-${s.id}-a" data-b="sites|${s.id}|address" value="${esc(s.address)}" aria-label="Address"></td><td data-l="Site contact"><input id="s-${s.id}-c" data-b="sites|${s.id}|site_contact" value="${esc(s.site_contact)}" aria-label="Site contact"></td><td data-l="Phone"><input id="s-${s.id}-p" data-b="sites|${s.id}|phone" value="${esc(s.phone)}" aria-label="Phone"></td><td data-l="Assessments">${ras.filter((a) => a.site_id === s.id).length}</td><td data-l="Compliance"><a class="btn sm" href="#/compliance/${s.id}">Certificates</a></td><td>${s.is_head_office || CO() ? '' : `<button class="btn sm ghost" data-act="delSite" data-id="${s.id}" aria-label="Remove site">✕</button>`}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="panel"><div class="sect"><div><h3>${CO() ? 'Company administrators and staff' : 'Company administrators and staff'}</h3><p class="hint">Company administrators build and publish this company's risk assessments, manage staff and keep the sign-off records. Staff see their site (or all sites) and sign. Portal address: <b>${esc(portal)}</b> <button class="btn sm" data-act="copy" data-v="${esc(portal)}">Copy</button></p></div><button class="btn sm pri" data-act="invite" data-client="${id}">+ Add person</button></div>
  ${inv.length ? `<div class="tw"><table class="stack"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Site</th><th>Job title</th><th>Status</th><th></th></tr></thead><tbody>${inv.map((i) => `<tr><td data-l="Name">${esc(i.full_name || '—')}</td><td data-l="Email">${esc(i.email)}</td><td data-l="Role">${sel(`portal_invites|${i.id}|role`, i.role, [['client_admin', 'Company administrator'], ['staff', 'Staff']], '')}</td><td data-l="Site">${sel(`portal_invites|${i.id}|site_id`, i.site_id || '', [['', 'All sites']].concat(sites.map((s) => [s.id, s.name])), '')}</td><td data-l="Job title">${esc(i.job_title || '—')}</td><td data-l="Status">${joined(i.email) ? '<span class="tag ok">Joined</span>' : '<span class="tag">Invited</span>'}</td><td><button class="btn sm ghost" data-act="delInvite" data-id="${i.id}" aria-label="Remove access">Remove</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nobody yet. Add a company administrator first; they can add their own staff.</p>'}</div>
  <div class="panel"><div class="sect"><h3>Risk assessments</h3></div>${ras.length ? raTable(ras) : '<p class="muted">None yet.</p>'}</div></div>`;
}
function inviteModal(clientId, role = 'staff') {
  const sites = clientSites(clientId);
  openModal(`<h3>Add a person — ${esc(cName(clientId))}</h3><div class="g2"><label>Full name<input id="iv-n"></label><label>Email<input id="iv-e" type="email"></label><label>Job title<input id="iv-j"></label>
  <label>Role<select id="iv-r"><option value="client_admin"${role === 'client_admin' ? ' selected' : ''}>Company administrator — builds and publishes this company's risk assessments</option><option value="staff"${role === 'staff' ? ' selected' : ''}>Staff — reads and signs</option></select></label>
  <label class="full">Site<select id="iv-s"><option value="">All sites</option>${sites.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label></div>
  <p class="hint">They sign in at the portal address with this email and get a one-time sign-in link. No password needed.</p>
  <div class="ft"><button class="btn" data-act="close">Cancel</button><button class="btn pri" data-act="inviteSave" data-client="${clientId}">Add user</button></div>`);
}

// ---------- assessments ----------
function raTable(list) {
  const allOn = list.length && list.every((a) => S.sel.has(a.id));
  return `${S.sel.size ? `<div class="bulk"><b>${S.sel.size} selected</b><button class="btn sm pri" data-act="copyMany">Copy to other sites</button><button class="btn sm ghost" data-act="selClear">Clear</button></div>` : ''}<div class="tw"><table class="stack"><thead><tr><th class="ck"><input type="checkbox" data-act="selAll" data-ids="${list.map((a) => a.id).join(',')}"${allOn ? ' checked' : ''} aria-label="Select all"></th><th>Name</th><th>Client · site</th><th>Published</th><th>Status</th><th>Risk rating</th><th>Renewal date</th><th>Sign-offs</th></tr></thead><tbody>${list.map((a) => {
    const n = raAcks(a.id).filter((k) => k.version === a.published_version).length, aud = a.published_version ? audienceFor(a).length : 0;
    return `<tr class="click${S.sel.has(a.id) ? ' on' : ''}" data-go="ra/${a.id}/details"><td class="ck"><input type="checkbox" data-act="selRA" data-id="${a.id}"${S.sel.has(a.id) ? ' checked' : ''} aria-label="Select"></td><td data-l="Name"><a href="#/ra/${a.id}/details"><b>${esc(a.title || 'Untitled')}</b></a><br><span class="muted">${esc(a.ref)}</span></td><td data-l="Client · site">${esc(cName(a.client_id))}<br><span class="muted">${esc(sName(a.site_id))}</span></td><td data-l="Published">${pubTag(a)}</td><td data-l="Status">${statusTag(a.status)}</td><td data-l="Risk rating">${ratingLine(a)}</td><td data-l="Renewal date" class="${a.review_date && a.review_date < today() ? 'od-t' : ''}">${fd(a.review_date)}</td><td data-l="Sign-offs">${a.published_version ? `${n}${aud ? ' of ' + aud : ''} on v${a.published_version}` : '—'}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function vRAs() {
  const q = S.q.toLowerCase();
  const list = [...rows('assessments')].filter((a) => (!S.fClient || a.client_id === S.fClient) && (!S.fStatus || a.status === S.fStatus) && (!q || [a.title, a.ref, cName(a.client_id), sName(a.site_id)].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  return `<div class="page"><div class="panel" style="margin-bottom:16px"><div class="row"><input id="ras-q" type="search" placeholder="Search by name, ref, client or site…" value="${esc(S.q)}" data-ui="q" style="max-width:340px">
  ${CO() ? '' : `<select id="ras-c" data-ui="fClient" style="width:auto"><option value="">All clients</option>${rows('clients').map((c) => `<option value="${c.id}"${S.fClient === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`}
  <select id="ras-s" data-ui="fStatus" style="width:auto"><option value="">All statuses</option>${STATUSES.map((s) => `<option${S.fStatus === s ? ' selected' : ''}>${s}</option>`).join('')}</select>
  <button class="btn pri sp" data-act="newRA">+ Create risk assessment</button></div></div>
  <div class="sect"><h2>${list.length} risk assessment${list.length === 1 ? '' : 's'}</h2></div>
  ${list.length ? raTable(list) : empty(rows('assessments').length ? 'Nothing matches' : 'No risk assessments yet', rows('clients').length ? 'Create one for a client site, then pick hazards and controls from your registers.' : 'Onboard a client first.', rows('clients').length ? '<button class="btn pri" data-act="newRA">+ Create risk assessment</button>' : '<button class="btn pri" data-act="onboard">+ Onboard client</button>')}</div>`;
}
function topicOptions(sel) {
  const g = {}; rows('topic_library').filter((t) => t.active).forEach((t) => (g[t.sector] ||= []).push(t));
  return Object.keys(g).sort().map((s) => `<optgroup label="Topic library — ${esc(s)}">${g[s].sort((a, b) => a.title.localeCompare(b.title)).map((t) => `<option value="t:${t.id}"${t.id === sel ? ' selected' : ''}>${esc(t.title)}</option>`).join('')}</optgroup>`).join('');
}
function newRAModal(clientId, topicId) {
  if (!rows('clients').length) return onboardModal();
  const cid = clientId || rows('clients')[0].id;
  openModal(`<h3>Create risk assessment</h3><div class="g2"><label class="full">Name<input id="nr-t" placeholder="e.g. In house maintenance"></label>
  <label>Client<select id="nr-c">${rows('clients').map((c) => `<option value="${c.id}"${c.id === cid ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
  <label>Site<select id="nr-s">${clientSites(cid).map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
  <label class="full">Start from<select id="nr-from"><option value="">A blank assessment</option>${topicOptions(topicId)}<optgroup label="Copy an existing assessment">${[...rows('assessments')].sort((a, b) => (a.title || '').localeCompare(b.title || '')).map((a) => `<option value="a:${a.id}">${esc(a.title || 'Untitled')} (${esc(cName(a.client_id))} · ${esc(sName(a.site_id))})</option>`).join('')}</optgroup></select></label></div>
  <p class="hint">A topic brings in its description, people exposed, hazards, controls and ratings for you to adjust. Copying an assessment does the same, without actions, audits or sign-offs.</p>
  <div class="ft"><button class="btn" data-act="close">Cancel</button><button class="btn pri" data-act="newRASave">Create</button></div>`);
  $('#nr-from').onchange = (e) => { const v = e.target.value; if (!$('#nr-t').value.trim() && v.startsWith('t:')) $('#nr-t').value = byId('topic_library', v.slice(2))?.title || ''; };
  if (topicId) $('#nr-t').value = byId('topic_library', topicId)?.title || '';
  $('#nr-c').onchange = (e) => { $('#nr-s').innerHTML = clientSites(e.target.value).map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join(''); };
}
async function newRASave() {
  const fv = $('#nr-from').value, from = fv.startsWith('a:') ? byId('assessments', fv.slice(2)) : fv.startsWith('t:') ? byId('topic_library', fv.slice(2)) : null, isTopic = fv.startsWith('t:');
  const site = byId('sites', $('#nr-s').value); if (!site) return toast('Choose a site', true);
  const a = { id: uid(), ref: newRef(), title: $('#nr-t').value.trim() || from?.title || '', client_id: site.client_id, site_id: site.id, status: 'Draft', assessor: S.me.full_name || '', assessment_date: today(), review_date: addDays(today(), 365),
    topic_id: isTopic ? from.id : from?.topic_id || null, description: from?.description || null, people_exposed: from ? [...from.people_exposed] : ['Colleagues'], init_l: from?.init_l || 0, init_s: from?.init_s || 0, res_l: from?.res_l || 0, res_s: from?.res_s || 0, published_version: 0, updated_at: nowIso() };
  closeModal();
  try {
    await ins('assessments', a);
    if (from && isTopic) {
      // Each topic control goes under the first topic hazard it is linked to in the registers; others become general controls.
      const tH = rows('topic_hazards').filter((l) => l.topic_id === from.id).sort((x, y) => x.sort - y.sort), hmap = {};
      tH.forEach((l, i) => { const r = byId('hazard_register', l.hazard_id); if (!r) return; hmap[r.id] = uid(); ins('assessment_hazards', { id: hmap[r.id], assessment_id: a.id, register_id: r.id, title: r.title, category: r.category, description: r.description, sort: i }); });
      rows('topic_controls').filter((l) => l.topic_id === from.id).sort((x, y) => x.sort - y.sort).forEach((l, i) => {
        const r = byId('control_register', l.control_id); if (!r) return;
        const owner = tH.find((t) => hmap[t.hazard_id] && rows('hazard_register_controls').some((x) => x.hazard_id === t.hazard_id && x.control_id === r.id));
        ins('assessment_controls', { assessment_id: a.id, assessment_hazard_id: owner ? hmap[owner.hazard_id] : null, register_id: r.id, title: r.title, description: r.description, type: r.type, state: 'In place', sort: i });
      });
    } else if (from) {
      const hmap = {};
      for (const h of raHz(from.id)) { hmap[h.id] = uid(); ins('assessment_hazards', { id: hmap[h.id], assessment_id: a.id, register_id: h.register_id, title: h.title, category: h.category, description: h.description, risk_l: h.risk_l || 0, risk_s: h.risk_s || 0, people_affected: [...(h.people_affected || [])], sort: h.sort }); }
      for (const c of raCtl(from.id)) ins('assessment_controls', { assessment_id: a.id, assessment_hazard_id: hmap[c.assessment_hazard_id] || null, register_id: c.register_id, title: c.title, description: c.description, type: c.type, state: c.state, sort: c.sort });
    }
    location.hash = `#/ra/${a.id}/${from ? 'details' : 'hazards'}`;
  } catch (e) { /* shown */ }
}

function vRA(id, tab) {
  const a = byId('assessments', id); if (!a) return `<div class="page">${empty('Risk assessment not found', '')}</div>`;
  const tabs = [['details', 'Details'], ['hazards', 'Hazards and controls', raHz(id).length], ['rating', 'Overall rating'], ['actions', 'Actions', raActs(id).filter((x) => x.status !== 'Done').length], ['audits', 'Audits', rows('audits').filter((u) => u.assessment_id === id).length], ['summary', 'Summary and approval'], ['publish', 'Publish and sign-offs', raAcks(id).length], ['history', 'History']];
  if (tab === 'controls') tab = 'hazards';
  const fn = { details: tDetails, hazards: tHazards, controls: tHazards, rating: tRating, summary: tSummary, actions: tActions, audits: tAudits, publish: tPublish, history: tHistory }[tab] || tDetails;
  return `<div class="head"><div class="row"><a class="btn sm ghost" href="#/ras">← Risk assessments</a><div class="row sp"><button class="btn sm" data-act="pdf" data-id="${id}">Export PDF</button><button class="btn sm" data-act="dupRA" data-id="${id}">Copy to other sites</button><button class="btn sm dng" data-act="delRA" data-id="${id}">Delete</button></div></div>
  <h2>${esc(a.title || 'Untitled risk assessment')}</h2><div class="meta"><b style="color:var(--ink)">${esc(a.ref)}</b><span>${esc(cName(a.client_id))} · ${esc(sName(a.site_id))}</span>${statusTag(a.status)}${pubTag(a)}${(() => { const k = ctlScore(raCtl(a.id)); return `<span>Score <b style="color:var(--ink)">${pct(k)}</b></span><span>Flagged <b style="color:${k.f ? 'var(--vh)' : 'var(--ink)'}">${k.f}</b></span><span>Actions <b style="color:var(--ink)">${raActs(a.id).filter((x) => x.status !== 'Done').length}</b></span>`; })()}${a.approved_at ? '<span class="tag ok">Complete</span>' : '<span class="tag warn">Incomplete</span>'}<span>Renewal <b class="${a.review_date && a.review_date < today() ? 'od-t' : ''}">${fd(a.review_date)}</b></span></div>
  <nav class="tabs">${tabs.map(([k, l, n]) => `<a href="#/ra/${id}/${k}" class="${tab === k ? 'on' : ''}">${l}${n != null ? `<span class="n">${n}</span>` : ''}</a>`).join('')}</nav></div><div class="page">${fn(a)}</div>`;
}
function tDetails(a) {
  const id = a.id, ppl = a.people_exposed || [], extra = ppl.filter((p) => !PEOPLE.includes(p));
  return `<div class="panel"><div class="g2">${field(`assessments|${id}|title`, a.title, 'Name of the risk assessment', 'text', ' class="full"')}
  ${sel(`assessments|${id}|client_id`, a.client_id, rows('clients').map((c) => [c.id, c.name]), 'Client')}${sel(`assessments|${id}|site_id`, a.site_id, clientSites(a.client_id).map((s) => [s.id, s.name]), 'Site')}
  ${area(`assessments|${id}|description`, a.description, 'Description — what this assessment covers', ' class="full"')}
  <div class="full"><label>People exposed</label><div class="row" style="margin-top:6px">${PEOPLE.concat(extra).map((p) => `<label class="chk" style="border:1px solid var(--line);border-radius:20px;padding:6px 12px;background:${ppl.includes(p) ? 'var(--soft)' : '#fff'}"><input type="checkbox" data-act="ppl" data-v="${esc(p)}"${ppl.includes(p) ? ' checked' : ''}> ${esc(p)}</label>`).join('')}
  <input id="ppl-new" placeholder="Add other…" style="width:180px"><button class="btn sm" data-act="pplAdd">Add</button></div></div>
  ${field(`assessments|${id}|assessor`, a.assessor, 'Prepared by')}${field(`assessments|${id}|accompanied_by`, a.accompanied_by, 'Accompanied by')}${sel(`assessments|${id}|status`, a.status, STATUSES, 'Status')}
  ${field(`assessments|${id}|assessment_date`, a.assessment_date, 'Conducted on', 'date')}${field(`assessments|${id}|review_date`, a.review_date, 'Renewal date', 'date')}
  ${area(`assessments|${id}|notes`, a.notes, CO() ? 'Notes (not shown to staff)' : 'Internal notes (not shown to the client)', ' class="full"')}</div></div>
  <p class="hint">Next: pick the <a href="#/ra/${id}/hazards">hazards and their controls</a>.</p>`;
}
const hzCtl = (aid, hid) => raCtl(aid).filter((c) => (c.assessment_hazard_id || null) === (hid || null));
function suggestedFor(a, h) {
  if (!h.register_id) return [];
  const have = new Set(hzCtl(a.id, h.id).map((c) => c.register_id).filter(Boolean));
  return rows('hazard_register_controls').filter((l) => l.hazard_id === h.register_id && !have.has(l.control_id)).map((l) => byId('control_register', l.control_id)).filter((c) => c && c.active);
}
function ctlRow(a, c) {
  const act = rows('actions').find((x) => x.assessment_control_id === c.id);
  return `<div class="cbox"><div class="ctl">${sel(`assessment_controls|${c.id}|type`, c.type, CTYPES, '')}<input id="c-${c.id}-t" data-b="assessment_controls|${c.id}|title" value="${esc(c.title)}" placeholder="Control measure" aria-label="Control measure">${sel(`assessment_controls|${c.id}|state`, c.state, [['In place', 'Yes — in place'], ['Planned', 'No — not in place'], ['N/A', 'N/A']], '')}
  ${act ? `<a class="linked" href="#/ra/${a.id}/actions">✓ Action ${act.status === 'Done' ? 'done' : act.status.toLowerCase()}</a>` : c.state === 'Planned' ? `<button class="btn sm" data-act="ctlAct" data-id="${c.id}">Create action</button>` : '<span></span>'}<button class="btn sm ghost" data-act="delCtl" data-id="${c.id}" aria-label="Remove control">✕</button></div>
  <textarea id="c-${c.id}-d" data-b="assessment_controls|${c.id}|description" placeholder="Description (optional)" style="min-height:48px">${esc(c.description)}</textarea></div>`;
}
const RL = [[0, '–'], [1, '1 Rare'], [2, '2 Unlikely'], [3, '3 Possible'], [4, '4 Likely'], [5, '5 Almost certain']], RS = [[0, '–'], [1, '1 Negligible'], [2, '2 Minor'], [3, '3 Moderate'], [4, '4 Major'], [5, '5 Catastrophic']];
function hzMeta(a, h) {
  const rs = (h.risk_l || 0) * (h.risk_s || 0), pa = h.people_affected || [], acts = raActs(a.id).filter((x) => x.assessment_hazard_id === h.id);
  return `<div class="hzm"><div><h4>Risk score</h4><div class="row" style="flex-wrap:nowrap">${sel(`assessment_hazards|${h.id}|risk_l`, h.risk_l || 0, RL, '')}<span>×</span>${sel(`assessment_hazards|${h.id}|risk_s`, h.risk_s || 0, RS, '')}</div><div style="margin-top:6px">${chip(rs)}</div><p class="hint" style="margin-top:4px">Likelihood × severity, with the controls above in place.</p></div>
  <div><h4>Person affected</h4><div class="row">${PEOPLE.slice(0, 9).concat(pa.filter((p) => !PEOPLE.slice(0, 9).includes(p))).map((p) => `<button class="chipbtn${pa.includes(p) ? ' on' : ''}" data-act="hzPpl" data-h="${h.id}" data-v="${esc(p)}">${pa.includes(p) ? '✓ ' : ''}${esc(p)}</button>`).join('')}</div></div>
  <div class="full"><div class="row"><h4>Actions <span class="muted">(${acts.length})</span></h4><button class="btn sm sp" data-act="addAct" data-h="${h.id}">+ Add action</button></div>
  ${acts.length ? acts.map((x) => `<div class="li" style="padding:6px 0"><span class="tag ${x.status === 'Done' ? 'ok' : isOd(x) ? 'bad' : ''}">${esc(x.status)}</span><span><b>${esc(x.title || 'Untitled action')}</b><br><span class="muted">${esc(x.owner || 'No owner')} · due ${fd(x.due_date)}</span></span></div>`).join('') + `<a class="hint" href="#/ra/${a.id}/actions">Edit actions</a>` : '<p class="muted" style="margin:2px 0">No actions for this hazard.</p>'}</div></div>`;
}
function ctlBlock(a, h) {
  const list = hzCtl(a.id, h?.id), sug = h ? suggestedFor(a, h) : [], hid = h ? h.id : '';
  return `<div class="hzc"><div class="row" style="margin-bottom:8px"><h4 style="font-size:14.5px">Control measures <span class="muted">${h ? pct(ctlScore(list)) : '(' + list.length + ')'}</span></h4><div class="row sp"><button class="btn sm" data-act="ctlPick" data-h="${hid}">Choose from control register</button><button class="btn sm pri" data-act="ctlNew" data-h="${hid}">+ Create control</button></div></div>
  ${sug.length ? `<div class="sugg"><div class="row" style="margin-bottom:6px"><b style="font-size:13px">Suggested for this hazard</b><button class="btn sm sp" data-act="ctlAddAll" data-h="${hid}">Add all ${sug.length}</button></div><div class="row">${sug.map((c) => `<button class="chipbtn" data-act="ctlAddReg" data-id="${c.id}" data-h="${hid}">+ ${esc(c.title)}</button>`).join('')}</div></div>` : ''}
  ${list.length ? list.map((c) => ctlRow(a, c)).join('') : `<p class="muted" style="margin:4px 0">No controls yet — choose from the control register or create one.</p>`}</div>`;
}
function tHazards(a) {
  const hz = raHz(a.id), gen = raCtl(a.id).filter((c) => !c.assessment_hazard_id || !hz.some((h) => h.id === c.assessment_hazard_id));
  return `<div class="sect"><div><h2>Hazards and controls</h2><p class="hint">Pick the hazards for this activity, then choose or create the controls for each one.</p></div><div class="row"><button class="btn" data-act="hzCustom">+ Custom hazard</button><button class="btn pri" data-act="hzPick">+ Add hazards from register</button></div></div>
  ${hz.length ? hz.map((h, i) => `<div class="hz"><div class="hzh"><span class="hn">${i + 1}</span><input class="t" id="h-${h.id}-t" data-b="assessment_hazards|${h.id}|title" value="${esc(h.title)}" placeholder="Hazard, e.g. Fire" aria-label="Hazard">${sel(`assessment_hazards|${h.id}|category`, h.category, CATS, '')}<button class="btn sm ghost" data-act="delHz" data-id="${h.id}">Remove</button></div>
  <div style="margin-top:10px">${area(`assessment_hazards|${h.id}|description`, h.description, 'Description')}</div>${ctlBlock(a, h)}${hzMeta(a, h)}</div>`).join('')
    : empty('No hazards yet', 'Pick the hazards for this activity — for example Fire, Slips, trips and falls, Manual handling — from your hazard register, or add your own.', '<button class="btn pri" data-act="hzPick">+ Add hazards from register</button>')}
  ${gen.length ? `<div class="hz"><div class="hzh" style="grid-template-columns:auto minmax(0,1fr)"><span class="hn">+</span><b style="font-size:16px">General controls <span class="muted" style="font-weight:400">— apply to the whole activity</span></b></div>${ctlBlock(a, null)}</div>` : hz.length ? '<p class="hint"><a href="#" data-act="ctlNew" data-h="">+ Add a general control</a> that applies to the whole activity.</p>' : ''}
  ${hz.length ? `<p class="hint">Next: set the <a href="#/ra/${a.id}/rating">risk rating</a> without and with controls.</p>` : ''}`;
}
function tRating(a) {
  return `${ratingCard(a)}<div class="g2" style="margin-top:16px"><div class="panel"><h3 style="font-size:16px;margin-bottom:10px">Without controls</h3>${picker(a, 'init', 'pick')}</div><div class="panel"><h3 style="font-size:16px;margin-bottom:10px">With controls</h3>${picker(a, 'res', 'pick')}</div></div>
  <p class="hint">Score = likelihood × severity. 1–4 low, 5–9 medium, 10–16 high, 20–25 very high.</p>`;
}
function actionModal(a, hid) {
  const h = hid ? byId('assessment_hazards', hid) : null, r = h ? (h.risk_l || 0) * (h.risk_s || 0) : 0;
  openModal(`<h3>Raise an action${h ? ` — ${esc(h.title || 'hazard')}` : ''}</h3><div class="g2"><label class="full">What needs doing<textarea id="ac-t" style="min-height:70px" placeholder="e.g. Fit splash guards to both fryers"></textarea></label>
  <label>Owner<input id="ac-o" placeholder="Name"></label><label>Due date<input id="ac-d" type="date" value="${addDays(today(), r >= 10 ? 7 : 30)}"></label>
  <label>Priority<select id="ac-p">${PRI.map((p) => `<option${p === (r >= 20 ? 'Urgent' : r >= 10 ? 'High' : 'Medium') ? ' selected' : ''}>${p}</option>`).join('')}</select></label>
  <label>Hazard<select id="ac-h"><option value="">General</option>${raHz(a.id).map((x) => `<option value="${x.id}"${x.id === hid ? ' selected' : ''}>${esc(x.title || 'Untitled hazard')}</option>`).join('')}</select></label></div>
  <div class="ft"><button class="btn" data-act="close">Cancel</button><button class="btn pri" data-act="actSave">Raise action</button></div>`);
}
function tSummary(a) {
  const k = ctlScore(raCtl(a.id)), now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return `<div class="panel"><h3 style="font-size:16px;margin-bottom:10px">Summary</h3>${area(`assessments|${a.id}|summary`, a.summary, 'Comments')}
  <p class="hint">Score ${pct(k)} · ${k.f} control${k.f === 1 ? '' : 's'} not in place · ${raActs(a.id).filter((x) => x.status !== 'Done').length} open actions.</p></div>
  <div class="panel"><div class="sect"><h3>Approval</h3>${a.approved_at ? '<span class="tag ok">Complete</span>' : '<span class="tag warn">Incomplete</span>'}</div>
  ${a.approved_at ? `<div class="g2"><div><span class="muted">Approved by</span><br><b>${esc(a.approved_by)}</b></div><div><span class="muted">Date and time of approval</span><br><b>${ft(a.approved_at)}</b></div>
  <div class="full"><span class="muted">Approver's signature</span><br>${a.approval_signature ? `<img src="${esc(a.approval_signature)}" alt="Approver's signature" style="max-width:320px;border:1px solid var(--line);border-radius:6px;background:#fff">` : '—'}</div></div>
  <div class="row" style="margin-top:12px"><button class="btn sm" data-act="unapprove">Remove approval</button><span class="muted">Remove it to change and approve again.</span></div>`
    : `<div class="g2"><label>Approver's name<input id="ap-by" value="${esc(S.me.full_name || '')}"></label><label>Date and time of approval<input id="ap-at" type="datetime-local" value="${now}"></label></div>
  <label style="margin-top:12px">Approver's signature<canvas class="sigpad" id="sg-pad" aria-label="Signature pad"></canvas></label>
  <div class="row" style="margin-top:8px"><button class="btn sm" type="button" id="sg-clear">Clear signature</button><button class="btn pri sp" data-act="approve">Approve assessment</button></div>`}</div>
  <p class="hint">Approval marks the assessment Complete on the PDF. Publishing to the client is separate — see <a href="#/ra/${a.id}/publish">Publish and sign-offs</a>.</p>`;
}
function tActions(a) {
  const list = raActs(a.id).sort((x, y) => (x.status === 'Done') - (y.status === 'Done') || String(x.due_date || '9').localeCompare(String(y.due_date || '9')));
  const copts = [['', '—']].concat(raCtl(a.id).map((c) => { const h = byId('assessment_hazards', c.assessment_hazard_id); return [c.id, ((h ? h.title + ': ' : '') + (c.title || 'Untitled control')).slice(0, 60)]; }));
  const hopts = [['', 'General']].concat(raHz(a.id).map((h) => [h.id, (h.title || 'Untitled hazard').slice(0, 40)]));
  return `<div class="sect"><h2>Actions</h2><button class="btn pri" data-act="addAct">+ Add action</button></div>
  ${list.length ? `<div class="tw"><table class="stack"><thead><tr><th>Action</th><th>Hazard</th><th>Control</th><th>Owner</th><th>Due</th><th>Priority</th><th>Status</th><th></th></tr></thead><tbody>${list.map((x) => `<tr class="${isOd(x) ? 'od' : ''}"><td data-l="Action" style="min-width:220px"><input id="a-${x.id}-t" data-b="actions|${x.id}|title" value="${esc(x.title)}" placeholder="What needs doing" aria-label="Action"></td><td data-l="Hazard">${sel(`actions|${x.id}|assessment_hazard_id`, x.assessment_hazard_id || '', hopts, '')}</td>
  <td data-l="Control">${sel(`actions|${x.id}|assessment_control_id`, x.assessment_control_id || '', copts, '')}</td><td data-l="Owner"><input id="a-${x.id}-o" data-b="actions|${x.id}|owner" value="${esc(x.owner)}" aria-label="Owner"></td>
  <td data-l="Due"><input id="a-${x.id}-d" type="date" data-b="actions|${x.id}|due_date" value="${esc(x.due_date)}" aria-label="Due">${isOd(x) ? '<span class="od-t">Overdue</span>' : ''}</td><td data-l="Priority">${sel(`actions|${x.id}|priority`, x.priority, PRI, '')}</td>
  <td data-l="Status">${sel(`actions|${x.id}|status`, x.status, ASTAT, '')}${x.completed_on ? `<div class="muted">Done ${fd(x.completed_on)}</div>` : ''}</td><td><button class="btn sm ghost" data-act="delAct" data-id="${x.id}" aria-label="Delete action">✕</button></td></tr>`).join('')}</tbody></table></div><p class="hint">The client can see the live status of these actions in their portal.</p>`
    : empty('No actions', 'Add actions here, from a planned control, or from an audit finding.', '')}`;
}
function tAudits(a) {
  const d = S.draft && S.draft.ra === a.id ? S.draft : null, list = rows('audits').filter((u) => u.assessment_id === a.id).sort((x, y) => y.created_at.localeCompare(x.created_at));
  if (d) {
    const p = auditScore(d.items);
    return `<div class="sect"><h2>New audit</h2><div class="row"><button class="btn" data-act="auDiscard">Discard</button><button class="btn pri" data-act="auComplete">Complete audit</button></div></div>
    <div class="panel"><div class="score"><b style="color:${p == null ? 'inherit' : ocol(p)}">${p == null ? '—' : p + '%'}</b><span>${auditOutcome(p)} · ${d.items.filter((i) => i.a).length} of ${d.items.length} answered</span></div>
    <div class="g2"><label>Auditor<input id="au-auditor" data-au="auditor" value="${esc(d.auditor)}"></label><label>Audit date<input id="au-date" type="date" data-au="date" value="${esc(d.date)}"></label></div>
    ${d.items.map((it, i) => `<div class="aq"><span><b>${i + 1}.</b> ${esc(it.q)}</span><div class="seg">${['Yes', 'Partial', 'No', 'N/A'].map((v) => `<button class="${it.a === v ? 'on' : ''}" data-act="auAns" data-i="${i}" data-v="${v}">${v}</button>`).join('')}</div>
    ${it.a === 'No' || it.a === 'Partial' ? `<div class="nt"><input id="au-n${i}" data-au="n${i}" value="${esc(it.note)}" placeholder="Finding — what was wrong?">${it.act ? '<span class="linked">✓ Action raised</span>' : `<button class="btn sm" data-act="auRaise" data-i="${i}">Raise action</button>`}</div>` : ''}</div>`).join('')}
    <div class="g2" style="margin-top:14px"><label class="full">Summary<textarea id="au-sum" data-au="summary">${esc(d.summary)}</textarea></label><label>Set next renewal date<input id="au-next" type="date" data-au="next" value="${esc(d.next)}"></label></div>
    <p class="hint">Saved when you press Complete audit. Completed audits can't be changed.</p></div>`;
  }
  return `<div class="sect"><h2>Audits</h2><button class="btn pri" data-act="auStart">+ Start audit</button></div>
  ${list.length ? list.map((u) => `<details class="panel"><summary style="cursor:pointer;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><b style="font-size:22px;color:${ocol(u.score)}">${u.score}%</b><b>${esc(u.outcome)}</b><span class="muted">${fd(u.audit_date)} · ${esc(u.auditor || person(u.created_by))}</span></summary>${u.summary ? `<p>${esc(u.summary)}</p>` : ''}<ul>${(u.items || []).map((it) => `<li>${esc(it.q)} — <b>${esc(it.a || 'Not answered')}</b>${it.note ? ': ' + esc(it.note) : ''}</li>`).join('')}</ul></details>`).join('')
    : empty('No audits yet', 'Audit the assessment on site against a checklist and get a score.', '')}`;
}
function tPublish(a) {
  const pubs = raPubs(a.id), acks = raAcks(a.id), aud = audienceFor(a), cur = a.published_version;
  const signedBy = new Set(acks.filter((k) => k.version === cur && k.method === 'Own account').map((k) => k.user_id));
  const prof = (email) => rows('profiles').find((p) => p.email === email);
  if (!S.sigs[a.id]) loadSigs(a.id);
  return `<div class="g2"><div class="panel"><h3 style="font-size:16px;margin-bottom:8px">Publish to the client portal</h3>
  <p class="muted" style="margin-top:0">${cur ? `The client can see <b>version ${cur}</b>, published ${ft(pubs[0]?.published_at)}. After changes, publish a new version — staff will be asked to sign again.` : 'Not published yet. The client sees nothing until you publish.'}</p>
  <label>Note for this version (optional)<input id="pub-note" placeholder="e.g. Added lone working controls"></label>
  <div class="row" style="margin-top:12px"><button class="btn pri" data-act="publish" data-id="${a.id}">${cur ? 'Publish version ' + (cur + 1) : 'Publish version 1'}</button>${a.status === 'Draft' ? '<span class="muted">Status will change to Active.</span>' : ''}</div>
  ${pubs.length ? `<h4 style="margin:16px 0 6px">Versions</h4>${pubs.map((p) => `<div class="li"><span class="tag ok">v${p.version}</span><span>${ft(p.published_at)} · ${esc(person(p.published_by))}${p.note ? '<br><span class="muted">' + esc(p.note) + '</span>' : ''}</span></div>`).join('')}` : ''}</div>
  <div class="panel"><div class="sect"><h3>Who has signed version ${cur || '–'}</h3><button class="btn sm" data-act="invite" data-client="${a.client_id}">+ Portal user</button></div>
  ${aud.length ? aud.map((i) => { const p = prof(i.email), ok = p && signedBy.has(p.id); return `<div class="li">${ok ? '<span class="tag ok">Signed</span>' : cur ? '<span class="tag warn">Not yet</span>' : '<span class="tag">—</span>'}<span><b>${esc(i.full_name || i.email)}</b> · ${i.role === 'client_admin' ? 'Manager' : 'Staff'}<br><span class="muted">${esc(i.email)}${p ? '' : ' · hasn\'t signed in yet'}</span></span></div>`; }).join('') : '<p class="muted">No portal users can see this site yet. Add them on the client page.</p>'}
  <p class="hint">In-person sign-offs appear in the record below.</p></div></div>
  <div class="panel"><div class="sect"><h3>Acknowledgement record</h3><div class="row">${cur ? `<button class="btn sm" data-act="signInPerson" data-id="${a.id}">Record in-person sign-off</button>` : ''}<button class="btn sm" data-act="ackPdf" data-id="${a.id}">Export sign-offs PDF</button></div></div>
  ${acks.length ? ackTable(acks, S.sigs[a.id] || {}) : '<p class="muted">No sign-offs yet.</p>'}</div>`;
}
function ackTable(acks, sigs, showRA) {
  return `<div class="tw"><table class="stack"><thead><tr><th>Signed</th><th>Name</th><th>Job title</th>${showRA ? '<th>Assessment</th><th>Client · site</th>' : ''}<th>Version</th><th>Method</th><th>Signature</th></tr></thead><tbody>${acks.map((k) => { const a = byId('assessments', k.assessment_id); return `<tr><td data-l="Signed">${ft(k.acknowledged_at)}</td><td data-l="Name"><b>${esc(k.full_name)}</b><br><span class="muted">${esc(k.email || '')}</span></td><td data-l="Job title">${esc(k.job_title || '—')}</td>${showRA ? `<td data-l="Assessment"><a href="#/ra/${k.assessment_id}/publish">${esc(a?.title || '')}</a></td><td data-l="Client · site">${esc(cName(a?.client_id))} · ${esc(sName(k.site_id))}</td>` : ''}<td data-l="Version">v${k.version}</td><td data-l="Method">${esc(k.method)}${k.method === 'In person' ? `<br><span class="muted">by ${esc(person(k.user_id))}</span>` : ''}</td><td data-l="Signature">${sigs[k.id] ? `<img class="sig" src="${esc(sigs[k.id])}" alt="Signature of ${esc(k.full_name)}">` : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
}
async function loadSigs(aid) {
  S.sigs[aid] = {};
  const { data } = await sb.from('acknowledgements').select('id,signature').eq('assessment_id', aid);
  (data || []).forEach((r) => (S.sigs[aid][r.id] = r.signature && r.signature.startsWith('data:image/') ? r.signature : ''));
  if (route[0] === 'ra' && route[1] === aid) window.__render();
}
function tHistory(a) {
  if (!S.logs[a.id]) {
    S.logs[a.id] = 'loading';
    sb.from('activity_log').select('*').eq('assessment_id', a.id).order('created_at', { ascending: false }).limit(500).then(({ data, error }) => { S.logs[a.id] = error ? [] : data; window.__render(); });
  }
  const L = S.logs[a.id];
  return `<div class="sect"><h2>History</h2><button class="btn sm" data-act="reloadLog" data-id="${a.id}">Refresh</button></div><div class="panel log"><ul>${L === 'loading' ? '<li>Loading…</li>' : L.length ? L.map((l) => `<li><span class="muted">${ft(l.created_at)}</span><b>${esc(person(l.user_id))}</b><span>${esc(l.action)}</span></li>`).join('') : '<li>No history yet.</li>'}</ul></div>`;
}

// pick from registers
function pickModal(kind, a, hid) {
  const isHz = kind === 'hz', h = hid ? byId('assessment_hazards', hid) : null, reg = rows(isHz ? 'hazard_register' : 'control_register').filter((r) => r.active);
  const have = new Set((isHz ? raHz(a.id) : hzCtl(a.id, hid)).map((x) => x.register_id));
  const sugIds = new Set(!isHz && h?.register_id ? rows('hazard_register_controls').filter((l) => l.hazard_id === h.register_id).map((l) => l.control_id) : []);
  const groups = {}; reg.forEach((r) => (groups[isHz ? r.category : sugIds.has(r.id) ? ' Suggested for this hazard' : r.type] ||= []).push(r));
  openModal(`<h3>${isHz ? 'Add hazards from the hazard register' : `Choose controls${h ? ` for “${esc(h.title || 'this hazard')}”` : ' (general)'}`}</h3><input id="pk-q" type="search" placeholder="Search…" style="margin-bottom:10px">
  <div class="pick" id="pk-list">${Object.keys(groups).sort().map((g) => `<div class="cat">${esc(g.trim())}</div>${groups[g].sort((x, y) => x.title.localeCompare(y.title)).map((r) => `<label class="opt" data-txt="${esc((r.title + ' ' + (r.description || '')).toLowerCase())}"><input type="checkbox" value="${r.id}"${have.has(r.id) ? ' checked disabled' : ''}><span><b>${esc(r.title)}</b>${have.has(r.id) ? ' <span class="muted">(added)</span>' : ''}<br><span class="muted">${esc(r.description || '')}</span></span></label>`).join('')}`).join('') || '<p class="muted" style="padding:12px">The register is empty. Add entries on the register page.</p>'}</div>
  <div class="ft">${isHz ? '' : `<button class="btn" data-act="ctlNew" data-h="${hid || ''}" style="margin-right:auto">+ Create a new control instead</button>`}<button class="btn" data-act="close">Cancel</button><button class="btn pri" data-act="${isHz ? 'hzPickSave' : 'ctlPickSave'}" data-h="${hid || ''}">Add selected</button></div>`, true);
  $('#pk-q').oninput = (e) => { const q = e.target.value.toLowerCase(); document.querySelectorAll('#pk-list .opt').forEach((o) => (o.style.display = o.dataset.txt.includes(q) ? '' : 'none')); };
}
function ctlNewModal(a, hid) {
  const h = hid ? byId('assessment_hazards', hid) : null;
  openModal(`<h3>Create a control${h ? ` for “${esc(h.title || 'this hazard')}”` : ' (general)'}</h3><div class="g2"><label class="full">Control measure<input id="cn-t" placeholder="e.g. Fire extinguishers checked monthly"></label>
  <label>Type<select id="cn-y">${CTYPES.map((t) => `<option${t === 'Administrative' ? ' selected' : ''}>${t}</option>`).join('')}</select></label><label>Status<select id="cn-s"><option value="In place">Yes — in place</option><option value="Planned">No — not in place</option><option value="N/A">N/A</option></select></label>
  <label class="full">Description (optional)<textarea id="cn-d"></textarea></label>
  ${CO() ? '' : `<label class="chk full"><input type="checkbox" id="cn-reg" checked> Also save to the control register${h?.register_id ? ' and suggest it for this hazard next time' : ''}</label>`}</div>
  <div class="ft"><button class="btn" data-act="close">Cancel</button><button class="btn pri" data-act="ctlNewSave" data-h="${hid || ''}">Add control</button></div>`);
}
async function ctlNewSave(a, hid) {
  const title = $('#cn-t').value.trim(); if (!title) return toast('Enter the control measure', true);
  const type = $('#cn-y').value, state = $('#cn-s').value, description = $('#cn-d').value.trim() || null, toReg = !CO() && !!$('#cn-reg')?.checked, h = hid ? byId('assessment_hazards', hid) : null;
  closeModal();
  let register_id = null;
  try {
    if (toReg) {
      register_id = uid(); await ins('control_register', { id: register_id, title, type, description });
      if (h?.register_id) { const row = { hazard_id: h.register_id, control_id: register_id }; rows('hazard_register_controls').push(row); queue(() => sb.from('hazard_register_controls').insert(row)).catch(() => {}); }
    }
    await ins('assessment_controls', { assessment_id: a.id, assessment_hazard_id: hid || null, register_id, title, type, description, state, sort: raCtl(a.id).length });
    toast(toReg ? 'Control added and saved to the register' : 'Control added');
  } catch (e) { /* shown */ }
  window.__render();
}
const addCtlFromReg = (a, r, i = 0, hid = null) => ins('assessment_controls', { assessment_id: a.id, assessment_hazard_id: hid || null, register_id: r.id, title: r.title, description: r.description, type: r.type, state: 'In place', sort: raCtl(a.id).length + i });

// ---------- topic library ----------
const tHz = (id) => rows('topic_hazards').filter((l) => l.topic_id === id).sort((a, b) => a.sort - b.sort);
const tCt = (id) => rows('topic_controls').filter((l) => l.topic_id === id).sort((a, b) => a.sort - b.sort);
function vTopics() {
  const q = S.tq.toLowerCase(), list = rows('topic_library').filter((t) => (!S.tsec || t.sector === S.tsec) && (!q || (t.title + ' ' + (t.description || '') + ' ' + t.sector).toLowerCase().includes(q)));
  const secs = [...new Set(rows('topic_library').map((t) => t.sector))].sort(), g = {};
  list.forEach((t) => (g[t.sector] ||= []).push(t));
  return `<div class="page"><div class="sect"><div><h2>Topic library</h2><p class="hint">Ready-made Safetybiz risk assessments. Start an assessment from a topic, then tailor it to the site.${SUPER() ? '' : ' Only a Safetybiz superadmin can change the library.'}</p></div>${SUPER() ? '<button class="btn pri" data-act="tEdit">+ Add topic</button>' : ''}</div>
  <div class="row" style="margin-bottom:12px"><input id="tq" type="search" data-ui="tq" value="${esc(S.tq)}" placeholder="Search topics…" style="max-width:320px"><select id="tsec" data-ui="tsec" style="width:auto"><option value="">All sectors</option>${secs.map((s) => `<option${S.tsec === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select><span class="muted">${list.length} topics</span></div>
  ${list.length ? Object.keys(g).sort().map((s) => `<h3 style="font-size:16px;margin:18px 0 8px">${esc(s)} <span class="muted">(${g[s].length})</span></h3><div class="tw"><table class="stack"><thead><tr><th>Topic</th><th>Hazards</th><th>Controls</th><th>With controls</th><th>Used</th><th></th></tr></thead><tbody>${g[s].sort((a, b) => a.title.localeCompare(b.title)).map((t) => `<tr${SUPER() ? ` class="click" data-act="tEdit" data-id="${t.id}"` : ''}><td data-l="Topic"><b>${esc(t.title)}</b>${t.active ? '' : ' <span class="tag">Retired</span>'}<br><span class="muted">${esc((t.description || '').slice(0, 140))}</span></td><td data-l="Hazards">${tHz(t.id).length}</td><td data-l="Controls">${tCt(t.id).length}</td><td data-l="With controls">${chip(scoreOf(t, 'res'), true)}</td><td data-l="Used">${rows('assessments').filter((a) => a.topic_id === t.id).length}</td><td><button class="btn sm pri" data-act="newRA" data-topic="${t.id}">Use</button></td></tr>`).join('')}</tbody></table></div>`).join('') : empty('No topics', 'Run seed.sql for the Safetybiz starter library, or add your own.', '')}</div>`;
}
function topicModal(id) {
  const t = id ? byId('topic_library', id) : { title: '', sector: S.tsec || 'General', description: '', people_exposed: ['Colleagues'], init_l: 0, init_s: 0, res_l: 0, res_s: 0, active: true };
  const hs = new Set(tHz(id).map((l) => l.hazard_id)), cs = new Set(tCt(id).map((l) => l.control_id)), secs = [...new Set(rows('topic_library').map((x) => x.sector))].sort();
  const num = (k, lbl) => `<label>${lbl}<select id="te-${k}">${[0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}"${+t[k] === n ? ' selected' : ''}>${n || '–'}</option>`).join('')}</select></label>`;
  const list = (idp, items, have) => `<input type="search" placeholder="Search…" data-filter="${idp}" style="margin-bottom:6px"><div class="pick" id="${idp}" style="max-height:30vh">${items.map((r) => `<label class="opt" data-txt="${esc(r.title.toLowerCase())}"><input type="checkbox" value="${r.id}"${have.has(r.id) ? ' checked' : ''}><span>${esc(r.title)} <span class="muted">· ${esc(r.category || r.type)}</span></span></label>`).join('')}</div>`;
  openModal(`<h3>${id ? 'Edit topic' : 'Add topic'}</h3><div class="g2"><label class="full">Title<input id="te-t" value="${esc(t.title)}"></label>
  <label>Sector<input id="te-s" list="te-secs" value="${esc(t.sector)}"><datalist id="te-secs">${secs.map((s) => `<option value="${esc(s)}">`).join('')}</datalist></label><label class="chk" style="align-self:end"><input type="checkbox" id="te-a"${t.active ? ' checked' : ''}> Active</label>
  <label class="full">Description<textarea id="te-d">${esc(t.description)}</textarea></label>
  <div class="full"><label>People exposed</label><div class="row" style="margin-top:4px">${PEOPLE.map((p) => `<label class="chk"><input type="checkbox" class="te-p" value="${esc(p)}"${(t.people_exposed || []).includes(p) ? ' checked' : ''}> ${esc(p)}</label>`).join('')}</div></div>
  <div class="full g3" style="grid-template-columns:repeat(4,minmax(0,1fr))">${num('init_l', 'Likelihood without controls')}${num('init_s', 'Severity without controls')}${num('res_l', 'Likelihood with controls')}${num('res_s', 'Severity with controls')}</div></div>
  <h4 style="margin:16px 0 6px">Hazards</h4>${list('te-hz', [...rows('hazard_register')].sort((a, b) => a.title.localeCompare(b.title)), hs)}
  <h4 style="margin:16px 0 6px">Control measures</h4>${list('te-ct', [...rows('control_register')].sort((a, b) => a.title.localeCompare(b.title)), cs)}
  <div class="ft">${id ? `<button class="btn dng" data-act="tDel" data-id="${id}" style="margin-right:auto">Delete</button>` : ''}<button class="btn" data-act="close">Cancel</button><button class="btn pri" data-act="tSave" data-id="${id || ''}">Save topic</button></div>`, true);
  document.querySelectorAll('[data-filter]').forEach((inp) => (inp.oninput = () => { const q = inp.value.toLowerCase(); document.querySelectorAll('#' + inp.dataset.filter + ' .opt').forEach((o) => (o.style.display = o.dataset.txt.includes(q) ? '' : 'none')); }));
}
async function topicSave(id) {
  const title = $('#te-t').value.trim(); if (!title) return toast('Enter a title', true);
  const patch = { title, sector: $('#te-s').value.trim() || 'General', description: $('#te-d').value.trim() || null, active: $('#te-a').checked,
    people_exposed: [...document.querySelectorAll('.te-p:checked')].map((i) => i.value), init_l: +$('#te-init_l').value, init_s: +$('#te-init_s').value, res_l: +$('#te-res_l').value, res_s: +$('#te-res_s').value };
  const wantH = [...document.querySelectorAll('#te-hz input:checked')].map((i) => i.value), wantC = [...document.querySelectorAll('#te-ct input:checked')].map((i) => i.value);
  closeModal();
  if (id) upd('topic_library', id, patch); else { id = uid(); await ins('topic_library', { id, ...patch }).catch(() => {}); }
  for (const [tbl, key, want] of [['topic_hazards', 'hazard_id', wantH], ['topic_controls', 'control_id', wantC]]) {
    const have = rows(tbl).filter((l) => l.topic_id === id);
    for (const l of have) if (!want.includes(l[key])) { D[tbl] = rows(tbl).filter((x) => x !== l); queue(() => sb.from(tbl).delete().eq('topic_id', id).eq(key, l[key])); }
    want.forEach((v, i) => { if (!have.some((l) => l[key] === v)) { const row = { topic_id: id, [key]: v, sort: have.length + i }; rows(tbl).push(row); queue(() => sb.from(tbl).insert(row)); } });
  }
  toast('Topic saved'); window.__render();
}

// ---------- registers ----------
function vHazReg() {
  const q = S.hq.toLowerCase(), list = [...rows('hazard_register')].filter((h) => (!S.hcat || h.category === S.hcat) && (!q || (h.title + ' ' + (h.description || '')).toLowerCase().includes(q))).sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  return `<div class="page"><div class="sect"><div><h2>Hazard register</h2><p class="hint">Your library of hazards. Pick from it when building a client's assessment. Linked controls are suggested automatically.</p></div><button class="btn pri" data-act="hzEdit">+ Add hazard</button></div>
  <div class="row" style="margin-bottom:12px"><input id="hq" type="search" data-ui="hq" value="${esc(S.hq)}" placeholder="Search hazards…" style="max-width:320px"><select id="hcat" data-ui="hcat" style="width:auto"><option value="">All categories</option>${CATS.map((c) => `<option${S.hcat === c ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
  ${list.length ? `<div class="tw"><table class="stack"><thead><tr><th>Hazard</th><th>Category</th><th>Suggested controls</th><th>Used in</th><th>Status</th></tr></thead><tbody>${list.map((h) => `<tr class="click" data-act="hzEdit" data-id="${h.id}"><td data-l="Hazard"><b>${esc(h.title)}</b><br><span class="muted">${esc((h.description || '').slice(0, 120))}</span></td><td data-l="Category">${esc(h.category)}</td><td data-l="Suggested controls">${rows('hazard_register_controls').filter((l) => l.hazard_id === h.id).length}</td><td data-l="Used in">${new Set(rows('assessment_hazards').filter((x) => x.register_id === h.id).map((x) => x.assessment_id)).size} assessments</td><td data-l="Status">${h.active ? '<span class="tag ok">Active</span>' : '<span class="tag">Retired</span>'}</td></tr>`).join('')}</tbody></table></div>` : empty('No hazards', 'Add hazards, or run seed.sql for a starter register.', '')}</div>`;
}
function hzEditModal(id) {
  const h = id ? byId('hazard_register', id) : { title: '', category: 'Other', description: '', active: true };
  const linked = new Set(rows('hazard_register_controls').filter((l) => l.hazard_id === id).map((l) => l.control_id));
  openModal(`<h3>${id ? 'Edit hazard' : 'Add hazard'}</h3><div class="g2"><label class="full">Hazard<input id="he-t" value="${esc(h.title)}"></label><label>Category<select id="he-c">${CATS.map((c) => `<option${c === h.category ? ' selected' : ''}>${c}</option>`).join('')}</select></label><label class="chk" style="align-self:end"><input type="checkbox" id="he-a"${h.active ? ' checked' : ''}> Active (shown when picking)</label><label class="full">Description<textarea id="he-d">${esc(h.description)}</textarea></label></div>
  <h4 style="margin:16px 0 6px">Suggested controls</h4><input id="pk-q" type="search" placeholder="Search controls…" style="margin-bottom:8px"><div class="pick" id="pk-list" style="max-height:34vh">${[...rows('control_register')].sort((a, b) => a.title.localeCompare(b.title)).map((c) => `<label class="opt" data-txt="${esc(c.title.toLowerCase())}"><input type="checkbox" value="${c.id}"${linked.has(c.id) ? ' checked' : ''}><span>${esc(c.title)} <span class="muted">· ${esc(c.type)}</span></span></label>`).join('')}</div>
  <div class="ft">${id ? `<button class="btn dng" data-act="hzRegDel" data-id="${id}" style="margin-right:auto">Delete</button>` : ''}<button class="btn" data-act="close">Cancel</button><button class="btn pri" data-act="hzRegSave" data-id="${id || ''}">Save</button></div>`, true);
  $('#pk-q').oninput = (e) => { const q = e.target.value.toLowerCase(); document.querySelectorAll('#pk-list .opt').forEach((o) => (o.style.display = o.dataset.txt.includes(q) ? '' : 'none')); };
}
async function hzRegSave(id) {
  const t = $('#he-t').value.trim(); if (!t) return toast('Enter the hazard', true);
  const patch = { title: t, category: $('#he-c').value, description: $('#he-d').value.trim() || null, active: $('#he-a').checked };
  const want = new Set([...document.querySelectorAll('#pk-list input:checked')].map((i) => i.value));
  closeModal();
  if (id) upd('hazard_register', id, patch); else { id = uid(); await ins('hazard_register', { id, ...patch }); }
  const have = rows('hazard_register_controls').filter((l) => l.hazard_id === id);
  for (const l of have) if (!want.has(l.control_id)) { D.hazard_register_controls = rows('hazard_register_controls').filter((x) => x !== l); queue(() => sb.from('hazard_register_controls').delete().eq('hazard_id', id).eq('control_id', l.control_id)); }
  for (const cid of want) if (!have.some((l) => l.control_id === cid)) { const row = { hazard_id: id, control_id: cid }; rows('hazard_register_controls').push(row); queue(() => sb.from('hazard_register_controls').insert(row)); }
  window.__render();
}
function vCtlReg() {
  const q = S.cq.toLowerCase(), list = [...rows('control_register')].filter((c) => !q || (c.title + ' ' + (c.description || '')).toLowerCase().includes(q)).sort((a, b) => CTYPES.indexOf(a.type) - CTYPES.indexOf(b.type) || a.title.localeCompare(b.title));
  return `<div class="page"><div class="sect"><div><h2>Control register</h2><p class="hint">Your library of control measures, ordered by the hierarchy of control.</p></div><button class="btn pri" data-act="ctlEdit">+ Add control</button></div>
  <input id="cq" type="search" data-ui="cq" value="${esc(S.cq)}" placeholder="Search controls…" style="max-width:320px;margin-bottom:12px">
  ${list.length ? `<div class="tw"><table class="stack"><thead><tr><th>Control measure</th><th>Type</th><th>Linked hazards</th><th>Used in</th><th>Status</th></tr></thead><tbody>${list.map((c) => `<tr class="click" data-act="ctlEdit" data-id="${c.id}"><td data-l="Control"><b>${esc(c.title)}</b><br><span class="muted">${esc((c.description || '').slice(0, 120))}</span></td><td data-l="Type">${esc(c.type)}</td><td data-l="Linked hazards">${rows('hazard_register_controls').filter((l) => l.control_id === c.id).length}</td><td data-l="Used in">${new Set(rows('assessment_controls').filter((x) => x.register_id === c.id).map((x) => x.assessment_id)).size} assessments</td><td data-l="Status">${c.active ? '<span class="tag ok">Active</span>' : '<span class="tag">Retired</span>'}</td></tr>`).join('')}</tbody></table></div>` : empty('No controls', 'Add control measures, or run seed.sql for a starter register.', '')}</div>`;
}
function ctlEditModal(id) {
  const c = id ? byId('control_register', id) : { title: '', type: 'Administrative', description: '', active: true };
  openModal(`<h3>${id ? 'Edit control' : 'Add control'}</h3><div class="g2"><label class="full">Control measure<input id="ce-t" value="${esc(c.title)}"></label><label>Type<select id="ce-y">${CTYPES.map((t) => `<option${t === c.type ? ' selected' : ''}>${t}</option>`).join('')}</select></label><label class="chk" style="align-self:end"><input type="checkbox" id="ce-a"${c.active ? ' checked' : ''}> Active</label><label class="full">Description<textarea id="ce-d">${esc(c.description)}</textarea></label></div>
  <p class="hint">Link it to hazards from the hazard's edit screen.</p><div class="ft">${id ? `<button class="btn dng" data-act="ctlRegDel" data-id="${id}" style="margin-right:auto">Delete</button>` : ''}<button class="btn" data-act="close">Cancel</button><button class="btn pri" data-act="ctlRegSave" data-id="${id || ''}">Save</button></div>`);
}

// ---------- actions / sign-offs / team ----------
function vActions() {
  const f = S.af, list = rows('actions').filter((x) => (f === 'all' || (f === 'open' && x.status !== 'Done') || (f === 'overdue' && isOd(x)) || (f === 'done' && x.status === 'Done')) && (!S.fClient || byId('assessments', x.assessment_id)?.client_id === S.fClient))
    .sort((x, y) => (x.status === 'Done') - (y.status === 'Done') || String(x.due_date || '9').localeCompare(String(y.due_date || '9')));
  return `<div class="page"><div class="sect"><h2>Actions</h2><div class="row"><select id="af-c" data-ui="fClient" style="width:auto"><option value="">All clients</option>${rows('clients').map((c) => `<option value="${c.id}"${S.fClient === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select><div class="seg">${[['open', 'Open'], ['overdue', 'Overdue'], ['done', 'Done'], ['all', 'All']].map(([k, l]) => `<button class="${f === k ? 'on' : ''}" data-act="af" data-v="${k}">${l}</button>`).join('')}</div></div></div>
  ${list.length ? `<div class="tw"><table class="stack"><thead><tr><th>Action</th><th>Assessment</th><th>Owner</th><th>Due</th><th>Priority</th><th>Status</th></tr></thead><tbody>${list.map((x) => { const a = byId('assessments', x.assessment_id); return `<tr class="${isOd(x) ? 'od' : ''}"><td data-l="Action"><b>${esc(x.title || 'Untitled')}</b></td><td data-l="Assessment"><a href="#/ra/${x.assessment_id}/actions">${esc(a?.title || '')}</a><br><span class="muted">${esc(cName(a?.client_id))} · ${esc(sName(a?.site_id))}</span></td><td data-l="Owner">${esc(x.owner || '—')}</td><td data-l="Due" class="${isOd(x) ? 'od-t' : ''}">${fd(x.due_date)}</td><td data-l="Priority">${esc(x.priority)}</td><td data-l="Status">${sel(`actions|${x.id}|status`, x.status, ASTAT, '')}</td></tr>`; }).join('')}</tbody></table></div>` : empty('No actions here', 'Actions are raised inside each risk assessment.', '')}</div>`;
}
function filteredAcks() {
  const f = S.so;
  return [...rows('acknowledgements')].filter((k) => { const a = byId('assessments', k.assessment_id); return a && (!f.c || a.client_id === f.c) && (!f.s || k.site_id === f.s) && (!f.a || a.id === f.a) && (!f.from || k.acknowledged_at.slice(0, 10) >= f.from) && (!f.to || k.acknowledged_at.slice(0, 10) <= f.to); })
    .sort((a, b) => b.acknowledged_at.localeCompare(a.acknowledged_at));
}
function vSignoffs() {
  const f = S.so, list = filteredAcks(), sigs = Object.assign({}, ...Object.values(S.sigs));
  const ras = rows('assessments').filter((a) => !f.c || a.client_id === f.c);
  return `<div class="page"><div class="panel" style="margin-bottom:16px"><div class="row">
  <select id="so-c" data-so="c" style="width:auto"><option value="">All clients</option>${rows('clients').map((c) => `<option value="${c.id}"${f.c === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
  <select id="so-s" data-so="s" style="width:auto"><option value="">All sites</option>${rows('sites').filter((s) => !f.c || s.client_id === f.c).map((s) => `<option value="${s.id}"${f.s === s.id ? ' selected' : ''}>${esc(s.name)}${f.c ? '' : ' · ' + esc(cName(s.client_id))}</option>`).join('')}</select>
  <select id="so-a" data-so="a" style="width:auto;max-width:260px"><option value="">All assessments</option>${ras.map((a) => `<option value="${a.id}"${f.a === a.id ? ' selected' : ''}>${esc(a.title || a.ref)}</option>`).join('')}</select>
  <label style="flex-direction:row">From<input id="so-from" type="date" data-so="from" value="${esc(f.from || '')}" style="width:auto"></label><label>To<input id="so-to" type="date" data-so="to" value="${esc(f.to || '')}" style="width:auto"></label>
  <button class="btn pri sp" data-act="soPdf">Export PDF</button></div></div>
  <div class="sect"><h2>${list.length} sign-off${list.length === 1 ? '' : 's'}</h2></div>${list.length ? ackTable(list, sigs, true) : empty('No sign-offs', 'They appear here when client staff sign published assessments.', '')}</div>`;
}
async function fetchSigsFor(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 100) { const { data } = await sb.from('acknowledgements').select('id,signature').in('id', ids.slice(i, i + 100)); (data || []).forEach((r) => (out[r.id] = r.signature)); }
  return out;
}
function vTeam() {
  const admins = rows('profiles').filter((p) => p.role === 'admin'), pending = rows('portal_invites').filter((i) => i.role === 'admin' && !admins.some((p) => p.email === i.email));
  const access = (sup) => (sup ? '<span class="tag ok">Superadmin</span>' : '<span class="tag">Administrator</span>');
  const btns = (email, sup, self) => (SUPER() && !self ? `<div class="row" style="flex-wrap:nowrap"><button class="btn sm" data-act="superToggle" data-email="${esc(email)}" data-v="${sup ? '' : '1'}">${sup ? 'Make administrator' : 'Make superadmin'}</button><button class="btn sm ghost" data-act="adminRemove" data-email="${esc(email)}">Remove</button></div>` : '');
  return `<div class="page"><div class="sect"><div><h2>Safetybiz administrators</h2><p class="hint">Administrators work across every client: onboarding, risk assessments, registers, publishing and sign-off records. <b>Superadmins</b> can also add and remove administrators, delete clients and edit the topic library.</p></div>${SUPER() ? '<button class="btn pri" data-act="adminInvite">+ Add administrator</button>' : ''}</div>
  <div class="tw"><table class="stack"><thead><tr><th>Name</th><th>Email</th><th>Access</th><th>Status</th><th></th></tr></thead><tbody>${admins.map((p) => `<tr><td data-l="Name"><b>${esc(p.full_name || '—')}</b>${p.id === S.me.id ? ' <span class="muted">(you)</span>' : ''}</td><td data-l="Email">${esc(p.email)}</td><td data-l="Access">${access(p.is_super)}</td><td data-l="Status"><span class="tag ok">Active</span></td><td>${btns(p.email, p.is_super, p.id === S.me.id)}</td></tr>`).join('')}
  ${pending.map((i) => `<tr><td data-l="Name">${esc(i.full_name || '—')}</td><td data-l="Email">${esc(i.email)}</td><td data-l="Access">${access(i.is_super)}</td><td data-l="Status"><span class="tag">Invited</span></td><td>${btns(i.email, i.is_super, false)}</td></tr>`).join('')}</tbody></table></div>
  <p class="hint">${SUPER() ? 'New administrators sign in at ' + esc(location.origin + location.pathname) + ' with their email. People from a client company should be added on that client\'s page as a <b>Company administrator</b> instead, so they only see their own company.' : 'Only a superadmin can add or remove administrators.'}</p></div>`;
}

// ---------- copy assessments to other sites ----------
async function copyRA(src, site) {
  const a = { id: uid(), ref: newRef(), title: src.title, client_id: site.client_id, site_id: site.id, status: 'Draft', assessor: S.me.full_name || '', assessment_date: today(), review_date: addDays(today(), 365),
    topic_id: src.topic_id || null, description: src.description || null, activity: src.activity || null, people_exposed: [...(src.people_exposed || [])], init_l: src.init_l || 0, init_s: src.init_s || 0, res_l: src.res_l || 0, res_s: src.res_s || 0, published_version: 0, updated_at: nowIso() };
  await ins('assessments', a);
  const hmap = {}, jobs = [];
  for (const h of raHz(src.id)) { hmap[h.id] = uid(); jobs.push(ins('assessment_hazards', { id: hmap[h.id], assessment_id: a.id, register_id: h.register_id, title: h.title, category: h.category, description: h.description, risk_l: h.risk_l || 0, risk_s: h.risk_s || 0, people_affected: [...(h.people_affected || [])], sort: h.sort })); }
  for (const c of raCtl(src.id)) jobs.push(ins('assessment_controls', { assessment_id: a.id, assessment_hazard_id: hmap[c.assessment_hazard_id] || null, register_id: c.register_id, title: c.title, description: c.description, type: c.type, state: c.state, sort: c.sort }));
  await Promise.all(jobs);
  return a;
}
function copyModal(ids) {
  const src = ids.map((id) => byId('assessments', id)).filter(Boolean); if (!src.length) return;
  const from = new Set(src.map((a) => a.site_id));
  const groups = [...rows('clients')].sort((a, b) => a.name.localeCompare(b.name)).map((c) => [c, clientSites(c.id)]).filter(([, ss]) => ss.length);
  openModal(`<h3>Copy ${src.length === 1 ? '“' + esc(src[0].title || 'Untitled') + '”' : src.length + ' risk assessments'} to other sites</h3>
  ${src.length > 1 ? `<p class="muted" style="margin-top:-6px">${src.map((a) => esc(a.title || 'Untitled')).join(' · ')}</p>` : ''}
  <p class="hint" style="margin-top:0">Each site gets its own Draft copy with the hazards, controls, risk scores and people affected. Actions, audits, approval and sign-offs are not copied.</p>
  <input id="cp-q" type="search" placeholder="Search sites…" style="margin:8px 0">
  <div class="pick" id="cp-list">${groups.map(([c, ss]) => `${CO() ? '' : `<div class="cat">${esc(c.name)}</div>`}${ss.map((st) => `<label class="opt" data-txt="${esc((c.name + ' ' + st.name + ' ' + (st.address || '')).toLowerCase())}"><input type="checkbox" value="${st.id}"><span><b>${esc(st.name)}</b>${from.has(st.id) ? ' <span class="muted">(copying from here)</span>' : ''}<br><span class="muted">${esc(st.address || '')}</span></span></label>`).join('')}`).join('')}</div>
  <div class="ft"><span class="muted" id="cp-n" style="margin-right:auto">No sites chosen</span><button class="btn" data-act="close">Cancel</button><button class="btn pri" data-act="copySave" data-ids="${ids.join(',')}">Make copies</button></div>`, true);
  $('#cp-q').oninput = (e) => { const q = e.target.value.toLowerCase(); document.querySelectorAll('#cp-list .opt').forEach((o) => (o.style.display = o.dataset.txt.includes(q) ? '' : 'none')); };
  $('#cp-list').onchange = () => { const n = document.querySelectorAll('#cp-list input:checked').length, t = n * src.length; $('#cp-n').textContent = n ? `${n} site${n > 1 ? 's' : ''} · ${t} cop${t > 1 ? 'ies' : 'y'} will be made` : 'No sites chosen'; };
}
async function copySave(ids, btn) {
  const sites = [...document.querySelectorAll('#cp-list input:checked')].map((i) => byId('sites', i.value)).filter(Boolean);
  if (!sites.length) return toast('Choose at least one site', true);
  const src = ids.map((id) => byId('assessments', id)).filter(Boolean), total = sites.length * src.length;
  btn.disabled = true; let done = 0, failed = 0;
  for (const st of sites) for (const a of src) {
    btn.textContent = `Copying ${done + failed + 1} of ${total}…`;
    try { await copyRA(a, st); done++; } catch (e) { failed++; }
  }
  closeModal(); S.sel.clear();
  toast(failed ? `${done} copied, ${failed} failed` : `${done} draft cop${done === 1 ? 'y' : 'ies'} created`, !!failed);
  if (route[0] === 'ras') window.__render(); else location.hash = '#/ras';
}

// ---------- events ----------
export async function adminClick(e, b) {
  const d = b.dataset, aid = route[0] === 'ra' ? route[1] : null, a = aid && byId('assessments', aid);
  if (d.act && d.act.startsWith('cc') && (await ccClick(d, b))) return;
  switch (d.act) {
    case 'close': return closeModal();
    case 'copy': try { await navigator.clipboard.writeText(d.v); toast('Copied'); } catch { toast('Copy failed', true); } return;
    case 'onboard': return onboardModal();
    case 'onboardSave': return onboardSave();
    case 'addSite': await ins('sites', { client_id: d.id, name: 'New site' }); return window.__render();
    case 'delSite': if (await confirmBox('Remove this site? Sites with risk assessments cannot be removed.')) { await del('sites', d.id).catch(() => {}); window.__render(); } return;
    case 'delClient': if (await confirmBox('Delete this client, its sites and portal users? Clients with risk assessments cannot be deleted.')) { del('clients', d.id).then(() => (location.hash = '#/clients')).catch(() => {}); } return;
    case 'invite': return inviteModal(d.client || a?.client_id);
    case 'inviteSave': {
      const email = $('#iv-e').value.trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Enter a valid email', true);
      const row = { email, role: $('#iv-r').value, client_id: d.client, site_id: $('#iv-s').value || null, full_name: $('#iv-n').value.trim() || null, job_title: $('#iv-j').value.trim() || null };
      closeModal(); await ins('portal_invites', row).catch(() => {}); await refreshProfiles(); toast('Added — they sign in at the portal address with their email'); return window.__render();
    }
    case 'delInvite': if (await confirmBox('Remove this person\'s portal access? Their past sign-offs are kept.', 'Remove access')) { await del('portal_invites', d.id).catch(() => {}); await refreshProfiles(); window.__render(); } return;
    case 'newRA': return newRAModal(d.client, d.topic);
    case 'tEdit': return topicModal(d.id);
    case 'tSave': return topicSave(d.id);
    case 'tDel': if (await confirmBox('Delete this topic from the library? Assessments made from it are not affected.')) { closeModal(); await del('topic_library', d.id).catch(() => {}); window.__render(); } return;
    case 'newRASave': return newRASave();
    case 'dupRA': return copyModal([a.id]);
    case 'selRA': b.checked ? S.sel.add(d.id) : S.sel.delete(d.id); return window.__render();
    case 'selAll': { const ids = d.ids ? d.ids.split(',') : []; ids.forEach((id) => (b.checked ? S.sel.add(id) : S.sel.delete(id))); return window.__render(); }
    case 'selClear': S.sel.clear(); return window.__render();
    case 'copyMany': return copyModal([...S.sel]);
    case 'copySave': return copySave(d.ids.split(','), b);
    case 'delRA': if (await confirmBox('Delete this risk assessment? Assessments with sign-offs cannot be deleted — archive them instead.')) { del('assessments', a.id).then(() => (location.hash = '#/ras')).catch(() => {}); } return;
    case 'pdf': return exportRA(a);
    case 'ppl': { const set = new Set(a.people_exposed || []); b.checked ? set.add(d.v) : set.delete(d.v); upd('assessments', a.id, { people_exposed: [...set] }); return window.__render(); }
    case 'pplAdd': { const v = $('#ppl-new').value.trim(); if (!v) return; upd('assessments', a.id, { people_exposed: [...new Set([...(a.people_exposed || []), v])] }); return window.__render(); }
    case 'hzPick': return pickModal('hz', a);
    case 'hzPickSave': {
      const ids = [...document.querySelectorAll('#pk-list input:checked:not(:disabled)')].map((i) => i.value); closeModal();
      ids.forEach((rid, i) => { const r = byId('hazard_register', rid); ins('assessment_hazards', { assessment_id: a.id, register_id: r.id, title: r.title, category: r.category, description: r.description, sort: raHz(a.id).length + i }).catch(() => {}); });
      if (ids.length) toast(`${ids.length} hazard${ids.length > 1 ? 's' : ''} added — now choose the controls for each one`);
      return window.__render();
    }
    case 'hzCustom': { const id = uid(); ins('assessment_hazards', { id, assessment_id: a.id, title: '', category: 'Other', sort: raHz(a.id).length }).catch(() => {}); window.__render(); return $(`#h-${id}-t`)?.focus(); }
    case 'delHz': if (await confirmBox('Remove this hazard and its controls from the assessment?', 'Remove')) { await del('assessment_hazards', d.id).catch(() => {}); D.assessment_controls = rows('assessment_controls').filter((c) => c.assessment_hazard_id !== d.id); window.__render(); } return;
    case 'ctlPick': return pickModal('ctl', a, d.h);
    case 'ctlPickSave': { const ids = [...document.querySelectorAll('#pk-list input:checked:not(:disabled)')].map((i) => i.value); closeModal(); ids.forEach((rid, i) => addCtlFromReg(a, byId('control_register', rid), i, d.h).catch(() => {})); return window.__render(); }
    case 'ctlAddReg': addCtlFromReg(a, byId('control_register', d.id), 0, d.h).catch(() => {}); return window.__render();
    case 'ctlAddAll': { const h = byId('assessment_hazards', d.h); if (h) suggestedFor(a, h).forEach((r, i) => addCtlFromReg(a, r, i, h.id).catch(() => {})); return window.__render(); }
    case 'ctlNew': return ctlNewModal(a, d.h);
    case 'hzPpl': { const h = byId('assessment_hazards', d.h), set = new Set(h.people_affected || []); set.has(d.v) ? set.delete(d.v) : set.add(d.v); upd('assessment_hazards', h.id, { people_affected: [...set] }).catch(() => {}); return window.__render(); }
    case 'approve': {
      const by = $('#ap-by').value.trim(), at = $('#ap-at').value;
      if (by.length < 2) return toast('Enter the approver\'s name', true);
      if (window.__pad.isEmpty()) return toast('Please sign in the box', true);
      await upd('assessments', a.id, { approved_by: by, approved_at: at ? new Date(at).toISOString() : nowIso(), approval_signature: window.__pad.toDataURL(), ...(a.status === 'Draft' ? { status: 'Active' } : {}) }).catch(() => {});
      toast('Assessment approved'); return window.__render();
    }
    case 'unapprove': if (await confirmBox('Remove the approval? The assessment will show as Incomplete until it is approved again.', 'Remove approval')) { await upd('assessments', a.id, { approved_by: null, approved_at: null, approval_signature: null }).catch(() => {}); window.__render(); } return;
    case 'ctlNewSave': return ctlNewSave(a, d.h);
    case 'delCtl': if (await confirmBox('Remove this control from the assessment?', 'Remove')) { await del('assessment_controls', d.id).catch(() => {}); window.__render(); } return;
    case 'ctlAct': { const c = byId('assessment_controls', d.id), r = scoreOf(a, 'res') || scoreOf(a, 'init'); await ins('actions', { assessment_id: a.id, assessment_control_id: c.id, assessment_hazard_id: c.assessment_hazard_id || null, source: 'control', title: c.title || 'Put control in place', due_date: addDays(today(), r >= 10 ? 7 : 30), priority: r >= 20 ? 'Urgent' : r >= 10 ? 'High' : 'Medium', status: 'Open' }).catch(() => {}); toast('Action created'); return window.__render(); }
    case 'pick': upd('assessments', a.id, { [d.w + '_l']: +d.l, [d.w + '_s']: +d.s }); return window.__render();
    case 'addAct': return actionModal(a, d.h);
    case 'actSave': {
      const title = $('#ac-t').value.trim(); if (!title) return toast('Describe what needs doing', true);
      const row = { assessment_id: a.id, assessment_hazard_id: $('#ac-h').value || null, title, owner: $('#ac-o').value.trim() || null, due_date: $('#ac-d').value || null, priority: $('#ac-p').value, source: 'manual', status: 'Open' };
      closeModal(); await ins('actions', row).catch(() => {}); toast('Action raised'); return window.__render();
    }
    case 'delAct': if (await confirmBox('Delete this action?')) { await del('actions', d.id).catch(() => {}); window.__render(); } return;
    case 'af': S.af = d.v; return window.__render();
    case 'auStart': S.draft = { ra: a.id, auditor: S.me.full_name || '', date: today(), summary: '', next: addDays(today(), 365), items: QS.map((q) => ({ q, a: '', note: '', act: '' })) }; return window.__render();
    case 'auAns': S.draft.items[+d.i].a = d.v; return window.__render();
    case 'auDiscard': S.draft = null; return window.__render();
    case 'auRaise': { const it = S.draft.items[+d.i], id = uid(); it.act = id; await ins('actions', { id, assessment_id: a.id, source: 'audit', title: it.note || 'Audit finding: ' + it.q, due_date: addDays(today(), 30), priority: it.a === 'No' ? 'High' : 'Medium', status: 'Open' }).catch(() => {}); return window.__render(); }
    case 'auComplete': {
      const dr = S.draft, p = auditScore(dr.items); if (p == null) return toast('Answer at least one question', true);
      try { await ins('audits', { assessment_id: a.id, audit_date: dr.date, auditor: dr.auditor, score: p, outcome: auditOutcome(p), summary: dr.summary, items: dr.items.map(({ q, a: ans, note }) => ({ q, a: ans, note })), next_review: dr.next || null, created_by: S.me.id });
        if (dr.next) upd('assessments', a.id, { review_date: dr.next }); S.draft = null; toast('Audit saved'); } catch (e) { /* shown */ }
      return window.__render();
    }
    case 'publish': {
      const note = $('#pub-note').value.trim();
      if (!raHz(a.id).length || !scoreOf(a, 'res')) { if (!(await confirmBox('This assessment has no hazards or no rating with controls yet. Publish anyway?', 'Publish'))) return; }
      if (a.status === 'Draft') await upd('assessments', a.id, { status: 'Active' });
      const { data, error } = await sb.rpc('publish_assessment', { aid: a.id, note: note || null });
      if (error) return toast(niceError(error), true);
      a.published_version = data;
      D.published_assessments = rows('published_assessments').concat(await fetchAll('published_assessments', 'id,assessment_id,client_id,site_id,version,note,published_at,published_by', (q) => q.eq('assessment_id', a.id).eq('version', data)));
      delete S.logs[a.id]; toast(`Version ${data} published to the client portal`); return window.__render();
    }
    case 'signInPerson': {
      openModal(`<h3>Record an in-person sign-off</h3><p class="muted">Hand your device to the person. They read version ${a.published_version} and sign below.</p>${signFormHTML({ version: a.published_version, method: 'In person' })}<div class="ft"><button class="btn" data-act="close">Cancel</button><button class="btn pri" data-act="signInPersonSave">Save sign-off</button></div>`);
      return mountPad();
    }
    case 'signInPersonSave': { const r = await submitSignOff({ assessmentId: a.id, version: a.published_version, method: 'In person' }); if (!r) return; S.sigs[a.id] = { ...(S.sigs[a.id] || {}), [r.id]: r.signature }; delete r.signature; rows('acknowledgements').push(r); closeModal(); toast('Sign-off recorded'); return window.__render(); }
    case 'ackPdf': { const acks = raAcks(a.id), sg = await fetchSigsFor(acks.map((k) => k.id)); return signOffsPDF({ title: 'Acknowledgement record', subtitle: `${a.title} · ${a.ref} · ${cName(a.client_id)} · ${sName(a.site_id)}`, acks: acks.map((k) => ({ ...k, signature: sg[k.id], _assessment: a.title, _site: sName(k.site_id) })) }); }
    case 'soPdf': { const acks = filteredAcks(), sg = await fetchSigsFor(acks.map((k) => k.id)), f = S.so;
      const sub = [f.c ? cName(f.c) : 'All clients', f.s ? sName(f.s) : '', f.a ? byId('assessments', f.a)?.title : '', f.from ? 'from ' + fd(f.from) : '', f.to ? 'to ' + fd(f.to) : ''].filter(Boolean).join(' · ');
      return signOffsPDF({ title: 'Acknowledgement record', subtitle: sub, acks: acks.map((k) => ({ ...k, signature: sg[k.id], _assessment: byId('assessments', k.assessment_id)?.title, _site: sName(k.site_id) })) }); }
    case 'reloadLog': delete S.logs[d.id]; return window.__render();
    case 'hzEdit': return hzEditModal(d.id);
    case 'hzRegSave': return hzRegSave(d.id);
    case 'hzRegDel': if (await confirmBox('Delete this hazard from the register? Assessments that used it keep their copy.')) { closeModal(); await del('hazard_register', d.id).catch(() => {}); D.hazard_register_controls = rows('hazard_register_controls').filter((l) => l.hazard_id !== d.id); window.__render(); } return;
    case 'ctlEdit': return ctlEditModal(d.id);
    case 'ctlRegSave': { const t = $('#ce-t').value.trim(); if (!t) return toast('Enter the control', true); const patch = { title: t, type: $('#ce-y').value, description: $('#ce-d').value.trim() || null, active: $('#ce-a').checked }; closeModal(); if (d.id) upd('control_register', d.id, patch); else await ins('control_register', patch).catch(() => {}); return window.__render(); }
    case 'ctlRegDel': if (await confirmBox('Delete this control from the register? Assessments that used it keep their copy.')) { closeModal(); await del('control_register', d.id).catch(() => {}); D.hazard_register_controls = rows('hazard_register_controls').filter((l) => l.control_id !== d.id); window.__render(); } return;
    case 'superToggle': { const inv = rows('portal_invites').find((i) => i.email === d.email && i.role === 'admin');
      if (inv) await upd('portal_invites', inv.id, { is_super: !!d.v }).catch(() => {}); else { const p = rows('profiles').find((x) => x.email === d.email); if (p) await upd('profiles', p.id, { is_super: !!d.v }).catch(() => {}); }
      await refreshProfiles(); toast(d.v ? 'Now a superadmin' : 'Now an administrator'); return window.__render(); }
    case 'adminInvite': openModal(`<h3>Add Safetybiz administrator</h3><div class="g2"><label>Full name<input id="ad-n"></label><label>Email<input id="ad-e" type="email"></label><label class="chk full"><input type="checkbox" id="ad-s"> Superadmin — can also add and remove administrators, delete clients and edit the topic library</label></div><p class="hint">Administrators see every client. For someone from a client company, add them on that client's page as a Company administrator instead.</p><div class="ft"><button class="btn" data-act="close">Cancel</button><button class="btn pri" data-act="adminInviteSave">Add administrator</button></div>`); return;
    case 'adminInviteSave': { const email = $('#ad-e').value.trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Enter a valid email', true); const n = $('#ad-n').value.trim(); const sup = $('#ad-s').checked; closeModal(); await ins('portal_invites', { email, role: 'admin', client_id: null, full_name: n || null, is_super: sup }).catch(() => {}); await refreshProfiles(); return window.__render(); }
    case 'adminRemove': if (await confirmBox(`Remove administrator access for ${d.email}?`, 'Remove access')) { const inv = rows('portal_invites').find((i) => i.email === d.email); if (inv) await del('portal_invites', inv.id).catch(() => {}); else { const p = rows('profiles').find((x) => x.email === d.email); if (p) await upd('profiles', p.id, { role: 'none' }); } await refreshProfiles(); window.__render(); } return;
  }
}
async function refreshProfiles() { D.profiles = await fetchAll('profiles'); }

async function exportRA(a) {
  const { data: sg } = await sb.from('acknowledgements').select('id,signature').eq('assessment_id', a.id);
  const sigs = Object.fromEntries((sg || []).map((r) => [r.id, r.signature]));
  assessmentPDF({ ...a, client: cName(a.client_id), site: sName(a.site_id), siteAddress: byId('sites', a.site_id)?.address, people: a.people_exposed || [], hazards: raHz(a.id).map((h) => ({ ...h, controls: hzCtl(a.id, h.id), actions: raActs(a.id).filter((x) => x.assessment_hazard_id === h.id) })), controls: raCtl(a.id).filter((c) => !c.assessment_hazard_id || !raHz(a.id).some((h) => h.id === c.assessment_hazard_id)),
    versionLabel: a.published_version ? `Working copy · last published as version ${a.published_version}` : 'Working copy · not yet published',
    actions: raActs(a.id), audits: rows('audits').filter((u) => u.assessment_id === a.id), acks: raAcks(a.id).map((k) => ({ ...k, signature: sigs[k.id] })) });
}

// field edits: data-b="table|id|field"
export function adminField(el, isChange) {
  if (el.dataset.ui) { S[el.dataset.ui] = el.value; return true; }
  if (el.dataset.so) { S.so[el.dataset.so] = el.value; if (el.dataset.so === 'c') { S.so.s = ''; S.so.a = ''; } return true; }
  if (el.dataset.au != null && S.draft) { const k = el.dataset.au; if (k[0] === 'n' && /^n\d+$/.test(k)) S.draft.items[+k.slice(1)].note = el.value; else S.draft[k] = el.value; return false; }
  const [t, id, f] = (el.dataset.b || '').split('|'); if (!t) return false;
  let v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? null : +el.value) : el.value;
  if (v === '' && (f.endsWith('_id') || el.type === 'date')) v = null;
  const patch = { [f]: v };
  if (t === 'actions' && f === 'status') patch.completed_on = v === 'Done' ? today() : null;
  if (t === 'assessments' && f === 'client_id') { const s = clientSites(v)[0]; patch.site_id = s?.id; }
  if (t === 'assessments') patch.updated_at = nowIso();
  if (t === 'portal_invites') { upd(t, id, patch).then(refreshProfiles).then(() => window.__render()).catch(() => {}); return false; }
  const sendPatch = { ...patch }; delete sendPatch.updated_at;
  const r = byId(t, id); if (r && t === 'assessments') r.updated_at = patch.updated_at;
  upd(t, id, sendPatch, isChange ? 0 : 700).catch(() => {});
  return isChange && (el.tagName === 'SELECT' || el.type === 'date');
}
onRerender(() => window.__render && window.__render());
