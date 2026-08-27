begin;

-- Generate the invitations for one club/month. The scheduler can call this
-- same RPC later; keeping the runner behind the manager check makes the first
-- UI slice safe while the scheduled trigger is still being designed.
create or replace function public.generate_birthday_wish_collection_month(
  p_club_id uuid,
  p_birthday_year integer,
  p_birthday_month integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  batch_id uuid;
  batch_status text;
  recipient_ids uuid[] := '{}'::uuid[];
  recipient_dates date[] := '{}'::date[];
  assignee_ids uuid[] := '{}'::uuid[];
  question_ids uuid[] := '{}'::uuid[];
  campaign_ids uuid[] := '{}'::uuid[];
  campaign_recipient_ids uuid[] := '{}'::uuid[];
  recipient_count integer := 0;
  assignee_count integer := 0;
  question_count integer := 0;
  max_assignments integer := 0;
  participant_count integer := 0;
  skipped_assignee_count integer := 0;
  rotation_offset integer := 0;
  question_index integer := 0;
  campaign_id uuid;
begin
  if actor_id is null
     or not public.current_can_manage_club(p_club_id)
     or not exists (
       select 1 from public.clubs
       where id = p_club_id and club_status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'birthday_collection_manager_required';
  end if;

  if p_birthday_year not between 2000 and 2200
     or p_birthday_month not between 1 and 12 then
    raise exception using errcode = '22023', message = 'invalid_birthday_assignment_period';
  end if;

  batch_id := public.create_birthday_wish_assignment_batch(
    p_club_id, p_birthday_year, p_birthday_month
  );

  select batch.batch_status
  into batch_status
  from public.birthday_wish_assignment_batches as batch
  where batch.id = batch_id
    and batch.club_id = p_club_id
  for update;

  if batch_status = 'completed' then
    return jsonb_build_object(
      'batch_id', batch_id,
      'batch_status', batch_status,
      'birthday_year', p_birthday_year,
      'birthday_month', p_birthday_month,
      'campaign_count', (
        select count(*)::integer
        from public.birthday_wish_campaigns as campaign
        where campaign.assignment_batch_id = batch_id
          and campaign.club_id = p_club_id
      ),
      'participant_count', (
        select count(*)::integer
        from public.birthday_wish_campaign_participants as participant
        where participant.assignment_batch_id = batch_id
          and participant.club_id = p_club_id
      ),
      'skipped_assignee_count', 0
    );
  end if;

  select
    coalesce(array_agg(membership.id order by public.birthday_effective_date(person.birth_date, p_birthday_year), membership.id), '{}'::uuid[]),
    coalesce(array_agg(public.birthday_effective_date(person.birth_date, p_birthday_year) order by public.birthday_effective_date(person.birth_date, p_birthday_year), membership.id), '{}'::date[])
  into recipient_ids, recipient_dates
  from public.club_memberships as membership
  join public.people as person on person.id = membership.person_id
  join public.birthday_visibility_preferences as preference
    on preference.membership_id = membership.id
   and preference.club_id = p_club_id
   and preference.is_listed = true
   and preference.allow_wishes = true
  where membership.club_id = p_club_id
    and membership.membership_status = 'active'
    and person.birth_date is not null
    and extract(month from public.birthday_effective_date(person.birth_date, p_birthday_year))::integer = p_birthday_month;

  recipient_count := cardinality(recipient_ids);

  select coalesce(array_agg(eligible_assignee.membership_id order by eligible_assignee.membership_id), '{}'::uuid[])
  into assignee_ids
  from (
    select distinct membership.id as membership_id
    from public.club_memberships as membership
    join public.app_accounts as account
      on account.person_id = membership.person_id
     and account.account_status = 'active'
    where membership.club_id = p_club_id
      and membership.membership_status = 'active'
  ) as eligible_assignee;

  assignee_count := cardinality(assignee_ids);

  select coalesce(array_agg(available_question.id order by available_question.club_id nulls first, available_question.sort_order, available_question.question_key, available_question.id), '{}'::uuid[])
  into question_ids
  from (
    select distinct on (lower(btrim(item.prompt)))
      item.id, item.club_id, item.sort_order, item.question_key
    from public.birthday_wish_question_bank_items as item
    where item.is_enabled = true
      and (item.club_id is null or item.club_id = p_club_id)
    order by lower(btrim(item.prompt)), item.club_id nulls first,
      item.sort_order, item.question_key, item.id
  ) as available_question;

  question_count := cardinality(question_ids);

  if recipient_count = 0 then
    update public.birthday_wish_assignment_batches
    set batch_status = 'completed',
        completed_at = coalesce(completed_at, now()),
        failure_reason = null
    where id = batch_id and club_id = p_club_id;

    return jsonb_build_object(
      'batch_id', batch_id,
      'batch_status', 'completed',
      'birthday_year', p_birthday_year,
      'birthday_month', p_birthday_month,
      'campaign_count', 0,
      'participant_count', 0,
      'skipped_assignee_count', assignee_count
    );
  end if;

  -- Count how many members can receive one task. A member who is the only
  -- birthday recipient cannot be assigned to that same campaign.
  for target_index in 1..assignee_count loop
    if exists (
      select 1
      from unnest(recipient_ids) as recipient_id
      where recipient_id <> assignee_ids[target_index]
    ) then
      max_assignments := max_assignments + 1;
    end if;
  end loop;

  if question_count < max_assignments then
    update public.birthday_wish_assignment_batches
    set batch_status = 'failed',
        failure_reason = 'birthday_question_bank_exhausted',
        completed_at = null
    where id = batch_id and club_id = p_club_id;

    return jsonb_build_object(
      'batch_id', batch_id,
      'batch_status', 'failed',
      'birthday_year', p_birthday_year,
      'birthday_month', p_birthday_month,
      'campaign_count', 0,
      'participant_count', 0,
      'skipped_assignee_count', assignee_count - max_assignments,
      'failure_reason', 'birthday_question_bank_exhausted'
    );
  end if;

  update public.birthday_wish_assignment_batches
  set batch_status = 'assigning',
      started_at = coalesce(started_at, now()),
      failure_reason = null,
      completed_at = null
  where id = batch_id and club_id = p_club_id;

  for target_index in 1..recipient_count loop
    campaign_id := public.create_birthday_wish_campaign(
      p_club_id,
      recipient_ids[target_index],
      p_birthday_year,
      recipient_dates[target_index],
      batch_id
    );
    campaign_ids := array_append(campaign_ids, campaign_id);
    campaign_recipient_ids := array_append(campaign_recipient_ids, recipient_ids[target_index]);
  end loop;

  rotation_offset := mod((p_birthday_year * 12) + p_birthday_month, recipient_count);

  for target_index in 1..assignee_count loop
    campaign_id := null;
    for attempt in 0..recipient_count - 1 loop
      campaign_id := campaign_ids[((target_index - 1 + rotation_offset + attempt) % recipient_count) + 1];
      if campaign_recipient_ids[((target_index - 1 + rotation_offset + attempt) % recipient_count) + 1]
         <> assignee_ids[target_index] then
        exit;
      end if;
      campaign_id := null;
    end loop;

    if campaign_id is null then
      skipped_assignee_count := skipped_assignee_count + 1;
      continue;
    end if;

    question_index := question_index + 1;
    perform public.assign_birthday_wish_participant(
      p_club_id,
      batch_id,
      campaign_id,
      assignee_ids[target_index],
      question_ids[question_index]
    );
    participant_count := participant_count + 1;
  end loop;

  update public.birthday_wish_assignment_batches
  set batch_status = 'completed',
      completed_at = now(),
      failure_reason = null
  where id = batch_id and club_id = p_club_id;

  return jsonb_build_object(
    'batch_id', batch_id,
    'batch_status', 'completed',
    'birthday_year', p_birthday_year,
    'birthday_month', p_birthday_month,
    'campaign_count', recipient_count,
    'participant_count', participant_count,
    'skipped_assignee_count', skipped_assignee_count
  );
end;
$$;

revoke all on function public.generate_birthday_wish_collection_month(uuid, integer, integer) from public, anon;
grant execute on function public.generate_birthday_wish_collection_month(uuid, integer, integer) to authenticated;

commit;
