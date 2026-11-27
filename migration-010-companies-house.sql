-- Safetybiz One migration 010: Companies House details on each company. Run once; safe to run again.
alter table public.clients add column if not exists company_number text;
alter table public.clients add column if not exists company_status text;
alter table public.clients add column if not exists company_type text;
alter table public.clients add column if not exists incorporated_on date;
alter table public.clients add column if not exists registered_address text;
alter table public.clients add column if not exists sic_codes text[] not null default '{}';
alter table public.clients add column if not exists directors jsonb not null default '[]';
alter table public.clients add column if not exists ch_checked_at timestamptz;
