-- Event account, membership, and club lifecycle verification.
-- Run only against Supabase local. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '16000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'event-suspended-membership@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '16000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'event-suspended-club-manager@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('26000000-0000-0000-0000-000000000001', '停權社籍社員', 'event-suspended-membership@example.test'),
  ('26000000-0000-0000-0000-000000000002', '停權扶輪社管理者', 'event-suspended-club-manager@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('36000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000001', '26000000-0000-0000-0000-000000000001', 'event-suspended-membership@example.test', '停權社籍社員', 'active'),
  ('36000000-0000-0000-0000-000000000002', '16000000-0000-0000-0000-000000000002', '26000000-0000-0000-0000-000000000002', 'event-suspended-club-manager@example.test', '停權扶輪社管理者', 'active');

insert into public.clubs (
  id, club_code, club_name, club_status, activated_at, suspended_at
) values
  ('56000000-0000-4000-8000-000000000001', 'EVENT-LIFECYCLE-A', '活動生命週期啟用社', 'active', now(), null),
  ('56000000-0000-4000-8000-000000000002', 'EVENT-LIFECYCLE-S', '活動生命週期停權社', 'suspended', now() - interval '1 day', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('66000000-0000-4000-8000-000000000001', '56000000-0000-4000-8000-000000000001', '26000000-0000-0000-0000-000000000001', 'suspended'),
  ('66000000-0000-4000-8000-000000000002', '56000000-0000-4000-8000-000000000002', '26000000-0000-0000-0000-000000000002', 'active');

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values (
  '76000000-0000-4000-8000-000000000001',
  '56000000-0000-4000-8000-000000000002',
  '36000000-0000-0000-0000-000000000002',
  'president', 'active', '36000000-0000-0000-0000-000000000002'
);

insert into public.club_events (
  id, club_id, event_type, title, starts_at, ends_at, registration_deadline,
  event_status, created_by_app_account_id, updated_by_app_account_id, published_at
) values
  (
    '86000000-0000-4000-8000-000000000001',
    '56000000-0000-4000-8000-000000000001',
    'regular_meeting', '啟用社已發布活動',
    now() + interval '3 days', now() + interval '3 days 2 hours', now() + interval '2 days',
    'published',
    '36000000-0000-0000-0000-000000000002',
    '36000000-0000-0000-0000-000000000002',
    now()
  ),
  (
    '86000000-0000-4000-8000-000000000002',
    '56000000-0000-4000-8000-000000000002',
    'board_meeting', '停權社草稿活動',
    now() + interval '4 days', now() + interval '4 days 1 hour', now() + interval '3 days',
    'draft',
    '36000000-0000-0000-0000-000000000002',
    '36000000-0000-0000-0000-000000000002',
    null
  ),
  (
    '86000000-0000-4000-8000-000000000003',
    '56000000-0000-4000-8000-000000000002',
    'service', '停權社已發布活動',
    now() + interval '5 days', now() + interval '5 days 2 hours', now() + interval '4 days',
    'published',
    '36000000-0000-0000-0000-000000000002',
    '36000000-0000-0000-0000-000000000002',
    now()
  );

-- Suspended membership cannot list or register in an otherwise active club.
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
do $$
declare club_count integer;
begin
  select count(*) into club_count from public.list_my_event_clubs();
  if club_count <> 0 then raise exception 'suspended membership received an event club'; end if;

  begin
    perform public.list_club_events('56000000-0000-4000-8000-000000000001', false);
    raise exception 'suspended membership listed events';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.set_my_event_registration(
      '56000000-0000-4000-8000-000000000001',
      '86000000-0000-4000-8000-000000000001',
      'attending', 0, ''
    );
    raise exception 'suspended membership registered for an event';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- An active membership and president role in a suspended club confer no event entitlement.
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000002', true);
do $$
declare club_count integer;
begin
  select count(*) into club_count from public.list_my_event_clubs();
  if club_count <> 0 then raise exception 'suspended club appeared in event selector'; end if;

  begin
    perform public.list_club_events('56000000-0000-4000-8000-000000000002', false);
    raise exception 'suspended club manager listed events';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.set_my_event_registration(
      '56000000-0000-4000-8000-000000000002',
      '86000000-0000-4000-8000-000000000003',
      'attending', 0, ''
    );
    raise exception 'member registered in a suspended club';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.create_club_event(
      '56000000-0000-4000-8000-000000000002',
      'other', '停權社越權建立活動', '', '',
      now() + interval '6 days', now() + interval '6 days 1 hour', now() + interval '5 days',
      null, true
    );
    raise exception 'manager created an event in a suspended club';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.publish_club_event(
      '56000000-0000-4000-8000-000000000002',
      '86000000-0000-4000-8000-000000000002'
    );
    raise exception 'manager published an event in a suspended club';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.cancel_club_event(
      '56000000-0000-4000-8000-000000000002',
      '86000000-0000-4000-8000-000000000003',
      '停權社不應允許取消操作'
    );
    raise exception 'manager cancelled an event in a suspended club';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.current_can_manage_active_club_events('56000000-0000-4000-8000-000000000002');
    raise exception 'authenticated role executed internal active-club management helper';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;
