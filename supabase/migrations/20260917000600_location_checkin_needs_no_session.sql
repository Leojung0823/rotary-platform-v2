begin;

-- 時間到就能簽，不必等人手動開啟。
--
-- 定位簽到本來要求活動有一個「有效的簽到場次」—— 也就是幹部要先按下開啟。
-- 而場次存在的理由是 QR：螢幕上那個 token 必須短效、必須輪替，所以要有人
-- 在場、有人負責、有個可以關掉的東西。
--
-- 定位簽到沒有那個東西要保護。它的憑證是 GPS 定位本身，而時間窗（開始前一
-- 小時到結束後一小時）已經把它框住了。多要一個場次，不是多一層安全，只是多
-- 一個人要記得按的按鈕 —— 而忘記按的時候，社員站在現場，畫面上什麼都沒有。
--
-- 所以這裡不是加一個排程去自動開場次（那會在沒有人看著的時候生出 QR token），
-- 而是拿掉定位簽到對場次的依賴。QR 仍然要人開，因為那正是它需要的。
--
-- 連帶：gps 的簽到紀錄不再一定帶 session id。約束放寬到只有 qr 需要 ——
-- 這是放寬，既有每一列都仍然成立。

alter table public.event_attendances
  drop constraint event_attendances_method_consistency;
alter table public.event_attendances
  add constraint event_attendances_method_consistency check (
    (checkin_method = 'qr' and checkin_session_id is not null)
    or (checkin_method = 'gps')
    or (checkin_method = 'manual' and checkin_session_id is null and btrim(checkin_note) <> '')
  );

create or replace function public.event_location_checkin_is_open(
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns boolean
language sql
stable
set search_path = pg_catalog
as $$
  select now() >= p_starts_at - interval '1 hour'
     and now() <= p_ends_at + interval '1 hour'
$$;

revoke all on function public.event_location_checkin_is_open(timestamptz, timestamptz) from public, anon;
grant execute on function public.event_location_checkin_is_open(timestamptz, timestamptz) to authenticated;


create or replace function public.list_my_location_checkin_events()
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
  if actor_id is null then
    raise exception using errcode = '42501', message = 'active_account_required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'club_id', candidate.club_id,
    'club_name', candidate.club_name,
    'event_id', candidate.event_id,
    'title', candidate.title,
    'starts_at', candidate.starts_at,
    'already_checked_in', candidate.already_checked_in
  ) order by candidate.starts_at, candidate.event_id), '[]'::jsonb)
  into result
  from (
    select
      event.club_id,
      club.club_name,
      event.id as event_id,
      event.title,
      event.starts_at,
      exists (
        select 1 from public.event_attendances as attendance
        where attendance.event_id = event.id
          and attendance.membership_id = membership.id
          and attendance.attendance_status = 'active'
      ) as already_checked_in
    from public.app_accounts as account
    join public.club_memberships as membership
      on membership.person_id = account.person_id
     and membership.membership_status = 'active'
    join public.clubs as club
      on club.id = membership.club_id
     and club.club_status = 'active'
    join public.club_events as event
      on event.club_id = membership.club_id
     and event.event_status = 'published'
     -- An event addressed to particular tags is not offered to anyone outside
     -- them. Without this a member saw the title of a board meeting they were
     -- never invited to, in the one list that then lets them check into it.
     and public.event_includes_current_member(event.id)
     and event.venue_latitude is not null
     and public.event_location_checkin_is_open(event.starts_at, event.ends_at)
    where account.id = actor_id
      and account.account_status = 'active'
    limit 50
  ) as candidate;

  return jsonb_build_object('events', result);
end;
$$;
create or replace function public.check_in_to_event_by_location(
  p_club_id uuid,
  p_event_id uuid,
  p_latitude numeric,
  p_longitude numeric
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target_event public.club_events;
  target_session public.event_checkin_sessions;
  target_membership public.club_memberships;
  existing_attendance public.event_attendances;
  created_attendance public.event_attendances;
  distance_meters double precision;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'active_account_required';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
    raise exception using errcode = '22023', message = 'invalid_checkin_location';
  end if;

  select event.* into target_event
  from public.club_events as event
  join public.clubs as club on club.id = event.club_id and club.club_status = 'active'
  where event.id = p_event_id
    and event.club_id = p_club_id
    and event.event_status = 'published'
    and public.event_location_checkin_is_open(event.starts_at, event.ends_at)
  for share of event;
  if not found then
    raise exception using errcode = '22023', message = 'event_not_checkin_eligible';
  end if;

  -- An event addressed to particular tags is not this member's to attend.
  -- None of the check-in paths asked, so someone the event was never sent to
  -- could still be recorded as present at it. The answer is the same one an
  -- ineligible event gives, so a refusal does not confirm the event is there.
  if not public.event_includes_current_member(target_event.id) then
    raise exception using errcode = '22023', message = 'event_not_checkin_eligible';
  end if;

  if target_event.venue_latitude is null or target_event.venue_longitude is null then
    raise exception using errcode = '22023', message = 'event_venue_location_missing';
  end if;

  -- 不再要求有效的簽到場次。場次是 QR 的東西 —— 一個短效、要輪替、要有人
  -- 關掉的 token。定位簽到的憑證是 GPS 定位本身，而時間窗已經把它框住了。
  -- 如果剛好有一個場次開著就記下來，沒有也照樣成立。
  select * into target_session
  from public.event_checkin_sessions
  where event_id = target_event.id
    and club_id = target_event.club_id
    and session_status = 'active'
    and expires_at > now()
  for share;

  select membership.* into target_membership
  from public.app_accounts as account
  join public.club_memberships as membership on membership.person_id = account.person_id
  where account.id = actor_id
    and membership.club_id = target_event.club_id
    and membership.membership_status = 'active'
  for share of membership;
  if not found then
    raise exception using errcode = '42501', message = 'active_membership_required';
  end if;

  distance_meters := public.event_checkin_distance_meters(
    target_event.venue_latitude, target_event.venue_longitude, p_latitude, p_longitude
  );
  if distance_meters > public.event_checkin_gps_radius_meters() then
    -- Deliberately reports no distance: telling a caller how far off they are
    -- turns this into an oracle for locating the venue, and would put a
    -- member-derived measurement into an error surface.
    raise exception using errcode = '22023', message = 'checkin_location_out_of_range';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_event.id::text || ':' || target_membership.id::text, 0)
  );
  select * into existing_attendance
  from public.event_attendances
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
    club_id, event_id, membership_id, checkin_session_id, checkin_method, checked_in_by_app_account_id, checkin_note
  ) values (
    target_event.club_id, target_event.id, target_membership.id, target_session.id,
    'gps', actor_id, ''
  ) returning * into created_attendance;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (target_event.club_id, actor_id, 'attendance.self_checked_in', 'event_attendance', created_attendance.id,
    jsonb_build_object('event_id', target_event.id, 'membership_id', target_membership.id, 'mode', 'gps_v2'));

  return jsonb_build_object(
    'attendance_id', created_attendance.id,
    'event_id', created_attendance.event_id,
    'checked_in_at', created_attendance.checked_in_at,
    'idempotent', false
  );
end;
$$;

commit;
