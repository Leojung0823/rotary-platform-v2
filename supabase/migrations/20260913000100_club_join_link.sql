begin;

-- A club-wide self-registration link. Distinct from member_invitations, whose
-- person_id and membership_id are NOT NULL: that table models "invite this one
-- known person", and reusing it here would mean creating a person row the
-- moment somebody opens the link, leaving half-made members in the directory
-- for every curious click. Nothing is created here until LINE Login succeeds
-- and a display name actually exists.
--
-- Product decision (2026-09-13): a redeemer becomes an active member
-- immediately, and the link stays open until an officer turns it off -- no
-- expiry, no use cap. The link is therefore a key to the club's directory,
-- which carries the other members' names, occupations, and whichever of their
-- email and phone they chose to show fellow members. The single control is the
-- off switch, so disabling it is the whole safety story; that is deliberate and
-- the officer UI says so.

alter table public.platform_feature_flags
  drop constraint platform_feature_flags_feature_key_check;
alter table public.platform_feature_flags
  add constraint platform_feature_flags_feature_key_check check (feature_key in (
    'role_context_v2', 'role_shells_v2', 'member_home_v2', 'checkin_qr_v2', 'checkin_gps_v2',
    'attendance_ui_v2', 'announcements_v09', 'blessing_iou_v1',
    'blessing_iou_collections_v1', 'blessing_iou_reporting_v1',
    'birthday_wishes_v1', 'birthday_wishes_v2', 'birthday_wishes_collection_v1',
    'message_board_v1', 'archive_handover_v1',
    'line_oa_auto_pairing_v1', 'line_oa_event_push_v1', 'line_oa_onboarding_v1',
    'line_oa_flex_templates_v1', 'club_join_link_v1'
  ));

alter table public.platform_feature_flag_audit
  drop constraint platform_feature_flag_audit_feature_key_check;
alter table public.platform_feature_flag_audit
  add constraint platform_feature_flag_audit_feature_key_check check (feature_key in (
    'role_context_v2', 'role_shells_v2', 'member_home_v2', 'checkin_qr_v2', 'checkin_gps_v2',
    'attendance_ui_v2', 'announcements_v09', 'blessing_iou_v1',
    'blessing_iou_collections_v1', 'blessing_iou_reporting_v1',
    'birthday_wishes_v1', 'birthday_wishes_v2', 'birthday_wishes_collection_v1',
    'message_board_v1', 'archive_handover_v1',
    'line_oa_auto_pairing_v1', 'line_oa_event_push_v1', 'line_oa_onboarding_v1',
    'line_oa_flex_templates_v1', 'club_join_link_v1'
  ));

create table public.club_join_links (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  token_hash text not null unique check (length(token_hash) = 64),
  token_prefix text not null check (length(token_prefix) = 8),
  link_status text not null default 'active' check (link_status in ('active', 'disabled')),
  join_count integer not null default 0 check (join_count >= 0),
  created_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  disabled_at timestamptz,
  disabled_by_app_account_id uuid references public.app_accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (link_status <> 'disabled' or disabled_at is not null)
);

comment on table public.club_join_links is
  'Club-wide self-registration links. Only the SHA-256 hash of the token is stored; the raw token is returned once, at creation.';

-- One live link per club. Issuing a new one retires the old, so a leaked token
-- cannot quietly stay valid alongside the one the officer thinks is current.
create unique index club_join_links_one_active_per_club
  on public.club_join_links (club_id)
  where link_status = 'active';

alter table public.club_join_links enable row level security;
revoke all on table public.club_join_links from public, anon, authenticated;

create or replace function public.club_join_link_enabled()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'club_join_link_v1'
      and flag.enabled = true
      and flag.rollout_percentage = 100
  )
$$;

create or replace function public.create_club_join_link(p_club_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  actor_id uuid := public.current_app_account_id();
  raw_token text;
  new_link public.club_join_links;
  retired_id uuid;
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'invitation.manage') then
    raise exception using errcode = '42501', message = 'invitation_manage_required';
  end if;
  if not public.club_join_link_enabled() then
    raise exception using errcode = '22023', message = 'club_join_link_disabled';
  end if;
  if not exists (
    select 1 from public.clubs where id = p_club_id and club_status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'club_not_active';
  end if;

  update public.club_join_links
  set link_status = 'disabled',
      disabled_at = now(),
      disabled_by_app_account_id = actor_id,
      updated_at = now()
  where club_id = p_club_id and link_status = 'active'
  returning id into retired_id;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.club_join_links (
    club_id, token_hash, token_prefix, created_by_app_account_id
  ) values (
    p_club_id,
    encode(extensions.digest(raw_token, 'sha256'), 'hex'),
    left(raw_token, 8),
    actor_id
  ) returning * into new_link;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'club_join_link.created', 'club_join_link', new_link.id,
    jsonb_build_object('token_prefix', new_link.token_prefix,
      'retired_link_id', retired_id));

  return jsonb_build_object(
    'link_id', new_link.id,
    'token', raw_token,
    'token_prefix', new_link.token_prefix,
    'retired_link_id', retired_id
  );
end;
$$;

create or replace function public.disable_club_join_link(p_link_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_join_links;
begin
  select link.* into target
  from public.club_join_links as link
  where link.id = p_link_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'club_join_link_not_found';
  end if;
  if actor_id is null or not public.current_has_club_permission(target.club_id, 'invitation.manage') then
    raise exception using errcode = '42501', message = 'invitation_manage_required';
  end if;

  -- Turning off an already-off link is not an error: the officer's intent is
  -- "make sure this is closed", and failing that request would be confusing.
  if target.link_status = 'disabled' then
    return jsonb_build_object('link_id', target.id, 'link_status', 'disabled', 'already_disabled', true);
  end if;

  update public.club_join_links
  set link_status = 'disabled',
      disabled_at = now(),
      disabled_by_app_account_id = actor_id,
      updated_at = now()
  where id = target.id;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (target.club_id, actor_id, 'club_join_link.disabled', 'club_join_link', target.id,
    jsonb_build_object('token_prefix', target.token_prefix, 'join_count', target.join_count));

  return jsonb_build_object('link_id', target.id, 'link_status', 'disabled', 'already_disabled', false);
end;
$$;

create or replace function public.get_club_join_links_admin(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if public.current_app_account_id() is null
     or not public.current_has_club_permission(p_club_id, 'invitation.manage') then
    raise exception using errcode = '42501', message = 'invitation_manage_required';
  end if;

  -- The stored secret is never projected, and the inner select names its
  -- columns so it cannot even be read into this function. The prefix is enough
  -- for an officer to tell two links apart in the audit log.
  return jsonb_build_object(
    'feature_enabled', public.club_join_link_enabled(),
    'links', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', link.id,
        'token_prefix', link.token_prefix,
        'link_status', link.link_status,
        'join_count', link.join_count,
        'created_at', link.created_at,
        'disabled_at', link.disabled_at
      ) order by link.created_at desc)
      from (
        select id, token_prefix, link_status, join_count, created_at, disabled_at
        from public.club_join_links
        where club_id = p_club_id
        order by created_at desc
        limit 20
      ) as link
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.preview_club_join_link(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  target public.club_join_links;
  club_row public.clubs;
begin
  -- Answers only "is this token usable, and for which club". A wrong or
  -- retired token gets the same shape as a right one, minus the club, so the
  -- endpoint cannot be used to enumerate clubs.
  if not public.club_join_link_enabled() then
    return jsonb_build_object('usable', false, 'reason', 'unavailable');
  end if;

  select link.* into target
  from public.club_join_links as link
  where link.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');

  if not found or target.link_status <> 'active' then
    return jsonb_build_object('usable', false, 'reason', 'unavailable');
  end if;

  select club.* into club_row from public.clubs as club where club.id = target.club_id;
  if not found or club_row.club_status <> 'active' then
    return jsonb_build_object('usable', false, 'reason', 'unavailable');
  end if;

  return jsonb_build_object(
    'usable', true,
    'club_id', club_row.id,
    'club_name', club_row.club_name
  );
end;
$$;

create or replace function public.redeem_club_join_link_trusted(
  p_token text,
  p_auth_user_id uuid,
  p_provider_subject text,
  p_display_name text,
  p_picture_url text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  target public.club_join_links;
  resolved_name text := btrim(coalesce(p_display_name, ''));
  new_person public.people;
  new_account public.app_accounts;
  new_membership public.club_memberships;
  existing_identity public.line_identities;
  existing_membership_id uuid;
begin
  if p_auth_user_id is null
     or btrim(coalesce(p_provider_subject, '')) !~ '^U[A-Za-z0-9_-]{8,254}$' then
    raise exception using errcode = '22023', message = 'trusted_line_identity_input_required';
  end if;
  if not public.club_join_link_enabled() then
    raise exception using errcode = '22023', message = 'club_join_link_disabled';
  end if;

  select link.* into target
  from public.club_join_links as link
  where link.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update;

  if not found or target.link_status <> 'active' then
    raise exception using errcode = '22023', message = 'club_join_link_unavailable';
  end if;
  if not exists (
    select 1 from public.clubs where id = target.club_id and club_status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'club_not_active';
  end if;

  -- A LINE display name is whatever the person set; it is not an identity
  -- claim. It only seeds the name field, which the member can correct later.
  if resolved_name = '' then
    resolved_name = '未命名社友';
  end if;

  -- Re-opening the link with a LINE account that already redeemed it must sign
  -- that person in, not mint a second person. The membership unique index would
  -- reject the duplicate anyway; this returns the useful answer instead of an error.
  select identity.* into existing_identity
  from public.line_identities as identity
  where identity.provider_subject = btrim(p_provider_subject)
    and identity.identity_status = 'active'
  limit 1;

  if found then
    select membership.id into existing_membership_id
    from public.club_memberships as membership
    join public.app_accounts as account on account.person_id = membership.person_id
    where account.id = existing_identity.app_account_id
      and membership.club_id = target.club_id
      and membership.membership_status = 'active';

    return jsonb_build_object(
      'status', 'already_member',
      'club_id', target.club_id,
      'app_account_id', existing_identity.app_account_id,
      'membership_id', existing_membership_id
    );
  end if;

  insert into public.people (canonical_name)
  values (resolved_name)
  returning * into new_person;

  insert into public.app_accounts (auth_user_id, person_id, login_email, account_display_name)
  values (
    p_auth_user_id,
    new_person.id,
    coalesce(nullif(btrim(coalesce(p_email, '')), ''), btrim(p_provider_subject) || '@line.local'),
    resolved_name
  ) returning * into new_account;

  insert into public.club_memberships (club_id, person_id, created_by_app_account_id)
  values (target.club_id, new_person.id, new_account.id)
  returning * into new_membership;

  insert into public.line_identities (
    person_id, app_account_id, provider_subject, display_name, picture_url, email, last_login_at
  ) values (
    new_person.id, new_account.id, btrim(p_provider_subject),
    p_display_name, p_picture_url, p_email, now()
  );

  update public.club_join_links
  set join_count = join_count + 1, updated_at = now()
  where id = target.id;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (target.club_id, new_account.id, 'club_join_link.redeemed', 'club_membership', new_membership.id,
    jsonb_build_object('token_prefix', target.token_prefix, 'join_link_id', target.id));

  return jsonb_build_object(
    'status', 'joined',
    'club_id', target.club_id,
    'person_id', new_person.id,
    'app_account_id', new_account.id,
    'membership_id', new_membership.id
  );
end;
$$;

revoke all on function public.club_join_link_enabled() from public, anon;
grant execute on function public.club_join_link_enabled() to authenticated, service_role;

revoke all on function public.create_club_join_link(uuid) from public, anon;
grant execute on function public.create_club_join_link(uuid) to authenticated;

revoke all on function public.disable_club_join_link(uuid) from public, anon;
grant execute on function public.disable_club_join_link(uuid) to authenticated;

revoke all on function public.get_club_join_links_admin(uuid) from public, anon;
grant execute on function public.get_club_join_links_admin(uuid) to authenticated;

-- The landing page runs before anyone is signed in, so anon needs the preview.
-- It takes a 32-byte token and returns only a club name, never a list.
revoke all on function public.preview_club_join_link(text) from public;
grant execute on function public.preview_club_join_link(text) to anon, authenticated;

-- Redemption creates people, accounts and memberships, so it stays on the
-- server: no browser session can reach it.
revoke all on function public.redeem_club_join_link_trusted(text, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.redeem_club_join_link_trusted(text, uuid, text, text, text, text)
  to service_role;

-- The protected flag RPC keeps its own list of valid keys. A key missing from
-- it cannot be switched on or rolled back through the audited CLI at all, so it
-- is restated here with the new key added.
create or replace function public.set_platform_feature_flag(
  p_feature_key text,
  p_enabled boolean,
  p_enabled_environments text[],
  p_rollout_percentage integer
)
returns table (
  feature_key text,
  enabled boolean,
  enabled_environments text[],
  rollout_percentage smallint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not public.current_has_platform_role(array['superadmin', 'platform_admin']) then
    raise exception using errcode = '42501', message = 'platform_feature_flag_admin_required';
  end if;
  if p_feature_key not in (
    'role_context_v2', 'role_shells_v2', 'member_home_v2', 'checkin_qr_v2', 'checkin_gps_v2',
    'attendance_ui_v2', 'announcements_v09', 'blessing_iou_v1',
    'blessing_iou_collections_v1', 'blessing_iou_reporting_v1',
    'birthday_wishes_v1', 'birthday_wishes_v2', 'birthday_wishes_collection_v1',
    'message_board_v1', 'archive_handover_v1',
    'line_oa_auto_pairing_v1', 'line_oa_event_push_v1', 'line_oa_onboarding_v1',
    'line_oa_flex_templates_v1', 'club_join_link_v1'
  ) or p_enabled is null or p_enabled_environments is null
    or p_rollout_percentage not between 0 and 100
    or not (p_enabled_environments <@ array['local', 'staging', 'production']::text[]) then
    raise exception using errcode = '22023', message = 'invalid_platform_feature_flag_input';
  end if;

  return query
  insert into public.platform_feature_flags as flag (
    feature_key, enabled, enabled_environments, rollout_percentage
  ) values (
    p_feature_key, p_enabled, p_enabled_environments, p_rollout_percentage::smallint
  )
  on conflict on constraint platform_feature_flags_pkey do update
    set enabled = excluded.enabled,
        enabled_environments = excluded.enabled_environments,
        rollout_percentage = excluded.rollout_percentage
  returning flag.feature_key, flag.enabled, flag.enabled_environments, flag.rollout_percentage, flag.updated_at;
end;
$$;

-- The OAuth state row records which flow started the round trip. A join-link
-- round trip carries a token but no signed-in user, so it is shaped like the
-- invitation flow and reuses invitation_token_hash rather than adding a second
-- token column that would have to be kept in step with it.
alter table public.line_oauth_states
  drop constraint line_oauth_states_flow_kind_check;
alter table public.line_oauth_states
  add constraint line_oauth_states_flow_kind_check
  check (
    (flow_kind = 'login' and invitation_token_hash is null and initiating_auth_user_id is null)
    or (flow_kind = 'invitation' and invitation_token_hash is not null and initiating_auth_user_id is null)
    or (flow_kind = 'join_link' and invitation_token_hash is not null and initiating_auth_user_id is null)
    or (flow_kind = 'bind' and invitation_token_hash is null and initiating_auth_user_id is not null)
  );

-- The telemetry payload validator carries the same key list. A key missing
-- from it makes every flag-evaluation failure report for this feature
-- invalid, so the one signal that would show the flag misbehaving is lost.
create or replace function public.platform_product_telemetry_payload_is_valid(
  p_event_name text,
  p_payload jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
begin
  case p_event_name
    when 'member_context_resolve_success' then
      return public.jsonb_has_exact_keys(p_payload, array['duration_ms', 'club_count', 'mode_count'])
        and public.jsonb_bounded_integer(p_payload, 'duration_ms', 120000)
        and public.jsonb_bounded_integer(p_payload, 'club_count', 1000)
        and public.jsonb_bounded_integer(p_payload, 'mode_count', 3);
    when 'member_context_resolve_failure', 'member_home_projection_failure' then
      return public.jsonb_has_exact_keys(p_payload, array['duration_ms', 'reason'])
        and public.jsonb_bounded_integer(p_payload, 'duration_ms', 120000)
        and coalesce(p_payload ->> 'reason', '') in (
          'database_unavailable', 'invalid_projection', 'authorization_denied', 'invalid_configuration', 'unexpected'
        );
    when 'member_home_projection_duration' then
      return public.jsonb_has_exact_keys(p_payload, array['duration_ms', 'database_round_trips'])
        and public.jsonb_bounded_integer(p_payload, 'duration_ms', 120000)
        and public.jsonb_bounded_integer(p_payload, 'database_round_trips', 10);
    when 'checkin_attempt' then
      return public.jsonb_has_exact_keys(p_payload, array['method'])
        and coalesce(p_payload ->> 'method', '') in ('qr', 'gps', 'manual');
    when 'checkin_success' then
      return public.jsonb_has_exact_keys(p_payload, array['method', 'duration_ms', 'result'])
        and coalesce(p_payload ->> 'method', '') in ('qr', 'gps', 'manual')
        and public.jsonb_bounded_integer(p_payload, 'duration_ms', 120000)
        and coalesce(p_payload ->> 'result', '') in ('created', 'duplicate', 'current_qr', 'grace_qr');
    when 'checkin_failure' then
      return public.jsonb_has_exact_keys(p_payload, array['method', 'duration_ms', 'reason'])
        and coalesce(p_payload ->> 'method', '') in ('qr', 'gps', 'manual')
        and public.jsonb_bounded_integer(p_payload, 'duration_ms', 120000)
        and coalesce(p_payload ->> 'reason', '') in (
          'expired', 'previous_code_grace_expired', 'session_closed', 'not_started', 'not_eligible', 'duplicate',
          'network_timeout', 'gps_denied', 'gps_unavailable', 'gps_out_of_range', 'gps_low_quality', 'unexpected'
        );
    when 'checkin_pending_confirmation' then
      return public.jsonb_has_exact_keys(p_payload, array['method', 'reason'])
        and coalesce(p_payload ->> 'method', '') in ('qr', 'gps', 'manual')
        and p_payload ->> 'reason' = 'network_timeout';
    when 'feature_flag_evaluation_failure' then
      return public.jsonb_has_exact_keys(p_payload, array['feature_key', 'reason'])
        and coalesce(p_payload ->> 'feature_key', '') in (
          'role_context_v2', 'role_shells_v2', 'member_home_v2', 'checkin_qr_v2', 'checkin_gps_v2',
          'attendance_ui_v2', 'announcements_v09', 'blessing_iou_v1', 'blessing_iou_collections_v1',
          'blessing_iou_reporting_v1', 'birthday_wishes_v1', 'birthday_wishes_v2',
          'birthday_wishes_collection_v1', 'message_board_v1', 'archive_handover_v1',
          'line_oa_auto_pairing_v1', 'line_oa_event_push_v1', 'line_oa_onboarding_v1',
          'line_oa_flex_templates_v1', 'club_join_link_v1'
        )
        and coalesce(p_payload ->> 'reason', '') in (
          'missing_configuration', 'invalid_configuration', 'evaluation_error'
        );
    else
      return false;
  end case;
end;
$$;

commit;
