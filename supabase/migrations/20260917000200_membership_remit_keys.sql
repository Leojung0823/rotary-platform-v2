begin;

-- 認過一次，之後就該永遠認得。
--
-- 對帳時財務手上拿到的是一行沒有名字的錢：日期、金額、以及匯款帳號的末五碼
-- 或信用卡的後四碼。認出那是誰，是這份工作真正花時間的地方。
--
-- 今天那個識別字只存在 club_finance_receipts.reference_note —— 一個自由文字
-- 欄位，而且掛在「那一筆收款」上，不是掛在「那個人」上。所以同一位社友年年
-- 從同一個帳戶匯款，財務就年年重新用眼睛認一次。系統從來沒有學會任何事。
--
-- 這張表把識別字綁在社籍上。第一個月要認三十個人，第二個月大概只剩兩個。
--
-- 三件事刻意這樣設計：
--
-- 一、只存後幾碼。銀行帳號存五碼、卡號存四碼，由 check constraint 強制。
--     完整帳號不是對帳需要的東西，存了只是把風險留在資料庫裡。
--
-- 二、不是財務紀錄，所以不套 immutability。社友會換帳戶、會打錯，這張表要
--     能改能刪。它是查找的輔助，不是帳。每一次變動都寫稽核。
--
-- 三、一組識別字在一個社裡只能指向一個人。兩個人共用同一組末五碼的話，
--     「這筆是誰的」就沒有答案，那種情況要讓財務當場看見而不是猜。

create table public.club_membership_remit_keys (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  membership_id uuid not null,
  key_kind text not null check (key_kind in ('bank_last5', 'card_last4')),
  key_value text not null,
  note text,
  created_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 一個社裡，一組識別字只屬於一個人。
  unique (club_id, key_kind, key_value),
  constraint club_membership_remit_keys_membership_club_fkey
    foreign key (membership_id, club_id)
    references public.club_memberships (id, club_id)
    on delete restrict,
  constraint club_membership_remit_keys_value_check check (
    (key_kind = 'bank_last5' and key_value ~ '^[0-9]{5}$')
    or (key_kind = 'card_last4' and key_value ~ '^[0-9]{4}$')
  ),
  constraint club_membership_remit_keys_note_check check (
    note is null or char_length(btrim(note)) between 1 and 200
  )
);

create index club_membership_remit_keys_membership_idx
  on public.club_membership_remit_keys (club_id, membership_id);

comment on table public.club_membership_remit_keys is
  'Last digits of a member''s remitting account or card, used to recognise who a bank line belongs to. Never the full number.';

alter table public.club_membership_remit_keys enable row level security;
revoke all on table public.club_membership_remit_keys from public, anon, authenticated;

-- 記住一組識別字。同一組再指到別人時就是更正，不是新增一列。
create or replace function public.set_membership_remit_key(
  p_club_id uuid,
  p_membership_id uuid,
  p_key_kind text,
  p_key_value text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  normalized_value text := btrim(coalesce(p_key_value, ''));
  normalized_note text := nullif(btrim(coalesce(p_note, '')), '');
  existing public.club_membership_remit_keys;
  result_id uuid;
begin
  if actor_id is null
     or not public.current_has_dues_finance_permission(p_club_id, 'finance.manage') then
    raise exception using errcode = '42501', message = 'dues_finance_manage_required';
  end if;
  if p_key_kind not in ('bank_last5', 'card_last4')
     or (p_key_kind = 'bank_last5' and normalized_value !~ '^[0-9]{5}$')
     or (p_key_kind = 'card_last4' and normalized_value !~ '^[0-9]{4}$')
     or char_length(coalesce(normalized_note, '')) > 200 then
    raise exception using errcode = '22023', message = 'invalid_remit_key';
  end if;
  if not exists (
    select 1 from public.club_memberships as membership
    where membership.id = p_membership_id
      and membership.club_id = p_club_id
      and membership.membership_status = 'active'
  ) then
    raise exception using errcode = 'P0002', message = 'membership_not_available';
  end if;

  select * into existing
  from public.club_membership_remit_keys as remit_key
  where remit_key.club_id = p_club_id
    and remit_key.key_kind = p_key_kind
    and remit_key.key_value = normalized_value
  for update;

  if found then
    update public.club_membership_remit_keys
    set membership_id = p_membership_id, note = normalized_note, updated_at = now()
    where id = existing.id
    returning id into result_id;
    -- 從一個人改指到另一個人，是對帳結果被更正 —— 稽核要看得出換了誰。
    insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
    values (p_club_id, actor_id, 'dues.remit_key_reassigned', 'club_membership', p_membership_id,
      jsonb_build_object('key_kind', p_key_kind, 'from_membership_id', existing.membership_id));
  else
    insert into public.club_membership_remit_keys (
      club_id, membership_id, key_kind, key_value, note, created_by_app_account_id
    ) values (
      p_club_id, p_membership_id, p_key_kind, normalized_value, normalized_note, actor_id
    ) returning id into result_id;
    insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
    values (p_club_id, actor_id, 'dues.remit_key_added', 'club_membership', p_membership_id,
      jsonb_build_object('key_kind', p_key_kind));
  end if;

  return result_id;
end;
$$;

create or replace function public.remove_membership_remit_key(
  p_club_id uuid,
  p_remit_key_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_membership_remit_keys;
begin
  if actor_id is null
     or not public.current_has_dues_finance_permission(p_club_id, 'finance.manage') then
    raise exception using errcode = '42501', message = 'dues_finance_manage_required';
  end if;
  select * into target
  from public.club_membership_remit_keys as remit_key
  where remit_key.id = p_remit_key_id and remit_key.club_id = p_club_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'remit_key_not_available'; end if;

  delete from public.club_membership_remit_keys where id = target.id;
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'dues.remit_key_removed', 'club_membership', target.membership_id,
    jsonb_build_object('key_kind', target.key_kind));
end;
$$;

-- 對帳台要問的問題：這組識別字是誰？以及每位社友身上目前綁了哪些。
-- 只回傳後幾碼本身，因為存進來的就只有後幾碼。
create or replace function public.list_club_remit_keys(p_club_id uuid)
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

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'remit_key_id', remit_key.id,
      'membership_id', remit_key.membership_id,
      'member_display_name', person.canonical_name,
      'key_kind', remit_key.key_kind,
      'key_value', remit_key.key_value,
      'note', remit_key.note
    ) order by person.canonical_name, remit_key.key_kind, remit_key.key_value
  ), '[]'::jsonb)
    into result
  from public.club_membership_remit_keys as remit_key
  join public.club_memberships as membership
    on membership.id = remit_key.membership_id
   and membership.club_id = remit_key.club_id
  join public.people as person on person.id = membership.person_id
  where remit_key.club_id = p_club_id;

  return result;
end;
$$;

revoke all on function public.set_membership_remit_key(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.remove_membership_remit_key(uuid, uuid) from public, anon;
revoke all on function public.list_club_remit_keys(uuid) from public, anon;
grant execute on function public.set_membership_remit_key(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.remove_membership_remit_key(uuid, uuid) to authenticated;
grant execute on function public.list_club_remit_keys(uuid) to authenticated;

commit;
