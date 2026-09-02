begin;

-- LINE OA onboarding is independent from follow-event pairing and Account
-- Link. Deploying this migration only reserves the member-facing rollout key;
-- a missing flag row keeps every new entry point closed.
alter table public.platform_feature_flags
  drop constraint platform_feature_flags_feature_key_check;
alter table public.platform_feature_flags
  add constraint platform_feature_flags_feature_key_check check (feature_key in (
    'role_context_v2',
    'role_shells_v2',
    'member_home_v2',
    'checkin_qr_v2',
    'checkin_gps_v2',
    'attendance_ui_v2',
    'announcements_v09',
    'blessing_iou_v1',
    'blessing_iou_collections_v1',
    'blessing_iou_reporting_v1',
    'birthday_wishes_v1',
    'birthday_wishes_v2',
    'birthday_wishes_collection_v1',
    'message_board_v1',
    'archive_handover_v1',
    'line_oa_auto_pairing_v1',
    'line_oa_event_push_v1',
    'line_oa_onboarding_v1'
  ));

alter table public.platform_feature_flag_audit
  drop constraint platform_feature_flag_audit_feature_key_check;
alter table public.platform_feature_flag_audit
  add constraint platform_feature_flag_audit_feature_key_check check (feature_key in (
    'role_context_v2',
    'role_shells_v2',
    'member_home_v2',
    'checkin_qr_v2',
    'checkin_gps_v2',
    'attendance_ui_v2',
    'announcements_v09',
    'blessing_iou_v1',
    'blessing_iou_collections_v1',
    'blessing_iou_reporting_v1',
    'birthday_wishes_v1',
    'birthday_wishes_v2',
    'birthday_wishes_collection_v1',
    'message_board_v1',
    'archive_handover_v1',
    'line_oa_auto_pairing_v1',
    'line_oa_event_push_v1',
    'line_oa_onboarding_v1'
  ));

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
    'line_oa_auto_pairing_v1', 'line_oa_event_push_v1', 'line_oa_onboarding_v1'
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
          'line_oa_auto_pairing_v1', 'line_oa_event_push_v1', 'line_oa_onboarding_v1'
        )
        and coalesce(p_payload ->> 'reason', '') in (
          'missing_configuration', 'invalid_configuration', 'evaluation_error'
        );
    else
      return false;
  end case;
end;
$$;

-- The join button is shown only after a trusted bot-info check records the
-- exact Basic ID and bot user ID. account_status alone is editable by a club
-- manager and therefore is not proof that a join link points to the intended
-- physical OA.
alter table public.line_oa_accounts
  add column verified_basic_id text,
  add column verified_bot_user_id text,
  add column identity_verified_at timestamptz,
  add constraint line_oa_accounts_identity_verification_complete check (
    (verified_basic_id is null and verified_bot_user_id is null and identity_verified_at is null)
    or
    (verified_basic_id is not null and verified_bot_user_id is not null
      and identity_verified_at is not null and verified_basic_id = basic_id)
  );

create unique index line_oa_accounts_one_active_verified_bot
  on public.line_oa_accounts (verified_bot_user_id)
  where verified_bot_user_id is not null and account_status <> 'disabled';

create or replace function public.clear_line_oa_identity_verification()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.basic_id is distinct from new.basic_id
    or old.channel_id is distinct from new.channel_id then
    new.verified_basic_id := null;
    new.verified_bot_user_id := null;
    new.identity_verified_at := null;
  end if;
  return new;
end;
$$;

create trigger line_oa_accounts_clear_identity_verification
before update of basic_id, channel_id on public.line_oa_accounts
for each row execute function public.clear_line_oa_identity_verification();

create table public.line_oa_onboarding_preferences (
  app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  club_id uuid not null references public.clubs(id) on delete restrict,
  line_oa_account_id uuid not null references public.line_oa_accounts(id) on delete restrict,
  dismissal_count smallint not null default 0 check (dismissal_count between 0 and 3),
  last_dismissed_at timestamptz,
  next_prompt_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (app_account_id, club_id),
  check (dismissal_count = 0 or last_dismissed_at is not null),
  check (dismissal_count < 3 or next_prompt_after is null)
);

comment on table public.line_oa_onboarding_preferences is
  'Per-account, per-club UI reminder throttling. It is not authentication, membership, friendship or pairing evidence.';

create trigger line_oa_onboarding_preferences_set_updated_at
before update on public.line_oa_onboarding_preferences
for each row execute function public.set_updated_at();

alter table public.line_oa_onboarding_preferences enable row level security;
revoke all on table public.line_oa_onboarding_preferences from public, anon, authenticated;
grant select, insert, update on table public.line_oa_onboarding_preferences to service_role;

create or replace function public.record_line_oa_account_identity_verification(
  p_line_oa_account_id uuid,
  p_basic_id text,
  p_bot_user_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  normalized_basic_id text := btrim(coalesce(p_basic_id, ''));
  normalized_bot_user_id text := btrim(coalesce(p_bot_user_id, ''));
  target public.line_oa_accounts;
begin
  if normalized_basic_id = '' or length(normalized_basic_id) > 100
    or normalized_bot_user_id = '' or length(normalized_bot_user_id) > 255 then
    raise exception using errcode = '22023', message = 'invalid_line_oa_identity_verification';
  end if;

  select account.* into target
  from public.line_oa_accounts as account
  where account.id = p_line_oa_account_id
    and account.account_status <> 'disabled'
  for update;

  if not found or target.basic_id is distinct from normalized_basic_id then
    raise exception using errcode = 'P0002', message = 'line_oa_identity_not_found';
  end if;

  update public.line_oa_accounts
  set verified_basic_id = normalized_basic_id,
      verified_bot_user_id = normalized_bot_user_id,
      identity_verified_at = now(),
      updated_at = now()
  where id = target.id;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id
  ) values (
    target.club_id, null, 'line_oa.identity_verified', 'line_oa_account', target.id
  );

  return true;
end;
$$;

create or replace function public.get_my_line_oa_onboarding_status(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_person_id uuid;
  selected_club public.clubs;
  selected_oa public.line_oa_accounts;
  selected_follower public.line_oa_followers;
  selected_preference public.line_oa_onboarding_preferences;
  friend_state text := 'unknown';
  pair_state text := 'unpaired';
  available boolean := false;
  has_conflict boolean := false;
begin
  if not exists (
    select 1
    from public.platform_feature_flags as flag
    where flag.feature_key = 'line_oa_onboarding_v1'
      and flag.enabled = true
      and flag.rollout_percentage = 100
      and cardinality(flag.enabled_environments) > 0
  ) then
    raise exception using errcode = '42501', message = 'line_oa_onboarding_disabled';
  end if;

  select account.person_id into actor_person_id
  from public.app_accounts as account
  where account.id = actor_id
    and account.account_status = 'active';

  if actor_person_id is null or p_club_id is null or not exists (
    select 1
    from public.club_memberships as membership
    where membership.club_id = p_club_id
      and membership.person_id = actor_person_id
      and membership.membership_status = 'active'
      and (membership.joined_on is null or membership.joined_on <= current_date)
      and (membership.ended_on is null or membership.ended_on >= current_date)
  ) then
    raise exception using errcode = '42501', message = 'active_club_membership_required';
  end if;

  select club.* into selected_club
  from public.clubs as club
  where club.id = p_club_id
    and club.club_status = 'active';

  if not found then
    raise exception using errcode = 'P0002', message = 'active_club_not_found';
  end if;

  select account.* into selected_oa
  from public.line_oa_accounts as account
  where account.club_id = p_club_id
    and account.account_status = 'active'
  limit 1;

  available := found
    and selected_oa.basic_id is not null
    and selected_oa.verified_basic_id = selected_oa.basic_id
    and selected_oa.verified_bot_user_id is not null
    and selected_oa.identity_verified_at is not null;

  if available then
    select follower.* into selected_follower
    from public.line_oa_followers as follower
    where follower.line_oa_account_id = selected_oa.id
      and follower.club_id = p_club_id
      and (follower.app_account_id = actor_id or follower.person_id = actor_person_id)
    order by
      (follower.app_account_id = actor_id and follower.person_id = actor_person_id) desc,
      (follower.follower_status = 'following') desc,
      follower.updated_at desc
    limit 1;

    has_conflict := exists (
      select 1
      from public.line_oa_followers as follower
      where follower.line_oa_account_id = selected_oa.id
        and follower.club_id = p_club_id
        and (
          (follower.app_account_id = actor_id and follower.person_id is distinct from actor_person_id)
          or (follower.person_id = actor_person_id and follower.app_account_id is distinct from actor_id)
        )
    );

    if selected_follower.id is not null
      and selected_follower.follower_status = 'following' then
      friend_state := 'following';
    elsif selected_follower.id is not null
      and selected_follower.follower_status in ('blocked', 'unpaired') then
      friend_state := 'unfollowed';
    end if;

    if has_conflict then
      pair_state := 'conflict';
    elsif selected_follower.id is not null
      and selected_follower.follower_status = 'following'
      and selected_follower.person_id = actor_person_id
      and selected_follower.app_account_id = actor_id then
      pair_state := 'paired';
    end if;

    select preference.* into selected_preference
    from public.line_oa_onboarding_preferences as preference
    where preference.app_account_id = actor_id
      and preference.club_id = p_club_id
      and preference.line_oa_account_id = selected_oa.id;
  end if;

  return jsonb_build_object(
    'club_id', selected_club.id,
    'club_name', selected_club.club_name,
    'oa_available', available,
    'join_url', case when available then
      'https://line.me/R/ti/p/' || replace(selected_oa.verified_basic_id, '@', '%40')
      else null end,
    'friend_status', friend_state,
    'pair_status', pair_state,
    'line_login_bound', exists (
      select 1 from public.line_identities as identity
      where identity.app_account_id = actor_id
        and identity.person_id = actor_person_id
        and identity.identity_status = 'active'
    ),
    'dismissal_count', coalesce(selected_preference.dismissal_count, 0),
    'next_prompt_after', selected_preference.next_prompt_after
  );
end;
$$;

create or replace function public.dismiss_my_line_oa_onboarding(p_club_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_person_id uuid;
  selected_oa public.line_oa_accounts;
  existing_preference public.line_oa_onboarding_preferences;
  next_count smallint;
  next_prompt timestamptz;
begin
  if not exists (
    select 1
    from public.platform_feature_flags as flag
    where flag.feature_key = 'line_oa_onboarding_v1'
      and flag.enabled = true
      and flag.rollout_percentage = 100
      and cardinality(flag.enabled_environments) > 0
  ) then
    raise exception using errcode = '42501', message = 'line_oa_onboarding_disabled';
  end if;

  select account.person_id into actor_person_id
  from public.app_accounts as account
  where account.id = actor_id
    and account.account_status = 'active';

  if actor_person_id is null or not exists (
    select 1
    from public.club_memberships as membership
    where membership.club_id = p_club_id
      and membership.person_id = actor_person_id
      and membership.membership_status = 'active'
      and (membership.joined_on is null or membership.joined_on <= current_date)
      and (membership.ended_on is null or membership.ended_on >= current_date)
  ) then
    raise exception using errcode = '42501', message = 'active_club_membership_required';
  end if;

  select account.* into selected_oa
  from public.line_oa_accounts as account
  where account.club_id = p_club_id
    and account.account_status = 'active'
    and account.basic_id is not null
    and account.verified_basic_id = account.basic_id
    and account.verified_bot_user_id is not null
    and account.identity_verified_at is not null
  limit 1;

  if not found then
    raise exception using errcode = 'P0002', message = 'verified_line_oa_not_found';
  end if;

  select preference.* into existing_preference
  from public.line_oa_onboarding_preferences as preference
  where preference.app_account_id = actor_id
    and preference.club_id = p_club_id
  for update;

  next_count := case
    when existing_preference.line_oa_account_id = selected_oa.id
      then least(existing_preference.dismissal_count + 1, 3)::smallint
    else 1::smallint
  end;
  next_prompt := case next_count
    when 1 then now() + interval '7 days'
    when 2 then now() + interval '30 days'
    else null
  end;

  insert into public.line_oa_onboarding_preferences (
    app_account_id, club_id, line_oa_account_id, dismissal_count,
    last_dismissed_at, next_prompt_after
  ) values (
    actor_id, p_club_id, selected_oa.id, next_count, now(), next_prompt
  )
  on conflict (app_account_id, club_id) do update
    set line_oa_account_id = excluded.line_oa_account_id,
        dismissal_count = excluded.dismissal_count,
        last_dismissed_at = excluded.last_dismissed_at,
        next_prompt_after = excluded.next_prompt_after;

  return jsonb_build_object(
    'dismissal_count', next_count,
    'next_prompt_after', next_prompt
  );
end;
$$;

comment on function public.record_line_oa_account_identity_verification(uuid, text, text) is
  'Service-role-only final write after GET /v2/bot/info has verified the active OA Basic ID and bot user ID.';
comment on function public.get_my_line_oa_onboarding_status(uuid) is
  'Caller-only LINE OA onboarding projection for one active club membership. Never returns LINE user IDs or channel credentials.';
comment on function public.dismiss_my_line_oa_onboarding(uuid) is
  'Caller-only cross-device reminder throttling. It does not change friendship, pairing, login or membership state.';

revoke all on function public.clear_line_oa_identity_verification() from public, anon, authenticated;
revoke all on function public.record_line_oa_account_identity_verification(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.record_line_oa_account_identity_verification(uuid, text, text)
  to service_role;
revoke all on function public.get_my_line_oa_onboarding_status(uuid) from public, anon;
grant execute on function public.get_my_line_oa_onboarding_status(uuid) to authenticated;
revoke all on function public.dismiss_my_line_oa_onboarding(uuid) from public, anon;
grant execute on function public.dismiss_my_line_oa_onboarding(uuid) to authenticated;

commit;
