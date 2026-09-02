begin;

-- Publishing an event is the moment it becomes visible to members, so it is the
-- moment worth pushing. Creating one is not: a draft is not news yet.
-- Authorised on `event.manage`, the permission that allowed the publish.

alter table public.line_push_logs
  add column if not exists source_event_id uuid references public.club_events(id) on delete restrict;

-- One push per event. Publishing is already guarded against repeats by the
-- draft-only status check, but a retried action must not re-announce either.
create unique index if not exists line_push_logs_one_per_event
  on public.line_push_logs (source_event_id)
  where source_event_id is not null;

-- Returns the event fields the push text needs and the reachable audience in one
-- round trip, because staging pays roughly 180ms for each one.
create or replace function public.list_club_event_line_targets(
  p_club_id uuid,
  p_event_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  target public.club_events;
  targeted boolean;
  recipients text[];
begin
  if public.current_app_account_id() is null
     or not public.current_has_club_permission(p_club_id, 'event.manage') then
    raise exception using errcode = '42501', message = 'event_manage_required';
  end if;

  select * into target
  from public.club_events
  where id = p_event_id and club_id = p_club_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'event_not_available';
  end if;

  -- An event with no audience rows is addressed to the whole club; the same
  -- rule the member-facing visibility check uses.
  targeted := exists (select 1 from public.club_event_audiences where event_id = p_event_id)
           or exists (select 1 from public.club_event_audience_members where event_id = p_event_id);

  select coalesce(array_agg(distinct follower.oa_user_id), '{}'::text[])
  into recipients
  from public.club_memberships as membership
  join public.line_oa_followers as follower
    on follower.club_id = p_club_id
   and follower.person_id = membership.person_id
   and follower.follower_status = 'following'
  join public.app_accounts as account
    on account.person_id = membership.person_id
   and account.account_status = 'active'
  left join public.notification_settings as settings
    on settings.app_account_id = account.id
  where membership.club_id = p_club_id
    and membership.membership_status = 'active'
    and coalesce(settings.line_enabled, true)
    and coalesce(settings.club_announcements, true)
    and (
      not targeted
      or exists (
        select 1
        from public.club_event_audiences as audience
        join public.club_membership_tags as tagged on tagged.tag_id = audience.tag_id
        where audience.event_id = p_event_id and tagged.membership_id = membership.id
      )
      or exists (
        select 1
        from public.club_event_audience_members as audience
        where audience.event_id = p_event_id and audience.membership_id = membership.id
      )
    );

  return jsonb_build_object(
    'title', target.title,
    'location', target.location,
    'starts_at', target.starts_at,
    'event_status', target.event_status,
    'oa_user_ids', to_jsonb(recipients)
  );
end;
$$;

create or replace function public.record_club_event_line_push(
  p_club_id uuid,
  p_event_id uuid,
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
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'event.manage') then
    raise exception using errcode = '42501', message = 'event_manage_required';
  end if;

  if not exists (
    select 1 from public.club_events as event
    where event.id = p_event_id and event.club_id = p_club_id
  ) then
    raise exception using errcode = 'P0002', message = 'event_not_available';
  end if;

  select id into oa_id
  from public.line_oa_accounts
  where club_id = p_club_id and account_status <> 'disabled';
  if oa_id is null then
    raise exception using errcode = 'P0002', message = 'oa_not_configured';
  end if;

  select id into push_id from public.line_push_logs where source_event_id = p_event_id;
  if push_id is not null then
    return push_id;
  end if;

  insert into public.line_push_logs (
    line_oa_account_id, club_id, requested_by_app_account_id, push_kind, recipient_count,
    payload_summary, delivery_status, provider_request_id, failure_code, completed_at,
    source_event_id
  )
  values (
    oa_id, p_club_id, actor_id, 'multicast', greatest(p_recipient_count, 0),
    coalesce(p_payload_summary, '{}'::jsonb), p_delivery_status, p_provider_request_id,
    p_failure_code,
    case when p_delivery_status <> 'queued' then now() else null end,
    p_event_id
  )
  on conflict (source_event_id) where source_event_id is not null do nothing
  returning id into push_id;

  if push_id is null then
    select id into push_id from public.line_push_logs where source_event_id = p_event_id;
    return push_id;
  end if;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  )
  values (
    p_club_id, actor_id, 'line_oa.event_push_requested', 'line_push_log', push_id,
    jsonb_build_object('recipient_count', p_recipient_count, 'status', p_delivery_status)
  );

  return push_id;
end;
$$;

revoke all on function public.list_club_event_line_targets(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_club_event_line_push(uuid, uuid, integer, jsonb, text, text, text)
  from public, anon, authenticated;

-- Same gate as the message centre push: both live behind line_oa_event_push_v1.
-- Replaced rather than added to, so one flag owns the whole feature's grants.
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
    'public.record_club_message_line_push(uuid, uuid, integer, jsonb, text, text, text)',
    'public.list_club_event_line_targets(uuid, uuid)',
    'public.record_club_event_line_push(uuid, uuid, integer, jsonb, text, text, text)'
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
