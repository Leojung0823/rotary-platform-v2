begin;

-- Member-level safety controls. A block is recorded by the member who set it,
-- but suppresses new peer interactions in both directions. Content and history
-- remain readable under their original audience rules.
create table public.joy_member_blocks (
  club_id uuid not null references public.clubs(id) on delete restrict,
  blocker_membership_id uuid not null,
  blocked_membership_id uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (club_id, blocker_membership_id, blocked_membership_id),
  constraint joy_member_blocks_distinct_members_check
    check (blocker_membership_id <> blocked_membership_id),
  constraint joy_member_blocks_blocker_club_fkey
    foreign key (blocker_membership_id, club_id)
    references public.club_memberships(id, club_id) on delete restrict,
  constraint joy_member_blocks_blocked_club_fkey
    foreign key (blocked_membership_id, club_id)
    references public.club_memberships(id, club_id) on delete restrict
);

create index joy_member_blocks_blocked_lookup_idx
  on public.joy_member_blocks (club_id, blocked_membership_id, blocker_membership_id);

alter table public.joy_member_blocks enable row level security;
revoke all on table public.joy_member_blocks from public, anon, authenticated, service_role;

alter table public.joy_wall_audit_events
  drop constraint joy_wall_audit_events_object_kind_check;
alter table public.joy_wall_audit_events
  add constraint joy_wall_audit_events_object_kind_check check (object_kind in (
    'post', 'comment', 'reaction', 'report', 'iou', 'question_prompt', 'question_batch',
    'suggestion', 'member_block'
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
    'receipt_acknowledged', 'recipient_hide_requested', 'suggestion_created', 'suggestion_reviewed',
    'post_draft_saved', 'post_draft_deleted', 'post_draft_published', 'post_pinned', 'post_unpinned',
    'member_blocked', 'member_unblocked'
  ));

create or replace function public.joy_members_have_interaction_block(
  p_club_id uuid, p_left_membership_id uuid, p_right_membership_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select p_club_id is not null
    and p_left_membership_id is not null
    and p_right_membership_id is not null
    and exists (
      select 1
      from public.joy_member_blocks as block
      where block.club_id = p_club_id
        and (
          (block.blocker_membership_id = p_left_membership_id
            and block.blocked_membership_id = p_right_membership_id)
          or
          (block.blocker_membership_id = p_right_membership_id
            and block.blocked_membership_id = p_left_membership_id)
        )
    )
$$;

revoke all on function public.joy_members_have_interaction_block(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.enforce_joy_member_interaction_block()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  post_author_membership_id uuid;
  post_type text;
  actor_membership_id uuid;
  target_membership_id uuid;
  parent_membership_id uuid;
begin
  if tg_table_name = 'joy_post_audiences' then
    target_membership_id := new.membership_id;
    select post.author_membership_id, post.post_type
      into post_author_membership_id, post_type
    from public.joy_posts as post
    where post.id = new.post_id and post.club_id = new.club_id;

    -- Officer-dispatched question batches are club operations, not peer-to-peer
    -- invitations. Keep those assignments working even when a member has
    -- blocked the officer who dispatches them.
    if post_type = 'question'
      and public.current_has_club_permission(new.club_id, 'joy.moderate') then
      return new;
    end if;
  elsif tg_table_name = 'joy_comments' then
    actor_membership_id := new.author_membership_id;
    select post.author_membership_id, post.post_type into post_author_membership_id, post_type
    from public.joy_posts as post
    where post.id = new.post_id and post.club_id = new.club_id;
    if post_type = 'question' and new.comment_type = 'answer'
      and exists (
        select 1 from public.joy_question_batch_assignments as assignment
        where assignment.post_id = new.post_id and assignment.club_id = new.club_id
          and assignment.recipient_membership_id = actor_membership_id
      ) then
      return new;
    end if;
    if new.parent_comment_id is not null then
      select parent.author_membership_id into parent_membership_id
      from public.joy_comments as parent
      where parent.id = new.parent_comment_id and parent.post_id = new.post_id
        and parent.club_id = new.club_id;
    end if;
  elsif tg_table_name = 'joy_reactions' then
    actor_membership_id := new.membership_id;
    select post.author_membership_id into post_author_membership_id
    from public.joy_posts as post
    where post.id = new.post_id and post.club_id = new.club_id;
  elsif tg_table_name = 'joy_post_acknowledgements' then
    actor_membership_id := new.membership_id;
    select post.author_membership_id into post_author_membership_id
    from public.joy_posts as post
    where post.id = new.post_id and post.club_id = new.club_id;
  else
    raise exception using errcode = '22023', message = 'invalid_joy_block_trigger_table';
  end if;

  if public.joy_members_have_interaction_block(
       new.club_id, post_author_membership_id, coalesce(actor_membership_id, target_membership_id)
     )
     or (parent_membership_id is not null and public.joy_members_have_interaction_block(
       new.club_id, parent_membership_id, actor_membership_id
     )) then
    raise exception using errcode = '42501', message = 'joy_interaction_blocked';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_joy_member_interaction_block() from public, anon, authenticated, service_role;

create trigger joy_post_audiences_enforce_member_block
before insert on public.joy_post_audiences
for each row execute function public.enforce_joy_member_interaction_block();

create trigger joy_comments_enforce_member_block
before insert on public.joy_comments
for each row execute function public.enforce_joy_member_interaction_block();

create trigger joy_reactions_enforce_member_block
before insert or update on public.joy_reactions
for each row execute function public.enforce_joy_member_interaction_block();

create or replace function public.list_my_joy_member_blocks(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
begin
  if actor_membership_id is null or not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'joy_wall_v1' and flag.enabled
      and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
  ) then
    raise exception using errcode = '42501', message = 'active_joy_membership_required';
  end if;

  return jsonb_build_object('blocked_members', coalesce((
    select jsonb_agg(jsonb_build_object(
      'membership_id', block.blocked_membership_id,
      'display_name', person.canonical_name,
      'avatar_url', person.avatar_url
    ) order by person.canonical_name, block.blocked_membership_id)
    from public.joy_member_blocks as block
    join public.club_memberships as membership
      on membership.id = block.blocked_membership_id and membership.club_id = block.club_id
    join public.people as person on person.id = membership.person_id
    where block.club_id = p_club_id and block.blocker_membership_id = actor_membership_id
  ), '[]'::jsonb));
end;
$$;

create or replace function public.set_my_joy_member_block(
  p_club_id uuid, p_target_membership_id uuid, p_blocked boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
  changed_count integer;
begin
  if actor_id is null or actor_membership_id is null or p_blocked is null
    or not exists (
      select 1 from public.platform_feature_flags as flag
      where flag.feature_key = 'joy_wall_v1' and flag.enabled
        and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
    ) then
    raise exception using errcode = '42501', message = 'active_joy_membership_required';
  end if;
  if p_target_membership_id is null or p_target_membership_id = actor_membership_id
    or not exists (
      select 1 from public.club_memberships as target
      where target.id = p_target_membership_id and target.club_id = p_club_id
        and target.membership_status = 'active'
    ) then
    raise exception using errcode = '22023', message = 'invalid_joy_block_target';
  end if;

  if p_blocked then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(actor_membership_id::text, 0)
    );
    if not exists (
      select 1 from public.joy_member_blocks as existing
      where existing.club_id = p_club_id
        and existing.blocker_membership_id = actor_membership_id
        and existing.blocked_membership_id = p_target_membership_id
    ) and (
      select count(*) from public.joy_member_blocks as existing
      where existing.club_id = p_club_id and existing.blocker_membership_id = actor_membership_id
    ) >= 250 then
      raise exception using errcode = '22023', message = 'joy_member_block_limit_reached';
    end if;
    insert into public.joy_member_blocks (club_id, blocker_membership_id, blocked_membership_id)
    values (p_club_id, actor_membership_id, p_target_membership_id)
    on conflict (club_id, blocker_membership_id, blocked_membership_id) do nothing;
    get diagnostics changed_count = row_count;
    if changed_count > 0 then
      insert into public.joy_wall_audit_events (
        club_id, actor_app_account_id, object_kind, object_id, event_type
      ) values (p_club_id, actor_id, 'member_block', p_target_membership_id, 'member_blocked');
    end if;
  else
    delete from public.joy_member_blocks
    where club_id = p_club_id and blocker_membership_id = actor_membership_id
      and blocked_membership_id = p_target_membership_id;
    get diagnostics changed_count = row_count;
    if changed_count > 0 then
      insert into public.joy_wall_audit_events (
        club_id, actor_app_account_id, object_kind, object_id, event_type
      ) values (p_club_id, actor_id, 'member_block', p_target_membership_id, 'member_unblocked');
    end if;
  end if;

  return jsonb_build_object('membership_id', p_target_membership_id, 'blocked', p_blocked);
end;
$$;

revoke all on function public.list_my_joy_member_blocks(uuid) from public, anon;
revoke all on function public.set_my_joy_member_block(uuid, uuid, boolean) from public, anon;
grant execute on function public.list_my_joy_member_blocks(uuid) to authenticated;
grant execute on function public.set_my_joy_member_block(uuid, uuid, boolean) to authenticated;

commit;
