-- Event registration tenant, permission, lifecycle, and capacity verification.
-- Run only against Supabase local. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'event-manager@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'event-member-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'event-member-b@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'event-outsider@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'event-suspended@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('24000000-0000-0000-0000-000000000001', '活動管理者', 'event-manager@example.test'),
  ('24000000-0000-0000-0000-000000000002', '活動社員甲', 'event-member-a@example.test'),
  ('24000000-0000-0000-0000-000000000003', '活動社員乙', 'event-member-b@example.test'),
  ('24000000-0000-0000-0000-000000000004', '外社社員', 'event-outsider@example.test'),
  ('24000000-0000-0000-0000-000000000005', '停權社員', 'event-suspended@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('34000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', '24000000-0000-0000-0000-000000000001', 'event-manager@example.test', '活動管理者', 'active'),
  ('34000000-0000-0000-0000-000000000002', '14000000-0000-0000-0000-000000000002', '24000000-0000-0000-0000-000000000002', 'event-member-a@example.test', '活動社員甲', 'active'),
  ('34000000-0000-0000-0000-000000000003', '14000000-0000-0000-0000-000000000003', '24000000-0000-0000-0000-000000000003', 'event-member-b@example.test', '活動社員乙', 'active'),
  ('34000000-0000-0000-0000-000000000004', '14000000-0000-0000-0000-000000000004', '24000000-0000-0000-0000-000000000004', 'event-outsider@example.test', '外社社員', 'active'),
  ('34000000-0000-0000-0000-000000000005', '14000000-0000-0000-0000-000000000005', '24000000-0000-0000-0000-000000000005', 'event-suspended@example.test', '停權社員', 'suspended');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('54000000-0000-4000-8000-000000000001', 'EVENT-A', '活動測試甲社', 'active', now()),
  ('54000000-0000-4000-8000-000000000002', 'EVENT-B', '活動測試乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('64000000-0000-4000-8000-000000000001', '54000000-0000-4000-8000-000000000001', '24000000-0000-0000-0000-000000000001', 'active'),
  ('64000000-0000-4000-8000-000000000002', '54000000-0000-4000-8000-000000000001', '24000000-0000-0000-0000-000000000002', 'active'),
  ('64000000-0000-4000-8000-000000000003', '54000000-0000-4000-8000-000000000001', '24000000-0000-0000-0000-000000000003', 'active'),
  ('64000000-0000-4000-8000-000000000004', '54000000-0000-4000-8000-000000000002', '24000000-0000-0000-0000-000000000004', 'active'),
  ('64000000-0000-4000-8000-000000000005', '54000000-0000-4000-8000-000000000001', '24000000-0000-0000-0000-000000000005', 'active');

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values (
  '74000000-0000-4000-8000-000000000001',
  '54000000-0000-4000-8000-000000000001',
  '34000000-0000-0000-0000-000000000001',
  'president', 'active', '34000000-0000-0000-0000-000000000001'
);

-- Manager creates a draft, cannot cross tenants, and publishes the event.
set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
do $$
declare
  created jsonb;
  event_id uuid;
  clubs integer;
begin
  select count(*) into clubs from public.list_my_event_clubs();
  if clubs <> 1 then raise exception 'manager did not receive exactly one event club'; end if;

  created := public.create_club_event(
    '54000000-0000-4000-8000-000000000001', 'regular_meeting', '例會暨新社員歡迎',
    '活動安全驗證', '測試會館', now() + interval '3 days', now() + interval '3 days 2 hours',
    now() + interval '2 days', 2, true
  );
  event_id := (created->>'event_id')::uuid;
  if created->>'status' <> 'draft' then raise exception 'event was not created as draft'; end if;

  begin
    perform public.create_club_event(
      '54000000-0000-4000-8000-000000000002', 'service', '跨社越權活動', '', '',
      now() + interval '4 days', now() + interval '4 days 1 hour', now() + interval '3 days', null, true
    );
    raise exception 'manager created an event in another club';
  exception when insufficient_privilege then null;
  end;

  perform public.publish_club_event('54000000-0000-4000-8000-000000000001', event_id);

  begin
    perform public.current_has_active_event_membership('54000000-0000-4000-8000-000000000001');
    raise exception 'authenticated role executed internal event membership helper';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Ordinary member cannot manage, can read, and can reserve the entire capacity with one guest.
set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000002', true);
do $$
declare
  event_id uuid;
  listed jsonb;
  saved jsonb;
begin
  select id into event_id from public.club_events where title = '例會暨新社員歡迎';

  begin
    perform public.create_club_event(
      '54000000-0000-4000-8000-000000000001', 'other', '社員越權建立', '', '',
      now() + interval '5 days', now() + interval '5 days 1 hour', now() + interval '4 days', null, false
    );
    raise exception 'ordinary member created an event';
  exception when insufficient_privilege then null;
  end;

  listed := public.list_club_events('54000000-0000-4000-8000-000000000001');
  if jsonb_array_length(listed->'events') <> 1 then raise exception 'member did not receive published event'; end if;

  saved := public.set_my_event_registration(
    '54000000-0000-4000-8000-000000000001', event_id, 'attending', 1, '攜伴一位'
  );
  if saved->>'response' <> 'attending' or (saved->>'guest_count')::integer <> 1 then
    raise exception 'member registration was not saved';
  end if;

  begin
    perform 1 from public.club_events;
    raise exception 'authenticated role selected club_events directly';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.event_registrations set response = 'declined';
    raise exception 'authenticated role updated registrations directly';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- A second member cannot exceed capacity, but may decline.
set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000003', true);
do $$
declare event_id uuid; saved jsonb;
begin
  select id into event_id from public.club_events where title = '例會暨新社員歡迎';
  begin
    perform public.set_my_event_registration(
      '54000000-0000-4000-8000-000000000001', event_id, 'attending', 0, ''
    );
    raise exception 'capacity overflow registration succeeded';
  exception when check_violation then null;
  end;

  saved := public.set_my_event_registration(
    '54000000-0000-4000-8000-000000000001', event_id, 'declined', 0, '另有行程'
  );
  if saved->>'response' <> 'declined' then raise exception 'declined response was not saved'; end if;
end $$;
reset role;

-- Cross-club and suspended accounts cannot read or register.
set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000004', true);
do $$
declare event_id uuid;
begin
  select id into event_id from public.club_events where title = '例會暨新社員歡迎';
  begin
    perform public.list_club_events('54000000-0000-4000-8000-000000000001');
    raise exception 'cross-club member listed events';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_my_event_registration(
      '54000000-0000-4000-8000-000000000001', event_id, 'declined', 0, ''
    );
    raise exception 'cross-club member registered';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000005', true);
do $$
declare event_id uuid; clubs integer;
begin
  select id into event_id from public.club_events where title = '例會暨新社員歡迎';
  select count(*) into clubs from public.list_my_event_clubs();
  if clubs <> 0 then raise exception 'suspended account received an event club'; end if;
  begin
    perform public.set_my_event_registration(
      '54000000-0000-4000-8000-000000000001', event_id, 'attending', 0, ''
    );
    raise exception 'suspended account registered';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Registration deadline is enforced independently of the UI.
insert into public.club_events (
  id, club_id, event_type, title, starts_at, ends_at, registration_deadline, capacity,
  event_status, created_by_app_account_id, updated_by_app_account_id, published_at
) values (
  '84000000-0000-4000-8000-000000000001', '54000000-0000-4000-8000-000000000001',
  'other', '已截止活動', now() + interval '1 day', now() + interval '1 day 1 hour',
  now() - interval '1 minute', 10, 'published',
  '34000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000003', true);
do $$
begin
  begin
    perform public.set_my_event_registration(
      '54000000-0000-4000-8000-000000000001',
      '84000000-0000-4000-8000-000000000001', 'attending', 0, ''
    );
    raise exception 'registration succeeded after deadline';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;

-- Important actions are auditable without exposing audit_logs to browser roles.
do $$
declare audit_count integer;
begin
  select count(*) into audit_count from public.audit_logs
  where subject_type in ('club_event', 'event_registration')
    and club_id = '54000000-0000-4000-8000-000000000001';
  if audit_count < 4 then raise exception 'event actions were not fully audited'; end if;
end $$;

rollback;
