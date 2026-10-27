-- Discussion topics: audience isolation, task completion, comments, voting
-- deadlines and anonymity boundaries. Fixtures run against local DB and roll back.
begin;
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','1d000000-0000-4000-8000-000000000001','authenticated','authenticated','topic-officer@example.test','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','1d000000-0000-4000-8000-000000000002','authenticated','authenticated','topic-invited@example.test','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','1d000000-0000-4000-8000-000000000003','authenticated','authenticated','topic-member@example.test','',now(),'{}','{}',now(),now());
insert into public.people (id,canonical_name,primary_email) values
('2d000000-0000-4000-8000-000000000001','議題幹部','topic-officer@example.test'),
('2d000000-0000-4000-8000-000000000002','受邀社員','topic-invited@example.test'),
('2d000000-0000-4000-8000-000000000003','一般社員','topic-member@example.test');
insert into public.app_accounts (id,auth_user_id,person_id,login_email,account_display_name,account_status) values
('3d000000-0000-4000-8000-000000000001','1d000000-0000-4000-8000-000000000001','2d000000-0000-4000-8000-000000000001','topic-officer@example.test','議題幹部','active'),
('3d000000-0000-4000-8000-000000000002','1d000000-0000-4000-8000-000000000002','2d000000-0000-4000-8000-000000000002','topic-invited@example.test','受邀社員','active'),
('3d000000-0000-4000-8000-000000000003','1d000000-0000-4000-8000-000000000003','2d000000-0000-4000-8000-000000000003','topic-member@example.test','一般社員','active');
insert into public.clubs (id,club_code,club_name,club_status,activated_at,suspended_at) values
('5d000000-0000-4000-8000-000000000001','TOPIC-A','議題測試社','active',now(),null),
('5d000000-0000-4000-8000-000000000002','TOPIC-B','議題鄰社','active',now(),null);
insert into public.club_memberships (id,club_id,person_id,membership_status,joined_on,ended_on) values
('6d000000-0000-4000-8000-000000000001','5d000000-0000-4000-8000-000000000001','2d000000-0000-4000-8000-000000000001','active',current_date-900,null),
('6d000000-0000-4000-8000-000000000002','5d000000-0000-4000-8000-000000000001','2d000000-0000-4000-8000-000000000002','active',current_date-900,null),
('6d000000-0000-4000-8000-000000000003','5d000000-0000-4000-8000-000000000001','2d000000-0000-4000-8000-000000000003','active',current_date-900,null);
insert into public.club_role_assignments (id,club_id,app_account_id,role_key,assignment_status,granted_by_app_account_id) values
('7d000000-0000-4000-8000-000000000001','5d000000-0000-4000-8000-000000000001','3d000000-0000-4000-8000-000000000001','president','active','3d000000-0000-4000-8000-000000000001');

do $boundary$
begin
 if has_table_privilege('authenticated','public.club_discussion_topics','select')
 or has_table_privilege('authenticated','public.club_discussion_topic_votes','select')
 or has_function_privilege('authenticated','public.discussion_topic_includes_membership(uuid,uuid,uuid)','execute')
 or has_function_privilege('authenticated','public.discussion_topic_projection(uuid,uuid,uuid,boolean)','execute')
 or has_function_privilege('anon','public.create_club_discussion_topic(uuid,text,text,timestamptz,text,uuid[],uuid[],boolean,jsonb)','execute') then
  raise exception 'Discussion data or an internal helper is directly exposed.';
 end if;
end $boundary$;

set local role authenticated;
select set_config('request.jwt.claim.sub','1d000000-0000-4000-8000-000000000003',true);
do $denied$
begin
 begin
  perform public.create_club_discussion_topic('5d000000-0000-4000-8000-000000000001','不應可發佈','一般社員不能建立。',
   now()+interval '2 days','all','{}'::uuid[],'{}'::uuid[],true,'["同意","不同意"]'::jsonb);
  raise exception 'A regular member published a topic.';
 exception when insufficient_privilege then null; end;
end $denied$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','1d000000-0000-4000-8000-000000000001',true);
do $setup$
declare tag_id uuid; targeted jsonb; specific jsonb; whole_club jsonb;
begin
 tag_id := (public.create_club_member_tag('5d000000-0000-4000-8000-000000000001','理事會',null)->>'tag_id')::uuid;
 perform public.set_membership_tags('5d000000-0000-4000-8000-000000000001','6d000000-0000-4000-8000-000000000002',array[tag_id]);
 targeted := public.create_club_discussion_topic('5d000000-0000-4000-8000-000000000001','理事會服務方向','請理事分享並投票。',
   now()+interval '2 days','tags',array[tag_id],'{}'::uuid[],true,'["擴大服務","維持現況"]'::jsonb);
 specific := public.create_club_discussion_topic('5d000000-0000-4000-8000-000000000001','指定社員提案','請指定社員提供意見。',
   now()+interval '2 days','people','{}'::uuid[],array['6d000000-0000-4000-8000-000000000002'::uuid],true,'["支持","不支持"]'::jsonb);
 whole_club := public.create_club_discussion_topic('5d000000-0000-4000-8000-000000000001','年度活動時間','請全體社員選擇。',
   now()+interval '3 days','all','{}'::uuid[],'{}'::uuid[],false,'["平日晚上","週末白天"]'::jsonb);
 targeted := public.get_club_discussion_topic('5d000000-0000-4000-8000-000000000001',(targeted->>'id')::uuid);
 specific := public.get_club_discussion_topic('5d000000-0000-4000-8000-000000000001',(specific->>'id')::uuid);
 whole_club := public.get_club_discussion_topic('5d000000-0000-4000-8000-000000000001',(whole_club->>'id')::uuid);
 perform set_config('discussion.targeted_id',targeted->>'id',true);
 perform set_config('discussion.specific_id',specific->>'id',true);
 perform set_config('discussion.whole_id',whole_club->>'id',true);
 perform set_config('discussion.target_option',targeted->'options'->0->>'id',true);
 perform set_config('discussion.whole_option',whole_club->'options'->0->>'id',true);
end $setup$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','1d000000-0000-4000-8000-000000000002',true);
do $target_member$
declare visible jsonb; core_tasks jsonb; all_tasks jsonb; detail jsonb;
begin
 visible := public.list_my_club_discussion_topics('5d000000-0000-4000-8000-000000000001');
 if jsonb_array_length(visible->'topics')<>3
   or not exists(select 1 from jsonb_array_elements(visible->'topics') t where t->>'id'=current_setting('discussion.specific_id'))
 then raise exception 'Targeted member did not see all three allowed topics.'; end if;
 core_tasks := public.list_my_member_pending_tasks('5d000000-0000-4000-8000-000000000001',50,0,true);
 all_tasks := public.list_my_member_pending_tasks_with_joy_tasks('5d000000-0000-4000-8000-000000000001',50,0,true,false);
 if not exists(select 1 from jsonb_array_elements(core_tasks->'tasks') t where t->>'kind'='topic_discussion')
 or not exists(select 1 from jsonb_array_elements(all_tasks->'tasks') t where t->>'kind'='topic_discussion') then
  raise exception 'Pending topic vote missing from task projection.';
 end if;
 detail := public.get_my_club_discussion_topic('5d000000-0000-4000-8000-000000000001',current_setting('discussion.whole_id')::uuid);
 if jsonb_array_length(detail->'named_votes')<>0 then raise exception 'Member projection exposed named ballots.'; end if;
 if detail->>'vote_count'<>'0' or detail->>'comment_count'<>'0' then
  raise exception 'Member detail projection omitted initial vote/comment counts.';
 end if;
 perform public.add_club_discussion_comment('5d000000-0000-4000-8000-000000000001',current_setting('discussion.targeted_id')::uuid,'支持擴大服務。');
 perform public.cast_club_discussion_vote('5d000000-0000-4000-8000-000000000001',current_setting('discussion.targeted_id')::uuid,current_setting('discussion.target_option')::uuid);
 if exists(select 1 from jsonb_array_elements(public.list_my_member_pending_tasks('5d000000-0000-4000-8000-000000000001',50,0,true)->'tasks') t
   where t->>'task_id'=current_setting('discussion.targeted_id')) then raise exception 'Topic task remained after voting.'; end if;
 perform public.cast_club_discussion_vote('5d000000-0000-4000-8000-000000000001',current_setting('discussion.whole_id')::uuid,current_setting('discussion.whole_option')::uuid);
end $target_member$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','1d000000-0000-4000-8000-000000000003',true);
do $untargeted$
declare visible jsonb;
begin
 visible := public.list_my_club_discussion_topics('5d000000-0000-4000-8000-000000000001');
 if jsonb_array_length(visible->'topics')<>1 then raise exception 'Untagged member saw a targeted topic.'; end if;
 if public.get_my_club_discussion_topic('5d000000-0000-4000-8000-000000000001',current_setting('discussion.targeted_id')::uuid) is not null
 then raise exception 'Untagged member read targeted topic.'; end if;
 if public.get_my_club_discussion_topic('5d000000-0000-4000-8000-000000000001',current_setting('discussion.specific_id')::uuid) is not null
 then raise exception 'Unselected member read specifically targeted topic.'; end if;
 begin
  perform public.add_club_discussion_comment('5d000000-0000-4000-8000-000000000001',current_setting('discussion.targeted_id')::uuid,'不應成功');
  raise exception 'Untagged member commented on targeted topic.';
 exception when no_data_found then null; end;
 begin
  perform public.cast_club_discussion_vote('5d000000-0000-4000-8000-000000000001',current_setting('discussion.targeted_id')::uuid,current_setting('discussion.target_option')::uuid);
  raise exception 'Untagged member voted on targeted topic.';
 exception when no_data_found then null; end;
 begin
  perform public.list_my_club_discussion_topics('5d000000-0000-4000-8000-000000000002');
  raise exception 'Member read another club topic list.';
 exception when insufficient_privilege then null; end;
end $untargeted$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','1d000000-0000-4000-8000-000000000001',true);
do $officer_reads$
declare named_detail jsonb; anonymous_detail jsonb;
begin
 named_detail := public.get_club_discussion_topic('5d000000-0000-4000-8000-000000000001',current_setting('discussion.whole_id')::uuid);
 if not exists(select 1 from jsonb_array_elements(named_detail->'named_votes') v where v->>'display_name'='受邀社員')
 then raise exception 'Officer could not read named ballot.'; end if;
 anonymous_detail := public.get_club_discussion_topic('5d000000-0000-4000-8000-000000000001',current_setting('discussion.targeted_id')::uuid);
 if jsonb_array_length(anonymous_detail->'named_votes')<>0 then raise exception 'Anonymous ballot was disclosed to officer.'; end if;
end $officer_reads$;
reset role;

update public.club_discussion_topics set deadline_at=statement_timestamp()-interval '1 minute'
where id=current_setting('discussion.whole_id')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub','1d000000-0000-4000-8000-000000000003',true);
do $deadline$
declare detail jsonb; tasks jsonb;
begin
 detail := public.get_my_club_discussion_topic('5d000000-0000-4000-8000-000000000001',current_setting('discussion.whole_id')::uuid);
 if detail->>'is_open'<>'false' then raise exception 'Expired topic not read-only.'; end if;
 tasks := public.list_my_member_pending_tasks('5d000000-0000-4000-8000-000000000001',50,0,true);
 if exists(select 1 from jsonb_array_elements(tasks->'tasks') t where t->>'task_id'=current_setting('discussion.whole_id'))
 then raise exception 'Expired topic remained in member tasks.'; end if;
 begin
  perform public.add_club_discussion_comment('5d000000-0000-4000-8000-000000000001',current_setting('discussion.whole_id')::uuid,'截止後留言');
  raise exception 'Comment accepted after deadline.';
 exception when no_data_found then null; end;
 begin
  perform public.cast_club_discussion_vote('5d000000-0000-4000-8000-000000000001',current_setting('discussion.whole_id')::uuid,current_setting('discussion.whole_option')::uuid);
  raise exception 'Vote accepted after deadline.';
 exception when no_data_found then null; end;
end $deadline$;
reset role;
rollback;
