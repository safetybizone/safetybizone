-- Safetybiz One: roll back Release A (migrations 013 and 014) to the state of 27 Nov 2026 (after migration 012).
-- Use only if Release A must be withdrawn. Site manager assignments and test-organisation flags are lost;
-- all other records are kept. Sites in 'Pending setup' return to 'Open'. Run in one go.
begin;

-- ---------- 014: site managers, Pending setup, sites created by Safetybiz only ----------
create or replace function public.check_site_unit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.region_id is not null and not exists (select 1 from public.org_units where id = new.region_id and client_id = new.client_id and kind in ('region','area')) then
    raise exception 'That region belongs to another company';
  end if;
  new.unit_id := new.region_id;
  if new.status = 'Archived' and new.archived_at is null then new.archived_at := now(); end if;
  if new.status <> 'Archived' then new.archived_at := null; end if;
  return new;
end $$;

update public.sites set status = 'Open' where status = 'Pending setup';
drop table if exists public.site_managers cascade;
drop function if exists public.site_manager_status();
drop function if exists public.check_site_manager();
alter table public.sites drop constraint if exists sites_status_check;
alter table public.sites add constraint sites_status_check check (status in ('Open', 'Temporarily closed', 'Archived'));
alter table public.sites alter column status set default 'Open';

drop policy if exists company_insert on public.sites;
create policy company_insert on public.sites for insert to authenticated with check (public.is_client_admin() and client_id = public.my_client_id());

create or replace function public.mgr_client() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from public.profiles where id = auth.uid() and role = 'manager' and unit_id is not null;
$$;
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
                 where s.id = sid and (s.region_id in (select id from tree)
                   or exists (select 1 from public.site_brands b where b.site_id = s.id and b.brand_id in (select id from tree))));
$$;
create or replace function public.mgr_ra(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.assessments a join public.sites s on s.id = a.site_id
                 where a.id = aid and public.mgr_site(s.id)
                   and (a.brand_id is null or public.mgr_unit(a.brand_id) or public.mgr_unit(s.region_id)));
$$;
drop policy if exists manager_update on public.sites;
drop function if exists public.mgr_direct(uuid);
drop function if exists public.my_invite_id();
create policy manager_update on public.sites for update to authenticated using (public.mgr_site(id))
  with check (client_id = public.mgr_client() and (public.mgr_unit(region_id)
              or exists (select 1 from public.site_brands b where b.site_id = sites.id and public.mgr_unit(b.brand_id))));

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
-- Managers added without a brand, region or area under Release A would break the old rule: they become staff with no site.
update public.portal_invites set role = 'staff' where role = 'manager' and unit_id is null;
alter table public.portal_invites drop constraint if exists portal_invites_manager_unit;
alter table public.portal_invites add constraint portal_invites_manager_unit check (role <> 'manager' or unit_id is not null);

-- ---------- 013: test organisations ----------
drop function if exists public.delete_organisation(uuid, text, text);
drop trigger if exists trg_guard_client_test on public.clients;
drop function if exists public.guard_client_test();
alter table public.clients drop column if exists is_test;
create or replace function public.guard_site_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
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
commit;
-- Then publish the previous app version in Netlify (Deploys -> the version before Release A -> Publish).
