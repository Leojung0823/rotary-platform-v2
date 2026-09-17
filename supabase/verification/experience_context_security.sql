-- Experience-context projection verification. Run only against Supabase local.
-- The projection is a routing hint; these checks also prove it cannot grant tenant access.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '51000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'context-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '51000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'context-multiclub@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '51000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'context-operator@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '51000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'context-member-manager@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '51000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'context-platform@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '51000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'context-platform-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '51000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'context-suspended-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '51000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'context-suspended-account@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '51000000-0000-4000-8000-000000000009', 'authenticated', 'authenticated', 'context-outsider@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('52000000-0000-4000-8000-000000000001', 'Context Member', 'context-member@example.test'),
  ('52000000-0000-4000-8000-000000000002', 'Context Multi', 'context-multiclub@example.test'),
  ('52000000-0000-4000-8000-000000000003', 'Context Operator', 'context-operator@example.test'),
  ('52000000-0000-4000-8000-000000000004', 'Context Member Manager', 'context-member-manager@example.test'),
  ('52000000-0000-4000-8000-000000000005', 'Context Platform', 'context-platform@example.test'),
  ('52000000-0000-4000-8000-000000000006', 'Context Platform Member', 'context-platform-member@example.test'),
  ('52000000-0000-4000-8000-000000000007', 'Context Suspended Member', 'context-suspended-member@example.test'),
  ('52000000-0000-4000-8000-000000000008', 'Context Suspended Account', 'context-suspended-account@example.test'),
  ('52000000-0000-4000-8000-000000000009', 'Context Outsider', 'context-outsider@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('53000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'context-member@example.test', 'Context Member', 'active'),
  ('53000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000002', 'context-multiclub@example.test', 'Context Multi', 'active'),
  ('53000000-0000-4000-8000-000000000003', '51000000-0000-4000-8000-000000000003', '52000000-0000-4000-8000-000000000003', 'context-operator@example.test', 'Context Operator', 'active'),
  ('53000000-0000-4000-8000-000000000004', '51000000-0000-4000-8000-000000000004', '52000000-0000-4000-8000-000000000004', 'context-member-manager@example.test', 'Context Member Manager', 'active'),
  ('53000000-0000-4000-8000-000000000005', '51000000-0000-4000-8000-000000000005', '52000000-0000-4000-8000-000000000005', 'context-platform@example.test', 'Context Platform', 'active'),
  ('53000000-0000-4000-8000-000000000006', '51000000-0000-4000-8000-000000000006', '52000000-0000-4000-8000-000000000006', 'context-platform-member@example.test', 'Context Platform Member', 'active'),
  ('53000000-0000-4000-8000-000000000007', '51000000-0000-4000-8000-000000000007', '52000000-0000-4000-8000-000000000007', 'context-suspended-member@example.test', 'Context Suspended Member', 'active'),
  ('53000000-0000-4000-8000-000000000008', '51000000-0000-4000-8000-000000000008', '52000000-0000-4000-8000-000000000008', 'context-suspended-account@example.test', 'Context Suspended Account', 'suspended'),
  ('53000000-0000-4000-8000-000000000009', '51000000-0000-4000-8000-000000000009', '52000000-0000-4000-8000-000000000009', 'context-outsider@example.test', 'Context Outsider', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('54000000-0000-4000-8000-000000000001', 'CTX-A', 'Context Club A', 'active', now()),
  ('54000000-0000-4000-8000-000000000002', 'CTX-B', 'Context Club B', 'active', now()),
  ('54000000-0000-4000-8000-000000000003', 'CTX-C', 'Context Club C', 'active', now());

insert into public.club_memberships (
  id, club_id, person_id, membership_status, joined_on
) values
  ('55000000-0000-4000-8000-000000000001', '54000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'active', current_date),
  ('55000000-0000-4000-8000-000000000002', '54000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002', 'active', current_date),
  ('55000000-0000-4000-8000-000000000003', '54000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000002', 'active', current_date),
  ('55000000-0000-4000-8000-000000000004', '54000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000004', 'active', current_date),
  ('55000000-0000-4000-8000-000000000005', '54000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000006', 'active', current_date),
  ('55000000-0000-4000-8000-000000000006', '54000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000007', 'active', current_date),
  ('55000000-0000-4000-8000-000000000007', '54000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000008', 'active', current_date);

insert into public.club_role_assignments (
  club_id, app_account_id, role_key, granted_by_app_account_id
) values (
  '54000000-0000-4000-8000-000000000002',
  '53000000-0000-4000-8000-000000000004',
  'secretary',
  '53000000-0000-4000-8000-000000000001'
);

insert into public.club_operator_permissions (
  club_id, app_account_id, permission_level, assignment_status, starts_at, granted_by_app_account_id
) values (
  '54000000-0000-4000-8000-000000000003',
  '53000000-0000-4000-8000-000000000003',
  'club_manager',
  'active',
  now() - interval '1 day',
  '53000000-0000-4000-8000-000000000001'
);

insert into public.platform_roles (app_account_id, role_key) values
  ('53000000-0000-4000-8000-000000000005', 'platform_admin'),
  ('53000000-0000-4000-8000-000000000006', 'platform_admin'),
  ('53000000-0000-4000-8000-000000000008', 'platform_admin');

-- Anonymous callers have no projection RPC privilege.
set local role anon;
do $$
begin
  begin
    perform public.resolve_my_experience_context();
    raise exception 'anonymous caller executed experience-context projection';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- General member and multi-club member get only active membership context.
set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000001', true);
do $$
declare context jsonb;
begin
  context := public.resolve_my_experience_context();
  if context->>'default_mode' <> 'member'
    or context->'available_modes' <> '["member"]'::jsonb
    or context->>'has_active_membership' <> 'true'
    or context->>'can_register' <> 'true'
    or context->>'can_manage' <> 'false'
    or jsonb_array_length(context->'member_clubs') <> 1
    or jsonb_array_length(context->'managed_only_clubs') <> 0 then
    raise exception 'ordinary member context is invalid: %', context;
  end if;
  if context ?| array['account_id', 'person_id', 'email', 'phone', 'line_subject', 'token'] then
    raise exception 'experience-context projection leaked an identity field';
  end if;
  if public.get_my_club_home('54000000-0000-4000-8000-000000000001')->>'club_id'
     <> '54000000-0000-4000-8000-000000000001' then
    raise exception 'direct authorized member route did not retain its own authorization';
  end if;
  begin
    perform public.get_my_club_home('54000000-0000-4000-8000-000000000002');
    raise exception 'direct URL equivalent reached a club without active membership';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000002', true);
do $$
declare context jsonb;
begin
  context := public.resolve_my_experience_context();
  if context->>'default_mode' <> 'member'
    or jsonb_array_length(context->'member_clubs') <> 2
    or context->'available_modes' <> '["member"]'::jsonb then
    raise exception 'multi-club member context is invalid: %', context;
  end if;
end;
$$;
reset role;

-- A club operator is management-only, while an active secretary stays member-first and can switch modes.
set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000003', true);
do $$
declare context jsonb;
begin
  context := public.resolve_my_experience_context();
  if context->>'default_mode' <> 'management'
    or context->'available_modes' <> '["management"]'::jsonb
    or jsonb_array_length(context->'member_clubs') <> 0
    or jsonb_array_length(context->'managed_only_clubs') <> 1 then
    raise exception 'management-only context is invalid: %', context;
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000004', true);
do $$
declare context jsonb;
begin
  context := public.resolve_my_experience_context();
  if context->>'default_mode' <> 'member'
    or context->'available_modes' <> '["member", "management"]'::jsonb
    or context->>'can_manage' <> 'true'
    or not (context->'member_clubs' @> '[{"club_id":"54000000-0000-4000-8000-000000000002","can_manage":true}]'::jsonb) then
    raise exception 'member-manager context is invalid: %', context;
  end if;
  if not exists (select 1 from public.list_club_members('54000000-0000-4000-8000-000000000002', null, null)) then
    raise exception 'direct authorized management route did not retain its own authorization';
  end if;
  if exists (select 1 from public.list_club_members('54000000-0000-4000-8000-000000000001', null, null)) then
    raise exception 'direct management route crossed a club boundary';
  end if;
end;
$$;
reset role;

-- 平台管理員管得了每一個社，而且是從社團選擇器進去。
--
-- 這裡本來斷言他們的 managed_only_clubs 是空的。那在
-- current_has_club_permission 的第一個條件就是平台角色的情況下，等於斷言
-- 「介面看不到資料庫允許的東西」—— 而那正是讓平台管理員按下「管理社員」
-- 得到「無法存取」的原因。
--
-- 現在驗的是：每一個啟用中的社都在裡面，而且他仍然不是任何一社的社員。
-- 社數先在 postgres 身分算好：authenticated 讀不到 clubs 表，而這份驗證要問的
-- 是「選擇器有沒有列出全部」，不是「社員能不能直接讀那張表」。
create temporary table platform_context_expectation as
select count(*)::integer as active_clubs
from public.clubs where club_status in ('provisioning', 'active');
grant select on platform_context_expectation to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000005', true);
do $$
declare
  context jsonb;
  active_clubs integer;
begin
  context := public.resolve_my_experience_context();
  select expectation.active_clubs into active_clubs from platform_context_expectation as expectation;

  if jsonb_array_length(context->'member_clubs') <> 0 then
    raise exception 'a platform admin was given a membership they do not have: %', context;
  end if;
  if jsonb_array_length(context->'managed_only_clubs') <> active_clubs then
    raise exception 'a platform admin cannot reach every club from the switcher: %', context;
  end if;
  if not (context->'available_modes' @> '["platform"]'::jsonb) then
    raise exception 'platform mode is gone: %', context;
  end if;
  if not (context->>'has_platform_access')::boolean then
    raise exception 'the platform flag is gone: %', context;
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000006', true);
do $$
declare context jsonb;
begin
  context := public.resolve_my_experience_context();
  -- member-first 仍然成立：一個同時是社員的平台管理員，打開平台看到的是社員
  -- 首頁，不是管理台。
  --
  -- available_modes 現在也包含 management，而那是對的：他確實管得了每一個社。
  -- 原本這裡比對整個陣列相等，所以「多了一個他真的有的模式」會被當成錯誤。
  -- 改成斷言真正該保住的事：預設仍是 member，而 member 與 platform 都在。
  if context->>'default_mode' <> 'member'
    or not (context->'available_modes' @> '["member", "platform"]'::jsonb) then
    raise exception 'platform-member context is not member-first: %', context;
  end if;
end;
$$;
reset role;

-- Suspending either membership or account, and revoking management, immediately invalidates a previous context.
update public.club_memberships set membership_status = 'suspended'
where id = '55000000-0000-4000-8000-000000000006';
set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000007', true);
do $$
begin
  begin
    perform public.resolve_my_experience_context();
    raise exception 'suspended membership retained a context';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
update public.club_operator_permissions set assignment_status = 'revoked', revoked_at = now(), revoke_reason = 'fixture'
where club_id = '54000000-0000-4000-8000-000000000003'
  and app_account_id = '53000000-0000-4000-8000-000000000003';
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000003', true);
do $$
begin
  begin
    perform public.resolve_my_experience_context();
    raise exception 'revoked management permission retained a context';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000008', true);
do $$
begin
  begin
    perform public.resolve_my_experience_context();
    raise exception 'suspended account retained a context';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000009', true);
do $$
begin
  begin
    perform public.resolve_my_experience_context();
    raise exception 'account without effective authority received a context';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.resolve_my_experience_context()'::regprocedure);
  if position('SET search_path TO' in definition) = 0
    or position('LIMIT 100' in upper(definition)) = 0 then
    raise exception 'experience-context function lacks fixed search path or bounded lists';
  end if;
  if has_function_privilege('anon', 'public.resolve_my_experience_context()'::regprocedure, 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.resolve_my_experience_context()'::regprocedure, 'EXECUTE') then
    raise exception 'experience-context RPC grants are incorrect';
  end if;
end;
$$;

rollback;
