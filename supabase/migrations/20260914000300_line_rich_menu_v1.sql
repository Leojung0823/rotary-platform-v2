begin;

-- Reserve an independent rollout key for the per-club LINE Rich Menu. The
-- absence of a row keeps the feature closed until a platform administrator
-- explicitly enables it after the club's OA credentials are ready.
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
    'line_oa_flex_templates_v1', 'club_join_link_v1', 'line_rich_menu_v1'
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
    'line_oa_flex_templates_v1', 'club_join_link_v1', 'line_rich_menu_v1'
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
    'line_oa_auto_pairing_v1', 'line_oa_event_push_v1', 'line_oa_onboarding_v1',
    'line_oa_flex_templates_v1', 'club_join_link_v1', 'line_rich_menu_v1'
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
          'line_oa_auto_pairing_v1', 'line_oa_event_push_v1', 'line_oa_onboarding_v1',
          'line_oa_flex_templates_v1', 'club_join_link_v1', 'line_rich_menu_v1'
        )
        and coalesce(p_payload ->> 'reason', '') in (
          'missing_configuration', 'invalid_configuration', 'evaluation_error'
        );
    else
      return false;
  end case;
end;
$$;

-- Browser callers still write through an RPC. This only stores the provider's
-- public rich-menu id after the server has created and published the menu.
create or replace function public.set_line_oa_rich_menu(
  p_club_id uuid,
  p_rich_menu_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  account_id uuid;
  previous_rich_menu_id text;
  normalized_rich_menu_id text := nullif(btrim(p_rich_menu_id), '');
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'oa.manage') then
    raise exception using errcode = '42501', message = 'oa_manage_required';
  end if;

  if normalized_rich_menu_id is not null
    and normalized_rich_menu_id !~ '^richmenu-[A-Za-z0-9_-]{20,100}$' then
    raise exception using errcode = '22023', message = 'invalid_rich_menu_id';
  end if;

  select account.id, account.rich_menu_id
    into account_id, previous_rich_menu_id
  from public.line_oa_accounts as account
  where account.club_id = p_club_id
    and account.account_status <> 'disabled'
  for update;

  if account_id is null then
    raise exception using errcode = 'P0002', message = 'line_oa_account_not_found';
  end if;

  update public.line_oa_accounts
  set rich_menu_id = normalized_rich_menu_id,
      updated_at = now()
  where id = account_id;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'line_oa.rich_menu_configured', 'line_oa_account', account_id,
    jsonb_build_object(
      'previous_rich_menu_id', previous_rich_menu_id,
      'rich_menu_id', normalized_rich_menu_id
    )
  );

  return jsonb_build_object(
    'account_id', account_id,
    'rich_menu_id', normalized_rich_menu_id
  );
end;
$$;

comment on function public.set_line_oa_rich_menu(uuid, text) is
  'Stores a per-club LINE Messaging API rich menu id after the trusted server publishes it.';

-- Keep the database boundary fail-closed as well as the server action. A
-- missing row is disabled; only an explicit enabled row grants browser RPC
-- execution, and the RPC still checks oa.manage and the target club.
create or replace function public.sync_line_rich_menu_execution_privileges(
  p_feature_key text,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_feature_key <> 'line_rich_menu_v1' then
    return;
  end if;

  if coalesce(p_enabled, false) then
    grant execute on function public.set_line_oa_rich_menu(uuid, text) to authenticated;
  else
    revoke execute on function public.set_line_oa_rich_menu(uuid, text) from authenticated;
  end if;
end;
$$;

create or replace function public.sync_line_rich_menu_execution_privileges_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_line_rich_menu_execution_privileges(old.feature_key, false);
    return old;
  end if;

  perform public.sync_line_rich_menu_execution_privileges(new.feature_key, new.enabled);
  return new;
end;
$$;

drop trigger if exists platform_feature_flags_sync_line_rich_menu_execution_privileges
  on public.platform_feature_flags;

create trigger platform_feature_flags_sync_line_rich_menu_execution_privileges
after insert or update or delete on public.platform_feature_flags
for each row execute function public.sync_line_rich_menu_execution_privileges_trigger();

revoke all on function public.set_line_oa_rich_menu(uuid, text)
  from public, anon, authenticated;

-- A fresh deployment must start with this RPC closed, even if an earlier
-- migration granted authenticated execution to the function name.
select public.sync_line_rich_menu_execution_privileges('line_rich_menu_v1', false);

do $$
declare
  feature_flag record;
begin
  for feature_flag in
    select feature_key, enabled
    from public.platform_feature_flags
    where feature_key = 'line_rich_menu_v1'
  loop
    perform public.sync_line_rich_menu_execution_privileges(
      feature_flag.feature_key,
      feature_flag.enabled
    );
  end loop;
end;
$$;

revoke all on function public.sync_line_rich_menu_execution_privileges(text, boolean)
  from public, anon, authenticated;
revoke all on function public.sync_line_rich_menu_execution_privileges_trigger()
  from public, anon, authenticated;

commit;
