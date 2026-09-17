-- 照著紙本對帳，從頭走一遍。
-- Run only against Supabase local. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '8a000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'stmt-treasurer@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '8a000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'stmt-member@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('8b000000-0000-4000-8000-000000000001', '對帳財務', 'stmt-treasurer@example.test'),
  ('8b000000-0000-4000-8000-000000000002', '匯款社友', 'stmt-member@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('8c000000-0000-4000-8000-000000000001', '8a000000-0000-4000-8000-000000000001', '8b000000-0000-4000-8000-000000000001', 'stmt-treasurer@example.test', '對帳財務', 'active'),
  ('8c000000-0000-4000-8000-000000000002', '8a000000-0000-4000-8000-000000000002', '8b000000-0000-4000-8000-000000000002', 'stmt-member@example.test', '匯款社友', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('8d000000-0000-4000-8000-000000000001', 'STMT', '對帳測試社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status, joined_on) values
  ('8e000000-0000-4000-8000-000000000001', '8d000000-0000-4000-8000-000000000001', '8b000000-0000-4000-8000-000000000001', 'active', current_date - 300),
  ('8e000000-0000-4000-8000-000000000002', '8d000000-0000-4000-8000-000000000001', '8b000000-0000-4000-8000-000000000002', 'active', current_date - 300);

insert into public.club_role_assignments (id, club_id, app_account_id, role_key, assignment_status) values
  ('8f000000-0000-4000-8000-000000000001', '8d000000-0000-4000-8000-000000000001', '8c000000-0000-4000-8000-000000000001', 'finance', 'active');

insert into public.rotary_years (id, club_id, start_year, theme, created_by_app_account_id) values
  ('90000000-0000-4000-8000-000000000001', '8d000000-0000-4000-8000-000000000001', 2026, '對帳驗收年度', '8c000000-0000-4000-8000-000000000001');

insert into public.club_finance_receivables (
  id, club_id, rotary_year_id, membership_id, base_amount, source_kind, source_note,
  created_by_app_account_id
) values (
  '91000000-0000-4000-8000-000000000001', '8d000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001', '8e000000-0000-4000-8000-000000000002',
  5000, 'annual_default', '2026-27 年度社費', '8c000000-0000-4000-8000-000000000001'
);

create table public.stmt_test_state (key text primary key, value jsonb not null);
grant select, insert on public.stmt_test_state to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '8a000000-0000-4000-8000-000000000001', true);

-- 1) 還沒認得這組末五碼：財務照紙本打進來，這一行停在待對帳。
--    答不出是誰不是錯誤 —— 那正是這張表存在的理由。
do $$
declare
  resolved jsonb;
  line jsonb;
begin
  resolved := public.resolve_remit_key(
    '8d000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001',
    'bank_last5', '24680'
  );
  if (resolved ->> 'matched')::boolean then
    raise exception 'a set of digits nobody has recorded resolved to somebody: %', resolved;
  end if;

  line := public.record_bank_statement_line(
    '8d000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001',
    current_date - 2, 5000, '24680', '轉入'
  );
  if line ->> 'line_status' <> 'pending' then
    raise exception 'an unrecognised line did not park as pending: %', line;
  end if;

  -- 同一天、同一筆金額、同一組末碼再打一次，要回到同一行而不是變成第二筆錢。
  line := public.record_bank_statement_line(
    '8d000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001',
    current_date - 2, 5000, '24680', '轉入'
  );
  if not (line ->> 'already_recorded')::boolean then
    raise exception 'the same statement line was recorded twice: %', line;
  end if;
end;
$$;

-- 2) 財務認出那是誰，記住這組數字，然後確認這一行。
select public.set_membership_remit_key(
  '8d000000-0000-4000-8000-000000000001', '8e000000-0000-4000-8000-000000000002',
  'bank_last5', '24680'
);

do $$
declare
  resolved jsonb;
  line_id uuid;
  settled jsonb;
begin
  -- 記住之後，同一組數字直接指得出人和他欠多少。
  resolved := public.resolve_remit_key(
    '8d000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001',
    'bank_last5', '24680'
  );
  if not (resolved ->> 'matched')::boolean
     or resolved ->> 'member_display_name' <> '匯款社友'
     or (resolved ->> 'outstanding_amount')::numeric <> 5000 then
    raise exception 'a remembered key did not resolve to the member and what they owe: %', resolved;
  end if;

  -- 透過 RPC 找，因為那張表只有 security definer 的函式碰得到 —— UI 走的也是
  -- 這條路，驗證就不該從旁邊繞過去。
  select (entry ->> 'line_id')::uuid into line_id
  from jsonb_array_elements(public.list_bank_statement_lines(
    '8d000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001'
  )) as entry
  where entry ->> 'line_status' = 'pending'
  limit 1;

  settled := public.settle_bank_statement_line(
    '8d000000-0000-4000-8000-000000000001', line_id,
    (resolved ->> 'receivable_id')::uuid, 5000, 'bank_transfer', 'stmt-verification-1'
  );
  if settled ->> 'receipt_id' is null then
    raise exception 'settling a line produced no receipt: %', settled;
  end if;
end;
$$;

insert into public.stmt_test_state (key, value)
values ('after_settle', public.list_bank_statement_lines(
  '8d000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001'
));
reset role;

do $$
declare
  lines jsonb;
  settled_receipt uuid;
begin
  select value into lines from public.stmt_test_state where key = 'after_settle';
  if not (lines @> '[{"line_status": "settled"}]'::jsonb) then
    raise exception 'the line did not end up settled: %', lines;
  end if;

  select (entry ->> 'settled_receipt_id')::uuid into settled_receipt
  from jsonb_array_elements(lines) as entry
  where entry ->> 'line_status' = 'settled';

  -- 收款是由 record_dues_receipt 產生的真的財務紀錄，而且當場全額分配。
  if not exists (
    select 1 from public.club_finance_receipts where id = settled_receipt and amount = 5000
  ) then
    raise exception 'the settled line does not point at a real receipt';
  end if;
  if (select count(*) from public.club_finance_receipt_allocations as allocation
      where allocation.receipt_id = settled_receipt) <> 1 then
    raise exception 'the receipt was not allocated in full to one receivable';
  end if;
  if (public.project_dues_receivable('91000000-0000-4000-8000-000000000001') ->> 'status') <> 'paid' then
    raise exception 'settling the line did not clear what the member owed';
  end if;
end;
$$;

-- 3) 已經確認過的行不能再確認一次，也刪不掉 —— 那時候它指著一筆真的財務紀錄。
set local role authenticated;
select set_config('request.jwt.claim.sub', '8a000000-0000-4000-8000-000000000001', true);
do $$
declare
  line_id uuid;
begin
  select (entry ->> 'line_id')::uuid into line_id
  from jsonb_array_elements(public.list_bank_statement_lines(
    '8d000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001'
  )) as entry
  where entry ->> 'line_status' = 'settled'
  limit 1;

  -- 檢查訊息，不是只檢查 sqlstate。拿掉守衛之後 record_dues_receipt 會因為
  -- 那筆應收已經繳清而丟出同一個 22023 —— 只看 sqlstate 的斷言會被那個接走，
  -- 於是測試因為錯的理由而通過。
  begin
    perform public.settle_bank_statement_line(
      '8d000000-0000-4000-8000-000000000001', line_id,
      '91000000-0000-4000-8000-000000000001', 1000, 'bank_transfer', 'stmt-verification-2'
    );
    raise exception 'a settled line was settled a second time';
  exception when sqlstate '22023' then
    if sqlerrm <> 'statement_line_already_resolved' then
      raise exception 'settling a settled line failed for the wrong reason: %', sqlerrm;
    end if;
  end;

  begin
    perform public.discard_bank_statement_line('8d000000-0000-4000-8000-000000000001', line_id);
    raise exception 'a settled line was discarded';
  exception when sqlstate '22023' then
    if sqlerrm <> 'statement_line_already_settled' then
      raise exception 'discarding a settled line failed for the wrong reason: %', sqlerrm;
    end if;
  end;
end;
$$;

-- 4) 不是社費的那些要有出口，而且要說得出原因 —— 否則下個月又冒出來讓人再想一次。
do $$
declare
  line jsonb;
  line_id uuid;
begin
  line := public.record_bank_statement_line(
    '8d000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001',
    current_date - 1, 1200, '13579', '退費'
  );
  line_id := (line ->> 'line_id')::uuid;

  begin
    perform public.ignore_bank_statement_line('8d000000-0000-4000-8000-000000000001', line_id, '');
    raise exception 'a line was ignored without a reason';
  exception when sqlstate '22023' then
    if sqlerrm <> 'statement_line_reason_required' then
      raise exception 'ignoring without a reason failed for the wrong reason: %', sqlerrm;
    end if;
  end;

  perform public.ignore_bank_statement_line(
    '8d000000-0000-4000-8000-000000000001', line_id, '社區服務捐款，不是社費'
  );
end;
$$;

-- 5) 一行只能沖銷到它自己那麼多。多出來的部分不是這一行的錢。
do $$
declare
  line jsonb;
begin
  line := public.record_bank_statement_line(
    '8d000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001',
    current_date, 800, '24680', '轉入'
  );
  begin
    perform public.settle_bank_statement_line(
      '8d000000-0000-4000-8000-000000000001', (line ->> 'line_id')::uuid,
      '91000000-0000-4000-8000-000000000001', 5000, 'bank_transfer', 'stmt-verification-3'
    );
    raise exception 'a line was settled for more than the money that arrived';
  exception when sqlstate '22023' then
    -- 同樣的理由：這裡要的是「這一行沒有那麼多錢」，不是別的地方剛好也丟了
    -- 一個 22023。
    if sqlerrm <> 'invalid_statement_line_amount' then
      raise exception 'over-settling failed for the wrong reason: %', sqlerrm;
    end if;
  end;
end;
$$;
reset role;

-- 6) 一般社友碰不到這張表：對帳單的內容是社裡的金流。
set local role authenticated;
select set_config('request.jwt.claim.sub', '8a000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    perform public.list_bank_statement_lines(
      '8d000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001'
    );
    raise exception 'an ordinary member could read the club bank statement';
  exception when sqlstate '42501' then
    null;
  end;

  begin
    perform public.record_bank_statement_line(
      '8d000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001',
      current_date, 100, '11111'
    );
    raise exception 'an ordinary member could write a statement line';
  exception when sqlstate '42501' then
    null;
  end;
end;
$$;
reset role;

-- 7) 待對帳的排在最前面，因為那是財務回到這一頁要看的東西。
set local role authenticated;
select set_config('request.jwt.claim.sub', '8a000000-0000-4000-8000-000000000001', true);
insert into public.stmt_test_state (key, value)
values ('final', public.list_bank_statement_lines(
  '8d000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001'
));
reset role;

do $$
declare
  lines jsonb;
begin
  select value into lines from public.stmt_test_state where key = 'final';
  if jsonb_array_length(lines) <> 3 then
    raise exception 'expected three lines by now: %', lines;
  end if;
  if lines -> 0 ->> 'line_status' <> 'pending' then
    raise exception 'what still needs doing is not at the top: %', lines;
  end if;
end;
$$;

rollback;
