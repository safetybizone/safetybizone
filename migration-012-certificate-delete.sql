-- Safetybiz One migration 012: a superadmin can permanently delete a certificate (an issued service certificate
-- or an uploaded certificate), with a reason. Every deletion is written to admin_log, which cannot be edited.
-- Nobody else can delete an issued certificate. Run once; safe to run again.

create table if not exists public.admin_log (
  id      uuid primary key default gen_random_uuid(),
  at      timestamptz not null default now(),
  user_id uuid default auth.uid(),
  email   text,
  action  text not null,
  detail  jsonb not null default '{}'
);
alter table public.admin_log enable row level security;
drop policy if exists super_read on public.admin_log;
create policy super_read on public.admin_log for select to authenticated using (public.is_super());
revoke all on public.admin_log from anon, authenticated;
grant select on public.admin_log to authenticated;   -- written only by the functions below

-- Issued certificates stay locked; only delete_certificate() (superadmin, with a reason) may remove one.
create or replace function public.guard_service_job() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'Issued' and coalesce(current_setting('safetybiz.cert_delete', true), '') <> 'on' then
      raise exception 'An issued certificate cannot be deleted';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status = 'Issued' then raise exception 'An issued certificate cannot be changed'; end if;
  select client_id into new.client_id from public.sites where id = new.site_id;
  if new.client_id is null then raise exception 'Unknown site'; end if;
  new.updated_at := now();
  if new.status = 'Issued' then
    if new.outcome is null then raise exception 'Choose the overall outcome'; end if;
    if coalesce(new.engineer_name, '') = '' or coalesce(new.engineer_sig, '') = '' then raise exception 'The engineer must sign the certificate'; end if;
    new.issued_at := coalesce(new.issued_at, now());
    new.next_due := (new.visit_date + make_interval(months => new.interval_months))::date;
  end if;
  return new;
end $$;

-- Uploaded certificates: Safetybiz admins keep read/insert/update; deleting goes through delete_certificate().
drop policy if exists admin_all on public.site_documents;
drop policy if exists admin_read on public.site_documents;
drop policy if exists admin_insert on public.site_documents;
drop policy if exists admin_update on public.site_documents;
create policy admin_read   on public.site_documents for select to authenticated using (public.is_admin());
create policy admin_insert on public.site_documents for insert to authenticated with check (public.is_admin());
create policy admin_update on public.site_documents for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- kind 'job' = an issued (or draft) service certificate and its filed copy and defects;
-- kind 'document' = one uploaded certificate record. Returns the stored file paths for the app to remove.
create or replace function public.delete_certificate(kind text, rid uuid, reason text) returns text[]
language plpgsql security definer set search_path = public as $$
declare j public.service_jobs; d public.site_documents; paths text[] := '{}'; n int;
begin
  if not public.is_super() then raise exception 'Only a superadmin can delete certificates'; end if;
  if length(btrim(coalesce(reason, ''))) < 3 then raise exception 'Give a reason for deleting this certificate'; end if;
  if kind = 'job' then
    select * into j from public.service_jobs where id = rid;
    if j.id is null then raise exception 'Certificate not found'; end if;
    select count(*) into n from public.actions where service_job_id = j.id;
    if j.site_document_id is not null then
      select * into d from public.site_documents where id = j.site_document_id;
      if d.file_path is not null then paths := array[d.file_path]; end if;
    end if;
    insert into public.admin_log (email, action, detail) values ((select email from public.profiles where id = auth.uid()), 'certificate deleted',
      jsonb_build_object('reason', btrim(reason), 'cert_no', j.cert_no, 'type', j.type, 'status', j.status, 'outcome', j.outcome,
        'visit_date', j.visit_date, 'issued_at', j.issued_at, 'site_id', j.site_id, 'site', (select name from public.sites where id = j.site_id),
        'client', (select name from public.clients where id = j.client_id), 'defects_removed', n, 'file', d.file_path));
    perform set_config('safetybiz.cert_delete', 'on', true);
    delete from public.service_jobs where id = j.id;          -- its defects (actions) go with it
    if d.id is not null then delete from public.site_documents where id = d.id; end if;
    perform set_config('safetybiz.cert_delete', 'off', true);
  elsif kind = 'document' then
    select * into d from public.site_documents where id = rid;
    if d.id is null then raise exception 'Certificate not found'; end if;
    if exists (select 1 from public.service_jobs where site_document_id = d.id and status = 'Issued') then
      raise exception 'This certificate was issued from a Safetybiz service job: delete it from the service job instead';
    end if;
    if d.file_path is not null then paths := array[d.file_path]; end if;
    insert into public.admin_log (email, action, detail) values ((select email from public.profiles where id = auth.uid()), 'certificate deleted',
      jsonb_build_object('reason', btrim(reason), 'document_type', (select name from public.compliance_doc_types where id = d.doc_type_id),
        'not_applicable', d.not_applicable, 'issue_date', d.issue_date, 'expiry_date', d.expiry_date, 'provider', d.provider, 'reference', d.reference,
        'site_id', d.site_id, 'site', (select name from public.sites where id = d.site_id), 'client', (select name from public.clients where id = d.client_id), 'file', d.file_path));
    delete from public.site_documents where id = d.id;
  else
    raise exception 'Unknown kind';
  end if;
  return paths;
end $$;
revoke execute on function public.delete_certificate(text, uuid, text) from public, anon;
grant execute on function public.delete_certificate(text, uuid, text) to authenticated;
