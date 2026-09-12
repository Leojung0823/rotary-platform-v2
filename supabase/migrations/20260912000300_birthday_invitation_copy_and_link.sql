begin;

-- The invitation text was written for the message centre, where the member is
-- already inside the app and a button sits next to it. Delivered over LINE the
-- same words arrive with no way in: "請打開生日祝福徵集" asks a member to go and
-- find the page. Two changes follow from that.
--
-- First, the wording is warmer and says what the task actually costs -- the
-- question bank has already written the prompt, so the member picks one and
-- writes a few lines. Second, the push now carries a link, which means the
-- dispatcher needs the message's action_path. It was never projected, so
-- list_birthday_collection_line_push_jobs gains a column and has to be dropped
-- and recreated: a return type cannot be changed in place. The grants are
-- restated because dropping the function drops them with it.
--
-- The message row stays shared between the message centre and the push. Only
-- the LINE text gets the absolute URL appended, and that happens in the
-- dispatcher, not here -- the database has no business knowing the site origin,
-- and action_path stays a relative in-app destination exactly as before.

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
      p_club_id, actor_id, '有位社友的生日快到了',
      '這個月輪到您為他寫一段生日祝福。題目我們已經準備好了，點開挑一題、寫上幾句話就完成。',
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

drop function if exists public.list_birthday_collection_line_push_jobs();

create function public.list_birthday_collection_line_push_jobs()
returns table (
  club_id uuid,
  message_id uuid,
  title text,
  body text,
  action_path text,
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
    message.action_path,
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
    message.action_path, message.author_app_account_id, notification.created_at
  order by notification.created_at, message.id
  limit 100
$$;

revoke all on function public.list_birthday_collection_line_push_jobs()
  from public, anon, authenticated;
grant execute on function public.list_birthday_collection_line_push_jobs()
  to service_role;

commit;
