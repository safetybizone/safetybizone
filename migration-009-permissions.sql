-- Safetybiz One migration 009: permissions as set out in the Permission master sheet (27 Nov 2026).
--  * Each company has sectors. Company administrators see only the topic library topics for their sectors (plus General);
--    regional / area managers and store staff never see the library.
--  * Safetybiz administrators create the company, its sites and structure, and its FIRST company administrator.
--    After that the company administrator adds other administrators, managers and staff. Superadmins can still do it all.
-- Run once; safe to run again.

alter table public.clients add column if not exists sectors text[] not null default '{}';

-- The topic library sector for restaurants also covers takeaways.
update public.topic_library set sector = 'Restaurants, takeaways, pubs and catering' where sector = 'Pubs, bars, restaurants and catering';

create or replace function public.my_sectors() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce((select c.sectors from public.clients c where c.id = public.my_client_id()), '{}'::text[]);
$$;
revoke execute on function public.my_sectors() from public, anon;
grant execute on function public.my_sectors() to authenticated;

create or replace function public.company_has_admin(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.portal_invites where client_id = cid and role = 'client_admin');
$$;
revoke execute on function public.company_has_admin(uuid) from public, anon;
grant execute on function public.company_has_admin(uuid) to authenticated;

-- Topic library: Safetybiz sees all; a company administrator sees active topics for their sectors and General.
drop policy if exists builder_read on public.topic_library;
drop policy if exists admin_read on public.topic_library;
drop policy if exists company_read on public.topic_library;
create policy admin_read on public.topic_library for select to authenticated using (public.is_admin());
create policy company_read on public.topic_library for select to authenticated
  using (public.is_client_admin() and active and (sector = 'General' or sector = any (public.my_sectors())));

drop policy if exists builder_read on public.topic_hazards;
drop policy if exists admin_read on public.topic_hazards;
drop policy if exists company_read on public.topic_hazards;
create policy admin_read on public.topic_hazards for select to authenticated using (public.is_admin());
create policy company_read on public.topic_hazards for select to authenticated
  using (public.is_client_admin() and exists (select 1 from public.topic_library t where t.id = topic_id));

drop policy if exists builder_read on public.topic_controls;
drop policy if exists admin_read on public.topic_controls;
drop policy if exists company_read on public.topic_controls;
create policy admin_read on public.topic_controls for select to authenticated using (public.is_admin());
create policy company_read on public.topic_controls for select to authenticated
  using (public.is_client_admin() and exists (select 1 from public.topic_library t where t.id = topic_id));

-- People: Safetybiz administrators see everyone but add only a company's first company administrator.
drop policy if exists admin_all on public.portal_invites;
drop policy if exists admin_read on public.portal_invites;
drop policy if exists super_all on public.portal_invites;
drop policy if exists admin_first_company_admin on public.portal_invites;
drop policy if exists admin_add_admin on public.portal_invites;
create policy admin_read on public.portal_invites for select to authenticated using (public.is_admin());
create policy super_all on public.portal_invites for all to authenticated using (public.is_super()) with check (public.is_super());
create policy admin_first_company_admin on public.portal_invites for insert to authenticated
  with check (public.is_admin() and role = 'client_admin' and client_id is not null and not public.company_has_admin(client_id));

-- Only Safetybiz sets a company's sectors (a company administrator can still edit its name and contact details).
create or replace function public.guard_client_sectors() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.sectors is distinct from old.sectors and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only Safetybiz can change a company''s sectors';
  end if;
  return new;
end $$;
revoke execute on function public.guard_client_sectors() from public, anon, authenticated;
drop trigger if exists guard_client_sectors on public.clients;
create trigger guard_client_sectors before update on public.clients for each row execute function public.guard_client_sectors();
