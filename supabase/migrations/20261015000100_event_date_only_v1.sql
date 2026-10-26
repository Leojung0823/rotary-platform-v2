begin;

-- A date-only event is stored as a Taipei-local half-open day. The companion
-- flag is the source of truth: consumers must not render these boundary
-- timestamps as if they were the event's actual start/end times.
alter table public.club_events
  add column time_unspecified boolean not null default false;

comment on column public.club_events.time_unspecified is
  'True when only the Taipei-local calendar date is known; starts_at/ends_at bound that day for existing registration rules.';

-- Older clients still use update_club_event. Preserve their ability to edit
-- unrelated fields, but do not let them turn the hidden day boundaries into
-- invented clock times while the date-only bit remains true.
alter table public.club_events
  add constraint club_events_time_unspecified_valid_boundaries_check
  check (
    not time_unspecified
    or (
      registration_deadline is null
      and (starts_at at time zone 'Asia/Taipei')::time = time '00:00'
      and (ends_at at time zone 'Asia/Taipei')::time = time '00:00'
      and (ends_at at time zone 'Asia/Taipei')::date = (starts_at at time zone 'Asia/Taipei')::date + 1
    )
  );

-- This feature is dark by default and may only be enabled explicitly.
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
    'line_oa_flex_templates_v1', 'club_join_link_v1', 'line_rich_menu_v1',
    'dues_finance_v1', 'joy_wall_v1', 'event_date_only_v1'
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
    'line_oa_flex_templates_v1', 'club_join_link_v1', 'line_rich_menu_v1',
    'dues_finance_v1', 'joy_wall_v1', 'event_date_only_v1'
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
    'line_oa_flex_templates_v1', 'club_join_link_v1', 'line_rich_menu_v1',
    'dues_finance_v1', 'joy_wall_v1', 'event_date_only_v1'
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
          'line_oa_flex_templates_v1', 'club_join_link_v1', 'line_rich_menu_v1',
          'dues_finance_v1', 'joy_wall_v1', 'event_date_only_v1'
        )
        and coalesce(p_payload ->> 'reason', '') in (
          'missing_configuration', 'invalid_configuration', 'evaluation_error'
        );
    else
      return false;
  end case;
end;
$$;

-- Install the new RPCs by carrying forward the current, permission-checked
-- implementations. This avoids reimplementing event policy in a second place.
do $$
declare
  definition text;
  original text;
  change record;
  occurrences integer;
begin
  original := pg_get_functiondef(
    'public.create_club_event(uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,boolean,numeric,numeric)'::regprocedure
  );
  definition := regexp_replace(
    original,
    'p_venue_longitude numeric DEFAULT NULL::numeric\)',
    'p_venue_longitude numeric DEFAULT NULL::numeric,' || E'\n' || '  p_time_unspecified boolean DEFAULT false' || E'\n' || ')'
  );
  if definition = original then raise exception 'Could not extend create_club_event signature'; end if;
  definition := replace(definition, 'public.create_club_event(', 'public.create_club_event_with_time_mode(');

  for change in
    select * from (values
      ($old$venue_latitude, venue_longitude,
    created_by_app_account_id$old$, $new$venue_latitude, venue_longitude, time_unspecified,
    created_by_app_account_id$new$),
      ($old$p_venue_latitude, p_venue_longitude, actor_id, actor_id$old$, $new$p_venue_latitude, p_venue_longitude, coalesce(p_time_unspecified, false), actor_id, actor_id$new$),
      ($old$      'starts_at', created_event.starts_at,
      'venue_location_set'$old$, $new$      'starts_at', created_event.starts_at,
      'time_unspecified', created_event.time_unspecified,
      'venue_location_set'$new$),
      ($old$  insert into public.club_events ($old$, $new$  if coalesce(p_time_unspecified, false) and (
       p_registration_deadline is not null
       or (p_starts_at at time zone 'Asia/Taipei')::time <> time '00:00'
       or (p_ends_at at time zone 'Asia/Taipei')::time <> time '00:00'
       or (p_ends_at at time zone 'Asia/Taipei')::date <> (p_starts_at at time zone 'Asia/Taipei')::date + 1
     ) then
    raise exception using errcode = '22023', message = 'invalid_event_time_mode';
  end if;

  insert into public.club_events ($new$)
    ) as replacements(needle, replacement)
  loop
    occurrences := (length(definition) - length(replace(definition, change.needle, ''))) / length(change.needle);
    if occurrences <> 1 then raise exception 'Expected one create_club_event source fragment, found %: %', occurrences, change.needle; end if;
    definition := replace(definition, change.needle, change.replacement);
  end loop;
  execute definition;
end;
$$;

do $$
declare
  definition text;
  original text;
  change record;
  occurrences integer;
begin
  original := pg_get_functiondef(
    'public.update_club_event(uuid,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,boolean,numeric,numeric,integer)'::regprocedure
  );
  definition := regexp_replace(
    original,
    'p_expected_version integer DEFAULT NULL::integer\)',
    'p_expected_version integer DEFAULT NULL::integer,' || E'\n' || '  p_time_unspecified boolean DEFAULT false' || E'\n' || ')'
  );
  if definition = original then raise exception 'Could not extend update_club_event signature'; end if;
  definition := replace(definition, 'public.update_club_event(', 'public.update_club_event_with_time_mode(');

  for change in
    select * from (values
      ($old$  select count(*)::integer into attending_count$old$, $new$  if coalesce(p_time_unspecified, false) and (
       p_registration_deadline is not null
       or (p_starts_at at time zone 'Asia/Taipei')::time <> time '00:00'
       or (p_ends_at at time zone 'Asia/Taipei')::time <> time '00:00'
       or (p_ends_at at time zone 'Asia/Taipei')::date <> (p_starts_at at time zone 'Asia/Taipei')::date + 1
     ) then
    raise exception using errcode = '22023', message = 'invalid_event_time_mode';
  end if;

  select count(*)::integer into attending_count$new$),
      ($old$    'venue_location_set', case when (target.venue_latitude is not null) is distinct from (p_venue_latitude is not null)
      then jsonb_build_object('from', target.venue_latitude is not null, 'to', p_venue_latitude is not null) end
  ));$old$, $new$    'venue_location_set', case when (target.venue_latitude is not null) is distinct from (p_venue_latitude is not null)
      then jsonb_build_object('from', target.venue_latitude is not null, 'to', p_venue_latitude is not null) end,
    'time_unspecified', case when target.time_unspecified is distinct from coalesce(p_time_unspecified, false)
      then jsonb_build_object('from', target.time_unspecified, 'to', coalesce(p_time_unspecified, false)) end
  ));$new$),
      ($old$      venue_longitude = p_venue_longitude,
      updated_by_app_account_id = actor_id,$old$, $new$      venue_longitude = p_venue_longitude,
      time_unspecified = coalesce(p_time_unspecified, false),
      updated_by_app_account_id = actor_id,$new$),
      ($old$  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'event.updated'$old$, $new$  if coalesce(p_time_unspecified, false) then
    update public.event_checkin_qr_credentials
    set revoked_at = now(), revoked_by_app_account_id = actor_id, revoke_reason = 'event_time_unspecified'
    where event_id = target.id and revoked_at is null;
    update public.event_checkin_sessions
    set session_status = 'closed', closed_at = now(), close_reason = 'event_time_unspecified', closed_by_app_account_id = actor_id
    where event_id = target.id and session_status = 'active';
  end if;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'event.updated'$new$),
      ($old$changed ? 'starts_at' or changed ? 'ends_at' or changed ? 'location'$old$, $new$changed ? 'starts_at' or changed ? 'ends_at' or changed ? 'location' or changed ? 'time_unspecified'$new$)
  ) as replacements(needle, replacement)
  loop
    occurrences := (length(definition) - length(replace(definition, change.needle, ''))) / length(change.needle);
    if occurrences <> 1 then raise exception 'Expected one update_club_event source fragment, found %: %', occurrences, change.needle; end if;
    definition := replace(definition, change.needle, change.replacement);
  end loop;
  execute definition;
end;
$$;

create or replace function public.sync_event_date_only_execution_privileges(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(p_enabled, false) then
    grant execute on function public.create_club_event_with_time_mode(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, integer, boolean, numeric, numeric, boolean) to authenticated;
    grant execute on function public.update_club_event_with_time_mode(uuid, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, integer, boolean, numeric, numeric, integer, boolean) to authenticated;
  else
    revoke execute on function public.create_club_event_with_time_mode(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, integer, boolean, numeric, numeric, boolean) from authenticated;
    revoke execute on function public.update_club_event_with_time_mode(uuid, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, integer, boolean, numeric, numeric, integer, boolean) from authenticated;
  end if;
end;
$$;

create or replace function public.sync_event_date_only_execution_privileges_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    if old.feature_key = 'event_date_only_v1' then
      perform public.sync_event_date_only_execution_privileges(false);
    end if;
    return old;
  end if;
  if new.feature_key = 'event_date_only_v1' then
    perform public.sync_event_date_only_execution_privileges(new.enabled);
  end if;
  if tg_op = 'UPDATE' and old.feature_key = 'event_date_only_v1'
     and new.feature_key <> 'event_date_only_v1' then
    perform public.sync_event_date_only_execution_privileges(false);
  end if;
  return new;
end;
$$;

create trigger platform_feature_flags_sync_event_date_only_privileges
after insert or update or delete on public.platform_feature_flags
for each row execute function public.sync_event_date_only_execution_privileges_trigger();

revoke all on function public.sync_event_date_only_execution_privileges(boolean) from public, anon, authenticated;
revoke all on function public.sync_event_date_only_execution_privileges_trigger() from public, anon, authenticated;
revoke all on function public.create_club_event_with_time_mode(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, integer, boolean, numeric, numeric, boolean) from public, anon, authenticated;
revoke all on function public.update_club_event_with_time_mode(uuid, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, integer, boolean, numeric, numeric, integer, boolean) from public, anon, authenticated;
select public.sync_event_date_only_execution_privileges(false);

-- The old RPC has no time-mode parameter. Preserve an already date-only
-- record when an older client edits it, but never let that RPC turn a timed
-- event into a date-only one.
do $$
declare
  definition text;
  old_event_update constant text := $replace$      venue_longitude = p_venue_longitude,
      updated_by_app_account_id = actor_id,$replace$;
  new_event_update constant text := $replace$      venue_longitude = p_venue_longitude,
      time_unspecified = target.time_unspecified,
      updated_by_app_account_id = actor_id,$replace$;
begin
  definition := pg_get_functiondef(
    'public.update_club_event(uuid,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,boolean,numeric,numeric,integer)'::regprocedure
  );
  if (length(definition) - length(replace(definition, old_event_update, ''))) / length(old_event_update) <> 1 then
    raise exception 'Legacy update_club_event compatibility fragment mismatch';
  end if;
  execute replace(definition, old_event_update, new_event_update);
end;
$$;

-- A date-only event must never acquire a QR session, even through a direct RPC.
create or replace function public.prevent_checkin_session_for_date_only_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.club_events as event
    where event.id = new.event_id and event.club_id = new.club_id and event.time_unspecified
  ) then
    raise exception using errcode = '22023', message = 'event_time_unspecified';
  end if;
  return new;
end;
$$;

create trigger event_checkin_sessions_require_event_time
before insert on public.event_checkin_sessions
for each row execute function public.prevent_checkin_session_for_date_only_event();

revoke all on function public.prevent_checkin_session_for_date_only_event() from public, anon, authenticated;

-- Carry the date-only bit through the existing, tenant-scoped projections.
do $$
declare
  definition text;
  change record;
  occurrences integer;
begin
  definition := pg_get_functiondef('public.list_club_events(uuid,boolean)'::regprocedure);
  for change in
    select * from (values
      ($old$      'ends_at', event.ends_at,
      'registration_deadline'$old$, $new$      'ends_at', event.ends_at,
      'time_unspecified', event.time_unspecified,
      'registration_deadline'$new$)
    ) as replacements(needle, replacement)
  loop
    occurrences := (length(definition) - length(replace(definition, change.needle, ''))) / length(change.needle);
    if occurrences <> 1 then raise exception 'list_club_events projection fragment mismatch'; end if;
    definition := replace(definition, change.needle, change.replacement);
  end loop;
  execute definition;

  -- Midnight bounds describe a calendar date, not an activity currently in
  -- progress. Do not let the detail page invite members to self-check in.
  definition := pg_get_functiondef('public.get_my_club_event(uuid,boolean)'::regprocedure);
  if (length(definition) - length(replace(definition,
      $old$      and (found->>'counts_for_attendance')::boolean$old$, '')))
      / length($old$      and (found->>'counts_for_attendance')::boolean$old$) <> 1 then
    raise exception 'get_my_club_event running-state fragment mismatch';
  end if;
  definition := replace(definition,
    $old$      and (found->>'counts_for_attendance')::boolean$old$,
    $new$      and not (found->>'time_unspecified')::boolean
      and (found->>'counts_for_attendance')::boolean$new$);
  execute definition;

  definition := pg_get_functiondef('public.search_my_club(uuid,text,integer)'::regprocedure);
  if position($old$          'starts_at', event.starts_at
        ) as item$old$ in definition) = 0 then raise exception 'search_my_club projection fragment missing'; end if;
  definition := replace(definition,
    $old$          'starts_at', event.starts_at
        ) as item$old$,
    $new$          'starts_at', event.starts_at,
          'time_unspecified', event.time_unspecified
        ) as item$new$);
  execute definition;

  definition := pg_get_functiondef('public.list_club_event_line_targets(uuid,uuid)'::regprocedure);
  if position($old$    'starts_at', target.starts_at,
    'event_status'$old$ in definition) = 0 then raise exception 'LINE target projection fragment missing'; end if;
  definition := replace(definition,
    $old$    'starts_at', target.starts_at,
    'event_status'$old$,
    $new$    'starts_at', target.starts_at,
    'time_unspecified', target.time_unspecified,
    'event_status'$new$);
  execute definition;

  definition := pg_get_functiondef('public.get_event_checkin_overview(uuid,uuid)'::regprocedure);
  for change in
    select * from (values
      ($old$      'ends_at', event.ends_at,
      'status'$old$, $new$      'ends_at', event.ends_at,
      'time_unspecified', event.time_unspecified,
      'status'$new$),
      ($old$      'checkin_window_open', now() >= event.starts_at - interval '24 hours' and now() <= event.ends_at + interval '24 hours'$old$, $new$      'checkin_window_open', not event.time_unspecified and now() >= event.starts_at - interval '24 hours' and now() <= event.ends_at + interval '24 hours'$new$)
    ) as replacements(needle, replacement)
  loop
    occurrences := (length(definition) - length(replace(definition, change.needle, ''))) / length(change.needle);
    if occurrences <> 1 then raise exception 'check-in overview projection fragment mismatch'; end if;
    definition := replace(definition, change.needle, change.replacement);
  end loop;
  execute definition;

  definition := pg_get_functiondef('public.list_my_location_checkin_events()'::regprocedure);
  for change in
    select * from (values
      ($old$    'starts_at', candidate.starts_at,
    'already_checked_in'$old$, $new$    'starts_at', candidate.starts_at,
    'time_unspecified', candidate.time_unspecified,
    'already_checked_in'$new$),
      ($old$      event.starts_at,
      exists ($old$, $new$      event.starts_at,
      event.time_unspecified,
      exists ($new$),
      ($old$     and event.venue_latitude is not null
     and public.event_location_checkin_is_open$old$, $new$     and event.venue_latitude is not null
     and not event.time_unspecified
     and public.event_location_checkin_is_open$new$)
    ) as replacements(needle, replacement)
  loop
    occurrences := (length(definition) - length(replace(definition, change.needle, ''))) / length(change.needle);
    if occurrences <> 1 then raise exception 'location check-in list fragment mismatch'; end if;
    definition := replace(definition, change.needle, change.replacement);
  end loop;
  execute definition;

  definition := pg_get_functiondef('public.check_in_to_event_by_location(uuid,uuid,numeric,numeric)'::regprocedure);
  if position($old$    and event.event_status = 'published'
    and public.event_location_checkin_is_open(event.starts_at, event.ends_at)$old$ in definition) = 0 then
    raise exception 'GPS check-in eligibility fragment missing';
  end if;
  definition := replace(definition,
    $old$    and event.event_status = 'published'
    and public.event_location_checkin_is_open(event.starts_at, event.ends_at)$old$,
    $new$    and event.event_status = 'published'
    and not event.time_unspecified
    and public.event_location_checkin_is_open(event.starts_at, event.ends_at)$new$);
  execute definition;

  definition := pg_get_functiondef('public.list_my_member_pending_tasks(uuid,integer,integer,boolean)'::regprocedure);
  for change in
    select * from (values
      ($old$      event.registration_deadline,
      registration.response as my_response$old$, $new$      event.registration_deadline,
      event.time_unspecified,
      registration.response as my_response$new$),
      ($old$      and now() < starts_at$old$, $new$      and (case when time_unspecified then now() < ends_at else now() < starts_at end)$new$)
    ) as replacements(needle, replacement)
  loop
    occurrences := (length(definition) - length(replace(definition, change.needle, ''))) / length(change.needle);
    if occurrences <> 1 then raise exception 'member task event fragment mismatch'; end if;
    definition := replace(definition, change.needle, change.replacement);
  end loop;
  execute definition;

  definition := pg_get_functiondef('public.get_my_member_home_projection(uuid)'::regprocedure);
  for change in
    select * from (values
      ($old$      event.counts_for_attendance,
      event.cover_image_path,$old$, $new$      event.counts_for_attendance,
      event.time_unspecified,
      event.cover_image_path,$new$),
      ($old$      and now() < starts_at$old$, $new$      and (case when time_unspecified then now() < ends_at else now() < starts_at end)$new$),
      ($old$    where starts_at > now()$old$, $new$    where case when time_unspecified then ends_at > now() else starts_at > now() end$new$),
      ($old$        'ends_at', ends_at,
        'registration_state'$old$, $new$        'ends_at', ends_at,
        'time_unspecified', time_unspecified,
        'registration_state'$new$),
      ($old$      registration_deadline,
      my_response$old$, $new$      registration_deadline,
      time_unspecified,
      my_response$new$),
      ($old$          when already_checked_in then 'checked_in'
          when checkin_session_status = 'active'$old$, $new$          when already_checked_in then 'checked_in'
          when time_unspecified then 'not_available'
          when checkin_session_status = 'active'$new$),
      ($old$          'starts_at', item.starts_at,
          -- The same three states$old$, $new$          'starts_at', item.starts_at,
          'time_unspecified', item.time_unspecified,
          -- The same three states$new$)
    ) as replacements(needle, replacement)
  loop
    occurrences := (length(definition) - length(replace(definition, change.needle, ''))) / length(change.needle);
    if occurrences <> 1 then raise exception 'member home event fragment mismatch'; end if;
    definition := replace(definition, change.needle, change.replacement);
  end loop;
  execute definition;
end;
$$;

commit;
