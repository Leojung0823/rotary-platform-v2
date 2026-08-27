begin;

-- A message may carry a relative in-app destination. It is deliberately not a
-- URL: the database rejects protocol-relative, absolute and javascript-like
-- values before they can reach the browser.
alter table public.club_messages
  add column action_path text;

alter table public.club_messages
  add constraint club_messages_action_path_check check (
    action_path is null
    or (
      char_length(action_path) between 2 and 500
      and action_path not like '//%'
      and left(action_path, 1) = '/'
      and substring(action_path from 2) <> ''
      and translate(
        substring(action_path from 2 for 1),
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
        ''
      ) = ''
      and translate(
        action_path,
        '/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-/?=&._%',
        ''
      ) = ''
    )
  );

comment on column public.club_messages.action_path is
  'Optional safe relative in-app destination. Never an external URL.';

-- One notification record per completed assignment batch. This is separate
-- from the message itself so a disabled message centre, a transient failure,
-- or a scheduler retry never creates a second delivery message.
create table public.birthday_wish_collection_notifications (
  club_id uuid not null references public.clubs(id) on delete restrict,
  assignment_batch_id uuid not null,
  message_id uuid,
  notification_status text not null default 'pending',
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (club_id, assignment_batch_id),
  constraint birthday_collection_notification_batch_club_fkey
    foreign key (assignment_batch_id, club_id)
    references public.birthday_wish_assignment_batches (id, club_id) on delete restrict,
  constraint birthday_collection_notification_message_club_fkey
    foreign key (message_id, club_id)
    references public.club_messages (id, club_id) on delete restrict,
  constraint birthday_collection_notification_message_unique
    unique (club_id, message_id),
  constraint birthday_collection_notification_status_check check (
    notification_status in ('pending', 'skipped', 'sent', 'failed')
  ),
  constraint birthday_collection_notification_attempt_check check (attempt_count >= 0),
  constraint birthday_collection_notification_sent_consistency check (
    (notification_status = 'sent' and message_id is not null and sent_at is not null)
    or (notification_status <> 'sent')
  )
);

create index birthday_collection_notifications_retry_idx
  on public.birthday_wish_collection_notifications (club_id, notification_status, updated_at);

alter table public.birthday_wish_collection_notifications enable row level security;
revoke all on table public.birthday_wish_collection_notifications from public, anon, authenticated;

create or replace function public.touch_birthday_collection_notification()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger birthday_collection_notifications_touch
before update on public.birthday_wish_collection_notifications
for each row execute function public.touch_birthday_collection_notification();

-- Add the destination to the existing member and officer projections without
-- changing the message-centre RPC signatures.
create or replace function public.list_my_club_messages(
  p_club_id uuid,
  p_cursor_published_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  my_membership_id uuid := public.current_club_membership_id(p_club_id);
  result jsonb;
begin
  if not public.current_is_active_club_member(p_club_id) or my_membership_id is null then
    raise exception using errcode = '42501', message = 'active_club_membership_required';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using errcode = '22023', message = 'invalid_message_limit';
  end if;

  if (p_cursor_published_at is null) <> (p_cursor_id is null) then
    raise exception using errcode = '22023', message = 'invalid_message_cursor';
  end if;

  with page as materialized (
    select message.id, message.title, message.body, message.audience_kind,
      message.action_path, message.published_at, recipient.read_at,
      account.account_display_name as author_display_name
    from public.club_message_recipients as recipient
    join public.club_messages as message on message.id = recipient.message_id
    join public.app_accounts as account on account.id = message.author_app_account_id
    where recipient.club_id = p_club_id
      and recipient.membership_id = my_membership_id
      and message.status = 'active'
      and (
        p_cursor_published_at is null
        or message.published_at < p_cursor_published_at
        or (message.published_at = p_cursor_published_at and message.id < p_cursor_id)
      )
    order by message.published_at desc, message.id desc
    limit p_limit + 1
  ), visible as materialized (
    select * from page
    order by published_at desc, id desc
    limit p_limit
  )
  select jsonb_build_object(
    'messages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', visible.id,
          'title', visible.title,
          'body', visible.body,
          'audience_kind', visible.audience_kind,
          'action_path', visible.action_path,
          'published_at', visible.published_at,
          'author_display_name', visible.author_display_name,
          'read_at', visible.read_at
        ) order by visible.published_at desc, visible.id desc
      )
      from visible
    ), '[]'::jsonb),
    'unread_count', public.my_unread_club_message_count(p_club_id),
    'next_cursor', case
      when (select count(*) from page) > p_limit then (
        select jsonb_build_object('v', 1, 'published_at', visible.published_at, 'id', visible.id)
        from visible
        order by visible.published_at asc, visible.id asc
        limit 1
      )
      else null
    end
  ) into result;

  return result;
end;
$$;

create or replace function public.list_club_sent_messages(p_club_id uuid, p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  result jsonb;
begin
  if public.current_app_account_id() is null
     or not public.current_has_club_permission(p_club_id, 'member.manage') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using errcode = '22023', message = 'invalid_message_limit';
  end if;

  select coalesce(jsonb_agg(sent order by sent.published_at desc, sent.id desc), '[]'::jsonb)
  into result
  from (
    select message.id, message.title, message.body, message.audience_kind,
      message.action_path, message.published_at,
      account.account_display_name as author_display_name,
      (select count(*) from public.club_message_recipients as recipient
        where recipient.message_id = message.id) as recipient_count,
      (select count(*) from public.club_message_recipients as recipient
        where recipient.message_id = message.id and recipient.read_at is not null) as read_count,
      coalesce((
        select jsonb_agg(tag.tag_name order by tag.tag_name)
        from public.club_message_audiences as addressed
        join public.club_member_tags as tag on tag.id = addressed.tag_id
        where addressed.message_id = message.id
      ), '[]'::jsonb) as audience_tag_names
    from public.club_messages as message
    join public.app_accounts as account on account.id = message.author_app_account_id
    where message.club_id = p_club_id
      and message.status = 'active'
    order by message.published_at desc, message.id desc
    limit p_limit
  ) as sent;

  return result;
end;
$$;

-- The HTTP scheduler is a hosted-only entry point. Keep the flag read behind a
-- narrow service-role RPC because the rollout table is intentionally closed to
-- direct service-role table reads as well as to browser roles.
create or replace function public.is_birthday_wish_collection_scheduler_enabled(
  p_environment text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if p_environment not in ('staging', 'production') then
    return false;
  end if;

  return exists (
    select 1
    from public.platform_feature_flags as flag
    where flag.feature_key = 'birthday_wishes_collection_v1'
      and flag.enabled = true
      and flag.rollout_percentage = 100
      and p_environment = any(flag.enabled_environments)
  );
end;
$$;

-- Create one in-app invitation for the participant snapshot. The function is
-- callable by a manager for the manual runner and by the protected scheduler
-- after it has selected a valid club manager as the internal actor.
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
     or not public.current_can_manage_club(p_club_id)
     or not exists (
       select 1 from public.clubs
       where id = p_club_id and club_status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'birthday_collection_manager_required';
  end if;

  select batch.batch_status
  into batch_status
  from public.birthday_wish_assignment_batches as batch
  where batch.id = p_assignment_batch_id
    and batch.club_id = p_club_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_assignment_batch_not_found';
  end if;
  if batch_status <> 'completed' then
    raise exception using errcode = '22023', message = 'birthday_assignment_batch_not_complete';
  end if;

  select count(*)::integer
  into participant_count
  from public.birthday_wish_campaign_participants as participant
  where participant.club_id = p_club_id
    and participant.assignment_batch_id = p_assignment_batch_id
    and participant.participant_status <> 'disabled';

  if participant_count = 0 then
    return jsonb_build_object('status', 'no_recipients', 'batch_id', p_assignment_batch_id);
  end if;

  insert into public.birthday_wish_collection_notifications (
    club_id, assignment_batch_id
  ) values (
    p_club_id, p_assignment_batch_id
  ) on conflict (club_id, assignment_batch_id) do nothing;

  select notification.notification_status, notification.message_id
  into notification_status, existing_message_id
  from public.birthday_wish_collection_notifications as notification
  where notification.club_id = p_club_id
    and notification.assignment_batch_id = p_assignment_batch_id
  for update;

  if notification_status = 'sent' and existing_message_id is not null then
    return jsonb_build_object(
      'status', 'sent',
      'batch_id', p_assignment_batch_id,
      'message_id', existing_message_id,
      'recipient_count', participant_count
    );
  end if;

  -- The scheduler may create assignments while announcements are dark. Keep
  -- the retry record, but do not put invisible messages into the inbox.
  if not exists (
    select 1
    from public.platform_feature_flags as flag
    where flag.feature_key = 'announcements_v09'
      and flag.enabled = true
      and flag.rollout_percentage = 100
  ) then
    update public.birthday_wish_collection_notifications
    set notification_status = 'skipped',
        failure_reason = 'message_center_disabled'
    where club_id = p_club_id and assignment_batch_id = p_assignment_batch_id;
    return jsonb_build_object(
      'status', 'skipped',
      'batch_id', p_assignment_batch_id,
      'reason', 'message_center_disabled'
    );
  end if;

  update public.birthday_wish_collection_notifications
  set notification_status = 'pending',
      attempt_count = attempt_count + 1,
      last_attempt_at = now(),
      failure_reason = null
  where club_id = p_club_id and assignment_batch_id = p_assignment_batch_id;

  begin
    insert into public.club_messages (
      club_id, author_app_account_id, title, body, audience_kind, action_path
    ) values (
      p_club_id,
      actor_id,
      '本月生日祝福任務',
      '您有一則生日祝福任務，請打開生日祝福徵集完成它。',
      'members',
      action
    ) returning id into notification_message_id;

    insert into public.club_message_recipients (message_id, membership_id, club_id)
    select notification_message_id, participant.assignee_membership_id, p_club_id
    from public.birthday_wish_campaign_participants as participant
    where participant.club_id = p_club_id
      and participant.assignment_batch_id = p_assignment_batch_id
      and participant.participant_status <> 'disabled';
    get diagnostics delivered_count = row_count;

    if delivered_count <> participant_count then
      raise exception using errcode = '23514', message = 'birthday_notification_recipient_mismatch';
    end if;

    update public.birthday_wish_collection_notifications
    set notification_status = 'sent',
        message_id = notification_message_id,
        sent_at = now(),
        failure_reason = null
    where club_id = p_club_id and assignment_batch_id = p_assignment_batch_id;
  exception when others then
    get stacked diagnostics error_code = returned_sqlstate;
    update public.birthday_wish_collection_notifications
    set notification_status = 'failed',
        failure_reason = format('message_delivery_failed_%s', lower(error_code))
    where club_id = p_club_id and assignment_batch_id = p_assignment_batch_id;
    return jsonb_build_object(
      'status', 'failed',
      'batch_id', p_assignment_batch_id,
      'reason', 'message_delivery_failed'
    );
  end;

  return jsonb_build_object(
    'status', 'sent',
    'batch_id', p_assignment_batch_id,
    'message_id', notification_message_id,
    'recipient_count', delivered_count
  );
end;
$$;

-- The scheduler is intentionally not available to browser roles. It selects a
-- real active club manager as the internal actor so the existing manager-only
-- birthday RPCs remain the single mutation authority.
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
    select account.auth_user_id
    into manager_auth_user_id
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
    order by permission.starts_at, account.id
    limit 1;

    if manager_auth_user_id is null then
      skipped_count := skipped_count + 1;
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
        and birthday.birthday_date between clock.local_today and clock.local_today + 7
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
    'failed_count', failed_count
  );
end;
$$;

revoke all on function public.touch_birthday_collection_notification() from public, anon, authenticated;
revoke all on function public.is_birthday_wish_collection_scheduler_enabled(text) from public, anon, authenticated;
revoke all on function public.ensure_birthday_wish_collection_notification(uuid, uuid) from public, anon;
revoke all on function public.run_birthday_wish_collection_scheduler(timestamptz) from public, anon, authenticated;
grant execute on function public.is_birthday_wish_collection_scheduler_enabled(text) to service_role;
grant execute on function public.ensure_birthday_wish_collection_notification(uuid, uuid) to authenticated, service_role;
grant execute on function public.run_birthday_wish_collection_scheduler(timestamptz) to service_role;

commit;
