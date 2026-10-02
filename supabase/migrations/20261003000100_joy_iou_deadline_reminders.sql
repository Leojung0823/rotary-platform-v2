begin;

-- One record per member/kind/Taiwan-local day. In-app tasks already display the
-- due/overdue state; this table only makes proactive LINE delivery idempotent.
create table public.joy_iou_deadline_reminders (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  recipient_membership_id uuid not null,
  recipient_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  reminder_kind text not null check (reminder_kind in ('due_today', 'overdue')),
  notification_date date not null,
  actionable_count integer not null check (actionable_count > 0),
  delivery_status text not null default 'pending' check (delivery_status in (
    'pending', 'processing', 'sent', 'mocked', 'failed', 'skipped', 'unknown', 'deferred'
  )),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  attempted_at timestamptz,
  completed_at timestamptz,
  failure_code text check (failure_code is null or failure_code in (
    'credentials_rejected', 'rate_limited', 'request_rejected', 'provider_unavailable',
    'provider_timeout', 'provider_error', 'oa_not_configured', 'recipient_unavailable',
    'processing_timeout', 'scheduler_halted_for_quota', 'feature_disabled'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint joy_iou_deadline_reminder_membership_club_fkey
    foreign key (recipient_membership_id, club_id)
    references public.club_memberships(id, club_id) on delete restrict,
  constraint joy_iou_deadline_reminder_dedupe
    unique (club_id, recipient_membership_id, reminder_kind, notification_date),
  constraint joy_iou_deadline_reminder_state_consistency check (
    (delivery_status = 'pending' and attempted_at is null and completed_at is null)
    or (delivery_status = 'processing' and attempted_at is not null and completed_at is null)
    or (delivery_status in ('sent', 'mocked', 'failed', 'skipped', 'unknown', 'deferred')
      and completed_at is not null)
  )
);

create index joy_iou_deadline_reminders_pending_idx
  on public.joy_iou_deadline_reminders (notification_date, created_at, id)
  where delivery_status = 'pending';

alter table public.joy_iou_deadline_reminders enable row level security;
revoke all on table public.joy_iou_deadline_reminders from public, anon, authenticated, service_role;

alter table public.line_push_logs
  add column source_joy_iou_reminder_id uuid
    references public.joy_iou_deadline_reminders(id) on delete restrict;

create unique index line_push_logs_one_per_joy_iou_reminder
  on public.line_push_logs (source_joy_iou_reminder_id)
  where source_joy_iou_reminder_id is not null;

-- Scheduler-only. The JOY and LINE push flags must both be enabled in staging.
-- Messages contain no private IOU text or participant names.
create or replace function public.run_joy_iou_deadline_reminder_scheduler(
  p_as_of timestamptz default now(),
  p_limit integer default 100
)
returns table (
  reminder_id uuid,
  club_id uuid,
  recipient_membership_id uuid,
  recipient_app_account_id uuid,
  oa_user_id text,
  reminder_kind text,
  notification_date date,
  actionable_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  taiwan_today date;
begin
  if p_as_of is null or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception using errcode = '22023', message = 'invalid_joy_iou_reminder_input';
  end if;
  taiwan_today := (p_as_of at time zone 'Asia/Taipei')::date;

  -- Production is deliberately excluded until a separate release decision.
  if not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'joy_wall_v1' and flag.enabled
      and flag.rollout_percentage = 100 and 'staging' = any(flag.enabled_environments)
  ) or not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'line_oa_event_push_v1' and flag.enabled
      and flag.rollout_percentage = 100 and 'staging' = any(flag.enabled_environments)
  ) then
    update public.joy_iou_deadline_reminders as reminder
    set delivery_status = 'skipped', failure_code = 'feature_disabled',
        completed_at = p_as_of, updated_at = p_as_of
    where reminder.delivery_status = 'pending';
    return;
  end if;

  -- Never retry a request whose response could have been lost after LINE
  -- accepted it. A human can reconcile these; an automatic second send could
  -- duplicate a private reminder.
  update public.joy_iou_deadline_reminders as reminder
  set delivery_status = 'unknown', failure_code = 'processing_timeout',
      completed_at = p_as_of, updated_at = p_as_of
  where reminder.delivery_status = 'processing'
    and reminder.attempted_at < p_as_of - interval '20 minutes';

  with actionable as (
    select item.club_id, item.post_id, item.due_on,
      post.author_membership_id as membership_id,
      post.author_app_account_id as target_app_account_id
    from public.joy_iou_items as item
    join public.joy_posts as post on post.id = item.post_id and post.club_id = item.club_id
    where item.status in ('accepted', 'in_progress')
      and post.post_status = 'published'
      and (item.status = 'accepted' or item.promisor_completion_confirmed_at is null)
      and item.due_on is not null and item.due_on <= taiwan_today
    union all
    select item.club_id, item.post_id, item.due_on,
      item.recipient_membership_id, null::uuid
    from public.joy_iou_items as item
    join public.joy_posts as post on post.id = item.post_id and post.club_id = item.club_id
    where item.status in ('proposed', 'in_progress')
      and post.post_status = 'published'
      and (item.status = 'proposed' or item.recipient_completion_confirmed_at is null)
      and item.due_on is not null and item.due_on <= taiwan_today
  ), targets as (
    select actionable.club_id, actionable.post_id, actionable.due_on,
      actionable.membership_id, account.id as app_account_id,
      membership.person_id,
      case when actionable.due_on = taiwan_today then 'due_today' else 'overdue' end as kind
    from actionable
    join public.club_memberships as membership
      on membership.id = actionable.membership_id
     and membership.club_id = actionable.club_id
     and membership.membership_status = 'active'
    join lateral (
      select candidate.id
      from public.app_accounts as candidate
      where candidate.person_id = membership.person_id
        and candidate.account_status = 'active'
        and (actionable.target_app_account_id is null or candidate.id = actionable.target_app_account_id)
      order by candidate.created_at desc, candidate.id
      limit 1
    ) as account on true
    join public.line_oa_followers as follower
      on follower.club_id = actionable.club_id
     and follower.person_id = membership.person_id
     and follower.follower_status = 'following'
    join public.line_oa_accounts as oa
      on oa.id = follower.line_oa_account_id
     and oa.club_id = actionable.club_id
     and oa.account_status <> 'disabled'
    left join public.notification_settings as settings on settings.app_account_id = account.id
    where coalesce(settings.line_enabled, true)
  ), reminder_counts as (
    select target.club_id, target.membership_id, target.app_account_id,
      target.kind, count(distinct target.post_id)::integer as item_count
    from targets as target
    group by target.club_id, target.membership_id, target.app_account_id, target.kind
  )
  insert into public.joy_iou_deadline_reminders as reminder (
    club_id, recipient_membership_id, recipient_app_account_id,
    reminder_kind, notification_date, actionable_count
  )
  select counts.club_id, counts.membership_id, counts.app_account_id,
    counts.kind, taiwan_today, counts.item_count
  from reminder_counts as counts
  on conflict on constraint joy_iou_deadline_reminder_dedupe do update
    set actionable_count = excluded.actionable_count,
        updated_at = p_as_of
    where reminder.delivery_status = 'pending';

  -- Discard reminders no longer actionable today or no longer reachable under
  -- current membership, account, following, and notification preferences.
  update public.joy_iou_deadline_reminders as reminder
  set delivery_status = 'skipped', failure_code = 'recipient_unavailable',
      completed_at = p_as_of, updated_at = p_as_of
  where reminder.delivery_status = 'pending'
    and (reminder.notification_date < taiwan_today or not exists (
      select 1
      from public.joy_iou_items as item
      join public.joy_posts as post on post.id = item.post_id and post.club_id = item.club_id
      join public.club_memberships as membership
        on membership.id = reminder.recipient_membership_id
       and membership.club_id = reminder.club_id
       and membership.membership_status = 'active'
      join public.app_accounts as account
        on account.id = reminder.recipient_app_account_id
       and account.person_id = membership.person_id
       and account.account_status = 'active'
      join public.line_oa_followers as follower
        on follower.club_id = reminder.club_id
       and follower.person_id = membership.person_id
       and follower.follower_status = 'following'
      join public.line_oa_accounts as oa
        on oa.id = follower.line_oa_account_id
       and oa.club_id = reminder.club_id
       and oa.account_status <> 'disabled'
      left join public.notification_settings as settings on settings.app_account_id = account.id
      where item.club_id = reminder.club_id
        and item.status in ('proposed', 'accepted', 'in_progress')
        and item.due_on is not null
        and post.post_status = 'published'
        and coalesce(settings.line_enabled, true)
        and (
          (post.author_membership_id = reminder.recipient_membership_id
            and account.id = post.author_app_account_id
            and (item.status = 'accepted'
              or (item.status = 'in_progress' and item.promisor_completion_confirmed_at is null)))
          or (item.recipient_membership_id = reminder.recipient_membership_id
            and (item.status = 'proposed'
              or (item.status = 'in_progress' and item.recipient_completion_confirmed_at is null)))
        )
        and case reminder.reminder_kind
          when 'due_today' then item.due_on = taiwan_today
          when 'overdue' then item.due_on < taiwan_today
          else false
        end
    ));

  return query
  with claimable as materialized (
    select reminder.id, follower.oa_user_id
    from public.joy_iou_deadline_reminders as reminder
    join public.club_memberships as membership
      on membership.id = reminder.recipient_membership_id
     and membership.club_id = reminder.club_id
     and membership.membership_status = 'active'
    join public.app_accounts as account
      on account.id = reminder.recipient_app_account_id
     and account.person_id = membership.person_id
     and account.account_status = 'active'
    join public.line_oa_followers as follower
      on follower.club_id = reminder.club_id
     and follower.person_id = membership.person_id
     and follower.follower_status = 'following'
    join public.line_oa_accounts as oa
      on oa.id = follower.line_oa_account_id
     and oa.club_id = reminder.club_id
     and oa.account_status <> 'disabled'
    left join public.notification_settings as settings on settings.app_account_id = account.id
    where reminder.delivery_status = 'pending'
      and reminder.notification_date = taiwan_today
      and coalesce(settings.line_enabled, true)
    order by reminder.club_id, reminder.recipient_membership_id, reminder.reminder_kind, reminder.id
    for update of reminder skip locked
    limit p_limit
  ), claimed as (
    update public.joy_iou_deadline_reminders as reminder
    set delivery_status = 'processing',
        attempt_count = reminder.attempt_count + 1,
        attempted_at = p_as_of,
        updated_at = p_as_of
    from claimable
    where reminder.id = claimable.id
    returning reminder.*
  )
  select claimed.id, claimed.club_id, claimed.recipient_membership_id,
    claimed.recipient_app_account_id, claimable.oa_user_id,
    claimed.reminder_kind, claimed.notification_date, claimed.actionable_count
  from claimed
  join claimable on claimable.id = claimed.id
  order by claimed.club_id, claimed.recipient_membership_id, claimed.reminder_kind, claimed.id;
end;
$$;

create or replace function public.record_joy_iou_deadline_reminder_delivery(
  p_reminder_id uuid,
  p_delivery_status text,
  p_payload_summary jsonb,
  p_provider_request_id text default null,
  p_failure_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  reminder public.joy_iou_deadline_reminders;
  oa_id uuid;
  push_id uuid;
  log_status text;
begin
  if p_reminder_id is null
     or p_delivery_status is null
     or p_delivery_status not in ('sent', 'mocked', 'failed', 'unknown')
     or p_payload_summary is null
     or jsonb_typeof(p_payload_summary) is distinct from 'object'
     or (p_payload_summary - array[
       'message_type', 'character_count', 'batch_count', 'sent_batch_count',
       'delivered_recipient_count', 'outcome_unknown'
     ]::text[]) <> '{}'::jsonb
     or p_payload_summary->>'message_type' is distinct from 'text'
     or coalesce((p_payload_summary->>'character_count') ~ '^[0-9]+$', false) is false
     or coalesce((p_payload_summary->>'batch_count') ~ '^[0-9]+$', false) is false
     or coalesce((p_payload_summary->>'sent_batch_count') ~ '^[0-9]+$', false) is false
     or coalesce((p_payload_summary->>'delivered_recipient_count') ~ '^[0-9]+$', false) is false
     or p_payload_summary->>'outcome_unknown' is distinct from (p_delivery_status = 'unknown')::text
     or (p_delivery_status in ('failed', 'unknown') and p_failure_code is null)
     or (p_delivery_status in ('sent', 'mocked') and p_failure_code is not null)
     or (p_failure_code is not null and p_failure_code not in (
       'credentials_rejected', 'rate_limited', 'request_rejected',
       'provider_unavailable', 'provider_timeout', 'provider_error'
     )) then
    raise exception using errcode = '22023', message = 'invalid_joy_iou_reminder_delivery';
  end if;

  if (p_payload_summary->>'character_count')::numeric < 1
     or (p_payload_summary->>'character_count')::numeric > 1000000
     or (p_payload_summary->>'batch_count')::numeric < 1
     or (p_payload_summary->>'batch_count')::numeric > 5
     or (p_payload_summary->>'sent_batch_count')::numeric < 0
     or (p_payload_summary->>'sent_batch_count')::numeric > (p_payload_summary->>'batch_count')::numeric
     or (p_payload_summary->>'delivered_recipient_count')::numeric not in (0, 1) then
    raise exception using errcode = '22023', message = 'invalid_joy_iou_reminder_delivery';
  end if;

  select * into reminder
  from public.joy_iou_deadline_reminders as target
  where target.id = p_reminder_id and target.delivery_status = 'processing'
  for update;
  if not found then
    select id into push_id from public.line_push_logs
    where source_joy_iou_reminder_id = p_reminder_id;
    if push_id is not null then return push_id; end if;
    raise exception using errcode = 'P0002', message = 'joy_iou_reminder_not_processing';
  end if;

  select account.id into oa_id
  from public.line_oa_accounts as account
  where account.club_id = reminder.club_id and account.account_status <> 'disabled';
  if oa_id is null then
    raise exception using errcode = 'P0002', message = 'oa_not_configured';
  end if;

  log_status := case when p_delivery_status = 'unknown' then 'failed' else p_delivery_status end;
  insert into public.line_push_logs (
    line_oa_account_id, club_id, requested_by_app_account_id, push_kind,
    recipient_count, payload_summary, delivery_status, provider_request_id,
    failure_code, completed_at, source_joy_iou_reminder_id
  ) values (
    oa_id, reminder.club_id, null, 'push', 1,
    coalesce(p_payload_summary, '{}'::jsonb), log_status, p_provider_request_id,
    p_failure_code, now(), p_reminder_id
  )
  on conflict (source_joy_iou_reminder_id) where source_joy_iou_reminder_id is not null
  do nothing
  returning id into push_id;

  if push_id is null then
    select id into push_id from public.line_push_logs
    where source_joy_iou_reminder_id = p_reminder_id;
    return push_id;
  end if;

  update public.joy_iou_deadline_reminders
  set delivery_status = p_delivery_status,
      failure_code = p_failure_code,
      completed_at = now(),
      updated_at = now()
  where id = p_reminder_id;
  return push_id;
end;
$$;

create or replace function public.skip_joy_iou_deadline_reminder(
  p_reminder_id uuid,
  p_failure_code text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if p_reminder_id is null or p_failure_code is null
     or p_failure_code not in ('oa_not_configured', 'recipient_unavailable') then
    raise exception using errcode = '22023', message = 'invalid_joy_iou_reminder_skip_reason';
  end if;
  update public.joy_iou_deadline_reminders
  set delivery_status = 'skipped', failure_code = p_failure_code,
      completed_at = now(), updated_at = now()
  where id = p_reminder_id and delivery_status = 'processing';
  return found;
end;
$$;

create or replace function public.halt_joy_iou_deadline_reminders_for_club(
  p_club_id uuid,
  p_as_of timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare halted_count integer;
begin
  if p_club_id is null or p_as_of is null then
    raise exception using errcode = '22023', message = 'invalid_joy_iou_reminder_halt_input';
  end if;
  update public.joy_iou_deadline_reminders
  set delivery_status = 'deferred',
      failure_code = 'scheduler_halted_for_quota',
      completed_at = p_as_of,
      updated_at = p_as_of
  where club_id = p_club_id and delivery_status in ('pending', 'processing');
  get diagnostics halted_count = row_count;
  return halted_count;
end;
$$;

revoke all on function public.run_joy_iou_deadline_reminder_scheduler(timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.record_joy_iou_deadline_reminder_delivery(uuid, text, jsonb, text, text)
  from public, anon, authenticated;
revoke all on function public.skip_joy_iou_deadline_reminder(uuid, text)
  from public, anon, authenticated;
revoke all on function public.halt_joy_iou_deadline_reminders_for_club(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.run_joy_iou_deadline_reminder_scheduler(timestamptz, integer) to service_role;
grant execute on function public.record_joy_iou_deadline_reminder_delivery(uuid, text, jsonb, text, text) to service_role;
grant execute on function public.skip_joy_iou_deadline_reminder(uuid, text) to service_role;
grant execute on function public.halt_joy_iou_deadline_reminders_for_club(uuid, timestamptz) to service_role;

comment on table public.joy_iou_deadline_reminders is
  'Idempotent delivery records for one due and one overdue reminder per member per Taiwan-local day. No IOU text is stored.';

commit;
