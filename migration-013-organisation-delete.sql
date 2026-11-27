-- Safetybiz One migration 013: a superadmin can permanently delete a TEST organisation, with the organisation's
-- name typed to confirm and a reason. Only organisations a superadmin has marked as test (clients.is_test) can be
-- deleted; genuine organisations keep every existing safeguard. The deletion and what it removed are written to
-- admin_log. Run once; safe to run again. Needs migrations 011 and 012.

-- 1. Test flag: only a superadmin can set or clear it.
alter table public.clients add column if not exists is_test boolean not null default false;
create or replace function public.guard_client_test() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_super()
     and coalesce(new.is_test, false) is distinct from (case when tg_op = 'UPDATE' then old.is_test else false end) then
    raise exception 'Only a superadmin can mark an organisation as a test organisation';
  end if;
  return new;
end $$;
revoke execute on function public.guard_client_test() from public, anon, authenticated;
drop trigger if exists trg_guard_client_test on public.clients;
create trigger trg_guard_client_test before insert or update on public.clients for each row execute function public.guard_client_test();

-- 2. Removing a test organisation's invites must not touch accounts that belong to other organisations.
create or replace function public.revoke_invite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('safetybiz.org_delete', true), '') = 'on' then return old; end if;
  if auth.uid() is not null and old.role = 'admin' and not public.is_super() then
    raise exception 'Only a superadmin can remove Safetybiz administrators';
  end if;
  update public.profiles set role = 'none', client_id = null, site_id = null, unit_id = null, is_super = false
   where email = old.email and id is distinct from auth.uid();
  return old;
end $$;

-- 3. A site with records still can't be deleted on its own; only delete_organisation() may remove it.
create or replace function public.guard_site_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('safetybiz.org_delete', true), '') = 'on' then return old; end if;
  if auth.uid() is not null and (
       exists (select 1 from public.site_documents       where site_id = old.id)
    or exists (select 1 from public.service_jobs         where site_id = old.id)
    or exists (select 1 from public.assessments          where site_id = old.id)
    or exists (select 1 from public.published_assessments where site_id = old.id)
    or exists (select 1 from public.actions              where site_id = old.id)
    or exists (select 1 from public.acknowledgements     where site_id = old.id)) then
    raise exception 'This site has compliance records, so it can''t be deleted. Set its status to Archived instead: it is hidden from lists and totals and its records are kept.';
  end if;
  return old;
end $$;
revoke execute on function public.guard_site_delete() from public, anon, authenticated;

-- 4. Returns the organisation's files in the 'compliance' bucket; the app removes them after the call.
create or replace function public.delete_organisation(cid uuid, confirm_name text, reason text) returns text[]
language plpgsql security definer set search_path = public as $$
declare c public.clients; paths text[]; cnt jsonb;
begin
  if not public.is_super() then raise exception 'Only a superadmin can delete an organisation'; end if;
  select * into c from public.clients where id = cid;
  if c.id is null then raise exception 'Organisation not found'; end if;
  if not c.is_test then raise exception 'Only organisations marked as test can be deleted'; end if;
  if lower(btrim(coalesce(confirm_name, ''))) <> lower(btrim(c.name)) then raise exception 'Type the organisation name exactly to confirm'; end if;
  if length(btrim(coalesce(reason, ''))) < 3 then raise exception 'Give a reason for deleting this organisation'; end if;

  select coalesce(array_agg(o.name order by o.name), '{}') into paths
    from storage.objects o where o.bucket_id = 'compliance' and o.name like cid::text || '/%';
  cnt := jsonb_build_object(
    'sites',          (select count(*) from public.sites where client_id = cid),
    'legal_entities', (select count(*) from public.legal_entities where client_id = cid),
    'certificates',   (select count(*) from public.site_documents where client_id = cid),
    'service_jobs',   (select count(*) from public.service_jobs where client_id = cid),
    'assessments',    (select count(*) from public.assessments where client_id = cid),
    'sign_offs',      (select count(*) from public.acknowledgements k join public.assessments a on a.id = k.assessment_id where a.client_id = cid),
    'people',         (select count(*) from public.portal_invites where client_id = cid),
    'files',          coalesce(array_length(paths, 1), 0));
  insert into public.admin_log (email, action, detail)
  values ((select email from public.profiles where id = auth.uid()), 'organisation deleted',
          jsonb_build_object('reason', btrim(reason), 'organisation', c.name, 'client_id', c.id) || cnt);

  perform set_config('safetybiz.org_delete', 'on', true);
  perform set_config('safetybiz.cert_delete', 'on', true);
  -- This organisation's people lose access; their accounts stay. Accounts of other organisations and Safetybiz are untouched.
  update public.profiles set role = 'none', client_id = null, site_id = null, unit_id = null
   where client_id = cid and role <> 'admin';
  delete from public.acknowledgements where assessment_id in (select id from public.assessments where client_id = cid);
  delete from public.assessments where client_id = cid and master_id is not null;   -- site copies, then masters
  delete from public.assessments where client_id = cid;
  delete from public.clients where id = cid;   -- cascades: sites, entities, units, certificates, service jobs, people, history
  perform set_config('safetybiz.org_delete', 'off', true);
  perform set_config('safetybiz.cert_delete', 'off', true);
  return paths;
end $$;
revoke execute on function public.delete_organisation(uuid, text, text) from public, anon;
grant execute on function public.delete_organisation(uuid, text, text) to authenticated;
