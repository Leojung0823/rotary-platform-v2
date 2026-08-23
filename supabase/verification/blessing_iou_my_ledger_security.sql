-- Blessing IOU: optional text, and the member-facing ledger.
-- Run only against Supabase local. All synthetic fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '1b000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'iou-ledger-author@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1b000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'iou-ledger-peer@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('2b000000-0000-4000-8000-000000000001', '帳本作者', 'iou-ledger-author@example.test'),
  ('2b000000-0000-4000-8000-000000000002', '同社社員', 'iou-ledger-peer@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('3b000000-0000-4000-8000-000000000001', '1b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001', 'iou-ledger-author@example.test', '帳本作者', 'active'),
  ('3b000000-0000-4000-8000-000000000002', '1b000000-0000-4000-8000-000000000002', '2b000000-0000-4000-8000-000000000002', 'iou-ledger-peer@example.test', '同社社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at, suspended_at) values
  ('5b000000-0000-4000-8000-000000000001', 'IOU-L', 'IOU 帳本測試社', 'active', now(), null);

insert into public.club_memberships (
  id, club_id, person_id, membership_status, joined_on, ended_on
) values
  ('6b000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001', 'active', current_date - 500, null),
  ('6b000000-0000-4000-8000-000000000002', '5b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000002', 'active', current_date - 500, null);

do $grants$
begin
  if has_function_privilege('anon', 'public.get_my_blessing_iou_summary(uuid)', 'execute') then
    raise exception 'The member IOU ledger is executable by anon.';
  end if;
  if has_function_privilege('anon', 'public.get_my_blessing_iou_ledger(uuid,integer)', 'execute') then
    raise exception 'The Rotary-year member IOU ledger is executable by anon.';
  end if;
end $grants$;

-- The author writes three entries: text only, amount only, and both.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1b000000-0000-4000-8000-000000000001', true);
do $author$
declare
  text_only jsonb;
  amount_only jsonb;
  text_and_amount jsonb;
  summary jsonb;
  totals jsonb;
begin
  text_only := public.create_blessing_iou_entry(
    '5b000000-0000-4000-8000-000000000001', '祝大家平安健康', null, true
  );
  -- The point of the change: a pledge with no words is now a valid entry.
  amount_only := public.create_blessing_iou_entry(
    '5b000000-0000-4000-8000-000000000001', '', 3000, true
  );
  text_and_amount := public.create_blessing_iou_entry(
    '5b000000-0000-4000-8000-000000000001', '祝福並捐款', 2000, true
  );

  -- An entry with neither text nor amount still says nothing and is refused.
  begin
    perform public.create_blessing_iou_entry(
      '5b000000-0000-4000-8000-000000000001', '   ', null, true
    );
    raise exception 'An entry with neither text nor amount was accepted.';
  exception when invalid_parameter_value then
    null;
  end;

  -- Same rule when editing.
  begin
    perform public.update_own_blessing_iou_entry(
      '5b000000-0000-4000-8000-000000000001',
      (amount_only ->> 'id')::uuid,
      '', null, true
    );
    raise exception 'An edit emptying both text and amount was accepted.';
  exception when invalid_parameter_value then
    null;
  end;

  summary := public.get_my_blessing_iou_summary('5b000000-0000-4000-8000-000000000001');
  totals := summary -> 'totals';
  if (totals ->> 'entry_count')::integer <> 3 then
    raise exception 'Ledger did not count the author''s own entries.';
  end if;
  if (totals ->> 'pledged_total')::numeric <> 5000 then
    raise exception 'Ledger pledged total is wrong.';
  end if;
  if (totals ->> 'collected_total')::numeric <> 0
     or (totals ->> 'outstanding_total')::numeric <> 5000 then
    raise exception 'Ledger collected/outstanding totals are wrong before any collection.';
  end if;
  if jsonb_array_length(summary -> 'entries') <> 3 then
    raise exception 'Ledger did not return the author''s entry detail.';
  end if;

  perform set_config('blessing.text_only', text_only ->> 'id', true);
  perform set_config('blessing.both', text_and_amount ->> 'id', true);
end $author$;
reset role;

-- A posted collection against one entry, recorded outside the member's own
-- session because recording collections is an officer action.
insert into public.blessing_iou_collections (
  club_id, entry_id, amount_received, received_on, payment_method,
  recorded_by_app_account_id, collection_status
) values (
  '5b000000-0000-4000-8000-000000000001',
  current_setting('blessing.both')::uuid,
  1200, current_date, 'cash',
  '3b000000-0000-4000-8000-000000000001', 'posted'
);

-- A reversed collection must not count towards what the member has paid.
insert into public.blessing_iou_collections (
  club_id, entry_id, amount_received, received_on, payment_method,
  recorded_by_app_account_id, collection_status,
  reversed_by_app_account_id, reversed_at, reversal_reason
) values (
  '5b000000-0000-4000-8000-000000000001',
  current_setting('blessing.both')::uuid,
  500, current_date, 'cash',
  '3b000000-0000-4000-8000-000000000001', 'reversed',
  '3b000000-0000-4000-8000-000000000001', now(), '測試沖銷'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '1b000000-0000-4000-8000-000000000001', true);
do $collected$
declare
  totals jsonb;
begin
  totals := public.get_my_blessing_iou_summary('5b000000-0000-4000-8000-000000000001') -> 'totals';
  if (totals ->> 'collected_total')::numeric <> 1200 then
    raise exception 'Ledger did not count the posted collection, or counted the reversed one.';
  end if;
  if (totals ->> 'outstanding_total')::numeric <> 3800 then
    raise exception 'Ledger outstanding total is wrong after a collection.';
  end if;
end $collected$;
reset role;

-- Fixed 6/30 and 7/1 fixtures prove half-open Rotary-year boundaries without
-- depending on the day the verification suite happens to run.
insert into public.blessing_iou_entries (
  id, club_id, author_membership_id, author_app_account_id,
  blessing_text, pledged_amount, amount_visibility, pledged_on
) values
  ('7b000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000001', '6b000000-0000-4000-8000-000000000001', '3b000000-0000-4000-8000-000000000001', '2021 年度最後一天', 1000, 'private', '2022-06-30'),
  ('7b000000-0000-4000-8000-000000000002', '5b000000-0000-4000-8000-000000000001', '6b000000-0000-4000-8000-000000000001', '3b000000-0000-4000-8000-000000000001', '2022 年度第一天', 3000, 'private', '2022-07-01'),
  ('7b000000-0000-4000-8000-000000000003', '5b000000-0000-4000-8000-000000000001', '6b000000-0000-4000-8000-000000000001', '3b000000-0000-4000-8000-000000000001', '2022 年度最後一天', 2000, 'private', '2023-06-30'),
  ('7b000000-0000-4000-8000-000000000004', '5b000000-0000-4000-8000-000000000001', '6b000000-0000-4000-8000-000000000001', '3b000000-0000-4000-8000-000000000001', '2023 年度第一天', 4000, 'private', '2023-07-01');

set local role authenticated;
select set_config('request.jwt.claim.sub', '1b000000-0000-4000-8000-000000000001', true);
do $years$
declare
  year_2021 jsonb;
  year_2022 jsonb;
  year_2023 jsonb;
  all_years jsonb;
  current_year jsonb;
  stale_club jsonb;
begin
  year_2021 := public.get_my_blessing_iou_ledger(
    '5b000000-0000-4000-8000-000000000001', 2021
  );
  year_2022 := public.get_my_blessing_iou_ledger(
    '5b000000-0000-4000-8000-000000000001', 2022
  );
  year_2023 := public.get_my_blessing_iou_ledger(
    '5b000000-0000-4000-8000-000000000001', 2023
  );
  all_years := public.get_my_blessing_iou_ledger(
    '5b000000-0000-4000-8000-000000000001', null
  );
  current_year := public.get_my_blessing_iou_ledger(
    '5b000000-0000-4000-8000-000000000001', 0
  );
  stale_club := public.get_my_blessing_iou_ledger(
    '5b000000-0000-4000-8000-000000000099', 2022
  );

  if (year_2021->'totals'->>'entry_count')::integer <> 1
     or (year_2021->'totals'->>'pledged_total')::numeric <> 1000 then
    raise exception '6/30 did not remain in the preceding Rotary year.';
  end if;
  if (year_2022->'totals'->>'entry_count')::integer <> 2
     or (year_2022->'totals'->>'pledged_total')::numeric <> 5000 then
    raise exception '7/1 through the following 6/30 was not one Rotary year.';
  end if;
  if (year_2023->'totals'->>'entry_count')::integer <> 1
     or (year_2023->'totals'->>'pledged_total')::numeric <> 4000 then
    raise exception 'The following 7/1 leaked into the prior Rotary year.';
  end if;
  if (all_years->'totals'->>'entry_count')::integer <> 7
     or (all_years->'totals'->>'pledged_total')::numeric <> 15000 then
    raise exception 'All-years totals did not include every caller-owned active entry.';
  end if;
  if all_years->'selected_year' <> 'null'::jsonb then
    raise exception 'A null year did not remain the explicit all-years selection.';
  end if;
  if current_year->>'selected_year' <> current_year->>'current_year' then
    raise exception 'The omitted/current sentinel did not select the club-local Rotary year.';
  end if;
  if stale_club->>'selected_club_id' <> '5b000000-0000-4000-8000-000000000001' then
    raise exception 'A stale club filter did not safely fall back to the caller''s own club.';
  end if;
  if not (all_years->'available_years' @> '[2021,2022,2023]'::jsonb) then
    raise exception 'Available Rotary years omitted a year containing caller-owned data.';
  end if;
  if jsonb_array_length(year_2022->'entries') <> 2 then
    raise exception 'The bounded detail did not match the selected Rotary year.';
  end if;
end $years$;
reset role;

-- Another member of the same club must see only their own ledger, never the
-- author's entries or amounts.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1b000000-0000-4000-8000-000000000002', true);
do $peer$
declare
  summary jsonb;
begin
  summary := public.get_my_blessing_iou_summary('5b000000-0000-4000-8000-000000000001');
  if jsonb_array_length(summary -> 'entries') <> 0 then
    raise exception 'A club peer saw entries that are not their own.';
  end if;
  if (summary -> 'totals' ->> 'pledged_total')::numeric <> 0 then
    raise exception 'A club peer saw another member''s pledged total.';
  end if;
  if summary::text like '%' || current_setting('blessing.both') || '%' then
    raise exception 'A club peer received another member''s entry id.';
  end if;

  summary := public.get_my_blessing_iou_ledger(
    '5b000000-0000-4000-8000-000000000001', null
  );
  if jsonb_array_length(summary -> 'entries') <> 0
     or (summary -> 'totals' ->> 'pledged_total')::numeric <> 0 then
    raise exception 'A club peer saw another member''s filtered ledger.';
  end if;
end $peer$;
reset role;

-- Account lifecycle is rechecked for every projection request.
update public.app_accounts set account_status = 'suspended'
where id = '3b000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '1b000000-0000-4000-8000-000000000001', true);
do $suspended$
begin
  begin
    perform public.get_my_blessing_iou_ledger(
      '5b000000-0000-4000-8000-000000000001', null
    );
    raise exception 'A suspended account retained its member ledger.';
  exception when insufficient_privilege then
    null;
  end;
end $suspended$;
reset role;

rollback;
