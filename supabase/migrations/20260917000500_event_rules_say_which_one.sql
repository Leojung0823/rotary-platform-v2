begin;

-- 系統知道是哪一條規則擋下來的，只是沒有說。
--
-- create_club_event 用一個 raise 涵蓋十條規則，訊息一律是 invalid_event_input。
-- 畫面能說的因此只有「活動資料未通過系統規則，請確認內容後再試」——
-- 幹部把開始時間設成五分鐘前，得到的是一句沒有指向任何欄位的話，而表單上
-- 明明有逐欄的錯誤位置可以放。
--
-- 拆成一條規則一個訊息。
--
-- 同時拿掉兩條規則：**開始時間不必是未來**。
--
-- 建立活動本來要求 p_starts_at > now()，所以幹部把開始時間設成五分鐘前就被
-- 拒絕 —— 而那是補登一場已經開始、或已經結束的聚會時最自然的輸入。
-- update_club_event 從來就沒有這個要求，兩支函式對同一件事給了不同的答案。
--
-- 報名截止「必須是未來」也跟著拿掉：開始時間可以是過去之後，一個已經過去的
-- 截止時間就只是「這場已經不能報名了」，那是事實，不是錯誤。
--
-- 留下來的都是說不通的輸入，而不是不常見的輸入：結束早於開始、截止晚於開始、
-- 名額是負數。順序的規則留著，時間軸的位置不留。

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
  p_counts_for_attendance boolean,
  p_venue_latitude numeric default null,
  p_venue_longitude numeric default null
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
  -- 一條規則，一個訊息。這裡本來是十條規則擠在一個 raise 裡，所以畫面只能
  -- 說「活動資料未通過系統規則」—— 幹部把開始時間設成五分鐘前，得到的是一句
  -- 沒有指向任何欄位的話。系統知道是哪一條，只是沒有說。
  if p_event_type not in ('regular_meeting', 'board_meeting', 'service', 'joint_meeting', 'fireside', 'other') then
    raise exception using errcode = '22023', message = 'invalid_event_type';
  end if;
  if btrim(coalesce(p_title, '')) = '' or char_length(btrim(p_title)) > 160 then
    raise exception using errcode = '22023', message = 'invalid_event_title';
  end if;
  if char_length(btrim(coalesce(p_description, ''))) > 5000 then
    raise exception using errcode = '22023', message = 'invalid_event_description';
  end if;
  if char_length(btrim(coalesce(p_location, ''))) > 300 then
    raise exception using errcode = '22023', message = 'invalid_event_location';
  end if;
  if p_starts_at is null or p_ends_at is null then
    raise exception using errcode = '22023', message = 'invalid_event_time';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception using errcode = '22023', message = 'event_ends_before_it_starts';
  end if;
  -- Blank is a value here, not a missing one: 「不設截止，活動結束前都可
  -- 報名」. Written as an explicit is-not-null guard rather than left to
  -- NULL propagating through this or-chain -- the chain would behave
  -- correctly by accident, and the next person reading it could not tell.
  if p_registration_deadline is not null and p_registration_deadline > p_starts_at then
    raise exception using errcode = '22023', message = 'event_deadline_after_start';
  end if;
  if p_capacity is not null and (p_capacity < 1 or p_capacity > 10000) then
    raise exception using errcode = '22023', message = 'invalid_event_capacity';
  end if;
  -- A half-set coordinate pair would create an event whose GPS check-in can
  -- never succeed, so reject it here rather than at check-in time.
  if num_nulls(p_venue_latitude, p_venue_longitude) = 1
     or (p_venue_latitude is not null
         and (p_venue_latitude < -90 or p_venue_latitude > 90
              or p_venue_longitude < -180 or p_venue_longitude > 180)) then
    raise exception using errcode = '22023', message = 'invalid_event_venue_location';
  end if;

  insert into public.club_events (
    club_id, event_type, title, description, location, starts_at, ends_at,
    registration_deadline, capacity, counts_for_attendance,
    venue_latitude, venue_longitude,
    created_by_app_account_id, updated_by_app_account_id
  ) values (
    p_club_id, p_event_type, btrim(p_title), btrim(coalesce(p_description, '')),
    btrim(coalesce(p_location, '')), p_starts_at, p_ends_at, p_registration_deadline,
    p_capacity, coalesce(p_counts_for_attendance, true),
    p_venue_latitude, p_venue_longitude, actor_id, actor_id
  ) returning * into created_event;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'event.created', 'club_event', created_event.id,
    jsonb_build_object(
      'event_type', created_event.event_type,
      'starts_at', created_event.starts_at,
      'venue_location_set', created_event.venue_latitude is not null
    ));

  return jsonb_build_object('event_id', created_event.id, 'status', created_event.event_status, 'version', created_event.version);
end;
$$;
commit;
