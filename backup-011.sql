-- Snapshot taken immediately before migration 011 (Releases 1 and 2). Not exposed through the API.
create schema if not exists backup_20261127;
revoke all on schema backup_20261127 from public;
do $$ declare t text; begin
  foreach t in array array['clients','sites','org_units','assessments','assessment_hazards','assessment_controls','actions',
    'published_assessments','acknowledgements','site_documents','service_jobs','portal_invites','profiles','compliance_doc_types',
    'site_fhrs_history','audits'] loop
    execute format('drop table if exists backup_20261127.%I', t);
    execute format('create table backup_20261127.%I as table public.%I', t, t);
  end loop;
end $$;
drop table if exists backup_20261127.function_defs;
create table backup_20261127.function_defs as
  select p.proname, pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f';
drop table if exists backup_20261127.policies;
create table backup_20261127.policies as select * from pg_policies where schemaname in ('public','storage');
select (select count(*) from backup_20261127.sites) sites, (select count(*) from backup_20261127.assessments) ras,
       (select count(*) from backup_20261127.site_documents) docs, (select count(*) from backup_20261127.function_defs) fns;
