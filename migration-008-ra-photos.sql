-- Safetybiz One migration 008: photos on risk assessment controls and actions.
-- Photos are stored in the private compliance bucket under <client id>/<site id>/ra/<assessment id>/...
-- (brand masters, which have no site, use the all-zero site folder). Run once; safe to run again.

alter table public.assessment_controls add column if not exists photos text[] not null default '{}';
alter table public.actions add column if not exists photos text[] not null default '{}';

-- Publish the control photos with the frozen copy so managers see them in the portal.
do $$ declare src text; begin
  select pg_get_functiondef('public.publish_assessment(uuid,text)'::regprocedure) into src;
  if position('''photos''' in src) = 0 then
    src := replace(src, '''state'', c.state)', '''state'', c.state, ''photos'', c.photos)');
    execute src;
  end if;
end $$;
revoke execute on function public.publish_assessment(uuid, text) from public, anon;
grant execute on function public.publish_assessment(uuid, text) to authenticated;
