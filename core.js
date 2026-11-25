// Shared helpers, data layer and UI pieces.
const cfg = window.SAFETYBIZ_CONFIG || {};
export const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
export const COMPANY = cfg.brandName || 'Safetybiz';
export const PORTAL = cfg.portalName || 'Safetybiz One';

export const $ = (s, el = document) => el.querySelector(s);
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)));
export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const fd = (d) => (d ? new Date(String(d).length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const ft = (t) => (t ? new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const nowIso = () => new Date().toISOString();

// ---------- risk ----------
export const LIK = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'];
export const SEV = ['Negligible', 'Minor', 'Moderate', 'Major', 'Catastrophic'];
export const CTYPES = ['Elimination', 'Substitution', 'Engineering', 'Administrative', 'PPE'];
export const CATS = ['Slips, trips and falls', 'Working at height', 'Manual handling', 'Machinery and equipment', 'Electrical', 'Hazardous substances (COSHH)', 'Fire', 'Vehicles and traffic', 'Noise and vibration', 'Lone working', 'Stress and wellbeing', 'Asbestos', 'Confined spaces', 'Gas', 'Water and flooding', 'Food safety', 'Violence and aggression', 'Other'];
export const PEOPLE = ['Colleagues', 'Contractors', 'Visitors / guests', 'Members of the public', 'Customers', 'Young workers', 'New or expectant mothers', 'Lone workers', 'People with disabilities', 'Service users / residents', 'Patients', 'Children', 'Pupils / students'];
export const STATUSES = ['Draft', 'Active', 'Under review', 'Archived'];
export const ASTAT = ['Open', 'In progress', 'Done'];
export const PRI = ['Low', 'Medium', 'High', 'Urgent'];
export const QS = [
  'All significant hazards for the activity have been identified',
  'People exposed are identified, including vulnerable groups',
  'Control measures are in place on site as described',
  'Control measures are effective in reducing the risk',
  'Actions have been completed by their due dates',
  'Staff have read and signed the assessment',
  'The assessment has been reviewed by its renewal date',
  'Emergency arrangements are adequate for the activity',
];
export const band = (s) => (s >= 20 ? { k: 'vh', n: 'Very high risk' } : s >= 10 ? { k: 'hi', n: 'High risk' } : s >= 5 ? { k: 'md', n: 'Medium risk' } : s > 0 ? { k: 'lo', n: 'Low risk' } : { k: 'na', n: 'Not rated' });
export const BANDCOL = { lo: '#43B9A5', md: '#F5B800', hi: '#FF8A1F', vh: '#D7261E', na: '#E5E9E8' };
export const chip = (s, short) => { const b = band(s); return `<span class="rc rc-${b.k}">${s ? s + ' · ' : ''}${short ? b.n.replace(' risk', '') : b.n}</span>`; };
export const scoreOf = (o, w) => (+o[w + '_l'] || 0) * (+o[w + '_s'] || 0);
export const reduction = (a) => { const i = scoreOf(a, 'init'), r = scoreOf(a, 'res'); return i && r ? Math.round(((i - r) / i) * 100) : null; };
export const isOd = (x) => x.status !== 'Done' && x.due_date && x.due_date < today();
export const auditOutcome = (p) => (p == null ? '—' : p >= 85 ? 'Satisfactory' : p >= 60 ? 'Improvement needed' : 'Unsatisfactory');
export const auditScore = (items) => { const s = items.filter((i) => i.a && i.a !== 'N/A'); return s.length ? Math.round((s.reduce((t, i) => t + (i.a === 'Yes' ? 1 : i.a === 'Partial' ? 0.5 : 0), 0) / s.length) * 100) : null; };
export const ocol = (p) => (p >= 85 ? '#1f7d6d' : p >= 60 ? '#b8420e' : '#D7261E');

// 5x5 picker. key = 'init' or 'res'. ro = read only.
export function picker(o, key, act, ro) {
  let c = '';
  const L = +o[key + '_l'], S = +o[key + '_s'];
  for (let l = 5; l >= 1; l--) {
    c += `<span class="ax">${l}</span>`;
    for (let s = 1; s <= 5; s++) {
      const v = l * s;
      c += `<button class="pc rc-${band(v).k}${L === l && S === s ? ' on' : ''}" ${ro ? 'tabindex="-1"' : `data-act="${act}" data-w="${key}" data-l="${l}" data-s="${s}"`} aria-label="Likelihood ${l} ${LIK[l - 1]}, severity ${s} ${SEV[s - 1]}, score ${v}">${v}</button>`;
    }
  }
  c += '<span></span>' + [1, 2, 3, 4, 5].map((s) => `<span class="ax">${s}</span>`).join('');
  const v = L * S;
  return `<div class="pk${ro ? ' ro' : ''}">${c}</div><div class="axn"><span>↑ Likelihood</span><span>Severity →</span></div>
  <div class="res">${chip(v)}${v ? `<br>Likelihood ${L} (${LIK[L - 1]}) × severity ${S} (${SEV[S - 1]})` : '<br>Tap a square to rate'}</div>`;
}

// Big rating summary like the printed report.
export function ratingCard(a) {
  const i = scoreOf(a, 'init'), r = scoreOf(a, 'res'), red = reduction(a);
  const box = (lbl, s, L, S) => `<div style="border:1px solid var(--line);border-radius:12px;overflow:hidden;text-align:center;background:#fff">
    <div style="background:var(--teal);color:#fff;font-size:11px;letter-spacing:.1em;font-weight:600;padding:6px">${lbl}</div>
    <div style="padding:10px"><div class="rc rc-${band(s).k}" style="font-size:15px;padding:4px 12px">${band(s).n}</div>
    <div class="muted" style="margin-top:8px">Severity ${S || '–'} × likelihood ${L || '–'}</div><div style="font-size:34px;font-weight:700;letter-spacing:-.02em">${s || '–'}</div></div></div>`;
  return `<div class="g3">${box('WITHOUT CONTROLS', i, a.init_l, a.init_s)}${box('WITH CONTROLS', r, a.res_l, a.res_s)}
  <div style="border:1px solid var(--line);border-radius:12px;background:var(--soft);display:grid;place-items:center;text-align:center;padding:14px"><div><div class="muted" style="font-weight:600">Risk rating reduction</div><div style="font-size:40px;font-weight:700;color:#1f7d6d">${red == null ? '–' : '↓ ' + red + '%'}</div></div></div></div>`;
}

// ---------- toast & modal ----------
let tt;
export function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'on' + (err ? ' err' : ''); clearTimeout(tt); tt = setTimeout(() => (t.className = ''), err ? 6000 : 2600); }
export function openModal(html, wide) { const m = $('#modal'); m.innerHTML = `<div class="box${wide ? ' wide' : ''}">${html}</div>`; m.classList.add('on'); const f = m.querySelector('input,select,textarea'); if (f) f.focus(); }
export function closeModal() { const m = $('#modal'); m.classList.remove('on'); m.innerHTML = ''; }
export function confirmBox(msg, yes = 'Yes, delete') {
  return new Promise((res) => {
    openModal(`<h3>Are you sure?</h3><p>${esc(msg)}</p><div class="ft"><button class="btn" id="cb-no">Cancel</button><button class="btn pri" id="cb-yes">${esc(yes)}</button></div>`);
    $('#cb-no').onclick = () => { closeModal(); res(false); };
    $('#cb-yes').onclick = () => { closeModal(); res(true); };
  });
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#modal').classList.contains('on')) closeModal(); });

// ---------- data ----------
export const D = {};
export async function fetchAll(table, cols = '*', build = (q) => q) {
  let out = [], from = 0;
  for (;;) {
    const { data, error } = await build(sb.from(table).select(cols)).range(from, from + 999);
    if (error) throw error;
    out = out.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}
export function niceError(e) {
  const m = (e && (e.message || e.error_description)) || String(e);
  if (e && e.code === '23503') return "Can't delete this: it has signed acknowledgements or other records linked to it. Archive it instead.";
  if (e && e.code === '23505') return 'That already exists (for example, the email is already invited).';
  if (e && e.code === '42501') return "You don't have permission to do that.";
  return m;
}
let chain = Promise.resolve(), pend = 0, saveEl = null;
export const setSaveEl = (el) => { saveEl = el; showSave(); };
function showSave() { const el = saveEl || $('#sv'); if (el) el.textContent = pend ? 'Saving…' : 'All changes saved'; }
export function queue(fn) {
  pend++; showSave();
  const p = chain.then(async () => { const r = await fn(); if (r && r.error) throw r.error; return r && r.data; })
    .catch((e) => { toast(niceError(e), true); throw e; })
    .finally(() => { pend--; showSave(); });
  chain = p.catch(() => {});
  return p;
}
export const rows = (t) => D[t] || (D[t] = []);
export const byId = (t, id) => rows(t).find((r) => r.id === id);
let rerender = () => {};
export const onRerender = (fn) => (rerender = fn);
export function ins(t, row) {
  if (!row.id) row.id = uid();
  if (!row.created_at) row.created_at = nowIso();
  rows(t).push(row);
  const send = { ...row }; delete send.created_at;
  return queue(() => sb.from(t).insert(send)).catch((e) => { D[t] = rows(t).filter((r) => r !== row); rerender(); throw e; });
}
const timers = {}, patches = {};
export function upd(t, id, patch, wait = 0) {
  const r = byId(t, id); if (r) Object.assign(r, patch);
  const k = t + ':' + id; patches[k] = { ...(patches[k] || {}), ...patch };
  clearTimeout(timers[k]);
  const go = () => { const p = patches[k]; delete patches[k]; delete timers[k]; return queue(() => sb.from(t).update(p).eq('id', id)); };
  if (wait) { timers[k] = setTimeout(go, wait); return Promise.resolve(); }
  return go();
}
export function del(t, id, key = 'id') {
  const old = rows(t).filter((r) => r[key] === id);
  D[t] = rows(t).filter((r) => r[key] !== id);
  return queue(() => sb.from(t).delete().eq(key, id)).catch((e) => { D[t] = rows(t).concat(old); rerender(); throw e; });
}
export const flushPending = () => Promise.all(Object.keys(timers).map((k) => { clearTimeout(timers[k]); const [t, id] = k.split(':'); const p = patches[k]; delete patches[k]; delete timers[k]; return queue(() => sb.from(t).update(p).eq('id', id)); }));
window.addEventListener('beforeunload', (e) => { if (pend || Object.keys(timers).length) { flushPending(); e.preventDefault(); e.returnValue = ''; } });

// ---------- inputs ----------
export const field = (b, v, label, type = 'text', extra = '') => `<label${extra}>${label}<input id="${b.replace(/[^a-z0-9]/gi, '-')}" type="${type}" value="${esc(v)}" data-b="${b}"></label>`;
export const area = (b, v, label, extra = '') => `<label${extra}>${label}<textarea id="${b.replace(/[^a-z0-9]/gi, '-')}" data-b="${b}">${esc(v)}</textarea></label>`;
export const sel = (b, v, opts, label, extra = '') => `<label${extra}>${label}<select id="${b.replace(/[^a-z0-9]/gi, '-')}" data-b="${b}">${opts.map((o) => { const [val, txt] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}"${String(val) === String(v ?? '') ? ' selected' : ''}>${esc(txt)}</option>`; }).join('')}</select></label>`;
export const isText = (el) => el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['date', 'checkbox', 'radio', 'number'].includes(el.type));

// ---------- signature pad ----------
export function signaturePad(canvas) {
  const ctx = canvas.getContext('2d');
  let drawing = false, dirty = false, last = null;
  const fit = () => { const r = canvas.getBoundingClientRect(), d = window.devicePixelRatio || 1; canvas.width = r.width * d; canvas.height = r.height * d; ctx.setTransform(d, 0, 0, d, 0, 0); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#10292b'; };
  fit();
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', (e) => { drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...p); ctx.stroke(); last = p; dirty = true; });
  const end = () => (drawing = false);
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  return {
    clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); dirty = false; },
    isEmpty: () => !dirty,
    toDataURL() { // shrink to keep records light
      const c = document.createElement('canvas'), w = 480, h = Math.round((canvas.height / canvas.width) * w);
      c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(canvas, 0, 0, w, h);
      return c.toDataURL('image/png');
    },
  };
}

// A sign-off form used by staff, managers (in person) and admins (in person).
export function signFormHTML({ version, method, name = '', job = '' }) {
  const inPerson = method === 'In person';
  return `<div class="stmt">${esc(statementText(version, inPerson))}</div>
  <div class="g2">${`<label>Full name<input id="sg-name" value="${esc(name)}" autocomplete="name"></label>`}${`<label>Job title<input id="sg-job" value="${esc(job)}"></label>`}</div>
  <label style="margin-top:12px">Signature<canvas class="sigpad" id="sg-pad" aria-label="Signature pad"></canvas></label>
  <div class="row" style="margin-top:8px"><button class="btn sm" type="button" id="sg-clear">Clear signature</button>
  <label class="chk sp"><input type="checkbox" id="sg-ok"> ${inPerson ? 'The person named has read this assessment and signed above' : 'I have read and understood this risk assessment'}</label></div>`;
}
export const statementText = (v, inPerson) => `${inPerson ? 'The person named below confirms' : 'I confirm'} that ${inPerson ? 'they have' : 'I have'} read and understood this risk assessment (version ${v}) and will follow the control measures it describes.`;
export async function submitSignOff({ assessmentId, version, method }) {
  const name = $('#sg-name').value.trim(), job = $('#sg-job').value.trim();
  if (name.length < 2) { toast('Enter the full name', true); return null; }
  if (window.__pad.isEmpty()) { toast('Please sign in the box', true); return null; }
  if (!$('#sg-ok').checked) { toast('Tick the confirmation box', true); return null; }
  const row = { id: uid(), assessment_id: assessmentId, full_name: name, job_title: job || null, method, statement: statementText(version, method === 'In person'), signature: window.__pad.toDataURL(), user_agent: navigator.userAgent.slice(0, 250) };
  const { data, error } = await sb.from('acknowledgements').insert(row).select().single();
  if (error) { toast(niceError(error), true); return null; }
  return data;
}
export function mountPad() { const c = $('#sg-pad'); if (!c) return; window.__pad = signaturePad(c); $('#sg-clear').onclick = () => window.__pad.clear(); }

// ---------- icons ----------
export const ICON = {
  dash: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  clients: '<path d="M4 21V7l8-4 8 4v14M9 21v-5h6v5M8 10h2M14 10h2M8 13h2M14 13h2"/>',
  ra: '<path d="M9 4h10v16H5V8zM9 4v4H5M9 12h6M9 16h6"/>',
  hz: '<path d="M12 3 2 20h20zM12 10v4M12 17v.5"/>',
  lib: '<path d="M4 4h4v16H4zM10 4h4v16h-4zM16 5l4 1-3 14-4-1z"/>',
  ctl: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6zM9 12l2 2 4-4"/>',
  acts: '<path d="m4 12 4 4L20 6"/>',
  sign: '<path d="M3 17c3-1 4-6 6-6s1 5 3 5 3-4 5-4 2 2 4 2M3 21h18"/>',
  team: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5M16 5a3 3 0 0 1 0 6M18 15c2 .5 3 2 3 5"/>',
  staff: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5M16 5a3 3 0 0 1 0 6M18 15c2 .5 3 2 3 5"/>',
};
export const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${ICON[k] || ''}</svg>`;

// Shell with sidebar.
export function shell({ nav, active, title, me, body, right = '' }) {
  return `<div class="shell"><aside><img class="lg" src="assets/logo-dark-bg.png" alt="${esc(COMPANY)} — Safety made easy">
  <div class="grp">${esc(me.group)}</div><div class="navs">${nav.map((n) => `<a class="nv${n.k === active ? ' on' : ''}" href="#/${n.href}">${svg(n.icon)}${esc(n.label)}${n.c ? `<span class="c">${n.c}</span>` : ''}</a>`).join('')}</div>
  <div class="me"><b>${esc(me.name)}</b><span>${esc(me.sub)}</span><br><button data-act="signout">Sign out</button></div></aside>
  <div><div class="topbar"><h1>${esc(title)}</h1>${right}<span class="sv" id="sv">All changes saved</span></div>${body}</div></div>`;
}
