-- Member Home is an intentionally tiny, member-only projection. Run only
-- against Supabase local; all synthetic fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '61000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'member-home@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '61000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'member-home-outsider@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('62000000-0000-4000-8000-000000000001', '首頁社員', 'member-home@example.test'),
  ('62000000-0000-4000-8000-000000000002', '首頁外社社員', 'member-home-outsider@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('63000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', 'member-home@example.test', '首頁社員', 'active'),
  ('63000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000002', 'member-home-outsider@example.test', '首頁外社社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('64000000-0000-4000-8000-000000000001', 'HOME-A', '首頁測試甲社', 'active', now()),
  ('64000000-0000-4000-8000-000000000002', 'HOME-B', '首頁測試乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status, joined_on) values
  ('65000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', 'active', current_date),
  ('65000000-0000-4000-8000-000000000002', '64000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000002', 'active', current_date);

insert into public.club_events (
  id, club_id, event_type, title, location, starts_at, ends_at, registration_deadline,
  counts_for_attendance, event_status, created_by_app_account_id, updated_by_app_account_id, published_at, cancelled_at, cancellation_reason
) values
  ('66000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001', 'regular_meeting', '進行中的首頁例會', '首頁測試會館', now() - interval '30 minutes', now() + interval '30 minutes', now() - interval '1 day', true, 'published', '63000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001', now() - interval '2 days', null, null),
  ('66000000-0000-4000-8000-000000000002', '64000000-0000-4000-8000-000000000001', 'service', '下一場首頁服務活動', '河濱公園', now() + interval '2 days', now() + interval '2 days 2 hours', now() + interval '1 day', true, 'published', '63000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001', now() - interval '2 days', null, null),
  ('66000000-0000-4000-8000-000000000003', '64000000-0000-4000-8000-000000000001', 'other', '不應顯示的草稿', '不應顯示', now() + interval '3 days', now() + interval '3 days 2 hours', now() + interval '2 days', true, 'draft', '63000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001', null, null, null),
  ('66000000-0000-4000-8000-000000000004', '64000000-0000-4000-8000-000000000001', 'other', '不應顯示的取消活動', '不應顯示', now() + interval '4 days', now() + interval '4 days 2 hours', now() + interval '3 days', true, 'cancelled', '63000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001', now() - interval '2 days', now() - interval '1 day', 'fixture cancelled'),
  ('66000000-0000-4000-8000-000000000005', '64000000-0000-4000-8000-000000000002', 'regular_meeting', '乙社不應顯示活動', '乙社會館', now() + interval '1 day', now() + interval '1 day 2 hours', now() + interval '12 hours', true, 'published', '63000000-0000-4000-8000-000000000002', '63000000-0000-4000-8000-000000000002', now() - interval '2 days', null, null);

insert into public.event_registrations (
  club_id, event_id, app_account_id, response, guest_count, note, responded_at
) values (
  '64000000-0000-4000-8000-000000000001',
  '66000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000001',
  'attending', 0, '', now()
);

insert into public.event_checkin_sessions (
  id, club_id, event_id, token_hash, token_prefix, session_status, opens_at, expires_at, created_by_app_account_id
) values (
  '67000000-0000-4000-8000-000000000001',
  '64000000-0000-4000-8000-000000000001',
  '66000000-0000-4000-8000-000000000001',
  repeat('a', 64), 'aaaaaaaa', 'active', now() - interval '10 minutes', now() + interval '20 minutes',
  '63000000-0000-4000-8000-000000000001'
);

-- Anonymous callers have no projection privilege.
set local role anon;
do $$
begin
  begin
    perform public.get_my_member_home_projection('64000000-0000-4000-8000-000000000001');
    raise exception 'anonymous caller executed member-home projection';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- An active member receives two bounded, published events in deterministic
-- priority order. The payload omits IDs, check-in tokens, and other members.
set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
do $$
declare home jsonb;
begin
  home := public.get_my_member_home_projection('64000000-0000-4000-8000-000000000001');
  if home->'club' <> '{"club_code":"HOME-A","club_name":"首頁測試甲社"}'::jsonb
    or home->'primary_event'->>'title' <> '進行中的首頁例會'
    or home->'next_event'->>'title' <> '下一場首頁服務活動'
    or home->'primary_event'->>'registration_state' <> 'registered'
    or home->'primary_event'->>'checkin_state' <> 'available'
    or home->'next_event'->>'registration_state' <> 'not_registered' then
    raise exception 'member-home priority or presentation state is invalid: %', home;
  end if;
  if home::text like '%不應顯示%' or home::text like '%乙社%' then
    raise exception 'member-home projection included unpublished, cancelled, or cross-club data';
  end if;
  if home ?| array['id', 'club_id', 'event_id', 'membership_id', 'account_id', 'person_id', 'token', 'token_hash', 'session_id']
    or home::text like '%token_hash%' or home::text like '%aaaaaaaa%' then
    raise exception 'member-home projection leaked an internal identifier or check-in secret';
  end if;
end;
$$;
reset role;

-- A legitimate account from another club cannot use a tampered club input.
set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    perform public.get_my_member_home_projection('64000000-0000-4000-8000-000000000001');
    raise exception 'cross-club member read a member-home projection';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- Membership lifecycle remains the authorization boundary even after a prior projection.
update public.club_memberships set membership_status = 'suspended'
where id = '65000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
do $$
begin
  begin
    perform public.get_my_member_home_projection('64000000-0000-4000-8000-000000000001');
    raise exception 'suspended membership retained a member-home projection';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

rollback;
