begin;

create table public.joy_targets (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  post_id uuid not null,
  target_type text not null check (target_type in ('event', 'rotary_year', 'role', 'birthday_campaign')),
  event_id uuid,
  rotary_year_id uuid,
  role_key text references public.role_definitions(role_key) on delete restrict,
  birthday_campaign_id uuid,
  created_at timestamptz not null default now(),
  constraint joy_targets_post_club_fkey
    foreign key (post_id, club_id)
    references public.joy_posts (id, club_id) on delete restrict,
  constraint joy_targets_event_club_fkey
    foreign key (event_id, club_id)
    references public.club_events (id, club_id) on delete restrict,
  constraint joy_targets_rotary_year_club_fkey
    foreign key (rotary_year_id, club_id)
    references public.rotary_years (id, club_id) on delete restrict,
  constraint joy_targets_birthday_campaign_club_fkey
    foreign key (birthday_campaign_id, club_id)
    references public.birthday_wish_campaigns (id, club_id) on delete restrict,
  constraint joy_targets_exact_target_check check (
    (target_type = 'event' and event_id is not null and rotary_year_id is null and role_key is null and birthday_campaign_id is null)
    or (target_type = 'rotary_year' and event_id is null and rotary_year_id is not null and role_key is null and birthday_campaign_id is null)
    or (target_type = 'role' and event_id is null and rotary_year_id is null and role_key is not null and birthday_campaign_id is null)
    or (target_type = 'birthday_campaign' and event_id is null and rotary_year_id is null and role_key is null and birthday_campaign_id is not null)
  )
);

create unique index joy_targets_post_event_unique
  on public.joy_targets (post_id, event_id)
  where target_type = 'event';
create unique index joy_targets_post_rotary_year_unique
  on public.joy_targets (post_id, rotary_year_id)
  where target_type = 'rotary_year';
create unique index joy_targets_post_role_unique
  on public.joy_targets (post_id, role_key)
  where target_type = 'role';
create unique index joy_targets_post_birthday_campaign_unique
  on public.joy_targets (post_id, birthday_campaign_id)
  where target_type = 'birthday_campaign';
create index joy_targets_club_event_idx
  on public.joy_targets (club_id, event_id, post_id)
  where target_type = 'event';
create index joy_targets_club_rotary_year_idx
  on public.joy_targets (club_id, rotary_year_id, post_id)
  where target_type = 'rotary_year';
create index joy_targets_club_role_idx
  on public.joy_targets (club_id, role_key, post_id)
  where target_type = 'role';
create index joy_targets_club_birthday_campaign_idx
  on public.joy_targets (club_id, birthday_campaign_id, post_id)
  where target_type = 'birthday_campaign';

alter table public.joy_targets enable row level security;
revoke all on table public.joy_targets from public, anon, authenticated, service_role;

-- Return only opt-in, published birthday campaigns already visible through the
-- established birthday RPC. The caller receives a reduced projection: no
-- birthday date, content, participant, author, or submission identifiers.
create or replace function public.joy_visible_birthday_campaigns(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  published_wishes jsonb;
begin
  if actor_id is null
     or public.current_active_joy_membership(p_club_id) is null
     or not public.current_can_access_birthday_club(p_club_id)
     or not has_function_privilege(
       'authenticated', 'public.list_published_birthday_wish_submissions(uuid)', 'EXECUTE'
     ) then
    return '[]'::jsonb;
  end if;

  published_wishes := public.list_published_birthday_wish_submissions(p_club_id);
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', campaigns.id,
      'recipient_name', visible.recipient_name,
      'birthday_year', campaigns.birthday_year
    ) order by campaigns.birthday_year desc, visible.recipient_name, campaigns.id), '[]'::jsonb)
    from (
      select distinct on (wish.value->>'campaign_id')
        wish.value->>'campaign_id' as campaign_id,
        btrim(wish.value->>'recipient_name') as recipient_name
      from jsonb_array_elements(coalesce(published_wishes, '[]'::jsonb)) as wish(value)
      where wish.value->>'campaign_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and nullif(btrim(wish.value->>'recipient_name'), '') is not null
      order by wish.value->>'campaign_id', btrim(wish.value->>'recipient_name')
    ) as visible
    join public.birthday_wish_campaigns as campaigns
      on campaigns.id::text = visible.campaign_id and campaigns.club_id = p_club_id
  );
end;
$$;

create or replace function public.list_joy_target_options(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  event_projection jsonb;
  event_options jsonb;
  year_options jsonb;
  role_options jsonb;
  birthday_campaign_options jsonb;
begin
  if actor_id is null
     or public.current_active_joy_membership(p_club_id) is null then
    raise exception using errcode = '42501', message = 'active_joy_membership_required';
  end if;
  if not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'joy_wall_v1' and flag.enabled
      and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
  ) then
    raise exception using errcode = '42501', message = 'joy_wall_disabled';
  end if;

  -- Ask the established event projection to apply the caller's real member
  -- audience rules. Never expose a manager-only event through this picker.
  event_projection := public.list_club_events(p_club_id, true);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', event_row.value->>'id',
    'title', event_row.value->>'title',
    'starts_at', event_row.value->>'starts_at'
  ) order by event_row.value->>'starts_at' desc, event_row.value->>'id'), '[]'::jsonb)
  into event_options
  from jsonb_array_elements(coalesce(event_projection->'events', '[]'::jsonb)) as event_row(value)
  where event_row.value->>'status' = 'published';

  if public.current_can_access_archive(p_club_id) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', year_record.id,
      'start_year', year_record.start_year,
      'theme', year_record.theme
    ) order by year_record.start_year desc, year_record.id), '[]'::jsonb)
    into year_options
    from public.rotary_years as year_record
    where year_record.club_id = p_club_id;
  else
    year_options := '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'role_key', role.role_key,
    'label', role.role_name_zh_hant
  ) order by role.role_key), '[]'::jsonb)
  into role_options
  from public.role_definitions as role
  where role.role_scope = 'club'
    and role.role_key <> 'member'
    and exists (
      select 1
      from public.club_role_assignments as assignment
      join public.app_accounts as account on account.id = assignment.app_account_id
      join public.club_memberships as membership
        on membership.person_id = account.person_id
       and membership.club_id = assignment.club_id
       and membership.membership_status = 'active'
      where assignment.club_id = p_club_id
        and assignment.role_key = role.role_key
        and assignment.assignment_status = 'active'
        and account.account_status = 'active'
    );

  birthday_campaign_options := public.joy_visible_birthday_campaigns(p_club_id);
  return jsonb_build_object(
    'events', event_options,
    'rotary_years', year_options,
    'roles', role_options,
    'birthday_campaigns', birthday_campaign_options
  );
end;
$$;

drop function if exists public.joy_post_targets_projection(uuid, uuid);
create function public.joy_post_targets_projection(
  p_club_id uuid,
  p_post_id uuid,
  p_visible_birthday_campaigns jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  with actor as (
    select public.current_app_account_id() as account_id,
      public.current_active_joy_membership(p_club_id) as membership_id
  ), targets as (
    select 1 as target_order, event.starts_at as sort_at, event.id::text as target_id,
      jsonb_build_object(
        'target_type', 'event', 'target_id', event.id, 'label', event.title,
        'detail', to_char(event.starts_at at time zone 'Asia/Taipei', 'YYYY-MM-DD HH24:MI')
      ) as projection
    from public.joy_targets as target
    join public.club_events as event
      on event.id = target.event_id and event.club_id = target.club_id
    cross join actor
    where target.club_id = p_club_id and target.post_id = p_post_id
      and target.target_type = 'event'
      and event.event_status = 'published'
      and event.starts_at >= now() - interval '30 days'
      and public.event_includes_current_member(event.id)

    union all

    select 2 as target_order, make_timestamptz(year_record.start_year, 7, 1, 0, 0, 0, 'Asia/Taipei') as sort_at,
      year_record.id::text as target_id,
      jsonb_build_object(
        'target_type', 'rotary_year', 'target_id', year_record.id,
        'label', year_record.start_year::text || '-' || right((year_record.start_year + 1)::text, 2) || ' 扶輪年度',
        'detail', year_record.theme
      ) as projection
    from public.joy_targets as target
    join public.rotary_years as year_record
      on year_record.id = target.rotary_year_id and year_record.club_id = target.club_id
    cross join actor
    where target.club_id = p_club_id and target.post_id = p_post_id
      and target.target_type = 'rotary_year'
      and public.current_can_access_archive(p_club_id)

    union all

    select 3 as target_order, null::timestamptz as sort_at, target.role_key as target_id,
      jsonb_build_object(
        'target_type', 'role', 'target_id', target.role_key, 'label', role.role_name_zh_hant,
        'detail', null
      ) as projection
    from public.joy_targets as target
    join public.role_definitions as role on role.role_key = target.role_key and role.role_scope = 'club'
    cross join actor
    where target.club_id = p_club_id and target.post_id = p_post_id
      and target.target_type = 'role'

    union all

    select 4 as target_order,
      make_timestamptz((campaign_option.value->>'birthday_year')::integer, 7, 1, 0, 0, 0, 'Asia/Taipei') as sort_at,
      target.birthday_campaign_id::text as target_id,
      jsonb_build_object(
        'target_type', 'birthday_campaign',
        'target_id', target.birthday_campaign_id,
        'label', (campaign_option.value->>'recipient_name') || '的生日祝福',
        'detail', (campaign_option.value->>'birthday_year') || ' 年'
      ) as projection
    from public.joy_targets as target
    cross join actor
    cross join lateral jsonb_array_elements(coalesce(p_visible_birthday_campaigns, '[]'::jsonb)) as campaign_option(value)
    where target.club_id = p_club_id and target.post_id = p_post_id
      and target.target_type = 'birthday_campaign'
      and campaign_option.value->>'id' = target.birthday_campaign_id::text
  )
  select coalesce(jsonb_agg(targets.projection order by targets.target_order, targets.sort_at desc, targets.target_id), '[]'::jsonb)
  from targets
  cross join actor
  where actor.account_id is not null and actor.membership_id is not null
    and public.current_can_read_joy_post(p_post_id, p_club_id, actor.account_id, actor.membership_id)
$$;

create or replace function public.create_joy_post_with_targets(
  p_club_id uuid,
  p_post_type text,
  p_title text,
  p_content text,
  p_visibility_scope text,
  p_audience_membership_ids uuid[] default '{}'::uuid[],
  p_event_ids uuid[] default '{}'::uuid[],
  p_rotary_year_ids uuid[] default '{}'::uuid[],
  p_role_keys text[] default '{}'::text[],
  p_birthday_campaign_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  event_ids uuid[] := coalesce(p_event_ids, '{}'::uuid[]);
  rotary_year_ids uuid[] := coalesce(p_rotary_year_ids, '{}'::uuid[]);
  role_keys text[] := coalesce(p_role_keys, '{}'::text[]);
  birthday_campaign_ids uuid[] := coalesce(p_birthday_campaign_ids, '{}'::uuid[]);
  visible_birthday_campaigns jsonb := '[]'::jsonb;
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
  if cardinality(event_ids) > 5 or cardinality(rotary_year_ids) > 5
    or cardinality(role_keys) > 5 or cardinality(birthday_campaign_ids) > 5
    or cardinality(event_ids) <> cardinality(array(select distinct id from unnest(event_ids) as requested(id)))
    or cardinality(rotary_year_ids) <> cardinality(array(select distinct id from unnest(rotary_year_ids) as requested(id)))
    or cardinality(role_keys) <> cardinality(array(select distinct role_key from unnest(role_keys) as requested(role_key)))
    or cardinality(birthday_campaign_ids) <> cardinality(array(select distinct id from unnest(birthday_campaign_ids) as requested(id))) then
    raise exception using errcode = '22023', message = 'invalid_joy_targets';
  end if;
  if cardinality(event_ids) > 0 and (
    not public.current_can_access_club_events(p_club_id)
    or exists (
      select 1 from unnest(event_ids) as requested(id)
      where not exists (
        select 1 from public.club_events as event
        where event.id = requested.id and event.club_id = p_club_id
          and event.event_status = 'published'
          and event.starts_at >= now() - interval '30 days'
          and public.event_includes_current_member(event.id)
      )
    )
  ) then
    raise exception using errcode = '22023', message = 'invalid_joy_event_target';
  end if;
  if cardinality(rotary_year_ids) > 0 and (
    not public.current_can_access_archive(p_club_id)
    or exists (
      select 1 from unnest(rotary_year_ids) as requested(id)
      where not exists (
        select 1 from public.rotary_years as year_record
        where year_record.id = requested.id and year_record.club_id = p_club_id
      )
    )
  ) then
    raise exception using errcode = '22023', message = 'invalid_joy_rotary_year_target';
  end if;
  if cardinality(role_keys) > 0 and exists (
    select 1
    from unnest(role_keys) as requested(role_key)
    where not exists (
      select 1
      from public.role_definitions as role
      join public.club_role_assignments as assignment
        on assignment.role_key = role.role_key and assignment.club_id = p_club_id
      join public.app_accounts as account on account.id = assignment.app_account_id
      join public.club_memberships as membership
        on membership.person_id = account.person_id
       and membership.club_id = assignment.club_id
       and membership.membership_status = 'active'
      where role.role_scope = 'club' and role.role_key <> 'member'
        and role.role_key = requested.role_key and assignment.assignment_status = 'active'
        and account.account_status = 'active'
    )
  ) then
    raise exception using errcode = '22023', message = 'invalid_joy_role_target';
  end if;
  if cardinality(birthday_campaign_ids) > 0 then
    visible_birthday_campaigns := public.joy_visible_birthday_campaigns(p_club_id);
    if exists (
      select 1 from unnest(birthday_campaign_ids) as requested(id)
      where not (visible_birthday_campaigns @> jsonb_build_array(jsonb_build_object('id', requested.id)))
    ) then
      raise exception using errcode = '22023', message = 'invalid_joy_birthday_target';
    end if;
  end if;

  created_post := public.create_joy_post(
    p_club_id, p_post_type, p_title, p_content, p_visibility_scope, p_audience_membership_ids
  );
  created_post_id := (created_post->>'id')::uuid;

  insert into public.joy_targets (club_id, post_id, target_type, event_id)
  select p_club_id, created_post_id, 'event', requested.id
  from unnest(event_ids) as requested(id);

  insert into public.joy_targets (club_id, post_id, target_type, rotary_year_id)
  select p_club_id, created_post_id, 'rotary_year', requested.id
  from unnest(rotary_year_ids) as requested(id);

  insert into public.joy_targets (club_id, post_id, target_type, role_key)
  select p_club_id, created_post_id, 'role', requested.role_key
  from unnest(role_keys) as requested(role_key);

  insert into public.joy_targets (club_id, post_id, target_type, birthday_campaign_id)
  select p_club_id, created_post_id, 'birthday_campaign', requested.id
  from unnest(birthday_campaign_ids) as requested(id);

  return created_post || jsonb_build_object(
    'targets', public.joy_post_targets_projection(p_club_id, created_post_id, visible_birthday_campaigns)
  );
end;
$$;

create or replace function public.list_joy_posts_with_targets(
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
  visible_birthday_campaigns jsonb;
begin
  base_projection := public.list_joy_posts_with_recipient_actions(
    p_club_id, p_cursor_created_at, p_cursor_id, p_limit, p_favorites_only
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

revoke all on function public.list_joy_target_options(uuid) from public, anon;
revoke all on function public.joy_visible_birthday_campaigns(uuid) from public, anon, authenticated;
revoke all on function public.joy_post_targets_projection(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.create_joy_post_with_targets(uuid, text, text, text, text, uuid[], uuid[], uuid[], text[], uuid[]) from public, anon;
revoke all on function public.list_joy_posts_with_targets(uuid, timestamptz, uuid, integer, boolean) from public, anon;
grant execute on function public.list_joy_target_options(uuid) to authenticated;
grant execute on function public.create_joy_post_with_targets(uuid, text, text, text, text, uuid[], uuid[], uuid[], text[], uuid[]) to authenticated;
grant execute on function public.list_joy_posts_with_targets(uuid, timestamptz, uuid, integer, boolean) to authenticated;

commit;
