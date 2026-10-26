begin;

alter table public.joy_posts
  add column pinned_at timestamptz;

create index joy_posts_club_pinned_idx
  on public.joy_posts (club_id, pinned_at desc, id desc)
  where pinned_at is not null;

alter table public.joy_wall_audit_events
  drop constraint if exists joy_wall_audit_events_event_type_check;
alter table public.joy_wall_audit_events
  add constraint joy_wall_audit_events_event_type_check check (event_type in (
    'post_created', 'post_updated', 'post_archived', 'comment_created',
    'reaction_changed', 'post_reported', 'report_dismissed', 'post_hidden',
    'iou_created', 'iou_accepted', 'iou_declined', 'iou_started',
    'iou_completion_confirmed', 'iou_completed', 'iou_cancelled',
    'question_prompt_created', 'question_prompt_updated', 'question_batch_dispatched',
    'receipt_acknowledged', 'recipient_hide_requested', 'suggestion_created', 'suggestion_reviewed',
    'post_draft_saved', 'post_draft_deleted', 'post_draft_published', 'post_pinned', 'post_unpinned'
  ));

-- Internal extension of the canonical feed projection. The optional IDs are
-- restricted to the bounded pinned projection below; all normal callers keep
-- the established five-argument RPC and visibility/cursor behavior.
create function public.list_joy_posts(
  p_club_id uuid,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid,
  p_limit integer,
  p_favorites_only boolean,
  p_post_ids uuid[]
)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, auth as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
  result jsonb;
begin
  if actor_id is null or actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_joy_membership_required';
  end if;
  if p_favorites_only is null
    or (p_post_ids is not null and cardinality(p_post_ids) > 5) then
    raise exception using errcode = '22023', message = 'invalid_joy_page';
  end if;
  if p_favorites_only and not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'joy_wall_v1' and flag.enabled
      and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
  ) then
    raise exception using errcode = '42501', message = 'joy_wall_disabled';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50
    or ((p_cursor_created_at is null) <> (p_cursor_id is null)) then
    raise exception using errcode = '22023', message = 'invalid_joy_page';
  end if;
  if p_cursor_id is not null and not exists (
    select 1 from public.joy_posts as cursor_post
    where cursor_post.id = p_cursor_id and cursor_post.club_id = p_club_id
      and cursor_post.created_at = p_cursor_created_at
      and public.current_can_read_joy_post(p_cursor_id, p_club_id, actor_id, actor_membership_id)
      and (not p_favorites_only or exists (
        select 1 from public.joy_post_favorites as favorite
        where favorite.club_id = p_club_id and favorite.post_id = p_cursor_id
          and favorite.app_account_id = actor_id
      ))
      and (p_post_ids is null or cursor_post.id = any(p_post_ids))
  ) then
    raise exception using errcode = '22023', message = 'invalid_joy_cursor';
  end if;

  with page as materialized (
    select post.id, post.club_id, post.post_type, post.title, post.content,
      post.visibility_scope, post.post_status, post.created_at, post.updated_at,
      post.pinned_at is not null as is_pinned,
      account.account_display_name as author_display_name, person.avatar_url as author_avatar_url,
      (post.author_app_account_id = actor_id and post.post_type <> 'iou') as can_edit,
      (post.author_app_account_id = actor_id and post.post_type <> 'iou') as can_archive,
      (post.post_type <> 'iou' and (post.author_app_account_id = actor_id or post.visibility_scope = 'club'
        or exists (select 1 from public.joy_post_audiences as audience
          where audience.post_id = post.id and audience.club_id = post.club_id
            and audience.membership_id = actor_membership_id))) as can_answer,
      post.post_status = 'hidden' as is_hidden,
      public.joy_iou_projection(post.id, p_club_id, actor_id, actor_membership_id) as iou_projection,
      (select count(*)::integer from public.joy_comments as comment
       where comment.post_id = post.id and comment.club_id = post.club_id and comment.comment_status = 'active') as comment_count,
      (select coalesce(jsonb_object_agg(reaction_type, reaction_total), '{}'::jsonb)
       from (select reaction_type, count(*)::integer as reaction_total
             from public.joy_reactions where post_id = post.id group by reaction_type) as totals) as reaction_counts,
      (select reaction.reaction_type from public.joy_reactions as reaction
       where reaction.post_id = post.id and reaction.app_account_id = actor_id) as my_reaction,
      exists (select 1 from public.joy_post_favorites as favorite
        where favorite.club_id = post.club_id and favorite.post_id = post.id
          and favorite.app_account_id = actor_id) as is_favorited
    from public.joy_posts as post
    join public.app_accounts as account on account.id = post.author_app_account_id
    join public.people as person on person.id = account.person_id
    where post.club_id = p_club_id
      and public.current_can_read_joy_post(post.id, p_club_id, actor_id, actor_membership_id)
      and (p_post_ids is null or post.id = any(p_post_ids))
      and (not p_favorites_only or exists (
        select 1 from public.joy_post_favorites as favorite
        where favorite.club_id = post.club_id and favorite.post_id = post.id
          and favorite.app_account_id = actor_id
      ))
      and (p_cursor_created_at is null or post.created_at < p_cursor_created_at
        or (post.created_at = p_cursor_created_at and post.id < p_cursor_id))
    order by post.created_at desc, post.id desc
    limit p_limit + 1
  ), visible as materialized (
    select * from page order by created_at desc, id desc limit p_limit
  )
  select jsonb_build_object(
    'posts', coalesce((select jsonb_agg(jsonb_build_object(
      'id', visible.id, 'post_type', visible.post_type, 'title', visible.title,
      'content', visible.content, 'visibility_scope', visible.visibility_scope,
      'post_status', visible.post_status, 'created_at', visible.created_at, 'updated_at', visible.updated_at,
      'author_display_name', visible.author_display_name, 'author_avatar_url', visible.author_avatar_url,
      'can_edit', visible.can_edit, 'can_archive', visible.can_archive,
      'can_answer', visible.can_answer, 'is_hidden', visible.is_hidden, 'iou', visible.iou_projection,
      'comment_count', visible.comment_count, 'reaction_counts', visible.reaction_counts,
      'my_reaction', visible.my_reaction, 'is_favorited', visible.is_favorited,
      'is_pinned', visible.is_pinned
    ) order by visible.created_at desc, visible.id desc) from visible), '[]'::jsonb),
    'next_cursor', case when (select count(*) from page) > p_limit then (
      select jsonb_build_object('v', 1, 'created_at', oldest.created_at, 'id', oldest.id)
      from visible as oldest order by oldest.created_at asc, oldest.id asc limit 1
    ) else null end
  ) into result;
  return result;
end;
$$;

create or replace function public.list_joy_posts(
  p_club_id uuid,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid,
  p_limit integer,
  p_favorites_only boolean
)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public, auth as $$
  select public.list_joy_posts(p_club_id, p_cursor_created_at, p_cursor_id, p_limit, p_favorites_only, null)
$$;

create function public.list_joy_posts_with_recipient_actions(
  p_club_id uuid,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid,
  p_limit integer,
  p_favorites_only boolean,
  p_post_ids uuid[]
)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, auth as $$
declare
  base_projection jsonb;
  enriched_posts jsonb;
begin
  if not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'joy_wall_v1' and flag.enabled
      and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
  ) then
    raise exception using errcode = '42501', message = 'joy_wall_disabled';
  end if;
  base_projection := public.list_joy_posts(
    p_club_id, p_cursor_created_at, p_cursor_id, p_limit, p_favorites_only, p_post_ids
  );
  select coalesce(jsonb_agg(
    item.post || public.joy_post_recipient_action_projection(p_club_id, (item.post->>'id')::uuid)
    order by item.ordinality
  ), '[]'::jsonb)
  into enriched_posts
  from jsonb_array_elements(coalesce(base_projection->'posts', '[]'::jsonb))
    with ordinality as item(post, ordinality);
  return jsonb_set(base_projection, '{posts}', enriched_posts, true);
end;
$$;

create or replace function public.list_joy_posts_with_recipient_actions(
  p_club_id uuid,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20,
  p_favorites_only boolean default false
)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public, auth as $$
  select public.list_joy_posts_with_recipient_actions(
    p_club_id, p_cursor_created_at, p_cursor_id, p_limit, p_favorites_only, null
  )
$$;

create function public.list_joy_posts_with_targets(
  p_club_id uuid,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid,
  p_limit integer,
  p_favorites_only boolean,
  p_post_ids uuid[]
)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, auth as $$
declare
  base_projection jsonb;
  enriched_posts jsonb;
  visible_birthday_campaigns jsonb;
begin
  base_projection := public.list_joy_posts_with_recipient_actions(
    p_club_id, p_cursor_created_at, p_cursor_id, p_limit, p_favorites_only, p_post_ids
  );
  visible_birthday_campaigns := public.joy_visible_birthday_campaigns(p_club_id);
  select coalesce(jsonb_agg(
    item.post || jsonb_build_object(
      'targets', public.joy_post_targets_projection(
        p_club_id, (item.post->>'id')::uuid, visible_birthday_campaigns
      )
    ) order by item.ordinality
  ), '[]'::jsonb)
  into enriched_posts
  from jsonb_array_elements(coalesce(base_projection->'posts', '[]'::jsonb))
    with ordinality as item(post, ordinality);
  return jsonb_set(base_projection, '{posts}', enriched_posts, true);
end;
$$;

create or replace function public.list_joy_posts_with_targets(
  p_club_id uuid,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20,
  p_favorites_only boolean default false
)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public, auth as $$
  select public.list_joy_posts_with_targets(
    p_club_id, p_cursor_created_at, p_cursor_id, p_limit, p_favorites_only, null
  )
$$;

create function public.list_joy_posts_with_interaction_deadlines(
  p_club_id uuid,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid,
  p_limit integer,
  p_favorites_only boolean,
  p_post_ids uuid[]
)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, auth as $$
declare
  base_projection jsonb;
  enriched_posts jsonb;
begin
  base_projection := public.list_joy_posts_with_targets(
    p_club_id, p_cursor_created_at, p_cursor_id, p_limit, p_favorites_only, p_post_ids
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

create or replace function public.list_joy_posts_with_interaction_deadlines(
  p_club_id uuid,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20,
  p_favorites_only boolean default false
)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public, auth as $$
  select public.list_joy_posts_with_interaction_deadlines(
    p_club_id, p_cursor_created_at, p_cursor_id, p_limit, p_favorites_only, null
  )
$$;

create or replace function public.set_joy_post_pinned(
  p_club_id uuid,
  p_post_id uuid,
  p_is_pinned boolean
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare
  actor_id uuid := public.current_app_account_id();
  target_post public.joy_posts;
  next_pinned_at timestamptz;
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'joy.moderate') then
    raise exception using errcode = '42501', message = 'joy_moderation_required';
  end if;
  if not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'joy_wall_v1' and flag.enabled
      and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
  ) then
    raise exception using errcode = '42501', message = 'joy_wall_disabled';
  end if;
  if p_is_pinned is null then
    raise exception using errcode = '22023', message = 'invalid_joy_pin_action';
  end if;

  -- Serialize changes within one club so concurrent managers cannot exceed the cap.
  perform pg_advisory_xact_lock(hashtext('joy-wall-pins:' || p_club_id::text), 0);
  select * into target_post from public.joy_posts as post
  where post.id = p_post_id and post.club_id = p_club_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'joy_post_not_available';
  end if;

  if p_is_pinned then
    if target_post.post_type = 'iou' or target_post.visibility_scope <> 'club'
      or target_post.post_status <> 'published' then
      raise exception using errcode = '22023', message = 'joy_post_not_pin_eligible';
    end if;
    if target_post.pinned_at is null then
      if (select count(*) from public.joy_posts as pinned
          where pinned.club_id = p_club_id and pinned.pinned_at is not null
            and pinned.post_type <> 'iou' and pinned.visibility_scope = 'club'
            and pinned.post_status = 'published') >= 5 then
        raise exception using errcode = 'P0001', message = 'joy_pin_limit_reached';
      end if;
      next_pinned_at := clock_timestamp();
      update public.joy_posts as post set pinned_at = next_pinned_at
      where post.id = p_post_id and post.club_id = p_club_id;
      insert into public.joy_wall_audit_events (
        club_id, actor_app_account_id, object_kind, object_id, event_type
      ) values (p_club_id, actor_id, 'post', p_post_id, 'post_pinned');
    else
      next_pinned_at := target_post.pinned_at;
    end if;
  else
    next_pinned_at := null;
    if target_post.pinned_at is not null then
      update public.joy_posts as post set pinned_at = null
      where post.id = p_post_id and post.club_id = p_club_id;
      insert into public.joy_wall_audit_events (
        club_id, actor_app_account_id, object_kind, object_id, event_type
      ) values (p_club_id, actor_id, 'post', p_post_id, 'post_unpinned');
    end if;
  end if;

  return jsonb_build_object('is_pinned', p_is_pinned, 'pinned_at', next_pinned_at);
end;
$$;

create function public.list_pinned_joy_posts(p_club_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, auth as $$
declare
  actor_id uuid := public.current_app_account_id();
  pinned_ids uuid[];
  base_projection jsonb;
  pinned_posts jsonb;
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

  select coalesce(array_agg(pinned.id order by pinned.pinned_at desc, pinned.id desc), '{}'::uuid[])
  into pinned_ids
  from (
    select post.id, post.pinned_at from public.joy_posts as post
    where post.club_id = p_club_id and post.pinned_at is not null
      and post.visibility_scope = 'club' and post.post_type <> 'iou'
      and post.post_status = 'published'
    order by post.pinned_at desc, post.id desc limit 5
  ) as pinned;

  base_projection := public.list_joy_posts_with_interaction_deadlines(
    p_club_id, null, null, 5, false, pinned_ids
  );
  select coalesce(jsonb_agg(item.post order by array_position(pinned_ids, (item.post->>'id')::uuid)), '[]'::jsonb)
  into pinned_posts
  from jsonb_array_elements(coalesce(base_projection->'posts', '[]'::jsonb)) as item(post);
  return jsonb_set(base_projection, '{posts}', pinned_posts, true);
end;
$$;

revoke all on function public.list_joy_posts(uuid, timestamptz, uuid, integer, boolean, uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.list_joy_posts_with_recipient_actions(uuid, timestamptz, uuid, integer, boolean, uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.list_joy_posts_with_targets(uuid, timestamptz, uuid, integer, boolean, uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.list_joy_posts_with_interaction_deadlines(uuid, timestamptz, uuid, integer, boolean, uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.set_joy_post_pinned(uuid, uuid, boolean) from public, anon;
revoke all on function public.list_pinned_joy_posts(uuid) from public, anon;
grant execute on function public.set_joy_post_pinned(uuid, uuid, boolean) to authenticated;
grant execute on function public.list_pinned_joy_posts(uuid) to authenticated;

commit;
