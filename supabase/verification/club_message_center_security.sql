-- Message centre: who may send, who receives, and who may read a delivery.
-- Run only against Supabase local. All synthetic fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '1f000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'msg-officer@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1f000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'msg-tagged@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1f000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'msg-untagged@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1f000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'msg-outsider@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('2f000000-0000-4000-8000-000000000001', '訊息幹部', 'msg-officer@example.test'),
  ('2f000000-0000-4000-8000-000000000002', '被指定社員', 'msg-tagged@example.test'),
  ('2f000000-0000-4000-8000-000000000003', '未指定社員', 'msg-untagged@example.test'),
  ('2f000000-0000-4000-8000-000000000004', '外社社員', 'msg-outsider@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('3f000000-0000-4000-8000-000000000001', '1f000000-0000-4000-8000-000000000001', '2f000000-0000-4000-8000-000000000001', 'msg-officer@example.test', '訊息幹部', 'active'),
  ('3f000000-0000-4000-8000-000000000002', '1f000000-0000-4000-8000-000000000002', '2f000000-0000-4000-8000-000000000002', 'msg-tagged@example.test', '被指定社員', 'active'),
  ('3f000000-0000-4000-8000-000000000003', '1f000000-0000-4000-8000-000000000003', '2f000000-0000-4000-8000-000000000003', 'msg-untagged@example.test', '未指定社員', 'active'),
  ('3f000000-0000-4000-8000-000000000004', '1f000000-0000-4000-8000-000000000004', '2f000000-0000-4000-8000-000000000004', 'msg-outsider@example.test', '外社社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at, suspended_at) values
  ('5f000000-0000-4000-8000-000000000001', 'MSG-A', '訊息中心測試社', 'active', now(), null),
  ('5f000000-0000-4000-8000-000000000002', 'MSG-B', '另一個扶輪社', 'active', now(), null);

insert into public.club_memberships (
  id, club_id, person_id, membership_status, joined_on, ended_on
) values
  ('6f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000001', '2f000000-0000-4000-8000-000000000001', 'active', current_date - 400, null),
  ('6f000000-0000-4000-8000-000000000002', '5f000000-0000-4000-8000-000000000001', '2f000000-0000-4000-8000-000000000002', 'active', current_date - 400, null),
  ('6f000000-0000-4000-8000-000000000003', '5f000000-0000-4000-8000-000000000001', '2f000000-0000-4000-8000-000000000003', 'active', current_date - 400, null),
  ('6f000000-0000-4000-8000-000000000004', '5f000000-0000-4000-8000-000000000002', '2f000000-0000-4000-8000-000000000004', 'active', current_date - 400, null);

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values
  ('7f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000001', '3f000000-0000-4000-8000-000000000001', 'president', 'active', '3f000000-0000-4000-8000-000000000001');

-- The officer sends one message to the whole club and one to a single tag.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1f000000-0000-4000-8000-000000000001', true);
do $officer$
declare
  tag_id uuid;
  everyone jsonb;
  targeted jsonb;
begin
  tag_id := (public.create_club_member_tag(
    '5f000000-0000-4000-8000-000000000001', '訊息對象', null
  ) ->> 'tag_id')::uuid;
  perform public.set_membership_tags(
    '5f000000-0000-4000-8000-000000000001',
    '6f000000-0000-4000-8000-000000000002',
    array[tag_id]
  );

  everyone := public.create_club_message(
    '5f000000-0000-4000-8000-000000000001', '全社公告', '這則給全社'
  );
  targeted := public.create_club_message(
    '5f000000-0000-4000-8000-000000000001', '理事會通知', '這則只給被指定的人', array[tag_id]
  );

  if (everyone ->> 'recipient_count')::int <> 3 then
    raise exception 'A whole-club message did not reach every active member.';
  end if;
  if (targeted ->> 'recipient_count')::int <> 1 then
    raise exception 'A tagged message reached more members than the tag holds.';
  end if;

  -- The sender's own copy arrives already read, so writing to the club never
  -- puts a badge on the sender's own navigation.
  if (public.list_my_club_messages('5f000000-0000-4000-8000-000000000001') ->> 'unread_count')::int <> 0 then
    raise exception 'The author was left with an unread copy of their own message.';
  end if;

  -- A tag that belongs to no club cannot be addressed.
  begin
    perform public.create_club_message(
      '5f000000-0000-4000-8000-000000000001', '偽造對象', '內容', array[gen_random_uuid()]
    );
    raise exception 'An unknown tag was accepted as a message audience.';
  exception when invalid_parameter_value then null;
  end;

  -- Nor may a message name a membership from another club.
  begin
    perform public.create_club_message(
      '5f000000-0000-4000-8000-000000000001', '跨社指定', '內容',
      '{}'::uuid[], array['6f000000-0000-4000-8000-000000000004'::uuid]
    );
    raise exception 'A membership from another club was accepted as a recipient.';
  exception when invalid_parameter_value then null;
  end;

  -- Tags and named members together would leave "who got this" answerable two
  -- ways, so the pair is refused rather than merged.
  begin
    perform public.create_club_message(
      '5f000000-0000-4000-8000-000000000001', '兩種對象', '內容',
      array[tag_id], array['6f000000-0000-4000-8000-000000000002'::uuid]
    );
    raise exception 'A message was accepted with both a tag and a named member.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.create_club_message('5f000000-0000-4000-8000-000000000001', '   ', '內容');
    raise exception 'A blank title was accepted.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.create_club_message('5f000000-0000-4000-8000-000000000001', '標題', '   ');
    raise exception 'A blank body was accepted.';
  exception when invalid_parameter_value then null;
  end;

  perform set_config('msg.everyone', everyone ->> 'id', true);
  perform set_config('msg.targeted', targeted ->> 'id', true);
  perform set_config('msg.tag', tag_id::text, true);
end $officer$;
reset role;

-- An ordinary member may not send to the club at all: this is a notification
-- channel, not a board.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1f000000-0000-4000-8000-000000000003', true);
do $plain_member$
begin
  begin
    perform public.create_club_message('5f000000-0000-4000-8000-000000000001', '社員公告', '內容');
    raise exception 'A plain member sent a club message.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.list_club_message_deliveries(
      '5f000000-0000-4000-8000-000000000001', current_setting('msg.everyone')::uuid
    );
    raise exception 'A plain member read the delivery list of a message.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.list_club_sent_messages('5f000000-0000-4000-8000-000000000001');
    raise exception 'A plain member read the club''s sent messages.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.delete_club_message(
      '5f000000-0000-4000-8000-000000000001', current_setting('msg.everyone')::uuid
    );
    raise exception 'A plain member withdrew a club message.';
  exception when insufficient_privilege then null;
  end;
end $plain_member$;
reset role;

-- The untagged member receives the whole-club message only.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1f000000-0000-4000-8000-000000000003', true);
do $untagged$
declare
  inbox jsonb;
  listed text;
begin
  inbox := public.list_my_club_messages('5f000000-0000-4000-8000-000000000001');
  listed := inbox::text;

  if listed like '%' || current_setting('msg.targeted') || '%' then
    raise exception 'An untagged member received a message addressed to a tag.';
  end if;
  if listed not like '%' || current_setting('msg.everyone') || '%' then
    raise exception 'An untagged member lost a message addressed to the whole club.';
  end if;
  if (inbox ->> 'unread_count')::int <> 1 then
    raise exception 'The unread count did not match the delivered messages.';
  end if;

  -- Not a recipient, so there is nothing to mark: the message must not even be
  -- confirmed to exist.
  begin
    perform public.mark_club_message_read(
      '5f000000-0000-4000-8000-000000000001', current_setting('msg.targeted')::uuid
    );
    raise exception 'A member marked a message they never received as read.';
  exception when no_data_found then null;
  end;

  perform public.mark_club_message_read(
    '5f000000-0000-4000-8000-000000000001', current_setting('msg.everyone')::uuid
  );
  if (public.list_my_club_messages('5f000000-0000-4000-8000-000000000001') ->> 'unread_count')::int <> 0 then
    raise exception 'Reading a message did not clear its unread state.';
  end if;

  -- Reading the same message again must not move the timestamp it was first
  -- read at, which is what an officer's progress view reports.
  perform set_config(
    'msg.first_read',
    (public.mark_club_message_read(
      '5f000000-0000-4000-8000-000000000001', current_setting('msg.everyone')::uuid
    ) ->> 'read_at'),
    true
  );
  if (public.mark_club_message_read(
        '5f000000-0000-4000-8000-000000000001', current_setting('msg.everyone')::uuid
      ) ->> 'read_at') <> current_setting('msg.first_read') then
    raise exception 'Marking an already-read message moved its read timestamp.';
  end if;

  -- The tables themselves stay closed; every read goes through an RPC.
  begin
    perform 1 from public.club_messages;
    raise exception 'A member selected directly from club_messages.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.club_message_recipients;
    raise exception 'A member selected directly from club_message_recipients.';
  exception when insufficient_privilege then null;
  end;
end $untagged$;
reset role;

-- The tagged member receives both.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1f000000-0000-4000-8000-000000000002', true);
do $tagged$
declare
  inbox jsonb;
begin
  inbox := public.list_my_club_messages('5f000000-0000-4000-8000-000000000001');
  if inbox::text not like '%' || current_setting('msg.targeted') || '%' then
    raise exception 'A tagged member did not receive the message addressed to them.';
  end if;
  if (inbox ->> 'unread_count')::int <> 2 then
    raise exception 'A tagged member''s unread count did not include both messages.';
  end if;

  if (public.count_my_unread_club_messages() ->> 'total')::int <> 2 then
    raise exception 'The cross-club unread total disagreed with the club inbox.';
  end if;
end $tagged$;
reset role;

-- A member of another club has no inbox here and cannot reach one.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1f000000-0000-4000-8000-000000000004', true);
do $outsider$
begin
  begin
    perform public.list_my_club_messages('5f000000-0000-4000-8000-000000000001');
    raise exception 'A member of another club read this club''s inbox.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.create_club_message('5f000000-0000-4000-8000-000000000001', '外社公告', '內容');
    raise exception 'A member of another club sent into this club.';
  exception when insufficient_privilege then null;
  end;

  if (public.count_my_unread_club_messages() ->> 'total')::int <> 0 then
    raise exception 'Another club''s messages leaked into an outsider''s unread total.';
  end if;
end $outsider$;
reset role;

-- The officer can see who has read what, and withdrawing a message removes it
-- from the members who had it.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1f000000-0000-4000-8000-000000000001', true);
do $progress$
declare
  deliveries jsonb;
begin
  deliveries := public.list_club_message_deliveries(
    '5f000000-0000-4000-8000-000000000001', current_setting('msg.everyone')::uuid
  );
  if (deliveries ->> 'recipient_count')::int <> 3 then
    raise exception 'The delivery list did not cover every recipient.';
  end if;
  -- The author's own copy plus the member who read it above.
  if (deliveries ->> 'read_count')::int <> 2 then
    raise exception 'The delivery list did not reflect who has read the message.';
  end if;

  perform public.delete_club_message(
    '5f000000-0000-4000-8000-000000000001', current_setting('msg.everyone')::uuid
  );

  begin
    perform public.delete_club_message(
      '5f000000-0000-4000-8000-000000000001', current_setting('msg.everyone')::uuid
    );
    raise exception 'A withdrawn message was withdrawn a second time.';
  exception when no_data_found then null;
  end;
end $progress$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '1f000000-0000-4000-8000-000000000002', true);
do $after_withdrawal$
declare
  inbox jsonb;
begin
  inbox := public.list_my_club_messages('5f000000-0000-4000-8000-000000000001');
  if inbox::text like '%' || current_setting('msg.everyone') || '%' then
    raise exception 'A withdrawn message stayed in a member''s inbox.';
  end if;
  if (inbox ->> 'unread_count')::int <> 1 then
    raise exception 'Withdrawing a message did not clear its unread state.';
  end if;
end $after_withdrawal$;
reset role;

-- Delivery history is never erased, by anyone, including a direct connection.
do $retention$
begin
  begin
    delete from public.club_messages
    where id = current_setting('msg.everyone')::uuid;
    raise exception 'A club message was hard deleted.';
  exception when insufficient_privilege then null;
  end;

  if not exists (
    select 1 from public.club_message_recipients
    where message_id = current_setting('msg.everyone')::uuid
  ) then
    raise exception 'Withdrawing a message destroyed the record of who received it.';
  end if;
end $retention$;

rollback;
