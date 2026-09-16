begin;

-- 報名截止留空，存不進去。
--
-- #172 讓欄位可以是 null、把「還能不能報名」收成一條共用規則、讓每一個讀取
-- 端都正確處理 null，並且把建立表單的標籤改成「報名截止（台北，選填）」。
--
-- 它沒有碰寫入端。create_club_event 與 update_club_event 的檢查清單裡都還有
-- 一句 `or p_registration_deadline is null`，所以幹部照著畫面上寫的「選填」
-- 留空，拿到的是「輸入資料不正確」。這個功能在兩條寫入路徑上都是死的。
--
-- CI 一路是綠的，因為四支碰到這個欄位的 e2e 全部把它填滿了 —— 留空那條路
-- 從來沒有被走過。本輪一併補上一支會走它的測試。
--
-- publish_club_event 則是另一種：`target.registration_deadline <= now()` 對
-- NULL 會算出 NULL，if 不成立，所以它「剛好」能發布。行為是對的，但那是三值
-- 邏輯的意外，不是寫下來的意思 —— 改成問那條共用規則。


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
  if p_event_type not in ('regular_meeting', 'board_meeting', 'service', 'joint_meeting', 'fireside', 'other')
     or btrim(coalesce(p_title, '')) = '' or char_length(btrim(p_title)) > 160
     or char_length(btrim(coalesce(p_description, ''))) > 5000
     or char_length(btrim(coalesce(p_location, ''))) > 300
     or p_starts_at is null or p_ends_at is null
     or p_starts_at <= now() or p_ends_at <= p_starts_at
     -- Blank is a value here, not a missing one: 「不設截止，活動結束前都可
     -- 報名」. Written as an explicit is-not-null guard rather than left to
     -- NULL propagating through this or-chain -- the chain would behave
     -- correctly by accident, and the next person reading it could not tell.
     or (p_registration_deadline is not null
         and (p_registration_deadline <= now() or p_registration_deadline > p_starts_at))
     or (p_capacity is not null and (p_capacity < 1 or p_capacity > 10000)) then
    raise exception using errcode = '22023', message = 'invalid_event_input';
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

create or replace function public.update_club_event(
  p_club_id uuid,
  p_event_id uuid,
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
  p_venue_longitude numeric default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_events;
  attending_count integer;
  changed jsonb;
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'event.manage')
     or not exists (select 1 from public.clubs where id = p_club_id and club_status = 'active') then
    raise exception using errcode = '42501', message = 'event_manage_required';
  end if;

  select event.* into target
  from public.club_events as event
  where event.id = p_event_id and event.club_id = p_club_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'event_not_found';
  end if;
  if target.event_status not in ('draft', 'published') then
    raise exception using errcode = '22023', message = 'event_not_editable';
  end if;
  if target.ends_at <= now() then
    raise exception using errcode = '22023', message = 'event_already_finished';
  end if;
  if p_expected_version is not null and p_expected_version <> target.version then
    raise exception using errcode = '40001', message = 'event_changed_elsewhere';
  end if;

  if p_event_type not in ('regular_meeting', 'board_meeting', 'service', 'joint_meeting', 'fireside', 'other')
     or btrim(coalesce(p_title, '')) = '' or char_length(btrim(p_title)) > 160
     or char_length(btrim(coalesce(p_description, ''))) > 5000
     or char_length(btrim(coalesce(p_location, ''))) > 300
     or p_starts_at is null or p_ends_at is null
     or p_ends_at <= p_starts_at
     -- Same as creation: blank is a value. Clearing a deadline an event
     -- already has is the other half of the feature -- without it a regular
     -- meeting created with one can never be relieved of it.
     or (p_registration_deadline is not null and p_registration_deadline > p_starts_at)
     -- Unlike creation this does not require a future start: an event already
     -- under way still needs its address corrected. It does require the event
     -- to still be unfinished after the edit, so an edit cannot retire it.
     or p_ends_at <= now()
     or (p_capacity is not null and (p_capacity < 1 or p_capacity > 10000)) then
    raise exception using errcode = '22023', message = 'invalid_event_input';
  end if;

  if num_nulls(p_venue_latitude, p_venue_longitude) = 1
     or (p_venue_latitude is not null
         and (p_venue_latitude < -90 or p_venue_latitude > 90
              or p_venue_longitude < -180 or p_venue_longitude > 180)) then
    raise exception using errcode = '22023', message = 'invalid_event_venue_location';
  end if;

  select count(*)::integer into attending_count
  from public.event_registrations as registration
  where registration.event_id = target.id and registration.response = 'attending';

  if p_capacity is not null and p_capacity < attending_count then
    raise exception using errcode = '22023', message = 'capacity_below_registrations';
  end if;

  -- Recorded field by field: an attendee asking "wasn't it at 13:30?" has to be
  -- answerable, and the push that announced the event carried the old values.
  changed := jsonb_strip_nulls(jsonb_build_object(
    'event_type', case when target.event_type is distinct from p_event_type
      then jsonb_build_object('from', target.event_type, 'to', p_event_type) end,
    'title', case when target.title is distinct from btrim(p_title)
      then jsonb_build_object('from', target.title, 'to', btrim(p_title)) end,
    'location', case when target.location is distinct from btrim(coalesce(p_location, ''))
      then jsonb_build_object('from', target.location, 'to', btrim(coalesce(p_location, ''))) end,
    'starts_at', case when target.starts_at is distinct from p_starts_at
      then jsonb_build_object('from', target.starts_at, 'to', p_starts_at) end,
    'ends_at', case when target.ends_at is distinct from p_ends_at
      then jsonb_build_object('from', target.ends_at, 'to', p_ends_at) end,
    'registration_deadline', case when target.registration_deadline is distinct from p_registration_deadline
      then jsonb_build_object('from', target.registration_deadline, 'to', p_registration_deadline) end,
    'capacity', case when target.capacity is distinct from p_capacity
      then jsonb_build_object('from', target.capacity, 'to', p_capacity) end,
    'counts_for_attendance', case when target.counts_for_attendance is distinct from coalesce(p_counts_for_attendance, true)
      then jsonb_build_object('from', target.counts_for_attendance, 'to', coalesce(p_counts_for_attendance, true)) end,
    'venue_location_set', case when (target.venue_latitude is not null) is distinct from (p_venue_latitude is not null)
      then jsonb_build_object('from', target.venue_latitude is not null, 'to', p_venue_latitude is not null) end
  ));

  update public.club_events
  set event_type = p_event_type,
      title = btrim(p_title),
      description = btrim(coalesce(p_description, '')),
      location = btrim(coalesce(p_location, '')),
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      registration_deadline = p_registration_deadline,
      capacity = p_capacity,
      counts_for_attendance = coalesce(p_counts_for_attendance, true),
      venue_latitude = p_venue_latitude,
      venue_longitude = p_venue_longitude,
      updated_by_app_account_id = actor_id,
      version = target.version + 1,
      updated_at = now()
  where id = target.id
  returning * into target;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'event.updated', 'club_event', target.id,
    jsonb_build_object('event_status', target.event_status, 'changed', changed));

  return jsonb_build_object(
    'event_id', target.id,
    'status', target.event_status,
    'version', target.version,
    'changed_field_count', (select count(*) from jsonb_object_keys(changed)),
    -- Only a published event has an audience that was told anything, and only
    -- these three fields change what they were told about when and where.
    'notify_members', target.event_status = 'published' and (
      changed ? 'starts_at' or changed ? 'ends_at' or changed ? 'location'
    )
  );
end;
$$;

create or replace function public.publish_club_event(p_club_id uuid, p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_events;
begin
  if actor_id is null or not public.current_can_manage_active_club_events(p_club_id) then
    raise exception using errcode = '42501', message = 'event_manage_required';
  end if;
  select * into target from public.club_events
  where id = p_event_id and club_id = p_club_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'event_not_available'; end if;
  -- The shared rule rather than a comparison of its own. Both clauses this
  -- replaces are inside it: it is false once the event has started, and false
  -- once the deadline has passed. For a blank deadline it answers 「開到活動
  -- 結束」, which is the whole point of leaving it blank.
  if target.event_status <> 'draft'
     or not public.event_registration_is_open(
       target.registration_deadline, target.starts_at, target.ends_at
     ) then
    raise exception using errcode = '22023', message = 'event_cannot_be_published';
  end if;
  update public.club_events set event_status = 'published', updated_by_app_account_id = actor_id
  where id = target.id;
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id)
  values (p_club_id, actor_id, 'event.published', 'club_event', target.id);
end;
$$;

commit;
