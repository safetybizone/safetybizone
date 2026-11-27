-- Safetybiz One, Release 1 data step (run once, after migration 011).
-- Head office sites were created automatically. Remove the ones that hold nothing;
-- a "head office" that holds records is a real site, so keep it and just clear the flag.
delete from public.sites s
where s.is_head_office
  and not exists (select 1 from public.site_documents x        where x.site_id = s.id)
  and not exists (select 1 from public.assessments x           where x.site_id = s.id)
  and not exists (select 1 from public.published_assessments x where x.site_id = s.id)
  and not exists (select 1 from public.service_jobs x          where x.site_id = s.id)
  and not exists (select 1 from public.actions x               where x.site_id = s.id)
  and not exists (select 1 from public.acknowledgements x      where x.site_id = s.id)
  and not exists (select 1 from public.portal_invites x        where x.site_id = s.id)
  and not exists (select 1 from public.profiles x              where x.site_id = s.id);
update public.sites set is_head_office = false where is_head_office;
