-- A completed birthday task leaves the homepage action list but remains in
-- the member's message-centre history. Generic notifications stay visible.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '71000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'member-home-birthday@example.test', '', now(), '{}', '{}', now(), now()
);

insert into public.people (id, canonical_name, primary_email)
values ('72000000-0000-4000-8000-000000000001', '首頁生日社員', 'member-home-birthday@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values (
  '73000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  'member-home-birthday@example.test', '首頁生日社員', 'active'
);

insert into public.clubs (id, club_code, club_name, club_status, activated_at)
values ('74000000-0000-4000-8000-000000000001', 'HOME-BIRTHDAY', '首頁生日測試社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status, joined_on)
values (
  '75000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  'active', current_date
);

insert into public.birthday_wish_question_bank_items (id, club_id, question_key, prompt, tone, sort_order)
values (
  '76000000-0000-4000-8000-000000000001', null,
  'home_birthday_prompt', '請寫下一句生日祝福。', 'warm', 1
);

insert into public.birthday_wish_assignment_batches (
  id, club_id, birthday_year, birthday_month, batch_status, completed_at
) values (
  '77000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000001',
  2026, 9, 'completed', now()
);

insert into public.birthday_wish_campaigns (
  id, club_id, recipient_membership_id, birthday_year, birthday_date,
  campaign_status, assignment_batch_id, starts_at, ends_at
) values (
  '78000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000001',
  2026, date '2026-09-20', 'collecting',
  '77000000-0000-4000-8000-000000000001', now(), now() + interval '30 days'
);

insert into public.birthday_wish_campaign_participants (
  id, club_id, campaign_id, assignment_batch_id, assignee_membership_id,
  question_bank_item_id, question_prompt_snapshot, participant_status, responded_at
) values (
  '79000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000001',
  '78000000-0000-4000-8000-000000000001',
  '77000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000001',
  '76000000-0000-4000-8000-000000000001',
  '請寫下一句生日祝福。', 'submitted', now()
);

insert into public.birthday_wish_campaign_submissions (
  id, club_id, campaign_id, participant_id, author_app_account_id,
  content, submission_status, submitted_at, revision_number
) values (
  '7a000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000001',
  '78000000-0000-4000-8000-000000000001',
  '79000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000001',
  '祝你生日快樂！', 'submitted', now(), 1
);

insert into public.club_messages (
  id, club_id, author_app_account_id, title, body, audience_kind, status,
  action_path, published_at
) values
  (
    '7b000000-0000-4000-8000-000000000001',
    '74000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    '已完成的生日任務', '這則完成後不應留在首頁。', 'members', 'active',
    '/birthday-collection?clubId=74000000-0000-4000-8000-000000000001', now()
  ),
  (
    '7b000000-0000-4000-8000-000000000002',
    '74000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    '一般通知', '一般通知仍應留在首頁。', 'everyone', 'active', null, now() - interval '1 minute'
  );

insert into public.club_message_recipients (
  message_id, membership_id, club_id, birthday_participant_id
) values
  (
    '7b000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000001',
    '74000000-0000-4000-8000-000000000001',
    '79000000-0000-4000-8000-000000000001'
  ),
  (
    '7b000000-0000-4000-8000-000000000002',
    '75000000-0000-4000-8000-000000000001',
    '74000000-0000-4000-8000-000000000001',
    null
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
do $$
declare
  home jsonb;
begin
  home := public.get_my_member_home_projection('74000000-0000-4000-8000-000000000001');
  if home->'notifications'->>'unread_count' <> '1'
    or jsonb_array_length(home->'notifications'->'items') <> 1
    or home->'notifications'->'items'->0->>'title' <> '一般通知'
    or home::text like '%已完成的生日任務%' then
    raise exception 'completed birthday task remained in member home: %', home->'notifications';
  end if;
end;
$$;
reset role;

rollback;
