begin;

alter table public.joy_post_reports
  drop constraint joy_post_reports_reason_check;
alter table public.joy_post_reports
  add constraint joy_post_reports_reason_check check (reason in (
    'spam', 'harassment', 'privacy', 'inappropriate', 'other', 'recipient_hide_request'
  ));

alter table public.joy_wall_audit_events
  drop constraint joy_wall_audit_events_event_type_check;
alter table public.joy_wall_audit_events
  add constraint joy_wall_audit_events_event_type_check check (event_type in (
    'post_created', 'post_updated', 'post_archived', 'comment_created',
    'reaction_changed', 'post_reported', 'report_dismissed', 'post_hidden',
    'iou_created', 'iou_accepted', 'iou_declined', 'iou_started',
    'iou_completion_confirmed', 'iou_completed', 'iou_cancelled',
    'question_prompt_created', 'question_prompt_updated', 'question_batch_dispatched',
    'receipt_acknowledged', 'recipient_hide_requested'
  ));

create table public.joy_post_acknowledgements (
  club_id uuid not null references public.clubs(id) on delete restrict,
  post_id uuid not null,
  membership_id uuid not null,
  acknowledged_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  acknowledged_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (club_id, post_id, membership_id),
  constraint joy_post_acknowledgements_post_club_fkey
    foreign key (post_id, club_id) references public.joy_posts(id, club_id) on delete restrict,
  constraint joy_post_acknowledgements_membership_club_fkey
    foreign key (membership_id, club_id) references public.club_memberships(id, club_id) on delete restrict
);

create index joy_post_acknowledgements_post_idx
  on public.joy_post_acknowledgements (club_id, post_id);

alter table public.joy_post_acknowledgements enable row level security;
revoke all on table public.joy_post_acknowledgements from public, anon, authenticated, service_role;

create or replace function public.joy_post_recipient_action_projection(
  p_club_id uuid,
  p_post_id uuid
)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, auth as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
  target_post public.joy_posts;
  is_recipient boolean := false;
  receipt_time timestamptz;
  ack_count integer := 0;
  recipient_count integer := 0;
  hide_request_open boolean := false;
  can_request_hide boolean := false;
begin
  if actor_id is null or actor_membership_id is null
    or not public.current_can_read_joy_post(p_post_id, p_club_id, actor_id, actor_membership_id) then
    raise exception using errcode = '42501', message = 'joy_post_not_readable';
  end if;

  select post.* into target_post
  from public.joy_posts as post
  where post.id = p_post_id and post.club_id = p_club_id;
  if not found then
    raise exception using errcode = '42501', message = 'joy_post_not_readable';
  end if;

  is_recipient := target_post.post_type <> 'iou'
    and target_post.post_status = 'published'
    and target_post.visibility_scope in ('selected', 'private')
    and target_post.author_app_account_id <> actor_id
    and exists (
      select 1 from public.joy_post_audiences as audience
      where audience.post_id = p_post_id and audience.club_id = p_club_id
        and audience.membership_id = actor_membership_id
    );

  if target_post.author_app_account_id = actor_id
    and target_post.post_type <> 'iou'
    and target_post.visibility_scope in ('selected', 'private') then
    select count(*) filter (where acknowledgement.membership_id is not null)::integer,
      count(*)::integer
    into ack_count, recipient_count
    from public.joy_post_audiences as audience
    join public.club_memberships as membership
      on membership.id = audience.membership_id and membership.club_id = audience.club_id
      and membership.membership_status = 'active'
    left join public.joy_post_acknowledgements as acknowledgement
      on acknowledgement.club_id = audience.club_id and acknowledgement.post_id = audience.post_id
      and acknowledgement.membership_id = audience.membership_id
    where audience.club_id = p_club_id and audience.post_id = p_post_id;
  elsif is_recipient then
    select acknowledgement.acknowledged_at into receipt_time
    from public.joy_post_acknowledgements as acknowledgement
    where acknowledgement.club_id = p_club_id and acknowledgement.post_id = p_post_id
      and acknowledgement.membership_id = actor_membership_id;

    select exists (
      select 1 from public.joy_post_reports as report
      where report.club_id = p_club_id and report.post_id = p_post_id
        and report.reporter_app_account_id = actor_id
        and report.reason = 'recipient_hide_request' and report.report_status = 'open'
    ) into hide_request_open;

    can_request_hide := not exists (
      select 1 from public.joy_post_reports as report
      where report.club_id = p_club_id and report.post_id = p_post_id
        and report.reporter_app_account_id = actor_id and report.report_status = 'open'
    );
  end if;

  return jsonb_build_object(
    'can_acknowledge_receipt', is_recipient and receipt_time is null,
    'receipt_acknowledged_at', case when is_recipient then receipt_time else null end,
    'receipt_ack_count', case when target_post.author_app_account_id = actor_id
      and target_post.post_type <> 'iou' and target_post.visibility_scope in ('selected', 'private')
      then ack_count else null end,
    'recipient_count', case when target_post.author_app_account_id = actor_id
      and target_post.post_type <> 'iou' and target_post.visibility_scope in ('selected', 'private')
      then recipient_count else null end,
    'can_request_hide', is_recipient and can_request_hide,
    'hide_request_submitted', is_recipient and hide_request_open
  );
end;
$$;

create or replace function public.list_joy_posts_with_recipient_actions(
  p_club_id uuid,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20,
  p_favorites_only boolean default false
)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, auth as $$
declare
  base_projection jsonb;
  enriched_posts jsonb;
begin
  if not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'joy_wall_v1' and flag.enabled
      and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
  ) then
    raise exception using errcode = '42501', message = 'joy_wall_disabled';
  end if;
  base_projection := public.list_joy_posts(
    p_club_id, p_cursor_created_at, p_cursor_id, p_limit, p_favorites_only
  );
  select coalesce(jsonb_agg(
    item.post || public.joy_post_recipient_action_projection(p_club_id, (item.post->>'id')::uuid)
    order by item.ordinality
  ), '[]'::jsonb)
  into enriched_posts
  from jsonb_array_elements(coalesce(base_projection->'posts', '[]'::jsonb))
    with ordinality as item(post, ordinality);
  return jsonb_set(base_projection, '{posts}', enriched_posts, true);
end;
$$;

create or replace function public.get_my_joy_question_post_with_recipient_actions(
  p_club_id uuid,
  p_post_id uuid
)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, auth as $$
declare
  base_projection jsonb;
begin
  if not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'joy_wall_v1' and flag.enabled
      and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
  ) then
    raise exception using errcode = '42501', message = 'joy_wall_disabled';
  end if;
  base_projection := public.get_my_joy_question_post_with_favorite(p_club_id, p_post_id);
  if base_projection is null then
    return null;
  end if;
  return base_projection || public.joy_post_recipient_action_projection(p_club_id, p_post_id);
end;
$$;

create or replace function public.acknowledge_joy_post_receipt(p_club_id uuid, p_post_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
  receipt_time timestamptz;
begin
  if not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'joy_wall_v1' and flag.enabled
      and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
  ) then
    raise exception using errcode = '42501', message = 'joy_wall_disabled';
  end if;
  if actor_id is null or actor_membership_id is null
    or not public.current_can_read_joy_post(p_post_id, p_club_id, actor_id, actor_membership_id)
    or not exists (
      select 1 from public.joy_posts as post
      join public.joy_post_audiences as audience
        on audience.post_id = post.id and audience.club_id = post.club_id
        and audience.membership_id = actor_membership_id
      where post.id = p_post_id and post.club_id = p_club_id
        and post.author_app_account_id <> actor_id and post.post_type <> 'iou'
        and post.post_status = 'published' and post.visibility_scope in ('selected', 'private')
    ) then
    raise exception using errcode = '42501', message = 'joy_recipient_action_not_available';
  end if;

  insert into public.joy_post_acknowledgements (
    club_id, post_id, membership_id, acknowledged_by_app_account_id
  ) values (p_club_id, p_post_id, actor_membership_id, actor_id)
  on conflict (club_id, post_id, membership_id) do nothing
  returning acknowledged_at into receipt_time;

  if found then
    insert into public.joy_wall_audit_events (
      club_id, actor_app_account_id, object_kind, object_id, event_type
    ) values (p_club_id, actor_id, 'post', p_post_id, 'receipt_acknowledged');
  else
    select acknowledgement.acknowledged_at into receipt_time
    from public.joy_post_acknowledgements as acknowledgement
    where acknowledgement.club_id = p_club_id and acknowledgement.post_id = p_post_id
      and acknowledgement.membership_id = actor_membership_id;
  end if;

  return jsonb_build_object('acknowledged_at', receipt_time);
end;
$$;

create or replace function public.report_joy_post(p_club_id uuid, p_post_id uuid, p_reason text)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
  report_id uuid;
begin
  if p_reason = 'recipient_hide_request' and not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'joy_wall_v1' and flag.enabled
      and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
  ) then
    raise exception using errcode = '42501', message = 'joy_wall_disabled';
  end if;
  if actor_id is null or actor_membership_id is null
    or not public.current_can_read_joy_post(p_post_id, p_club_id, actor_id, actor_membership_id) then
    raise exception using errcode = '42501', message = 'joy_post_not_available';
  end if;
  if p_reason is null or p_reason not in ('spam', 'harassment', 'privacy', 'inappropriate', 'other', 'recipient_hide_request') then
    raise exception using errcode = '22023', message = 'invalid_joy_report';
  end if;
  if exists (select 1 from public.joy_posts where id = p_post_id and author_app_account_id = actor_id) then
    raise exception using errcode = '22023', message = 'cannot_report_own_joy_post';
  end if;
  if p_reason = 'recipient_hide_request' and not exists (
    select 1 from public.joy_posts as post
    join public.joy_post_audiences as audience
      on audience.post_id = post.id and audience.club_id = post.club_id
      and audience.membership_id = actor_membership_id
    where post.id = p_post_id and post.club_id = p_club_id
      and post.author_app_account_id <> actor_id and post.post_type <> 'iou'
      and post.post_status = 'published' and post.visibility_scope in ('selected', 'private')
  ) then
    raise exception using errcode = '42501', message = 'joy_hide_request_recipient_required';
  end if;
  perform public.assert_joy_rate_limit(p_club_id, actor_id, 'report', 5, interval '1 hour');
  insert into public.joy_post_reports (club_id, post_id, reporter_app_account_id, reason)
  values (p_club_id, p_post_id, actor_id, p_reason)
  returning id into report_id;
  insert into public.joy_wall_audit_events (club_id, actor_app_account_id, object_kind, object_id, event_type)
  values (p_club_id, actor_id, 'report', report_id,
    case when p_reason = 'recipient_hide_request' then 'recipient_hide_requested' else 'post_reported' end);
  return report_id;
end;
$$;

revoke all on function public.joy_post_recipient_action_projection(uuid, uuid) from public, anon, authenticated;
revoke all on function public.list_joy_posts_with_recipient_actions(uuid, timestamptz, uuid, integer, boolean) from public, anon;
revoke all on function public.get_my_joy_question_post_with_recipient_actions(uuid, uuid) from public, anon;
revoke all on function public.acknowledge_joy_post_receipt(uuid, uuid) from public, anon;
revoke all on function public.report_joy_post(uuid, uuid, text) from public, anon;

grant execute on function public.list_joy_posts_with_recipient_actions(uuid, timestamptz, uuid, integer, boolean) to authenticated;
grant execute on function public.get_my_joy_question_post_with_recipient_actions(uuid, uuid) to authenticated;
grant execute on function public.acknowledge_joy_post_receipt(uuid, uuid) to authenticated;
grant execute on function public.report_joy_post(uuid, uuid, text) to authenticated;

commit;
