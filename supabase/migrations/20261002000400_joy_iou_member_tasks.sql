begin;

-- Extend the existing paginated member task projection without changing the
-- home-page RPC or its stable summary contract. The body is copied from the
-- current database definition, then exact, guarded insertions add participant-
-- only IOU tasks and explicitly addressed question-answer tasks.
do $migration$
declare
  function_definition text;
  returns_position integer;
  cte_marker text := '  ), candidate_tasks as (';
  cte_replacement text := $joy_cte$
  ), joy_iou_actionable as (
    select
      post.id as post_id,
      case
        when item.status = 'proposed' then '回覆非現金承諾'
        when item.status = 'accepted' then '開始履行承諾'
        else '確認承諾完成'
      end as action_title,
      case
        when item.due_on < (pg_catalog.statement_timestamp() at time zone 'Asia/Taipei')::date
          then 'IOU 已逾期：' || case
            when item.status = 'proposed' then '回覆承諾'
            when item.status = 'accepted' then '開始履行'
            else '確認完成'
          end
        when item.status = 'proposed' then '回覆非現金承諾'
        when item.status = 'accepted' then '開始履行承諾'
        else '確認承諾完成'
      end as task_title,
      left(concat_ws(' · ',
        left(btrim(coalesce(nullif(post.title, ''), post.content)), 150),
        case when post.author_app_account_id = actor_id
          then '給 ' || recipient_person.canonical_name
          else '來自 ' || author_account.account_display_name
        end,
        case
          when item.due_on < (pg_catalog.statement_timestamp() at time zone 'Asia/Taipei')::date
            then '已逾期（原定 ' || pg_catalog.to_char(item.due_on, 'YYYY-MM-DD') || '）'
          when item.due_on is not null
            then '到期日 ' || pg_catalog.to_char(item.due_on, 'YYYY-MM-DD')
          else null
        end
      ), 280) as detail,
      case
        when item.due_on is not null
          and item.due_on >= (pg_catalog.statement_timestamp() at time zone 'Asia/Taipei')::date
          then ((item.due_on + 1)::timestamp at time zone 'Asia/Taipei') - interval '1 microsecond'
        else null
      end as deadline
    from public.joy_iou_items as item
    join public.joy_posts as post
      on post.id = item.post_id and post.club_id = item.club_id
    join public.app_accounts as author_account on author_account.id = post.author_app_account_id
    join public.club_memberships as recipient_membership
      on recipient_membership.id = item.recipient_membership_id
     and recipient_membership.club_id = item.club_id
    join public.people as recipient_person on recipient_person.id = recipient_membership.person_id
    where p_include_joy_tasks
      and item.club_id = p_club_id
      and post.post_status = 'published'
      and item.status in ('proposed', 'accepted', 'in_progress')
      and exists (
        select 1 from public.platform_feature_flags as flag
        where flag.feature_key = 'joy_wall_v1'
          and flag.enabled
          and flag.rollout_percentage > 0
          and pg_catalog.cardinality(flag.enabled_environments) > 0
      )
      and (
        (post.author_app_account_id = actor_id and (
          item.status = 'accepted'
          or (item.status = 'in_progress' and item.promisor_completion_confirmed_at is null)
        ))
        or (item.recipient_membership_id = active_membership_id and (
          item.status = 'proposed'
          or (item.status = 'in_progress' and item.recipient_completion_confirmed_at is null)
        ))
      )
    order by item.due_on nulls last, item.created_at, post.id
    limit case when p_all_tasks then null::integer else 5 end
  ), joy_question_actionable as (
    select
      post.id as post_id,
      '回答社員提問' as task_title,
      left(concat_ws(' · ',
        left(concat_ws('：', nullif(btrim(post.title), ''), left(btrim(post.content), 150)), 180),
        '來自 ' || author_account.account_display_name
      ), 280) as detail,
      null::timestamptz as deadline
    from public.joy_posts as post
    join public.joy_post_audiences as audience
      on audience.post_id = post.id and audience.club_id = post.club_id
    join public.app_accounts as author_account on author_account.id = post.author_app_account_id
    where p_include_joy_tasks
      and post.club_id = p_club_id
      and post.post_type = 'question'
      and post.visibility_scope in ('selected', 'private')
      and post.post_status = 'published'
      and post.author_app_account_id <> actor_id
      and audience.membership_id = active_membership_id
      and exists (
        select 1 from public.platform_feature_flags as flag
        where flag.feature_key = 'joy_wall_v1'
          and flag.enabled
          and flag.rollout_percentage > 0
          and pg_catalog.cardinality(flag.enabled_environments) > 0
      )
      and not exists (
        select 1 from public.joy_comments as answer
        where answer.post_id = post.id
          and answer.club_id = post.club_id
          and answer.author_app_account_id = actor_id
          and answer.comment_type = 'answer'
          and answer.comment_status = 'active'
      )
    order by post.created_at, post.id
    limit case when p_all_tasks then null::integer else 5 end
  ), candidate_tasks as (
  $joy_cte$;
  counted_marker text := '  ), counted as (';
  validation_marker text := 'or p_all_tasks is null then';
  counted_replacement text := $joy_union$
    union all
    select
      3,
      task.deadline,
      task.task_title,
      task.post_id::text,
      jsonb_build_object(
        'task_id', task.post_id::text,
        'kind', 'joy_iou',
        'title', task.task_title,
        'detail', task.detail,
        'action_path', concat(
          '/joy?clubId=', p_club_id::text,
          '&mode=member&focusIouId=', task.post_id::text
        ),
        'deadline', task.deadline,
        'hours_remaining', case
          when task.deadline is null then null
          else greatest(0, floor(extract(epoch from (task.deadline - now())) / 3600)::integer)
        end,
        'count', null
      )
    from joy_iou_actionable as task
    union all
    select
      4,
      task.deadline,
      task.task_title,
      task.post_id::text,
      jsonb_build_object(
        'task_id', task.post_id::text,
        'kind', 'joy_question',
        'title', task.task_title,
        'detail', task.detail,
        'action_path', concat(
          '/joy?clubId=', p_club_id::text,
          '&mode=member&focusPostId=', task.post_id::text
        ),
        'deadline', null,
        'hours_remaining', null,
        'count', null
      )
    from joy_question_actionable as task
  ), counted as (
  $joy_union$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.list_my_member_pending_tasks(uuid,integer,integer,boolean)'::regprocedure
  ) into function_definition;

  if function_definition like '%joy_iou_actionable%'
    or function_definition like '%joy_question_actionable%'
    or function_definition like '%p_include_joy_tasks%' then
    raise exception 'Joy task projection already exists';
  end if;

  returns_position := pg_catalog.strpos(pg_catalog.lower(function_definition), 'returns jsonb');
  if returns_position = 0 then
    raise exception 'could not locate the return declaration for member task projection';
  end if;

  function_definition :=
    'create or replace function public.list_my_member_pending_tasks_with_joy_tasks('
    || 'p_club_id uuid, p_limit integer default 20, p_offset integer default 0, '
    || 'p_all_tasks boolean default true, p_include_joy_tasks boolean default false) '
    || pg_catalog.substr(function_definition, returns_position);

  if pg_catalog.length(function_definition)
      - pg_catalog.length(pg_catalog.replace(function_definition, cte_marker, ''))
      <> pg_catalog.length(cte_marker) then
    raise exception 'could not uniquely locate member task CTE insertion point';
  end if;
  if pg_catalog.length(function_definition)
      - pg_catalog.length(pg_catalog.replace(function_definition, counted_marker, ''))
      <> pg_catalog.length(counted_marker) then
    raise exception 'could not uniquely locate member task union insertion point';
  end if;
  if pg_catalog.length(function_definition)
      - pg_catalog.length(pg_catalog.replace(function_definition, validation_marker, ''))
      <> pg_catalog.length(validation_marker) then
    raise exception 'could not uniquely locate member task input validation';
  end if;

  function_definition := pg_catalog.replace(function_definition, cte_marker, cte_replacement);
  function_definition := pg_catalog.replace(function_definition, counted_marker, counted_replacement);
  function_definition := pg_catalog.replace(
    function_definition, validation_marker,
    'or p_all_tasks is null or p_include_joy_tasks is null then'
  );
  if function_definition not like '%p_include_joy_tasks%' then
    raise exception 'Joy task opt-in parameter was not added';
  end if;
  execute function_definition;

  select pg_catalog.pg_get_functiondef(
    'public.list_my_member_pending_tasks_with_joy_tasks(uuid,integer,integer,boolean,boolean)'::regprocedure
  ) into function_definition;
  if function_definition not like '%joy_iou_actionable%'
    or function_definition not like '%focusIouId=%'
    or function_definition not like '%joy_question_actionable%'
    or function_definition not like '%focusPostId=%' then
    raise exception 'Joy task projection did not install completely';
  end if;
end;
$migration$;

revoke all on function public.list_my_member_pending_tasks_with_joy_tasks(uuid, integer, integer, boolean, boolean)
  from public, anon;
grant execute on function public.list_my_member_pending_tasks_with_joy_tasks(uuid, integer, integer, boolean, boolean)
  to authenticated;

-- A task links straight to its IOU. This projection can only return a current,
-- actionable IOU to one of its two members; non-participants get the same null
-- result as an unavailable item.
create or replace function public.get_my_joy_iou_post(p_club_id uuid, p_post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
  result jsonb;
begin
  if actor_id is null or actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_joy_membership_required';
  end if;

  if not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'joy_wall_v1'
      and flag.enabled
      and flag.rollout_percentage > 0
      and pg_catalog.cardinality(flag.enabled_environments) > 0
  ) then
    return null;
  end if;

  select jsonb_build_object(
    'id', post.id,
    'post_type', post.post_type,
    'title', post.title,
    'content', post.content,
    'visibility_scope', post.visibility_scope,
    'post_status', 'published',
    'created_at', post.created_at,
    'updated_at', post.updated_at,
    'author_display_name', author_account.account_display_name,
    'author_avatar_url', author_person.avatar_url,
    'can_edit', false,
    'can_archive', false,
    'can_answer', false,
    'is_hidden', false,
    'comment_count', 0,
    'reaction_counts', '{}'::jsonb,
    'my_reaction', null,
    'iou', public.joy_iou_projection(post.id, p_club_id, actor_id, actor_membership_id)
  ) into result
  from public.joy_posts as post
  join public.joy_iou_items as item
    on item.post_id = post.id and item.club_id = post.club_id
  join public.app_accounts as author_account on author_account.id = post.author_app_account_id
  join public.people as author_person on author_person.id = author_account.person_id
  where post.id = p_post_id
    and post.club_id = p_club_id
    and post.post_type = 'iou'
    and post.post_status = 'published'
    and item.status in ('proposed', 'accepted', 'in_progress')
    and public.current_can_read_joy_post(post.id, p_club_id, actor_id, actor_membership_id);

  return result;
end;
$$;

revoke all on function public.get_my_joy_iou_post(uuid, uuid) from public, anon;
grant execute on function public.get_my_joy_iou_post(uuid, uuid) to authenticated;

-- A question task opens only a published question the caller can currently
-- read. The post's normal visibility rules remain the authority boundary.
create or replace function public.get_my_joy_question_post(p_club_id uuid, p_post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
  result jsonb;
begin
  if actor_id is null or actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_joy_membership_required';
  end if;

  if not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'joy_wall_v1'
      and flag.enabled
      and flag.rollout_percentage > 0
      and pg_catalog.cardinality(flag.enabled_environments) > 0
  ) then
    return null;
  end if;

  select jsonb_build_object(
    'id', post.id,
    'post_type', post.post_type,
    'title', post.title,
    'content', post.content,
    'visibility_scope', post.visibility_scope,
    'post_status', 'published',
    'created_at', post.created_at,
    'updated_at', post.updated_at,
    'author_display_name', author_account.account_display_name,
    'author_avatar_url', author_person.avatar_url,
    'can_edit', post.author_app_account_id = actor_id,
    'can_archive', post.author_app_account_id = actor_id,
    'can_answer', post.author_app_account_id = actor_id
      or post.visibility_scope = 'club'
      or exists (
        select 1 from public.joy_post_audiences as audience
        where audience.post_id = post.id
          and audience.club_id = post.club_id
          and audience.membership_id = actor_membership_id
      ),
    'is_hidden', false,
    'comment_count', (
      select count(*)::integer from public.joy_comments as comment
      where comment.post_id = post.id and comment.club_id = post.club_id
        and comment.comment_status = 'active'
    ),
    'reaction_counts', (
      select coalesce(jsonb_object_agg(total.reaction_type, total.reaction_count), '{}'::jsonb)
      from (
        select reaction.reaction_type, count(*)::integer as reaction_count
        from public.joy_reactions as reaction
        where reaction.post_id = post.id and reaction.club_id = post.club_id
        group by reaction.reaction_type
      ) as total
    ),
    'my_reaction', (
      select reaction.reaction_type from public.joy_reactions as reaction
      where reaction.post_id = post.id and reaction.club_id = post.club_id
        and reaction.app_account_id = actor_id
    ),
    'iou', null
  ) into result
  from public.joy_posts as post
  join public.app_accounts as author_account on author_account.id = post.author_app_account_id
  join public.people as author_person on author_person.id = author_account.person_id
  where post.id = p_post_id
    and post.club_id = p_club_id
    and post.post_type = 'question'
    and post.post_status = 'published'
    and public.current_can_read_joy_post(post.id, p_club_id, actor_id, actor_membership_id);

  return result;
end;
$$;

revoke all on function public.get_my_joy_question_post(uuid, uuid) from public, anon;
grant execute on function public.get_my_joy_question_post(uuid, uuid) to authenticated;

commit;
