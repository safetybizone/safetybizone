-- Safetybiz One — migration 007: service jobs and certificates (safe to re-run).
-- Safetybiz engineers complete a service job (fire risk assessment, fire alarm, emergency lighting, extinguishers, PAT)
-- on a simple form. Issuing it creates a certificate PDF, files it in the site's Compliance centre, and turns every
-- defect into an action for the site. Issued certificates cannot be changed or deleted.

create table if not exists public.service_jobs (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references public.clients(id) on delete cascade,
  site_id            uuid not null references public.sites(id) on delete cascade,
  type               text not null check (type in ('fra','fa','el','ext','pat')),
  cert_no            text not null unique,
  status             text not null default 'Draft' check (status in ('Draft','Issued')),
  visit_date         date not null default current_date,
  outcome            text check (outcome in ('Satisfactory','Unsatisfactory')),
  interval_months    int not null default 12 check (interval_months between 1 and 60),
  next_due           date,
  data               jsonb not null default '{}'::jsonb,
  engineer_name      text,
  engineer_quals     text,
  engineer_sig       text,
  approver_name      text,
  approver_sig       text,
  customer_name      text,
  customer_sig       text,
  issued_at          timestamptz,
  site_document_id   uuid references public.site_documents(id) on delete set null,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_svc_site on public.service_jobs(site_id);
create index if not exists idx_svc_client on public.service_jobs(client_id);

-- The company always follows the site; issued certificates are locked.
create or replace function public.guard_service_job() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'Issued' then raise exception 'An issued certificate cannot be deleted'; end if;
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
drop trigger if exists trg_guard_service_job on public.service_jobs;
create trigger trg_guard_service_job before insert or update or delete on public.service_jobs
  for each row execute function public.guard_service_job();
revoke execute on function public.guard_service_job() from public, anon, authenticated;

alter table public.service_jobs enable row level security;
drop policy if exists admin_all on public.service_jobs;
drop policy if exists company_read on public.service_jobs;
drop policy if exists manager_read on public.service_jobs;
create policy admin_all on public.service_jobs for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy company_read on public.service_jobs for select to authenticated
  using (status = 'Issued' and public.is_client_admin() and client_id = public.my_client_id());
create policy manager_read on public.service_jobs for select to authenticated
  using (status = 'Issued' and public.mgr_site(site_id));
grant select, insert, update, delete on public.service_jobs to authenticated;
revoke all on public.service_jobs from anon;

-- Actions can now come from a service job (a site defect) as well as from a risk assessment.
alter table public.actions alter column assessment_id drop not null;
alter table public.actions
  add column if not exists site_id uuid references public.sites(id) on delete cascade,
  add column if not exists service_job_id uuid references public.service_jobs(id) on delete cascade,
  add column if not exists severity text,
  add column if not exists timescale text;
alter table public.actions drop constraint if exists actions_source_check;
alter table public.actions add constraint actions_source_check check (source in ('manual','control','audit','service'));
alter table public.actions drop constraint if exists actions_source_ok;
alter table public.actions add constraint actions_source_ok check (assessment_id is not null or (service_job_id is not null and site_id is not null));
create index if not exists idx_actions_site on public.actions(site_id);

-- True when the signed-in company administrator or manager may work on a site's defects.
create or replace function public.site_defect_ok(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select sid is not null and (
    (public.is_client_admin() and exists (select 1 from public.sites s where s.id = sid and s.client_id = public.my_client_id()))
    or public.mgr_site(sid));
$$;
revoke execute on function public.site_defect_ok(uuid) from public, anon;
grant execute on function public.site_defect_ok(uuid) to authenticated;

-- Company administrators and managers see and update (close) the defects for their sites; only Safetybiz raises them.
drop policy if exists site_defects on public.actions;
drop policy if exists site_defects_read on public.actions;
drop policy if exists site_defects_update on public.actions;
create policy site_defects_read on public.actions for select to authenticated
  using (service_job_id is not null and public.site_defect_ok(site_id));
create policy site_defects_update on public.actions for update to authenticated
  using (service_job_id is not null and public.site_defect_ok(site_id))
  with check (service_job_id is not null and public.site_defect_ok(site_id));
