-- Safetybiz One migration 014 (Release A): only Safetybiz creates sites; site managers; Pending setup status.
-- Run once; safe to run again. Needs migrations 011-013.
--  * Sites are created by Safetybiz administrators only (organisation admins, managers and staff cannot).
--  * Each site can have one or more managers (site_managers). A manager can manage several sites.
--    Site managers sit alongside brand / region / area managers; a manager may have either or both.
--  * A site is 'Open' only while it has a manager. New sites start 'Pending setup' and open automatically when the
--    first manager is assigned; removing the last manager returns an open site to 'Pending setup'.
--    Pending setup sites stay fully usable: records, certificates and activity are unaffected.
--  * Organisation administrators appoint and reassign managers within their own organisation.

-- ---------- 1. Status ----------
alter table public.sites drop constraint if exists sites_status_check;
alter table public.sites add constraint sites_status_check check (status in ('Pending setup', 'Open', 'Temporarily closed', 'Archived'));
alter table public.sites alter column status set default 'Pending setup';

-- ---------- 2. Site managers ----------
create table if not exists public.site_managers (
  site_id    uuid not null references public.sites(id) on delete cascade,
  invite_id  uuid not null references public.portal_invites(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (site_id, invite_id)
);
create index if not exists idx_site_managers_invite on public.site_managers(invite_id);

-- The invite of the signed-in user (invites are unique per email).
create or replace function public.my_invite_id() returns uuid
language sql stable security definer set search_path = public as $$
  select i.id from public.portal_invites i join public.profiles p on p.email = i.email where p.id = auth.uid();
$$;
-- Is the signed-in user a directly assigned manager of this site?
create or replace function public.mgr_direct(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.site_managers m join public.profiles p on p.id = auth.uid() and p.role = 'manager'
                 join public.sites s on s.id = m.site_id and s.client_id = p.client_id
                 where m.site_id = sid and m.invite_id = public.my_invite_id());
$$;

create or replace function public.check_site_manager() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.portal_invites i join public.sites s on s.client_id = i.client_id
                 where i.id = new.invite_id and s.id = new.site_id and i.role = 'manager') then
    raise exception 'Choose a manager from this organisation';
  end if;
  return new;
end $$;
drop trigger if exists trg_check_site_manager on public.site_managers;
create trigger trg_check_site_manager before insert or update on public.site_managers for each row execute function public.check_site_manager();

-- Open a pending site when it gets its first manager; return an open site to pending when its last manager goes.
create or replace function public.site_manager_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.sites set status = 'Open' where id = new.site_id and status = 'Pending setup';
    return new;
  end if;
  if not exists (select 1 from public.site_managers where site_id = old.site_id) then
    update public.sites set status = 'Pending setup' where id = old.site_id and status = 'Open';
  end if;
  return old;
end $$;
drop trigger if exists trg_site_manager_status on public.site_managers;
create trigger trg_site_manager_status after insert or delete on public.site_managers for each row execute function public.site_manager_status();

alter table public.site_managers enable row level security;
drop policy if exists admin_all on public.site_managers;
create policy admin_all on public.site_managers for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists company_all on public.site_managers;
create policy company_all on public.site_managers for all to authenticated
  using (public.is_client_admin() and exists (select 1 from public.sites s where s.id = site_id and s.client_id = public.my_client_id()))
  with check (public.is_client_admin() and exists (select 1 from public.sites s where s.id = site_id and s.client_id = public.my_client_id()));
drop policy if exists manager_read on public.site_managers;
create policy manager_read on public.site_managers for select to authenticated using (public.mgr_site(site_id));
revoke all on public.site_managers from anon;
grant select, insert, delete on public.site_managers to authenticated;

-- ---------- 3. Sites: status rule; created by Safetybiz only ----------
create or replace function public.check_site_unit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.region_id is not null and not exists (select 1 from public.org_units where id = new.region_id and client_id = new.client_id and kind in ('region','area')) then
    raise exception 'That region belongs to another company';
  end if;
  new.unit_id := new.region_id;
  -- A site is Open only while it has a manager.
  if new.status = 'Open' and (tg_op = 'INSERT' or not exists (select 1 from public.site_managers where site_id = new.id)) then
    if tg_op = 'INSERT' then new.status := 'Pending setup';
    elsif old.status is distinct from 'Open' then raise exception 'Assign a site manager before opening this site';
    end if;
  end if;
  if new.status = 'Archived' and new.archived_at is null then new.archived_at := now(); end if;
  if new.status <> 'Archived' then new.archived_at := null; end if;
  return new;
end $$;
drop policy if exists company_insert on public.sites;   -- organisation administrators no longer create sites

-- ---------- 4. Manager visibility: brand / region / area managers, plus directly assigned site managers ----------
create or replace function public.mgr_client() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from public.profiles where id = auth.uid() and role = 'manager';
$$;
create or replace function public.mgr_site(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  with recursive me as (
    select unit_id, client_id from public.profiles where id = auth.uid() and role = 'manager'
  ), tree as (
    select u.id from public.org_units u join me on u.id = me.unit_id
    union all
    select c.id from public.org_units c join tree t on c.parent_id = t.id
  )
  select exists (select 1 from public.sites s join me on s.client_id = me.client_id
                 where s.id = sid and (s.region_id in (select id from tree)
                   or exists (select 1 from public.site_brands b where b.site_id = s.id and b.brand_id in (select id from tree))))
      or public.mgr_direct(sid);
$$;
-- A directly assigned site manager is responsible for the whole premises, so sees every brand's RAs there.
create or replace function public.mgr_ra(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.assessments a join public.sites s on s.id = a.site_id
                 where a.id = aid and public.mgr_site(s.id)
                   and (a.brand_id is null or public.mgr_unit(a.brand_id) or public.mgr_unit(s.region_id) or public.mgr_direct(s.id)));
$$;
drop policy if exists manager_update on public.sites;
create policy manager_update on public.sites for update to authenticated using (public.mgr_site(id))
  with check (client_id = public.mgr_client() and (public.mgr_direct(id) or public.mgr_unit(region_id)
              or exists (select 1 from public.site_brands b where b.site_id = sites.id and public.mgr_unit(b.brand_id))));

-- ---------- 5. Invites: a manager's brand / region / area is now optional (they may manage sites directly) ----------
alter table public.portal_invites drop constraint if exists portal_invites_manager_unit;
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
    if new.unit_id is not null and not exists (select 1 from public.org_units where id = new.unit_id and client_id = new.client_id) then
      raise exception 'That brand, region or area belongs to another organisation';
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
  -- No longer a manager: their site assignments end (an open site with no manager returns to Pending setup).
  if tg_op = 'UPDATE' and old.role = 'manager' and new.role <> 'manager' then
    delete from public.site_managers where invite_id = new.id;
  end if;
  update public.profiles
     set role = new.role, client_id = new.client_id, site_id = new.site_id, unit_id = new.unit_id, is_super = (new.role = 'admin' and new.is_super),
         full_name = coalesce(new.full_name, full_name), job_title = coalesce(new.job_title, job_title)
   where email = new.email
     and (auth.uid() is null or public.is_admin()
          or (role in ('none','staff','client_admin','manager') and (client_id is null or client_id = new.client_id) and public.is_client_admin())
          or (role in ('none','staff') and (client_id is null or client_id = new.client_id)));
  return new;
end $$;

-- ---------- 6. Existing sites without a manager: Pending setup (records untouched) ----------
update public.sites s set status = 'Pending setup'
 where s.status = 'Open' and not exists (select 1 from public.site_managers m where m.site_id = s.id);

revoke execute on function public.check_site_manager() from public, anon, authenticated;
revoke execute on function public.site_manager_status() from public, anon, authenticated;
