// Sign-in, routing and event wiring.
import { sb, $, esc, toast, isText, COMPANY, PORTAL, setSaveEl, mountPad, closeModal, openModal } from './core.js';
import { loadAdmin, adminView, adminClick, adminField } from './admin.js';
import { loadPortal, portalView, portalClick, portalField } from './portal.js';

let me = null, ready = false;
const builder = () => me.role === 'admin' || me.role === 'client_admin'; // Safetybiz admins and company administrators use the builder
const root = $('#root');
const route = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);

function render() {
  if (!ready || !me) return;
  const ae = document.activeElement, fid = ae && ae.id, ss = ae && ae.selectionStart;
  const y = window.scrollY;
  root.innerHTML = builder() ? adminView(route()) : portalView(route());
  if (needsPassword()) root.querySelector('.topbar')?.insertAdjacentHTML('afterend', '<div class="pwbar"><span>Set a password so you can also sign in with your email and password.</span><button class="btn sm pri" data-act="account">Set password</button><button class="btn sm ghost" data-act="pwLater">Not now</button></div>');
  setSaveEl($('#sv'));
  if (root.querySelector('#sg-pad')) mountPad();
  if (fid) { const e = document.getElementById(fid); if (e && !$('#modal').contains(e)) { e.focus({ preventScroll: true }); try { if (ss != null && isText(e)) e.setSelectionRange(ss, ss); } catch { /* not text */ } } }
  window.scrollTo(0, y);
}
window.__render = render;

// Sign in with email and password, or with a one-time email link. "Forgot password" emails a reset link.
const PW_MIN = 10;
function loginView(msg, mode = 'pw') {
  const left = `<div class="l"><img src="logo-dark-bg.png" alt="${esc(COMPANY)} — Safety made easy"><div><h1>${esc(PORTAL)}</h1><p style="max-width:42ch;color:#cfe0de">Risk assessments, control measures and staff sign-offs in one place. Clients see their own published risk assessments and sign them online.</p></div><span style="font-size:13px;color:#7fa3a0">© ${new Date().getFullYear()} ${esc(COMPANY)}</span></div>`;
  const note = msg ? `<p class="stmt" style="margin:0">${msg}</p>` : '';
  const form = mode === 'pw'
    ? `<form id="login" data-mode="pw"><h2 style="font-size:24px">Sign in</h2>
      <label>Email<input id="lg-e" type="email" autocomplete="username" required></label>
      <label>Password<input id="lg-p" type="password" autocomplete="current-password" required></label>
      <button class="btn pri" type="submit">Sign in</button>${note}
      <p class="muted" style="margin:0"><a href="#" data-login="forgot">Forgot password?</a> · <a href="#" data-login="link">Email me a sign-in link instead</a></p></form>`
    : mode === 'forgot'
      ? `<form id="login" data-mode="forgot"><h2 style="font-size:24px">Reset your password</h2><p class="muted" style="margin:0">Enter your work email. We'll email you a link to choose a new password.</p>
      <label>Email<input id="lg-e" type="email" autocomplete="email" required></label><button class="btn pri" type="submit">Email me a reset link</button>${note}
      <p class="muted" style="margin:0"><a href="#" data-login="pw">Back to sign in</a></p></form>`
      : `<form id="login" data-mode="link"><h2 style="font-size:24px">Sign in with an email link</h2><p class="muted" style="margin:0">Enter your work email. We'll email you a secure one-time sign-in link — no password needed.</p>
      <label>Email<input id="lg-e" type="email" autocomplete="email" required></label><button class="btn pri" type="submit">Email me a sign-in link</button>${note}
      <p class="muted" style="margin:0"><a href="#" data-login="pw">Sign in with a password instead</a></p></form>`;
  root.innerHTML = `<div class="auth">${left}<div class="r">${form}</div></div>`;
  root.querySelectorAll('[data-login]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); loginView(undefined, a.dataset.login); }));
  $('#login').onsubmit = async (e) => {
    e.preventDefault();
    const email = $('#lg-e').value.trim().toLowerCase(), btn = e.target.querySelector('button'); btn.disabled = true;
    const home = location.origin + location.pathname;
    if (mode === 'pw') {
      const { error } = await sb.auth.signInWithPassword({ email, password: $('#lg-p').value });
      btn.disabled = false;
      if (error) return loginView(/invalid/i.test(error.message) ? 'Email or password not recognised. If you have never set a password, use "Email me a sign-in link" and set one under Password.' : esc(error.message), 'pw');
      return;
    }
    const { error } = mode === 'forgot'
      ? await sb.auth.resetPasswordForEmail(email, { redirectTo: home })
      : await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: home, shouldCreateUser: false } });
    btn.disabled = false;
    if (error && mode === 'link' && /signups not allowed|not found/i.test(error.message)) return loginView(`<b>${esc(email)}</b> hasn't been given access yet. Ask your manager or ${esc(COMPANY)} to add you.`, 'link');
    if (error) return toast(error.message, true);
    loginView(mode === 'forgot' ? `If <b>${esc(email)}</b> has an account, a reset link is on its way. Open it to choose a new password.` : `Check <b>${esc(email)}</b> for your sign-in link. You can close this tab — the link opens ${esc(PORTAL)}.`, mode);
  };
}
// Choose a password: after "Forgot password" (recovery), from the Password button, or prompted after an invitation.
function passwordModal(recovery) {
  openModal(`<h3>${recovery ? 'Choose a new password' : 'Set your password'}</h3><p class="muted" style="margin-top:-6px">At least ${PW_MIN} characters. You can still sign in with an email link if you prefer.</p>
  <div class="g2"><label>New password<input id="pw-1" type="password" autocomplete="new-password"></label><label>Repeat password<input id="pw-2" type="password" autocomplete="new-password"></label></div>
  <div class="ft">${recovery ? '' : '<button class="btn" data-act="close">Cancel</button>'}<button class="btn pri" data-act="pwSave">Save password</button></div>`);
}
async function savePassword(btn) {
  const p1 = $('#pw-1').value, p2 = $('#pw-2').value;
  if (p1.length < PW_MIN) return toast(`Use at least ${PW_MIN} characters`, true);
  if (p1 !== p2) return toast("The two passwords don't match", true);
  btn.disabled = true;
  const { data, error } = await sb.auth.updateUser({ password: p1, data: { has_password: true } });
  btn.disabled = false;
  if (error) return toast(/different from the old|same/i.test(error.message) ? 'Choose a password you have not used before' : error.message, true);
  pwUser = data.user; closeModal(); toast('Password saved'); render();
}
// Email links (invitation, sign-in link, password reset) open this page first. The one-time token is used only when
// the person presses Continue: corporate email scanners open links to check them, which would otherwise use the link up.
// The Supabase email templates send: {{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=invite|magiclink|recovery
const LINK_TYPES = { invite: 'invite', magiclink: 'email', email: 'email', recovery: 'recovery' };
const linkQ = new URLSearchParams(location.search);
let pendingLink = linkQ.get('token_hash') && LINK_TYPES[linkQ.get('type')] ? { token_hash: linkQ.get('token_hash'), type: linkQ.get('type') } : null;
let linking = false;
function linkView() {
  const t = pendingLink.type;
  const [h, p, b] = t === 'invite' ? [`You've been invited to ${PORTAL}`, 'Continue to open your account. You can then set a password.', 'Accept invitation']
    : t === 'recovery' ? ['Choose a new password', 'Continue to choose a new password for your account.', 'Continue']
    : [`Sign in to ${PORTAL}`, 'Continue to sign in. This link works once.', `Continue to ${PORTAL}`];
  root.innerHTML = `<div class="auth"><div class="l"><img src="logo-dark-bg.png" alt="${esc(COMPANY)} — Safety made easy"><div><h1>${esc(PORTAL)}</h1></div><span style="font-size:13px;color:#7fa3a0">© ${new Date().getFullYear()} ${esc(COMPANY)}</span></div>
  <div class="r"><div id="lk" style="display:grid;gap:14px;max-width:420px"><h2 style="font-size:24px;margin:0">${esc(h)}</h2><p class="muted" style="margin:0">${esc(p)}</p><button class="btn pri" id="lk-go">${esc(b)}</button></div></div></div>`;
  $('#lk-go').onclick = async (e) => {
    e.target.disabled = true; linking = true;
    const { data, error } = await sb.auth.verifyOtp({ token_hash: pendingLink.token_hash, type: LINK_TYPES[t] });
    pendingLink = null; history.replaceState(null, '', location.pathname); linking = false;
    if (error || !data?.session) return loginView('That link has expired or was already used. Each link works once — enter your email for a new one and use the newest email.', t === 'recovery' ? 'forgot' : 'link');
    me = null; await start(data.session);
    if (me && me.role !== 'none' && (t === 'recovery' || (t === 'invite' && !(data.session.user.user_metadata || {}).has_password))) passwordModal(t === 'recovery');
  };
}
let pwUser = null, pwLater = false;
const needsPassword = () => pwUser && !(pwUser.user_metadata || {}).has_password && !pwLater && !sessionStorage.getItem('pw-later');
function noAccessView() {
  root.innerHTML = `<div class="auth"><div class="l"><img src="logo-dark-bg.png" alt="${esc(COMPANY)}"><div></div><span></span></div><div class="r"><div style="max-width:420px"><h2>Your account isn't set up yet</h2>
  <p class="muted">You're signed in as <b>${esc(me.email)}</b>, but this email hasn't been given access. Ask your manager or ${esc(COMPANY)} to add you, then sign in again.</p><button class="btn" data-act="signout">Sign out</button></div></div></div>`;
}

async function start(session) {
  if (pendingLink) { me = null; ready = false; return linkView(); }
  if (!session) {
    me = null; ready = false;
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    const err = h.get('error_description');
    if (err) history.replaceState(null, '', location.pathname);
    return loginView(err ? (/expired|invalid/i.test(err) ? 'That sign-in link has expired or was already used. Each link works once — enter your email for a new one and use the newest email.' : esc(err)) : undefined);
  }
  pwUser = session.user;
  const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (error) { root.innerHTML = `<div class="boot"><p>Couldn't load your profile: ${esc(error.message)}</p></div>`; return; }
  me = data || { id: session.user.id, email: session.user.email, role: 'none' };
  if (me.role === 'none') return noAccessView();
  root.innerHTML = '<div class="boot"><img src="logo-light-bg.png" alt="" width="220"><p>Loading your data…</p></div>';
  try { builder() ? await loadAdmin(me) : await loadPortal(me); }
  catch (e) { root.innerHTML = `<div class="boot"><p>Couldn't load data: ${esc(e.message)}</p></div>`; return; }
  ready = true; render();
}

// events
document.addEventListener('click', async (e) => {
  const go = e.target.closest('[data-go]');
  if (go && !e.target.closest('a,button,input,select,textarea')) { location.hash = '#/' + go.dataset.go; return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'signout') { await sb.auth.signOut(); location.hash = ''; return; }
  if (b.dataset.act === 'menu') { e.preventDefault(); b.closest('aside').classList.toggle('open'); b.setAttribute('aria-expanded', b.closest('aside').classList.contains('open')); return; }
  if (b.dataset.act === 'account') { e.preventDefault(); return passwordModal(false); }
  if (b.dataset.act === 'pwSave') { e.preventDefault(); return savePassword(b); }
  if (b.dataset.act === 'pwLater') { e.preventDefault(); pwLater = true; sessionStorage.setItem('pw-later', '1'); return render(); }
  if (b.tagName !== 'INPUT') e.preventDefault();
  if (!me) return;
  if (builder()) await adminClick(e, b); else await portalClick(e, b);
});
const onField = (e, isChange) => {
  const el = e.target; if (!me || !el.dataset) return;
  if (!(el.dataset.b || el.dataset.ui || el.dataset.so || el.dataset.au != null || el.dataset.f || el.dataset.st || el.dataset.ax || el.dataset.sj || el.dataset.sf)) return;
  if (isChange === isText(el)) return; // text boxes save on input, others on change
  const re = builder() ? adminField(el, isChange) : portalField(el, isChange);
  if (re) render();
};
document.addEventListener('input', (e) => onField(e, false));
document.addEventListener('change', (e) => onField(e, true));
window.addEventListener('hashchange', () => { closeModal(); render(); window.scrollTo(0, 0); });

sb.auth.onAuthStateChange((ev, session) => {
  if (linking) return; // handled by linkView
  if (ev === 'PASSWORD_RECOVERY') { setTimeout(async () => { if (!me || me.id !== session.user.id) await start(session); passwordModal(true); }, 0); return; }
  if (ev === 'SIGNED_IN' && me && session && me.id === session.user.id) return; // already loaded
  if (ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION' || ev === 'SIGNED_OUT') setTimeout(() => start(session), 0);
});
