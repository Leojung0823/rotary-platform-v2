begin;

-- Manual unpairing removes the app-account projection only. It does not mean
-- the LINE user unfollowed the OA, so a still-following row must remain
-- eligible for a later exact identity pairing.
create or replace function public.unpair_line_oa_follower(p_club_id uuid, p_follower_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare actor_id uuid := public.current_app_account_id();
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'oa.manage') then
    raise exception using errcode = '42501', message = 'oa_manage_required';
  end if;
  update public.line_oa_followers
  set person_id = null,
      app_account_id = null,
      paired_at = null,
      unpaired_at = case when follower_status = 'following' then null else unpaired_at end,
      updated_at = now()
  where id = p_follower_id and club_id = p_club_id;
  if not found then raise exception using errcode = 'P0002', message = 'oa_follower_not_found'; end if;
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'line_oa.unpaired', 'line_oa_follower', p_follower_id,
    jsonb_build_object(
      'reason', btrim(coalesce(p_reason, '')),
      'login_identity_unchanged', true,
      'follower_projection_cleared', true
    ));
end;
$$;

revoke all on function public.unpair_line_oa_follower(uuid, uuid, text) from public, anon;
grant execute on function public.unpair_line_oa_follower(uuid, uuid, text) to authenticated;

-- Repair rows written by the old implementation. Keep the follower and its
-- provider timestamps, but do not let a row marked unpaired keep identifying
-- the previous app account.
update public.line_oa_followers
set person_id = null,
    app_account_id = null,
    paired_at = null,
    updated_at = now()
where follower_status = 'unpaired'
  and (person_id is not null or app_account_id is not null);

commit;
