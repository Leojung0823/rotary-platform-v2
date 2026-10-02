begin;

create table public.joy_post_favorites (
  club_id uuid not null references public.clubs(id) on delete restrict,
  post_id uuid not null,
  app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  membership_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (club_id, post_id, app_account_id),
  constraint joy_post_favorites_post_club_fkey
    foreign key (post_id, club_id) references public.joy_posts(id, club_id) on delete restrict,
  constraint joy_post_favorites_membership_club_fkey
    foreign key (membership_id, club_id) references public.club_memberships(id, club_id) on delete restrict
);

create index joy_post_favorites_member_feed_idx
  on public.joy_post_favorites (club_id, app_account_id, created_at desc, post_id desc);

alter table public.joy_post_favorites enable row level security;
revoke all on table public.joy_post_favorites from public, anon, authenticated, service_role;

-- Keep the original four-argument RPC stable for existing callers. The five-argument
-- implementation powers both the normal feed and the caller's private favorites view.
create or replace function public.list_joy_posts(
  p_club_id uuid,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid,
  p_limit integer,
  p_favorites_only boolean
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
  if p_favorites_only is null then
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
  ) then
    raise exception using errcode = '22023', message = 'invalid_joy_cursor';
  end if;

  with page as materialized (
    select post.id, post.club_id, post.post_type, post.title, post.content,
      post.visibility_scope, post.post_status, post.created_at, post.updated_at,
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
      'my_reaction', visible.my_reaction, 'is_favorited', visible.is_favorited
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
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public, auth as $$
  select public.list_joy_posts(p_club_id, p_cursor_created_at, p_cursor_id, p_limit, false)
$$;

-- The task-focus projection already enforces the caller's read boundary; add
-- only the caller's private favorite bit without exposing favorite rows.
create or replace function public.get_my_joy_question_post_with_favorite(
  p_club_id uuid,
  p_post_id uuid
)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, auth as $$
declare
  actor_id uuid := public.current_app_account_id();
  base_projection jsonb;
begin
  if actor_id is null or public.current_active_joy_membership(p_club_id) is null then
    raise exception using errcode = '42501', message = 'active_joy_membership_required';
  end if;
  base_projection := public.get_my_joy_question_post(p_club_id, p_post_id);
  if base_projection is null then
    return null;
  end if;
  return base_projection || jsonb_build_object(
    'is_favorited', exists (
      select 1 from public.joy_post_favorites as favorite
      where favorite.club_id = p_club_id and favorite.post_id = p_post_id
        and favorite.app_account_id = actor_id
    )
  );
end;
$$;

create or replace function public.set_joy_post_favorite(
  p_club_id uuid,
  p_post_id uuid,
  p_is_favorite boolean
)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
begin
  if not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'joy_wall_v1' and flag.enabled
      and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
  ) then
    raise exception using errcode = '42501', message = 'joy_wall_disabled';
  end if;
  if actor_id is null or actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_joy_membership_required';
  end if;
  if p_is_favorite is null then
    raise exception using errcode = '22023', message = 'invalid_joy_favorite';
  end if;
  if not public.current_can_read_joy_post(p_post_id, p_club_id, actor_id, actor_membership_id) then
    raise exception using errcode = '42501', message = 'joy_post_not_readable';
  end if;

  if p_is_favorite then
    insert into public.joy_post_favorites (club_id, post_id, app_account_id, membership_id)
    values (p_club_id, p_post_id, actor_id, actor_membership_id)
    on conflict (club_id, post_id, app_account_id) do nothing;
  else
    delete from public.joy_post_favorites as favorite
    where favorite.club_id = p_club_id and favorite.post_id = p_post_id
      and favorite.app_account_id = actor_id;
  end if;
  return p_is_favorite;
end;
$$;

revoke all on function public.list_joy_posts(uuid, timestamptz, uuid, integer, boolean) from public, anon;
revoke all on function public.get_my_joy_question_post_with_favorite(uuid, uuid) from public, anon;
revoke all on function public.set_joy_post_favorite(uuid, uuid, boolean) from public, anon;
grant execute on function public.list_joy_posts(uuid, timestamptz, uuid, integer, boolean) to authenticated;
grant execute on function public.get_my_joy_question_post_with_favorite(uuid, uuid) to authenticated;
grant execute on function public.set_joy_post_favorite(uuid, uuid, boolean) to authenticated;

commit;
