-- =====================================================================
-- Safetybiz 1ne — Risk assessments and client portal
-- Run this whole file once in Supabase: Dashboard → SQL Editor → New query.
-- Then run seed.sql for a starter hazard and control register (optional).
--
-- Security model (enforced by the database, not the browser):
--   admin        : you and your team. Full access to everything.
--   client_admin : a client's manager. Sees ONLY their own company's
--                  PUBLISHED assessments (frozen snapshots) for every site,
--                  live action status, and every acknowledgement for their
--                  company. Invites and removes their own staff. Can collect
--                  sign-offs in person on their device.
--   staff        : a client's employee. Sees published assessments for their
--                  site (or all sites if not assigned to one) and signs them.
--                  Sees only their own sign-offs.
--   none         : signed in but not invited. Sees nothing.
-- Nobody on the client side can see registers, drafts, audits, other
-- clients or your internal history.
-- Acknowledgements, audits and the activity log cannot be edited or deleted
-- by anyone through the app.
-- =====================================================================

-- ---------- Tables ----------------------------------------------------

create table if not exists public.clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  address       text,
  contact_name  text,
  contact_email text,
  phone         text,
  notes         text,
  created_at    timestamptz not null default now()
);

-- A client's locations. Every client gets a 'Head office' site automatically.
create table if not exists public.sites (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  name          text not null,
  address       text,
  site_contact  text,
  phone         text,
  is_head_office boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'none' check (role in ('admin','client_admin','staff','none')),
  client_id  uuid references public.clients(id) on delete set null,
  site_id    uuid references public.sites(id) on delete set null,
  job_title  text,
  created_at timestamptz not null default now()
);

-- Who may sign in, and as what. Signing in with an email that is not here
-- gives no access. Deleting a row removes that person's access.
create table if not exists public.portal_invites (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  role       text not null check (role in ('admin','client_admin','staff')),
  client_id  uuid references public.clients(id) on delete cascade,
  site_id    uuid references public.sites(id) on delete set null,
  full_name  text,
  job_title  text,
  check ((role = 'admin') = (client_id is null)),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.hazard_register (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  category    text not null default 'Other',
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.control_register (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  type        text not null default 'Administrative'
              check (type in ('Elimination','Substitution','Engineering','Administrative','PPE')),
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Which controls are suggested for which register hazard.
create table if not exists public.hazard_register_controls (
  hazard_id  uuid not null references public.hazard_register(id) on delete cascade,
  control_id uuid not null references public.control_register(id) on delete cascade,
  primary key (hazard_id, control_id)
);

-- Topic library: ready-made risk assessment templates built from the registers.
create table if not exists public.topic_library (
  id             uuid primary key default gen_random_uuid(),
  sector         text not null default 'General',
  title          text not null,
  description    text,
  people_exposed text[] not null default '{}',
  init_l int not null default 0 check (init_l between 0 and 5),
  init_s int not null default 0 check (init_s between 0 and 5),
  res_l  int not null default 0 check (res_l  between 0 and 5),
  res_s  int not null default 0 check (res_s  between 0 and 5),
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create table if not exists public.topic_hazards (
  topic_id  uuid not null references public.topic_library(id) on delete cascade,
  hazard_id uuid not null references public.hazard_register(id) on delete cascade,
  sort      int not null default 0,
  primary key (topic_id, hazard_id)
);
create table if not exists public.topic_controls (
  topic_id   uuid not null references public.topic_library(id) on delete cascade,
  control_id uuid not null references public.control_register(id) on delete cascade,
  sort       int not null default 0,
  primary key (topic_id, control_id)
);

create table if not exists public.assessments (
  id                uuid primary key default gen_random_uuid(),
  ref               text not null unique,
  title             text not null default '',
  description       text,
  people_exposed    text[] not null default '{}',
  init_l int not null default 0 check (init_l between 0 and 5),   -- without controls
  init_s int not null default 0 check (init_s between 0 and 5),
  res_l  int not null default 0 check (res_l  between 0 and 5),   -- with controls
  res_s  int not null default 0 check (res_s  between 0 and 5),
  topic_id          uuid references public.topic_library(id) on delete set null,
  client_id         uuid not null references public.clients(id) on delete restrict,
  site_id           uuid not null references public.sites(id) on delete restrict,
  activity          text,
  assessor          text,
  assessment_date   date default current_date,
  review_date       date,
  status            text not null default 'Draft'
                    check (status in ('Draft','Active','Under review','Archived')),
  notes             text,
  published_version int  not null default 0,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.assessment_hazards (
  id            uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  register_id   uuid references public.hazard_register(id) on delete set null,
  title         text not null default '',
  category      text not null default 'Other',
  description   text,
  sort          int not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.assessment_controls (
  id                  uuid primary key default gen_random_uuid(),
  assessment_id       uuid not null references public.assessments(id) on delete cascade,
  register_id         uuid references public.control_register(id) on delete set null,
  title               text not null default '',
  description         text,
  type                text not null default 'Administrative'
                      check (type in ('Elimination','Substitution','Engineering','Administrative','PPE')),
  state               text not null default 'In place' check (state in ('In place','Planned')),
  sort                int not null default 0,
  created_at          timestamptz not null default now()
);

create table if not exists public.actions (
  id                    uuid primary key default gen_random_uuid(),
  assessment_id         uuid not null references public.assessments(id) on delete cascade,
  assessment_control_id uuid references public.assessment_controls(id) on delete set null,
  source       text not null default 'manual' check (source in ('manual','control','audit')),
  title        text not null default '',
  owner        text,
  due_date     date,
  priority     text not null default 'Medium' check (priority in ('Low','Medium','High','Urgent')),
  status       text not null default 'Open' check (status in ('Open','In progress','Done')),
  completed_on date,
  created_at   timestamptz not null default now()
);

create table if not exists public.audits (
  id            uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  audit_date    date not null default current_date,
  auditor       text,
  score         int  check (score between 0 and 100),
  outcome       text,
  summary       text,
  items         jsonb not null default '[]',
  next_review   date,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);

-- Frozen copy of an assessment as sent to the client. Clients read only this.
create table if not exists public.published_assessments (
  id            uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  site_id       uuid references public.sites(id) on delete set null,
  version       int  not null,
  note          text,
  snapshot      jsonb not null,
  published_by  uuid default auth.uid(),
  published_at  timestamptz not null default now(),
  unique (assessment_id, version)
);

-- Client sign-offs. An assessment that has been acknowledged cannot be
-- deleted (archive it instead), so the record is kept.
create table if not exists public.acknowledgements (
  id              uuid primary key default gen_random_uuid(),
  assessment_id   uuid not null references public.assessments(id) on delete restrict,
  version         int  not null default 0,
  user_id         uuid default auth.uid(),
  email           text,
  full_name       text not null check (length(trim(full_name)) > 1),
  job_title       text,
  method          text not null default 'Own account' check (method in ('Own account','In person')),
  site_id         uuid references public.sites(id) on delete set null,
  statement       text not null,
  signature       text check (signature is null or length(signature) < 300000),
  user_agent      text,
  acknowledged_at timestamptz not null default now()
);

create table if not exists public.activity_log (
  id            bigint generated always as identity primary key,
  assessment_id uuid,           -- no foreign key: history survives deletion
  user_id       uuid,
  action        text not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_sites_client    on public.sites(client_id);
create index if not exists idx_hz_assessment   on public.assessment_hazards(assessment_id);
create index if not exists idx_ctl_assessment  on public.assessment_controls(assessment_id);
create index if not exists idx_act_assessment  on public.actions(assessment_id);
create index if not exists idx_aud_assessment  on public.audits(assessment_id);
create index if not exists idx_ack_assessment  on public.acknowledgements(assessment_id);
create index if not exists idx_pub_client      on public.published_assessments(client_id);
create index if not exists idx_log_assessment  on public.activity_log(assessment_id, created_at desc);

-- ---------- Helper functions -----------------------------------------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'none');
$$;

create or replace function public.my_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from public.profiles where id = auth.uid() and role in ('client_admin','staff');
$$;

create or replace function public.is_client_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'client_admin' and client_id is not null);
$$;

-- True when the signed-in client user may see this assessment: their company,
-- published, and (for staff assigned to a site) that site.
create or replace function public.client_can_see(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.assessments a join public.profiles p on p.id = auth.uid()
    where a.id = aid and a.published_version > 0
      and p.role in ('client_admin','staff') and a.client_id = p.client_id
      and (p.role = 'client_admin' or p.site_id is null or p.site_id = a.site_id)
  );
$$;

-- Every new client gets a Head office site.
create or replace function public.add_head_office() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.sites (client_id, name, address, is_head_office)
  values (new.id, 'Head office', new.address, true);
  return null;
end $$;
drop trigger if exists trg_head_office on public.clients;
create trigger trg_head_office after insert on public.clients
  for each row execute function public.add_head_office();

-- Keep an assessment's client in step with its site.
create or replace function public.sync_assessment_client() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select client_id into new.client_id from public.sites where id = new.site_id;
  if new.client_id is null then raise exception 'Unknown site'; end if;
  return new;
end $$;

-- ---------- New users ----------------------------------------------

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.portal_invites;
begin
  select * into inv from public.portal_invites where email = lower(new.email);
  insert into public.profiles (id, email, full_name, job_title, role, client_id, site_id)
  values (new.id, lower(new.email),
          coalesce(inv.full_name, new.raw_user_meta_data->>'full_name'), inv.job_title,
          coalesce(inv.role, 'none'), inv.client_id, inv.site_id)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Checks an invite and applies it to an existing account with that email.
create or replace function public.apply_invite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(trim(new.email));
  if new.role <> 'admin' then
    if new.client_id is null then raise exception 'A client user needs a client'; end if;
    if new.site_id is not null and not exists (select 1 from public.sites where id = new.site_id and client_id = new.client_id) then
      raise exception 'That site belongs to another client';
    end if;
  end if;
  -- auth.uid() is null when run from the SQL editor (setting up your first admin).
  if auth.uid() is not null and not public.is_admin() then
    -- Client managers can only invite their own staff and managers.
    if new.role = 'admin' or new.client_id is distinct from public.my_client_id() then
      raise exception 'Not allowed';
    end if;
    new.created_by := auth.uid();
  end if;
  if tg_op = 'UPDATE' and old.email <> new.email then raise exception 'Email cannot be changed; remove and re-invite'; end if;
  update public.profiles
     set role = new.role, client_id = new.client_id, site_id = new.site_id,
         full_name = coalesce(new.full_name, full_name), job_title = coalesce(new.job_title, job_title)
   where email = new.email
     and (auth.uid() is null or public.is_admin() or (role in ('none','staff','client_admin') and (client_id is null or client_id = new.client_id)));
  return new;
end $$;

drop trigger if exists trg_apply_invite on public.portal_invites;
create trigger trg_apply_invite before insert or update on public.portal_invites
  for each row execute function public.apply_invite();

-- Removing an invite removes access.
create or replace function public.revoke_invite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set role = 'none', client_id = null, site_id = null
   where email = old.email and id is distinct from auth.uid();
  return old;
end $$;

drop trigger if exists trg_revoke_invite on public.portal_invites;
create trigger trg_revoke_invite after delete on public.portal_invites
  for each row execute function public.revoke_invite();

-- ---------- Activity log ---------------------------------------------

create or replace function public.write_log(aid uuid, msg text) returns void
language plpgsql security definer set search_path = public as $$
declare last public.activity_log;
begin
  select * into last from public.activity_log
   where assessment_id is not distinct from aid
   order by created_at desc, id desc limit 1;
  -- Merge repeated identical edits by the same person within 10 minutes.
  if last.id is not null and last.action = msg
     and last.user_id is not distinct from auth.uid()
     and last.created_at > now() - interval '10 minutes' then
    update public.activity_log set created_at = now() where id = last.id;
  else
    insert into public.activity_log (assessment_id, user_id, action) values (aid, auth.uid(), msg);
  end if;
end $$;

create or replace function public.log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t text := tg_table_name;
  n jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  o jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  r jsonb := coalesce(n, o);
  aid uuid := case when t = 'assessments' then (r->>'id')::uuid else (r->>'assessment_id')::uuid end;
  ttl text := coalesce(nullif(r->>'title',''), 'untitled');
  msg text;
begin
  if t = 'assessments' then
    if tg_op = 'INSERT' then msg := 'Assessment created';
    elsif tg_op = 'DELETE' then msg := 'Assessment deleted (' || (o->>'ref') || ')';
    elsif n->>'status' is distinct from o->>'status' then msg := 'Status changed to ' || (n->>'status');
    elsif (n->>'init_l', n->>'init_s', n->>'res_l', n->>'res_s') is distinct from (o->>'init_l', o->>'init_s', o->>'res_l', o->>'res_s') then
      msg := 'Risk rating changed: without controls ' || ((n->>'init_l')::int * (n->>'init_s')::int)
             || ', with controls ' || ((n->>'res_l')::int * (n->>'res_s')::int);
    elsif (n - 'updated_at' - 'published_version') = (o - 'updated_at' - 'published_version') then return null;
    else msg := 'Edited assessment details';
    end if;
  elsif t = 'assessment_hazards' then
    if tg_op = 'INSERT' then msg := 'Hazard added: ' || ttl;
    elsif tg_op = 'DELETE' then msg := 'Hazard removed: ' || ttl;
    else msg := 'Hazard edited: ' || ttl;
    end if;
  elsif t = 'assessment_controls' then
    if tg_op = 'INSERT' then msg := 'Control added: ' || ttl;
    elsif tg_op = 'DELETE' then msg := 'Control removed: ' || ttl;
    elsif n->>'state' is distinct from o->>'state' then msg := 'Control "' || ttl || '" marked ' || lower(n->>'state');
    else msg := 'Control edited: ' || ttl;
    end if;
  elsif t = 'actions' then
    if tg_op = 'INSERT' then msg := 'Action raised: ' || ttl;
    elsif tg_op = 'DELETE' then msg := 'Action deleted: ' || ttl;
    elsif n->>'status' is distinct from o->>'status' then msg := 'Action "' || ttl || '" set to ' || (n->>'status');
    else msg := 'Action edited: ' || ttl;
    end if;
  elsif t = 'audits' then
    msg := 'Audit completed: ' || coalesce(r->>'score','?') || '% (' || coalesce(r->>'outcome','') || ')';
  elsif t = 'acknowledgements' then
      msg := 'Acknowledged by ' || (r->>'full_name') || coalesce(' (' || nullif(r->>'job_title','') || ')', '')
           || ' — version ' || (r->>'version') || case when r->>'method' = 'In person' then ', signed in person' else '' end;
  end if;
  perform public.write_log(aid, msg);
  return null;
end $$;

do $$ declare t text; begin
  foreach t in array array['assessments','assessment_hazards','assessment_controls','actions','audits','acknowledgements'] loop
    execute format('drop trigger if exists trg_log on public.%I', t);
    execute format('create trigger trg_log after insert or update or delete on public.%I for each row execute function public.log_change()', t);
  end loop;
end $$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_touch on public.assessments;
create trigger trg_touch before update on public.assessments
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_sync_client on public.assessments;
create trigger trg_sync_client before insert or update of site_id, client_id on public.assessments
  for each row execute function public.sync_assessment_client();

-- Fill in the server-side facts of an acknowledgement so they can't be faked.
create or replace function public.prepare_ack() returns trigger
language plpgsql security definer set search_path = public as $$
declare v int; sid uuid; r text := public.my_role();
begin
  select published_version, site_id into v, sid from public.assessments where id = new.assessment_id;
  if coalesce(v, 0) = 0 then raise exception 'This assessment has not been published to the client'; end if;
  if new.method = 'In person' and r not in ('admin','client_admin') then
    raise exception 'Only a manager can record an in-person sign-off';
  end if;
  if new.method = 'Own account' and r not in ('client_admin','staff') then
    raise exception 'Use In person to record a sign-off for someone else';
  end if;
  new.version         := v;
  new.site_id         := sid;
  new.user_id         := auth.uid();
  new.email           := (select email from public.profiles where id = auth.uid());
  new.acknowledged_at := now();
  return new;
end $$;

drop trigger if exists trg_prepare_ack on public.acknowledgements;
create trigger trg_prepare_ack before insert on public.acknowledgements
  for each row execute function public.prepare_ack();

-- ---------- Functions the app calls ------------------------------------

-- Freeze the current assessment and send it to the client portal as a new version.
create or replace function public.publish_assessment(aid uuid, note text default null) returns int
language plpgsql security definer set search_path = public as $$
declare a public.assessments; v int; snap jsonb;
begin
  if not public.is_admin() then raise exception 'Only admins can publish'; end if;
  select * into a from public.assessments where id = aid for update;
  if a.id is null then raise exception 'Assessment not found'; end if;
  v := a.published_version + 1;
  snap := jsonb_build_object(
    'assessment', to_jsonb(a) - 'created_by' - 'published_version',
    'client', (select jsonb_build_object('name', c.name, 'address', c.address) from public.clients c where c.id = a.client_id),
    'site', (select jsonb_build_object('name', st.name, 'address', st.address) from public.sites st where st.id = a.site_id),
    'hazards', coalesce((
      select jsonb_agg(jsonb_build_object('title', h.title, 'category', h.category, 'description', h.description)
                       order by h.sort, h.created_at)
      from public.assessment_hazards h where h.assessment_id = aid), '[]'::jsonb),
    'controls', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'description', c.description, 'type', c.type, 'state', c.state)
                       order by c.sort, c.created_at)
      from public.assessment_controls c where c.assessment_id = aid), '[]'::jsonb)
  );
  insert into public.published_assessments (assessment_id, client_id, site_id, version, note, snapshot)
  values (aid, a.client_id, a.site_id, v, note, snap);
  update public.assessments set published_version = v where id = aid;
  perform public.write_log(aid, 'Published version ' || v || ' to the client portal' || coalesce(': ' || nullif(note,''), ''));
  return v;
end $$;

-- Records that a client opened their assessment in the portal (once per day per person).
create or replace function public.log_portal_view(aid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  if not public.client_can_see(aid) then return; end if;
  select coalesce(full_name, email) into nm from public.profiles where id = auth.uid();
  if not exists (select 1 from public.activity_log where assessment_id = aid and user_id = auth.uid()
                 and action like 'Viewed in client portal%' and created_at::date = current_date) then
    insert into public.activity_log (assessment_id, user_id, action)
    values (aid, auth.uid(), 'Viewed in client portal by ' || nm);
  end if;
end $$;

-- ---------- Row-level security ----------------------------------------

do $$ declare t text; begin
  foreach t in array array['clients','sites','profiles','portal_invites','hazard_register','control_register','topic_library','topic_hazards','topic_controls',
    'hazard_register_controls','assessments','assessment_hazards','assessment_controls','actions','audits',
    'published_assessments','acknowledgements','activity_log'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Drop old policies so this file can be re-run safely.
do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- Admin: full access to working data.
do $$ declare t text; begin
  foreach t in array array['clients','sites','portal_invites','hazard_register','control_register',
    'hazard_register_controls','topic_library','topic_hazards','topic_controls','assessments','assessment_hazards','assessment_controls','actions'] loop
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Audits: admins add and read; nobody edits or deletes.
create policy admin_read   on public.audits for select to authenticated using (public.is_admin());
create policy admin_insert on public.audits for insert to authenticated with check (public.is_admin());

-- Published versions are created only by publish_assessment().
create policy admin_read  on public.published_assessments for select to authenticated using (public.is_admin());
create policy client_read on public.published_assessments for select to authenticated
  using (public.client_can_see(assessment_id));

-- Profiles: read your own; admins read all; client managers read their company's people.
create policy own_read     on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or (public.is_client_admin() and client_id = public.my_client_id()));
create policy admin_update on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Clients see their own company and its sites.
create policy client_read on public.clients for select to authenticated using (id = public.my_client_id());
create policy client_read on public.sites   for select to authenticated using (client_id = public.my_client_id());

-- Client managers manage their own company's staff invites.
create policy manager_read   on public.portal_invites for select to authenticated
  using (public.is_client_admin() and client_id = public.my_client_id());
create policy manager_insert on public.portal_invites for insert to authenticated
  with check (public.is_client_admin() and client_id = public.my_client_id() and role in ('staff','client_admin'));
create policy manager_update on public.portal_invites for update to authenticated
  using (public.is_client_admin() and client_id = public.my_client_id())
  with check (public.is_client_admin() and client_id = public.my_client_id() and role in ('staff','client_admin'));
create policy manager_delete on public.portal_invites for delete to authenticated
  using (public.is_client_admin() and client_id = public.my_client_id());

-- Clients see live status of actions on assessments they can see.
create policy client_read on public.actions for select to authenticated using (public.client_can_see(assessment_id));

-- Acknowledgements: admins read all; managers read their company's; staff read their own.
create policy admin_read    on public.acknowledgements for select to authenticated using (public.is_admin());
create policy manager_read  on public.acknowledgements for select to authenticated
  using (public.is_client_admin() and public.client_can_see(assessment_id));
create policy staff_read    on public.acknowledgements for select to authenticated using (user_id = auth.uid());
create policy sign_insert   on public.acknowledgements for insert to authenticated
  with check (user_id = auth.uid() and (public.is_admin() or public.client_can_see(assessment_id)));

-- Activity log: admins read; written only by the database itself.
create policy admin_read on public.activity_log for select to authenticated using (public.is_admin());

-- ---------- Grants -----------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
grant usage, select on all sequences in schema public to authenticated;
revoke execute on function public.publish_assessment(uuid, text) from public, anon;
revoke execute on function public.log_portal_view(uuid) from public, anon;
revoke execute on function public.write_log(uuid, text) from public, anon, authenticated;
grant execute on function public.publish_assessment(uuid, text) to authenticated;
grant execute on function public.log_portal_view(uuid) to authenticated;
grant execute on function public.is_admin(), public.my_role(), public.my_client_id(), public.is_client_admin(), public.client_can_see(uuid) to authenticated;
