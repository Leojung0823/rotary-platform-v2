begin;

-- The general-purpose Joy Wall is an independent, dark-by-default domain.
-- Birthday wishes and donation IOUs remain in their existing modules.
alter table public.platform_feature_flags
  drop constraint platform_feature_flags_feature_key_check;
alter table public.platform_feature_flags
  add constraint platform_feature_flags_feature_key_check check (feature_key in (
    'role_context_v2', 'role_shells_v2', 'member_home_v2', 'checkin_qr_v2', 'checkin_gps_v2',
    'attendance_ui_v2', 'announcements_v09', 'blessing_iou_v1',
    'blessing_iou_collections_v1', 'blessing_iou_reporting_v1',
    'birthday_wishes_v1', 'birthday_wishes_v2', 'birthday_wishes_collection_v1',
    'message_board_v1', 'archive_handover_v1',
    'line_oa_auto_pairing_v1', 'line_oa_event_push_v1', 'line_oa_onboarding_v1',
    'line_oa_flex_templates_v1', 'club_join_link_v1', 'line_rich_menu_v1',
    'dues_finance_v1', 'joy_wall_v1'
  ));

alter table public.platform_feature_flag_audit
  drop constraint platform_feature_flag_audit_feature_key_check;
alter table public.platform_feature_flag_audit
  add constraint platform_feature_flag_audit_feature_key_check check (feature_key in (
    'role_context_v2', 'role_shells_v2', 'member_home_v2', 'checkin_qr_v2', 'checkin_gps_v2',
    'attendance_ui_v2', 'announcements_v09', 'blessing_iou_v1',
    'blessing_iou_collections_v1', 'blessing_iou_reporting_v1',
    'birthday_wishes_v1', 'birthday_wishes_v2', 'birthday_wishes_collection_v1',
    'message_board_v1', 'archive_handover_v1',
    'line_oa_auto_pairing_v1', 'line_oa_event_push_v1', 'line_oa_onboarding_v1',
    'line_oa_flex_templates_v1', 'club_join_link_v1', 'line_rich_menu_v1',
    'dues_finance_v1', 'joy_wall_v1'
  ));

-- Keep the protected CLI toggle allow-list in lockstep with both constraints.
create or replace function public.set_platform_feature_flag(
  p_feature_key text,
  p_enabled boolean,
  p_enabled_environments text[],
  p_rollout_percentage integer
)
returns table (
  feature_key text,
  enabled boolean,
  enabled_environments text[],
  rollout_percentage smallint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not public.current_has_platform_role(array['superadmin', 'platform_admin']) then
    raise exception using errcode = '42501', message = 'platform_feature_flag_admin_required';
  end if;
  if p_feature_key not in (
    'role_context_v2', 'role_shells_v2', 'member_home_v2', 'checkin_qr_v2', 'checkin_gps_v2',
    'attendance_ui_v2', 'announcements_v09', 'blessing_iou_v1',
    'blessing_iou_collections_v1', 'blessing_iou_reporting_v1',
    'birthday_wishes_v1', 'birthday_wishes_v2', 'birthday_wishes_collection_v1',
    'message_board_v1', 'archive_handover_v1',
    'line_oa_auto_pairing_v1', 'line_oa_event_push_v1', 'line_oa_onboarding_v1',
    'line_oa_flex_templates_v1', 'club_join_link_v1', 'line_rich_menu_v1',
    'dues_finance_v1', 'joy_wall_v1'
  ) or p_enabled is null or p_enabled_environments is null
    or p_rollout_percentage not between 0 and 100
    or not (p_enabled_environments <@ array['local', 'staging', 'production']::text[]) then
    raise exception using errcode = '22023', message = 'invalid_platform_feature_flag_input';
  end if;

  return query
  insert into public.platform_feature_flags as flag (
    feature_key, enabled, enabled_environments, rollout_percentage
  ) values (
    p_feature_key, p_enabled, p_enabled_environments, p_rollout_percentage::smallint
  )
  on conflict on constraint platform_feature_flags_pkey do update
    set enabled = excluded.enabled,
        enabled_environments = excluded.enabled_environments,
        rollout_percentage = excluded.rollout_percentage
  returning flag.feature_key, flag.enabled, flag.enabled_environments, flag.rollout_percentage, flag.updated_at;
end;
$$;

create or replace function public.platform_product_telemetry_payload_is_valid(
  p_event_name text,
  p_payload jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
begin
  case p_event_name
    when 'member_context_resolve_success' then
      return public.jsonb_has_exact_keys(p_payload, array['duration_ms', 'club_count', 'mode_count'])
        and public.jsonb_bounded_integer(p_payload, 'duration_ms', 120000)
        and public.jsonb_bounded_integer(p_payload, 'club_count', 1000)
        and public.jsonb_bounded_integer(p_payload, 'mode_count', 3);
    when 'member_context_resolve_failure', 'member_home_projection_failure' then
      return public.jsonb_has_exact_keys(p_payload, array['duration_ms', 'reason'])
        and public.jsonb_bounded_integer(p_payload, 'duration_ms', 120000)
        and coalesce(p_payload ->> 'reason', '') in (
          'database_unavailable', 'invalid_projection', 'authorization_denied', 'invalid_configuration', 'unexpected'
        );
    when 'member_home_projection_duration' then
      return public.jsonb_has_exact_keys(p_payload, array['duration_ms', 'database_round_trips'])
        and public.jsonb_bounded_integer(p_payload, 'duration_ms', 120000)
        and public.jsonb_bounded_integer(p_payload, 'database_round_trips', 10);
    when 'checkin_attempt' then
      return public.jsonb_has_exact_keys(p_payload, array['method'])
        and coalesce(p_payload ->> 'method', '') in ('qr', 'gps', 'manual');
    when 'checkin_success' then
      return public.jsonb_has_exact_keys(p_payload, array['method', 'duration_ms', 'result'])
        and coalesce(p_payload ->> 'method', '') in ('qr', 'gps', 'manual')
        and public.jsonb_bounded_integer(p_payload, 'duration_ms', 120000)
        and coalesce(p_payload ->> 'result', '') in ('created', 'duplicate', 'current_qr', 'grace_qr');
    when 'checkin_failure' then
      return public.jsonb_has_exact_keys(p_payload, array['method', 'duration_ms', 'reason'])
        and coalesce(p_payload ->> 'method', '') in ('qr', 'gps', 'manual')
        and public.jsonb_bounded_integer(p_payload, 'duration_ms', 120000)
        and coalesce(p_payload ->> 'reason', '') in (
          'expired', 'previous_code_grace_expired', 'session_closed', 'not_started', 'not_eligible', 'duplicate',
          'network_timeout', 'gps_denied', 'gps_unavailable', 'gps_out_of_range', 'gps_low_quality', 'unexpected'
        );
    when 'checkin_pending_confirmation' then
      return public.jsonb_has_exact_keys(p_payload, array['method', 'reason'])
        and coalesce(p_payload ->> 'method', '') in ('qr', 'gps', 'manual')
        and p_payload ->> 'reason' = 'network_timeout';
    when 'feature_flag_evaluation_failure' then
      return public.jsonb_has_exact_keys(p_payload, array['feature_key', 'reason'])
        and coalesce(p_payload ->> 'feature_key', '') in (
          'role_context_v2', 'role_shells_v2', 'member_home_v2', 'checkin_qr_v2', 'checkin_gps_v2',
          'attendance_ui_v2', 'announcements_v09', 'blessing_iou_v1', 'blessing_iou_collections_v1',
          'blessing_iou_reporting_v1', 'birthday_wishes_v1', 'birthday_wishes_v2',
          'birthday_wishes_collection_v1', 'message_board_v1', 'archive_handover_v1',
          'line_oa_auto_pairing_v1', 'line_oa_event_push_v1', 'line_oa_onboarding_v1',
          'line_oa_flex_templates_v1', 'club_join_link_v1', 'line_rich_menu_v1',
          'dues_finance_v1', 'joy_wall_v1'
        )
        and coalesce(p_payload ->> 'reason', '') in (
          'missing_configuration', 'invalid_configuration', 'evaluation_error'
        );
    else
      return false;
  end case;
end;
$$;

insert into public.permissions (permission_key, description_zh_hant)
values ('joy.moderate', '檢視檢舉並隱藏不當的歡喜牆內容')
on conflict (permission_key) do nothing;

insert into public.role_permissions (role_key, permission_key)
values ('president', 'joy.moderate'), ('secretary', 'joy.moderate')
on conflict (role_key, permission_key) do nothing;

create table public.joy_posts (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  author_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  author_membership_id uuid not null,
  post_type text not null check (post_type in (
    'blessing', 'gratitude', 'welcome', 'encouragement', 'memory', 'question', 'other', 'iou'
  )),
  title text,
  content text not null,
  visibility_scope text not null check (visibility_scope in ('club', 'selected', 'private')),
  post_status text not null default 'published' check (post_status in ('published', 'archived', 'hidden')),
  hidden_at timestamptz,
  hidden_by_app_account_id uuid references public.app_accounts(id) on delete restrict,
  moderation_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint joy_posts_id_club_unique unique (id, club_id),
  constraint joy_posts_author_membership_club_fkey
    foreign key (author_membership_id, club_id)
    references public.club_memberships (id, club_id) on delete restrict,
  constraint joy_posts_title_check check (title is null or char_length(title) between 1 and 100),
  constraint joy_posts_content_check check (char_length(content) between 1 and 2000 and content !~ '^[[:space:]]*$'),
  constraint joy_posts_hidden_consistency check (
    (post_status = 'hidden' and hidden_at is not null and hidden_by_app_account_id is not null)
    or (post_status <> 'hidden' and hidden_at is null and hidden_by_app_account_id is null and moderation_note is null)
  ),
  constraint joy_posts_hidden_note_check check (moderation_note is null or char_length(moderation_note) between 1 and 500)
);

create index joy_posts_club_feed_idx
  on public.joy_posts (club_id, created_at desc, id desc)
  where post_status in ('published', 'hidden');
create index joy_posts_author_idx
  on public.joy_posts (club_id, author_app_account_id, created_at desc, id desc);

create table public.joy_post_audiences (
  post_id uuid not null,
  club_id uuid not null references public.clubs(id) on delete restrict,
  membership_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (post_id, membership_id),
  constraint joy_post_audiences_post_club_fkey
    foreign key (post_id, club_id) references public.joy_posts (id, club_id) on delete restrict,
  constraint joy_post_audiences_membership_club_fkey
    foreign key (membership_id, club_id) references public.club_memberships (id, club_id) on delete restrict
);

create index joy_post_audiences_membership_idx
  on public.joy_post_audiences (club_id, membership_id, post_id);

-- Non-cash promises are a separate lifecycle from donation/collection IOUs.
-- The referenced Joy post is private to its author and addressed recipient.
create table public.joy_iou_items (
  post_id uuid primary key,
  club_id uuid not null references public.clubs(id) on delete restrict,
  recipient_membership_id uuid not null,
  status text not null default 'proposed'
    check (status in ('proposed', 'accepted', 'declined', 'in_progress', 'completed', 'cancelled')),
  due_on date,
  recipient_responded_at timestamptz,
  recipient_response_note text,
  promisor_started_at timestamptz,
  promisor_completion_confirmed_at timestamptz,
  recipient_completion_confirmed_at timestamptz,
  promisor_completion_note text,
  recipient_completion_note text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by_app_account_id uuid references public.app_accounts(id) on delete restrict,
  cancellation_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint joy_iou_items_post_club_fkey
    foreign key (post_id, club_id) references public.joy_posts(id, club_id) on delete restrict,
  constraint joy_iou_items_recipient_club_fkey
    foreign key (recipient_membership_id, club_id)
    references public.club_memberships(id, club_id) on delete restrict,
  constraint joy_iou_items_note_lengths check (
    (recipient_response_note is null or char_length(recipient_response_note) between 1 and 500)
    and (promisor_completion_note is null or char_length(promisor_completion_note) between 1 and 500)
    and (recipient_completion_note is null or char_length(recipient_completion_note) between 1 and 500)
    and (cancellation_note is null or char_length(cancellation_note) between 1 and 500)
  ),
  constraint joy_iou_items_status_consistency check (
    (status = 'proposed' and recipient_responded_at is null and promisor_started_at is null
      and promisor_completion_confirmed_at is null and recipient_completion_confirmed_at is null
      and completed_at is null and cancelled_at is null and cancelled_by_app_account_id is null
      and cancellation_note is null)
    or (status = 'accepted' and recipient_responded_at is not null and promisor_started_at is null
      and promisor_completion_confirmed_at is null and recipient_completion_confirmed_at is null
      and completed_at is null and cancelled_at is null and cancelled_by_app_account_id is null
      and cancellation_note is null)
    or (status = 'declined' and recipient_responded_at is not null and promisor_started_at is null
      and promisor_completion_confirmed_at is null and recipient_completion_confirmed_at is null
      and completed_at is null and cancelled_at is null and cancelled_by_app_account_id is null
      and cancellation_note is null)
    or (status = 'in_progress' and recipient_responded_at is not null and promisor_started_at is not null
      and completed_at is null and cancelled_at is null and cancelled_by_app_account_id is null
      and cancellation_note is null)
    or (status = 'completed' and recipient_responded_at is not null and promisor_started_at is not null
      and promisor_completion_confirmed_at is not null and recipient_completion_confirmed_at is not null
      and completed_at is not null and cancelled_at is null and cancelled_by_app_account_id is null
      and cancellation_note is null)
    or (status = 'cancelled' and cancelled_at is not null and cancelled_by_app_account_id is not null
      and cancellation_note is not null and completed_at is null
      and promisor_completion_confirmed_at is null and recipient_completion_confirmed_at is null)
  )
);

create index joy_iou_items_due_idx on public.joy_iou_items (club_id, due_on)
  where status in ('proposed', 'accepted', 'in_progress') and due_on is not null;

create table public.joy_comments (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  post_id uuid not null,
  author_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  author_membership_id uuid not null,
  parent_comment_id uuid,
  comment_type text not null check (comment_type in ('comment', 'blessing', 'encouragement', 'question', 'answer')),
  content text not null,
  comment_status text not null default 'active' check (comment_status in ('active', 'hidden')),
  created_at timestamptz not null default now(),
  constraint joy_comments_id_post_club_unique unique (id, post_id, club_id),
  constraint joy_comments_post_club_fkey foreign key (post_id, club_id)
    references public.joy_posts (id, club_id) on delete restrict,
  constraint joy_comments_author_membership_club_fkey foreign key (author_membership_id, club_id)
    references public.club_memberships (id, club_id) on delete restrict,
  constraint joy_comments_parent_same_post_fkey foreign key (parent_comment_id, post_id, club_id)
    references public.joy_comments (id, post_id, club_id) on delete restrict,
  constraint joy_comments_content_check check (char_length(content) between 1 and 1000 and content !~ '^[[:space:]]*$')
);

create index joy_comments_post_created_idx on public.joy_comments (post_id, created_at, id)
  where comment_status = 'active';
create index joy_comments_author_time_idx
  on public.joy_comments (club_id, author_app_account_id, created_at);

create table public.joy_reactions (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  post_id uuid not null,
  app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  membership_id uuid not null,
  reaction_type text not null check (reaction_type in ('heart', 'thanks', 'celebrate', 'support', 'laugh')),
  created_at timestamptz not null default now(),
  unique (post_id, app_account_id),
  constraint joy_reactions_post_club_fkey foreign key (post_id, club_id)
    references public.joy_posts (id, club_id) on delete restrict,
  constraint joy_reactions_membership_club_fkey foreign key (membership_id, club_id)
    references public.club_memberships (id, club_id) on delete restrict
);

create index joy_reactions_post_idx on public.joy_reactions (post_id, reaction_type);

create table public.joy_post_reports (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  post_id uuid not null,
  reporter_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  reason text not null check (reason in ('spam', 'harassment', 'privacy', 'inappropriate', 'other')),
  report_status text not null default 'open' check (report_status in ('open', 'resolved', 'dismissed')),
  reviewed_by_app_account_id uuid references public.app_accounts(id) on delete restrict,
  reviewed_at timestamptz,
  reviewer_note text,
  created_at timestamptz not null default now(),
  constraint joy_post_reports_post_club_fkey foreign key (post_id, club_id)
    references public.joy_posts (id, club_id) on delete restrict,
  constraint joy_post_reports_review_consistency check (
    (report_status = 'open' and reviewed_by_app_account_id is null and reviewed_at is null)
    or (report_status <> 'open' and reviewed_by_app_account_id is not null and reviewed_at is not null)
  ),
  constraint joy_post_reports_reviewer_note_check check (reviewer_note is null or char_length(reviewer_note) between 1 and 500)
);

create unique index joy_post_reports_one_open_per_reporter
  on public.joy_post_reports (post_id, reporter_app_account_id) where report_status = 'open';
create index joy_post_reports_open_queue_idx
  on public.joy_post_reports (club_id, created_at, id) where report_status = 'open';
create index joy_post_reports_reporter_time_idx
  on public.joy_post_reports (club_id, reporter_app_account_id, created_at);

create table public.joy_wall_audit_events (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  actor_app_account_id uuid references public.app_accounts(id) on delete restrict,
  object_kind text not null check (object_kind in ('post', 'comment', 'reaction', 'report', 'iou')),
  object_id uuid not null,
  event_type text not null check (event_type in (
    'post_created', 'post_updated', 'post_archived', 'comment_created',
    'reaction_changed', 'post_reported', 'report_dismissed', 'post_hidden',
    'iou_created', 'iou_accepted', 'iou_declined', 'iou_started',
    'iou_completion_confirmed', 'iou_completed', 'iou_cancelled'
  )),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'
    and not (details ? 'title') and not (details ? 'content') and not (details ? 'email')),
  created_at timestamptz not null default now()
);

create index joy_wall_audit_events_club_time_idx
  on public.joy_wall_audit_events (club_id, created_at desc, id desc);

alter table public.joy_posts enable row level security;
alter table public.joy_post_audiences enable row level security;
alter table public.joy_iou_items enable row level security;
alter table public.joy_comments enable row level security;
alter table public.joy_reactions enable row level security;
alter table public.joy_post_reports enable row level security;
alter table public.joy_wall_audit_events enable row level security;
revoke all on table public.joy_posts, public.joy_post_audiences, public.joy_iou_items, public.joy_comments,
  public.joy_reactions, public.joy_post_reports, public.joy_wall_audit_events
  from public, anon, authenticated, service_role;

create or replace function public.protect_joy_post_update()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if old.club_id is distinct from new.club_id
    or old.author_app_account_id is distinct from new.author_app_account_id
    or old.author_membership_id is distinct from new.author_membership_id
    or old.visibility_scope is distinct from new.visibility_scope
    or old.created_at is distinct from new.created_at then
    raise exception using errcode = '23514', message = 'joy_post_identity_immutable';
  end if;
  if old.post_status in ('archived', 'hidden') and new.post_status is distinct from old.post_status then
    raise exception using errcode = '23514', message = 'joy_post_terminal_status';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger joy_posts_protect_update before update on public.joy_posts
for each row execute function public.protect_joy_post_update();

create or replace function public.current_active_joy_membership(p_club_id uuid)
returns uuid language sql stable security definer
set search_path = pg_catalog, public, auth as $$
  select membership.id
  from public.app_accounts as account
  join public.club_memberships as membership on membership.person_id = account.person_id
  join public.clubs as club on club.id = membership.club_id
  where account.auth_user_id = auth.uid()
    and account.account_status = 'active'
    and membership.club_id = p_club_id
    and membership.membership_status = 'active'
    and club.club_status = 'active'
  order by membership.id
  limit 1
$$;

create or replace function public.current_can_read_joy_post(
  p_post_id uuid, p_club_id uuid, p_actor_app_account_id uuid, p_actor_membership_id uuid
)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, auth as $$
  select exists (
    select 1 from public.joy_posts as post
    where post.id = p_post_id and post.club_id = p_club_id
      and (
        (post.post_status = 'published' and (
          post.visibility_scope = 'club'
          or post.author_app_account_id = p_actor_app_account_id
          or exists (
            select 1 from public.joy_post_audiences as audience
            where audience.post_id = post.id and audience.club_id = post.club_id
              and audience.membership_id = p_actor_membership_id
          )
        ))
        or (post.post_status = 'hidden' and post.author_app_account_id = p_actor_app_account_id)
      )
  )
$$;

create or replace function public.joy_iou_projection(
  p_post_id uuid, p_club_id uuid, p_actor_app_account_id uuid, p_actor_membership_id uuid
)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, auth as $$
declare
  item public.joy_iou_items;
  promisor_app_account_id uuid;
  recipient_display_name text;
  is_promisor boolean;
begin
  select iou.* into item
  from public.joy_iou_items as iou
  where iou.post_id = p_post_id and iou.club_id = p_club_id;
  if not found then return null; end if;

  select post.author_app_account_id into promisor_app_account_id
  from public.joy_posts as post
  where post.id = p_post_id and post.club_id = p_club_id;
  is_promisor := p_actor_app_account_id = promisor_app_account_id;
  if not is_promisor and p_actor_membership_id <> item.recipient_membership_id then
    return null;
  end if;

  select person.canonical_name into recipient_display_name
  from public.club_memberships as membership
  join public.people as person on person.id = membership.person_id
  where membership.id = item.recipient_membership_id and membership.club_id = p_club_id;

  return jsonb_build_object(
    'status', item.status,
    'is_overdue', item.status in ('proposed', 'accepted', 'in_progress')
      and item.due_on is not null
      and item.due_on < (pg_catalog.statement_timestamp() at time zone 'Asia/Taipei')::date,
    'due_on', item.due_on,
    'recipient_display_name', recipient_display_name,
    'viewer_role', case when is_promisor then 'promisor' else 'recipient' end,
    'can_accept', not is_promisor and item.status = 'proposed',
    'can_decline', not is_promisor and item.status = 'proposed',
    'can_start', is_promisor and item.status = 'accepted',
    'can_confirm_completion', item.status = 'in_progress'
      and case when is_promisor then item.promisor_completion_confirmed_at is null
        else item.recipient_completion_confirmed_at is null end,
    'can_cancel', item.status in ('proposed', 'accepted', 'in_progress')
      and item.promisor_completion_confirmed_at is null
      and item.recipient_completion_confirmed_at is null,
    'recipient_response_note', item.recipient_response_note,
    'cancellation_note', item.cancellation_note,
    'promisor_completion_confirmed', item.promisor_completion_confirmed_at is not null,
    'recipient_completion_confirmed', item.recipient_completion_confirmed_at is not null,
    'promisor_completion_note', item.promisor_completion_note,
    'recipient_completion_note', item.recipient_completion_note
  );
end;
$$;

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
    or p_action not in ('post', 'comment', 'report')
    or p_max_count is null or p_max_count not between 1 and 1000
    or p_window is null or p_window <= interval '0 seconds' or p_window > interval '1 day' then
    raise exception using errcode = '22023', message = 'invalid_joy_rate_limit';
  end if;

  -- Serialize one actor/action lane so parallel requests cannot all pass the
  -- count check before any of them commit their content.
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

create or replace function public.list_my_joy_clubs()
returns table (club_id uuid, club_code text, club_name text)
language sql stable security definer set search_path = pg_catalog, public, auth as $$
  select club.id, club.club_code, club.club_name
  from public.app_accounts as account
  join public.club_memberships as membership on membership.person_id = account.person_id
  join public.clubs as club on club.id = membership.club_id
  where account.auth_user_id = auth.uid()
    and account.account_status = 'active'
    and membership.membership_status = 'active'
    and club.club_status = 'active'
  order by club.club_name, club.id
$$;

create or replace function public.list_joy_member_options(p_club_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, auth as $$
declare actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
begin
  if actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_joy_membership_required';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'membership_id', membership.id,
      'display_name', person.canonical_name,
      'avatar_url', person.avatar_url
    ) order by person.canonical_name, membership.id)
    from (
      select member.id, member.person_id
      from public.club_memberships as member
      where member.club_id = p_club_id and member.membership_status = 'active'
        and member.id <> actor_membership_id
      order by member.id
      limit 250
    ) as membership
    join public.people as person on person.id = membership.person_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.list_joy_posts(
  p_club_id uuid,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, auth as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
  result jsonb;
begin
  if actor_id is null or actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_joy_membership_required';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50
    or ((p_cursor_created_at is null) <> (p_cursor_id is null)) then
    raise exception using errcode = '22023', message = 'invalid_joy_page';
  end if;
  if p_cursor_id is not null and not exists (
    select 1 from public.joy_posts as cursor_post
    where cursor_post.id = p_cursor_id and cursor_post.club_id = p_club_id
      and cursor_post.created_at = p_cursor_created_at
      and public.current_can_read_joy_post(p_cursor_id, p_club_id, actor_id, actor_membership_id)
  ) then
    raise exception using errcode = '22023', message = 'invalid_joy_cursor';
  end if;

  with page as materialized (
    select post.id, post.club_id, post.post_type, post.title, post.content,
      post.visibility_scope, post.post_status, post.created_at, post.updated_at,
      account.account_display_name as author_display_name, person.avatar_url as author_avatar_url,
      (post.author_app_account_id = actor_id and post.post_type <> 'iou') as can_edit,
      (post.author_app_account_id = actor_id and post.post_type <> 'iou') as can_archive,
      (post.post_type <> 'iou' and (post.author_app_account_id = actor_id or post.visibility_scope = 'club'
        or exists (select 1 from public.joy_post_audiences as audience
          where audience.post_id = post.id and audience.club_id = post.club_id
            and audience.membership_id = actor_membership_id))) as can_answer,
      post.post_status = 'hidden' as is_hidden,
      public.joy_iou_projection(post.id, p_club_id, actor_id, actor_membership_id) as iou_projection,
      (select count(*)::integer from public.joy_comments as comment
       where comment.post_id = post.id and comment.club_id = post.club_id and comment.comment_status = 'active') as comment_count,
      (select coalesce(jsonb_object_agg(reaction_type, reaction_total), '{}'::jsonb)
       from (select reaction_type, count(*)::integer as reaction_total
             from public.joy_reactions where post_id = post.id group by reaction_type) as totals) as reaction_counts,
      (select reaction.reaction_type from public.joy_reactions as reaction
       where reaction.post_id = post.id and reaction.app_account_id = actor_id) as my_reaction
    from public.joy_posts as post
    join public.app_accounts as account on account.id = post.author_app_account_id
    join public.people as person on person.id = account.person_id
    where post.club_id = p_club_id
      and public.current_can_read_joy_post(post.id, p_club_id, actor_id, actor_membership_id)
      and (p_cursor_created_at is null or post.created_at < p_cursor_created_at
        or (post.created_at = p_cursor_created_at and post.id < p_cursor_id))
    order by post.created_at desc, post.id desc
    limit p_limit + 1
  ), visible as materialized (
    select * from page order by created_at desc, id desc limit p_limit
  )
  select jsonb_build_object(
    'posts', coalesce((select jsonb_agg(jsonb_build_object(
      'id', visible.id, 'post_type', visible.post_type, 'title', visible.title,
      'content', visible.content, 'visibility_scope', visible.visibility_scope,
      'post_status', visible.post_status, 'created_at', visible.created_at, 'updated_at', visible.updated_at,
      'author_display_name', visible.author_display_name, 'author_avatar_url', visible.author_avatar_url,
      'can_edit', visible.can_edit, 'can_archive', visible.can_archive,
      'can_answer', visible.can_answer, 'is_hidden', visible.is_hidden, 'iou', visible.iou_projection,
      'comment_count', visible.comment_count, 'reaction_counts', visible.reaction_counts,
      'my_reaction', visible.my_reaction
    ) order by visible.created_at desc, visible.id desc) from visible), '[]'::jsonb),
    'next_cursor', case when (select count(*) from page) > p_limit then (
      select jsonb_build_object('v', 1, 'created_at', oldest.created_at, 'id', oldest.id)
      from visible as oldest order by oldest.created_at asc, oldest.id asc limit 1
    ) else null end
  ) into result;
  return result;
end;
$$;

create or replace function public.create_joy_post(
  p_club_id uuid,
  p_post_type text,
  p_title text,
  p_content text,
  p_visibility_scope text,
  p_audience_membership_ids uuid[] default '{}'::uuid[]
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
  normalized_title text := nullif(btrim(coalesce(p_title, '')), '');
  normalized_content text := btrim(replace(replace(coalesce(p_content, ''), E'\r\n', E'\n'), E'\r', E'\n'));
  wanted_members uuid[] := coalesce(p_audience_membership_ids, '{}'::uuid[]);
  created_post public.joy_posts;
begin
  if actor_id is null or actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_joy_membership_required';
  end if;
  if p_post_type is null or p_post_type not in ('blessing', 'gratitude', 'welcome', 'encouragement', 'memory', 'question', 'other')
    or p_visibility_scope is null or p_visibility_scope not in ('club', 'selected', 'private')
    or char_length(normalized_content) not between 1 and 2000
    or char_length(coalesce(normalized_title, '')) > 100
    or coalesce(array_length(wanted_members, 1), 0) > 25 then
    raise exception using errcode = '22023', message = 'invalid_joy_post';
  end if;
  if p_visibility_scope = 'club' and coalesce(array_length(wanted_members, 1), 0) > 0
    or p_visibility_scope = 'selected' and coalesce(array_length(wanted_members, 1), 0) = 0
    or p_visibility_scope = 'private' and coalesce(array_length(wanted_members, 1), 0) <> 1 then
    raise exception using errcode = '22023', message = 'invalid_joy_audience';
  end if;
  if cardinality(wanted_members) <> cardinality(array(
      select distinct requested.requested_id from unnest(wanted_members) as requested(requested_id)
    ))
    or exists (
      select 1 from unnest(wanted_members) as requested(id)
      where not exists (
        select 1 from public.club_memberships as target
        where target.id = requested.id and target.club_id = p_club_id and target.membership_status = 'active'
      )
  ) then
    raise exception using errcode = '22023', message = 'invalid_joy_audience';
  end if;

  perform public.assert_joy_rate_limit(p_club_id, actor_id, 'post', 20, interval '1 hour');

  insert into public.joy_posts (
    club_id, author_app_account_id, author_membership_id,
    post_type, title, content, visibility_scope
  ) values (
    p_club_id, actor_id, actor_membership_id,
    p_post_type, normalized_title, normalized_content, p_visibility_scope
  ) returning * into created_post;

  insert into public.joy_post_audiences (post_id, club_id, membership_id)
  select created_post.id, p_club_id, requested.id from unnest(wanted_members) as requested(id);

  insert into public.joy_wall_audit_events (club_id, actor_app_account_id, object_kind, object_id, event_type)
  values (p_club_id, actor_id, 'post', created_post.id, 'post_created');

  return jsonb_build_object(
    'id', created_post.id, 'post_type', created_post.post_type, 'title', created_post.title,
    'content', created_post.content, 'visibility_scope', created_post.visibility_scope,
    'post_status', created_post.post_status, 'created_at', created_post.created_at,
    'updated_at', created_post.updated_at,
    'author_display_name', (select account.account_display_name from public.app_accounts as account where account.id = actor_id),
    'author_avatar_url', (select person.avatar_url from public.app_accounts as account join public.people as person on person.id = account.person_id where account.id = actor_id),
    'can_edit', true, 'can_archive', true, 'can_answer', true, 'is_hidden', false,
    'comment_count', 0, 'reaction_counts', '{}'::jsonb, 'my_reaction', null, 'iou', null
  );
end;
$$;

create or replace function public.create_joy_iou(
  p_club_id uuid,
  p_recipient_membership_id uuid,
  p_title text,
  p_content text,
  p_due_on date default null
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
  normalized_title text := nullif(btrim(coalesce(p_title, '')), '');
  normalized_content text := btrim(replace(replace(coalesce(p_content, ''), E'\r\n', E'\n'), E'\r', E'\n'));
  created_post public.joy_posts;
begin
  if actor_id is null or actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_joy_membership_required';
  end if;
  if p_recipient_membership_id is null or p_recipient_membership_id = actor_membership_id
    or not exists (select 1 from public.club_memberships as recipient
      where recipient.id = p_recipient_membership_id and recipient.club_id = p_club_id
        and recipient.membership_status = 'active')
    or char_length(normalized_content) not between 1 and 2000
    or char_length(coalesce(normalized_title, '')) > 100
    or (p_due_on is not null and p_due_on < (pg_catalog.clock_timestamp() at time zone 'Asia/Taipei')::date) then
    raise exception using errcode = '22023', message = 'invalid_joy_iou';
  end if;

  perform public.assert_joy_rate_limit(p_club_id, actor_id, 'post', 20, interval '1 hour');

  insert into public.joy_posts (
    club_id, author_app_account_id, author_membership_id,
    post_type, title, content, visibility_scope
  ) values (
    p_club_id, actor_id, actor_membership_id,
    'iou', normalized_title, normalized_content, 'private'
  ) returning * into created_post;

  insert into public.joy_post_audiences (post_id, club_id, membership_id)
  values (created_post.id, p_club_id, p_recipient_membership_id);
  insert into public.joy_iou_items (post_id, club_id, recipient_membership_id, due_on)
  values (created_post.id, p_club_id, p_recipient_membership_id, p_due_on);
  insert into public.joy_wall_audit_events (club_id, actor_app_account_id, object_kind, object_id, event_type)
  values (p_club_id, actor_id, 'iou', created_post.id, 'iou_created');

  return jsonb_build_object(
    'id', created_post.id, 'post_type', created_post.post_type, 'title', created_post.title,
    'content', created_post.content, 'visibility_scope', created_post.visibility_scope,
    'post_status', created_post.post_status, 'created_at', created_post.created_at,
    'updated_at', created_post.updated_at,
    'author_display_name', (select account.account_display_name from public.app_accounts as account where account.id = actor_id),
    'author_avatar_url', (select person.avatar_url from public.app_accounts as account join public.people as person on person.id = account.person_id where account.id = actor_id),
    'can_edit', false, 'can_archive', false, 'can_answer', false, 'is_hidden', false,
    'comment_count', 0, 'reaction_counts', '{}'::jsonb, 'my_reaction', null,
    'iou', public.joy_iou_projection(created_post.id, p_club_id, actor_id, actor_membership_id)
  );
end;
$$;

create or replace function public.act_joy_iou(
  p_club_id uuid, p_post_id uuid, p_action text, p_note text default null
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
  item public.joy_iou_items;
  post public.joy_posts;
  normalized_note text := nullif(btrim(coalesce(p_note, '')), '');
  event_name text;
begin
  if actor_id is null or actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_joy_membership_required';
  end if;
  if p_action is null or p_action not in ('accept', 'decline', 'start', 'confirm_completion', 'cancel')
    or char_length(coalesce(normalized_note, '')) > 500
    or (p_action = 'start' and normalized_note is not null)
    or (p_action = 'cancel' and normalized_note is null) then
    raise exception using errcode = '22023', message = 'invalid_joy_iou_action';
  end if;

  select iou.* into item
  from public.joy_iou_items as iou
  where iou.post_id = p_post_id and iou.club_id = p_club_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'joy_iou_not_available'; end if;

  select joy_post.* into post from public.joy_posts as joy_post
  where joy_post.id = p_post_id and joy_post.club_id = p_club_id
  for update;
  if not found or (actor_id <> post.author_app_account_id
      and actor_membership_id <> item.recipient_membership_id) then
    raise exception using errcode = '42501', message = 'joy_iou_participant_required';
  end if;

  if p_action in ('accept', 'decline') then
    if actor_id = post.author_app_account_id or item.status <> 'proposed' then
      raise exception using errcode = 'P0002', message = 'joy_iou_action_not_available';
    end if;
    update public.joy_iou_items set
      status = case when p_action = 'accept' then 'accepted' else 'declined' end,
      recipient_responded_at = pg_catalog.clock_timestamp(),
      recipient_response_note = normalized_note,
      updated_at = pg_catalog.clock_timestamp()
    where post_id = p_post_id and club_id = p_club_id;
    event_name := case when p_action = 'accept' then 'iou_accepted' else 'iou_declined' end;
  elsif p_action = 'start' then
    if actor_id <> post.author_app_account_id or item.status <> 'accepted' then
      raise exception using errcode = 'P0002', message = 'joy_iou_action_not_available';
    end if;
    update public.joy_iou_items set status = 'in_progress',
      promisor_started_at = pg_catalog.clock_timestamp(), updated_at = pg_catalog.clock_timestamp()
    where post_id = p_post_id and club_id = p_club_id;
    event_name := 'iou_started';
  elsif p_action = 'confirm_completion' then
    if item.status <> 'in_progress' then
      raise exception using errcode = 'P0002', message = 'joy_iou_action_not_available';
    end if;
    if actor_id = post.author_app_account_id then
      if item.promisor_completion_confirmed_at is null then
        update public.joy_iou_items set
          promisor_completion_confirmed_at = pg_catalog.clock_timestamp(),
          promisor_completion_note = normalized_note,
          updated_at = pg_catalog.clock_timestamp()
        where post_id = p_post_id and club_id = p_club_id;
        event_name := 'iou_completion_confirmed';
      end if;
    elsif item.recipient_completion_confirmed_at is null then
      update public.joy_iou_items set
        recipient_completion_confirmed_at = pg_catalog.clock_timestamp(),
        recipient_completion_note = normalized_note,
        updated_at = pg_catalog.clock_timestamp()
      where post_id = p_post_id and club_id = p_club_id;
      event_name := 'iou_completion_confirmed';
    end if;

    select iou.* into item from public.joy_iou_items as iou
    where iou.post_id = p_post_id and iou.club_id = p_club_id;
    if item.promisor_completion_confirmed_at is not null
      and item.recipient_completion_confirmed_at is not null then
      update public.joy_iou_items set status = 'completed', completed_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
      where post_id = p_post_id and club_id = p_club_id and status = 'in_progress';
      if found then
        insert into public.joy_wall_audit_events (club_id, actor_app_account_id, object_kind, object_id, event_type, details)
        values (p_club_id, actor_id, 'iou', p_post_id, 'iou_completed', jsonb_build_object('status', 'completed'));
      end if;
    end if;
  else
    if item.status not in ('proposed', 'accepted', 'in_progress')
      or item.promisor_completion_confirmed_at is not null
      or item.recipient_completion_confirmed_at is not null then
      raise exception using errcode = 'P0002', message = 'joy_iou_action_not_available';
    end if;
    update public.joy_iou_items set status = 'cancelled',
      cancelled_at = pg_catalog.clock_timestamp(), cancelled_by_app_account_id = actor_id,
      cancellation_note = normalized_note, updated_at = pg_catalog.clock_timestamp()
    where post_id = p_post_id and club_id = p_club_id;
    event_name := 'iou_cancelled';
  end if;

  if event_name is not null then
    insert into public.joy_wall_audit_events (club_id, actor_app_account_id, object_kind, object_id, event_type, details)
    values (p_club_id, actor_id, 'iou', p_post_id, event_name,
      jsonb_build_object('status', (select status from public.joy_iou_items where post_id = p_post_id)));
  end if;

  select joy_post.* into post from public.joy_posts as joy_post
  where joy_post.id = p_post_id and joy_post.club_id = p_club_id;
  return jsonb_build_object(
    'id', post.id, 'post_type', post.post_type, 'title', post.title,
    'content', post.content, 'visibility_scope', post.visibility_scope,
    'post_status', post.post_status, 'created_at', post.created_at,
    'updated_at', post.updated_at,
    'author_display_name', (select account.account_display_name from public.app_accounts as account where account.id = post.author_app_account_id),
    'author_avatar_url', (select person.avatar_url from public.app_accounts as account join public.people as person on person.id = account.person_id where account.id = post.author_app_account_id),
    'can_edit', false, 'can_archive', false, 'can_answer', false, 'is_hidden', false,
    'comment_count', 0, 'reaction_counts', '{}'::jsonb, 'my_reaction', null,
    'iou', public.joy_iou_projection(post.id, p_club_id, actor_id, actor_membership_id)
  );
end;
$$;

create or replace function public.update_own_joy_post(
  p_club_id uuid, p_post_id uuid, p_post_type text, p_title text, p_content text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
  normalized_title text := nullif(btrim(coalesce(p_title, '')), '');
  normalized_content text := btrim(replace(replace(coalesce(p_content, ''), E'\r\n', E'\n'), E'\r', E'\n'));
  updated_post public.joy_posts;
begin
  if actor_id is null or actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_joy_membership_required';
  end if;
  if p_post_type is null or p_post_type not in ('blessing', 'gratitude', 'welcome', 'encouragement', 'memory', 'question', 'other')
    or char_length(normalized_content) not between 1 and 2000 or char_length(coalesce(normalized_title, '')) > 100 then
    raise exception using errcode = '22023', message = 'invalid_joy_post';
  end if;
  update public.joy_posts as post
  set post_type = p_post_type, title = normalized_title, content = normalized_content
  where post.id = p_post_id and post.club_id = p_club_id
    and post.author_app_account_id = actor_id and post.post_status = 'published'
  returning post.* into updated_post;
  if not found then raise exception using errcode = 'P0002', message = 'joy_post_not_available'; end if;
  insert into public.joy_wall_audit_events (club_id, actor_app_account_id, object_kind, object_id, event_type)
  values (p_club_id, actor_id, 'post', updated_post.id, 'post_updated');
  return jsonb_build_object(
    'id', updated_post.id, 'post_type', updated_post.post_type, 'title', updated_post.title,
    'content', updated_post.content, 'visibility_scope', updated_post.visibility_scope,
    'post_status', updated_post.post_status, 'created_at', updated_post.created_at,
    'updated_at', updated_post.updated_at,
    'author_display_name', (select account.account_display_name from public.app_accounts as account where account.id = actor_id),
    'author_avatar_url', (select person.avatar_url from public.app_accounts as account join public.people as person on person.id = account.person_id where account.id = actor_id),
    'can_edit', true, 'can_archive', true, 'can_answer', true, 'is_hidden', false,
    'comment_count', (select count(*)::integer from public.joy_comments as comment where comment.post_id = updated_post.id and comment.comment_status = 'active'),
    'reaction_counts', '{}'::jsonb,
    'my_reaction', (select reaction.reaction_type from public.joy_reactions as reaction where reaction.post_id = updated_post.id and reaction.app_account_id = actor_id),
    'iou', null
  );
end;
$$;

create or replace function public.archive_own_joy_post(p_club_id uuid, p_post_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare actor_id uuid := public.current_app_account_id();
begin
  if actor_id is null or public.current_active_joy_membership(p_club_id) is null then
    raise exception using errcode = '42501', message = 'active_joy_membership_required';
  end if;
  update public.joy_posts set post_status = 'archived'
  where id = p_post_id and club_id = p_club_id and author_app_account_id = actor_id
    and post_type <> 'iou' and post_status = 'published';
  if not found then raise exception using errcode = 'P0002', message = 'joy_post_not_available'; end if;
  insert into public.joy_wall_audit_events (club_id, actor_app_account_id, object_kind, object_id, event_type)
  values (p_club_id, actor_id, 'post', p_post_id, 'post_archived');
end;
$$;

create or replace function public.list_joy_comments(p_club_id uuid, p_post_id uuid, p_limit integer default 100)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, auth as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
begin
  if actor_id is null or actor_membership_id is null
    or not public.current_can_read_joy_post(p_post_id, p_club_id, actor_id, actor_membership_id) then
    raise exception using errcode = '42501', message = 'joy_post_not_available';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_joy_comment_limit';
  end if;
  return jsonb_build_object('comments', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', page.id, 'parent_comment_id', page.parent_comment_id, 'comment_type', page.comment_type,
      'content', page.content, 'created_at', page.created_at,
      'author_display_name', page.account_display_name, 'author_avatar_url', page.avatar_url,
      'can_delete', page.author_app_account_id = actor_id
    ) order by page.created_at, page.id)
    from (
      select comment.id, comment.parent_comment_id, comment.comment_type, comment.content,
        comment.created_at, comment.author_app_account_id,
        account.account_display_name, person.avatar_url
      from public.joy_comments as comment
      join public.app_accounts as account on account.id = comment.author_app_account_id
      join public.people as person on person.id = account.person_id
      where comment.post_id = p_post_id and comment.club_id = p_club_id and comment.comment_status = 'active'
      order by comment.created_at, comment.id limit p_limit
    ) as page
  ), '[]'::jsonb));
end;
$$;

create or replace function public.create_joy_comment(
  p_club_id uuid, p_post_id uuid, p_parent_comment_id uuid, p_comment_type text, p_content text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
  normalized_content text := btrim(replace(replace(coalesce(p_content, ''), E'\r\n', E'\n'), E'\r', E'\n'));
  created_comment public.joy_comments;
  post_author uuid;
begin
  if actor_id is null or actor_membership_id is null
    or not public.current_can_read_joy_post(p_post_id, p_club_id, actor_id, actor_membership_id) then
    raise exception using errcode = '42501', message = 'joy_post_not_available';
  end if;
  if exists (select 1 from public.joy_posts where id = p_post_id and club_id = p_club_id and post_type = 'iou') then
    raise exception using errcode = '22023', message = 'joy_iou_uses_lifecycle_actions';
  end if;
  if p_comment_type is null or p_comment_type not in ('comment', 'blessing', 'encouragement', 'question', 'answer')
    or char_length(normalized_content) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'invalid_joy_comment';
  end if;
  select author_app_account_id into post_author from public.joy_posts
  where id = p_post_id and club_id = p_club_id and post_status = 'published';
  if not found then raise exception using errcode = 'P0002', message = 'joy_post_not_available'; end if;
  if p_comment_type = 'answer' and actor_id <> post_author
    and (select post.visibility_scope from public.joy_posts as post
      where post.id = p_post_id and post.club_id = p_club_id) <> 'club'
    and not exists (select 1 from public.joy_post_audiences as audience
      where audience.post_id = p_post_id and audience.club_id = p_club_id
        and audience.membership_id = actor_membership_id) then
    raise exception using errcode = '42501', message = 'joy_answer_recipient_required';
  end if;
  if p_parent_comment_id is not null and not exists (
    select 1 from public.joy_comments as parent
    where parent.id = p_parent_comment_id and parent.post_id = p_post_id and parent.club_id = p_club_id
      and parent.parent_comment_id is null and parent.comment_status = 'active'
  ) then raise exception using errcode = '22023', message = 'invalid_joy_reply_target'; end if;

  perform public.assert_joy_rate_limit(p_club_id, actor_id, 'comment', 8, interval '1 minute');
  perform public.assert_joy_rate_limit(p_club_id, actor_id, 'comment', 40, interval '1 hour');

  insert into public.joy_comments (
    club_id, post_id, author_app_account_id, author_membership_id,
    parent_comment_id, comment_type, content
  ) values (
    p_club_id, p_post_id, actor_id, actor_membership_id,
    p_parent_comment_id, p_comment_type, normalized_content
  ) returning * into created_comment;
  insert into public.joy_wall_audit_events (club_id, actor_app_account_id, object_kind, object_id, event_type)
  values (p_club_id, actor_id, 'comment', created_comment.id, 'comment_created');
  return jsonb_build_object(
    'id', created_comment.id, 'parent_comment_id', created_comment.parent_comment_id,
    'comment_type', created_comment.comment_type, 'content', created_comment.content,
    'created_at', created_comment.created_at,
    'author_display_name', (select account.account_display_name from public.app_accounts as account where account.id = actor_id),
    'author_avatar_url', (select person.avatar_url from public.app_accounts as account join public.people as person on person.id = account.person_id where account.id = actor_id),
    'can_delete', true
  );
end;
$$;

create or replace function public.toggle_joy_reaction(
  p_club_id uuid, p_post_id uuid, p_reaction_type text
)
returns text language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
  current_type text;
begin
  if actor_id is null or actor_membership_id is null
    or not public.current_can_read_joy_post(p_post_id, p_club_id, actor_id, actor_membership_id) then
    raise exception using errcode = '42501', message = 'joy_post_not_available';
  end if;
  if exists (select 1 from public.joy_posts where id = p_post_id and club_id = p_club_id and post_type = 'iou') then
    raise exception using errcode = '22023', message = 'joy_iou_uses_lifecycle_actions';
  end if;
  if p_reaction_type is null or p_reaction_type not in ('heart', 'thanks', 'celebrate', 'support', 'laugh') then
    raise exception using errcode = '22023', message = 'invalid_joy_reaction';
  end if;
  select reaction_type into current_type from public.joy_reactions
  where post_id = p_post_id and app_account_id = actor_id for update;
  if current_type = p_reaction_type then
    delete from public.joy_reactions where post_id = p_post_id and app_account_id = actor_id;
    current_type := null;
  else
    insert into public.joy_reactions (club_id, post_id, app_account_id, membership_id, reaction_type)
    values (p_club_id, p_post_id, actor_id, actor_membership_id, p_reaction_type)
    on conflict (post_id, app_account_id) do update
      set reaction_type = excluded.reaction_type, membership_id = excluded.membership_id;
    current_type := p_reaction_type;
  end if;
  insert into public.joy_wall_audit_events (club_id, actor_app_account_id, object_kind, object_id, event_type, details)
  values (p_club_id, actor_id, 'reaction', p_post_id, 'reaction_changed', jsonb_build_object('reaction_type', current_type));
  return current_type;
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
  if actor_id is null or actor_membership_id is null
    or not public.current_can_read_joy_post(p_post_id, p_club_id, actor_id, actor_membership_id) then
    raise exception using errcode = '42501', message = 'joy_post_not_available';
  end if;
  if p_reason is null or p_reason not in ('spam', 'harassment', 'privacy', 'inappropriate', 'other') then
    raise exception using errcode = '22023', message = 'invalid_joy_report';
  end if;
  if exists (select 1 from public.joy_posts where id = p_post_id and author_app_account_id = actor_id) then
    raise exception using errcode = '22023', message = 'cannot_report_own_joy_post';
  end if;
  perform public.assert_joy_rate_limit(p_club_id, actor_id, 'report', 5, interval '1 hour');
  insert into public.joy_post_reports (club_id, post_id, reporter_app_account_id, reason)
  values (p_club_id, p_post_id, actor_id, p_reason)
  returning id into report_id;
  insert into public.joy_wall_audit_events (club_id, actor_app_account_id, object_kind, object_id, event_type)
  values (p_club_id, actor_id, 'report', report_id, 'post_reported');
  return report_id;
end;
$$;

create or replace function public.list_joy_reports(p_club_id uuid, p_limit integer default 50)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, auth as $$
begin
  if not public.current_has_club_permission(p_club_id, 'joy.moderate') then
    raise exception using errcode = '42501', message = 'joy_moderation_required';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_joy_report_limit';
  end if;
  return jsonb_build_object('reports', coalesce((
    select jsonb_agg(jsonb_build_object(
      'report_id', page.report_id, 'post_id', page.post_id, 'reason', page.reason,
      'created_at', page.created_at, 'post_title', page.title, 'post_content', page.content,
      'post_type', page.post_type, 'post_status', page.post_status,
      'author_display_name', page.author_display_name
    ) order by page.created_at, page.report_id)
    from (
      select report.id as report_id, report.post_id, report.reason, report.created_at,
        post.title, post.content, post.post_type, post.post_status,
        account.account_display_name as author_display_name
      from public.joy_post_reports as report
      join public.joy_posts as post on post.id = report.post_id and post.club_id = report.club_id
      join public.app_accounts as account on account.id = post.author_app_account_id
      where report.club_id = p_club_id and report.report_status = 'open'
      order by report.created_at, report.id limit p_limit
    ) as page
  ), '[]'::jsonb));
end;
$$;

create or replace function public.resolve_joy_report(
  p_club_id uuid, p_report_id uuid, p_action text, p_reviewer_note text default null
)
returns void language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare
  actor_id uuid := public.current_app_account_id();
  target_post_id uuid;
  target_status text;
  normalized_note text := nullif(btrim(coalesce(p_reviewer_note, '')), '');
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'joy.moderate') then
    raise exception using errcode = '42501', message = 'joy_moderation_required';
  end if;
  if p_action is null or p_action not in ('hide', 'dismiss') or char_length(coalesce(normalized_note, '')) > 500 then
    raise exception using errcode = '22023', message = 'invalid_joy_moderation_action';
  end if;
  select post_id into target_post_id from public.joy_post_reports
  where id = p_report_id and club_id = p_club_id and report_status = 'open' for update;
  if not found then raise exception using errcode = 'P0002', message = 'joy_report_not_available'; end if;
  if p_action = 'hide' then
    select post_status into target_status from public.joy_posts
    where id = target_post_id and club_id = p_club_id for update;
    if target_status is distinct from 'published' then
      raise exception using errcode = 'P0002', message = 'joy_post_not_available';
    end if;
    update public.joy_posts set post_status = 'hidden', hidden_at = now(),
      hidden_by_app_account_id = actor_id, moderation_note = coalesce(normalized_note, '違反社內互動規範')
    where id = target_post_id and club_id = p_club_id and post_status = 'published';
    update public.joy_post_reports set report_status = 'resolved', reviewed_by_app_account_id = actor_id,
      reviewed_at = now(), reviewer_note = normalized_note
    where post_id = target_post_id and club_id = p_club_id and report_status = 'open';
    insert into public.joy_wall_audit_events (club_id, actor_app_account_id, object_kind, object_id, event_type)
    values (p_club_id, actor_id, 'post', target_post_id, 'post_hidden');
  else
    update public.joy_post_reports set report_status = 'dismissed', reviewed_by_app_account_id = actor_id,
      reviewed_at = now(), reviewer_note = normalized_note
    where id = p_report_id and club_id = p_club_id;
    insert into public.joy_wall_audit_events (club_id, actor_app_account_id, object_kind, object_id, event_type)
    values (p_club_id, actor_id, 'report', p_report_id, 'report_dismissed');
  end if;
end;
$$;

revoke all on function public.protect_joy_post_update() from public, anon, authenticated;
revoke all on function public.current_active_joy_membership(uuid) from public, anon, authenticated;
revoke all on function public.current_can_read_joy_post(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.joy_iou_projection(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.assert_joy_rate_limit(uuid, uuid, text, integer, interval) from public, anon, authenticated;
revoke all on function public.list_my_joy_clubs() from public, anon;
revoke all on function public.list_joy_member_options(uuid) from public, anon;
revoke all on function public.list_joy_posts(uuid, timestamptz, uuid, integer) from public, anon;
revoke all on function public.create_joy_post(uuid, text, text, text, text, uuid[]) from public, anon;
revoke all on function public.create_joy_iou(uuid, uuid, text, text, date) from public, anon;
revoke all on function public.act_joy_iou(uuid, uuid, text, text) from public, anon;
revoke all on function public.update_own_joy_post(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.archive_own_joy_post(uuid, uuid) from public, anon;
revoke all on function public.list_joy_comments(uuid, uuid, integer) from public, anon;
revoke all on function public.create_joy_comment(uuid, uuid, uuid, text, text) from public, anon;
revoke all on function public.toggle_joy_reaction(uuid, uuid, text) from public, anon;
revoke all on function public.report_joy_post(uuid, uuid, text) from public, anon;
revoke all on function public.list_joy_reports(uuid, integer) from public, anon;
revoke all on function public.resolve_joy_report(uuid, uuid, text, text) from public, anon;
grant execute on function public.list_my_joy_clubs() to authenticated;
grant execute on function public.list_joy_member_options(uuid) to authenticated;
grant execute on function public.list_joy_posts(uuid, timestamptz, uuid, integer) to authenticated;
grant execute on function public.create_joy_post(uuid, text, text, text, text, uuid[]) to authenticated;
grant execute on function public.create_joy_iou(uuid, uuid, text, text, date) to authenticated;
grant execute on function public.act_joy_iou(uuid, uuid, text, text) to authenticated;
grant execute on function public.update_own_joy_post(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.archive_own_joy_post(uuid, uuid) to authenticated;
grant execute on function public.list_joy_comments(uuid, uuid, integer) to authenticated;
grant execute on function public.create_joy_comment(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.toggle_joy_reaction(uuid, uuid, text) to authenticated;
grant execute on function public.report_joy_post(uuid, uuid, text) to authenticated;
grant execute on function public.list_joy_reports(uuid, integer) to authenticated;
grant execute on function public.resolve_joy_report(uuid, uuid, text, text) to authenticated;

commit;
