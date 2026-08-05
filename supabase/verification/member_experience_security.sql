-- Member-first home and event projection tenant/security verification.
-- Run only against Supabase local. All fixtures are rolled back.

begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '16300000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'member-home-manager@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '16300000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'member-home-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '16300000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'member-home-outsider@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email, primary_phone) values
  ('26300000-0000-0000-0000-000000000001', '首頁管理者', 'member-home-manager@example.test', '0911000001'),
  ('26300000-0000-0000-0000-000000000002', '首頁社員', 'member-home-member@example.test', null),
  ('26300000-0000-0000-0000-000000000003', '首頁外社社員', 'member-home-outsider@example.test', '0911000003');

insert into public.app_accounts (id, auth_user_id, person_id, login_email, account_display_name, account_status) values
  ('36300000-0000-0000-0000-000000000001', '16300000-0000-0000-0000-000000000001', '26300000-0000-0000-0000-000000000001', 'member-home-manager@example.test', '首頁管理者', 'active'),
  ('36300000-0000-0000-0000-000000000002', '16300000-0000-0000-0000-000000000002', '26300000-0000-0000-0000-000000000002', 'member-home-member@example.test', '首頁社員', 'active'),
  ('36300000-0000-0000-0000-000000000003', '16300000-0000-0000-0000-000000000003', '26300000-0000-0000-0000-000000000003', 'member-home-outsider@example.test', '首頁外社社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('56300000-0000-4000-8000-000000000001', 'HOME-A', '首頁甲社', 'active', now()),
  ('56300000-0000-4000-8000-000000000002', 'HOME-B', '首頁乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_number, membership_status) values
  ('66300000-0000-4000-8000-000000000001', '56300000-0000-4000-8000-000000000001', '26300000-0000-0000-0000-000000000001', 'HOME-001', 'active'),
  ('66300000-0000-4000-8000-000000000002', '56300000-0000-4000-8000-000000000001', '26300000-0000-0000-0000-000000000002', 'HOME-002', 'active'),
  ('66300000-0000-4000-8000-000000000003', '56300000-0000-4000-8000-000000000002', '26300000-0000-0000-0000-000000000003', 'HOME-003', 'active');

insert into public.club_role_assignments (id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id) values
  ('76300000-0000-4000-8000-000000000001', '56300000-0000-4000-8000-000000000001', '36300000-0000-0000-0000-000000000001', 'president', 'active', '36300000-0000-0000-0000-000000000001');

insert into public.club_events (id, club_id, event_type, title, description, location, starts_at, ends_at, registration_deadline, event_status, created_by_app_account_id, updated_by_app_account_id, published_at) values
  ('86300000-0000-4000-8000-000000000001', '56300000-0000-4000-8000-000000000001', 'regular_meeting', '社員可見例會', '社員活動內容', '三樓宴會廳', now() + interval '7 days', now() + interval '7 days 2 hours', now() + interval '5 days', 'published', '36300000-0000-0000-0000-000000000001', '36300000-0000-0000-0000-000000000001', now()),
  ('86300000-0000-4000-8000-000000000002', '56300000-0000-4000-8000-000000000001', 'service', '社員不可見草稿', '管理者草稿', '待定', now() + interval '14 days', now() + interval '14 days 2 hours', now() + interval '12 days', 'draft', '36300000-0000-0000-0000-000000000001', '36300000-0000-0000-0000-000000000001', null);

insert into public.event_registrations (id, club_id, event_id, app_account_id, response, guest_count, note, responded_at) values
  ('96300000-0000-4000-8000-000000000001', '56300000-0000-4000-8000-000000000001', '86300000-0000-4000-8000-000000000001', '36300000-0000-0000-0000-000000000002', 'attending', 1, '攜伴一位', now());

insert into public.club_announcements (id, club_id, title, body, announcement_status, pinned, requires_acknowledgement, published_at, expires_at, created_by_app_account_id, updated_by_app_account_id) values
  ('a6300000-0000-4000-8000-000000000001', '56300000-0000-4000-8000-000000000001', '本週例會場地異動', '本週例會改至三樓宴會廳。', 'published', true, true, now(), now() + interval '10 days', '36300000-0000-0000-0000-000000000001', '36300000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '16300000-0000-0000-0000-000000000002', true);
do $$
declare clubs integer; manageable boolean; events jsonb; detail jsonb; home jsonb;
begin
  select count(*), bool_or(can_manage) into clubs, manageable from public.list_my_member_clubs();
  if clubs <> 1 or manageable then raise exception 'ordinary member club projection was incorrect'; end if;

  events := public.list_member_events('56300000-0000-4000-8000-000000000001');
  if jsonb_array_length(events->'events') <> 1 then raise exception 'member event projection exposed a draft or omitted the published event'; end if;
  if events#>>'{events,0,title}' <> '社員可見例會' or events#>>'{events,0,my_response}' <> 'attending' then raise exception 'member event state was incorrect'; end if;
  if (events#>'{events,0}') ? 'version' then raise exception 'member event projection exposed technical version data'; end if;

  detail := public.get_member_event_detail('86300000-0000-4000-8000-000000000001');
  if detail->>'my_response' <> 'attending' or (detail->>'my_guest_count')::integer <> 1 then raise exception 'member event detail omitted registration'; end if;

  home := public.get_member_home('56300000-0000-4000-8000-000000000001');
  if home#>>'{club,name}' <> '首頁甲社' or home#>>'{next_event,title}' <> '社員可見例會' then raise exception 'member home omitted club or next event'; end if;
  if jsonb_array_length(home->'my_registrations') <> 1 or jsonb_array_length(home->'announcements') <> 1 then raise exception 'member home omitted registrations or announcements'; end if;
  if not exists (select 1 from jsonb_array_elements(home->'needs_attention') item where item->>'kind' = 'profile') then raise exception 'member home omitted actionable missing-profile reminder'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '16300000-0000-0000-0000-000000000003', true);
do $$
begin
  begin perform public.get_member_home('56300000-0000-4000-8000-000000000001'); raise exception 'outsider opened another club home'; exception when insufficient_privilege then null; end;
  begin perform public.list_member_events('56300000-0000-4000-8000-000000000001'); raise exception 'outsider listed another club events'; exception when insufficient_privilege then null; end;
  begin perform public.get_member_event_detail('86300000-0000-4000-8000-000000000001'); raise exception 'outsider opened another club event'; exception when no_data_found then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '16300000-0000-0000-0000-000000000001', true);
do $$
declare clubs integer; manageable boolean; home jsonb;
begin
  select count(*), bool_or(can_manage) into clubs, manageable from public.list_my_member_clubs();
  if clubs <> 1 or not manageable then raise exception 'manager was not offered a separate management entry'; end if;
  home := public.get_member_home('56300000-0000-4000-8000-000000000001');
  if home#>>'{member,display_name}' <> '首頁管理者' then raise exception 'manager could not use the ordinary member home'; end if;
end $$;
reset role;

rollback;
