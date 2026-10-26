begin;

-- Publish through the deadline-aware RPC so a deadline saved in a private
-- draft survives the transition into the public/member-visible post.
create or replace function public.publish_my_joy_post_draft(p_club_id uuid, p_draft_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
  draft public.joy_post_drafts;
  published_post jsonb;
  published_post_id uuid;
begin
  if actor_id is null or actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_joy_membership_required';
  end if;
  if not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'joy_wall_v1' and flag.enabled
      and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
  ) then
    raise exception using errcode = '42501', message = 'joy_wall_disabled';
  end if;

  select own_draft.* into draft
  from public.joy_post_drafts as own_draft
  where own_draft.id = p_draft_id and own_draft.club_id = p_club_id
    and own_draft.author_app_account_id = actor_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'joy_post_draft_not_available';
  end if;

  published_post := public.create_joy_post_with_interaction_deadline(
    p_club_id, draft.post_type, draft.title, draft.content, draft.visibility_scope,
    draft.audience_membership_ids, draft.event_ids, draft.rotary_year_ids,
    draft.role_keys, draft.birthday_campaign_ids, draft.interaction_deadline_on
  );
  published_post_id := (published_post->>'id')::uuid;
  delete from public.joy_post_drafts where id = p_draft_id and club_id = p_club_id
    and author_app_account_id = actor_id;
  insert into public.joy_wall_audit_events (club_id, actor_app_account_id, object_kind, object_id, event_type, details)
  values (p_club_id, actor_id, 'post', published_post_id, 'post_draft_published', jsonb_build_object('draft_id', p_draft_id));
  return published_post;
end;
$$;

revoke all on function public.publish_my_joy_post_draft(uuid, uuid) from public, anon;
grant execute on function public.publish_my_joy_post_draft(uuid, uuid) to authenticated;

commit;
