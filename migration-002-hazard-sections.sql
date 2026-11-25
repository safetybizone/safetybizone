-- Safetybiz One — migration 002 (run after schema.sql and hardening.sql; safe to re-run).
-- Follows the Safetybiz General Risk Assessment layout:
--   * each hazard has its own controls, risk score, persons affected and actions
--   * controls are In place / Planned (not in place) / N/A
--   * summary comments and signed approval (compliance documents live in the Compliance centre, migration 003)

alter table public.assessment_controls
  add column if not exists assessment_hazard_id uuid references public.assessment_hazards(id) on delete cascade;
create index if not exists idx_ctl_hazard on public.assessment_controls(assessment_hazard_id);
alter table public.assessment_controls drop constraint if exists assessment_controls_state_check;
alter table public.assessment_controls add constraint assessment_controls_state_check check (state in ('In place', 'Planned', 'N/A'));

alter table public.assessment_hazards
  add column if not exists risk_l int not null default 0 check (risk_l between 0 and 5),
  add column if not exists risk_s int not null default 0 check (risk_s between 0 and 5),
  add column if not exists people_affected text[] not null default '{}';

alter table public.actions
  add column if not exists assessment_hazard_id uuid references public.assessment_hazards(id) on delete set null;

alter table public.assessments
  add column if not exists accompanied_by text,
  add column if not exists summary text,
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists approval_signature text check (approval_signature is null or length(approval_signature) < 300000);

-- Record approvals in the history.
create or replace function public.log_approval() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.approved_at is distinct from old.approved_at then
    perform public.write_log(new.id, case when new.approved_at is null then 'Approval removed'
      else 'Approved by ' || coalesce(new.approved_by, 'unknown') end);
  end if;
  return null;
end $$;
drop trigger if exists trg_log_approval on public.assessments;
create trigger trg_log_approval after update of approved_at on public.assessments
  for each row execute function public.log_approval();
revoke execute on function public.log_approval() from public, anon, authenticated;

-- Publish a frozen copy including hazard sections, compliance, summary and approval.
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
      select jsonb_agg(jsonb_build_object('id', h.id, 'title', h.title, 'category', h.category, 'description', h.description,
        'risk_l', h.risk_l, 'risk_s', h.risk_s, 'people_affected', h.people_affected,
        'controls', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'description', c.description, 'type', c.type, 'state', c.state)
                              order by c.sort, c.created_at) from public.assessment_controls c where c.assessment_hazard_id = h.id), '[]'::jsonb))
        order by h.sort, h.created_at)
      from public.assessment_hazards h where h.assessment_id = aid), '[]'::jsonb),
    'controls', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'description', c.description, 'type', c.type, 'state', c.state)
                       order by c.sort, c.created_at)
      from public.assessment_controls c where c.assessment_id = aid and c.assessment_hazard_id is null), '[]'::jsonb)
  );
  insert into public.published_assessments (assessment_id, client_id, site_id, version, note, snapshot)
  values (aid, a.client_id, a.site_id, v, note, snap);
  update public.assessments set published_version = v where id = aid;
  perform public.write_log(aid, 'Published version ' || v || ' to the client portal' || coalesce(': ' || nullif(note,''), ''));
  return v;
end $$;
revoke execute on function public.publish_assessment(uuid, text) from public, anon;
grant execute on function public.publish_assessment(uuid, text) to authenticated;
