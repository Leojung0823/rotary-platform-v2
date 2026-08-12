begin;

-- PR-03 keeps event_checkin_sessions as the high-level, auditable session
-- boundary. Dynamic QR values are deliberately child credentials: a new
-- credential never creates another session and its raw value is never stored.
create table public.event_checkin_qr_credentials (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  event_id uuid not null,
  checkin_session_id uuid not null,
  credential_hash text not null unique,
  credential_prefix text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  valid_until timestamptz not null,
  revoked_at timestamptz,
  revoked_by_app_account_id uuid references public.app_accounts(id) on delete restrict,
  revoke_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_checkin_qr_credentials_session_tenant_fkey
    foreign key (checkin_session_id, club_id, event_id)
    references public.event_checkin_sessions (id, club_id, event_id)
    on delete restrict,
  constraint event_checkin_qr_credentials_hash_check check (length(credential_hash) = 64),
  constraint event_checkin_qr_credentials_prefix_check check (length(credential_prefix) = 8),
  constraint event_checkin_qr_credentials_time_check check (
    expires_at > issued_at and valid_until > issued_at and valid_until <= expires_at
  ),
  constraint event_checkin_qr_credentials_revoke_consistency check (
    (revoked_at is null and revoked_by_app_account_id is null and revoke_reason is null)
    or (revoked_at is not null and btrim(coalesce(revoke_reason, '')) <> '')
  ),
  constraint event_checkin_qr_credentials_id_tenant_unique unique (id, club_id, event_id, checkin_session_id)
);

create index event_checkin_qr_credentials_session_valid_idx
  on public.event_checkin_qr_credentials (checkin_session_id, valid_until desc)
  where revoked_at is null;
create index event_checkin_qr_credentials_cleanup_idx
  on public.event_checkin_qr_credentials (club_id, valid_until, revoked_at);

create or replace function public.event_checkin_v2_credential_ttl_seconds()
returns integer
language sql
immutable
set search_path = pg_catalog
as $$ select 60 $$;

create or replace function public.event_checkin_v2_credential_overlap_seconds()
returns integer
language sql
immutable
set search_path = pg_catalog
as $$ select 30 $$;

create or replace function public.protect_event_checkin_qr_credential_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.id is distinct from new.id
     or old.club_id is distinct from new.club_id
     or old.event_id is distinct from new.event_id
     or old.checkin_session_id is distinct from new.checkin_session_id
     or old.credential_hash is distinct from new.credential_hash
     or old.credential_prefix is distinct from new.credential_prefix
     or old.issued_at is distinct from new.issued_at
     or old.expires_at is distinct from new.expires_at
     or old.created_at is distinct from new.created_at then
    raise exception using errcode = '23514', message = 'checkin_qr_credential_immutable_field';
  end if;

  if new.valid_until > old.valid_until then
    raise exception using errcode = '23514', message = 'checkin_qr_credential_validity_cannot_extend';
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception using errcode = '23514', message = 'revoked_checkin_qr_credential_cannot_restore';
  end if;
  if new.revoked_at is not null then
    new.revoked_at := coalesce(old.revoked_at, new.revoked_at, now());
    new.revoke_reason := btrim(coalesce(new.revoke_reason, ''));
    if new.revoke_reason = '' then
      raise exception using errcode = '23514', message = 'checkin_qr_credential_revoke_reason_required';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger event_checkin_qr_credentials_protect_update
before update on public.event_checkin_qr_credentials
for each row execute function public.protect_event_checkin_qr_credential_update();

alter table public.event_checkin_qr_credentials enable row level security;
revoke all on table public.event_checkin_qr_credentials from public, anon, authenticated;
grant select, insert, update, delete on table public.event_checkin_qr_credentials to service_role;

create or replace function public.open_dynamic_event_checkin(
  p_club_id uuid,
  p_event_id uuid
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
  ignored_legacy_token text;
begin
  if actor_id is null or not public.current_can_manage_event_checkin(p_club_id) then
    raise exception using errcode = '42501', message = 'attendance_manage_required';
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
  elsif found and exists (
    select 1 from public.event_checkin_qr_credentials where checkin_session_id = current_session.id
  ) then
    raise exception using errcode = '23505', message = 'checkin_session_already_active';
  elsif found then
    -- A manager explicitly starting V2 safely supersedes the legacy token.
    update public.event_checkin_sessions
    set session_status = 'closed', closed_at = now(), close_reason = 'v2_upgrade', closed_by_app_account_id = actor_id
    where id = current_session.id;
  end if;

  -- The historic session table requires a token hash. This random value is
  -- never returned, logged, or used by V2; only child credentials are usable.
  ignored_legacy_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.event_checkin_sessions (
    club_id, event_id, token_hash, token_prefix, expires_at, created_by_app_account_id
  ) values (
    p_club_id, p_event_id,
    encode(extensions.digest(ignored_legacy_token, 'sha256'), 'hex'),
    left(ignored_legacy_token, 8),
    target.ends_at + interval '24 hours', actor_id
  ) returning * into created_session;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'attendance.session_opened', 'event_checkin_session', created_session.id,
    jsonb_build_object('event_id', p_event_id, 'mode', 'dynamic_qr_v2'));

  return jsonb_build_object('session_id', created_session.id, 'event_id', created_session.event_id);
end;
$$;

create or replace function public.issue_dynamic_event_checkin_credential(
  p_club_id uuid,
  p_event_id uuid,
  p_rotation text default 'automatic'
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
  created_credential public.event_checkin_qr_credentials;
  raw_credential text;
  rotation text := btrim(coalesce(p_rotation, ''));
begin
  if actor_id is null or not public.current_can_manage_event_checkin(p_club_id) then
    raise exception using errcode = '42501', message = 'attendance_manage_required';
  end if;
  if rotation not in ('initial', 'automatic', 'emergency') then
    raise exception using errcode = '22023', message = 'invalid_checkin_qr_rotation';
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
  where event_id = target.id and club_id = target.club_id and session_status = 'active'
  for update;
  if not found or current_session.expires_at <= now() then
    if found then
      update public.event_checkin_sessions
      set session_status = 'closed', closed_at = now(), close_reason = 'expired', closed_by_app_account_id = actor_id
      where id = current_session.id;
    end if;
    raise exception using errcode = 'P0002', message = 'checkin_session_not_active';
  end if;
  if rotation = 'initial' and exists (
    select 1 from public.event_checkin_qr_credentials where checkin_session_id = current_session.id
  ) then
    raise exception using errcode = '23505', message = 'checkin_qr_credential_already_issued';
  end if;
  if not exists (select 1 from public.event_checkin_qr_credentials where checkin_session_id = current_session.id)
     and rotation = 'automatic' then
    raise exception using errcode = '22023', message = 'legacy_checkin_session_active';
  end if;

  if rotation = 'emergency' then
    update public.event_checkin_qr_credentials
    set revoked_at = now(), revoked_by_app_account_id = actor_id, revoke_reason = 'emergency_rotation'
    where checkin_session_id = current_session.id and revoked_at is null and valid_until > now();
  elsif rotation = 'automatic' then
    update public.event_checkin_qr_credentials
    set valid_until = least(valid_until, now() + make_interval(secs => public.event_checkin_v2_credential_overlap_seconds()))
    where checkin_session_id = current_session.id and revoked_at is null and valid_until > now();
  end if;

  raw_credential := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.event_checkin_qr_credentials (
    club_id, event_id, checkin_session_id, credential_hash, credential_prefix, expires_at, valid_until
  ) values (
    target.club_id, target.id, current_session.id,
    encode(extensions.digest(raw_credential, 'sha256'), 'hex'), left(raw_credential, 8),
    now() + make_interval(secs => public.event_checkin_v2_credential_ttl_seconds()),
    now() + make_interval(secs => public.event_checkin_v2_credential_ttl_seconds())
  ) returning * into created_credential;

  if rotation = 'emergency' then
    insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
    values (p_club_id, actor_id, 'attendance.qr_emergency_rotated', 'event_checkin_session', current_session.id,
      jsonb_build_object('event_id', p_event_id));
  end if;

  return jsonb_build_object(
    'credential', raw_credential,
    'credential_prefix', created_credential.credential_prefix,
    'expires_at', created_credential.expires_at,
    'server_now', now()
  );
end;
$$;

create or replace function public.check_in_to_dynamic_event(p_credential text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target_credential public.event_checkin_qr_credentials;
  target_session public.event_checkin_sessions;
  target_event public.club_events;
  target_membership public.club_memberships;
  existing_attendance public.event_attendances;
  created_attendance public.event_attendances;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'active_account_required';
  end if;
  if p_credential is null or p_credential !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_checkin_token';
  end if;

  select * into target_credential from public.event_checkin_qr_credentials
  where credential_hash = encode(extensions.digest(p_credential, 'sha256'), 'hex')
  for update;
  if not found or target_credential.revoked_at is not null or target_credential.valid_until <= now() then
    raise exception using errcode = '22023', message = 'checkin_token_invalid_or_expired';
  end if;

  select * into target_session from public.event_checkin_sessions
  where id = target_credential.checkin_session_id
    and club_id = target_credential.club_id
    and event_id = target_credential.event_id
    and session_status = 'active'
    and expires_at > now()
  for share;
  if not found then raise exception using errcode = '22023', message = 'checkin_session_not_active'; end if;

  select event.* into target_event
  from public.club_events as event
  join public.clubs as club on club.id = event.club_id and club.club_status = 'active'
  where event.id = target_credential.event_id
    and event.club_id = target_credential.club_id
    and event.event_status = 'published'
    and event.counts_for_attendance
    and now() >= event.starts_at - interval '24 hours'
    and now() <= event.ends_at + interval '24 hours'
  for share of event;
  if not found then raise exception using errcode = '22023', message = 'event_not_checkin_eligible'; end if;

  select membership.* into target_membership
  from public.app_accounts as account
  join public.club_memberships as membership on membership.person_id = account.person_id
  where account.id = actor_id
    and membership.club_id = target_credential.club_id
    and membership.membership_status = 'active'
  for share of membership;
  if not found then raise exception using errcode = '42501', message = 'active_membership_required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_event.id::text || ':' || target_membership.id::text, 0)
  );
  select * into existing_attendance from public.event_attendances
  where event_id = target_event.id and membership_id = target_membership.id and attendance_status = 'active';
  if found then
    return jsonb_build_object('attendance_id', existing_attendance.id, 'event_id', existing_attendance.event_id,
      'checked_in_at', existing_attendance.checked_in_at, 'idempotent', true);
  end if;

  insert into public.event_attendances (
    club_id, event_id, membership_id, checkin_session_id, checkin_method, checked_in_by_app_account_id, checkin_note
  ) values (
    target_credential.club_id, target_credential.event_id, target_membership.id, target_session.id,
    'qr', actor_id, ''
  ) returning * into created_attendance;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (target_credential.club_id, actor_id, 'attendance.self_checked_in', 'event_attendance', created_attendance.id,
    jsonb_build_object('event_id', target_event.id, 'membership_id', target_membership.id, 'mode', 'dynamic_qr_v2'));

  return jsonb_build_object('attendance_id', created_attendance.id, 'event_id', created_attendance.event_id,
    'checked_in_at', created_attendance.checked_in_at, 'idempotent', false);
end;
$$;

create or replace function public.cleanup_expired_dynamic_checkin_credentials(
  p_club_id uuid,
  p_limit integer default 250
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  deleted_count integer;
begin
  if actor_id is null or not public.current_can_manage_event_checkin(p_club_id) then
    raise exception using errcode = '42501', message = 'attendance_manage_required';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception using errcode = '22023', message = 'invalid_checkin_cleanup_limit';
  end if;

  with removable as (
    select id from public.event_checkin_qr_credentials
    where club_id = p_club_id and valid_until < now() - interval '1 day'
    order by valid_until asc
    limit p_limit
    for update skip locked
  )
  delete from public.event_checkin_qr_credentials as credential
  using removable
  where credential.id = removable.id;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- Close and terminal-event paths are redefined so V2 child credentials become
-- unusable immediately through their parent session, while legacy behavior and
-- historic audit semantics remain intact.
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
  where session.event_id = p_event_id and session.club_id = p_club_id and session.session_status = 'active'
  for update;
  if not found then return; end if;

  update public.event_checkin_sessions
  set session_status = 'closed', closed_at = now(), close_reason = reason, closed_by_app_account_id = actor_id
  where id = current_session.id;
  update public.event_checkin_qr_credentials
  set revoked_at = now(), revoked_by_app_account_id = actor_id, revoke_reason = 'session_closed'
  where checkin_session_id = current_session.id and revoked_at is null;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'attendance.session_closed', 'event_checkin_session', current_session.id,
    jsonb_build_object('event_id', p_event_id, 'reason', reason));
end;
$$;

create or replace function public.close_checkin_sessions_on_terminal_event()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.event_status in ('cancelled', 'completed') and old.event_status is distinct from new.event_status then
    update public.event_checkin_sessions
    set session_status = 'closed', closed_at = now(), close_reason = 'event_terminal',
        closed_by_app_account_id = new.updated_by_app_account_id
    where event_id = new.id and session_status = 'active';
    update public.event_checkin_qr_credentials
    set revoked_at = now(), revoked_by_app_account_id = new.updated_by_app_account_id, revoke_reason = 'event_terminal'
    where event_id = new.id and revoked_at is null;
  end if;
  return new;
end;
$$;

revoke all on function public.event_checkin_v2_credential_ttl_seconds() from public, anon, authenticated;
revoke all on function public.event_checkin_v2_credential_overlap_seconds() from public, anon, authenticated;
revoke all on function public.protect_event_checkin_qr_credential_update() from public, anon, authenticated;
revoke all on function public.open_dynamic_event_checkin(uuid, uuid) from public, anon, authenticated;
revoke all on function public.issue_dynamic_event_checkin_credential(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.check_in_to_dynamic_event(text) from public, anon, authenticated;
revoke all on function public.cleanup_expired_dynamic_checkin_credentials(uuid, integer) from public, anon, authenticated;

grant execute on function public.open_dynamic_event_checkin(uuid, uuid) to authenticated;
grant execute on function public.issue_dynamic_event_checkin_credential(uuid, uuid, text) to authenticated;
grant execute on function public.check_in_to_dynamic_event(text) to authenticated;
grant execute on function public.cleanup_expired_dynamic_checkin_credentials(uuid, integer) to authenticated;

commit;
