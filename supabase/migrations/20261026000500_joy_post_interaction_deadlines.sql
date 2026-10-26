begin;

alter table public.joy_posts
  add column interaction_deadline_on date;

-- A deadline is inclusive through that calendar day in Taiwan. Reactions,
-- favorites, receipt acknowledgements, and IOU lifecycle actions are separate
-- interactions and are intentionally unaffected; this closes only comments and
-- answers on ordinary Joy posts.
create or replace function public.joy_post_interactions_open(p_club_id uuid, p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.joy_posts as post
    where post.id = p_post_id
      and post.club_id = p_club_id
      and post.post_type <> 'iou'
      and post.post_status = 'published'
      and (post.interaction_deadline_on is null
        or post.interaction_deadline_on >= (current_timestamp at time zone 'Asia/Taipei')::date)
  )
$$;

-- This projection helper is deliberately not callable by app roles. It is used
-- only by already-authorized, feature-flagged RPCs below.
create or replace function public.joy_post_interaction_projection(p_club_id uuid, p_post_id uuid, p_projection jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
  post public.joy_posts;
begin
  if actor_id is null or actor_membership_id is null
    or not public.current_can_read_joy_post(p_post_id, p_club_id, actor_id, actor_membership_id) then
    raise exception using errcode = '42501', message = 'joy_post_not_available';
  end if;
  select * into post from public.joy_posts as joy_row
  where joy_row.id = p_post_id and joy_row.club_id = p_club_id;
  if not found or p_projection is null or jsonb_typeof(p_projection) <> 'object'
    or p_projection->>'id' is distinct from p_post_id::text then
    raise exception using errcode = 'P0002', message = 'joy_post_not_available';
  end if;
  return p_projection || jsonb_build_object(
    'interaction_deadline_on', post.interaction_deadline_on,
    'interactions_open', public.joy_post_interactions_open(p_club_id, p_post_id)
  );
end;
$$;

create or replace function public.create_joy_post_with_interaction_deadline(
  p_club_id uuid,
  p_post_type text,
  p_title text,
  p_content text,
  p_visibility_scope text,
  p_audience_membership_ids uuid[],
  p_event_ids uuid[],
  p_rotary_year_ids uuid[],
  p_role_keys text[],
  p_birthday_campaign_ids uuid[],
  p_interaction_deadline_on date
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  created_post jsonb;
  created_post_id uuid;
begin
  if actor_id is null or public.current_active_joy_membership(p_club_id) is null then
    raise exception using errcode = '42501', message = 'active_joy_membership_required';
  end if;
  if not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'joy_wall_v1' and flag.enabled
      and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
  ) then
    raise exception using errcode = '42501', message = 'joy_wall_disabled';
  end if;

  created_post := public.create_joy_post_with_targets(
    p_club_id, p_post_type, p_title, p_content, p_visibility_scope,
    p_audience_membership_ids, p_event_ids, p_rotary_year_ids, p_role_keys, p_birthday_campaign_ids
  );
  created_post_id := (created_post->>'id')::uuid;
  update public.joy_posts as post
  set interaction_deadline_on = p_interaction_deadline_on
  where post.id = created_post_id and post.club_id = p_club_id
    and post.author_app_account_id = actor_id and post.post_type <> 'iou';
  if not found then
    raise exception using errcode = 'P0002', message = 'joy_post_not_available';
  end if;
  return public.joy_post_interaction_projection(p_club_id, created_post_id, created_post);
end;
$$;

create or replace function public.update_own_joy_post_with_interaction_deadline(
  p_club_id uuid,
  p_post_id uuid,
  p_post_type text,
  p_title text,
  p_content text,
  p_interaction_deadline_on date
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  updated_post jsonb;
begin
  if actor_id is null or public.current_active_joy_membership(p_club_id) is null then
    raise exception using errcode = '42501', message = 'active_joy_membership_required';
  end if;
  if not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'joy_wall_v1' and flag.enabled
      and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
  ) then
    raise exception using errcode = '42501', message = 'joy_wall_disabled';
  end if;

  updated_post := public.update_own_joy_post(p_club_id, p_post_id, p_post_type, p_title, p_content);
  update public.joy_posts as post
  set interaction_deadline_on = p_interaction_deadline_on
  where post.id = p_post_id and post.club_id = p_club_id
    and post.author_app_account_id = actor_id and post.post_type <> 'iou';
  if not found then
    raise exception using errcode = 'P0002', message = 'joy_post_not_available';
  end if;
  return public.joy_post_interaction_projection(p_club_id, p_post_id, updated_post);
end;
$$;

create or replace function public.list_joy_posts_with_interaction_deadlines(
  p_club_id uuid,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20,
  p_favorites_only boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  base_projection jsonb;
  enriched_posts jsonb;
begin
  base_projection := public.list_joy_posts_with_targets(
    p_club_id, p_cursor_created_at, p_cursor_id, p_limit, p_favorites_only
  );
  select coalesce(jsonb_agg(
    public.joy_post_interaction_projection(p_club_id, (item.post->>'id')::uuid, item.post)
    order by item.ordinality
  ), '[]'::jsonb)
  into enriched_posts
  from jsonb_array_elements(coalesce(base_projection->'posts', '[]'::jsonb))
    with ordinality as item(post, ordinality);
  return jsonb_set(base_projection, '{posts}', enriched_posts, true);
end;
$$;

create or replace function public.get_my_joy_question_post_with_interaction_deadline(
  p_club_id uuid,
  p_post_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  base_projection jsonb;
begin
  base_projection := public.get_my_joy_question_post_with_recipient_actions(p_club_id, p_post_id);
  if base_projection is null then
    return null;
  end if;
  return public.joy_post_interaction_projection(p_club_id, p_post_id, base_projection);
end;
$$;

-- Restate the latest existing comment RPC and add one server-side guard. Keep
-- its original validation, rate limits, visibility checks and audit behavior.
create or replace function public.create_joy_comment(
  p_club_id uuid, p_post_id uuid, p_parent_comment_id uuid, p_comment_type text, p_content text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
  normalized_content text := btrim(replace(replace(coalesce(p_content, ''), E'\r\n', E'\n'), E'\r', E'\n'));
  created_comment public.joy_comments;
  post_author uuid;
begin
  if actor_id is null or actor_membership_id is null
    or not public.current_can_read_joy_post(p_post_id, p_club_id, actor_id, actor_membership_id) then
    raise exception using errcode = '42501', message = 'joy_post_not_available';
  end if;
  if exists (select 1 from public.joy_posts where id = p_post_id and club_id = p_club_id and post_type = 'iou') then
    raise exception using errcode = '22023', message = 'joy_iou_uses_lifecycle_actions';
  end if;
  if p_comment_type is null or p_comment_type not in ('comment', 'blessing', 'encouragement', 'question', 'answer')
    or char_length(normalized_content) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'invalid_joy_comment';
  end if;
  select author_app_account_id into post_author from public.joy_posts
  where id = p_post_id and club_id = p_club_id and post_status = 'published';
  if not found then raise exception using errcode = 'P0002', message = 'joy_post_not_available'; end if;
  if not public.joy_post_interactions_open(p_club_id, p_post_id) then
    raise exception using errcode = 'P0001', message = 'joy_post_interactions_closed';
  end if;
  if p_comment_type = 'answer' and actor_id <> post_author
    and (select post.visibility_scope from public.joy_posts as post
      where post.id = p_post_id and post.club_id = p_club_id) <> 'club'
    and not exists (select 1 from public.joy_post_audiences as audience
      where audience.post_id = p_post_id and audience.club_id = p_club_id
        and audience.membership_id = actor_membership_id) then
    raise exception using errcode = '42501', message = 'joy_answer_recipient_required';
  end if;
  if p_parent_comment_id is not null and not exists (
    select 1 from public.joy_comments as parent
    where parent.id = p_parent_comment_id and parent.post_id = p_post_id and parent.club_id = p_club_id
      and parent.parent_comment_id is null and parent.comment_status = 'active'
  ) then raise exception using errcode = '22023', message = 'invalid_joy_reply_target'; end if;

  perform public.assert_joy_rate_limit(p_club_id, actor_id, 'comment', 8, interval '1 minute');
  perform public.assert_joy_rate_limit(p_club_id, actor_id, 'comment', 40, interval '1 hour');

  insert into public.joy_comments (
    club_id, post_id, author_app_account_id, author_membership_id,
    parent_comment_id, comment_type, content
  ) values (
    p_club_id, p_post_id, actor_id, actor_membership_id,
    p_parent_comment_id, p_comment_type, normalized_content
  ) returning * into created_comment;
  insert into public.joy_wall_audit_events (club_id, actor_app_account_id, object_kind, object_id, event_type)
  values (p_club_id, actor_id, 'comment', created_comment.id, 'comment_created');
  return jsonb_build_object(
    'id', created_comment.id, 'parent_comment_id', created_comment.parent_comment_id,
    'comment_type', created_comment.comment_type, 'content', created_comment.content,
    'created_at', created_comment.created_at,
    'author_display_name', (select account.account_display_name from public.app_accounts as account where account.id = actor_id),
    'author_avatar_url', (select person.avatar_url from public.app_accounts as account join public.people as person on person.id = account.person_id where account.id = actor_id),
    'can_delete', true
  );
end;
$$;

revoke all on function public.joy_post_interactions_open(uuid, uuid) from public, anon, authenticated;
revoke all on function public.joy_post_interaction_projection(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.create_joy_post_with_interaction_deadline(uuid, text, text, text, text, uuid[], uuid[], uuid[], text[], uuid[], date) from public, anon;
revoke all on function public.update_own_joy_post_with_interaction_deadline(uuid, uuid, text, text, text, date) from public, anon;
revoke all on function public.list_joy_posts_with_interaction_deadlines(uuid, timestamptz, uuid, integer, boolean) from public, anon;
revoke all on function public.get_my_joy_question_post_with_interaction_deadline(uuid, uuid) from public, anon;

grant execute on function public.create_joy_post_with_interaction_deadline(uuid, text, text, text, text, uuid[], uuid[], uuid[], text[], uuid[], date) to authenticated;
grant execute on function public.update_own_joy_post_with_interaction_deadline(uuid, uuid, text, text, text, date) to authenticated;
grant execute on function public.list_joy_posts_with_interaction_deadlines(uuid, timestamptz, uuid, integer, boolean) to authenticated;
grant execute on function public.get_my_joy_question_post_with_interaction_deadline(uuid, uuid) to authenticated;

commit;
