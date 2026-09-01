-- Birthday collection management was reachable only by executive secretaries.
-- current_can_manage_club() answers for platform administrators and
-- club_operator_permissions alone, so presidents and secretaries -- who live in
-- club_role_assignments -- could not manage the question bank, publish, review
-- or regenerate, and the scheduler found no manager and skipped the club whole,
-- which is why run 33361427466 reported skipped_count 1 and generated nothing.
--
-- current_can_manage_club() stays untouched: it is shared with provisioning and
-- other domains, and widening it there would grant far more than birthdays.
-- Birthday RPCs move to a narrow wrapper over current_has_club_permission(),
-- whose 'member.manage' key already resolves to exactly presidents,
-- secretaries and executive secretaries, and excludes finance and members.

begin;

-- Executive secretaries reach this through current_has_club_permission's own
-- club_operator_permissions branch, which borrows the secretary permission set.
create or replace function public.current_can_manage_birthday_collection(target_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.current_has_club_permission(target_club_id, 'member.manage')
$$;

comment on function public.current_can_manage_birthday_collection(uuid) is
  'True for the club officers allowed to manage birthday wish collection: president, secretary and executive secretary, plus platform administrators for manual administration. Finance and ordinary members are excluded.';

revoke all on function public.current_can_manage_birthday_collection(uuid) from public, anon, authenticated;


-- assign_birthday_wish_participant: carried over from 20260824000600_birthday_wish_collection_core.sql, permission check swapped.
create or replace function public.assign_birthday_wish_participant(
  p_club_id uuid,
  p_assignment_batch_id uuid,
  p_campaign_id uuid,
  p_assignee_membership_id uuid,
  p_question_bank_item_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  batch_status text;
  batch_year integer;
  batch_month integer;
  campaign_recipient_id uuid;
  campaign_date date;
  campaign_status text;
  question_prompt text;
  question_enabled boolean;
  existing_id uuid;
  existing_campaign_id uuid;
  existing_question_id uuid;
  participant_id uuid;
begin
  if actor_id is null
     or not public.current_can_manage_birthday_collection(p_club_id)
     or not exists (
       select 1 from public.clubs
       where id = p_club_id and club_status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'birthday_collection_manager_required';
  end if;

  select batch.batch_status, batch.birthday_year, batch.birthday_month
  into batch_status, batch_year, batch_month
  from public.birthday_wish_assignment_batches as batch
  where batch.id = p_assignment_batch_id
    and batch.club_id = p_club_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_assignment_batch_not_found';
  end if;

  if batch_status not in ('planned', 'assigning') then
    raise exception using errcode = '22023', message = 'birthday_assignment_batch_not_open';
  end if;

  select campaign.recipient_membership_id, campaign.birthday_date, campaign.campaign_status
  into campaign_recipient_id, campaign_date, campaign_status
  from public.birthday_wish_campaigns as campaign
  where campaign.id = p_campaign_id
    and campaign.club_id = p_club_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_campaign_not_found';
  end if;

  if campaign_status not in ('draft', 'collecting') then
    raise exception using errcode = '22023', message = 'birthday_campaign_not_open';
  end if;

  if extract(year from campaign_date)::integer <> batch_year
     or extract(month from campaign_date)::integer <> batch_month then
    raise exception using errcode = '22023', message = 'birthday_assignment_campaign_period_mismatch';
  end if;

  if p_assignee_membership_id is null
     or p_assignee_membership_id = campaign_recipient_id
     or not exists (
       select 1
       from public.club_memberships as membership
       where membership.id = p_assignee_membership_id
         and membership.club_id = p_club_id
         and membership.membership_status = 'active'
     ) then
    raise exception using errcode = '22023', message = 'invalid_birthday_assignment_member';
  end if;

  if not exists (
    select 1
    from public.club_memberships as membership
    join public.app_accounts as account
      on account.person_id = membership.person_id
     and account.account_status = 'active'
    where membership.id = p_assignee_membership_id
      and membership.club_id = p_club_id
  ) then
    raise exception using errcode = '42501', message = 'birthday_assignment_member_account_required';
  end if;

  select prompt, is_enabled
  into question_prompt, question_enabled
  from public.birthday_wish_question_bank_items
  where id = p_question_bank_item_id
    and is_enabled = true
    and (club_id is null or club_id = p_club_id);

  if not found or not question_enabled then
    raise exception using errcode = '22023', message = 'birthday_question_not_available';
  end if;

  select id, campaign_id, question_bank_item_id
  into existing_id, existing_campaign_id, existing_question_id
  from public.birthday_wish_campaign_participants
  where assignment_batch_id = p_assignment_batch_id
    and assignee_membership_id = p_assignee_membership_id;

  if existing_id is not null then
    if existing_campaign_id <> p_campaign_id
       or existing_question_id <> p_question_bank_item_id then
      raise exception using errcode = '23505', message = 'birthday_assignment_idempotency_conflict';
    end if;
    return existing_id;
  end if;

  if exists (
    select 1
    from public.birthday_wish_campaign_participants
    where assignment_batch_id = p_assignment_batch_id
      and question_bank_item_id = p_question_bank_item_id
  ) then
    raise exception using errcode = '23505', message = 'birthday_question_already_used_in_batch';
  end if;

  update public.birthday_wish_assignment_batches
  set batch_status = 'assigning',
      started_at = coalesce(started_at, now())
  where id = p_assignment_batch_id
    and club_id = p_club_id;

  update public.birthday_wish_campaigns as campaign
  set campaign_status = case when campaign.campaign_status = 'draft' then 'collecting' else campaign.campaign_status end,
      starts_at = coalesce(campaign.starts_at, now())
  where campaign.id = p_campaign_id
    and campaign.club_id = p_club_id;

  insert into public.birthday_wish_campaign_participants (
    club_id, campaign_id, assignment_batch_id, assignee_membership_id,
    question_bank_item_id, question_prompt_snapshot
  ) values (
    p_club_id, p_campaign_id, p_assignment_batch_id, p_assignee_membership_id,
    p_question_bank_item_id, question_prompt
  ) returning id into participant_id;

  return participant_id;
end;
$$;

-- create_birthday_wish_assignment_batch: carried over from 20260824000600_birthday_wish_collection_core.sql, permission check swapped.
create or replace function public.create_birthday_wish_assignment_batch(
  p_club_id uuid,
  p_birthday_year integer,
  p_birthday_month integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  batch_id uuid;
begin
  if actor_id is null
     or not public.current_can_manage_birthday_collection(p_club_id)
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

  insert into public.birthday_wish_assignment_batches (
    club_id, birthday_year, birthday_month, created_by_app_account_id
  ) values (
    p_club_id, p_birthday_year, p_birthday_month, actor_id
  ) on conflict (club_id, birthday_year, birthday_month) do nothing;

  select id into batch_id
  from public.birthday_wish_assignment_batches
  where club_id = p_club_id
    and birthday_year = p_birthday_year
    and birthday_month = p_birthday_month;

  return batch_id;
end;
$$;

-- create_birthday_wish_campaign: carried over from 20260824000600_birthday_wish_collection_core.sql, permission check swapped.
create or replace function public.create_birthday_wish_campaign(
  p_club_id uuid,
  p_recipient_membership_id uuid,
  p_birthday_year integer,
  p_birthday_date date,
  p_assignment_batch_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  recipient_birth_date date;
  expected_birthday date;
  existing_id uuid;
  existing_date date;
  existing_batch_id uuid;
  batch_year integer;
  batch_month integer;
begin
  if actor_id is null
     or not public.current_can_manage_birthday_collection(p_club_id)
     or not exists (
       select 1 from public.clubs
       where id = p_club_id and club_status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'birthday_collection_manager_required';
  end if;

  if p_recipient_membership_id is null
     or p_birthday_date is null
     or p_birthday_year not between 2000 and 2200
     or extract(year from p_birthday_date)::integer <> p_birthday_year then
    raise exception using errcode = '22023', message = 'invalid_birthday_campaign_date';
  end if;

  select person.birth_date
  into recipient_birth_date
  from public.club_memberships as membership
  join public.people as person on person.id = membership.person_id
  where membership.id = p_recipient_membership_id
    and membership.club_id = p_club_id
    and membership.membership_status = 'active';

  if recipient_birth_date is null then
    raise exception using errcode = '42501', message = 'birthday_recipient_not_eligible';
  end if;

  if not exists (
    select 1
    from public.birthday_visibility_preferences as preference
    where preference.membership_id = p_recipient_membership_id
      and preference.club_id = p_club_id
      and preference.is_listed = true
      and preference.allow_wishes = true
  ) then
    raise exception using errcode = '42501', message = 'birthday_recipient_not_accepting_wishes';
  end if;

  expected_birthday := public.birthday_effective_date(recipient_birth_date, p_birthday_year);
  if p_birthday_date <> expected_birthday then
    raise exception using errcode = '22023', message = 'birthday_campaign_date_mismatch';
  end if;

  if p_assignment_batch_id is not null then
    select birthday_year, birthday_month
    into batch_year, batch_month
    from public.birthday_wish_assignment_batches
    where id = p_assignment_batch_id
      and club_id = p_club_id;

    if not found then
      raise exception using errcode = 'P0002', message = 'birthday_assignment_batch_not_found';
    end if;

    if batch_year <> p_birthday_year
       or batch_month <> extract(month from p_birthday_date)::integer then
      raise exception using errcode = '22023', message = 'birthday_campaign_batch_mismatch';
    end if;
  end if;

  insert into public.birthday_wish_campaigns (
    club_id, recipient_membership_id, birthday_year, birthday_date,
    assignment_batch_id, created_by_app_account_id
  ) values (
    p_club_id, p_recipient_membership_id, p_birthday_year, p_birthday_date,
    p_assignment_batch_id, actor_id
  ) on conflict (club_id, recipient_membership_id, birthday_year) do nothing;

  select id, birthday_date, assignment_batch_id
  into existing_id, existing_date, existing_batch_id
  from public.birthday_wish_campaigns
  where club_id = p_club_id
    and recipient_membership_id = p_recipient_membership_id
    and birthday_year = p_birthday_year;

  if existing_date <> p_birthday_date
     or (p_assignment_batch_id is not null and existing_batch_id is distinct from p_assignment_batch_id) then
    raise exception using errcode = '23505', message = 'birthday_campaign_idempotency_conflict';
  end if;

  return existing_id;
end;
$$;

-- create_birthday_wish_question: carried over from 20260824000600_birthday_wish_collection_core.sql, permission check swapped.
create or replace function public.create_birthday_wish_question(
  p_club_id uuid,
  p_question_key text,
  p_prompt text,
  p_tone text default 'warm',
  p_sort_order integer default 100
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  question_id uuid;
  normalized_key text := lower(btrim(coalesce(p_question_key, '')));
  normalized_prompt text := public.normalize_birthday_wish(p_prompt);
begin
  if actor_id is null
     or not public.current_can_manage_birthday_collection(p_club_id)
     or not exists (
       select 1 from public.clubs
       where id = p_club_id and club_status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'birthday_collection_manager_required';
  end if;

  if normalized_key !~ '^[a-z][a-z0-9_]{2,63}$'
     or normalized_prompt = ''
     or char_length(normalized_prompt) > 300
     or p_tone not in ('warm', 'humorous', 'moving')
     or p_sort_order not between 0 and 10000 then
    raise exception using errcode = '22023', message = 'invalid_birthday_question';
  end if;

  insert into public.birthday_wish_question_bank_items (
    club_id, question_key, prompt, tone, sort_order, created_by_app_account_id
  ) values (
    p_club_id, normalized_key, normalized_prompt, p_tone, p_sort_order, actor_id
  ) returning id into question_id;

  return question_id;
end;
$$;

-- current_can_access_birthday_club: carried over from 20260820001000_birthday_wishes.sql, permission check swapped.
create or replace function public.current_can_access_birthday_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.clubs as club
    where club.id = p_club_id
      and club.club_status = 'active'
      and (
        public.current_birthday_membership_id(p_club_id) is not null
        or public.current_can_manage_birthday_collection(p_club_id)
      )
  )
$$;

-- ensure_birthday_wish_collection_notification: carried over from 20260824001000_birthday_wish_collection_review.sql, permission check swapped.
create or replace function public.ensure_birthday_wish_collection_notification(
  p_club_id uuid,
  p_assignment_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  batch_status text;
  notification_status text;
  existing_message_id uuid;
  notification_message_id uuid;
  participant_count integer;
  delivered_count integer;
  error_code text;
  action text := format('/birthday-collection?clubId=%s', p_club_id);
begin
  if actor_id is null
     or not public.current_can_manage_birthday_collection(p_club_id)
     or not exists (
       select 1 from public.clubs
       where id = p_club_id and club_status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'birthday_collection_manager_required';
  end if;

  select batch.batch_status into batch_status
  from public.birthday_wish_assignment_batches as batch
  where batch.id = p_assignment_batch_id and batch.club_id = p_club_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_assignment_batch_not_found';
  end if;
  if batch_status <> 'completed' then
    raise exception using errcode = '22023', message = 'birthday_assignment_batch_not_complete';
  end if;

  select count(*)::integer into participant_count
  from public.birthday_wish_campaign_participants as participant
  where participant.club_id = p_club_id
    and participant.assignment_batch_id = p_assignment_batch_id
    and participant.participant_status <> 'disabled';

  if participant_count = 0 then
    return jsonb_build_object('status', 'no_recipients', 'batch_id', p_assignment_batch_id);
  end if;

  insert into public.birthday_wish_collection_notifications (club_id, assignment_batch_id)
  values (p_club_id, p_assignment_batch_id)
  on conflict (club_id, assignment_batch_id) do nothing;

  select notification.notification_status, notification.message_id
  into notification_status, existing_message_id
  from public.birthday_wish_collection_notifications as notification
  where notification.club_id = p_club_id
    and notification.assignment_batch_id = p_assignment_batch_id
  for update;

  if notification_status = 'sent' and existing_message_id is not null then
    return jsonb_build_object(
      'status', 'sent', 'batch_id', p_assignment_batch_id,
      'message_id', existing_message_id, 'recipient_count', participant_count
    );
  end if;

  if not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'announcements_v09'
      and flag.enabled = true and flag.rollout_percentage = 100
  ) then
    update public.birthday_wish_collection_notifications
    set notification_status = 'skipped', failure_reason = 'message_center_disabled'
    where club_id = p_club_id and assignment_batch_id = p_assignment_batch_id;
    return jsonb_build_object(
      'status', 'skipped', 'batch_id', p_assignment_batch_id,
      'reason', 'message_center_disabled'
    );
  end if;

  update public.birthday_wish_collection_notifications
  set notification_status = 'pending', attempt_count = attempt_count + 1,
      last_attempt_at = now(), failure_reason = null
  where club_id = p_club_id and assignment_batch_id = p_assignment_batch_id;

  begin
    insert into public.club_messages (
      club_id, author_app_account_id, title, body, audience_kind, action_path
    ) values (
      p_club_id, actor_id, '本月生日祝福任務',
      '您有一則生日祝福任務，請打開生日祝福徵集完成它。',
      'members', action
    ) returning id into notification_message_id;

    insert into public.club_message_recipients (
      message_id, membership_id, club_id, birthday_participant_id
    )
    select notification_message_id, participant.assignee_membership_id,
      p_club_id, participant.id
    from public.birthday_wish_campaign_participants as participant
    where participant.club_id = p_club_id
      and participant.assignment_batch_id = p_assignment_batch_id
      and participant.participant_status <> 'disabled';
    get diagnostics delivered_count = row_count;

    if delivered_count <> participant_count then
      raise exception using errcode = '23514', message = 'birthday_notification_recipient_mismatch';
    end if;

    update public.birthday_wish_collection_notifications
    set notification_status = 'sent', message_id = notification_message_id,
        sent_at = now(), failure_reason = null
    where club_id = p_club_id and assignment_batch_id = p_assignment_batch_id;
  exception when others then
    get stacked diagnostics error_code = returned_sqlstate;
    update public.birthday_wish_collection_notifications
    set notification_status = 'failed',
        failure_reason = format('message_delivery_failed_%s', lower(error_code))
    where club_id = p_club_id and assignment_batch_id = p_assignment_batch_id;
    return jsonb_build_object(
      'status', 'failed', 'batch_id', p_assignment_batch_id,
      'reason', 'message_delivery_failed'
    );
  end;

  return jsonb_build_object(
    'status', 'sent', 'batch_id', p_assignment_batch_id,
    'message_id', notification_message_id, 'recipient_count', delivered_count
  );
end;
$$;

-- generate_birthday_wish_collection_month: carried over from 20260824000700_birthday_wish_assignment_runner.sql, permission check swapped.
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
     or not public.current_can_manage_birthday_collection(p_club_id)
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

-- get_my_birthday_page: carried over from 20260824001400_birthday_wishes_v1_rollback_isolation.sql, permission check swapped.
create or replace function public.get_my_birthday_page(p_club_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  selected_club_id uuid;
  actor_membership_id uuid;
  can_manage boolean := false;
  result jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'birthday_authentication_required';
  end if;

  if p_club_id is not null and not public.current_can_access_birthday_club(p_club_id) then
    raise exception using errcode = '42501', message = 'birthday_club_access_required';
  end if;

  select coalesce(p_club_id, accessible.club_id)
  into selected_club_id
  from (
    select club.id as club_id, club.club_name
    from public.clubs as club
    where club.club_status = 'active'
      and public.current_can_access_birthday_club(club.id)
    order by club.club_name, club.id
    limit 1
  ) as accessible;

  if selected_club_id is not null then
    actor_membership_id := public.current_birthday_membership_id(selected_club_id);
    can_manage := public.current_can_manage_birthday_collection(selected_club_id);
  end if;

  select jsonb_build_object(
    'clubs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'club_id', club.id,
        'club_code', club.club_code,
        'club_name', club.club_name
      ) order by club.club_name, club.id)
      from public.clubs as club
      where club.club_status = 'active'
        and public.current_can_access_birthday_club(club.id)
    ), '[]'::jsonb),
    'selected_club_id', selected_club_id,
    'can_manage', can_manage,
    'my_preference', case when actor_membership_id is null then null else (
      select jsonb_build_object(
        'membership_id', membership.id,
        'has_birth_date', person.birth_date is not null,
        'is_listed', coalesce(preference.is_listed, false),
        'allow_wishes', coalesce(preference.allow_wishes, false)
      )
      from public.club_memberships as membership
      join public.people as person on person.id = membership.person_id
      left join public.birthday_visibility_preferences as preference
        on preference.membership_id = membership.id
      where membership.id = actor_membership_id
    ) end,
    'birthdays', case when selected_club_id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'membership_id', membership.id,
        'display_name', person.canonical_name,
        'avatar_url', person.avatar_url,
        'birth_month', extract(month from person.birth_date)::integer,
        'birth_day', extract(day from person.birth_date)::integer,
        'allow_wishes', preference.allow_wishes,
        'is_self', membership.id = actor_membership_id
      ) order by extract(month from person.birth_date), extract(day from person.birth_date), person.canonical_name)
      from public.birthday_visibility_preferences as preference
      join public.club_memberships as membership
        on membership.id = preference.membership_id
       and membership.club_id = selected_club_id
       and membership.membership_status = 'active'
      join public.people as person
        on person.id = membership.person_id
       and person.birth_date is not null
      where preference.club_id = selected_club_id
        and preference.is_listed = true
    ), '[]'::jsonb) end,
    'wishes', case when selected_club_id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', wish.id,
        'recipient_membership_id', wish.recipient_membership_id,
        'recipient_name', recipient.canonical_name,
        'author_name', case
          when wish.author_app_account_id = actor_id or can_manage then author.account_display_name
          else null
        end,
        'author_is_hidden', not (wish.author_app_account_id = actor_id or can_manage),
        'content', wish.content,
        'created_at', wish.created_at,
        'updated_at', wish.updated_at,
        'can_edit', wish.author_app_account_id = actor_id,
        'can_delete', wish.author_app_account_id = actor_id,
        'can_moderate', can_manage
      ) order by wish.created_at desc, wish.id desc)
      from public.birthday_wishes as wish
      join public.club_memberships as recipient_membership
        on recipient_membership.id = wish.recipient_membership_id
       and recipient_membership.club_id = selected_club_id
       and recipient_membership.membership_status = 'active'
      join public.people as recipient on recipient.id = recipient_membership.person_id
      join public.app_accounts as author on author.id = wish.author_app_account_id
      join public.birthday_visibility_preferences as preference
        on preference.membership_id = recipient_membership.id
       and preference.club_id = selected_club_id
       and preference.is_listed = true
      where wish.club_id = selected_club_id
        and wish.experience_version = 1
        and wish.birthday_year = extract(
          year from public.birthday_club_local_date(selected_club_id)
        )::integer
        and wish.status = 'active'
      limit 200
    ), '[]'::jsonb) end
  ) into result;

  return result;
end;
$$;

-- get_my_birthday_page_v2: carried over from 20260824001300_birthday_wishes_v2_allow_wishes_projection.sql, permission check swapped.
create or replace function public.get_my_birthday_page_v2(p_club_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  selected_club_id uuid;
  actor_membership_id uuid;
  can_manage boolean := false;
  club_timezone text;
  local_today date;
  local_year integer;
  result jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'birthday_authentication_required';
  end if;

  if p_club_id is not null and not public.current_can_access_birthday_club(p_club_id) then
    raise exception using errcode = '42501', message = 'birthday_club_access_required';
  end if;

  select coalesce(p_club_id, accessible.club_id)
  into selected_club_id
  from (
    select club.id as club_id, club.club_name
    from public.clubs as club
    where club.club_status = 'active'
      and public.current_can_access_birthday_club(club.id)
    order by club.club_name, club.id
    limit 1
  ) as accessible;

  if selected_club_id is not null then
    actor_membership_id := public.current_birthday_membership_id(selected_club_id);
    can_manage := public.current_can_manage_birthday_collection(selected_club_id);
    select club.timezone_name
    into club_timezone
    from public.clubs as club
    where club.id = selected_club_id;
    local_today := (now() at time zone club_timezone)::date;
    local_year := extract(year from local_today)::integer;
  end if;

  select jsonb_build_object(
    'clubs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'club_id', club.id,
        'club_code', club.club_code,
        'club_name', club.club_name
      ) order by club.club_name, club.id)
      from public.clubs as club
      where club.club_status = 'active'
        and public.current_can_access_birthday_club(club.id)
    ), '[]'::jsonb),
    'selected_club_id', selected_club_id,
    'can_manage', can_manage,
    'my_preference', case when actor_membership_id is null then null else (
      select jsonb_build_object(
        'membership_id', membership.id,
        'has_birth_date', person.birth_date is not null,
        'has_preference', preference.membership_id is not null,
        'is_listed', coalesce(preference.is_listed, false),
        'allow_wishes', coalesce(preference.allow_wishes, false)
      )
      from public.club_memberships as membership
      join public.people as person on person.id = membership.person_id
      left join public.birthday_visibility_preferences as preference
        on preference.membership_id = membership.id
      where membership.id = actor_membership_id
    ) end,
    'birthdays', case when selected_club_id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'membership_id', membership.id,
        'display_name', person.canonical_name,
        'avatar_url', person.avatar_url,
        'birth_month', extract(month from upcoming.effective_date)::integer,
        'birth_day', extract(day from upcoming.effective_date)::integer,
        'age', case
          when preference.is_listed = true and coalesce(privacy.show_birthday_year, false)
            then public.birthday_age_on(person.birth_date, local_today)
          else null
        end,
        'days_until', (upcoming.effective_date - local_today)::integer,
        'allow_wishes', preference.allow_wishes,
        'is_self', membership.id = actor_membership_id
      ) order by upcoming.effective_date, person.canonical_name, membership.id)
      from public.birthday_visibility_preferences as preference
      join public.club_memberships as membership
        on membership.id = preference.membership_id
       and membership.club_id = selected_club_id
       and membership.membership_status = 'active'
      join public.people as person
        on person.id = membership.person_id
       and person.birth_date is not null
      left join public.app_accounts as recipient_account
        on recipient_account.person_id = person.id
       and recipient_account.account_status = 'active'
      left join public.privacy_settings as privacy
        on privacy.app_account_id = recipient_account.id
      cross join lateral (
        select case
          when public.birthday_effective_date(person.birth_date, local_year) >= local_today
            then public.birthday_effective_date(person.birth_date, local_year)
          else public.birthday_effective_date(person.birth_date, local_year + 1)
        end as effective_date
      ) as upcoming
      where preference.club_id = selected_club_id
        and preference.is_listed = true
    ), '[]'::jsonb) end,
    'wishes', case when selected_club_id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', wish.id,
        'recipient_membership_id', wish.recipient_membership_id,
        'recipient_name', recipient.canonical_name,
        'author_name', case
          when can_manage then author.account_display_name
          else null
        end,
        'author_is_hidden', not can_manage,
        'content', wish.content,
        'created_at', wish.created_at,
        'updated_at', wish.updated_at,
        'can_edit', wish.author_app_account_id = actor_id,
        'can_delete', wish.author_app_account_id = actor_id,
        'can_moderate', can_manage
      ) order by wish.created_at desc, wish.id desc)
      from public.birthday_wishes as wish
      join public.club_memberships as recipient_membership
        on recipient_membership.id = wish.recipient_membership_id
       and recipient_membership.club_id = selected_club_id
       and recipient_membership.membership_status = 'active'
      join public.people as recipient on recipient.id = recipient_membership.person_id
      join public.app_accounts as author on author.id = wish.author_app_account_id
      join public.birthday_visibility_preferences as preference
        on preference.membership_id = recipient_membership.id
       and preference.club_id = selected_club_id
       and preference.is_listed = true
       and preference.allow_wishes = true
      where wish.club_id = selected_club_id
        and wish.birthday_year = local_year
        and wish.status = 'active'
      limit 200
    ), '[]'::jsonb) end
  ) into result;

  return result;
end;
$$;

-- get_my_birthday_wish_collection_page: carried over from 20260824001000_birthday_wish_collection_review.sql, permission check swapped.
create or replace function public.get_my_birthday_wish_collection_page(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid;
  can_manage boolean := false;
  result jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'birthday_authentication_required';
  end if;

  if p_club_id is null or not public.current_can_access_birthday_club(p_club_id) then
    raise exception using errcode = '42501', message = 'birthday_club_access_required';
  end if;

  actor_membership_id := public.current_birthday_membership_id(p_club_id);
  can_manage := public.current_can_manage_birthday_collection(p_club_id);

  select jsonb_build_object(
    'club_id', p_club_id,
    'can_manage', can_manage,
    'my_assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'participant_id', participant.id,
        'campaign_id', participant.campaign_id,
        'recipient_membership_id', campaign.recipient_membership_id,
        'recipient_name', recipient.canonical_name,
        'birthday_date', campaign.birthday_date,
        'participant_status', participant.participant_status,
        'question_prompt', participant.question_prompt_snapshot,
        'submission_id', submission.id,
        'submission_status', submission.submission_status,
        'content', case
          when submission.submission_status in ('deleted', 'hidden') then null
          else submission.content
        end,
        'submitted_at', submission.submitted_at,
        'can_edit', participant.participant_status not in ('declined', 'disabled')
          and (submission.id is null or submission.submission_status <> 'published'),
        'can_decline', participant.participant_status = 'invited'
          and campaign.campaign_status in ('draft', 'collecting')
          and (submission.id is null or submission.submission_status = 'deleted')
      ) order by campaign.birthday_date, participant.id)
      from public.birthday_wish_campaign_participants as participant
      join public.birthday_wish_campaigns as campaign
        on campaign.id = participant.campaign_id
       and campaign.club_id = participant.club_id
      join public.club_memberships as recipient_membership
        on recipient_membership.id = campaign.recipient_membership_id
       and recipient_membership.club_id = p_club_id
      join public.people as recipient on recipient.id = recipient_membership.person_id
      left join lateral (
        select submission.id, submission.submission_status, submission.content,
          submission.submitted_at
        from public.birthday_wish_campaign_submissions as submission
        where submission.participant_id = participant.id
          and submission.club_id = participant.club_id
        order by submission.revision_number desc, submission.id desc
        limit 1
      ) as submission on true
      where participant.club_id = p_club_id
        and participant.assignee_membership_id = actor_membership_id
        and campaign.campaign_status in ('draft', 'collecting', 'published')
    ), '[]'::jsonb),
    'campaigns', case when can_manage then coalesce((
      select jsonb_agg(jsonb_build_object(
        'campaign_id', campaign.id,
        'recipient_membership_id', campaign.recipient_membership_id,
        'recipient_name', recipient.canonical_name,
        'birthday_year', campaign.birthday_year,
        'birthday_date', campaign.birthday_date,
        'campaign_status', campaign.campaign_status,
        'participant_count', (
          select count(*)::integer
          from public.birthday_wish_campaign_participants as participant
          where participant.campaign_id = campaign.id
            and participant.club_id = p_club_id
        ),
        'submitted_count', (
          select count(*)::integer
          from public.birthday_wish_campaign_participants as participant
          left join lateral (
            select submission.submission_status
            from public.birthday_wish_campaign_submissions as submission
            where submission.participant_id = participant.id
              and submission.club_id = participant.club_id
            order by submission.revision_number desc, submission.id desc
            limit 1
          ) as latest on true
          where participant.campaign_id = campaign.id
            and participant.club_id = p_club_id
            and latest.submission_status in ('submitted', 'published')
        )
      ) order by campaign.birthday_date, campaign.id)
      from public.birthday_wish_campaigns as campaign
      join public.club_memberships as recipient_membership
        on recipient_membership.id = campaign.recipient_membership_id
       and recipient_membership.club_id = p_club_id
      join public.people as recipient on recipient.id = recipient_membership.person_id
      where campaign.club_id = p_club_id
        and campaign.campaign_status <> 'hidden'
    ), '[]'::jsonb) else '[]'::jsonb end,
    'participants', case when can_manage then coalesce((
      select jsonb_agg(jsonb_build_object(
        'participant_id', participant.id,
        'campaign_id', participant.campaign_id,
        'assignee_membership_id', participant.assignee_membership_id,
        'assignee_name', assignee.canonical_name,
        'participant_status', participant.participant_status,
        'question_prompt', participant.question_prompt_snapshot,
        'submission_status', submission.submission_status,
        'author_name', author.account_display_name,
        'content', case when submission.submission_status = 'deleted' then null else submission.content end,
        'submitted_at', submission.submitted_at,
        'processing_history', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', event.id,
            'event_type', event.event_type,
            'previous_status', event.previous_status,
            'next_status', event.next_status,
            'actor_name', event_actor.account_display_name,
            'content_snapshot', event.content_snapshot,
            'created_at', event.created_at
          ) order by event.created_at desc, event.id desc)
          from public.birthday_wish_submission_events as event
          join public.app_accounts as event_actor on event_actor.id = event.actor_app_account_id
          where event.club_id = p_club_id and event.participant_id = participant.id
        ), '[]'::jsonb)
      ) order by campaign.birthday_date, participant.id)
      from public.birthday_wish_campaign_participants as participant
      join public.birthday_wish_campaigns as campaign
        on campaign.id = participant.campaign_id
       and campaign.club_id = participant.club_id
      join public.club_memberships as assignee_membership
        on assignee_membership.id = participant.assignee_membership_id
       and assignee_membership.club_id = p_club_id
      join public.people as assignee on assignee.id = assignee_membership.person_id
      left join lateral (
        select submission.id, submission.submission_status, submission.content,
          submission.submitted_at, submission.author_app_account_id
        from public.birthday_wish_campaign_submissions as submission
        where submission.participant_id = participant.id
          and submission.club_id = participant.club_id
        order by submission.revision_number desc, submission.id desc
        limit 1
      ) as submission on true
      left join public.app_accounts as author on author.id = submission.author_app_account_id
      where participant.club_id = p_club_id
        and campaign.campaign_status <> 'hidden'
    ), '[]'::jsonb) else '[]'::jsonb end,
    'question_bank', case when can_manage
      then public.list_birthday_wish_question_bank(p_club_id)
      else jsonb_build_object('platform', '[]'::jsonb, 'club', '[]'::jsonb)
    end
  ) into result;

  return result;
end;
$$;

-- hide_birthday_wish: carried over from 20260820001000_birthday_wishes.sql, permission check swapped.
create or replace function public.hide_birthday_wish(
  p_club_id uuid,
  p_wish_id uuid,
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
begin
  if actor_id is null
     or not public.current_can_access_birthday_club(p_club_id)
     or not public.current_can_manage_birthday_collection(p_club_id) then
    raise exception using errcode = '42501', message = 'birthday_manager_required';
  end if;

  if char_length(normalized_reason) < 2 or char_length(normalized_reason) > 300 then
    raise exception using errcode = '22023', message = 'invalid_birthday_moderation_reason';
  end if;

  update public.birthday_wishes
  set status = 'hidden',
      removed_at = now(),
      removed_by_app_account_id = actor_id,
      removal_reason = normalized_reason
  where id = p_wish_id
    and club_id = p_club_id
    and status = 'active';

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_wish_not_available';
  end if;
end;
$$;

-- hide_birthday_wish_submission: carried over from 20260824001000_birthday_wish_collection_review.sql, permission check swapped.
create or replace function public.hide_birthday_wish_submission(
  p_club_id uuid,
  p_participant_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  submission_id uuid;
  submission_status text;
  submission_content text;
begin
  if actor_id is null
     or not public.current_can_manage_birthday_collection(p_club_id)
     or not exists (
       select 1 from public.clubs where id = p_club_id and club_status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'birthday_collection_manager_required';
  end if;

  select submission.id, submission.submission_status, submission.content
  into submission_id, submission_status, submission_content
  from public.birthday_wish_campaign_submissions as submission
  where submission.club_id = p_club_id
    and submission.participant_id = p_participant_id
  order by submission.revision_number desc, submission.id desc
  limit 1
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_submission_not_found';
  end if;
  if submission_status = 'hidden' then
    return;
  end if;
  if submission_status <> 'published' then
    raise exception using errcode = '22023', message = 'birthday_submission_not_ready_for_hiding';
  end if;

  update public.birthday_wish_campaign_submissions
  set submission_status = 'hidden',
      hidden_at = now(),
      hidden_by_app_account_id = actor_id
  where id = submission_id and club_id = p_club_id;

  update public.birthday_wish_campaign_participants
  set participant_status = 'invited',
      responded_at = null
  where id = p_participant_id and club_id = p_club_id;

  perform public.append_birthday_wish_submission_event(
    p_club_id, p_participant_id, submission_id, 'hidden',
    'published', 'hidden', submission_content
  );
end;
$$;

-- list_birthday_wish_question_bank: carried over from 20260824000600_birthday_wish_collection_core.sql, permission check swapped.
create or replace function public.list_birthday_wish_question_bank(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  result jsonb;
begin
  if p_club_id is null
     or not public.current_can_manage_birthday_collection(p_club_id)
     or not exists (
       select 1 from public.clubs
       where id = p_club_id and club_status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'birthday_collection_manager_required';
  end if;

  select jsonb_build_object(
    'platform', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'question_key', item.question_key,
        'prompt', item.prompt,
        'tone', item.tone,
        'sort_order', item.sort_order,
        'is_enabled', item.is_enabled,
        'scope', 'platform'
      ) order by item.sort_order, item.question_key)
      from public.birthday_wish_question_bank_items as item
      where item.club_id is null
    ), '[]'::jsonb),
    'club', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'question_key', item.question_key,
        'prompt', item.prompt,
        'tone', item.tone,
        'sort_order', item.sort_order,
        'is_enabled', item.is_enabled,
        'scope', 'club'
      ) order by item.sort_order, item.question_key)
      from public.birthday_wish_question_bank_items as item
      where item.club_id = p_club_id
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

-- list_published_birthday_wish_submissions: carried over from 20260824001100_birthday_wish_author_anonymity.sql, permission check swapped.
create or replace function public.list_published_birthday_wish_submissions(
  p_club_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  can_manage boolean := false;
  result jsonb;
begin
  if actor_id is null or not public.current_can_access_birthday_club(p_club_id) then
    raise exception using errcode = '42501', message = 'birthday_club_access_required';
  end if;

  can_manage := public.current_can_manage_birthday_collection(p_club_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'submission_id', submission.id,
    'campaign_id', campaign.id,
    'recipient_membership_id', campaign.recipient_membership_id,
    'recipient_name', recipient.canonical_name,
    'birthday_date', campaign.birthday_date,
    'content', submission.content,
    'published_at', submission.published_at,
    'author_name', case
      when can_manage then author.account_display_name
      else null
    end,
    'author_is_hidden', not can_manage
  ) order by campaign.birthday_date, submission.published_at, submission.id), '[]'::jsonb)
  into result
  from public.birthday_wish_campaign_submissions as submission
  join public.birthday_wish_campaigns as campaign
    on campaign.id = submission.campaign_id
   and campaign.club_id = submission.club_id
  join public.club_memberships as recipient_membership
    on recipient_membership.id = campaign.recipient_membership_id
   and recipient_membership.club_id = p_club_id
   and recipient_membership.membership_status = 'active'
  join public.people as recipient on recipient.id = recipient_membership.person_id
  join public.birthday_visibility_preferences as preference
    on preference.membership_id = recipient_membership.id
   and preference.club_id = p_club_id
   and preference.is_listed = true
   and preference.allow_wishes = true
  join public.app_accounts as author on author.id = submission.author_app_account_id
  where submission.club_id = p_club_id
    and submission.submission_status = 'published'
    and campaign.campaign_status <> 'hidden';

  return result;
end;
$$;

-- publish_birthday_wish_submission: carried over from 20260824001000_birthday_wish_collection_review.sql, permission check swapped.
create or replace function public.publish_birthday_wish_submission(
  p_club_id uuid,
  p_participant_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  submission_id uuid;
  submission_status text;
  submission_content text;
  campaign_status text;
  target_campaign_id uuid;
begin
  if actor_id is null
     or not public.current_can_manage_birthday_collection(p_club_id)
     or not exists (
       select 1 from public.clubs
       where id = p_club_id and club_status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'birthday_collection_manager_required';
  end if;

  select submission.id, submission.submission_status, submission.content,
    submission.campaign_id, campaign.campaign_status
  into submission_id, submission_status, submission_content,
    target_campaign_id, campaign_status
  from public.birthday_wish_campaign_submissions as submission
  join public.birthday_wish_campaigns as campaign
    on campaign.id = submission.campaign_id and campaign.club_id = submission.club_id
  where submission.participant_id = p_participant_id
    and submission.club_id = p_club_id
  order by submission.revision_number desc, submission.id desc
  limit 1
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_submission_not_found';
  end if;
  if submission_status = 'published' then
    return;
  end if;
  if submission_status <> 'submitted' then
    raise exception using errcode = '22023', message = 'birthday_submission_not_ready_for_publication';
  end if;
  if campaign_status not in ('draft', 'collecting', 'published') then
    raise exception using errcode = '22023', message = 'birthday_campaign_submission_closed';
  end if;

  update public.birthday_wish_campaign_submissions
  set submission_status = 'published',
      published_at = coalesce(published_at, now()),
      deleted_at = null
  where id = submission_id and club_id = p_club_id;

  update public.birthday_wish_campaign_participants
  set participant_status = 'submitted',
      responded_at = coalesce(responded_at, now())
  where id = p_participant_id and club_id = p_club_id;

  perform public.append_birthday_wish_submission_event(
    p_club_id, p_participant_id, submission_id, 'published',
    'submitted', 'published', submission_content
  );

  -- A campaign is complete only when every non-declined/non-disabled member
  -- has a published current revision. A hidden revision deliberately keeps it
  -- open for a correction.
  if not exists (
    select 1
    from public.birthday_wish_campaign_participants as participant
    left join lateral (
      select submission.submission_status
      from public.birthday_wish_campaign_submissions as submission
      where submission.participant_id = participant.id
        and submission.club_id = participant.club_id
      order by submission.revision_number desc, submission.id desc
      limit 1
    ) as latest on true
    where participant.campaign_id = target_campaign_id
      and participant.club_id = p_club_id
      and participant.participant_status not in ('declined', 'disabled')
      and (latest.submission_status is null or latest.submission_status <> 'published')
  ) then
    update public.birthday_wish_campaigns
    set campaign_status = 'published',
        published_at = coalesce(published_at, now())
    where id = target_campaign_id and club_id = p_club_id;
  end if;
end;
$$;

-- update_birthday_wish_question: carried over from 20260824000600_birthday_wish_collection_core.sql, permission check swapped.
create or replace function public.update_birthday_wish_question(
  p_club_id uuid,
  p_question_id uuid,
  p_prompt text,
  p_tone text,
  p_sort_order integer,
  p_is_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  normalized_prompt text := public.normalize_birthday_wish(p_prompt);
begin
  if actor_id is null
     or not public.current_can_manage_birthday_collection(p_club_id)
     or not exists (
       select 1 from public.clubs
       where id = p_club_id and club_status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'birthday_collection_manager_required';
  end if;

  if normalized_prompt = ''
     or char_length(normalized_prompt) > 300
     or p_tone not in ('warm', 'humorous', 'moving')
     or p_sort_order not between 0 and 10000
     or p_is_enabled is null then
    raise exception using errcode = '22023', message = 'invalid_birthday_question';
  end if;

  update public.birthday_wish_question_bank_items
  set prompt = normalized_prompt,
      tone = p_tone,
      sort_order = p_sort_order,
      is_enabled = p_is_enabled
  where id = p_question_id
    and club_id = p_club_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_club_question_not_found';
  end if;
end;
$$;

-- Scheduler: find the club's own officers, and dispatch for the whole
-- club-local month rather than the next seven days.
create or replace function public.run_birthday_wish_collection_scheduler(
  p_as_of timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  club_row record;
  period record;
  manager_auth_user_id uuid;
  result jsonb;
  notification_result jsonb;
  generated_count integer := 0;
  notified_count integer := 0;
  skipped_count integer := 0;
  skipped_no_manager_count integer := 0;
  failed_count integer := 0;
begin
  if p_as_of is null then
    raise exception using errcode = '22023', message = 'invalid_birthday_scheduler_time';
  end if;

  for club_row in
    select club_data.id, club_data.timezone_name
    from public.clubs as club_data
    where club_data.club_status = 'active'
    order by club_data.id
  loop
    -- Pick a birthday manager belonging to this club. Executive secretaries
    -- live in club_operator_permissions; presidents and secretaries live in
    -- club_role_assignments and were invisible here, which skipped the whole
    -- club. Platform administrators are deliberately excluded: an automatic
    -- dispatch has to act as a real officer of the club it dispatches for, and
    -- club_role_assignments carries no validity window, so 'active' is the
    -- whole expiry test on that path.
    select candidate.auth_user_id
    into manager_auth_user_id
    from (
      select account.auth_user_id,
             1 as manager_priority,
             permission.starts_at as ordered_at,
             account.id as account_id
      from public.club_operator_permissions as permission
      join public.app_accounts as account
        on account.id = permission.app_account_id
      where permission.club_id = club_row.id
        and permission.permission_level = 'club_manager'
        and permission.assignment_status = 'active'
        and permission.starts_at <= p_as_of
        and (permission.ends_at is null or permission.ends_at > p_as_of)
        and account.account_status = 'active'
        and account.auth_user_id is not null
      union all
      select account.auth_user_id,
             case assignment.role_key when 'president' then 2 else 3 end as manager_priority,
             assignment.granted_at as ordered_at,
             account.id as account_id
      from public.club_role_assignments as assignment
      join public.app_accounts as account
        on account.id = assignment.app_account_id
      join public.club_memberships as membership
        on membership.club_id = assignment.club_id
       and membership.person_id = account.person_id
       and membership.membership_status = 'active'
      where assignment.club_id = club_row.id
        and assignment.role_key in ('president', 'secretary')
        and assignment.assignment_status = 'active'
        and account.account_status = 'active'
        and account.auth_user_id is not null
    ) as candidate
    order by candidate.manager_priority, candidate.ordered_at, candidate.account_id
    limit 1;

    if manager_auth_user_id is null then
      skipped_count := skipped_count + 1;
      skipped_no_manager_count := skipped_no_manager_count + 1;
      continue;
    end if;

    -- The claim is set only inside this SECURITY DEFINER transaction and only
    -- after the caller passed the service_role-only function grant.
    perform set_config('request.jwt.claim.sub', manager_auth_user_id::text, true);

    for period in
      select
        extract(year from birthday.birthday_date)::integer as birthday_year,
        extract(month from birthday.birthday_date)::integer as birthday_month,
        min(birthday.birthday_date) as first_birthday_date
      from public.club_memberships as membership
      join public.people as person on person.id = membership.person_id
      join public.birthday_visibility_preferences as preference
        on preference.membership_id = membership.id
       and preference.club_id = club_row.id
       and preference.is_listed = true
       and preference.allow_wishes = true
      cross join lateral (
        select (p_as_of at time zone club_row.timezone_name)::date as local_today
      ) as clock
      cross join lateral (
        select public.birthday_effective_date(
          person.birth_date, extract(year from clock.local_today)::integer
        ) as birthday_date
        union all
        select public.birthday_effective_date(
          person.birth_date, extract(year from clock.local_today)::integer + 1
        ) as birthday_date
      ) as birthday
      where membership.club_id = club_row.id
        and membership.membership_status = 'active'
        and person.birth_date is not null
        and birthday.birthday_date >= date_trunc('month', clock.local_today)::date
        and birthday.birthday_date < (date_trunc('month', clock.local_today) + interval '1 month')::date
      group by extract(year from birthday.birthday_date), extract(month from birthday.birthday_date)
      order by first_birthday_date
    loop
      begin
        result := public.generate_birthday_wish_collection_month(
          club_row.id, period.birthday_year, period.birthday_month
        );
        generated_count := generated_count + 1;

        notification_result := public.ensure_birthday_wish_collection_notification(
          club_row.id, (result ->> 'batch_id')::uuid
        );
        if notification_result ->> 'status' = 'sent' then
          notified_count := notified_count + 1;
        elsif notification_result ->> 'status' = 'failed' then
          failed_count := failed_count + 1;
        end if;
      exception when others then
        failed_count := failed_count + 1;
      end;
    end loop;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'generated_count', generated_count,
    'notified_count', notified_count,
    'skipped_count', skipped_count,
    'skipped_reasons', jsonb_build_object(
      'no_active_birthday_manager', skipped_no_manager_count
    ),
    'failed_count', failed_count
  );
end;
$$;

revoke all on function public.run_birthday_wish_collection_scheduler(timestamptz) from public, anon, authenticated;
grant execute on function public.run_birthday_wish_collection_scheduler(timestamptz) to service_role;

commit;
