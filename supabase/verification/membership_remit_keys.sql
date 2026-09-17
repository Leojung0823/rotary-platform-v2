begin;

-- 末五碼綁在社友身上，而不是綁在某一筆收款上。
--
-- 這份驗證證明四件事：只有財務改得動、一組識別字在一個社裡只指向一個人、
-- 只收後幾碼、以及把識別字改指到另一個人時稽核看得出換了誰。

set local role postgres;

insert into public.clubs (id, club_code, club_name, club_status) values
  ('7a000000-0000-4000-8000-000000000001', 'REMIT-TEST', '末五碼測試社', 'active');

insert into public.people (id, canonical_name, primary_email) values
  ('7b000000-0000-4000-8000-000000000001', '財務社友', 'remit-treasurer@example.test'),
  ('7b000000-0000-4000-8000-000000000002', '匯款社友甲', 'remit-payer-a@example.test'),
  ('7b000000-0000-4000-8000-000000000003', '匯款社友乙', 'remit-payer-b@example.test');

insert into public.app_accounts (id, auth_user_id, person_id, account_email, account_display_name, account_status) values
  ('7c000000-0000-4000-8000-000000000001', '7c000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000001', 'remit-treasurer@example.test', '財務社友', 'active'),
  ('7c000000-0000-4000-8000-000000000002', '7c000000-0000-4000-8000-000000000002', '7b000000-0000-4000-8000-000000000002', 'remit-payer-a@example.test', '匯款社友甲', 'active');

insert into public.club_memberships (id, club_id, person_id, membership_status, joined_on) values
  ('7d000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000001', 'active', current_date - 100),
  ('7d000000-0000-4000-8000-000000000002', '7a000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000002', 'active', current_date - 100),
  ('7d000000-0000-4000-8000-000000000003', '7a000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000003', 'active', current_date - 100);

insert into public.club_role_assignments (id, club_id, app_account_id, role_key, assignment_status) values
  ('7e000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000001', '7c000000-0000-4000-8000-000000000001', 'finance', 'active');

create table public.remit_test_state (key text primary key, value jsonb not null);
grant select, insert on public.remit_test_state to authenticated;

-- 1) 一般社友改不動：這是金融識別資訊，只有財務能寫。
set local role authenticated;
select set_config('request.jwt.claim.sub', '7c000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    perform public.set_membership_remit_key(
      '7a000000-0000-4000-8000-000000000001',
      '7d000000-0000-4000-8000-000000000002',
      'bank_last5', '12345'
    );
    raise exception 'an ordinary member was allowed to write a remit key';
  exception when sqlstate '42501' then
    null;
  end;
end;
$$;
reset role;

-- 2) 財務可以記住一組末五碼，而且只收後幾碼。
set local role authenticated;
select set_config('request.jwt.claim.sub', '7c000000-0000-4000-8000-000000000001', true);
do $$
begin
  perform public.set_membership_remit_key(
    '7a000000-0000-4000-8000-000000000001',
    '7d000000-0000-4000-8000-000000000002',
    'bank_last5', '12345', '中國信託'
  );

  -- 完整帳號進不來：對帳只需要後幾碼，存更多只是把風險留在資料庫裡。
  begin
    perform public.set_membership_remit_key(
      '7a000000-0000-4000-8000-000000000001',
      '7d000000-0000-4000-8000-000000000003',
      'bank_last5', '822001234512345'
    );
    raise exception 'a full account number was accepted as a remit key';
  exception when sqlstate '22023' then
    null;
  end;

  -- 卡號要四碼，不是五碼。
  begin
    perform public.set_membership_remit_key(
      '7a000000-0000-4000-8000-000000000001',
      '7d000000-0000-4000-8000-000000000003',
      'card_last4', '12345'
    );
    raise exception 'a five digit value was accepted as a card_last4';
  exception when sqlstate '22023' then
    null;
  end;
end;
$$;

insert into public.remit_test_state (key, value)
values ('after_first', public.list_club_remit_keys('7a000000-0000-4000-8000-000000000001'));
reset role;

do $$
declare
  keys jsonb;
begin
  select value into keys from public.remit_test_state where key = 'after_first';
  if not (keys @> '[{"key_kind": "bank_last5", "key_value": "12345", "member_display_name": "匯款社友甲"}]'::jsonb) then
    raise exception 'the remit key was not recorded against the member: %', keys;
  end if;
  if jsonb_array_length(keys) <> 1 then
    raise exception 'a rejected key was stored anyway: %', keys;
  end if;
end;
$$;

-- 3) 同一組末五碼改指到另一位社友，是更正而不是新增一列 —— 否則「這筆是誰的」
--    就有兩個答案。稽核要看得出是從誰換到誰。
set local role authenticated;
select set_config('request.jwt.claim.sub', '7c000000-0000-4000-8000-000000000001', true);
select public.set_membership_remit_key(
  '7a000000-0000-4000-8000-000000000001',
  '7d000000-0000-4000-8000-000000000003',
  'bank_last5', '12345'
);
insert into public.remit_test_state (key, value)
values ('after_reassign', public.list_club_remit_keys('7a000000-0000-4000-8000-000000000001'));
reset role;

do $$
declare
  keys jsonb;
begin
  select value into keys from public.remit_test_state where key = 'after_reassign';
  if jsonb_array_length(keys) <> 1 then
    raise exception 'one set of digits now points at two members: %', keys;
  end if;
  if not (keys @> '[{"key_value": "12345", "member_display_name": "匯款社友乙"}]'::jsonb) then
    raise exception 'the reassignment did not take: %', keys;
  end if;

  if not exists (
    select 1 from public.audit_logs
    where club_id = '7a000000-0000-4000-8000-000000000001'
      and action_key = 'dues.remit_key_reassigned'
      and metadata ->> 'from_membership_id' = '7d000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'reassigning a remit key left no audit of who it was taken from';
  end if;
end;
$$;

-- 4) 這張表不是財務紀錄：社友會換帳戶、會打錯，所以刪得掉。
set local role authenticated;
select set_config('request.jwt.claim.sub', '7c000000-0000-4000-8000-000000000001', true);
do $$
declare
  target uuid;
begin
  select (entry ->> 'remit_key_id')::uuid into target
  from jsonb_array_elements(public.list_club_remit_keys('7a000000-0000-4000-8000-000000000001')) as entry
  limit 1;
  perform public.remove_membership_remit_key('7a000000-0000-4000-8000-000000000001', target);
end;
$$;
insert into public.remit_test_state (key, value)
values ('after_remove', public.list_club_remit_keys('7a000000-0000-4000-8000-000000000001'));
reset role;

do $$
declare
  keys jsonb;
begin
  select value into keys from public.remit_test_state where key = 'after_remove';
  if jsonb_array_length(keys) <> 0 then
    raise exception 'the remit key could not be removed: %', keys;
  end if;
  if not exists (
    select 1 from public.audit_logs
    where club_id = '7a000000-0000-4000-8000-000000000001'
      and action_key = 'dues.remit_key_removed'
  ) then
    raise exception 'removing a remit key left no audit';
  end if;
end;
$$;

rollback;
