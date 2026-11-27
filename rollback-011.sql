-- Safetybiz One — rollback for migration 011 (Releases 1 and 2). Run only if Release 1/2 has to be undone.
-- Prerequisite: the snapshot schema backup_20261127 taken just before migration 011 was applied.
-- Afterwards, re-apply migrations 006, 007, 008 and 009 in order (all are safe to re-run): they restore the earlier
-- versions of mgr_site, client_can_see, sync_assessment_client, check_org_unit, check_site_unit and the policies.
-- New tables and columns are left in place (unused by the earlier app), so no data entered after deployment is lost.

-- 0. Migration 012 (superadmin certificate delete): put the earlier rules back.
drop function if exists public.delete_certificate(text, uuid, text);
drop policy if exists admin_read   on public.site_documents;
drop policy if exists admin_insert on public.site_documents;
drop policy if exists admin_update on public.site_documents;
drop policy if exists admin_all    on public.site_documents;
create policy admin_all on public.site_documents for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- (re-applying migration 007 below restores guard_service_job; admin_log is kept as a record)

-- 1. Remove the triggers added by 011.
drop trigger if exists trg_guard_master      on public.assessments;
drop trigger if exists trg_guard_master      on public.assessment_hazards;
drop trigger if exists trg_guard_master      on public.assessment_controls;
drop trigger if exists trg_guard_site_delete on public.sites;
drop trigger if exists trg_site_doc_types    on public.sites;
drop trigger if exists trg_check_site_unit   on public.sites;
drop index if exists public.org_units_unique_name;

-- 2. Put the structure tree, site groupings, head offices and directors back as they were.
alter table public.org_units disable trigger trg_check_org_unit;
update public.org_units u set parent_id = b.parent_id, name = b.name from backup_20261127.org_units b where b.id = u.id;
alter table public.org_units enable trigger trg_check_org_unit;
update public.sites s set unit_id = b.unit_id, is_head_office = b.is_head_office from backup_20261127.sites b where b.id = s.id;
insert into public.sites select b.* from backup_20261127.sites b where not exists (select 1 from public.sites s where s.id = b.id);
update public.clients c set directors = b.directors from backup_20261127.clients b where b.id = c.id;

-- 3. Automatic head office for new organisations.
create or replace function public.add_head_office() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.sites (client_id, name, address, is_head_office)
  values (new.id, 'Head office', new.address, true);
  return null;
end $$;
drop trigger if exists trg_head_office on public.clients;
create trigger trg_head_office after insert on public.clients for each row execute function public.add_head_office();
