// Sign-in, routing and event wiring.
import { sb, $, esc, toast, isText, COMPANY, PORTAL, setSaveEl, mountPad } from './core.js';
import { loadAdmin, adminView, adminClick, adminField } from './admin.js';
import { loadPortal, portalView, portalClick, portalField } from './portal.js';

let me = null, ready = false;
const root = $('#root');
const route = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);

function render() {
  if (!ready || !me) return;
  const ae = document.activeElement, fid = ae && ae.id, ss = ae && ae.selectionStart;
  const y = window.scrollY;
  root.innerHTML = me.role === 'admin' ? adminView(route()) : portalView(route());
  setSaveEl($('#sv'));
  if (root.querySelector('#sg-pad')) mountPad();
  if (fid) { const e = document.getElementById(fid); if (e && !$('#modal').contains(e)) { e.focus({ preventScroll: true }); try { if (ss != null && isText(e)) e.setSelectionRange(ss, ss); } catch { /* not text */ } } }
  window.scrollTo(0, y);
}
window.__render = render;

function loginView(msg) {
  root.innerHTML = `<div class="auth"><div class="l"><img src="logo-dark-bg.png" alt="${esc(COMPANY)} — Safety made easy"><div><h1>${esc(PORTAL)}</h1><p style="max-width:42ch;color:#cfe0de">Risk assessments, control measures and staff sign-offs in one place. Clients see their own published risk assessments and sign them online.</p></div><span style="font-size:13px;color:#7fa3a0">© ${new Date().getFullYear()} ${esc(COMPANY)}</span></div>
  <div class="r"><form id="login"><h2 style="font-size:24px">Sign in</h2><p class="muted" style="margin:0">Enter your work email. We'll email you a secure sign-in link — no password needed.</p>
  <label>Email<input id="lg-e" type="email" autocomplete="email" required></label><button class="btn pri" type="submit">Email me a sign-in link</button>
  ${msg ? `<p class="stmt" style="margin:0">${msg}</p>` : ''}</form></div></div>`;
  $('#login').onsubmit = async (e) => {
    e.preventDefault();
    const email = $('#lg-e').value.trim().toLowerCase(), btn = e.target.querySelector('button'); btn.disabled = true;
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    btn.disabled = false;
    if (error) return toast(error.message, true);
    loginView(`Check <b>${esc(email)}</b> for your sign-in link. You can close this tab — the link opens ${esc(PORTAL)}.`);
  };
}
function noAccessView() {
  root.innerHTML = `<div class="auth"><div class="l"><img src="logo-dark-bg.png" alt="${esc(COMPANY)}"><div></div><span></span></div><div class="r"><div style="max-width:420px"><h2>Your account isn't set up yet</h2>
  <p class="muted">You're signed in as <b>${esc(me.email)}</b>, but this email hasn't been given access. Ask your manager or ${esc(COMPANY)} to add you, then sign in again.</p><button class="btn" data-act="signout">Sign out</button></div></div></div>`;
}

async function start(session) {
  if (!session) { me = null; ready = false; return loginView(); }
  const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (error) { root.innerHTML = `<div class="boot"><p>Couldn't load your profile: ${esc(error.message)}</p></div>`; return; }
  me = data || { id: session.user.id, email: session.user.email, role: 'none' };
  if (me.role === 'none') return noAccessView();
  root.innerHTML = '<div class="boot"><img src="logo-light-bg.png" alt="" width="220"><p>Loading your data…</p></div>';
  try { me.role === 'admin' ? await loadAdmin(me) : await loadPortal(me); }
  catch (e) { root.innerHTML = `<div class="boot"><p>Couldn't load data: ${esc(e.message)}</p></div>`; return; }
  ready = true; render();
}

// events
document.addEventListener('click', async (e) => {
  const go = e.target.closest('[data-go]');
  if (go && !e.target.closest('a,button,input,select,textarea')) { location.hash = '#/' + go.dataset.go; return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'signout') { await sb.auth.signOut(); location.hash = ''; return; }
  if (b.tagName !== 'INPUT') e.preventDefault();
  if (!me) return;
  if (me.role === 'admin') await adminClick(e, b); else await portalClick(e, b);
});
const onField = (e, isChange) => {
  const el = e.target; if (!me || !el.dataset) return;
  if (!(el.dataset.b || el.dataset.ui || el.dataset.so || el.dataset.au != null || el.dataset.f || el.dataset.st)) return;
  if (isChange === isText(el)) return; // text boxes save on input, others on change
  const re = me.role === 'admin' ? adminField(el, isChange) : portalField(el, isChange);
  if (re) render();
};
document.addEventListener('input', (e) => onField(e, false));
document.addEventListener('change', (e) => onField(e, true));
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

sb.auth.onAuthStateChange((ev, session) => {
  if (ev === 'SIGNED_IN' && me && session && me.id === session.user.id) return; // already loaded
  if (ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION' || ev === 'SIGNED_OUT') setTimeout(() => start(session), 0);
});
