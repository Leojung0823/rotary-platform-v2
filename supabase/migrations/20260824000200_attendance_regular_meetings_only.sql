begin;

-- Forward-only rebuilds extracted from the current canonical Attendance
-- migrations. The sole behavioral change is that Attendance reporting and
-- management accept regular meetings only.
create or replace function public.attendance_result_for_member(
  p_event_id uuid,
  p_membership_id uuid
)
returns table (
  final_status text,
  in_denominator boolean,
  attendance_credit boolean,
  raw_checkin_method text,
  raw_checked_in_at timestamptz,
  adjustment_id uuid,
  adjustment_type text,
  adjustment_reason text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    case
      when raw.id is not null then 'present'
      when adjustment.adjustment_type = 'makeup' then 'makeup'
      when adjustment.adjustment_type = 'official_leave' then 'official_leave'
      when adjustment.adjustment_type = 'leave' then 'leave'
      when adjustment.adjustment_type = 'exempt' then 'exempt'
      else 'absent'
    end as final_status,
    (
      event.event_type = 'regular_meeting'
      and event.event_status in ('published', 'completed')
      and event.counts_for_attendance
      and event.starts_at <= now()
      and public.attendance_membership_is_eligible(event.id, membership.id)
      and (raw.id is not null or coalesce(adjustment.adjustment_type, '') not in ('official_leave', 'exempt'))
    ) as in_denominator,
    coalesce(raw.id is not null or adjustment.adjustment_type = 'makeup', false) as attendance_credit,
    raw.checkin_method,
    raw.checked_in_at,
    adjustment.id,
    adjustment.adjustment_type,
    adjustment.reason
  from public.club_events as event
  join public.club_memberships as membership
    on membership.id = p_membership_id
   and membership.club_id = event.club_id
  left join lateral (
    select attendance.id, attendance.checkin_method, attendance.checked_in_at
    from public.event_attendances as attendance
    where attendance.event_id = event.id
      and attendance.membership_id = membership.id
      and attendance.attendance_status = 'active'
    order by attendance.checked_in_at desc, attendance.id desc
    limit 1
  ) as raw on true
  left join lateral (
    select item.id, item.adjustment_type, item.reason
    from public.attendance_adjustments as item
    where item.event_id = event.id
      and item.membership_id = membership.id
      and item.revoked_at is null
    order by item.created_at desc, item.id desc
    limit 1
  ) as adjustment on true
  where event.id = p_event_id
$$;

create or replace function public.list_my_attendance_history(
  p_club_id uuid,
  p_date_from date,
  p_date_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid;
  result jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'active_account_required';
  end if;
  if not public.attendance_date_range_is_valid(p_date_from, p_date_to) then
    raise exception using errcode = '22023', message = 'invalid_attendance_date_range';
  end if;

  select membership.id into actor_membership_id
  from public.app_accounts as account
  join public.club_memberships as membership on membership.person_id = account.person_id
  join public.clubs as club on club.id = membership.club_id
  where account.id = actor_id
    and account.account_status = 'active'
    and membership.club_id = p_club_id
    and membership.membership_status = 'active'
    and club.club_status = 'active';
  if not found then
    raise exception using errcode = '42501', message = 'active_attendance_membership_required';
  end if;

  select jsonb_build_object(
    'records', coalesce(jsonb_agg(jsonb_build_object(
      'event_date', row.event_date,
      'event_title', row.event_title,
      'final_status', row.final_status,
      'in_denominator', row.in_denominator,
      'attendance_credit', row.attendance_credit,
      'raw_checkin_method', row.raw_checkin_method,
      'raw_checked_in_at', row.raw_checked_in_at,
      'adjustment_type', row.adjustment_type,
      'adjustment_reason', row.adjustment_reason
    ) order by row.starts_at desc, row.event_id desc), '[]'::jsonb)
  ) into result
  from (
    select event.id as event_id,
      (event.starts_at at time zone club.timezone_name)::date as event_date,
      event.title as event_title,
      event.starts_at,
      outcome.*
    from public.club_events as event
    join public.clubs as club on club.id = event.club_id
    cross join lateral public.attendance_result_for_member(event.id, actor_membership_id) as outcome
    where event.club_id = p_club_id
      and event.event_type = 'regular_meeting'
      and event.event_status in ('published', 'completed')
      and event.counts_for_attendance
      and event.starts_at <= now()
      and (event.starts_at at time zone club.timezone_name)::date between p_date_from and p_date_to
      and public.attendance_membership_is_eligible(event.id, actor_membership_id)
    order by event.starts_at desc, event.id desc
    limit 500
  ) as row;

  return coalesce(result, jsonb_build_object('records', '[]'::jsonb));
end;
$$;

create or replace function public.get_my_attendance_summary(
  p_club_id uuid,
  p_date_from date,
  p_date_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid;
  result jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'active_account_required';
  end if;
  if not public.attendance_date_range_is_valid(p_date_from, p_date_to) then
    raise exception using errcode = '22023', message = 'invalid_attendance_date_range';
  end if;

  select membership.id into actor_membership_id
  from public.app_accounts as account
  join public.club_memberships as membership on membership.person_id = account.person_id
  join public.clubs as club on club.id = membership.club_id
  where account.id = actor_id
    and account.account_status = 'active'
    and membership.club_id = p_club_id
    and membership.membership_status = 'active'
    and club.club_status = 'active';
  if not found then
    raise exception using errcode = '42501', message = 'active_attendance_membership_required';
  end if;

  with outcomes as materialized (
    select event.starts_at, event.event_status, outcome.*
    from public.club_events as event
    join public.clubs as club on club.id = event.club_id
    cross join lateral public.attendance_result_for_member(event.id, actor_membership_id) as outcome
    where event.club_id = p_club_id
      and event.event_type = 'regular_meeting'
      and event.event_status in ('published', 'completed')
      and event.counts_for_attendance
      and event.starts_at <= now()
      and (event.starts_at at time zone club.timezone_name)::date between p_date_from and p_date_to
      and public.attendance_membership_is_eligible(event.id, actor_membership_id)
  ), trend as (
    select to_char(date_trunc('month', starts_at), 'YYYY-MM') as period,
      count(*) filter (where in_denominator) as denominator,
      count(*) filter (where in_denominator and attendance_credit) as attended
    from outcomes
    group by date_trunc('month', starts_at)
    order by date_trunc('month', starts_at)
  )
  select jsonb_build_object(
    'date_from', p_date_from,
    'date_to', p_date_to,
    'denominator', count(*) filter (where in_denominator),
    'attended', count(*) filter (where in_denominator and attendance_credit),
    'attendance_rate', case
      when count(*) filter (where in_denominator) = 0 then 0
      else round(100.0 * count(*) filter (where in_denominator and attendance_credit)
        / count(*) filter (where in_denominator), 1)
    end,
    'present', count(*) filter (where final_status = 'present'),
    'makeup', count(*) filter (where final_status = 'makeup'),
    'official_leave', count(*) filter (where final_status = 'official_leave'),
    'leave', count(*) filter (where final_status = 'leave'),
    'exempt', count(*) filter (where final_status = 'exempt'),
    'absent', count(*) filter (where final_status = 'absent'),
    'pending_absences', count(*) filter (where event_status = 'completed' and final_status = 'absent'),
    'unconfirmed_records', count(*) filter (where event_status = 'published' and final_status = 'absent'),
    'trend', coalesce((
      select jsonb_agg(jsonb_build_object(
        'period', trend.period,
        'denominator', trend.denominator,
        'attended', trend.attended,
        'attendance_rate', case when trend.denominator = 0 then 0
          else round(100.0 * trend.attended / trend.denominator, 1) end
      ) order by trend.period)
      from trend
    ), '[]'::jsonb)
  ) into result from outcomes;

  return result;
end;
$$;

create or replace function public.get_event_attendance_roster(
  p_club_id uuid,
  p_event_id uuid
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
  if actor_id is null
     or not public.current_has_club_permission(p_club_id, 'attendance.manage')
     or not exists (select 1 from public.clubs where id = p_club_id and club_status = 'active') then
    raise exception using errcode = '42501', message = 'attendance_manage_required';
  end if;

  select jsonb_build_object(
    'event', jsonb_build_object(
      'title', event.title,
      'starts_at', event.starts_at,
      'status', event.event_status,
      'counts_for_attendance', event.counts_for_attendance
    ),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'membership_id', member.membership_id,
        'display_name', member.display_name,
        'membership_status', member.membership_status,
        'final_status', member.final_status,
        'in_denominator', member.in_denominator,
        'attendance_credit', member.attendance_credit,
        'raw_attendance_status', member.raw_attendance_status,
        'raw_checkin_method', member.raw_checkin_method,
        'raw_checked_in_at', member.raw_checked_in_at,
        'adjustment_id', member.adjustment_id,
        'adjustment_type', member.adjustment_type,
        'adjustment_reason', member.adjustment_reason,
        'adjustment_created_at', member.adjustment_created_at
      ) order by member.display_name, member.membership_id)
      from (
        select membership.id as membership_id,
          person.canonical_name as display_name,
          membership.membership_status,
          outcome.final_status,
          outcome.in_denominator,
          outcome.attendance_credit,
          raw_history.attendance_status as raw_attendance_status,
          outcome.raw_checkin_method,
          outcome.raw_checked_in_at,
          outcome.adjustment_id,
          outcome.adjustment_type,
          outcome.adjustment_reason,
          adjustment.created_at as adjustment_created_at
        from public.club_memberships as membership
        join public.people as person on person.id = membership.person_id
        cross join lateral public.attendance_result_for_member(event.id, membership.id) as outcome
        left join lateral (
          select attendance.attendance_status
          from public.event_attendances as attendance
          where attendance.event_id = event.id
            and attendance.membership_id = membership.id
          order by (attendance.attendance_status = 'active') desc, attendance.checked_in_at desc, attendance.id desc
          limit 1
        ) as raw_history on true
        left join public.attendance_adjustments as adjustment
          on adjustment.id = outcome.adjustment_id
        where membership.club_id = p_club_id
          and public.attendance_membership_is_eligible(event.id, membership.id)
        order by person.canonical_name, membership.id
        limit 1000
      ) as member
    ), '[]'::jsonb),
    'adjustment_history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'adjustment_id', adjustment.id,
        'membership_id', adjustment.membership_id,
        'display_name', person.canonical_name,
        'adjustment_type', adjustment.adjustment_type,
        'reason', adjustment.reason,
        'created_at', adjustment.created_at,
        'revoked_at', adjustment.revoked_at,
        'revocation_reason', adjustment.revocation_reason
      ) order by adjustment.created_at desc, adjustment.id desc)
      from (
        select item.*
        from public.attendance_adjustments as item
        where item.event_id = event.id
          and item.club_id = p_club_id
        order by item.created_at desc, item.id desc
        limit 1000
      ) as adjustment
      join public.club_memberships as membership
        on membership.id = adjustment.membership_id
       and membership.club_id = adjustment.club_id
      join public.people as person on person.id = membership.person_id
    ), '[]'::jsonb)
  ) into result
  from public.club_events as event
  where event.id = p_event_id and event.club_id = p_club_id and event.event_type = 'regular_meeting';

  if result is null then
    raise exception using errcode = 'P0002', message = 'event_not_available';
  end if;
  return result;
end;
$$;

create or replace function public.set_attendance_adjustment(
  p_club_id uuid,
  p_event_id uuid,
  p_membership_id uuid,
  p_type text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  normalized_reason text := btrim(coalesce(p_reason, ''));
  created_adjustment public.attendance_adjustments;
begin
  if actor_id is null
     or not public.current_has_club_permission(p_club_id, 'attendance.manage')
     or not exists (select 1 from public.clubs where id = p_club_id and club_status = 'active') then
    raise exception using errcode = '42501', message = 'attendance_manage_required';
  end if;
  if p_type is null
     or p_type not in ('leave', 'official_leave', 'makeup', 'exempt')
     or normalized_reason = ''
     or char_length(normalized_reason) > 500 then
    raise exception using errcode = '22023', message = 'invalid_attendance_adjustment';
  end if;
  if not exists (
    select 1 from public.club_events as event
    where event.id = p_event_id
      and event.club_id = p_club_id
      and event.event_type = 'regular_meeting'
      and event.event_status in ('published', 'completed')
      and event.counts_for_attendance
      and event.starts_at <= now()
  ) then
    raise exception using errcode = '22023', message = 'event_not_attendance_eligible';
  end if;
  if not public.attendance_membership_is_eligible(p_event_id, p_membership_id) then
    raise exception using errcode = '42501', message = 'membership_not_attendance_eligible';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_event_id::text || ':' || p_membership_id::text, 0)
  );
  if exists (
    select 1
    from public.attendance_adjustments
    where event_id = p_event_id and membership_id = p_membership_id and revoked_at is null
  ) then
    raise exception using errcode = '23505', message = 'active_attendance_adjustment_exists';
  end if;

  insert into public.attendance_adjustments (
    club_id, event_id, membership_id, adjustment_type, reason, created_by_app_account_id
  ) values (
    p_club_id, p_event_id, p_membership_id, p_type, normalized_reason, actor_id
  ) returning * into created_adjustment;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'attendance.adjustment_set', 'attendance_adjustment', created_adjustment.id,
    jsonb_build_object(
      'event_id', p_event_id,
      'membership_id', p_membership_id,
      'adjustment_type', p_type,
      'reason', jsonb_build_object('present', true, 'length', char_length(normalized_reason))
    )
  );

  return jsonb_build_object(
    'adjustment_id', created_adjustment.id,
    'effective_status', created_adjustment.adjustment_type,
    'created_at', created_adjustment.created_at
  );
end;
$$;

create or replace function public.get_club_attendance_summary(
  p_club_id uuid,
  p_date_from date,
  p_date_to date
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
  if not public.attendance_date_range_is_valid(p_date_from, p_date_to) then
    raise exception using errcode = '22023', message = 'invalid_attendance_date_range';
  end if;
  if actor_id is null
     or not public.current_has_club_permission(p_club_id, 'attendance.manage')
     or not exists (select 1 from public.clubs where id = p_club_id and club_status = 'active') then
    raise exception using errcode = '42501', message = 'attendance_manage_required';
  end if;

  with outcomes as materialized (
    select event.id as event_id,
      event.starts_at,
      event.event_status,
      membership.id as membership_id,
      outcome.final_status,
      outcome.in_denominator,
      outcome.attendance_credit
    from public.club_events as event
    join public.clubs as club on club.id = event.club_id
    join public.club_memberships as membership on membership.club_id = event.club_id
    cross join lateral public.attendance_result_for_member(event.id, membership.id) as outcome
    where event.club_id = p_club_id
      and event.event_type = 'regular_meeting'
      and event.event_status in ('published', 'completed')
      and event.counts_for_attendance
      and event.starts_at <= now()
      and (event.starts_at at time zone club.timezone_name)::date between p_date_from and p_date_to
      and public.attendance_membership_is_eligible(event.id, membership.id)
  ), trend as (
    select to_char(date_trunc('month', starts_at), 'YYYY-MM') as period,
      count(*) filter (where in_denominator) as denominator,
      count(*) filter (where in_denominator and attendance_credit) as attended
    from outcomes
    group by date_trunc('month', starts_at)
    order by date_trunc('month', starts_at)
  )
  select jsonb_build_object(
    'date_from', p_date_from,
    'date_to', p_date_to,
    'average_attendance_rate', case
      when count(*) filter (where outcomes.in_denominator) = 0 then 0
      else round(100.0 * count(*) filter (where outcomes.in_denominator and outcomes.attendance_credit)
        / count(*) filter (where outcomes.in_denominator), 1)
    end,
    'denominator', count(*) filter (where outcomes.in_denominator),
    'attended', count(*) filter (where outcomes.in_denominator and outcomes.attendance_credit),
    'pending_absences', count(*) filter (
      where outcomes.event_status = 'completed' and outcomes.final_status = 'absent'
    ),
    'unconfirmed_records', count(*) filter (
      where outcomes.event_status = 'published' and outcomes.final_status = 'absent'
    ),
    'trend', coalesce((
      select jsonb_agg(jsonb_build_object(
        'period', trend.period,
        'denominator', trend.denominator,
        'attended', trend.attended,
        'attendance_rate', case when trend.denominator = 0 then 0
          else round(100.0 * trend.attended / trend.denominator, 1) end
      ) order by trend.period)
      from trend
    ), '[]'::jsonb)
  ) into result
  from outcomes;

  return result;
end;
$$;

create or replace function public.export_event_attendance_csv(
  p_club_id uuid,
  p_event_id uuid
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
  if actor_id is null
     or not public.current_has_club_permission(p_club_id, 'attendance.manage')
     or not exists (select 1 from public.clubs where id = p_club_id and club_status = 'active') then
    raise exception using errcode = '42501', message = 'attendance_manage_required';
  end if;
  if not exists (
    select 1 from public.club_events where id = p_event_id and club_id = p_club_id and event_type = 'regular_meeting'
  ) then
    raise exception using errcode = 'P0002', message = 'event_not_available';
  end if;

  select jsonb_build_object(
    'columns', jsonb_build_array(
      'event_date', 'event_title', 'member_name', 'final_status',
      'raw_checkin_method', 'raw_checked_in_at', 'adjustment_type', 'adjustment_reason'
    ),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'event_date', public.attendance_csv_safe_cell(row.event_date),
      'event_title', public.attendance_csv_safe_cell(row.event_title),
      'member_name', public.attendance_csv_safe_cell(row.member_name),
      'final_status', public.attendance_csv_safe_cell(row.final_status),
      'raw_checkin_method', public.attendance_csv_safe_cell(row.raw_checkin_method),
      'raw_checked_in_at', public.attendance_csv_safe_cell(row.raw_checked_in_at),
      'adjustment_type', public.attendance_csv_safe_cell(row.adjustment_type),
      'adjustment_reason', public.attendance_csv_safe_cell(row.adjustment_reason)
    ) order by row.member_name), '[]'::jsonb)
  ) into result
  from (
    select (event.starts_at at time zone club.timezone_name)::date::text as event_date,
      event.title as event_title,
      person.canonical_name as member_name,
      outcome.final_status,
      outcome.raw_checkin_method,
      outcome.raw_checked_in_at::text,
      outcome.adjustment_type,
      outcome.adjustment_reason
    from public.club_events as event
    join public.clubs as club on club.id = event.club_id
    join public.club_memberships as membership on membership.club_id = event.club_id
    join public.people as person on person.id = membership.person_id
    cross join lateral public.attendance_result_for_member(event.id, membership.id) as outcome
    where event.id = p_event_id
      and event.club_id = p_club_id
      and event.event_type = 'regular_meeting'
      and public.attendance_membership_is_eligible(event.id, membership.id)
    order by person.canonical_name
    limit 1000
  ) as row;

  return coalesce(result, jsonb_build_object(
    'columns', jsonb_build_array(
      'event_date', 'event_title', 'member_name', 'final_status',
      'raw_checkin_method', 'raw_checked_in_at', 'adjustment_type', 'adjustment_reason'
    ),
    'rows', '[]'::jsonb
  ));
end;
$$;

create or replace function public.list_club_attendance_events(
  p_club_id uuid,
  p_date_from date,
  p_date_to date
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
  if actor_id is null
     or not public.current_has_club_permission(p_club_id, 'attendance.manage')
     or not exists (select 1 from public.clubs where id = p_club_id and club_status = 'active') then
    raise exception using errcode = '42501', message = 'attendance_manage_required';
  end if;
  if not public.attendance_date_range_is_valid(p_date_from, p_date_to) then
    raise exception using errcode = '22023', message = 'invalid_attendance_date_range';
  end if;

  -- Deliberately no per-event attendance tallies: that would mean evaluating
  -- attendance_result_for_member for every member of every event on a page
  -- load. The club summary already gives the aggregate and the roster gives
  -- the detail for the one event a manager opens.
  select jsonb_build_object(
    'events', coalesce(jsonb_agg(jsonb_build_object(
      'event_id', row.id,
      'title', row.title,
      'starts_at', row.starts_at,
      'event_date', row.event_date,
      'status', row.event_status
    ) order by row.starts_at desc, row.id desc), '[]'::jsonb)
  ) into result
  from (
    select event.id,
      event.title,
      event.starts_at,
      event.event_status,
      (event.starts_at at time zone club.timezone_name)::date as event_date
    from public.club_events as event
    join public.clubs as club on club.id = event.club_id
    where event.club_id = p_club_id
      and event.event_type = 'regular_meeting'
      and event.event_status in ('published', 'completed')
      and event.counts_for_attendance
      and event.starts_at <= now()
      and (event.starts_at at time zone club.timezone_name)::date between p_date_from and p_date_to
    order by event.starts_at desc, event.id desc
    limit 500
  ) as row;

  return coalesce(result, jsonb_build_object('events', '[]'::jsonb));
end;
$$;

-- Preserve the canonical least-privilege execution surface.
revoke all on function public.attendance_result_for_member(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.list_my_attendance_history(uuid, date, date)
  from public, anon;
revoke all on function public.get_my_attendance_summary(uuid, date, date)
  from public, anon;
revoke all on function public.get_event_attendance_roster(uuid, uuid)
  from public, anon;
revoke all on function public.set_attendance_adjustment(uuid, uuid, uuid, text, text)
  from public, anon;
revoke all on function public.get_club_attendance_summary(uuid, date, date)
  from public, anon;
revoke all on function public.export_event_attendance_csv(uuid, uuid)
  from public, anon;
revoke all on function public.list_club_attendance_events(uuid, date, date)
  from public, anon;

grant execute on function public.list_my_attendance_history(uuid, date, date)
  to authenticated;
grant execute on function public.get_my_attendance_summary(uuid, date, date)
  to authenticated;
grant execute on function public.get_event_attendance_roster(uuid, uuid)
  to authenticated;
grant execute on function public.set_attendance_adjustment(uuid, uuid, uuid, text, text)
  to authenticated;
grant execute on function public.get_club_attendance_summary(uuid, date, date)
  to authenticated;
grant execute on function public.export_event_attendance_csv(uuid, uuid)
  to authenticated;
grant execute on function public.list_club_attendance_events(uuid, date, date)
  to authenticated;

commit;
