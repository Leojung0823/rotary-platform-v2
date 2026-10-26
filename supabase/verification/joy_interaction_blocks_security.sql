-- Member interaction blocks: tenant isolation, server-side enforcement,
-- report availability, existing-history preservation, and audited unblock.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'joy-blocker@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'joy-blocked@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'joy-block-outsider@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'joy-block-suspended@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('a2000000-0000-4000-8000-000000000001', '封鎖設定社員', 'joy-blocker@example.test'),
  ('a2000000-0000-4000-8000-000000000002', '被封鎖社員', 'joy-blocked@example.test'),
  ('a2000000-0000-4000-8000-000000000003', '外社社員', 'joy-block-outsider@example.test'),
  ('a2000000-0000-4000-8000-000000000004', '停權社員', 'joy-block-suspended@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'joy-blocker@example.test', '封鎖設定社員', 'active'),
  ('a3000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'joy-blocked@example.test', '被封鎖社員', 'active'),
  ('a3000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000003', 'joy-block-outsider@example.test', '外社社員', 'active'),
  ('a3000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000004', 'joy-block-suspended@example.test', '停權社員', 'suspended');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('a5000000-0000-4000-8000-000000000001', 'JOY-BLOCK-A', '封鎖驗證甲社', 'active', now()),
  ('a5000000-0000-4000-8000-000000000002', 'JOY-BLOCK-B', '封鎖驗證乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('a6000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'active'),
  ('a6000000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'active'),
  ('a6000000-0000-4000-8000-000000000003', 'a5000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000003', 'active'),
  ('a6000000-0000-4000-8000-000000000004', 'a5000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000004', 'active');

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values (
  'a7000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001', 'president', 'active', 'a3000000-0000-4000-8000-000000000001'
);

do $$
begin
  if not exists (select 1 from public.platform_feature_flags
      where feature_key = 'joy_wall_v1' and enabled and updated_by_kind = 'system') then
    raise exception 'Joy Wall must be automatically enabled by deployment migration';
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.joy_member_blocks'::regclass)
    or has_table_privilege('authenticated', 'public.joy_member_blocks', 'SELECT')
    or has_table_privilege('authenticated', 'public.joy_member_blocks', 'INSERT')
    or has_table_privilege('service_role', 'public.joy_member_blocks', 'SELECT')
    or has_function_privilege('anon', 'public.list_my_joy_member_blocks(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.set_my_joy_member_block(uuid,uuid,boolean)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.joy_members_have_interaction_block(uuid,uuid,uuid)', 'EXECUTE') then
    raise exception 'Joy member block table or RPC privilege boundary is incorrect';
  end if;
  if not has_function_privilege('authenticated', 'public.list_my_joy_member_blocks(uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.set_my_joy_member_block(uuid,uuid,boolean)', 'EXECUTE') then
    raise exception 'Authenticated members cannot manage their own block list';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
do $$
declare
  post_a jsonb;
  iou jsonb;
  prompt jsonb;
begin
  post_a := public.create_joy_post(
    'a5000000-0000-4000-8000-000000000001', 'gratitude', null, '封鎖後仍保留的內容', 'club', '{}'::uuid[]
  );
  iou := public.create_joy_iou(
    'a5000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000002',
    null, '封鎖前已提出的承諾', null
  );
  prompt := public.create_joy_question_prompt('a5000000-0000-4000-8000-000000000001', '封鎖驗證派題');
  perform set_config('joy.block.post_a', post_a->>'id', true);
  perform set_config('joy.block.iou', iou->>'id', true);
  perform set_config('joy.block.prompt', prompt->>'id', true);
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
do $$
declare post_b jsonb;
begin
  post_b := public.create_joy_post(
    'a5000000-0000-4000-8000-000000000001', 'welcome', null, '封鎖前的社員分享', 'club', '{}'::uuid[]
  );
  perform set_config('joy.block.post_b', post_b->>'id', true);
  post_b := public.create_joy_post(
    'a5000000-0000-4000-8000-000000000001', 'welcome', null, '封鎖前已指定的分享', 'selected',
    array['a6000000-0000-4000-8000-000000000001'::uuid]
  );
  perform set_config('joy.block.targeted_post', post_b->>'id', true);
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
do $$
declare
  block_result jsonb;
  batch jsonb;
begin
  block_result := public.set_my_joy_member_block(
    'a5000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000002', true
  );
  if not coalesce((block_result->>'blocked')::boolean, false)
    or jsonb_array_length(public.list_my_joy_member_blocks('a5000000-0000-4000-8000-000000000001')->'blocked_members') <> 1 then
    raise exception 'Blocker cannot read their own block list';
  end if;
  perform public.acknowledge_joy_post_receipt(
    'a5000000-0000-4000-8000-000000000001', current_setting('joy.block.targeted_post')::uuid
  );
  batch := public.dispatch_joy_question_batch(
    'a5000000-0000-4000-8000-000000000001', '幹部正式派題',
    array['a6000000-0000-4000-8000-000000000002'::uuid],
    'a8000000-0000-4000-8000-000000000001'
  );
  if (batch->>'assignment_count')::integer <> 1 then
    raise exception 'Officer dispatch did not preserve the selected task';
  end if;
  perform set_config('joy.block.batch', batch->>'id', true);
  begin
    perform public.set_my_joy_member_block(
      'a5000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', true
    );
    raise exception 'Self-block was accepted';
  exception when invalid_parameter_value then
    if sqlerrm <> 'invalid_joy_block_target' then raise; end if;
  end;
  begin
    perform public.set_my_joy_member_block(
      'a5000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000003', true
    );
    raise exception 'Cross-club member was accepted as a block target';
  exception when invalid_parameter_value then
    if sqlerrm <> 'invalid_joy_block_target' then raise; end if;
  end;
end $$;
reset role;
do $$
begin
  if not exists (
    select 1 from public.joy_post_acknowledgements as acknowledgement
    where acknowledgement.post_id = current_setting('joy.block.targeted_post')::uuid
      and acknowledgement.membership_id = 'a6000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Existing selected-share receipt acknowledgement was blocked';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
do $$
declare blocked_list jsonb;
begin
  blocked_list := public.list_my_joy_member_blocks('a5000000-0000-4000-8000-000000000001');
  if jsonb_array_length(blocked_list->'blocked_members') <> 0 then
    raise exception 'Member can see another member''s outgoing block list';
  end if;

  begin
    perform public.create_joy_comment(
      'a5000000-0000-4000-8000-000000000001', current_setting('joy.block.post_a')::uuid,
      null, 'comment', '被封鎖後的留言'
    );
    raise exception 'Blocked member created a comment';
  exception when insufficient_privilege then
    if sqlerrm <> 'joy_interaction_blocked' then raise; end if;
  end;

  begin
    perform public.toggle_joy_reaction(
      'a5000000-0000-4000-8000-000000000001', current_setting('joy.block.post_a')::uuid, 'heart'
    );
    raise exception 'Blocked member reacted to blocker content';
  exception when insufficient_privilege then
    if sqlerrm <> 'joy_interaction_blocked' then raise; end if;
  end;

  begin
    perform public.create_joy_post(
      'a5000000-0000-4000-8000-000000000001', 'gratitude', null, '新指定分享', 'selected',
      array['a6000000-0000-4000-8000-000000000001'::uuid]
    );
    raise exception 'Blocked member created targeted content for blocker';
  exception when insufficient_privilege then
    if sqlerrm <> 'joy_interaction_blocked' then raise; end if;
  end;

  begin
    perform public.create_joy_iou(
      'a5000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001',
      null, '新 IOU', null
    );
    raise exception 'Blocked member created a new IOU for blocker';
  exception when insufficient_privilege then
    if sqlerrm <> 'joy_interaction_blocked' then raise; end if;
  end;

  -- Existing promises and member safety reports remain usable after a block.
  perform public.act_joy_iou(
    'a5000000-0000-4000-8000-000000000001', current_setting('joy.block.iou')::uuid, 'accept', null
  );
  perform public.report_joy_post(
    'a5000000-0000-4000-8000-000000000001', current_setting('joy.block.post_a')::uuid, 'harassment'
  );

  if not (public.list_joy_posts('a5000000-0000-4000-8000-000000000001', null, null, 50)::text
      like '%' || current_setting('joy.block.post_a') || '%') then
    raise exception 'Blocked member lost access to previously visible content';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
do $$
begin
  begin
    perform public.create_joy_comment(
      'a5000000-0000-4000-8000-000000000001', current_setting('joy.block.post_b')::uuid,
      null, 'comment', '封鎖者也不能回覆對方的公開貼文'
    );
    raise exception 'Blocker interacted with blocked member content';
  exception when insufficient_privilege then
    if sqlerrm <> 'joy_interaction_blocked' then raise; end if;
  end;
end $$;
reset role;

select set_config('joy.block.batch_post', (
  select post_id::text from public.joy_question_batch_assignments
  where batch_id = current_setting('joy.block.batch')::uuid
), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
do $$
begin
  perform public.create_joy_comment(
    'a5000000-0000-4000-8000-000000000001', current_setting('joy.block.batch_post')::uuid,
    null, 'answer', '回覆幹部正式派發的問題'
  );
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000004', true);
do $$
begin
  begin
    perform public.list_my_joy_member_blocks('a5000000-0000-4000-8000-000000000001');
    raise exception 'Suspended account listed interaction blocks';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
do $$
declare block_result jsonb;
begin
  block_result := public.set_my_joy_member_block(
    'a5000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000002', false
  );
  if coalesce((block_result->>'blocked')::boolean, true)
    or jsonb_array_length(public.list_my_joy_member_blocks('a5000000-0000-4000-8000-000000000001')->'blocked_members') <> 0 then
    raise exception 'Unblock did not restore the member control';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
do $$
begin
  perform public.create_joy_comment(
    'a5000000-0000-4000-8000-000000000001', current_setting('joy.block.post_a')::uuid,
    null, 'comment', '解除封鎖後可留言'
  );
end $$;
reset role;

do $$
begin
  if not exists (select 1 from public.joy_wall_audit_events
      where club_id = 'a5000000-0000-4000-8000-000000000001'
        and object_kind = 'member_block' and object_id = 'a6000000-0000-4000-8000-000000000002'
        and event_type = 'member_blocked')
    or not exists (select 1 from public.joy_wall_audit_events
      where club_id = 'a5000000-0000-4000-8000-000000000001'
        and object_kind = 'member_block' and object_id = 'a6000000-0000-4000-8000-000000000002'
        and event_type = 'member_unblocked') then
    raise exception 'Block or unblock action is missing audit history';
  end if;
end $$;

rollback;
