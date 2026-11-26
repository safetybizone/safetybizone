-- Safetybiz One — migration 006: company structure, regional/area managers and brand master assessments (safe to re-run).
--
-- Structure: each client company can group its sites as Brand → Region → Area → Site (any level can be skipped).
-- Managers (role 'manager') are linked to one brand, region or area and see every site beneath it:
--   they read the published assessments, sign-offs, certificates and food hygiene ratings of those sites,
--   raise and close actions, upload certificates, record in-person sign-offs, update site details and add staff.
--   They do not create, edit or publish risk assessments (company administrators and Safetybiz do).
-- Brand masters: an assessment can be a brand master (no site). Copies are made for the brand's sites and can be
--   updated from the master later; each copy keeps its own answers and any hazards or controls the site added.

-- ---------- Structure ----------
create table if not exists public.org_units (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  parent_id  uuid references public.org_units(id) on delete cascade,
  kind       text not null check (kind in ('brand','region','area')),
  name       text not null default '',
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_units_client on public.org_units(client_id);
create index if not exists idx_units_parent on public.org_units(parent_id);

create or replace function public.unit_rank(k text) returns int language sql immutable set search_path = public as $$
  select case k when 'brand' then 1 when 'region' then 2 when 'area' then 3 else 9 end;
$$;

create or replace function public.check_org_unit() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.org_units;
begin
  if new.parent_id is not null then
    select * into p from public.org_units where id = new.parent_id;
    if p.id is null or p.client_id <> new.client_id then raise exception 'The parent belongs to another company'; end if;
    if public.unit_rank(p.kind) >= public.unit_rank(new.kind) then raise exception 'A % cannot sit under a %', new.kind, p.kind; end if;
    if new.id = new.parent_id then raise exception 'A unit cannot be its own parent'; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_check_org_unit on public.org_units;
create trigger trg_check_org_unit before insert or update on public.org_units
  for each row execute function public.check_org_unit();

alter table public.sites add column if not exists unit_id uuid references public.org_units(id) on delete set null;
create index if not exists idx_sites_unit on public.sites(unit_id);
create or replace function public.check_site_unit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.unit_id is not null and not exists (select 1 from public.org_units where id = new.unit_id and client_id = new.client_id) then
    raise exception 'That brand, region or area belongs to another company';
  end if;
  return new;
end $$;
drop trigger if exists trg_check_site_unit on public.sites;
create trigger trg_check_site_unit before insert or update of unit_id, client_id on public.sites
  for each row execute function public.check_site_unit();

-- ---------- Manager role ----------
alter table public.profiles       add column if not exists unit_id uuid references public.org_units(id) on delete set null;
alter table public.portal_invites add column if not exists unit_id uuid references public.org_units(id) on delete set null;
do $$ declare c record; begin
  for c in select conname, conrelid::regclass::text as tbl from pg_constraint
            where conrelid in ('public.profiles'::regclass, 'public.portal_invites'::regclass) and contype = 'c'
              and pg_get_constraintdef(oid) like '%role%client_admin%' and pg_get_constraintdef(oid) not like '%manager%' loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;
alter table public.profiles drop constraint if exists profiles_role_ok;
alter table public.profiles add constraint profiles_role_ok check (role in ('admin','client_admin','manager','staff','none'));
alter table public.portal_invites drop constraint if exists portal_invites_role_ok;
alter table public.portal_invites add constraint portal_invites_role_ok check (role in ('admin','client_admin','manager','staff'));
alter table public.portal_invites drop constraint if exists portal_invites_manager_unit;
alter table public.portal_invites add constraint portal_invites_manager_unit check (role <> 'manager' or unit_id is not null);

create or replace function public.mgr_client() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from public.profiles where id = auth.uid() and role = 'manager' and unit_id is not null;
$$;

-- True when the signed-in manager's brand, region or area contains this site.
create or replace function public.mgr_site(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  with recursive me as (
    select unit_id, client_id from public.profiles where id = auth.uid() and role = 'manager' and unit_id is not null
  ), tree as (
    select u.id from public.org_units u join me on u.id = me.unit_id
    union all
    select c.id from public.org_units c join tree t on c.parent_id = t.id
  )
  select exists (select 1 from public.sites s join me on s.client_id = me.client_id
                 where s.id = sid and s.unit_id in (select id from tree));
$$;
-- True when a brand, region or area is the signed-in manager's own or sits beneath it.
create or replace function public.mgr_unit(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  with recursive me as (
    select unit_id from public.profiles where id = auth.uid() and role = 'manager' and unit_id is not null
  ), tree as (
    select u.id from public.org_units u join me on u.id = me.unit_id
    union all
    select c.id from public.org_units c join tree t on c.parent_id = t.id
  )
  select uid is not null and uid in (select id from tree);
$$;
revoke execute on function public.mgr_client(), public.mgr_site(uuid), public.mgr_unit(uuid) from public, anon;
grant execute on function public.mgr_client(), public.mgr_site(uuid), public.mgr_unit(uuid) to authenticated;

-- Client users may see a published assessment: company administrators all of their company's,
-- managers those for sites in their part of the company, staff their site (or all sites).
create or replace function public.client_can_see(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.assessments a join public.profiles p on p.id = auth.uid()
    where a.id = aid and a.published_version > 0 and a.site_id is not null and a.client_id = p.client_id
      and ( p.role = 'client_admin'
         or (p.role = 'staff' and (p.site_id is null or p.site_id = a.site_id))
         or (p.role = 'manager' and public.mgr_site(a.site_id)) )
  );
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.portal_invites;
begin
  select * into inv from public.portal_invites where email = lower(new.email);
  insert into public.profiles (id, email, full_name, job_title, role, client_id, site_id, unit_id, is_super)
  values (new.id, lower(new.email),
          coalesce(inv.full_name, new.raw_user_meta_data->>'full_name'), inv.job_title,
          coalesce(inv.role, 'none'), inv.client_id, inv.site_id, inv.unit_id, coalesce(inv.is_super and inv.role = 'admin', false))
  on conflict (id) do nothing;
  return new;
end $$;

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
  if new.role = 'manager' then
    new.site_id := null;
    if new.unit_id is null or not exists (select 1 from public.org_units where id = new.unit_id and client_id = new.client_id) then
      raise exception 'Choose the brand, region or area this manager looks after';
    end if;
  else
    new.unit_id := null;
  end if;
  if auth.uid() is not null then
    if (new.role = 'admin' or (tg_op = 'UPDATE' and old.role = 'admin')) and not public.is_super() then
      raise exception 'Only a superadmin can add or change Safetybiz administrators';
    end if;
    if not public.is_admin() then
      if public.is_client_admin() then
        if new.role = 'admin' or new.client_id is distinct from public.my_client_id() then raise exception 'Not allowed'; end if;
      elsif public.mgr_client() is not null then
        -- Managers add staff to the sites they look after.
        if new.role <> 'staff' or new.client_id is distinct from public.mgr_client() or new.site_id is null or not public.mgr_site(new.site_id)
           or (tg_op = 'UPDATE' and (old.role <> 'staff' or old.site_id is null or not public.mgr_site(old.site_id))) then
          raise exception 'Managers can add staff to their own sites only';
        end if;
      else
        raise exception 'Not allowed';
      end if;
      new.created_by := coalesce(new.created_by, auth.uid());
    end if;
  end if;
  if tg_op = 'UPDATE' and old.email <> new.email then raise exception 'Email cannot be changed; remove and re-invite'; end if;
  update public.profiles
     set role = new.role, client_id = new.client_id, site_id = new.site_id, unit_id = new.unit_id, is_super = (new.role = 'admin' and new.is_super),
         full_name = coalesce(new.full_name, full_name), job_title = coalesce(new.job_title, job_title)
   where email = new.email
     and (auth.uid() is null or public.is_admin()
          or (role in ('none','staff','client_admin','manager') and (client_id is null or client_id = new.client_id) and public.is_client_admin())
          or (role in ('none','staff') and (client_id is null or client_id = new.client_id)));
  return new;
end $$;

create or replace function public.revoke_invite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and old.role = 'admin' and not public.is_super() then
    raise exception 'Only a superadmin can remove Safetybiz administrators';
  end if;
  update public.profiles set role = 'none', client_id = null, site_id = null, unit_id = null, is_super = false
   where email = old.email and id is distinct from auth.uid();
  return old;
end $$;

-- In-person sign-offs may be recorded by admins, company administrators and managers.
create or replace function public.prepare_ack() returns trigger
language plpgsql security definer set search_path = public as $$
declare v int; sid uuid; r text := public.my_role();
begin
  select published_version, site_id into v, sid from public.assessments where id = new.assessment_id;
  if coalesce(v, 0) = 0 then raise exception 'This assessment has not been published to the client'; end if;
  if new.method = 'In person' and r not in ('admin','client_admin','manager') then
    raise exception 'Only a manager can record an in-person sign-off';
  end if;
  if new.method = 'Own account' and r not in ('client_admin','manager','staff') then
    raise exception 'Use In person to record a sign-off for someone else';
  end if;
  new.version         := v;
  new.site_id         := sid;
  new.user_id         := auth.uid();
  new.email           := (select email from public.profiles where id = auth.uid());
  new.acknowledged_at := now();
  return new;
end $$;

-- ---------- Brand master assessments ----------
alter table public.assessments
  add column if not exists is_master boolean not null default false,
  add column if not exists unit_id uuid references public.org_units(id) on delete set null,
  add column if not exists master_id uuid references public.assessments(id) on delete set null,
  add column if not exists master_synced_at timestamptz;
alter table public.assessments alter column site_id drop not null;
alter table public.assessments drop constraint if exists assessments_site_or_master;
alter table public.assessments add constraint assessments_site_or_master check (is_master or site_id is not null);
alter table public.assessment_hazards  add column if not exists master_item_id uuid;
alter table public.assessment_controls add column if not exists master_item_id uuid;
create index if not exists idx_ra_master on public.assessments(master_id);

create or replace function public.sync_assessment_client() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_master then
    new.site_id := null;
    select client_id into new.client_id from public.org_units where id = new.unit_id and kind = 'brand';
    if new.client_id is null then raise exception 'Choose the brand for this master assessment'; end if;
  else
    select client_id into new.client_id from public.sites where id = new.site_id;
    if new.client_id is null then raise exception 'Unknown site'; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_sync_client on public.assessments;
create trigger trg_sync_client before insert or update of site_id, client_id, unit_id, is_master on public.assessments
  for each row execute function public.sync_assessment_client();

-- Masters are templates: they are copied to sites, never published themselves.
do $$ declare src text; begin
  select pg_get_functiondef('public.publish_assessment(uuid,text)'::regprocedure) into src;
  if position('is_master' in src) = 0 then
    src := replace(src, 'if a.id is null then raise exception ''Assessment not found''; end if;',
                        'if a.id is null then raise exception ''Assessment not found''; end if;
  if a.is_master then raise exception ''A brand master is published through its site copies''; end if;');
    execute src;
  end if;
end $$;

-- ---------- Security rules ----------
alter table public.org_units enable row level security;
drop policy if exists admin_all on public.org_units;
drop policy if exists company_all on public.org_units;
drop policy if exists manager_read on public.org_units;
create policy admin_all    on public.org_units for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy company_all  on public.org_units for all to authenticated
  using (public.is_client_admin() and client_id = public.my_client_id())
  with check (public.is_client_admin() and client_id = public.my_client_id());
create policy manager_read on public.org_units for select to authenticated using (client_id = public.mgr_client());
grant select, insert, update, delete on public.org_units to authenticated;
revoke all on public.org_units from anon;

-- Company administrators can also add and change their company's managers.
drop policy if exists manager_insert on public.portal_invites;
drop policy if exists manager_update on public.portal_invites;
create policy manager_insert on public.portal_invites for insert to authenticated
  with check (public.is_client_admin() and client_id = public.my_client_id() and role in ('staff','client_admin','manager'));
create policy manager_update on public.portal_invites for update to authenticated
  using (public.is_client_admin() and client_id = public.my_client_id())
  with check (public.is_client_admin() and client_id = public.my_client_id() and role in ('staff','client_admin','manager'));

drop policy if exists manager_read on public.clients;
create policy manager_read on public.clients for select to authenticated using (id = public.mgr_client());

drop policy if exists manager_read on public.sites;
drop policy if exists manager_update on public.sites;
create policy manager_read   on public.sites for select to authenticated using (public.mgr_site(id));
create policy manager_update on public.sites for update to authenticated
  using (public.mgr_site(id)) with check (client_id = public.mgr_client() and public.mgr_unit(unit_id));

drop policy if exists manager_people on public.profiles;
create policy manager_people on public.profiles for select to authenticated
  using (client_id = public.mgr_client() and (role = 'staff' and site_id is not null and public.mgr_site(site_id)));

drop policy if exists unit_manager_read on public.portal_invites;
drop policy if exists unit_manager_write on public.portal_invites;
create policy unit_manager_read on public.portal_invites for select to authenticated
  using (client_id = public.mgr_client() and role = 'staff' and site_id is not null and public.mgr_site(site_id));
create policy unit_manager_write on public.portal_invites for all to authenticated
  using (client_id = public.mgr_client() and role = 'staff' and site_id is not null and public.mgr_site(site_id))
  with check (client_id = public.mgr_client() and role = 'staff' and site_id is not null and public.mgr_site(site_id));

drop policy if exists manager_write on public.actions;
create policy manager_write on public.actions for all to authenticated
  using (public.my_role() = 'manager' and public.client_can_see(assessment_id))
  with check (public.my_role() = 'manager' and public.client_can_see(assessment_id));

drop policy if exists unit_manager_read on public.acknowledgements;
create policy unit_manager_read on public.acknowledgements for select to authenticated
  using (public.my_role() = 'manager' and public.client_can_see(assessment_id));

drop policy if exists manager_read on public.compliance_doc_types;
create policy manager_read on public.compliance_doc_types for select to authenticated using (public.mgr_client() is not null);
drop policy if exists unit_manager_read on public.site_documents;
drop policy if exists unit_manager_insert on public.site_documents;
drop policy if exists unit_manager_update on public.site_documents;
create policy unit_manager_read   on public.site_documents for select to authenticated using (public.mgr_site(site_id));
create policy unit_manager_insert on public.site_documents for insert to authenticated with check (public.mgr_site(site_id));
create policy unit_manager_update on public.site_documents for update to authenticated using (public.mgr_site(site_id)) with check (public.mgr_site(site_id));

drop policy if exists manager_read on public.site_fhrs_history;
create policy manager_read on public.site_fhrs_history for select to authenticated using (public.mgr_site(site_id));

do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    execute 'drop policy if exists compliance_manager_read on storage.objects';
    execute 'drop policy if exists compliance_manager_insert on storage.objects';
    execute $p$create policy compliance_manager_read on storage.objects for select to authenticated using (
      bucket_id = 'compliance' and (storage.foldername(name))[1] = public.mgr_client()::text
      and public.mgr_site(((storage.foldername(name))[2])::uuid))$p$;
    execute $p$create policy compliance_manager_insert on storage.objects for insert to authenticated with check (
      bucket_id = 'compliance' and (storage.foldername(name))[1] = public.mgr_client()::text
      and public.mgr_site(((storage.foldername(name))[2])::uuid))$p$;
  end if;
end $$;

revoke execute on function public.check_org_unit(), public.check_site_unit(), public.sync_assessment_client(), public.handle_new_user(),
  public.apply_invite(), public.revoke_invite(), public.prepare_ack() from public, anon, authenticated;
revoke execute on function public.client_can_see(uuid) from public, anon;
grant execute on function public.client_can_see(uuid) to authenticated;
