begin;

-- 對帳單的一行。
--
-- 這個社的對帳單目前只有紙本，所以財務是照著紙一行一行看、一行一行輸入。
-- 紙本反而讓設計簡單：紙本身就是那份清單，系統要做的不是持有清單，而是
-- 回答「這組數字是誰」，以及**收下那些當場答不出來的**。
--
-- 三件事決定了這張表長這樣：
--
-- 一、它不是財務紀錄，所以不套 club_finance_record_immutable。
--     一行在被確認成收款之前是暫存的：可以改、可以刪、可以標成不是社費。
--     這是刻意的 —— 另一個做法是讓收款「先記著、之後再分配」（放寬
--     record_dues_receipt 的 p_items 不得為空），那會在唯寫即存的財務表上
--     開一個未定狀態。錢在這裡是「一行」，確認之後才成為「收款」，而收款
--     仍然當場全額分配，和今天一模一樣。
--
-- 二、source 記住這一行是怎麼進來的。現在只有 manual（照紙本打的），
--     csv 與 pdf 先留在允許值裡 —— 之後多一個解析器就能用，比對與確認的
--     流程對三種來源完全相同，不必動下游任何東西。
--
-- 三、同一行不會被記兩次。紙本情境下財務會中斷、會回來、會不確定剛剛那筆
--     打了沒有。同一個社、同一天、同一筆金額、同一組末碼，就是同一行 ——
--     函式先找找看，唯一索引則擋住任何繞過函式的寫入。

create table public.club_bank_statement_lines (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  rotary_year_id uuid not null,
  posted_on date not null,
  amount numeric(12, 2) not null check (amount > 0 and amount = trunc(amount)),
  counterparty_key text,
  description text,
  source text not null default 'manual' check (source in ('manual', 'csv', 'pdf')),
  line_status text not null default 'pending'
    check (line_status in ('pending', 'settled', 'ignored')),
  settled_receipt_id uuid,
  ignored_reason text,
  created_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_bank_statement_lines_year_club_fkey
    foreign key (rotary_year_id, club_id)
    references public.rotary_years (id, club_id)
    on delete restrict,
  constraint club_bank_statement_lines_receipt_club_fkey
    foreign key (settled_receipt_id, club_id)
    references public.club_finance_receipts (id, club_id)
    on delete restrict,
  constraint club_bank_statement_lines_counterparty_check check (
    counterparty_key is null or counterparty_key ~ '^[0-9]{4,5}$'
  ),
  constraint club_bank_statement_lines_description_check check (
    description is null or char_length(btrim(description)) between 1 and 300
  ),
  -- 每一種狀態都要說得出它為什麼在那個狀態。
  constraint club_bank_statement_lines_status_check check (
    (line_status = 'pending' and settled_receipt_id is null and ignored_reason is null)
    or (line_status = 'settled' and settled_receipt_id is not null and ignored_reason is null)
    or (line_status = 'ignored' and settled_receipt_id is null and ignored_reason is not null)
  )
);

-- 同一天、同一筆金額、同一組末碼，就是同一行。coalesce 讓「沒有末碼」也算
-- 得出來 —— 沒有它，兩行 null 在唯一索引裡永遠不相等，同一筆錢會被記兩次。
create unique index club_bank_statement_lines_identity_idx
  on public.club_bank_statement_lines (
    club_id, rotary_year_id, posted_on, amount, coalesce(counterparty_key, '')
  );

create index club_bank_statement_lines_pending_idx
  on public.club_bank_statement_lines (club_id, rotary_year_id, line_status, posted_on);

comment on table public.club_bank_statement_lines is
  'Staging for statement lines being reconciled. Not a finance record: a line is editable until it becomes a receipt.';

alter table public.club_bank_statement_lines enable row level security;
revoke all on table public.club_bank_statement_lines from public, anon, authenticated;

-- 這組數字是誰？對帳台打完末五碼之後問的第一個問題。
--
-- 同時回答第二個問題：那個人這個年度還欠多少。財務要的是「是誰、欠多少」，
-- 分兩次問會讓畫面先跳出名字再跳出金額。
create or replace function public.resolve_remit_key(
  p_club_id uuid,
  p_rotary_year_id uuid,
  p_key_kind text,
  p_key_value text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  normalized_value text := btrim(coalesce(p_key_value, ''));
  found_membership uuid;
  result jsonb;
begin
  if not public.current_has_dues_finance_permission(p_club_id, 'finance.read') then
    raise exception using errcode = '42501', message = 'dues_finance_read_required';
  end if;
  if p_key_kind not in ('bank_last5', 'card_last4') then
    raise exception using errcode = '22023', message = 'invalid_remit_key';
  end if;

  select remit_key.membership_id into found_membership
  from public.club_membership_remit_keys as remit_key
  where remit_key.club_id = p_club_id
    and remit_key.key_kind = p_key_kind
    and remit_key.key_value = normalized_value;

  -- 認不得不是錯誤，是這一行還沒被認出來 —— 那正是這張表存在的理由。
  if found_membership is null then
    return jsonb_build_object('matched', false);
  end if;

  select jsonb_build_object(
    'matched', true,
    'membership_id', membership.id,
    'member_display_name', person.canonical_name,
    'receivable_id', receivable.id,
    'outstanding_amount', case
      when receivable.id is null then null
      else (public.project_dues_receivable(receivable.id) ->> 'outstanding_amount')::numeric
    end
  ) into result
  from public.club_memberships as membership
  join public.people as person on person.id = membership.person_id
  left join public.club_finance_receivables as receivable
    on receivable.membership_id = membership.id
   and receivable.club_id = p_club_id
   and receivable.rotary_year_id = p_rotary_year_id
  where membership.id = found_membership
    and membership.club_id = p_club_id;

  return coalesce(result, jsonb_build_object('matched', false));
end;
$$;

-- 收下一行。答不出是誰的就停在這裡，而不是離開系統靠人腦記著。
create or replace function public.record_bank_statement_line(
  p_club_id uuid,
  p_rotary_year_id uuid,
  p_posted_on date,
  p_amount numeric,
  p_counterparty_key text default null,
  p_description text default null,
  p_source text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  normalized_key text := nullif(btrim(coalesce(p_counterparty_key, '')), '');
  normalized_description text := nullif(btrim(coalesce(p_description, '')), '');
  existing public.club_bank_statement_lines;
  line_id uuid;
begin
  if actor_id is null
     or not public.current_has_dues_finance_permission(p_club_id, 'finance.manage') then
    raise exception using errcode = '42501', message = 'dues_finance_manage_required';
  end if;
  if p_posted_on is null
     or p_posted_on > current_date
     or p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount) or p_amount > 9999999999
     or p_source not in ('manual', 'csv', 'pdf')
     or (normalized_key is not null and normalized_key !~ '^[0-9]{4,5}$')
     or char_length(coalesce(normalized_description, '')) > 300 then
    raise exception using errcode = '22023', message = 'invalid_bank_statement_line';
  end if;
  if not exists (
    select 1 from public.rotary_years as year_item
    where year_item.id = p_rotary_year_id and year_item.club_id = p_club_id
  ) then
    raise exception using errcode = 'P0002', message = 'rotary_year_not_available';
  end if;

  -- 同一天、同一筆金額、同一組末碼，就是同一行。財務會中斷、會回來、會不
  -- 確定剛剛那筆打了沒有；重複輸入要回到同一行，而不是變成第二筆錢。
  select * into existing
  from public.club_bank_statement_lines as line
  where line.club_id = p_club_id
    and line.rotary_year_id = p_rotary_year_id
    and line.posted_on = p_posted_on
    and line.amount = p_amount
    and coalesce(line.counterparty_key, '') = coalesce(normalized_key, '');
  if found then
    return jsonb_build_object(
      'line_id', existing.id,
      'line_status', existing.line_status,
      'already_recorded', true
    );
  end if;

  insert into public.club_bank_statement_lines (
    club_id, rotary_year_id, posted_on, amount, counterparty_key, description,
    source, created_by_app_account_id
  ) values (
    p_club_id, p_rotary_year_id, p_posted_on, p_amount, normalized_key,
    normalized_description, p_source, actor_id
  ) returning id into line_id;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'dues.statement_line_recorded', 'club_bank_statement_line', line_id,
    jsonb_build_object('source', p_source, 'amount', p_amount));

  return jsonb_build_object('line_id', line_id, 'line_status', 'pending', 'already_recorded', false);
end;
$$;

-- 確認：這一行是這個人的這筆應收。
--
-- 收款仍然由 record_dues_receipt 產生 —— 同一支函式、同一條規則、同一份
-- 稽核。這裡只是把那筆收款接回它來自的那一行。
create or replace function public.settle_bank_statement_line(
  p_club_id uuid,
  p_line_id uuid,
  p_receivable_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_bank_statement_lines;
  receipt jsonb;
  receipt_id uuid;
begin
  if actor_id is null
     or not public.current_has_dues_finance_permission(p_club_id, 'finance.manage') then
    raise exception using errcode = '42501', message = 'dues_finance_manage_required';
  end if;
  select * into target
  from public.club_bank_statement_lines as line
  where line.id = p_line_id and line.club_id = p_club_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'statement_line_not_available'; end if;
  if target.line_status <> 'pending' then
    raise exception using errcode = '22023', message = 'statement_line_already_resolved';
  end if;
  -- 一行只能沖銷到它自己那麼多。多出來的部分不是這一行的錢。
  if p_amount is null or p_amount <= 0 or p_amount > target.amount then
    raise exception using errcode = '22023', message = 'invalid_statement_line_amount';
  end if;

  receipt := public.record_dues_receipt(
    p_club_id,
    target.posted_on,
    p_payment_method,
    case when target.counterparty_key is null then null
      else '對帳單末碼 ' || target.counterparty_key end,
    jsonb_build_array(jsonb_build_object('receivable_id', p_receivable_id, 'amount', p_amount)),
    p_idempotency_key
  );
  receipt_id := (receipt ->> 'receipt_id')::uuid;

  update public.club_bank_statement_lines
  set line_status = 'settled', settled_receipt_id = receipt_id, updated_at = now()
  where id = target.id;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'dues.statement_line_settled', 'club_bank_statement_line', target.id,
    jsonb_build_object('receipt_id', receipt_id, 'amount', p_amount));

  return jsonb_build_object('line_id', target.id, 'receipt_id', receipt_id);
end;
$$;

-- 這一行不是社費：捐款、代墊退款、退費。標掉之後它不再出現在待對帳裡，
-- 而不是下個月又冒出來讓人再想一次。
create or replace function public.ignore_bank_statement_line(
  p_club_id uuid,
  p_line_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  normalized_reason text := btrim(coalesce(p_reason, ''));
  target public.club_bank_statement_lines;
begin
  if actor_id is null
     or not public.current_has_dues_finance_permission(p_club_id, 'finance.manage') then
    raise exception using errcode = '42501', message = 'dues_finance_manage_required';
  end if;
  if char_length(normalized_reason) < 2 or char_length(normalized_reason) > 300 then
    raise exception using errcode = '22023', message = 'statement_line_reason_required';
  end if;
  select * into target
  from public.club_bank_statement_lines as line
  where line.id = p_line_id and line.club_id = p_club_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'statement_line_not_available'; end if;
  if target.line_status <> 'pending' then
    raise exception using errcode = '22023', message = 'statement_line_already_resolved';
  end if;

  update public.club_bank_statement_lines
  set line_status = 'ignored', ignored_reason = normalized_reason, updated_at = now()
  where id = target.id;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'dues.statement_line_ignored', 'club_bank_statement_line', target.id,
    jsonb_build_object('reason', normalized_reason));
end;
$$;

-- 打錯了就刪掉。這是暫存，不是帳 —— 已經變成收款的那些刪不掉，
-- 因為那時候它指的是一筆真的財務紀錄。
create or replace function public.discard_bank_statement_line(
  p_club_id uuid,
  p_line_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_bank_statement_lines;
begin
  if actor_id is null
     or not public.current_has_dues_finance_permission(p_club_id, 'finance.manage') then
    raise exception using errcode = '42501', message = 'dues_finance_manage_required';
  end if;
  select * into target
  from public.club_bank_statement_lines as line
  where line.id = p_line_id and line.club_id = p_club_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'statement_line_not_available'; end if;
  if target.line_status = 'settled' then
    raise exception using errcode = '22023', message = 'statement_line_already_settled';
  end if;

  delete from public.club_bank_statement_lines where id = target.id;
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'dues.statement_line_discarded', 'club_bank_statement_line', target.id, '{}'::jsonb);
end;
$$;

-- 待對帳的排前面，因為那是財務回到這一頁要看的東西。
create or replace function public.list_bank_statement_lines(
  p_club_id uuid,
  p_rotary_year_id uuid,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  result jsonb;
begin
  if not public.current_has_dues_finance_permission(p_club_id, 'finance.read') then
    raise exception using errcode = '42501', message = 'dues_finance_read_required';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception using errcode = '22023', message = 'invalid_statement_line_limit';
  end if;

  select coalesce(jsonb_agg(entry order by rank, posted_on desc, line_id), '[]'::jsonb)
    into result
  from (
    select
      line.id as line_id,
      case line.line_status when 'pending' then 0 when 'settled' then 1 else 2 end as rank,
      line.posted_on,
      jsonb_build_object(
        'line_id', line.id,
        'posted_on', line.posted_on,
        'amount', line.amount,
        'counterparty_key', line.counterparty_key,
        'description', line.description,
        'source', line.source,
        'line_status', line.line_status,
        'settled_receipt_id', line.settled_receipt_id,
        'ignored_reason', line.ignored_reason
      ) as entry
    from public.club_bank_statement_lines as line
    where line.club_id = p_club_id
      and line.rotary_year_id = p_rotary_year_id
    order by rank, line.posted_on desc, line.id
    limit p_limit
  ) as ordered;

  return result;
end;
$$;

revoke all on function public.resolve_remit_key(uuid, uuid, text, text) from public, anon;
revoke all on function public.record_bank_statement_line(uuid, uuid, date, numeric, text, text, text) from public, anon;
revoke all on function public.settle_bank_statement_line(uuid, uuid, uuid, numeric, text, text) from public, anon;
revoke all on function public.ignore_bank_statement_line(uuid, uuid, text) from public, anon;
revoke all on function public.discard_bank_statement_line(uuid, uuid) from public, anon;
revoke all on function public.list_bank_statement_lines(uuid, uuid, integer) from public, anon;
grant execute on function public.resolve_remit_key(uuid, uuid, text, text) to authenticated;
grant execute on function public.record_bank_statement_line(uuid, uuid, date, numeric, text, text, text) to authenticated;
grant execute on function public.settle_bank_statement_line(uuid, uuid, uuid, numeric, text, text) to authenticated;
grant execute on function public.ignore_bank_statement_line(uuid, uuid, text) to authenticated;
grant execute on function public.discard_bank_statement_line(uuid, uuid) to authenticated;
grant execute on function public.list_bank_statement_lines(uuid, uuid, integer) to authenticated;

commit;
