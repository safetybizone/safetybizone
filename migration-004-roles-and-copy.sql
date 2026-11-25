-- Safetybiz One — migration 004: superadmins and company administrators (safe to re-run).
--
-- Safetybiz side
--   superadmin : everything an administrator can do, plus: add and remove administrators,
--                make others superadmin, delete clients, and edit the topic library.
--   admin      : day-to-day work for every client (clients, sites, assessments, registers, publishing).
--
-- Client side
--   client_admin (shown as "Company administrator"): linked to one company. Builds, edits and publishes
--                that company's risk assessments, raises actions, runs audits, adds sites and staff,
--                and keeps certificates. Reads the Safetybiz registers and topic library. Sees no other company.
--   staff      : unchanged — reads and signs the published assessments for their site.

-- ---------- Superadmin flag ----------
alter table public.profiles       add column if not exists is_super boolean not null default false;
alter table public.portal_invites add column if not exists is_super boolean not null default false;

create or replace function public.is_super() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and is_super);
$$;
revoke execute on function public.is_super() from public, anon;
grant execute on function public.is_super() to authenticated;

-- The first Safetybiz administrator becomes superadmin if there is none yet.
update public.profiles set is_super = true
 where id = (select id from public.profiles where role = 'admin' order by created_at limit 1)
   and not exists (select 1 from public.profiles where is_super);
update public.portal_invites i set is_super = true
  from public.profiles p where p.email = i.email and p.is_super and i.role = 'admin';

-- New accounts pick up the superadmin flag from their invite.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.portal_invites;
begin
  select * into inv from public.portal_invites where email = lower(new.email);
  insert into public.profiles (id, email, full_name, job_title, role, client_id, site_id, is_super)
  values (new.id, lower(new.email),
          coalesce(inv.full_name, new.raw_user_meta_data->>'full_name'), inv.job_title,
          coalesce(inv.role, 'none'), inv.client_id, inv.site_id, coalesce(inv.is_super and inv.role = 'admin', false))
  on conflict (id) do nothing;
  return new;
end $$;

-- Invites: only superadmins may create, change or remove Safetybiz administrators.
create or replace function public.apply_invite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(trim(new.email));
  if new.role <> 'admin' then
    new.is_super := false;
    if new.client_id is null then raise exception 'A client user needs a client'; end if;
    if new.site_id is not null and not exists (select 1 from public.sites where id = new.site_id and client_id = new.client_id) then
      raise exception 'That site belongs to another client';
    end if;
  end if;
  -- auth.uid() is null when run from the SQL editor (setting up your first admin).
  if auth.uid() is not null then
    if (new.role = 'admin' or (tg_op = 'UPDATE' and old.role = 'admin')) and not public.is_super() then
      raise exception 'Only a superadmin can add or change Safetybiz administrators';
    end if;
    if not public.is_admin() then
      -- Company administrators can only invite their own company's people.
      if new.role = 'admin' or new.client_id is distinct from public.my_client_id() then
        raise exception 'Not allowed';
      end if;
      new.created_by := auth.uid();
    end if;
  end if;
  if tg_op = 'UPDATE' and old.email <> new.email then raise exception 'Email cannot be changed; remove and re-invite'; end if;
  update public.profiles
     set role = new.role, client_id = new.client_id, site_id = new.site_id, is_super = (new.role = 'admin' and new.is_super),
         full_name = coalesce(new.full_name, full_name), job_title = coalesce(new.job_title, job_title)
   where email = new.email
     and (auth.uid() is null or public.is_admin() or (role in ('none','staff','client_admin') and (client_id is null or client_id = new.client_id)));
  return new;
end $$;

create or replace function public.revoke_invite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and old.role = 'admin' and not public.is_super() then
    raise exception 'Only a superadmin can remove Safetybiz administrators';
  end if;
  update public.profiles set role = 'none', client_id = null, site_id = null, is_super = false
   where email = old.email and id is distinct from auth.uid();
  return old;
end $$;

-- Profiles: nobody but a superadmin can change an administrator's access or the superadmin flag.
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_super() then return new; end if;
  if new.is_super is distinct from old.is_super
     or (old.role = 'admin' and new.role is distinct from 'admin')
     or (new.role = 'admin' and old.role is distinct from 'admin') then
    raise exception 'Only a superadmin can change Safetybiz administrator access';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_profile on public.profiles;
create trigger trg_guard_profile before update on public.profiles
  for each row execute function public.guard_profile();
revoke execute on function public.guard_profile() from public, anon, authenticated;

-- Only superadmins delete clients.
drop policy if exists admin_all on public.clients;
drop policy if exists admin_read on public.clients;
drop policy if exists admin_insert on public.clients;
drop policy if exists admin_update on public.clients;
drop policy if exists super_delete on public.clients;
create policy admin_read   on public.clients for select to authenticated using (public.is_admin());
create policy admin_insert on public.clients for insert to authenticated with check (public.is_admin());
create policy admin_update on public.clients for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy super_delete on public.clients for delete to authenticated using (public.is_super());

-- Only superadmins edit the topic library; everyone who builds assessments can read it.
do $$ declare t text; begin
  foreach t in array array['topic_library','topic_hazards','topic_controls'] loop
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('drop policy if exists builder_read on public.%I', t);
    execute format('drop policy if exists super_write on public.%I', t);
    execute format('create policy builder_read on public.%I for select to authenticated using (public.is_admin() or public.is_client_admin())', t);
    execute format('create policy super_write on public.%I for all to authenticated using (public.is_super()) with check (public.is_super())', t);
  end loop;
end $$;

-- ---------- Company administrators build their own company's assessments ----------
create or replace function public.company_owns(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_client_admin() and exists (select 1 from public.assessments a where a.id = aid and a.client_id = public.my_client_id());
$$;
revoke execute on function public.company_owns(uuid) from public, anon;
grant execute on function public.company_owns(uuid) to authenticated;

drop policy if exists company_all on public.assessments;
create policy company_all on public.assessments for all to authenticated
  using (public.is_client_admin() and client_id = public.my_client_id())
  with check (public.is_client_admin() and client_id = public.my_client_id());

do $$ declare t text; begin
  foreach t in array array['assessment_hazards','assessment_controls','actions'] loop
    execute format('drop policy if exists company_all on public.%I', t);
    execute format('create policy company_all on public.%I for all to authenticated using (public.company_owns(assessment_id)) with check (public.company_owns(assessment_id))', t);
  end loop;
end $$;

drop policy if exists company_read on public.audits;
drop policy if exists company_insert on public.audits;
create policy company_read   on public.audits for select to authenticated using (public.company_owns(assessment_id));
create policy company_insert on public.audits for insert to authenticated with check (public.company_owns(assessment_id));

drop policy if exists company_read on public.activity_log;
create policy company_read on public.activity_log for select to authenticated using (public.company_owns(assessment_id));

-- Registers: read-only for company administrators (only Safetybiz edits them).
do $$ declare t text; begin
  foreach t in array array['hazard_register','control_register','hazard_register_controls'] loop
    execute format('drop policy if exists company_read on public.%I', t);
    execute format('create policy company_read on public.%I for select to authenticated using (public.is_client_admin())', t);
  end loop;
end $$;

-- Sites and company details: company administrators can add and edit their own (not delete).
drop policy if exists company_insert on public.sites;
drop policy if exists company_update on public.sites;
create policy company_insert on public.sites for insert to authenticated
  with check (public.is_client_admin() and client_id = public.my_client_id());
create policy company_update on public.sites for update to authenticated
  using (public.is_client_admin() and client_id = public.my_client_id())
  with check (public.is_client_admin() and client_id = public.my_client_id());
drop policy if exists company_update on public.clients;
create policy company_update on public.clients for update to authenticated
  using (public.is_client_admin() and id = public.my_client_id())
  with check (public.is_client_admin() and id = public.my_client_id());

-- Company administrators may publish their own company's assessments.
do $$ declare src text; begin
  select pg_get_functiondef('public.publish_assessment(uuid,text)'::regprocedure) into src;
  if position('company_owns' in src) = 0 then
    src := replace(src, 'if not public.is_admin() then raise exception ''Only admins can publish''; end if;',
                        'if not (public.is_admin() or public.company_owns(aid)) then raise exception ''Not allowed to publish this assessment''; end if;');
    execute src;
  end if;
end $$;
revoke execute on function public.publish_assessment(uuid, text) from public, anon;
grant execute on function public.publish_assessment(uuid, text) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.apply_invite() from public, anon, authenticated;
revoke execute on function public.revoke_invite() from public, anon, authenticated;
