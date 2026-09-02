begin;

-- Sending a message centre announcement can also push it to LINE. The push is a
-- consequence of an authorised send, so it is authorised on the message rather
-- than on `oa.manage`: the officer who may address the club is the officer who
-- may tell the club about it. `record_line_push` stays as it is, for the manual
-- push an OA manager composes by hand.

alter table public.line_push_logs
  add column if not exists source_message_id uuid references public.club_messages(id) on delete restrict;

-- One push per message. A double submit, a retried action, or an officer
-- pressing send twice must not deliver the same announcement to LINE twice --
-- unlike an in-app row, a LINE message cannot be withdrawn.
create unique index if not exists line_push_logs_one_per_message
  on public.line_push_logs (source_message_id)
  where source_message_id is not null;

-- Who a message centre announcement can reach on LINE. Three separate
-- conditions, all required: the member was addressed, they paired their LINE
-- account, and they left both notification switches on.
create or replace function public.list_club_message_line_targets(
  p_club_id uuid,
  p_message_id uuid
)
returns table (oa_user_id text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if public.current_app_account_id() is null
     or not public.current_has_club_permission(p_club_id, 'member.manage') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;

  if not exists (
    select 1 from public.club_messages as message
    where message.id = p_message_id and message.club_id = p_club_id
  ) then
    raise exception using errcode = 'P0002', message = 'message_not_found';
  end if;

  return query
  select follower.oa_user_id
  from public.club_message_recipients as recipient
  join public.club_memberships as membership
    on membership.id = recipient.membership_id
   and membership.club_id = p_club_id
   and membership.membership_status = 'active'
  join public.line_oa_followers as follower
    on follower.club_id = p_club_id
   and follower.person_id = membership.person_id
   and follower.follower_status = 'following'
  join public.app_accounts as account
    on account.person_id = membership.person_id
   and account.account_status = 'active'
  -- A missing settings row is the default, and the default is on. An explicit
  -- false on either switch is a member saying no.
  left join public.notification_settings as settings
    on settings.app_account_id = account.id
  where recipient.message_id = p_message_id
    and recipient.club_id = p_club_id
    and coalesce(settings.line_enabled, true)
    and coalesce(settings.club_announcements, true);
end;
$$;

-- The push log for a message centre announcement. Idempotent per message: a
-- second attempt returns the existing log id rather than sending again.
create or replace function public.record_club_message_line_push(
  p_club_id uuid,
  p_message_id uuid,
  p_recipient_count integer,
  p_payload_summary jsonb,
  p_delivery_status text,
  p_provider_request_id text default null,
  p_failure_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  oa_id uuid;
  push_id uuid;
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'member.manage') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;

  if not exists (
    select 1 from public.club_messages as message
    where message.id = p_message_id and message.club_id = p_club_id
  ) then
    raise exception using errcode = 'P0002', message = 'message_not_found';
  end if;

  select id into oa_id
  from public.line_oa_accounts
  where club_id = p_club_id and account_status <> 'disabled';
  if oa_id is null then
    raise exception using errcode = 'P0002', message = 'oa_not_configured';
  end if;

  select id into push_id from public.line_push_logs where source_message_id = p_message_id;
  if push_id is not null then
    return push_id;
  end if;

  insert into public.line_push_logs (
    line_oa_account_id, club_id, requested_by_app_account_id, push_kind, recipient_count,
    payload_summary, delivery_status, provider_request_id, failure_code, completed_at,
    source_message_id
  )
  values (
    oa_id, p_club_id, actor_id, 'multicast', greatest(p_recipient_count, 0),
    coalesce(p_payload_summary, '{}'::jsonb), p_delivery_status, p_provider_request_id,
    p_failure_code,
    case when p_delivery_status <> 'queued' then now() else null end,
    p_message_id
  )
  on conflict (source_message_id) where source_message_id is not null do nothing
  returning id into push_id;

  if push_id is null then
    select id into push_id from public.line_push_logs where source_message_id = p_message_id;
    return push_id;
  end if;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  )
  values (
    p_club_id, actor_id, 'line_oa.message_push_requested', 'line_push_log', push_id,
    jsonb_build_object('recipient_count', p_recipient_count, 'status', p_delivery_status)
  );

  return push_id;
end;
$$;

revoke all on function public.list_club_message_line_targets(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_club_message_line_push(uuid, uuid, integer, jsonb, text, text, text)
  from public, anon, authenticated;

-- Keep the database boundary fail-closed with the flag, the same way the
-- birthday RPCs are gated. A missing row is a disabled flag.
create or replace function public.sync_line_oa_push_execution_privileges(
  p_feature_key text,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  function_signature text;
  function_signatures text[];
begin
  if p_feature_key <> 'line_oa_event_push_v1' then
    return;
  end if;

  function_signatures := array[
    'public.list_club_message_line_targets(uuid, uuid)',
    'public.record_club_message_line_push(uuid, uuid, integer, jsonb, text, text, text)'
  ];

  foreach function_signature in array function_signatures loop
    if p_enabled then
      execute 'grant execute on function ' || function_signature || ' to authenticated';
    else
      execute 'revoke execute on function ' || function_signature || ' from authenticated';
    end if;
  end loop;
end;
$$;

create or replace function public.sync_line_oa_push_execution_privileges_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_line_oa_push_execution_privileges(old.feature_key, false);
    return old;
  end if;

  perform public.sync_line_oa_push_execution_privileges(new.feature_key, new.enabled);
  return new;
end;
$$;

drop trigger if exists platform_feature_flags_sync_line_oa_push_execution_privileges
  on public.platform_feature_flags;

create trigger platform_feature_flags_sync_line_oa_push_execution_privileges
after insert or update or delete on public.platform_feature_flags
for each row execute function public.sync_line_oa_push_execution_privileges_trigger();

select public.sync_line_oa_push_execution_privileges('line_oa_event_push_v1', false);

do $$
declare
  feature_flag record;
begin
  for feature_flag in
    select feature_key, enabled
    from public.platform_feature_flags
    where feature_key = 'line_oa_event_push_v1'
  loop
    perform public.sync_line_oa_push_execution_privileges(feature_flag.feature_key, feature_flag.enabled);
  end loop;
end;
$$;

commit;
