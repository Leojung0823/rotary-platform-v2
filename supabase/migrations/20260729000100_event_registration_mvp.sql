begin;

insert into public.permissions (permission_key, description_zh_hant) values
  ('event.read', '查看社內活動與自己的報名狀態'),
  ('event.manage', '建立、發布與取消社內活動')
on conflict (permission_key) do nothing;

insert into public.role_permissions (role_key, permission_key) values
  ('platform_admin', 'event.read'),
  ('platform_admin', 'event.manage'),
  ('president', 'event.read'),
  ('president', 'event.manage'),
  ('secretary', 'event.read'),
  ('secretary', 'event.manage'),
  ('finance', 'event.read'),
  ('member', 'event.read')
on conflict (role_key, permission_key) do nothing;

create table public.club_events (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  event_type text not null,
  title text not null,
  description text not null default '',
  location text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  registration_deadline timestamptz not null,
  capacity integer,
  counts_for_attendance boolean not null default true,
  event_status text not null default 'draft',
  created_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  updated_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  published_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_events_type_check check (event_type in (
    'regular_meeting', 'board_meeting', 'service', 'joint_meeting', 'fireside', 'other'
  )),
  constraint club_events_title_check check (btrim(title) <> '' and char_length(title) <= 160),
  constraint club_events_description_check check (char_length(description) <= 5000),
  constraint club_events_location_check check (char_length(location) <= 300),
  constraint club_events_time_check check (ends_at > starts_at),
  constraint club_events_deadline_check check (registration_deadline <= starts_at),
  constraint club_events_capacity_check check (capacity is null or capacity between 1 and 10000),
  constraint club_events_status_check check (event_status in ('draft', 'published', 'cancelled', 'completed')),
  constraint club_events_version_check check (version >= 1),
  constraint club_events_publish_consistency check (event_status <> 'published' or published_at is not null),
  constraint club_events_cancel_consistency check (
    event_status <> 'cancelled' or (cancelled_at is not null and btrim(coalesce(cancellation_reason, '')) <> '')
  )
);

create index club_events_club_status_start_idx
  on public.club_events (club_id, event_status, starts_at, id);
create index club_events_club_start_idx
  on public.club_events (club_id, starts_at, id);

create table public.event_registrations (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  event_id uuid not null references public.club_events(id) on delete restrict,
  app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  response text not null default 'pending',
  guest_count integer not null default 0,
  note text not null default '',
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_registrations_response_check check (response in ('pending', 'attending', 'declined')),
  constraint event_registrations_guest_check check (guest_count between 0 and 20),
  constraint event_registrations_note_check check (char_length(note) <= 500),
  constraint event_registrations_response_consistency check (
    (response = 'pending' and responded_at is null and guest_count = 0)
    or (response in ('attending', 'declined') and responded_at is not null)
  ),
  constraint event_registrations_declined_guest_check check (response <> 'declined' or guest_count = 0),
  unique (event_id, app_account_id)
);

create index event_registrations_club_event_response_idx
  on public.event_registrations (club_id, event_id, response, updated_at desc);
create index event_registrations_account_event_idx
  on public.event_registrations (app_account_id, event_id);

create or replace function public.current_can_access_club_events(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.app_accounts as account
    join public.club_memberships as membership
      on membership.person_id = account.person_id
    join public.clubs as club
      on club.id = membership.club_id
    where account.auth_user_id = auth.uid()
      and account.account_status = 'active'
      and membership.club_id = p_club_id
      and membership.membership_status = 'active'
      and club.club_status = 'active'
  ) or (
    exists (select 1 from public.clubs where id = p_club_id and club_status = 'active')
    and public.current_has_club_permission(p_club_id, 'event.manage')
  )
$$;

create or replace function public.current_has_active_event_membership(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.app_accounts as account
    join public.club_memberships as membership
      on membership.person_id = account.person_id
    join public.clubs as club
      on club.id = membership.club_id
    where account.auth_user_id = auth.uid()
      and account.account_status = 'active'
      and membership.club_id = p_club_id
      and membership.membership_status = 'active'
      and club.club_status = 'active'
  )
$$;

create or replace function public.list_my_event_clubs()
returns table (club_id uuid, club_code text, club_name text, can_manage boolean)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select club.id, club.club_code, club.club_name,
    public.current_has_club_permission(club.id, 'event.manage') as can_manage
  from public.clubs as club
  where club.club_status = 'active'
    and public.current_can_access_club_events(club.id)
  order by club.club_name, club.id
$$;

create or replace function public.protect_club_event_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.club_id is distinct from new.club_id
     or old.created_by_app_account_id is distinct from new.created_by_app_account_id
     or old.created_at is distinct from new.created_at then
    raise exception using errcode = '23514', message = 'club_event_immutable_field';
  end if;

  if old.event_status in ('cancelled', 'completed') and new.event_status is distinct from old.event_status then
    raise exception using errcode = '23514', message = 'club_event_terminal_status';
  end if;
  if old.event_status = 'published' and new.event_status = 'draft' then
    raise exception using errcode = '23514', message = 'club_event_cannot_return_to_draft';
  end if;

  new.title := btrim(new.title);
  new.description := btrim(new.description);
  new.location := btrim(new.location);
  new.updated_at := now();
  new.version := old.version + 1;

  if new.event_status = 'published' then
    new.published_at := coalesce(old.published_at, now());
  end if;
  if new.event_status = 'cancelled' then
    new.cancelled_at := coalesce(old.cancelled_at, now());
    new.cancellation_reason := btrim(coalesce(new.cancellation_reason, ''));
  end if;
  return new;
end;
$$;

create trigger club_events_protect_update
before update on public.club_events
for each row execute function public.protect_club_event_update();

create or replace function public.protect_event_registration_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.club_id is distinct from new.club_id
     or old.event_id is distinct from new.event_id
     or old.app_account_id is distinct from new.app_account_id
     or old.created_at is distinct from new.created_at then
    raise exception using errcode = '23514', message = 'event_registration_immutable_field';
  end if;
  new.note := btrim(new.note);
  new.updated_at := now();
  if new.response = 'pending' then
    new.responded_at := null;
    new.guest_count := 0;
  else
    new.responded_at := now();
    if new.response = 'declined' then new.guest_count := 0; end if;
  end if;
  return new;
end;
$$;

create trigger event_registrations_protect_update
before update on public.event_registrations
for each row execute function public.protect_event_registration_update();

create or replace function public.prevent_event_hard_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = '42501', message = 'event_hard_delete_forbidden';
end;
$$;

create trigger club_events_prevent_delete
before delete on public.club_events
for each row execute function public.prevent_event_hard_delete();
create trigger event_registrations_prevent_delete
before delete on public.event_registrations
for each row execute function public.prevent_event_hard_delete();

alter table public.club_events enable row level security;
alter table public.event_registrations enable row level security;
revoke all on table public.club_events, public.event_registrations from public, anon, authenticated;
grant select, insert, update on table public.club_events, public.event_registrations to service_role;

create or replace function public.list_club_events(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  can_manage boolean := public.current_has_club_permission(p_club_id, 'event.manage');
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
      and (e.event_status in ('published', 'cancelled') or can_manage)
      and (e.starts_at >= now() - interval '30 days' or can_manage)
    group by e.id, mine.response, mine.guest_count, mine.note
    order by e.starts_at, e.id
    limit 200
  ) as event;

  return coalesce(result, jsonb_build_object('events', '[]'::jsonb));
end;
$$;

create or replace function public.create_club_event(
  p_club_id uuid,
  p_event_type text,
  p_title text,
  p_description text,
  p_location text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_registration_deadline timestamptz,
  p_capacity integer,
  p_counts_for_attendance boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  created_event public.club_events;
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'event.manage')
     or not exists (select 1 from public.clubs where id = p_club_id and club_status = 'active') then
    raise exception using errcode = '42501', message = 'event_manage_required';
  end if;
  if p_event_type not in ('regular_meeting', 'board_meeting', 'service', 'joint_meeting', 'fireside', 'other')
     or btrim(coalesce(p_title, '')) = '' or char_length(btrim(p_title)) > 160
     or char_length(btrim(coalesce(p_description, ''))) > 5000
     or char_length(btrim(coalesce(p_location, ''))) > 300
     or p_starts_at is null or p_ends_at is null or p_registration_deadline is null
     or p_starts_at <= now() or p_ends_at <= p_starts_at
     or p_registration_deadline <= now() or p_registration_deadline > p_starts_at
     or (p_capacity is not null and (p_capacity < 1 or p_capacity > 10000)) then
    raise exception using errcode = '22023', message = 'invalid_event_input';
  end if;

  insert into public.club_events (
    club_id, event_type, title, description, location, starts_at, ends_at,
    registration_deadline, capacity, counts_for_attendance,
    created_by_app_account_id, updated_by_app_account_id
  ) values (
    p_club_id, p_event_type, btrim(p_title), btrim(coalesce(p_description, '')),
    btrim(coalesce(p_location, '')), p_starts_at, p_ends_at, p_registration_deadline,
    p_capacity, coalesce(p_counts_for_attendance, true), actor_id, actor_id
  ) returning * into created_event;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'event.created', 'club_event', created_event.id,
    jsonb_build_object('event_type', created_event.event_type, 'starts_at', created_event.starts_at));

  return jsonb_build_object('event_id', created_event.id, 'status', created_event.event_status, 'version', created_event.version);
end;
$$;

create or replace function public.publish_club_event(p_club_id uuid, p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_events;
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'event.manage') then
    raise exception using errcode = '42501', message = 'event_manage_required';
  end if;
  select * into target from public.club_events
  where id = p_event_id and club_id = p_club_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'event_not_available'; end if;
  if target.event_status <> 'draft' or target.starts_at <= now() or target.registration_deadline <= now() then
    raise exception using errcode = '22023', message = 'event_cannot_be_published';
  end if;
  update public.club_events set event_status = 'published', updated_by_app_account_id = actor_id
  where id = target.id;
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id)
  values (p_club_id, actor_id, 'event.published', 'club_event', target.id);
end;
$$;

create or replace function public.cancel_club_event(p_club_id uuid, p_event_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_events;
  reason text := btrim(coalesce(p_reason, ''));
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'event.manage') then
    raise exception using errcode = '42501', message = 'event_manage_required';
  end if;
  if reason = '' or char_length(reason) > 500 then
    raise exception using errcode = '22023', message = 'invalid_event_cancellation';
  end if;
  select * into target from public.club_events
  where id = p_event_id and club_id = p_club_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'event_not_available'; end if;
  if target.event_status in ('cancelled', 'completed') then return; end if;
  update public.club_events set event_status = 'cancelled', cancellation_reason = reason,
    updated_by_app_account_id = actor_id where id = target.id;
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'event.cancelled', 'club_event', target.id,
    jsonb_build_object('reason', reason));
end;
$$;

create or replace function public.set_my_event_registration(
  p_club_id uuid,
  p_event_id uuid,
  p_response text,
  p_guest_count integer,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_events;
  normalized_note text := btrim(coalesce(p_note, ''));
  normalized_guests integer := coalesce(p_guest_count, 0);
  used_spots integer;
  saved public.event_registrations;
begin
  if actor_id is null or not public.current_has_active_event_membership(p_club_id) then
    raise exception using errcode = '42501', message = 'active_event_membership_required';
  end if;
  if p_response not in ('pending', 'attending', 'declined')
     or normalized_guests < 0 or normalized_guests > 20
     or char_length(normalized_note) > 500
     or (p_response in ('pending', 'declined') and normalized_guests <> 0) then
    raise exception using errcode = '22023', message = 'invalid_event_registration';
  end if;

  select * into target from public.club_events
  where id = p_event_id and club_id = p_club_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'event_not_available'; end if;
  if target.event_status <> 'published' or now() > target.registration_deadline or now() >= target.starts_at then
    raise exception using errcode = '22023', message = 'event_registration_closed';
  end if;

  if p_response = 'attending' and target.capacity is not null then
    select coalesce(sum(1 + registration.guest_count), 0)::integer into used_spots
    from public.event_registrations as registration
    where registration.event_id = target.id
      and registration.response = 'attending'
      and registration.app_account_id <> actor_id;
    if used_spots + 1 + normalized_guests > target.capacity then
      raise exception using errcode = '23514', message = 'event_capacity_full';
    end if;
  end if;

  insert into public.event_registrations (
    club_id, event_id, app_account_id, response, guest_count, note, responded_at
  ) values (
    p_club_id, target.id, actor_id, p_response,
    case when p_response = 'attending' then normalized_guests else 0 end,
    normalized_note, case when p_response = 'pending' then null else now() end
  )
  on conflict (event_id, app_account_id) do update set
    response = excluded.response,
    guest_count = excluded.guest_count,
    note = excluded.note,
    responded_at = excluded.responded_at
  returning * into saved;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'event.registration_updated', 'event_registration', saved.id,
    jsonb_build_object('event_id', target.id, 'response', saved.response, 'guest_count', saved.guest_count));

  return jsonb_build_object('response', saved.response, 'guest_count', saved.guest_count, 'note', saved.note);
end;
$$;

revoke all on function public.current_can_access_club_events(uuid) from public, anon, authenticated;
revoke all on function public.current_has_active_event_membership(uuid) from public, anon, authenticated;
revoke all on function public.protect_club_event_update() from public, anon, authenticated;
revoke all on function public.protect_event_registration_update() from public, anon, authenticated;
revoke all on function public.prevent_event_hard_delete() from public, anon, authenticated;
revoke all on function public.list_my_event_clubs() from public, anon;
revoke all on function public.list_club_events(uuid) from public, anon;
revoke all on function public.create_club_event(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, integer, boolean) from public, anon;
revoke all on function public.publish_club_event(uuid, uuid) from public, anon;
revoke all on function public.cancel_club_event(uuid, uuid, text) from public, anon;
revoke all on function public.set_my_event_registration(uuid, uuid, text, integer, text) from public, anon;

grant execute on function public.list_my_event_clubs() to authenticated;
grant execute on function public.list_club_events(uuid) to authenticated;
grant execute on function public.create_club_event(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, integer, boolean) to authenticated;
grant execute on function public.publish_club_event(uuid, uuid) to authenticated;
grant execute on function public.cancel_club_event(uuid, uuid, text) to authenticated;
grant execute on function public.set_my_event_registration(uuid, uuid, text, integer, text) to authenticated;

commit;
