begin;

-- Member tags, and the audiences built from them.
--
-- The purpose is targeting: some events and some posts are meant for a subset
-- of the club (the board, a committee, new members), and until now the only
-- unit of address was "everyone in the club".
--
-- Attendance is deliberately untouched. A targeted event is by definition not
-- a 例會 -- a committee meeting or an invitation-only gathering is not part of
-- the club's attendance record -- so rather than teaching the attendance
-- domain about audiences, an event that has one simply may not count towards
-- attendance. That invariant is enforced from both directions below, so the
-- two settings can never contradict each other.
--
-- An event or post with no audience rows is addressed to the whole club. That
-- makes every existing row keep its current meaning without a backfill.

create table public.club_member_tags (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  tag_name text not null,
  description text,
  tag_status text not null default 'active',
  created_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_member_tags_name_check check (
    btrim(tag_name) <> '' and char_length(tag_name) <= 40
  ),
  constraint club_member_tags_description_check check (
    description is null or char_length(description) <= 200
  ),
  constraint club_member_tags_status_check check (tag_status in ('active', 'archived')),
  constraint club_member_tags_id_club_unique unique (id, club_id)
);

-- Case-insensitive uniqueness within a club, so "理事會" and "理事会" stay
-- distinct but "Board" and "board" do not become two tags.
create unique index club_member_tags_club_name_unique
  on public.club_member_tags (club_id, lower(btrim(tag_name)))
  where tag_status = 'active';

create table public.club_membership_tags (
  membership_id uuid not null,
  tag_id uuid not null,
  club_id uuid not null references public.clubs(id) on delete restrict,
  assigned_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  primary key (membership_id, tag_id),
  constraint club_membership_tags_membership_club_fkey
    foreign key (membership_id, club_id)
    references public.club_memberships (id, club_id) on delete restrict,
  constraint club_membership_tags_tag_club_fkey
    foreign key (tag_id, club_id)
    references public.club_member_tags (id, club_id) on delete restrict
);

create index club_membership_tags_tag_idx on public.club_membership_tags (tag_id);

create table public.club_event_audiences (
  event_id uuid not null,
  tag_id uuid not null,
  club_id uuid not null references public.clubs(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (event_id, tag_id),
  constraint club_event_audiences_event_club_fkey
    foreign key (event_id, club_id)
    references public.club_events (id, club_id) on delete restrict,
  constraint club_event_audiences_tag_club_fkey
    foreign key (tag_id, club_id)
    references public.club_member_tags (id, club_id) on delete restrict
);

create table public.board_post_audiences (
  post_id uuid not null references public.board_posts(id) on delete restrict,
  tag_id uuid not null,
  club_id uuid not null references public.clubs(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (post_id, tag_id),
  constraint board_post_audiences_tag_club_fkey
    foreign key (tag_id, club_id)
    references public.club_member_tags (id, club_id) on delete restrict
);

alter table public.club_member_tags enable row level security;
alter table public.club_membership_tags enable row level security;
alter table public.club_event_audiences enable row level security;
alter table public.board_post_audiences enable row level security;
revoke all on table public.club_member_tags from public, anon, authenticated;
revoke all on table public.club_membership_tags from public, anon, authenticated;
revoke all on table public.club_event_audiences from public, anon, authenticated;
revoke all on table public.board_post_audiences from public, anon, authenticated;


-- Audience membership. Both treat "no audience rows" as "addressed to
-- everyone", so every event and post that existed before this change keeps
-- its meaning without a backfill.
--
-- Deliberately revoked from authenticated below: they are helpers for the
-- definer functions that already authorize the caller, in the same way as
-- current_has_club_permission.
create or replace function public.event_includes_current_member(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select not exists (
    select 1 from public.club_event_audiences as audience
    where audience.event_id = p_event_id
  ) or exists (
    select 1
    from public.club_event_audiences as audience
    join public.club_membership_tags as tagged on tagged.tag_id = audience.tag_id
    join public.club_memberships as membership on membership.id = tagged.membership_id
    join public.app_accounts as account on account.person_id = membership.person_id
    where audience.event_id = p_event_id
      and account.auth_user_id = auth.uid()
      and account.account_status = 'active'
  )
$$;

create or replace function public.board_post_includes_current_member(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select not exists (
    select 1 from public.board_post_audiences as audience
    where audience.post_id = p_post_id
  ) or exists (
    select 1
    from public.board_post_audiences as audience
    join public.club_membership_tags as tagged on tagged.tag_id = audience.tag_id
    join public.club_memberships as membership on membership.id = tagged.membership_id
    join public.app_accounts as account on account.person_id = membership.person_id
    where audience.post_id = p_post_id
      and account.auth_user_id = auth.uid()
      and account.account_status = 'active'
  )
$$;

revoke all on function public.event_includes_current_member(uuid) from public, anon, authenticated;
revoke all on function public.board_post_includes_current_member(uuid) from public, anon, authenticated;


-- The invariant, enforced from both sides so neither setting can be changed
-- into contradicting the other.
create or replace function public.reject_counted_targeted_event()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.counts_for_attendance and exists (
    select 1 from public.club_event_audiences where event_id = new.id
  ) then
    raise exception using errcode = '22023', message = 'targeted_event_cannot_count_for_attendance';
  end if;
  return new;
end;
$$;

create trigger club_events_reject_counted_targeted
before update of counts_for_attendance on public.club_events
for each row execute function public.reject_counted_targeted_event();

create or replace function public.reject_audience_on_counted_event()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.club_events
    where id = new.event_id and counts_for_attendance
  ) then
    raise exception using errcode = '22023', message = 'targeted_event_cannot_count_for_attendance';
  end if;
  return new;
end;
$$;

create trigger club_event_audiences_reject_counted
before insert on public.club_event_audiences
for each row execute function public.reject_audience_on_counted_event();

create or replace function public.list_club_events(p_club_id uuid, p_as_member boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  -- p_as_member makes a manager ask the question a plain member would ask.
  -- Everything downstream -- which statuses and how far back are visible, and
  -- the can_manage flag on each row -- already derives from this one value,
  -- so the member view stays defined in exactly one place.
  can_manage boolean := (not p_as_member)
    and public.current_has_club_permission(p_club_id, 'event.manage');
  result jsonb;
begin
  if actor_id is null or not public.current_can_access_club_events(p_club_id) then
    raise exception using errcode = '42501', message = 'event_read_required';
  end if;

  select jsonb_build_object(
    'events', coalesce(jsonb_agg(jsonb_build_object(
      'id', event.id,
      'event_type', event.event_type,
      'title', event.title,
      'description', event.description,
      'location', event.location,
      'starts_at', event.starts_at,
      'ends_at', event.ends_at,
      'registration_deadline', event.registration_deadline,
      'capacity', event.capacity,
      'counts_for_attendance', event.counts_for_attendance,
      'status', event.event_status,
      'version', event.version,
      'attending_members', event.attending_members,
      'attending_spots', event.attending_spots,
      'remaining_spots', case when event.capacity is null then null else greatest(event.capacity - event.attending_spots, 0) end,
      'my_response', event.my_response,
      'my_guest_count', event.my_guest_count,
      'my_note', event.my_note,
      'can_manage', can_manage,
      'cover_image_path', event.cover_image_path,
      'venue_location_set', event.venue_latitude is not null,
      'registration_open', event.event_status = 'published'
        and now() <= event.registration_deadline
        and now() < event.starts_at
    ) order by event.starts_at, event.id), '[]'::jsonb)
  ) into result
  from (
    select e.*,
      count(r.id) filter (where r.response = 'attending')::integer as attending_members,
      coalesce(sum(1 + r.guest_count) filter (where r.response = 'attending'), 0)::integer as attending_spots,
      mine.response as my_response,
      coalesce(mine.guest_count, 0) as my_guest_count,
      coalesce(mine.note, '') as my_note
    from public.club_events as e
    left join public.event_registrations as r on r.event_id = e.id
    left join public.event_registrations as mine on mine.event_id = e.id and mine.app_account_id = actor_id
    where e.club_id = p_club_id
      -- An event addressed to particular tags is not shown to anyone outside
      -- them. Managers still see everything, so they can find what they sent.
      and (can_manage or public.event_includes_current_member(e.id))
      and (e.event_status in ('published', 'cancelled') or can_manage)
      and (e.starts_at >= now() - interval '30 days' or can_manage)
    group by e.id, mine.response, mine.guest_count, mine.note
    order by e.starts_at, e.id
    limit 200
  ) as event;

  return coalesce(result, jsonb_build_object('events', '[]'::jsonb));
end;
$$;

create or replace function public.list_board_posts(
  p_club_id uuid,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  result jsonb;
begin
  if actor_id is null or not public.current_has_active_board_membership(p_club_id) then
    raise exception using errcode = '42501', message = 'active_club_membership_required';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using errcode = '22023', message = 'invalid_board_limit';
  end if;

  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise exception using errcode = '22023', message = 'invalid_board_cursor';
  end if;

  if p_cursor_id is not null and not exists (
    select 1
    from public.board_posts as cursor_post
    where cursor_post.id = p_cursor_id
      and cursor_post.club_id = p_club_id
      and cursor_post.created_at = p_cursor_created_at
      and cursor_post.status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'invalid_board_cursor';
  end if;

  with page as materialized (
    select post.id, post.content, post.created_at, post.updated_at,
      account.account_display_name as author_display_name,
      person.avatar_url as author_avatar_url,
      post.author_app_account_id = actor_id as can_edit,
      post.author_app_account_id = actor_id as can_delete
    from public.board_posts as post
    join public.app_accounts as account on account.id = post.author_app_account_id
    join public.people as person on person.id = account.person_id
    where post.club_id = p_club_id
      and post.status = 'active'
      -- A post addressed to particular tags reaches only those members. The
      -- author always keeps sight of what they sent.
      and (post.author_app_account_id = actor_id
        or public.board_post_includes_current_member(post.id))
      and (
        p_cursor_created_at is null
        or post.created_at < p_cursor_created_at
        or (post.created_at = p_cursor_created_at and post.id < p_cursor_id)
      )
    order by post.created_at desc, post.id desc
    limit p_limit + 1
  ), visible as materialized (
    select * from page
    order by created_at desc, id desc
    limit p_limit
  )
  select jsonb_build_object(
    'posts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', visible.id,
          'content', visible.content,
          'created_at', visible.created_at,
          'updated_at', visible.updated_at,
          'author_display_name', visible.author_display_name,
          'author_avatar_url', visible.author_avatar_url,
          'can_edit', visible.can_edit,
          'can_delete', visible.can_delete
        ) order by visible.created_at desc, visible.id desc
      )
      from visible
    ), '[]'::jsonb),
    'next_cursor', case
      when (select count(*) from page) > p_limit then (
        select jsonb_build_object('v', 1, 'created_at', visible.created_at, 'id', visible.id)
        from visible
        order by visible.created_at asc, visible.id asc
        limit 1
      )
      else null
    end
  ) into result;

  return result;
end;
$$;


-- Management RPCs. All guarded on member.manage, the same authority that
-- already governs who may edit a club's roster.

create or replace function public.list_club_member_tags(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  result jsonb;
begin
  if public.current_app_account_id() is null
     or not public.current_has_club_permission(p_club_id, 'member.manage') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;

  select jsonb_build_object('tags', coalesce(jsonb_agg(jsonb_build_object(
    'tag_id', tag.id,
    'tag_name', tag.tag_name,
    'description', tag.description,
    'member_count', (
      select count(*) from public.club_membership_tags as tagged
      where tagged.tag_id = tag.id
    )
  ) order by tag.tag_name), '[]'::jsonb))
  into result
  from public.club_member_tags as tag
  where tag.club_id = p_club_id and tag.tag_status = 'active';

  return coalesce(result, jsonb_build_object('tags', '[]'::jsonb));
end;
$$;

create or replace function public.create_club_member_tag(
  p_club_id uuid,
  p_tag_name text,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  normalized_name text := btrim(coalesce(p_tag_name, ''));
  normalized_description text := nullif(btrim(coalesce(p_description, '')), '');
  created public.club_member_tags;
begin
  if actor_id is null
     or not public.current_has_club_permission(p_club_id, 'member.manage')
     or not exists (select 1 from public.clubs where id = p_club_id and club_status = 'active') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;
  if normalized_name = '' or char_length(normalized_name) > 40
     or (normalized_description is not null and char_length(normalized_description) > 200) then
    raise exception using errcode = '22023', message = 'invalid_member_tag';
  end if;

  insert into public.club_member_tags (
    club_id, tag_name, description, created_by_app_account_id
  ) values (
    p_club_id, normalized_name, normalized_description, actor_id
  )
  returning * into created;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'member_tag.created', 'club_member_tag', created.id,
    jsonb_build_object('tag_name', created.tag_name)
  );

  return jsonb_build_object('tag_id', created.id, 'tag_name', created.tag_name);
exception when unique_violation then
  raise exception using errcode = '23505', message = 'member_tag_already_exists';
end;
$$;

create or replace function public.archive_club_member_tag(p_club_id uuid, p_tag_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
begin
  if actor_id is null
     or not public.current_has_club_permission(p_club_id, 'member.manage') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;

  -- Archiving leaves history intact: past events and posts keep the audience
  -- they were sent to, and the tag simply stops being offered.
  update public.club_member_tags
  set tag_status = 'archived', updated_at = now()
  where id = p_tag_id and club_id = p_club_id and tag_status = 'active';
  if not found then
    raise exception using errcode = 'P0002', message = 'member_tag_not_available';
  end if;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'member_tag.archived', 'club_member_tag', p_tag_id, '{}'::jsonb
  );
end;
$$;

create or replace function public.set_membership_tags(
  p_club_id uuid,
  p_membership_id uuid,
  p_tag_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  wanted uuid[] := coalesce(p_tag_ids, '{}'::uuid[]);
begin
  if actor_id is null
     or not public.current_has_club_permission(p_club_id, 'member.manage') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;
  if not exists (
    select 1 from public.club_memberships
    where id = p_membership_id and club_id = p_club_id
  ) then
    raise exception using errcode = 'P0002', message = 'membership_not_available';
  end if;
  -- Every tag must belong to this club and still be active, so a tag id from
  -- another club can never be attached by passing it in directly.
  if exists (
    select 1 from unnest(wanted) as requested(tag_id)
    where not exists (
      select 1 from public.club_member_tags as tag
      where tag.id = requested.tag_id
        and tag.club_id = p_club_id
        and tag.tag_status = 'active'
    )
  ) then
    raise exception using errcode = '22023', message = 'invalid_member_tag';
  end if;

  delete from public.club_membership_tags
  where membership_id = p_membership_id
    and club_id = p_club_id
    and tag_id <> all (wanted);

  insert into public.club_membership_tags (
    membership_id, tag_id, club_id, assigned_by_app_account_id
  )
  select p_membership_id, requested.tag_id, p_club_id, actor_id
  from unnest(wanted) as requested(tag_id)
  on conflict (membership_id, tag_id) do nothing;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'member_tag.assigned', 'club_membership', p_membership_id,
    jsonb_build_object('tag_count', coalesce(array_length(wanted, 1), 0))
  );

  return jsonb_build_object('tag_count', coalesce(array_length(wanted, 1), 0));
end;
$$;

create or replace function public.set_club_event_audience(
  p_club_id uuid,
  p_event_id uuid,
  p_tag_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  wanted uuid[] := coalesce(p_tag_ids, '{}'::uuid[]);
begin
  if actor_id is null
     or not public.current_has_club_permission(p_club_id, 'event.manage') then
    raise exception using errcode = '42501', message = 'event_manage_required';
  end if;
  if not exists (
    select 1 from public.club_events
    where id = p_event_id and club_id = p_club_id and event_status <> 'cancelled'
  ) then
    raise exception using errcode = 'P0002', message = 'event_not_available';
  end if;
  if exists (
    select 1 from unnest(wanted) as requested(tag_id)
    where not exists (
      select 1 from public.club_member_tags as tag
      where tag.id = requested.tag_id
        and tag.club_id = p_club_id
        and tag.tag_status = 'active'
    )
  ) then
    raise exception using errcode = '22023', message = 'invalid_member_tag';
  end if;

  delete from public.club_event_audiences
  where event_id = p_event_id and tag_id <> all (wanted);

  insert into public.club_event_audiences (event_id, tag_id, club_id)
  select p_event_id, requested.tag_id, p_club_id
  from unnest(wanted) as requested(tag_id)
  on conflict (event_id, tag_id) do nothing;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'event.audience_set', 'club_event', p_event_id,
    jsonb_build_object('tag_count', coalesce(array_length(wanted, 1), 0))
  );

  return jsonb_build_object('tag_count', coalesce(array_length(wanted, 1), 0));
end;
$$;

revoke all on function public.list_club_member_tags(uuid) from public, anon;
grant execute on function public.list_club_member_tags(uuid) to authenticated;
revoke all on function public.create_club_member_tag(uuid, text, text) from public, anon;
grant execute on function public.create_club_member_tag(uuid, text, text) to authenticated;
revoke all on function public.archive_club_member_tag(uuid, uuid) from public, anon;
grant execute on function public.archive_club_member_tag(uuid, uuid) to authenticated;
revoke all on function public.set_membership_tags(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.set_membership_tags(uuid, uuid, uuid[]) to authenticated;
revoke all on function public.set_club_event_audience(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.set_club_event_audience(uuid, uuid, uuid[]) to authenticated;

commit;

