begin;

-- One authenticated projection backs both the short home-page reminder and
-- the complete, paginated task centre. The summary mode retains the home
-- page's per-kind caps; the task centre opts into the complete set.
create or replace function public.list_my_member_pending_tasks(
  p_club_id uuid,
  p_limit integer default 20,
  p_offset integer default 0,
  p_all_tasks boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid;
  actor_person_id uuid;
  active_membership_id uuid;
  result jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 50
    or p_offset is null or p_offset < 0 or p_offset > 100000
    or p_all_tasks is null then
    raise exception using errcode = '22023', message = 'invalid_member_task_page';
  end if;

  select account.id, account.person_id, membership.id
    into actor_id, actor_person_id, active_membership_id
  from public.app_accounts as account
  join public.club_memberships as membership on membership.person_id = account.person_id
  join public.clubs as club on club.id = membership.club_id
  where account.auth_user_id = auth.uid()
    and account.account_status = 'active'
    and membership.club_id = p_club_id
    and membership.membership_status = 'active'
    and club.club_status = 'active';

  if actor_id is null or actor_person_id is null or active_membership_id is null then
    raise exception using errcode = '42501', message = 'active_member_tasks_required';
  end if;

  with candidate_events as (
    select
      event.id,
      event.title,
      event.starts_at,
      event.ends_at,
      event.registration_deadline,
      registration.response as my_response
    from public.club_events as event
    left join public.event_registrations as registration
      on registration.event_id = event.id
     and registration.app_account_id = actor_id
    where event.club_id = p_club_id
      and event.event_status = 'published'
      and event.ends_at > now()
      and public.event_includes_current_member(event.id)
  ), awaiting_response as (
    -- Preserve the existing home summary cap only in summary mode. The full
    -- task centre removes it and paginates the resulting canonical task set.
    select
      id,
      title,
      starts_at,
      ends_at,
      registration_deadline
    from candidate_events
    where (my_response is null or my_response = 'pending')
      and public.event_registration_is_open(registration_deadline, starts_at, ends_at)
      and now() < starts_at
    order by registration_deadline, starts_at, id
    limit case when p_all_tasks then null::integer else 5 end
  ), dues_outstanding as (
    select
      receivable.id,
      receivable.rotary_year_id,
      format('%s-%s', year_item.start_year, right((year_item.start_year + 1)::text, 2)) as year_label,
      (projected.value ->> 'outstanding_amount')::numeric as outstanding,
      receivable.currency_code
    from public.club_finance_receivables as receivable
    join public.club_memberships as membership
      on membership.id = receivable.membership_id
     and membership.club_id = p_club_id
     and membership.person_id = actor_person_id
    join public.rotary_years as year_item
      on year_item.id = receivable.rotary_year_id
     and year_item.club_id = receivable.club_id
    cross join lateral (
      select public.project_dues_receivable(receivable.id) as value
    ) as projected
    where receivable.club_id = p_club_id
    order by receivable.created_at, receivable.id
    limit case when p_all_tasks then null::integer else 20 end
  ), birthday_wishes_to_write as (
    select
      participant.id,
      recipient.canonical_name as recipient_name,
      campaign.birthday_date
    from public.birthday_wish_campaign_participants as participant
    join public.birthday_wish_campaigns as campaign
      on campaign.id = participant.campaign_id
     and campaign.club_id = participant.club_id
    join public.club_memberships as recipient_membership
      on recipient_membership.id = campaign.recipient_membership_id
     and recipient_membership.club_id = p_club_id
    join public.people as recipient on recipient.id = recipient_membership.person_id
    left join lateral (
      select submission.submission_status
      from public.birthday_wish_campaign_submissions as submission
      where submission.participant_id = participant.id
        and submission.club_id = participant.club_id
      order by submission.revision_number desc, submission.id desc
      limit 1
    ) as latest on true
    where participant.club_id = p_club_id
      and participant.assignee_membership_id = active_membership_id
      and campaign.campaign_status in ('draft', 'collecting')
      and participant.participant_status not in ('declined', 'disabled')
      and public.birthday_wish_action_status(
        participant.participant_status, latest.submission_status
      ) in ('pending', 'needs_resubmission')
    order by campaign.birthday_date, participant.id
    limit case when p_all_tasks then null::integer else 5 end
  ), profile_gaps as (
    select
      (
        (person.primary_phone is null or btrim(person.primary_phone) = '')
        and (person.primary_email is null or btrim(person.primary_email) = '')
      ) as contact_missing,
      (person.birth_date is null) as birthday_missing
    from public.people as person
    where person.id = actor_person_id
  ), message_deliveries as materialized (
    select recipient.read_at
    from public.club_message_recipients as recipient
    join public.club_messages as message
      on message.id = recipient.message_id
     and message.club_id = recipient.club_id
    left join lateral (
      select public.birthday_wish_action_status(
        participant.participant_status, latest.submission_status
      ) as action_status
      from public.birthday_wish_campaign_participants as participant
      left join lateral (
        select submission.submission_status
        from public.birthday_wish_campaign_submissions as submission
        where submission.participant_id = participant.id
          and submission.club_id = participant.club_id
        order by submission.revision_number desc, submission.id desc
        limit 1
      ) as latest on true
      where participant.id = recipient.birthday_participant_id
        and participant.club_id = p_club_id
        and participant.assignee_membership_id = active_membership_id
      limit 1
    ) as birthday_assignment on true
    where recipient.club_id = p_club_id
      and recipient.membership_id = active_membership_id
      and message.status = 'active'
      and (
        recipient.birthday_participant_id is null
        or birthday_assignment.action_status in ('pending', 'needs_resubmission')
      )
  ), candidate_tasks as (
    select
      1 as sort_rank,
      public.event_registration_closes_at(task.registration_deadline, task.ends_at) as deadline,
      task.title as label,
      task.id::text as task_id,
      jsonb_build_object(
        'task_id', task.id::text,
        'kind', 'event_response',
        'title', task.title,
        'detail', '',
        'action_path', concat('/events?clubId=', p_club_id::text, '&mode=member'),
        'deadline', public.event_registration_closes_at(task.registration_deadline, task.ends_at),
        'hours_remaining', floor(extract(epoch from (
          public.event_registration_closes_at(task.registration_deadline, task.ends_at) - now()
        )) / 3600)::integer,
        'count', null
      ) as entry
    from awaiting_response as task

    union all
    select
      2, null::timestamptz, '社費', dues.id::text,
      jsonb_build_object(
        'task_id', dues.id::text,
        'kind', 'dues_outstanding',
        'title', '社費未繳',
        'detail', concat_ws(
          ' · ',
          dues.year_label,
          concat_ws(' ', dues.currency_code, trim(to_char(dues.outstanding, 'FM999999990')))
        ),
        'action_path', concat(
          '/dues?yearId=', dues.rotary_year_id::text,
          '&clubId=', p_club_id::text,
          '&mode=member'
        ),
        'deadline', null,
        'hours_remaining', null,
        'count', null
      )
    from dues_outstanding as dues
    where dues.outstanding > 0

    union all
    select
      3, wish.birthday_date::timestamptz, wish.recipient_name, wish.id::text,
      jsonb_build_object(
        'task_id', wish.id::text,
        'kind', 'birthday_wish',
        'title', '生日祝福待填寫',
        'detail', wish.recipient_name,
        'action_path', concat('/birthday-collection?clubId=', p_club_id::text, '&mode=member'),
        'deadline', case
          when wish.birthday_date::timestamptz > now() then wish.birthday_date::timestamptz
          else null
        end,
        'hours_remaining', case
          when wish.birthday_date::timestamptz > now()
            then floor(extract(epoch from (wish.birthday_date::timestamptz - now())) / 3600)::integer
          else null
        end,
        'count', null
      )
    from birthday_wishes_to_write as wish

    union all
    select
      4, null::timestamptz, '未讀訊息', p_club_id::text || ':unread-messages',
      jsonb_build_object(
        'task_id', p_club_id::text || ':unread-messages',
        'kind', 'unread_messages',
        'title', '未讀的社內訊息',
        'detail', '',
        'action_path', concat('/messages?clubId=', p_club_id::text, '&mode=member'),
        'deadline', null,
        'hours_remaining', null,
        'count', unread.unread_count
      )
    from (
      select count(*)::integer as unread_count
      from message_deliveries
      where message_deliveries.read_at is null
    ) as unread
    where unread.unread_count > 0

    union all
    select
      5, null::timestamptz, '個人資料', active_membership_id::text || ':profile-incomplete',
      jsonb_build_object(
        'task_id', active_membership_id::text || ':profile-incomplete',
        'kind', 'profile_incomplete',
        'title', '個人資料未完成',
        'detail', case
          when gaps.contact_missing and gaps.birthday_missing then '缺聯絡方式與生日'
          when gaps.contact_missing then '缺聯絡方式'
          else '缺生日'
        end,
        'action_path', '/me',
        'deadline', null,
        'hours_remaining', null,
        'count', null
      )
    from profile_gaps as gaps
    where gaps.contact_missing or gaps.birthday_missing
  ), counted as (
    select count(*)::integer as total_count from candidate_tasks
  ), ordered as (
    select
      row_number() over (order by sort_rank, deadline nulls last, label, task_id) as position,
      entry
    from candidate_tasks
  )
  select jsonb_build_object(
    'club_id', p_club_id,
    'offset', p_offset,
    'page_size', p_limit,
    'total_count', counted.total_count,
    'next_offset', case
      when p_offset + p_limit < counted.total_count then p_offset + p_limit
      else null
    end,
    'tasks', coalesce((
      select jsonb_agg(ordered.entry order by ordered.position)
      from ordered
      where ordered.position > p_offset
        and ordered.position <= p_offset + p_limit
    ), '[]'::jsonb)
  )
  into result
  from counted;

  return result;
end;
$$;

revoke all on function public.list_my_member_pending_tasks(uuid, integer, integer, boolean)
  from public, anon;
grant execute on function public.list_my_member_pending_tasks(uuid, integer, integer, boolean)
  to authenticated;

-- Keep the signed-in home page at its existing five-row summary while making
-- the shared projection the only source of task status and presentation.
do $$
declare
  function_definition text;
  old_declaration text := '''pending_tasks'', (';
  corrected_declaration text := '''pending_tasks'', public.list_my_member_pending_tasks(p_club_id, 5, 0, false)->''tasks'', ';
  pending_tasks_start integer;
  notifications_start integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.get_my_member_home_projection(uuid)'::regprocedure
  ) into function_definition;

  if function_definition like '%public.list_my_member_pending_tasks%' then
    raise exception 'member-home task projection has already been redirected';
  end if;

  pending_tasks_start := strpos(function_definition, old_declaration);
  if pending_tasks_start = 0 then
    raise exception 'could not locate the member-home pending task projection';
  end if;
  notifications_start := strpos(
    substring(function_definition from pending_tasks_start),
    '''notifications'', jsonb_build_object('
  );
  if notifications_start = 0 then
    raise exception 'could not locate notifications after the member-home tasks';
  end if;
  notifications_start := pending_tasks_start + notifications_start - 1;

  function_definition :=
    substring(function_definition from 1 for pending_tasks_start - 1)
    || corrected_declaration
    || E'\n    '
    || substring(function_definition from notifications_start);

  execute function_definition;

  select pg_catalog.pg_get_functiondef(
    'public.get_my_member_home_projection(uuid)'::regprocedure
  ) into function_definition;
  if function_definition not like '%list_my_member_pending_tasks(p_club_id, 5, 0, false)%' then
    raise exception 'member-home task projection was not redirected';
  end if;
end;
$$;

commit;
