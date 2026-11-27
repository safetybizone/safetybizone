// Safetybiz One — Supabase Edge Function "invite-user".
// Emails an invitation to someone who has been added as a user (a row in portal_invites).
//   { invite_id, redirect }  -> { ok: true, existing: false }  a new account: Supabase "Invite user" email
//                            -> { ok: true, existing: true }   already has an account: a sign-in link email
// Who may invite: anyone who can see that invite under the database's own rules (row-level security), i.e.
// Safetybiz administrators, the organisation's administrators, and managers for staff at their own sites.
// Staff cannot see invites, so they cannot invite anyone. The service role key stays inside this function.
// Emails go through the project's email settings (Authentication -> Emails / SMTP).
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown) => new Response(JSON.stringify(body), { headers: { ...cors, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authz = req.headers.get('Authorization') || '';
    const asUser = createClient(url, anon, { global: { headers: { Authorization: authz } }, auth: { persistSession: false } });
    const { data: u } = await asUser.auth.getUser();
    if (!u?.user) return reply({ ok: false, error: 'Sign in first' });

    const { invite_id, redirect } = await req.json().catch(() => ({}));
    if (!invite_id) return reply({ ok: false, error: 'Missing invite' });
    // The database decides: if the caller can't see this invite, they can't invite this person.
    const { data: inv } = await asUser.from('portal_invites').select('id,email,full_name,role').eq('id', invite_id).maybeSingle();
    if (!inv) return reply({ ok: false, error: 'You can only invite people you manage' });
    const redirectTo = typeof redirect === 'string' && /^https:\/\//.test(redirect) ? redirect : undefined;

    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { error } = await admin.auth.admin.inviteUserByEmail(inv.email, { redirectTo, data: { full_name: inv.full_name || undefined } });
    if (!error) return reply({ ok: true, existing: false });
    if (!/already|registered|exists/i.test(error.message)) return reply({ ok: false, error: error.message });
    // Already has an account: send a one-time sign-in link instead.
    const pub = createClient(url, anon, { auth: { persistSession: false } });
    const { error: e2 } = await pub.auth.signInWithOtp({ email: inv.email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
    if (e2) return reply({ ok: false, error: e2.message });
    return reply({ ok: true, existing: true });
  } catch (e) {
    return reply({ ok: false, error: (e as Error).message || 'Invitation failed' });
  }
});
