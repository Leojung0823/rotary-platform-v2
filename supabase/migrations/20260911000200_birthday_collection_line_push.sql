begin;

-- Birthday collection invitations are created by the protected scheduler, so
-- they cannot use the member-session push RPCs. These two service-role-only
-- functions expose the same audience and idempotency rules without giving a
-- browser a way to enumerate or send the invitation audience.

create or replace function public.list_birthday_collection_line_push_jobs()
returns table (
  club_id uuid,
  message_id uuid,
  title text,
  body text,
  requested_by_app_account_id uuid,
  oa_user_ids text[]
)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select message.club_id,
    message.id,
    message.title,
    message.body,
    message.author_app_account_id,
    coalesce(array_agg(distinct follower.oa_user_id)
      filter (where follower.oa_user_id is not null), '{}'::text[])
  from public.birthday_wish_collection_notifications as notification
  join public.club_messages as message
    on message.id = notification.message_id
   and message.club_id = notification.club_id
   and message.status = 'active'
  join public.club_message_recipients as recipient
    on recipient.message_id = message.id
   and recipient.club_id = message.club_id
   and recipient.birthday_participant_id is not null
  join public.club_memberships as membership
    on membership.id = recipient.membership_id
   and membership.club_id = recipient.club_id
   and membership.membership_status = 'active'
  join public.app_accounts as account
    on account.person_id = membership.person_id
   and account.account_status = 'active'
  join public.line_oa_followers as follower
    on follower.club_id = membership.club_id
   and follower.person_id = membership.person_id
   and follower.follower_status = 'following'
  left join public.notification_settings as settings
    on settings.app_account_id = account.id
  left join public.line_push_logs as push
    on push.source_message_id = message.id
  where notification.notification_status = 'sent'
    and notification.message_id is not null
    and push.id is null
    and coalesce(settings.line_enabled, true)
    and coalesce(settings.club_announcements, true)
  group by message.club_id, message.id, message.title, message.body,
    message.author_app_account_id, notification.created_at
  order by notification.created_at, message.id
  limit 100
$$;

create or replace function public.record_birthday_collection_line_push(
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
  source_message public.club_messages;
  oa_id uuid;
  push_id uuid;
begin
  select message.*
  into source_message
  from public.club_messages as message
  join public.birthday_wish_collection_notifications as notification
    on notification.message_id = message.id
   and notification.club_id = message.club_id
   and notification.notification_status = 'sent'
  where message.id = p_message_id
    and message.club_id = p_club_id
    and message.status = 'active';

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_notification_not_available';
  end if;

  select id into oa_id
  from public.line_oa_accounts
  where club_id = p_club_id and account_status <> 'disabled';
  if oa_id is null then
    raise exception using errcode = 'P0002', message = 'oa_not_configured';
  end if;

  select id into push_id
  from public.line_push_logs
  where source_message_id = p_message_id;
  if push_id is not null then
    return push_id;
  end if;

  insert into public.line_push_logs (
    line_oa_account_id, club_id, requested_by_app_account_id, push_kind,
    recipient_count, payload_summary, delivery_status, provider_request_id,
    failure_code, completed_at, source_message_id
  ) values (
    oa_id, p_club_id, source_message.author_app_account_id, 'multicast',
    greatest(p_recipient_count, 0), coalesce(p_payload_summary, '{}'::jsonb),
    p_delivery_status, p_provider_request_id, p_failure_code,
    case when p_delivery_status <> 'queued' then now() else null end,
    p_message_id
  )
  on conflict (source_message_id) where source_message_id is not null
  do nothing
  returning id into push_id;

  if push_id is null then
    select id into push_id
    from public.line_push_logs
    where source_message_id = p_message_id;
    return push_id;
  end if;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, source_message.author_app_account_id,
    'line_oa.birthday_collection_push_requested', 'line_push_log', push_id,
    jsonb_build_object('recipient_count', p_recipient_count, 'status', p_delivery_status)
  );

  return push_id;
end;
$$;

revoke all on function public.list_birthday_collection_line_push_jobs()
  from public, anon, authenticated;
grant execute on function public.list_birthday_collection_line_push_jobs()
  to service_role;

revoke all on function public.record_birthday_collection_line_push(uuid, uuid, integer, jsonb, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_birthday_collection_line_push(uuid, uuid, integer, jsonb, text, text, text)
  to service_role;

commit;
