-- Reserve the two LINE OA push feature keys up front so two parallel branches
-- never both redeclare this constraint. Redeclaring it drops every key the other
-- branch added, and each branch's contract test only reads the migration it
-- points at, so the loss would not show up as a failure.
--
-- Both keys stay absent from platform_feature_flags, which is what keeps them
-- off: a missing row is evaluated as disabled.

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
    'line_oa_event_push_v1'
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
    'line_oa_event_push_v1'
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
    'line_oa_auto_pairing_v1', 'line_oa_event_push_v1'
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

-- The telemetry validator carries its own copy of the feature-key list, and the
-- rollout contract test reads it out of whichever migration it points at, so it
-- has to be redeclared here alongside the constraints.

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
          'line_oa_auto_pairing_v1', 'line_oa_event_push_v1'
        )
        and coalesce(p_payload ->> 'reason', '') in (
          'missing_configuration', 'invalid_configuration', 'evaluation_error'
        );
    else
      return public.platform_product_telemetry_payload_is_valid(p_event_name, p_payload);
  end case;
end;
$$;
