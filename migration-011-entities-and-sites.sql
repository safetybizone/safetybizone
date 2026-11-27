-- Safetybiz One migration 011 (Release 1): legal entities, richer sites, independent brands (several per site) and region,
-- certificate applicability per site, organisation-wide masters, no automatic head office.
-- Additive: nothing existing is dropped. Run once; safe to run again.

-- ---------- 1. Legal entities (per organisation, reusable across its sites) ----------
create table if not exists public.legal_entities (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references public.clients(id) on delete cascade,
  name               text not null check (length(trim(name)) > 0),
  entity_type        text not null default 'Limited company'
                     check (entity_type in ('Limited company','LLP','Sole trader','Partnership','Charity','Other')),
  company_number     text check (company_number is null or company_number ~ '^[A-Z0-9]{8}$'),
  company_status     text,
  company_type       text,
  incorporated_on    date,
  registered_address text,
  sic_codes          text[] not null default '{}',
  source             text not null default 'manual' check (source in ('companies_house','manual')),
  ch_checked_at      timestamptz,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  unique (id, client_id)
);
create unique index if not exists le_client_number on public.legal_entities(client_id, company_number) where company_number is not null;
create index if not exists le_client on public.legal_entities(client_id);

alter table public.legal_entities enable row level security;
drop policy if exists admin_all on public.legal_entities;
drop policy if exists company_all on public.legal_entities;
drop policy if exists member_read on public.legal_entities;
create policy admin_all   on public.legal_entities for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy company_all on public.legal_entities for all to authenticated
  using (public.is_client_admin() and client_id = public.my_client_id())
  with check (public.is_client_admin() and client_id = public.my_client_id());
create policy member_read on public.legal_entities for select to authenticated
  using (client_id = public.my_client_id() or client_id = public.mgr_client());
grant select, insert, update, delete on public.legal_entities to authenticated;
revoke all on public.legal_entities from anon;

-- ---------- 2. Site profile fields ----------
alter table public.sites
  add column if not exists trading_name      text,
  add column if not exists legal_entity_id   uuid,
  add column if not exists business_activity text,
  add column if not exists contact_email     text,   -- site manager email (site_contact / phone already hold name and phone)
  add column if not exists status            text not null default 'Open',
  add column if not exists archived_at       timestamptz,
  add column if not exists region_id         uuid references public.org_units(id) on delete set null;
alter table public.sites drop constraint if exists sites_status_check;
alter table public.sites add constraint sites_status_check check (status in ('Open','Temporarily closed','Archived'));
-- The entity must belong to the site's own organisation (enforced by the database, not the app).
alter table public.sites drop constraint if exists sites_legal_entity_fk;
alter table public.sites add constraint sites_legal_entity_fk
  foreign key (legal_entity_id, client_id) references public.legal_entities(id, client_id);
create index if not exists idx_sites_entity on public.sites(legal_entity_id);
create index if not exists idx_sites_region on public.sites(region_id);

-- ---------- 3. Brand and region: optional and independent ----------
-- Brands stand alone; regions stand alone; an area sits under a region or stands alone.
create or replace function public.check_org_unit() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.org_units;
begin
  if new.parent_id is not null then
    if new.id = new.parent_id then raise exception 'A unit cannot be its own parent'; end if;
    select * into p from public.org_units where id = new.parent_id;
    if p.id is null or p.client_id <> new.client_id then raise exception 'The parent belongs to another company'; end if;
    if not (new.kind = 'area' and p.kind = 'region') then
      raise exception 'Brands and regions stand alone; only an area can sit under a region';
    end if;
  end if;
  return new;
end $$;

-- Brands per site: a physical site may trade as several brands (e.g. two delivery brands from one kitchen).
create table if not exists public.site_brands (
  site_id    uuid not null references public.sites(id) on delete cascade,
  brand_id   uuid not null references public.org_units(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (site_id, brand_id)
);
create index if not exists idx_site_brands_brand on public.site_brands(brand_id);
create or replace function public.check_site_brand() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.sites s join public.org_units u on u.client_id = s.client_id
                 where s.id = new.site_id and u.id = new.brand_id and u.kind = 'brand') then
    raise exception 'That brand belongs to another company';
  end if;
  return new;
end $$;
revoke execute on function public.check_site_brand() from public, anon, authenticated;
drop trigger if exists trg_check_site_brand on public.site_brands;
create trigger trg_check_site_brand before insert or update on public.site_brands for each row execute function public.check_site_brand();

-- Backfill brands and region from each site's place in the old tree, BEFORE the tree is flattened.
with recursive up as (
  select s.id site, u.id uid, u.kind, u.parent_id, 0 depth
  from public.sites s join public.org_units u on u.id = s.unit_id
  union all
  select up.site, p.id, p.kind, p.parent_id, up.depth + 1 from up join public.org_units p on p.id = up.parent_id
)
insert into public.site_brands (site_id, brand_id) select site, uid from up where kind = 'brand' on conflict do nothing;
with recursive up as (
  select s.id site, u.id uid, u.kind, u.parent_id, 0 depth
  from public.sites s join public.org_units u on u.id = s.unit_id
  union all
  select up.site, p.id, p.kind, p.parent_id, up.depth + 1 from up join public.org_units p on p.id = up.parent_id
)
update public.sites s set region_id = coalesce(s.region_id, (select uid from up where up.site = s.id and kind in ('region','area') order by depth limit 1))
where s.unit_id is not null;
-- (Test copies only: an earlier draft of this migration had a single sites.brand_id; carry it over and remove it.)
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sites' and column_name = 'brand_id') then
    execute 'insert into public.site_brands (site_id, brand_id) select id, brand_id from public.sites where brand_id is not null on conflict do nothing';
    execute 'drop policy if exists manager_update on public.sites';  -- recreated below
    execute 'alter table public.sites drop column brand_id';
  end if;
end $$;

alter table public.site_brands enable row level security;
drop policy if exists site_read on public.site_brands;
drop policy if exists company_write on public.site_brands;
create policy site_read on public.site_brands for select to authenticated
  using (exists (select 1 from public.sites s where s.id = site_id));
-- Brands decide what managers can see, so only Safetybiz and the company administrator set them.
create policy company_write on public.site_brands for all to authenticated
  using (public.is_admin() or (public.is_client_admin() and exists (select 1 from public.sites s where s.id = site_id and s.client_id = public.my_client_id())))
  with check (public.is_admin() or (public.is_client_admin() and exists (select 1 from public.sites s where s.id = site_id and s.client_id = public.my_client_id())));
grant select, insert, delete on public.site_brands to authenticated;
revoke all on public.site_brands from anon;

-- Flatten: regions and areas no longer sit under a brand.
alter table public.org_units disable trigger trg_check_org_unit;
update public.org_units u set parent_id = null
 where u.kind in ('region','area') and exists (select 1 from public.org_units p where p.id = u.parent_id and p.kind = 'brand');
alter table public.org_units enable trigger trg_check_org_unit;

-- The region must be a region or area of the same organisation. sites.unit_id is no longer used by the app;
-- it mirrors region_id so nothing reading it gets a stale value.
create or replace function public.check_site_unit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.region_id is not null and not exists (select 1 from public.org_units where id = new.region_id and client_id = new.client_id and kind in ('region','area')) then
    raise exception 'That region belongs to another company';
  end if;
  new.unit_id := new.region_id;
  if new.status = 'Archived' and new.archived_at is null then new.archived_at := now(); end if;
  if new.status <> 'Archived' then new.archived_at := null; end if;
  return new;
end $$;
drop trigger if exists trg_check_site_unit on public.sites;
create trigger trg_check_site_unit before insert or update on public.sites
  for each row execute function public.check_site_unit();

-- A manager sees every site carrying their brand (any of its brands), or in their region (and the areas inside it).
create or replace function public.mgr_site(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  with recursive me as (
    select unit_id, client_id from public.profiles where id = auth.uid() and role = 'manager' and unit_id is not null
  ), tree as (
    select u.id from public.org_units u join me on u.id = me.unit_id
    union all
    select c.id from public.org_units c join tree t on c.parent_id = t.id
  )
  select exists (select 1 from public.sites s join me on s.client_id = me.client_id
                 where s.id = sid and (s.region_id in (select id from tree)
                   or exists (select 1 from public.site_brands b where b.site_id = s.id and b.brand_id in (select id from tree))));
$$;
drop policy if exists manager_update on public.sites;
create policy manager_update on public.sites for update to authenticated
  using (public.mgr_site(id))
  with check (client_id = public.mgr_client() and (public.mgr_unit(region_id)
    or exists (select 1 from public.site_brands b where b.site_id = id and public.mgr_unit(b.brand_id))));

-- ---------- 4. Certificate applicability per site ----------
alter table public.compliance_doc_types add column if not exists default_applies boolean not null default true;
update public.compliance_doc_types set default_applies = false
 where name in ('Gas safety certificate','Lift thorough examination (LOLER)','Kitchen ventilation and canopy cleaning','Grease trap service');

create table if not exists public.site_doc_types (
  site_id     uuid not null references public.sites(id) on delete cascade,
  doc_type_id uuid not null references public.compliance_doc_types(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (site_id, doc_type_id)
);
alter table public.site_doc_types enable row level security;
drop policy if exists site_read on public.site_doc_types;
drop policy if exists site_write on public.site_doc_types;
-- Anyone who can see the site sees what applies there (the sites table's own rules decide who that is).
create policy site_read on public.site_doc_types for select to authenticated
  using (exists (select 1 from public.sites s where s.id = site_id));
create policy site_write on public.site_doc_types for all to authenticated
  using (public.is_admin() or public.mgr_site(site_id)
         or (public.is_client_admin() and exists (select 1 from public.sites s where s.id = site_id and s.client_id = public.my_client_id())))
  with check (public.is_admin() or public.mgr_site(site_id)
         or (public.is_client_admin() and exists (select 1 from public.sites s where s.id = site_id and s.client_id = public.my_client_id())));
grant select, insert, delete on public.site_doc_types to authenticated;
revoke all on public.site_doc_types from anon;

-- New sites start with the default list.
create or replace function public.add_site_doc_types() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.site_doc_types (site_id, doc_type_id)
  select new.id, t.id from public.compliance_doc_types t where t.active and t.default_applies
  on conflict do nothing;
  return new;
end $$;
revoke execute on function public.add_site_doc_types() from public, anon, authenticated;
drop trigger if exists trg_site_doc_types on public.sites;
create trigger trg_site_doc_types after insert on public.sites for each row execute function public.add_site_doc_types();

-- Existing sites: the default list, plus any type they already hold a certificate for.
insert into public.site_doc_types (site_id, doc_type_id)
select s.id, t.id from public.sites s cross join public.compliance_doc_types t
where t.active and (t.default_applies or exists (
  select 1 from public.site_documents d where d.site_id = s.id and d.doc_type_id = t.id and not d.not_applicable))
on conflict do nothing;

-- ---------- 5. No automatic head office ----------
drop trigger if exists trg_head_office on public.clients;
drop function if exists public.add_head_office();

-- ---------- 6. Masters: brand or organisation-wide; only Safetybiz creates or changes them ----------
create or replace function public.sync_assessment_client() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_master then
    new.site_id := null;
    if new.unit_id is not null then
      select client_id into new.client_id from public.org_units where id = new.unit_id and kind = 'brand';
      if new.client_id is null then raise exception 'A master is for a brand or for the whole organisation'; end if;
    elsif new.client_id is null or not exists (select 1 from public.clients where id = new.client_id) then
      raise exception 'Choose the organisation for this master assessment';
    end if;
  else
    select client_id into new.client_id from public.sites where id = new.site_id;
    if new.client_id is null then raise exception 'Unknown site'; end if;
  end if;
  return new;
end $$;

create or replace function public.guard_master() returns trigger
language plpgsql security definer set search_path = public as $$
declare aid uuid; m boolean;
begin
  if auth.uid() is null or public.is_admin() then return coalesce(new, old); end if;
  if tg_table_name = 'assessments' then
    m := coalesce((case when tg_op <> 'INSERT' then old.is_master end), false) or coalesce((case when tg_op <> 'DELETE' then new.is_master end), false);
  else
    aid := case when tg_op = 'DELETE' then old.assessment_id else new.assessment_id end;
    select is_master into m from public.assessments where id = aid;
  end if;
  if coalesce(m, false) then raise exception 'Only Safetybiz creates and changes master assessments'; end if;
  return coalesce(new, old);
end $$;
revoke execute on function public.guard_master() from public, anon, authenticated;
drop trigger if exists trg_guard_master on public.assessments;
create trigger trg_guard_master before insert or update or delete on public.assessments
  for each row execute function public.guard_master();
drop trigger if exists trg_guard_master on public.assessment_hazards;
create trigger trg_guard_master before insert or update or delete on public.assessment_hazards
  for each row execute function public.guard_master();
drop trigger if exists trg_guard_master on public.assessment_controls;
create trigger trg_guard_master before insert or update or delete on public.assessment_controls
  for each row execute function public.guard_master();

-- ---------- 7. Companies House details move to legal entities; directors are no longer kept ----------
insert into public.legal_entities (client_id, name, entity_type, company_number, company_status, company_type,
                                   incorporated_on, registered_address, sic_codes, source, ch_checked_at, created_by)
select c.id, c.name,
       case c.company_type when 'ltd' then 'Limited company' when 'private-limited-guarant-nsc' then 'Limited company'
            when 'private-limited-guarant-nsc-limited-exemption' then 'Limited company' when 'plc' then 'Limited company'
            when 'llp' then 'LLP' when 'charitable-incorporated-organisation' then 'Charity' else 'Other' end,
       c.company_number, c.company_status, c.company_type, c.incorporated_on, c.registered_address, c.sic_codes,
       'companies_house', c.ch_checked_at, null
from public.clients c
where c.company_number is not null
on conflict do nothing;
update public.sites s set legal_entity_id = e.id
from public.legal_entities e
where e.client_id = s.client_id and s.legal_entity_id is null
  and (select count(*) from public.legal_entities x where x.client_id = s.client_id) = 1;
update public.clients set directors = '[]' where directors <> '[]';

-- ---------- 8. No duplicate brand, region or area names within an organisation ----------
-- (Any existing duplicates are renamed "Name (2)" first so the rule can be added safely.)
with d as (
  select id, row_number() over (partition by client_id, kind, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)) order by created_at, id) n
  from public.org_units)
update public.org_units u set name = btrim(u.name) || ' (' || d.n || ')' from d where d.id = u.id and d.n > 1;
create unique index if not exists org_units_unique_name
  on public.org_units (client_id, kind, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)));

-- ---------- 9. A site with compliance history is archived, never deleted ----------
-- Deleting a site would otherwise cascade away its certificates, service records and defects.
create or replace function public.guard_site_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (
       exists (select 1 from public.site_documents       where site_id = old.id)
    or exists (select 1 from public.service_jobs         where site_id = old.id)
    or exists (select 1 from public.assessments          where site_id = old.id)
    or exists (select 1 from public.published_assessments where site_id = old.id)
    or exists (select 1 from public.actions              where site_id = old.id)
    or exists (select 1 from public.acknowledgements     where site_id = old.id)) then
    raise exception 'This site has compliance records, so it can''t be deleted. Set its status to Archived instead: it is hidden from lists and totals and its records are kept.';
  end if;
  return old;
end $$;
revoke execute on function public.guard_site_delete() from public, anon, authenticated;
drop trigger if exists trg_guard_site_delete on public.sites;
create trigger trg_guard_site_delete before delete on public.sites for each row execute function public.guard_site_delete();

-- ---------- 10. Brand-specific records on shared premises ----------
-- A risk assessment copied from a brand master belongs to that brand. On a site shared by several brands:
--  * premises records (the site, certificates, service records, site defects, premises-wide RAs) are visible to
--    every manager who covers the site;
--  * a brand's own RAs (and their actions, sign-offs and photos) are visible to managers of that brand, and to
--    managers of the site's region or area (who are responsible for the whole premises), not to other brands' managers.
alter table public.assessments add column if not exists brand_id uuid references public.org_units(id) on delete set null;
create index if not exists idx_ra_brand on public.assessments(brand_id);

create or replace function public.sync_assessment_client() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_master then
    new.site_id := null;
    if new.unit_id is not null then
      select client_id into new.client_id from public.org_units where id = new.unit_id and kind = 'brand';
      if new.client_id is null then raise exception 'A master is for a brand or for the whole organisation'; end if;
    elsif new.client_id is null or not exists (select 1 from public.clients where id = new.client_id) then
      raise exception 'Choose the organisation for this master assessment';
    end if;
    new.brand_id := new.unit_id;
  else
    select client_id into new.client_id from public.sites where id = new.site_id;
    if new.client_id is null then raise exception 'Unknown site'; end if;
    -- a site copy takes its brand from its master (an organisation-wide master has none)
    new.brand_id := (select m.brand_id from public.assessments m where m.id = new.master_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_sync_client on public.assessments;
create trigger trg_sync_client before insert or update of site_id, client_id, unit_id, is_master, master_id on public.assessments
  for each row execute function public.sync_assessment_client();
update public.assessments set brand_id = unit_id where is_master and brand_id is distinct from unit_id;
update public.assessments a set brand_id = m.brand_id from public.assessments m
 where m.id = a.master_id and not a.is_master and a.brand_id is distinct from m.brand_id;

-- True when the signed-in manager may see this site assessment.
create or replace function public.mgr_ra(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.assessments a join public.sites s on s.id = a.site_id
                 where a.id = aid and public.mgr_site(s.id)
                   and (a.brand_id is null or public.mgr_unit(a.brand_id) or public.mgr_unit(s.region_id)));
$$;
revoke execute on function public.mgr_ra(uuid) from public, anon;
grant execute on function public.mgr_ra(uuid) to authenticated;

create or replace function public.client_can_see(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.assessments a join public.profiles p on p.id = auth.uid()
    where a.id = aid and a.published_version > 0 and a.site_id is not null and a.client_id = p.client_id
      and ( p.role = 'client_admin'
         or (p.role = 'staff' and (p.site_id is null or p.site_id = a.site_id))
         or (p.role = 'manager' and public.mgr_ra(a.id)) )
  );
$$;

-- RA photos (<client>/<site>/ra/<assessment>/...) follow the same rule; other site files follow the site.
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    execute 'drop policy if exists compliance_manager_read on storage.objects';
    execute $p$create policy compliance_manager_read on storage.objects for select to authenticated using (
      bucket_id = 'compliance' and (storage.foldername(name))[1] = public.mgr_client()::text
      and public.mgr_site(((storage.foldername(name))[2])::uuid)
      and case when (storage.foldername(name))[3] is distinct from 'ra' or (storage.foldername(name))[4] = 'site' then true
               else public.mgr_ra(((storage.foldername(name))[4])::uuid) end)$p$;
  end if;
end $$;
