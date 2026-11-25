-- Safetybiz One — security tightening. Run after schema.sql (safe to re-run).
-- Internal functions can't be called through the API by signed-out visitors.
alter function public.touch_updated_at() set search_path = public;
-- Trigger functions: nobody calls these directly.
revoke execute on function public.add_head_office(), public.apply_invite(), public.handle_new_user(), public.log_change(),
  public.prepare_ack(), public.revoke_invite(), public.sync_assessment_client(), public.touch_updated_at() from public, anon, authenticated;
-- Helpers used by the security rules: signed-in users only.
revoke execute on function public.is_admin(), public.my_role(), public.my_client_id(), public.is_client_admin(), public.client_can_see(uuid),
  public.publish_assessment(uuid, text), public.log_portal_view(uuid) from public, anon;
grant execute on function public.is_admin(), public.my_role(), public.my_client_id(), public.is_client_admin(), public.client_can_see(uuid),
  public.publish_assessment(uuid, text), public.log_portal_view(uuid) to authenticated;
