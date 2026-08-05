-- Club announcement tenant, lifecycle, acknowledgement, and audit verification.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '16200000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'announcement-manager@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '16200000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'announcement-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '16200000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'announcement-outsider@example.test', '', now(), '{}', '{}', now(), now());
insert into public.people (id, canonical_name, primary_email) values
  ('26200000-0000-0000-0000-000000000001', '公告管理者', 'announcement-manager@example.test'),
  ('26200000-0000-0000-0000-000000000002', '公告社員', 'announcement-member@example.test'),
  ('26200000-0000-0000-0000-000000000003', '外社社員', 'announcement-outsider@example.test');
insert into public.app_accounts (id, auth_user_id, person_id, login_email, account_display_name, account_status) values
  ('36200000-0000-0000-0000-000000000001', '16200000-0000-0000-0000-000000000001', '26200000-0000-0000-0000-000000000001', 'announcement-manager@example.test', '公告管理者', 'active'),
  ('36200000-0000-0000-0000-000000000002', '16200000-0000-0000-0000-000000000002', '26200000-0000-0000-0000-000000000002', 'announcement-member@example.test', '公告社員', 'active'),
  ('36200000-0000-0000-0000-000000000003', '16200000-0000-0000-0000-000000000003', '26200000-0000-0000-0000-000000000003', 'announcement-outsider@example.test', '外社社員', 'active');
insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('56200000-0000-4000-8000-000000000001', 'ANN-A', '公告甲社', 'active', now()), ('56200000-0000-4000-8000-000000000002', 'ANN-B', '公告乙社', 'active', now());
insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('66200000-0000-4000-8000-000000000001', '56200000-0000-4000-8000-000000000001', '26200000-0000-0000-0000-000000000001', 'active'),
  ('66200000-0000-4000-8000-000000000002', '56200000-0000-4000-8000-000000000001', '26200000-0000-0000-0000-000000000002', 'active'),
  ('66200000-0000-4000-8000-000000000003', '56200000-0000-4000-8000-000000000002', '26200000-0000-0000-0000-000000000003', 'active');
insert into public.club_role_assignments (id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id) values
  ('76200000-0000-4000-8000-000000000001', '56200000-0000-4000-8000-000000000001', '36200000-0000-0000-0000-000000000001', 'president', 'active', '36200000-0000-0000-0000-000000000001');
create temporary table announcement_state (announcement_id uuid not null); grant select, insert on announcement_state to authenticated;

set local role authenticated; select set_config('request.jwt.claim.sub', '16200000-0000-0000-0000-000000000001', true);
do $$ declare saved jsonb; begin
  saved := public.save_club_announcement('56200000-0000-4000-8000-000000000001', null, '例會場地異動', '本週例會改至三樓宴會廳。', true, true, now() + interval '7 days');
  insert into announcement_state values ((saved->>'announcement_id')::uuid);
  perform public.publish_club_announcement('56200000-0000-4000-8000-000000000001', (saved->>'announcement_id')::uuid);
end $$; reset role;

set local role authenticated; select set_config('request.jwt.claim.sub', '16200000-0000-0000-0000-000000000002', true);
do $$ declare listed jsonb; receipt jsonb; target uuid; begin
  select announcement_id into target from announcement_state;
  listed := public.list_club_announcements('56200000-0000-4000-8000-000000000001');
  if jsonb_array_length(listed->'announcements') <> 1 or listed#>>'{announcements,0,title}' <> '例會場地異動' then raise exception 'member announcement feed failed'; end if;
  receipt := public.acknowledge_club_announcement(target);
  if receipt->>'acknowledged_at' is null then raise exception 'required acknowledgement was not recorded'; end if;
  begin perform 1 from public.club_announcements; raise exception 'member selected announcement table directly'; exception when insufficient_privilege then null; end;
end $$; reset role;

set local role authenticated; select set_config('request.jwt.claim.sub', '16200000-0000-0000-0000-000000000003', true);
do $$ begin
  begin perform public.list_club_announcements('56200000-0000-4000-8000-000000000001'); raise exception 'outsider read another club announcement'; exception when insufficient_privilege then null; end;
end $$; reset role;

set local role authenticated; select set_config('request.jwt.claim.sub', '16200000-0000-0000-0000-000000000001', true);
do $$ declare target uuid; begin select announcement_id into target from announcement_state; perform public.archive_club_announcement('56200000-0000-4000-8000-000000000001', target, '公告已完成'); end $$; reset role;

do $$ begin
  if not exists (select 1 from public.audit_logs where action_key = 'announcement.published') then raise exception 'publish audit missing'; end if;
  if not exists (select 1 from public.audit_logs where action_key = 'announcement.acknowledged') then raise exception 'ack audit missing'; end if;
  if not exists (select 1 from public.audit_logs where action_key = 'announcement.archived') then raise exception 'archive audit missing'; end if;
  begin delete from public.club_announcements where id = (select announcement_id from announcement_state); raise exception 'announcement hard delete succeeded'; exception when insufficient_privilege then null; end;
end $$;

rollback;
