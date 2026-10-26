begin;

alter table public.joy_wall_audit_events
  drop constraint joy_wall_audit_events_event_type_check;
alter table public.joy_wall_audit_events
  add constraint joy_wall_audit_events_event_type_check check (event_type in (
    'post_created', 'post_updated', 'post_archived', 'comment_created',
    'reaction_changed', 'post_reported', 'report_dismissed', 'post_hidden',
    'iou_created', 'iou_accepted', 'iou_declined', 'iou_started',
    'iou_completion_confirmed', 'iou_completed', 'iou_cancelled',
    'question_prompt_created', 'question_prompt_updated', 'question_batch_dispatched',
    'receipt_acknowledged', 'recipient_hide_requested', 'suggestion_created', 'suggestion_reviewed',
    'post_draft_saved', 'post_draft_deleted', 'post_draft_published'
  ));

create table public.joy_post_drafts (
  id uuid primary key,
  club_id uuid not null references public.clubs(id) on delete restrict,
  author_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  author_membership_id uuid not null,
  post_type text not null check (post_type in (
    'blessing', 'gratitude', 'welcome', 'encouragement', 'memory', 'question', 'other'
  )),
  title text,
  content text not null default '',
  visibility_scope text not null default 'club' check (visibility_scope in ('club', 'selected', 'private')),
  audience_membership_ids uuid[] not null default '{}'::uuid[],
  event_ids uuid[] not null default '{}'::uuid[],
  rotary_year_ids uuid[] not null default '{}'::uuid[],
  role_keys text[] not null default '{}'::text[],
  birthday_campaign_ids uuid[] not null default '{}'::uuid[],
  interaction_deadline_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint joy_post_drafts_author_membership_club_fkey
    foreign key (author_membership_id, club_id)
    references public.club_memberships(id, club_id) on delete restrict,
  constraint joy_post_drafts_title_check check (title is null or char_length(title) between 1 and 100),
  constraint joy_post_drafts_content_check check (char_length(content) <= 2000),
  constraint joy_post_drafts_audience_check check (
    (visibility_scope = 'club' and cardinality(audience_membership_ids) = 0)
    or (visibility_scope = 'selected' and cardinality(audience_membership_ids) <= 25)
    or (visibility_scope = 'private' and cardinality(audience_membership_ids) <= 1)
  ),
  constraint joy_post_drafts_targets_limit_check check (
    cardinality(event_ids) <= 5 and cardinality(rotary_year_ids) <= 5
    and cardinality(role_keys) <= 5 and cardinality(birthday_campaign_ids) <= 5
  )
);

create index joy_post_drafts_owner_idx
  on public.joy_post_drafts (club_id, author_app_account_id, updated_at desc, id);
alter table public.joy_post_drafts enable row level security;
revoke all on table public.joy_post_drafts from public, anon, authenticated, service_role;

create or replace function public.list_my_joy_post_drafts(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
begin
  if actor_id is null or actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_joy_membership_required';
  end if;
  if not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'joy_wall_v1' and flag.enabled
      and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
  ) then
    raise exception using errcode = '42501', message = 'joy_wall_disabled';
  end if;

  return jsonb_build_object('drafts', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', draft.id, 'post_type', draft.post_type, 'title', draft.title, 'content', draft.content,
      'visibility_scope', draft.visibility_scope,
      'audience_membership_ids', to_jsonb(draft.audience_membership_ids),
      'event_ids', to_jsonb(draft.event_ids), 'rotary_year_ids', to_jsonb(draft.rotary_year_ids),
      'role_keys', to_jsonb(draft.role_keys), 'birthday_campaign_ids', to_jsonb(draft.birthday_campaign_ids),
      'interaction_deadline_on', draft.interaction_deadline_on,
      'created_at', draft.created_at, 'updated_at', draft.updated_at
    ) order by draft.updated_at desc, draft.id)
    from public.joy_post_drafts as draft
    where draft.club_id = p_club_id and draft.author_app_account_id = actor_id
  ), '[]'::jsonb));
end;
$$;

create or replace function public.save_my_joy_post_draft(
  p_club_id uuid,
  p_draft_id uuid,
  p_post_type text,
  p_title text,
  p_content text,
  p_visibility_scope text,
  p_audience_membership_ids uuid[] default '{}'::uuid[],
  p_event_ids uuid[] default '{}'::uuid[],
  p_rotary_year_ids uuid[] default '{}'::uuid[],
  p_role_keys text[] default '{}'::text[],
  p_birthday_campaign_ids uuid[] default '{}'::uuid[],
  p_interaction_deadline_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
  normalized_title text := nullif(btrim(coalesce(p_title, '')), '');
  normalized_content text := btrim(replace(replace(coalesce(p_content, ''), E'\r\n', E'\n'), E'\r', E'\n'));
  wanted_members uuid[] := coalesce(p_audience_membership_ids, '{}'::uuid[]);
  event_ids uuid[] := coalesce(p_event_ids, '{}'::uuid[]);
  rotary_year_ids uuid[] := coalesce(p_rotary_year_ids, '{}'::uuid[]);
  role_keys text[] := coalesce(p_role_keys, '{}'::text[]);
  birthday_campaign_ids uuid[] := coalesce(p_birthday_campaign_ids, '{}'::uuid[]);
  saved_draft public.joy_post_drafts;
  recent_saves integer;
begin
  if actor_id is null or actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_joy_membership_required';
  end if;
  if not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'joy_wall_v1' and flag.enabled
      and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
  ) then
    raise exception using errcode = '42501', message = 'joy_wall_disabled';
  end if;
  if p_draft_id is null or p_post_type is null
    or p_post_type not in ('blessing', 'gratitude', 'welcome', 'encouragement', 'memory', 'question', 'other')
    or p_visibility_scope is null or p_visibility_scope not in ('club', 'selected', 'private')
    or char_length(coalesce(normalized_title, '')) > 100 or char_length(normalized_content) > 2000
    or (p_visibility_scope = 'club' and cardinality(wanted_members) <> 0)
    or (p_visibility_scope = 'selected' and cardinality(wanted_members) > 25)
    or (p_visibility_scope = 'private' and cardinality(wanted_members) > 1)
    or cardinality(event_ids) > 5 or cardinality(rotary_year_ids) > 5
    or cardinality(role_keys) > 5 or cardinality(birthday_campaign_ids) > 5
    or array_position(wanted_members, null::uuid) is not null
    or array_position(event_ids, null::uuid) is not null
    or array_position(rotary_year_ids, null::uuid) is not null
    or array_position(role_keys, null::text) is not null
    or array_position(birthday_campaign_ids, null::uuid) is not null
    or exists (select 1 from unnest(role_keys) as requested(role_key) where requested.role_key !~ '^[a-z][a-z0-9_]{0,39}$')
    or cardinality(wanted_members) <> cardinality(array(select distinct value from unnest(wanted_members) as requested(value)))
    or cardinality(event_ids) <> cardinality(array(select distinct value from unnest(event_ids) as requested(value)))
    or cardinality(rotary_year_ids) <> cardinality(array(select distinct value from unnest(rotary_year_ids) as requested(value)))
    or cardinality(role_keys) <> cardinality(array(select distinct value from unnest(role_keys) as requested(value)))
    or cardinality(birthday_campaign_ids) <> cardinality(array(select distinct value from unnest(birthday_campaign_ids) as requested(value))) then
    raise exception using errcode = '22023', message = 'invalid_joy_post_draft';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_club_id::text || ':' || actor_id::text || ':joy-drafts', 0
  ));
  if not exists (
    select 1 from public.joy_post_drafts as draft
    where draft.id = p_draft_id and draft.club_id = p_club_id and draft.author_app_account_id = actor_id
  ) and (
    select count(*) from public.joy_post_drafts as draft
    where draft.club_id = p_club_id and draft.author_app_account_id = actor_id
  ) >= 20 then
    raise exception using errcode = '54000', message = 'joy_draft_limit_reached';
  end if;
  select count(*)::integer into recent_saves from public.joy_wall_audit_events as audit
  where audit.club_id = p_club_id and audit.actor_app_account_id = actor_id
    and audit.object_kind = 'post' and audit.event_type = 'post_draft_saved'
    and audit.created_at >= pg_catalog.clock_timestamp() - interval '1 hour';
  if recent_saves >= 30 then
    raise exception using errcode = '54000', message = 'joy_rate_limited';
  end if;

  insert into public.joy_post_drafts as target_draft (
    id, club_id, author_app_account_id, author_membership_id, post_type, title, content,
    visibility_scope, audience_membership_ids, event_ids, rotary_year_ids, role_keys,
    birthday_campaign_ids, interaction_deadline_on
  ) values (
    p_draft_id, p_club_id, actor_id, actor_membership_id, p_post_type, normalized_title, normalized_content,
    p_visibility_scope, wanted_members, event_ids, rotary_year_ids, role_keys, birthday_campaign_ids,
    p_interaction_deadline_on
  )
  on conflict (id) do update set
    author_membership_id = excluded.author_membership_id,
    post_type = excluded.post_type, title = excluded.title, content = excluded.content,
    visibility_scope = excluded.visibility_scope, audience_membership_ids = excluded.audience_membership_ids,
    event_ids = excluded.event_ids, rotary_year_ids = excluded.rotary_year_ids,
    role_keys = excluded.role_keys, birthday_campaign_ids = excluded.birthday_campaign_ids,
    interaction_deadline_on = excluded.interaction_deadline_on,
    updated_at = pg_catalog.clock_timestamp()
  where target_draft.club_id = excluded.club_id
    and target_draft.author_app_account_id = actor_id
  returning * into saved_draft;
  if not found then
    raise exception using errcode = 'P0002', message = 'joy_post_draft_not_available';
  end if;

  insert into public.joy_wall_audit_events (club_id, actor_app_account_id, object_kind, object_id, event_type, details)
  values (p_club_id, actor_id, 'post', p_draft_id, 'post_draft_saved', jsonb_build_object('post_type', p_post_type));

  return jsonb_build_object(
    'id', saved_draft.id, 'post_type', saved_draft.post_type, 'title', saved_draft.title,
    'content', saved_draft.content, 'visibility_scope', saved_draft.visibility_scope,
    'audience_membership_ids', to_jsonb(saved_draft.audience_membership_ids),
    'event_ids', to_jsonb(saved_draft.event_ids), 'rotary_year_ids', to_jsonb(saved_draft.rotary_year_ids),
    'role_keys', to_jsonb(saved_draft.role_keys), 'birthday_campaign_ids', to_jsonb(saved_draft.birthday_campaign_ids),
    'interaction_deadline_on', saved_draft.interaction_deadline_on,
    'created_at', saved_draft.created_at, 'updated_at', saved_draft.updated_at
  );
end;
$$;

create or replace function public.delete_my_joy_post_draft(p_club_id uuid, p_draft_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
begin
  if actor_id is null or actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_joy_membership_required';
  end if;
  if not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'joy_wall_v1' and flag.enabled
      and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
  ) then
    raise exception using errcode = '42501', message = 'joy_wall_disabled';
  end if;

  delete from public.joy_post_drafts as draft
  where draft.id = p_draft_id and draft.club_id = p_club_id and draft.author_app_account_id = actor_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'joy_post_draft_not_available';
  end if;
  insert into public.joy_wall_audit_events (club_id, actor_app_account_id, object_kind, object_id, event_type)
  values (p_club_id, actor_id, 'post', p_draft_id, 'post_draft_deleted');
end;
$$;

create or replace function public.publish_my_joy_post_draft(p_club_id uuid, p_draft_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
  draft public.joy_post_drafts;
  published_post jsonb;
  published_post_id uuid;
begin
  if actor_id is null or actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_joy_membership_required';
  end if;
  if not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'joy_wall_v1' and flag.enabled
      and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
  ) then
    raise exception using errcode = '42501', message = 'joy_wall_disabled';
  end if;

  select own_draft.* into draft
  from public.joy_post_drafts as own_draft
  where own_draft.id = p_draft_id and own_draft.club_id = p_club_id
    and own_draft.author_app_account_id = actor_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'joy_post_draft_not_available';
  end if;

  published_post := public.create_joy_post_with_targets(
    p_club_id, draft.post_type, draft.title, draft.content, draft.visibility_scope,
    draft.audience_membership_ids, draft.event_ids, draft.rotary_year_ids,
    draft.role_keys, draft.birthday_campaign_ids
  );
  published_post_id := (published_post->>'id')::uuid;
  delete from public.joy_post_drafts where id = p_draft_id and club_id = p_club_id
    and author_app_account_id = actor_id;
  insert into public.joy_wall_audit_events (club_id, actor_app_account_id, object_kind, object_id, event_type, details)
  values (p_club_id, actor_id, 'post', published_post_id, 'post_draft_published', jsonb_build_object('draft_id', p_draft_id));
  return published_post;
end;
$$;

revoke all on function public.list_my_joy_post_drafts(uuid) from public, anon;
revoke all on function public.save_my_joy_post_draft(uuid, uuid, text, text, text, text, uuid[], uuid[], uuid[], text[], uuid[], date)
  from public, anon;
revoke all on function public.delete_my_joy_post_draft(uuid, uuid) from public, anon;
revoke all on function public.publish_my_joy_post_draft(uuid, uuid) from public, anon;
grant execute on function public.list_my_joy_post_drafts(uuid) to authenticated;
grant execute on function public.save_my_joy_post_draft(uuid, uuid, text, text, text, text, uuid[], uuid[], uuid[], text[], uuid[], date)
  to authenticated;
grant execute on function public.delete_my_joy_post_draft(uuid, uuid) to authenticated;
grant execute on function public.publish_my_joy_post_draft(uuid, uuid) to authenticated;

commit;
