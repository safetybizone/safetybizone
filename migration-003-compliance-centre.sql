-- Safetybiz One — migration 003: Compliance centre (safe to re-run).
-- Each site keeps its compliance documents (certificates, surveys, service records) with issue and expiry dates
-- and an uploaded file. Every upload is kept, so there is a full history.
-- Who can do what:
--   admin        : everything, for every client
--   client_admin : sees and uploads documents for their own company's sites (no deleting)
--   staff        : no access

create table if not exists public.compliance_doc_types (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  category        text not null default 'General',
  description     text,
  validity_months int check (validity_months is null or validity_months between 1 and 120),
  active          boolean not null default true,
  sort            int not null default 0,
  created_at      timestamptz not null default now()
);

create table if not exists public.site_documents (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id) on delete cascade,
  site_id        uuid not null references public.sites(id) on delete cascade,
  doc_type_id    uuid not null references public.compliance_doc_types(id) on delete restrict,
  not_applicable boolean not null default false,
  issue_date     date,
  expiry_date    date,
  provider       text,
  reference      text,
  notes          text,
  file_path      text,
  file_name      text,
  file_size      int,
  uploaded_by    uuid default auth.uid(),
  created_at     timestamptz not null default now()
);
create index if not exists idx_sitedocs_site on public.site_documents(site_id, doc_type_id, created_at desc);
create index if not exists idx_sitedocs_client on public.site_documents(client_id);

-- Keep the client in step with the site, and record who uploaded.
create or replace function public.prepare_site_document() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select client_id into new.client_id from public.sites where id = new.site_id;
  if new.client_id is null then raise exception 'Unknown site'; end if;
  if tg_op = 'INSERT' then new.uploaded_by := auth.uid(); new.created_at := now(); end if;
  return new;
end $$;
drop trigger if exists trg_prepare_site_document on public.site_documents;
create trigger trg_prepare_site_document before insert or update on public.site_documents
  for each row execute function public.prepare_site_document();
revoke execute on function public.prepare_site_document() from public, anon, authenticated;

alter table public.compliance_doc_types enable row level security;
alter table public.site_documents enable row level security;
drop policy if exists admin_all on public.compliance_doc_types;
drop policy if exists client_read on public.compliance_doc_types;
drop policy if exists admin_all on public.site_documents;
drop policy if exists manager_read on public.site_documents;
drop policy if exists manager_insert on public.site_documents;
drop policy if exists manager_update on public.site_documents;
create policy admin_all on public.compliance_doc_types for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy client_read on public.compliance_doc_types for select to authenticated using (public.is_client_admin());
create policy admin_all on public.site_documents for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy manager_read on public.site_documents for select to authenticated
  using (public.is_client_admin() and client_id = public.my_client_id());
create policy manager_insert on public.site_documents for insert to authenticated
  with check (public.is_client_admin() and client_id = public.my_client_id());
create policy manager_update on public.site_documents for update to authenticated
  using (public.is_client_admin() and client_id = public.my_client_id())
  with check (public.is_client_admin() and client_id = public.my_client_id());

grant select, insert, update, delete on public.compliance_doc_types, public.site_documents to authenticated;
revoke all on public.compliance_doc_types, public.site_documents from anon;

-- Private file storage: files live under <client id>/<site id>/... so access follows the company.
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('compliance', 'compliance', false, 20971520,
            array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
    execute 'drop policy if exists compliance_read on storage.objects';
    execute 'drop policy if exists compliance_insert on storage.objects';
    execute 'drop policy if exists compliance_delete on storage.objects';
    execute $p$create policy compliance_read on storage.objects for select to authenticated using (
      bucket_id = 'compliance' and (public.is_admin() or (public.is_client_admin() and (storage.foldername(name))[1] = public.my_client_id()::text)))$p$;
    execute $p$create policy compliance_insert on storage.objects for insert to authenticated with check (
      bucket_id = 'compliance' and (public.is_admin() or (public.is_client_admin() and (storage.foldername(name))[1] = public.my_client_id()::text)))$p$;
    execute $p$create policy compliance_delete on storage.objects for delete to authenticated using (
      bucket_id = 'compliance' and public.is_admin())$p$;
  end if;
end $$;

-- Starter document types (edit in the app). Validity in months; blank = no expiry.
insert into public.compliance_doc_types (name, category, validity_months, sort, description) values
  ('Employer''s and public liability insurance', 'Insurance', 12, 10, 'Current insurance certificate displayed or on file.'),
  ('Fire risk assessment', 'Fire', 12, 20, 'Fire risk assessment by a competent person, reviewed at least yearly.'),
  ('Fire alarm service certificate', 'Fire', 6, 30, 'Fire detection and alarm system serviced (typically every 6 months).'),
  ('Fire extinguisher service', 'Fire', 12, 40, 'Annual extinguisher service by a competent engineer.'),
  ('Emergency lighting test certificate', 'Fire', 12, 50, 'Annual full-duration emergency lighting test.'),
  ('Asbestos survey / register', 'Building', 12, 60, 'Asbestos management survey and register, reviewed yearly (premises built before 2000).'),
  ('Water (legionella) risk assessment', 'Water', 24, 70, 'Legionella risk assessment with a written scheme of control.'),
  ('Gas safety certificate', 'Gas', 12, 80, 'Gas appliances and installation checked by a Gas Safe registered engineer.'),
  ('Electrical installation condition report (EICR)', 'Electrical', 60, 90, 'Fixed wiring inspected and tested (commercial premises typically every 5 years).'),
  ('Portable appliance testing (PAT)', 'Electrical', 12, 100, 'Portable equipment inspected and tested.'),
  ('Kitchen ventilation and canopy cleaning', 'Kitchen', 6, 110, 'Extract canopy and ductwork cleaned to TR19 (frequency depends on use).'),
  ('Grease trap service', 'Kitchen', 3, 120, 'Grease trap emptied and serviced.'),
  ('Lift thorough examination (LOLER)', 'Lifting', 6, 130, 'Passenger and goods lifts thoroughly examined every 6 months.')
on conflict (name) do nothing;
