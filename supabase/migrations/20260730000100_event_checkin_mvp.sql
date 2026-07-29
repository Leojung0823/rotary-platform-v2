begin;

insert into public.permissions (permission_key, description_zh_hant) values
  ('attendance.read', '查看社內活動簽到狀態'),
  ('attendance.manage', '開啟簽到、人工補登與撤銷簽到')
on conflict (permission_key) do nothing;

insert into public.role_permissions (role_key, permission_key) values
  ('platform_admin', 'attendance.read'),
  ('platform_admin', 'attendance.manage'),
  ('president', 'attendance.read'),
  ('president', 'attendance.manage'),
  ('secretary', 'attendance.read'),
  ('secretary', 'attendance.manage'),
  ('finance', 'attendance.read'),
  ('member', 'attendance.read')
on conflict (role_key, permission_key) do nothing;

alter table public.club_memberships
  add constraint club_memberships_id_club_unique unique (id, club_id);

create table public.event_checkin_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  event_id uuid not null,
  token_hash text not null unique,
  token_prefix text not null,
  session_status text not null default 'active',
  opens_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  close_reason text,
  created_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  closed_by_app_account_id uuid references public.app_accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_checkin_sessions_event_club_fkey
    foreign key (event_id, club_id)
    references public.club_events (id, club_id)
    on delete restrict,
  constraint event_checkin_sessions_token_hash_check check (length(token_hash) = 64),
  constraint event_checkin_sessions_token_prefix_check check (length(token_prefix) = 8),
  constraint event_checkin_sessions_status_check check (session_status in ('active', 'closed')),
  constraint event_checkin_sessions_time_check check (expires_at > opens_at),
  constraint event_checkin_sessions_close_consistency check (
    (session_status = 'active' and closed_at is null and close_reason is null and closed_by_app_account_id is null)
    or (
      session_status = 'closed'
      and closed_at is not null
      and btrim(coalesce(close_reason, '')) <> ''
    )
  ),
  constraint event_checkin_sessions_id_tenant_unique unique (id, club_id, event_id)
);

create unique index event_checkin_sessions_one_active_event
  on public.event_checkin_sessions (event_id)
  where session_status = 'active';
create index event_checkin_sessions_club_event_created_idx
  on public.event_checkin_sessions (club_id, event_id, created_at desc);
create index event_checkin_sessions_active_expiry_idx
  on public.event_checkin_sessions (expires_at)
  where session_status = 'active';

create table public.event_attendances (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  event_id uuid not null,
  membership_id uuid not null,
  checkin_session_id uuid,
  attendance_status text not null default 'active',
  checkin_method text not null,
  checked_in_at timestamptz not null default now(),
  checked_in_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  checkin_note text not null default '',
  revoked_at timestamptz,
  revoked_by_app_account_id uuid references public.app_accounts(id) on delete restrict,
  revoke_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_attendances_event_club_fkey
    foreign key (event_id, club_id)
    references public.club_events (id, club_id)
    on delete restrict,
  constraint event_attendances_membership_club_fkey
    foreign key (membership_id, club_id)
    references public.club_memberships (id, club_id)
    on delete restrict,
  constraint event_attendances_session_tenant_fkey
    foreign key (checkin_session_id, club_id, event_id)
    references public.event_checkin_sessions (id, club_id, event_id)
    on delete restrict,
  constraint event_attendances_status_check check (attendance_status in ('active', 'revoked')),
  constraint event_attendances_method_check check (checkin_method in ('qr', 'manual')),
  constraint event_attendances_note_check check (char_length(checkin_note) <= 500),
  constraint event_attendances_method_consistency check (
    (checkin_method = 'qr' and checkin_session_id is not null)
    or (checkin_method = 'manual' and checkin_session_id is null and btrim(checkin_note) <> '')
  ),
  constraint event_attendances_revoke_consistency check (
    (attendance_status = 'active' and revoked_at is null and revoked_by_app_account_id is null and revoke_reason is null)
    or (
      attendance_status = 'revoked'
      and revoked_at is not null
      and revoked_by_app_account_id is not null
      and btrim(coalesce(revoke_reason, '')) <> ''
    )
  )
);

create unique index event_attendances_one_active_member_event
  on public.event_attendances (event_id, membership_id)
  where attendance_status = 'active';
create index event_attendances_club_event_status_idx
  on public.event_attendances (club_id, event_id, attendance_status, checked_in_at desc);
create index event_attendances_membership_event_idx
  on public.event_attendances (membership_id, event_id, checked_in_at desc);

create or replace function public.current_can_manage_event_checkin(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1 from public.clubs
    where id = p_club_id and club_status = 'active'
  ) and public.current_has_club_permission(p_club_id, 'attendance.manage')
$$;

create or replace function public.protect_event_checkin_session_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.id is distinct from new.id
     or old.club_id is distinct from new.club_id
     or old.event_id is distinct from new.event_id
     or old.token_hash is distinct from new.token_hash
     or old.token_prefix is distinct from new.token_prefix
     or old.opens_at is distinct from new.opens_at
     or old.expires_at is distinct from new.expires_at
     or old.created_by_app_account_id is distinct from new.created_by_app_account_id
     or old.created_at is distinct from new.created_at then
    raise exception using errcode = '23514', message = 'checkin_session_immutable_field';
  end if;

  if old.session_status = 'closed' and new.session_status <> 'closed' then
    raise exception using errcode = '23514', message = 'closed_checkin_session_cannot_reopen';
  end if;

  new.updated_at := now();
  if new.session_status = 'closed' then
    new.closed_at := coalesce(old.closed_at, new.closed_at, now());
    new.close_reason := btrim(coalesce(new.close_reason, ''));
    if new.close_reason = '' then
      raise exception using errcode = '23514', message = 'checkin_close_reason_required';
    end if;
  end if;
  return new;
end;
$$;

create trigger event_checkin_sessions_protect_update
before update on public.event_checkin_sessions
for each row execute function public.protect_event_checkin_session_update();

create or replace function public.protect_event_attendance_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.id is distinct from new.id
     or old.club_id is distinct from new.club_id
     or old.event_id is distinct from new.event_id
     or old.membership_id is distinct from new.membership_id
     or old.checkin_session_id is distinct from new.checkin_session_id
     or old.checkin_method is distinct from new.checkin_method
     or old.checked_in_at is distinct from new.checked_in_at
     or old.checked_in_by_app_account_id is distinct from new.checked_in_by_app_account_id
     or old.checkin_note is distinct from new.checkin_note
     or old.created_at is distinct from new.created_at then
    raise exception using errcode = '23514', message = 'event_attendance_immutable_field';
  end if;

  if old.attendance_status = 'revoked' and new.attendance_status <> 'revoked' then
    raise exception using errcode = '23514', message = 'revoked_attendance_cannot_restore';
  end if;

  new.updated_at := now();
  if new.attendance_status = 'revoked' then
    new.revoked_at := coalesce(old.revoked_at, new.revoked_at, now());
    new.revoke_reason := btrim(coalesce(new.revoke_reason, ''));
    if new.revoked_by_app_account_id is null or new.revoke_reason = '' then
      raise exception using errcode = '23514', message = 'attendance_revoke_metadata_required';
    end if;
  end if;
  return new;
end;
$$;

create trigger event_attendances_protect_update
before update on public.event_attendances
for each row execute function public.protect_event_attendance_update();

create or replace function public.prevent_event_attendance_hard_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = '42501', message = 'event_attendance_hard_delete_forbidden';
end;
$$;

create trigger event_checkin_sessions_prevent_delete
before delete on public.event_checkin_sessions
for each row execute function public.prevent_event_attendance_hard_delete();
create trigger event_attendances_prevent_delete
before delete on public.event_attendances
for each row execute function public.prevent_event_attendance_hard_delete();

create or replace function public.close_checkin_sessions_on_terminal_event()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.event_status in ('cancelled', 'completed')
     and old.event_status is distinct from new.event_status then
    update public.event_checkin_sessions
    set session_status = 'closed',
        closed_at = now(),
        close_reason = 'event_terminal',
        closed_by_app_account_id = new.updated_by_app_account_id
    where event_id = new.id and session_status = 'active';
  end if;
  return new;
end;
$$;

create trigger club_events_close_checkin_on_terminal
  after update of event_status on public.club_events
  for each row execute function public.close_checkin_sessions_on_terminal_event();

alter table public.event_checkin_sessions enable row level security;
alter table public.event_attendances enable row level security;
revoke all on table public.event_checkin_sessions, public.event_attendances from public, anon, authenticated;
grant select, insert, update on table public.event_checkin_sessions, public.event_attendances to service_role;

create or replace function public.open_event_checkin(
  p_club_id uuid,
  p_event_id uuid,
  p_duration_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_events;
  current_session public.event_checkin_sessions;
  created_session public.event_checkin_sessions;
  raw_token text;
begin
  if actor_id is null or not public.current_can_manage_event_checkin(p_club_id) then
    raise exception using errcode = '42501', message = 'attendance_manage_required';
  end if;
  if p_duration_minutes is null or p_duration_minutes < 5 or p_duration_minutes > 240 then
    raise exception using errcode = '22023', message = 'invalid_checkin_duration';
  end if;

  select * into target from public.club_events
  where id = p_event_id and club_id = p_club_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'event_not_available'; end if;
  if target.event_status <> 'published' or not target.counts_for_attendance then
    raise exception using errcode = '22023', message = 'event_not_checkin_eligible';
  end if;
  if now() < target.starts_at - interval '24 hours' or now() > target.ends_at + interval '24 hours' then
    raise exception using errcode = '22023', message = 'checkin_window_closed';
  end if;

  select * into current_session from public.event_checkin_sessions
  where event_id = target.id and session_status = 'active' for update;
  if found and current_session.expires_at <= now() then
    update public.event_checkin_sessions
    set session_status = 'closed', closed_at = now(), close_reason = 'expired', closed_by_app_account_id = actor_id
    where id = current_session.id;
  elsif found then
    raise exception using errcode = '23505', message = 'checkin_session_already_active';
  end if;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.event_checkin_sessions (
    club_id, event_id, token_hash, token_prefix, expires_at, created_by_app_account_id
  ) values (
    p_club_id, p_event_id, encode(extensions.digest(raw_token, 'sha256'), 'hex'), left(raw_token, 8),
    now() + make_interval(mins => p_duration_minutes), actor_id
  ) returning * into created_session;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'attendance.session_opened', 'event_checkin_session', created_session.id,
    jsonb_build_object('event_id', p_event_id, 'expires_at', created_session.expires_at));

  return jsonb_build_object(
    'session_id', created_session.id,
    'event_id', created_session.event_id,
    'token', raw_token,
    'token_prefix', created_session.token_prefix,
    'expires_at', created_session.expires_at
  );
end;
$$;

create or replace function public.rotate_event_checkin_token(
  p_club_id uuid,
  p_event_id uuid,
  p_duration_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_events;
  current_session public.event_checkin_sessions;
  created_session public.event_checkin_sessions;
  raw_token text;
begin
  if actor_id is null or not public.current_can_manage_event_checkin(p_club_id) then
    raise exception using errcode = '42501', message = 'attendance_manage_required';
  end if;
  if p_duration_minutes is null or p_duration_minutes < 5 or p_duration_minutes > 240 then
    raise exception using errcode = '22023', message = 'invalid_checkin_duration';
  end if;

  select * into target from public.club_events
  where id = p_event_id and club_id = p_club_id for update;
  if not found or target.event_status <> 'published' or not target.counts_for_attendance then
    raise exception using errcode = '22023', message = 'event_not_checkin_eligible';
  end if;
  if now() < target.starts_at - interval '24 hours' or now() > target.ends_at + interval '24 hours' then
    raise exception using errcode = '22023', message = 'checkin_window_closed';
  end if;

  select * into current_session from public.event_checkin_sessions
  where event_id = target.id and session_status = 'active' for update;
  if not found or current_session.expires_at <= now() then
    if found then
      update public.event_checkin_sessions
      set session_status = 'closed', closed_at = now(), close_reason = 'expired', closed_by_app_account_id = actor_id
      where id = current_session.id;
    end if;
    raise exception using errcode = 'P0002', message = 'checkin_session_not_active';
  end if;

  update public.event_checkin_sessions
  set session_status = 'closed', closed_at = now(), close_reason = 'rotated', closed_by_app_account_id = actor_id
  where id = current_session.id;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.event_checkin_sessions (
    club_id, event_id, token_hash, token_prefix, expires_at, created_by_app_account_id
  ) values (
    p_club_id, p_event_id, encode(extensions.digest(raw_token, 'sha256'), 'hex'), left(raw_token, 8),
    now() + make_interval(mins => p_duration_minutes), actor_id
  ) returning * into created_session;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'attendance.session_rotated', 'event_checkin_session', created_session.id,
    jsonb_build_object('event_id', p_event_id, 'previous_session_id', current_session.id, 'expires_at', created_session.expires_at));

  return jsonb_build_object(
    'session_id', created_session.id,
    'event_id', created_session.event_id,
    'token', raw_token,
    'token_prefix', created_session.token_prefix,
    'expires_at', created_session.expires_at
  );
end;
$$;

create or replace function public.close_event_checkin(
  p_club_id uuid,
  p_event_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  current_session public.event_checkin_sessions;
  reason text := btrim(coalesce(p_reason, ''));
begin
  if actor_id is null or not public.current_can_manage_event_checkin(p_club_id) then
    raise exception using errcode = '42501', message = 'attendance_manage_required';
  end if;
  if reason = '' or char_length(reason) > 500 then
    raise exception using errcode = '22023', message = 'invalid_checkin_close_reason';
  end if;

  select session.* into current_session
  from public.event_checkin_sessions as session
  join public.club_events as event on event.id = session.event_id and event.club_id = session.club_id
  where session.event_id = p_event_id and session.club_id = p_club_id and session.session_status = 'active'
  for update of session;
  if not found then return; end if;

  update public.event_checkin_sessions
  set session_status = 'closed', closed_at = now(), close_reason = reason, closed_by_app_account_id = actor_id
  where id = current_session.id;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'attendance.session_closed', 'event_checkin_session', current_session.id,
    jsonb_build_object('event_id', p_event_id, 'reason', reason));
end;
$$;

create or replace function public.check_in_to_event(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target_session public.event_checkin_sessions;
  target_event public.club_events;
  target_membership public.club_memberships;
  existing_attendance public.event_attendances;
  created_attendance public.event_attendances;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'active_account_required';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_checkin_token';
  end if;

  select * into target_session
  from public.event_checkin_sessions
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;
  if not found or target_session.session_status <> 'active' or now() < target_session.opens_at then
    raise exception using errcode = '22023', message = 'checkin_token_invalid_or_expired';
  end if;
  if target_session.expires_at <= now() then
    update public.event_checkin_sessions
    set session_status = 'closed', closed_at = now(), close_reason = 'expired'
    where id = target_session.id;
    raise exception using errcode = '22023', message = 'checkin_token_invalid_or_expired';
  end if;

  select event.* into target_event
  from public.club_events as event
  join public.clubs as club on club.id = event.club_id and club.club_status = 'active'
  where event.id = target_session.event_id
    and event.club_id = target_session.club_id
    and event.event_status = 'published'
    and event.counts_for_attendance
  for share of event;
  if not found then
    raise exception using errcode = '22023', message = 'event_not_checkin_eligible';
  end if;

  select membership.* into target_membership
  from public.app_accounts as account
  join public.club_memberships as membership on membership.person_id = account.person_id
  where account.id = actor_id
    and membership.club_id = target_session.club_id
    and membership.membership_status = 'active'
  for share of membership;
  if not found then
    raise exception using errcode = '42501', message = 'active_membership_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_event.id::text || ':' || target_membership.id::text, 0)
  );

  select * into existing_attendance from public.event_attendances
  where event_id = target_event.id
    and membership_id = target_membership.id
    and attendance_status = 'active';
  if found then
    return jsonb_build_object(
      'attendance_id', existing_attendance.id,
      'event_id', existing_attendance.event_id,
      'checked_in_at', existing_attendance.checked_in_at,
      'idempotent', true
    );
  end if;

  insert into public.event_attendances (
    club_id, event_id, membership_id, checkin_session_id, checkin_method,
    checked_in_by_app_account_id, checkin_note
  ) values (
    target_session.club_id, target_session.event_id, target_membership.id, target_session.id,
    'qr', actor_id, ''
  ) returning * into created_attendance;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (target_session.club_id, actor_id, 'attendance.self_checked_in', 'event_attendance', created_attendance.id,
    jsonb_build_object('event_id', target_event.id, 'membership_id', target_membership.id, 'session_id', target_session.id));

  return jsonb_build_object(
    'attendance_id', created_attendance.id,
    'event_id', created_attendance.event_id,
    'checked_in_at', created_attendance.checked_in_at,
    'idempotent', false
  );
end;
$$;

create or replace function public.manual_check_in_event(
  p_club_id uuid,
  p_event_id uuid,
  p_membership_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target_event public.club_events;
  target_membership public.club_memberships;
  existing_attendance public.event_attendances;
  created_attendance public.event_attendances;
  reason text := btrim(coalesce(p_reason, ''));
begin
  if actor_id is null or not public.current_can_manage_event_checkin(p_club_id) then
    raise exception using errcode = '42501', message = 'attendance_manage_required';
  end if;
  if reason = '' or char_length(reason) > 500 then
    raise exception using errcode = '22023', message = 'manual_checkin_reason_required';
  end if;

  select * into target_event from public.club_events
  where id = p_event_id and club_id = p_club_id for share;
  if not found or target_event.event_status <> 'published' or not target_event.counts_for_attendance then
    raise exception using errcode = '22023', message = 'event_not_checkin_eligible';
  end if;

  select * into target_membership from public.club_memberships
  where id = p_membership_id and club_id = p_club_id and membership_status = 'active'
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'active_membership_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_event.id::text || ':' || target_membership.id::text, 0)
  );

  select * into existing_attendance from public.event_attendances
  where event_id = target_event.id
    and membership_id = target_membership.id
    and attendance_status = 'active';
  if found then
    return jsonb_build_object(
      'attendance_id', existing_attendance.id,
      'event_id', existing_attendance.event_id,
      'checked_in_at', existing_attendance.checked_in_at,
      'idempotent', true
    );
  end if;

  insert into public.event_attendances (
    club_id, event_id, membership_id, checkin_method,
    checked_in_by_app_account_id, checkin_note
  ) values (
    p_club_id, p_event_id, p_membership_id, 'manual', actor_id, reason
  ) returning * into created_attendance;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'attendance.manual_checked_in', 'event_attendance', created_attendance.id,
    jsonb_build_object('event_id', p_event_id, 'membership_id', p_membership_id, 'reason', reason));

  return jsonb_build_object(
    'attendance_id', created_attendance.id,
    'event_id', created_attendance.event_id,
    'checked_in_at', created_attendance.checked_in_at,
    'idempotent', false
  );
end;
$$;

create or replace function public.revoke_event_attendance(
  p_club_id uuid,
  p_attendance_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.event_attendances;
  reason text := btrim(coalesce(p_reason, ''));
begin
  if actor_id is null or not public.current_can_manage_event_checkin(p_club_id) then
    raise exception using errcode = '42501', message = 'attendance_manage_required';
  end if;
  if reason = '' or char_length(reason) > 500 then
    raise exception using errcode = '22023', message = 'attendance_revoke_reason_required';
  end if;

  select * into target from public.event_attendances
  where id = p_attendance_id and club_id = p_club_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'attendance_not_available'; end if;
  if target.attendance_status = 'revoked' then return; end if;

  update public.event_attendances
  set attendance_status = 'revoked', revoked_at = now(), revoked_by_app_account_id = actor_id, revoke_reason = reason
  where id = target.id;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'attendance.revoked', 'event_attendance', target.id,
    jsonb_build_object('event_id', target.event_id, 'membership_id', target.membership_id, 'reason', reason));
end;
$$;

create or replace function public.get_event_checkin_overview(p_club_id uuid, p_event_id uuid)
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
  if actor_id is null or not public.current_can_manage_event_checkin(p_club_id) then
    raise exception using errcode = '42501', message = 'attendance_manage_required';
  end if;

  select jsonb_build_object(
    'event', jsonb_build_object(
      'id', event.id,
      'title', event.title,
      'starts_at', event.starts_at,
      'ends_at', event.ends_at,
      'status', event.event_status,
      'counts_for_attendance', event.counts_for_attendance,
      'checkin_window_open', now() >= event.starts_at - interval '24 hours' and now() <= event.ends_at + interval '24 hours'
    ),
    'active_session', (
      select jsonb_build_object(
        'id', session.id,
        'token_prefix', session.token_prefix,
        'opens_at', session.opens_at,
        'expires_at', session.expires_at,
        'expired', session.expires_at <= now()
      )
      from public.event_checkin_sessions as session
      where session.event_id = event.id and session.session_status = 'active'
      order by session.created_at desc limit 1
    ),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'membership_id', membership.id,
        'display_name', person.canonical_name,
        'checked_in', attendance.id is not null,
        'attendance_id', attendance.id,
        'checked_in_at', attendance.checked_in_at,
        'checkin_method', attendance.checkin_method
      ) order by person.canonical_name, membership.id)
      from public.club_memberships as membership
      join public.people as person on person.id = membership.person_id
      left join public.event_attendances as attendance
        on attendance.event_id = event.id
       and attendance.membership_id = membership.id
       and attendance.attendance_status = 'active'
      where membership.club_id = p_club_id and membership.membership_status = 'active'
    ), '[]'::jsonb),
    'attendance_history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'attendance_id', attendance.id,
        'membership_id', attendance.membership_id,
        'display_name', person.canonical_name,
        'status', attendance.attendance_status,
        'checkin_method', attendance.checkin_method,
        'checked_in_at', attendance.checked_in_at,
        'checkin_note', attendance.checkin_note,
        'revoked_at', attendance.revoked_at,
        'revoke_reason', attendance.revoke_reason
      ) order by attendance.checked_in_at desc, attendance.id desc)
      from public.event_attendances as attendance
      join public.club_memberships as membership on membership.id = attendance.membership_id
      join public.people as person on person.id = membership.person_id
      where attendance.event_id = event.id and attendance.club_id = p_club_id
    ), '[]'::jsonb)
  ) into result
  from public.club_events as event
  where event.id = p_event_id and event.club_id = p_club_id;

  if result is null then raise exception using errcode = 'P0002', message = 'event_not_available'; end if;
  return result;
end;
$$;

revoke all on function public.current_can_manage_event_checkin(uuid) from public, anon, authenticated;
revoke all on function public.protect_event_checkin_session_update() from public, anon, authenticated;
revoke all on function public.protect_event_attendance_update() from public, anon, authenticated;
revoke all on function public.prevent_event_attendance_hard_delete() from public, anon, authenticated;
revoke all on function public.close_checkin_sessions_on_terminal_event() from public, anon, authenticated;
revoke all on function public.open_event_checkin(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.rotate_event_checkin_token(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.close_event_checkin(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.check_in_to_event(text) from public, anon, authenticated;
revoke all on function public.manual_check_in_event(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.revoke_event_attendance(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.get_event_checkin_overview(uuid, uuid) from public, anon, authenticated;

grant execute on function public.open_event_checkin(uuid, uuid, integer) to authenticated;
grant execute on function public.rotate_event_checkin_token(uuid, uuid, integer) to authenticated;
grant execute on function public.close_event_checkin(uuid, uuid, text) to authenticated;
grant execute on function public.check_in_to_event(text) to authenticated;
grant execute on function public.manual_check_in_event(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.revoke_event_attendance(uuid, uuid, text) to authenticated;
grant execute on function public.get_event_checkin_overview(uuid, uuid) to authenticated;

commit;
