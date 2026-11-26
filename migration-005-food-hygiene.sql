-- Safetybiz One — migration 005: food hygiene ratings on the site profile (safe to re-run).
-- Each site can be linked to its Food Standards Agency (FHRS / FHIS) listing. The app keeps the latest
-- rating on the site and the database records every change of rating in site_fhrs_history.

alter table public.sites
  add column if not exists fhrs_id integer,
  add column if not exists fhrs jsonb,
  add column if not exists fhrs_checked_at timestamptz;

create table if not exists public.site_fhrs_history (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites(id) on delete cascade,
  client_id   uuid not null references public.clients(id) on delete cascade,
  fhrs_id     integer,
  rating      text,
  rating_date date,
  recorded_at timestamptz not null default now()
);
create index if not exists idx_fhrs_hist_site on public.site_fhrs_history(site_id, recorded_at desc);

-- Record a history row whenever the linked business, its rating or its inspection date changes.
create or replace function public.record_fhrs_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.fhrs_id is not null and new.fhrs is not null and (
       tg_op = 'INSERT'
       or new.fhrs_id is distinct from old.fhrs_id
       or (new.fhrs->>'rating') is distinct from (old.fhrs->>'rating')
       or (new.fhrs->>'ratingDate') is distinct from (old.fhrs->>'ratingDate')) then
    insert into public.site_fhrs_history (site_id, client_id, fhrs_id, rating, rating_date)
    values (new.id, new.client_id, new.fhrs_id, new.fhrs->>'rating', nullif(new.fhrs->>'ratingDate', '')::date);
  end if;
  return null;
end $$;
drop trigger if exists trg_record_fhrs on public.sites;
create trigger trg_record_fhrs after insert or update of fhrs_id, fhrs on public.sites
  for each row execute function public.record_fhrs_change();
revoke execute on function public.record_fhrs_change() from public, anon, authenticated;

alter table public.site_fhrs_history enable row level security;
drop policy if exists admin_read on public.site_fhrs_history;
drop policy if exists company_read on public.site_fhrs_history;
create policy admin_read on public.site_fhrs_history for select to authenticated using (public.is_admin());
create policy company_read on public.site_fhrs_history for select to authenticated
  using (public.is_client_admin() and client_id = public.my_client_id());
grant select on public.site_fhrs_history to authenticated;
revoke all on public.site_fhrs_history from anon;
