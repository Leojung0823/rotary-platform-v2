begin;

-- Anonymous suggestions are private to the author's club and are reviewed by
-- club officers. Author identity is stored outside the PostgREST-exposed schema.
create schema joy_private;
revoke all on schema joy_private from public, anon, authenticated, service_role;

create table public.joy_suggestions (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  content text not null check (char_length(content) between 1 and 1000 and content !~ '^[[:space:]]*$'),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  reviewed_by_app_account_id uuid references public.app_accounts(id) on delete restrict,
  reviewed_at timestamptz,
  constraint joy_suggestions_review_consistency check (
    (status = 'open' and reviewed_by_app_account_id is null and reviewed_at is null)
    or (status <> 'open' and reviewed_by_app_account_id is not null and reviewed_at is not null)
  ),
  constraint joy_suggestions_id_club_unique unique (id, club_id)
);

create index joy_suggestions_open_queue_idx
  on public.joy_suggestions (club_id, created_at, id) where status = 'open';

create table joy_private.joy_suggestion_identities (
  suggestion_id uuid primary key,
  club_id uuid not null references public.clubs(id) on delete restrict,
  author_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  author_membership_id uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint joy_suggestion_identity_suggestion_club_fkey
    foreign key (suggestion_id, club_id) references public.joy_suggestions(id, club_id) on delete restrict,
  constraint joy_suggestion_identity_membership_club_fkey
    foreign key (author_membership_id, club_id) references public.club_memberships(id, club_id) on delete restrict
);

alter table public.joy_suggestions enable row level security;
alter table joy_private.joy_suggestion_identities enable row level security;
revoke all on table public.joy_suggestions from public, anon, authenticated, service_role;
revoke all on table joy_private.joy_suggestion_identities from public, anon, authenticated, service_role;

alter table public.joy_wall_audit_events
  drop constraint joy_wall_audit_events_object_kind_check;
alter table public.joy_wall_audit_events
  add constraint joy_wall_audit_events_object_kind_check
    check (object_kind in (
      'post', 'comment', 'reaction', 'report', 'iou',
      'question_prompt', 'question_batch', 'suggestion'
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
    'receipt_acknowledged', 'recipient_hide_requested', 'suggestion_created', 'suggestion_reviewed'
  ));

create or replace function public.assert_joy_rate_limit(
  p_club_id uuid,
  p_actor_app_account_id uuid,
  p_action text,
  p_max_count integer,
  p_window interval
)
returns void language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare
  window_start timestamptz;
  recent_count integer;
begin
  if p_club_id is null or p_actor_app_account_id is null
    or p_action not in ('post', 'comment', 'report', 'suggestion')
    or p_max_count is null or p_max_count not between 1 and 1000
    or p_window is null or p_window <= interval '0 seconds' or p_window > interval '1 day' then
    raise exception using errcode = '22023', message = 'invalid_joy_rate_limit';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_club_id::text || ':' || p_actor_app_account_id::text || ':' || p_action, 0
  ));
  window_start := pg_catalog.clock_timestamp() - p_window;

  if p_action = 'post' then
    select count(*)::integer into recent_count from public.joy_posts
    where club_id = p_club_id and author_app_account_id = p_actor_app_account_id
      and created_at >= window_start;
  elsif p_action = 'comment' then
    select count(*)::integer into recent_count from public.joy_comments
    where club_id = p_club_id and author_app_account_id = p_actor_app_account_id
      and created_at >= window_start;
  elsif p_action = 'suggestion' then
    select count(*)::integer into recent_count
    from public.joy_suggestions as suggestion
    join joy_private.joy_suggestion_identities as identity
      on identity.suggestion_id = suggestion.id and identity.club_id = suggestion.club_id
    where suggestion.club_id = p_club_id
      and identity.author_app_account_id = p_actor_app_account_id
      and suggestion.created_at >= window_start;
  else
    select count(*)::integer into recent_count from public.joy_post_reports
    where club_id = p_club_id and reporter_app_account_id = p_actor_app_account_id
      and created_at >= window_start;
  end if;

  if recent_count >= p_max_count then
    raise exception using errcode = '54000', message = 'joy_rate_limited';
  end if;
end;
$$;

create or replace function public.create_joy_suggestion(p_club_id uuid, p_content text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
  normalized_content text := btrim(replace(replace(coalesce(p_content, ''), E'\r\n', E'\n'), E'\r', E'\n'));
  created_suggestion public.joy_suggestions;
begin
  if not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'joy_wall_v1' and flag.enabled
      and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
  ) then
    raise exception using errcode = '42501', message = 'joy_wall_disabled';
  end if;
  if actor_id is null or actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_joy_membership_required';
  end if;
  if char_length(normalized_content) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'invalid_joy_suggestion';
  end if;

  perform public.assert_joy_rate_limit(p_club_id, actor_id, 'suggestion', 5, interval '1 hour');
  insert into public.joy_suggestions (club_id, content)
  values (p_club_id, normalized_content)
  returning * into created_suggestion;
  insert into joy_private.joy_suggestion_identities (
    suggestion_id, club_id, author_app_account_id, author_membership_id
  ) values (created_suggestion.id, p_club_id, actor_id, actor_membership_id);
  insert into public.joy_wall_audit_events (
    club_id, actor_app_account_id, object_kind, object_id, event_type
  ) values (p_club_id, actor_id, 'suggestion', created_suggestion.id, 'suggestion_created');

  -- Never return the suggestion content or author identity to the submitter API.
  return jsonb_build_object('id', created_suggestion.id, 'created_at', created_suggestion.created_at);
end;
$$;

create or replace function public.list_joy_suggestions(p_club_id uuid, p_limit integer default 50)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, auth as $$
begin
  if not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'joy_wall_v1' and flag.enabled
      and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
  ) then
    raise exception using errcode = '42501', message = 'joy_wall_disabled';
  end if;
  if not public.current_has_club_permission(p_club_id, 'joy.moderate') then
    raise exception using errcode = '42501', message = 'joy_moderation_required';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_joy_suggestion_limit';
  end if;
  return jsonb_build_object('suggestions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'suggestion_id', page.id, 'content', page.content, 'status', page.status, 'created_at', page.created_at
    ) order by page.created_at, page.id)
    from (
      select suggestion.id, suggestion.content, suggestion.status, suggestion.created_at
      from public.joy_suggestions as suggestion
      where suggestion.club_id = p_club_id and suggestion.status = 'open'
      order by suggestion.created_at, suggestion.id
      limit p_limit
    ) as page
  ), '[]'::jsonb));
end;
$$;

create or replace function public.review_joy_suggestion(
  p_club_id uuid, p_suggestion_id uuid, p_action text
)
returns void language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.joy_suggestions;
  next_status text;
begin
  if not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'joy_wall_v1' and flag.enabled
      and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
  ) then
    raise exception using errcode = '42501', message = 'joy_wall_disabled';
  end if;
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'joy.moderate') then
    raise exception using errcode = '42501', message = 'joy_moderation_required';
  end if;
  if p_action is null or p_action not in ('reviewed', 'dismissed') then
    raise exception using errcode = '22023', message = 'invalid_joy_suggestion_action';
  end if;
  select suggestion.* into target
  from public.joy_suggestions as suggestion
  where suggestion.id = p_suggestion_id and suggestion.club_id = p_club_id and suggestion.status = 'open'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'joy_suggestion_not_available';
  end if;

  next_status := p_action;
  update public.joy_suggestions
  set status = next_status, updated_at = pg_catalog.clock_timestamp(),
      reviewed_by_app_account_id = actor_id, reviewed_at = pg_catalog.clock_timestamp()
  where id = target.id and club_id = p_club_id;
  insert into public.joy_wall_audit_events (
    club_id, actor_app_account_id, object_kind, object_id, event_type, details
  ) values (
    p_club_id, actor_id, 'suggestion', target.id, 'suggestion_reviewed',
    jsonb_build_object('status', next_status)
  );
end;
$$;

revoke all on function public.create_joy_suggestion(uuid, text) from public, anon;
revoke all on function public.list_joy_suggestions(uuid, integer) from public, anon;
revoke all on function public.review_joy_suggestion(uuid, uuid, text) from public, anon;
grant execute on function public.create_joy_suggestion(uuid, text) to authenticated;
grant execute on function public.list_joy_suggestions(uuid, integer) to authenticated;
grant execute on function public.review_joy_suggestion(uuid, uuid, text) to authenticated;

commit;
