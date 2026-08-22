begin;

-- The in-app message centre: the club's own inbox.
--
-- Until now the only way to reach a member without them opening the right page
-- was a LINE OA push, which reaches only the members who have paired their
-- account. `notification_settings` has existed for a while but stores
-- preferences with nothing behind them -- there was no message to deliver and
-- nowhere to deliver it to. This adds the missing half: a stored message, a
-- per-member delivery with its own read state, and the counts a nav badge and
-- an officer's progress view need.
--
-- Who receives a message is resolved once, when it is sent, through the shared
-- `resolve_club_audience`. The delivery rows are therefore a snapshot: someone
-- who joins the club tomorrow does not retroactively receive yesterday's
-- message, and an officer who edits a tag afterwards does not change who was
-- addressed. That is deliberate -- an inbox is a record of what was sent, not a
-- query re-evaluated on every read.

create table public.club_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  author_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  title text not null,
  body text not null,
  -- What the sender chose, kept for display ("發給：理事會"). It is not the
  -- authority on delivery; the recipient rows are.
  audience_kind text not null default 'everyone',
  status text not null default 'active',
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint club_messages_title_not_blank check (title !~ '^[[:space:]]*$'),
  constraint club_messages_title_length check (char_length(title) between 1 and 120),
  constraint club_messages_body_not_blank check (body !~ '^[[:space:]]*$'),
  constraint club_messages_body_length check (char_length(body) between 1 and 4000),
  constraint club_messages_audience_kind_check check (audience_kind in ('everyone', 'tags', 'members')),
  constraint club_messages_status_check check (status in ('active', 'deleted')),
  constraint club_messages_deleted_consistency check (
    (status = 'active' and deleted_at is null)
    or (status = 'deleted' and deleted_at is not null)
  ),
  constraint club_messages_id_club_unique unique (id, club_id)
);

comment on table public.club_messages is
  'Club-scoped in-app messages from officers. Club, author and timestamps are database controlled.';

create index club_messages_club_published_idx
  on public.club_messages (club_id, published_at desc, id desc)
  where status = 'active';

-- The tags a message was addressed to, for display only. Named-member
-- audiences are not recorded here: naming individuals is already visible in
-- the delivery rows, and repeating it would create a second place to keep
-- consistent.
create table public.club_message_audiences (
  message_id uuid not null,
  tag_id uuid not null,
  club_id uuid not null references public.clubs(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (message_id, tag_id),
  constraint club_message_audiences_message_club_fkey
    foreign key (message_id, club_id)
    references public.club_messages (id, club_id) on delete restrict,
  constraint club_message_audiences_tag_club_fkey
    foreign key (tag_id, club_id)
    references public.club_member_tags (id, club_id) on delete restrict
);

-- One row per member the message was actually delivered to. This is what makes
-- "unread" a fact about a person rather than a guess, and what lets an officer
-- see who has read it without having to ask.
create table public.club_message_recipients (
  message_id uuid not null,
  membership_id uuid not null,
  club_id uuid not null references public.clubs(id) on delete restrict,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (message_id, membership_id),
  constraint club_message_recipients_message_club_fkey
    foreign key (message_id, club_id)
    references public.club_messages (id, club_id) on delete restrict,
  constraint club_message_recipients_membership_club_fkey
    foreign key (membership_id, club_id)
    references public.club_memberships (id, club_id) on delete restrict
);

create index club_message_recipients_unread_idx
  on public.club_message_recipients (club_id, membership_id, read_at);

alter table public.club_messages enable row level security;
alter table public.club_message_audiences enable row level security;
alter table public.club_message_recipients enable row level security;
revoke all on table public.club_messages from public, anon, authenticated;
revoke all on table public.club_message_audiences from public, anon, authenticated;
revoke all on table public.club_message_recipients from public, anon, authenticated;

create or replace function public.protect_club_message_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.club_id is distinct from new.club_id then
    raise exception using errcode = '23514', message = 'club_message_club_immutable';
  end if;

  if old.author_app_account_id is distinct from new.author_app_account_id then
    raise exception using errcode = '23514', message = 'club_message_author_immutable';
  end if;

  if old.created_at is distinct from new.created_at
     or old.published_at is distinct from new.published_at then
    raise exception using errcode = '23514', message = 'club_message_timestamps_immutable';
  end if;

  if old.status = 'deleted' and new.status <> 'deleted' then
    raise exception using errcode = '23514', message = 'deleted_club_message_cannot_be_restored';
  end if;

  new.updated_at := now();
  new.deleted_at := case when new.status = 'deleted' then coalesce(old.deleted_at, now()) end;
  return new;
end;
$$;

create trigger club_messages_protect_update
before update on public.club_messages
for each row execute function public.protect_club_message_update();

create or replace function public.prevent_club_message_hard_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = '42501', message = 'club_message_hard_delete_forbidden';
end;
$$;

create trigger club_messages_prevent_hard_delete
before delete on public.club_messages
for each row execute function public.prevent_club_message_hard_delete();

-- A delivery may only ever change its read state. Moving one to another
-- message or another member would rewrite who was addressed after the fact.
create or replace function public.protect_club_message_recipient_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.message_id is distinct from new.message_id
     or old.membership_id is distinct from new.membership_id
     or old.club_id is distinct from new.club_id
     or old.created_at is distinct from new.created_at then
    raise exception using errcode = '23514', message = 'club_message_recipient_immutable';
  end if;
  return new;
end;
$$;

create trigger club_message_recipients_protect_update
before update on public.club_message_recipients
for each row execute function public.protect_club_message_recipient_update();

-- "An active account with an active membership in this club" already had one
-- definition, written for the board. The message centre asks exactly the same
-- question, so this is a name that reads correctly at both call sites rather
-- than a second copy of the logic.
create or replace function public.current_is_active_club_member(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.current_has_active_board_membership(p_club_id)
$$;

-- The caller's own membership in a club, or null. Delivery is addressed to a
-- membership while the reader is an account, and every message-centre function
-- needs to cross that gap.
create or replace function public.current_club_membership_id(p_club_id uuid)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select membership.id
  from public.app_accounts as account
  join public.club_memberships as membership
    on membership.person_id = account.person_id
   and membership.club_id = p_club_id
   and membership.membership_status = 'active'
  where account.auth_user_id = auth.uid()
    and account.account_status = 'active'
  limit 1
$$;

create or replace function public.my_unread_club_message_count(p_club_id uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select count(*)::integer
  from public.club_message_recipients as recipient
  join public.club_messages as message on message.id = recipient.message_id
  where recipient.club_id = p_club_id
    and recipient.membership_id = public.current_club_membership_id(p_club_id)
    and recipient.read_at is null
    and message.status = 'active'
$$;

create or replace function public.create_club_message(
  p_club_id uuid,
  p_title text,
  p_body text,
  p_tag_ids uuid[] default '{}'::uuid[],
  p_membership_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  normalized_title text := btrim(coalesce(p_title, ''));
  -- The board's whitespace normaliser is not board-specific: it collapses CRLF
  -- and trims the ends of any member-typed text.
  normalized_body text := public.normalize_board_post_content(p_body);
  wanted_tags uuid[] := coalesce(p_tag_ids, '{}'::uuid[]);
  wanted_members uuid[] := coalesce(p_membership_ids, '{}'::uuid[]);
  audience jsonb;
  created_message public.club_messages;
  delivered integer;
  result jsonb;
begin
  -- Sending to the club, or to part of it, is the same authority that decides
  -- who is in a tag; `resolve_club_audience` refuses anyone else in any case.
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'member.manage') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;

  if normalized_title = '' or char_length(normalized_title) > 120 then
    raise exception using errcode = '22023', message = 'invalid_message_title';
  end if;

  if normalized_body is null or normalized_body = '' or char_length(normalized_body) > 4000 then
    raise exception using errcode = '22023', message = 'invalid_message_body';
  end if;

  -- The picker offers tags or named members, never both. Accepting both would
  -- leave "who did this go to" answerable two ways.
  if coalesce(array_length(wanted_tags, 1), 0) > 0
     and coalesce(array_length(wanted_members, 1), 0) > 0 then
    raise exception using errcode = '22023', message = 'invalid_message_audience';
  end if;

  if exists (
    select 1 from unnest(wanted_tags) as requested(tag_id)
    where not exists (
      select 1 from public.club_member_tags as tag
      where tag.id = requested.tag_id
        and tag.club_id = p_club_id
        and tag.tag_status = 'active'
    )
  ) then
    raise exception using errcode = '22023', message = 'invalid_member_tag';
  end if;

  -- Checked rather than left to the audience resolver, which would simply not
  -- match an id from another club: silently sending to fewer people than the
  -- officer named is worse than refusing.
  if exists (
    select 1 from unnest(wanted_members) as requested(membership_id)
    where not exists (
      select 1 from public.club_memberships as membership
      where membership.id = requested.membership_id
        and membership.club_id = p_club_id
        and membership.membership_status = 'active'
    )
  ) then
    raise exception using errcode = '22023', message = 'invalid_message_audience';
  end if;

  audience := public.resolve_club_audience(p_club_id, wanted_tags, wanted_members);

  insert into public.club_messages (club_id, author_app_account_id, title, body, audience_kind)
  values (
    p_club_id,
    actor_id,
    normalized_title,
    normalized_body,
    case
      when coalesce(array_length(wanted_tags, 1), 0) > 0 then 'tags'
      when coalesce(array_length(wanted_members, 1), 0) > 0 then 'members'
      else 'everyone'
    end
  )
  returning * into created_message;

  insert into public.club_message_audiences (message_id, tag_id, club_id)
  select created_message.id, requested.tag_id, p_club_id
  from unnest(wanted_tags) as requested(tag_id);

  -- The sender is left in the audience when they belong to it -- a message to
  -- 全社 did go to them -- but arrives already read, because an unread badge
  -- for something you just wrote yourself is noise.
  insert into public.club_message_recipients (message_id, membership_id, club_id, read_at)
  select created_message.id,
    (addressed ->> 'membership_id')::uuid,
    p_club_id,
    case
      when (addressed ->> 'membership_id')::uuid = public.current_club_membership_id(p_club_id)
      then now()
    end
  from jsonb_array_elements(coalesce(audience -> 'members', '[]'::jsonb)) as addressed;

  get diagnostics delivered = row_count;

  select jsonb_build_object(
    'id', created_message.id,
    'title', created_message.title,
    'body', created_message.body,
    'audience_kind', created_message.audience_kind,
    'published_at', created_message.published_at,
    'author_display_name', account.account_display_name,
    'recipient_count', delivered,
    'read_count', 0,
    'read_at', null
  ) into result
  from public.app_accounts as account
  where account.id = actor_id;

  return result;
end;
$$;

create or replace function public.list_my_club_messages(
  p_club_id uuid,
  p_cursor_published_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  my_membership_id uuid := public.current_club_membership_id(p_club_id);
  result jsonb;
begin
  if not public.current_is_active_club_member(p_club_id) or my_membership_id is null then
    raise exception using errcode = '42501', message = 'active_club_membership_required';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using errcode = '22023', message = 'invalid_message_limit';
  end if;

  if (p_cursor_published_at is null) <> (p_cursor_id is null) then
    raise exception using errcode = '22023', message = 'invalid_message_cursor';
  end if;

  with page as materialized (
    select message.id, message.title, message.body, message.audience_kind,
      message.published_at, recipient.read_at,
      account.account_display_name as author_display_name
    from public.club_message_recipients as recipient
    join public.club_messages as message on message.id = recipient.message_id
    join public.app_accounts as account on account.id = message.author_app_account_id
    where recipient.club_id = p_club_id
      and recipient.membership_id = my_membership_id
      and message.status = 'active'
      and (
        p_cursor_published_at is null
        or message.published_at < p_cursor_published_at
        or (message.published_at = p_cursor_published_at and message.id < p_cursor_id)
      )
    order by message.published_at desc, message.id desc
    limit p_limit + 1
  ), visible as materialized (
    select * from page
    order by published_at desc, id desc
    limit p_limit
  )
  select jsonb_build_object(
    'messages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', visible.id,
          'title', visible.title,
          'body', visible.body,
          'audience_kind', visible.audience_kind,
          'published_at', visible.published_at,
          'author_display_name', visible.author_display_name,
          'read_at', visible.read_at
        ) order by visible.published_at desc, visible.id desc
      )
      from visible
    ), '[]'::jsonb),
    'unread_count', public.my_unread_club_message_count(p_club_id),
    'next_cursor', case
      when (select count(*) from page) > p_limit then (
        select jsonb_build_object('v', 1, 'published_at', visible.published_at, 'id', visible.id)
        from visible
        order by visible.published_at asc, visible.id asc
        limit 1
      )
      else null
    end
  ) into result;

  return result;
end;
$$;

create or replace function public.mark_club_message_read(p_club_id uuid, p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  my_membership_id uuid := public.current_club_membership_id(p_club_id);
  marked timestamptz;
begin
  if not public.current_is_active_club_member(p_club_id) or my_membership_id is null then
    raise exception using errcode = '42501', message = 'active_club_membership_required';
  end if;

  if p_message_id is null then
    raise exception using errcode = '22023', message = 'invalid_message_request';
  end if;

  -- Marking is idempotent: the first read is the one recorded, so opening a
  -- message twice does not move its timestamp.
  update public.club_message_recipients as recipient
  set read_at = coalesce(recipient.read_at, now())
  from public.club_messages as message
  where recipient.message_id = p_message_id
    and recipient.membership_id = my_membership_id
    and recipient.club_id = p_club_id
    and message.id = recipient.message_id
    and message.status = 'active'
  returning recipient.read_at into marked;

  if marked is null then
    raise exception using errcode = 'P0002', message = 'club_message_not_available';
  end if;

  return jsonb_build_object(
    'id', p_message_id,
    'read_at', marked,
    'unread_count', public.my_unread_club_message_count(p_club_id)
  );
end;
$$;

-- Everything the shell needs for an unread badge, in one round trip, for every
-- club the caller belongs to.
create or replace function public.count_my_unread_club_messages()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  with mine as (
    select club.id as club_id, club.club_name,
      public.my_unread_club_message_count(club.id) as unread_count
    from public.app_accounts as account
    join public.club_memberships as membership
      on membership.person_id = account.person_id
     and membership.membership_status = 'active'
    join public.clubs as club on club.id = membership.club_id
    where account.auth_user_id = auth.uid()
      and account.account_status = 'active'
  )
  select jsonb_build_object(
    'total', coalesce((select sum(unread_count) from mine), 0),
    'clubs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'club_id', club_id,
        'club_name', club_name,
        'unread_count', unread_count
      ) order by club_name)
      from mine
    ), '[]'::jsonb)
  )
$$;

-- The officer's side: who it reached and who has opened it. Names are shown
-- because the point is to know whether the club has actually seen something,
-- which an aggregate count cannot answer.
create or replace function public.list_club_message_deliveries(p_club_id uuid, p_message_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  result jsonb;
begin
  if public.current_app_account_id() is null
     or not public.current_has_club_permission(p_club_id, 'member.manage') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;

  if not exists (
    select 1 from public.club_messages as message
    where message.id = p_message_id
      and message.club_id = p_club_id
      and message.status = 'active'
  ) then
    raise exception using errcode = 'P0002', message = 'club_message_not_available';
  end if;

  select jsonb_build_object(
    'message_id', p_message_id,
    'recipient_count', count(*),
    'read_count', count(*) filter (where recipient.read_at is not null),
    'recipients', coalesce(jsonb_agg(jsonb_build_object(
      'membership_id', recipient.membership_id,
      'display_name', person.canonical_name,
      'read_at', recipient.read_at
    ) order by recipient.read_at nulls first, person.canonical_name), '[]'::jsonb)
  ) into result
  from public.club_message_recipients as recipient
  join public.club_memberships as membership on membership.id = recipient.membership_id
  join public.people as person on person.id = membership.person_id
  where recipient.message_id = p_message_id
    and recipient.club_id = p_club_id;

  return result;
end;
$$;

-- Sent messages, for the officer who has to decide whether to send another.
create or replace function public.list_club_sent_messages(p_club_id uuid, p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  result jsonb;
begin
  if public.current_app_account_id() is null
     or not public.current_has_club_permission(p_club_id, 'member.manage') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using errcode = '22023', message = 'invalid_message_limit';
  end if;

  select coalesce(jsonb_agg(sent order by sent.published_at desc, sent.id desc), '[]'::jsonb)
  into result
  from (
    select message.id, message.title, message.body, message.audience_kind, message.published_at,
      account.account_display_name as author_display_name,
      (select count(*) from public.club_message_recipients as recipient
        where recipient.message_id = message.id) as recipient_count,
      (select count(*) from public.club_message_recipients as recipient
        where recipient.message_id = message.id and recipient.read_at is not null) as read_count,
      coalesce((
        select jsonb_agg(tag.tag_name order by tag.tag_name)
        from public.club_message_audiences as addressed
        join public.club_member_tags as tag on tag.id = addressed.tag_id
        where addressed.message_id = message.id
      ), '[]'::jsonb) as audience_tag_names
    from public.club_messages as message
    join public.app_accounts as account on account.id = message.author_app_account_id
    where message.club_id = p_club_id
      and message.status = 'active'
    order by message.published_at desc, message.id desc
    limit p_limit
  ) as sent;

  return result;
end;
$$;

create or replace function public.delete_club_message(p_club_id uuid, p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if public.current_app_account_id() is null
     or not public.current_has_club_permission(p_club_id, 'member.manage') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;

  if p_message_id is null then
    raise exception using errcode = '22023', message = 'invalid_message_request';
  end if;

  -- Withdrawn rather than erased: the delivery rows stay, so a message that
  -- was read cannot later be made to look as though it was never sent.
  update public.club_messages
  set status = 'deleted', deleted_at = now()
  where id = p_message_id
    and club_id = p_club_id
    and status = 'active';

  if not found then
    raise exception using errcode = 'P0002', message = 'club_message_not_available';
  end if;
end;
$$;

revoke all on function public.protect_club_message_update() from public, anon, authenticated;
revoke all on function public.prevent_club_message_hard_delete() from public, anon, authenticated;
revoke all on function public.protect_club_message_recipient_update() from public, anon, authenticated;
revoke all on function public.current_is_active_club_member(uuid) from public, anon, authenticated;
revoke all on function public.current_club_membership_id(uuid) from public, anon, authenticated;
revoke all on function public.my_unread_club_message_count(uuid) from public, anon, authenticated;
revoke all on function public.create_club_message(uuid, text, text, uuid[], uuid[]) from public, anon, authenticated;
revoke all on function public.list_my_club_messages(uuid, timestamptz, uuid, integer) from public, anon, authenticated;
revoke all on function public.mark_club_message_read(uuid, uuid) from public, anon, authenticated;
revoke all on function public.count_my_unread_club_messages() from public, anon, authenticated;
revoke all on function public.list_club_message_deliveries(uuid, uuid) from public, anon, authenticated;
revoke all on function public.list_club_sent_messages(uuid, integer) from public, anon, authenticated;
revoke all on function public.delete_club_message(uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_club_message(uuid, text, text, uuid[], uuid[]) to authenticated;
grant execute on function public.list_my_club_messages(uuid, timestamptz, uuid, integer) to authenticated;
grant execute on function public.mark_club_message_read(uuid, uuid) to authenticated;
grant execute on function public.count_my_unread_club_messages() to authenticated;
grant execute on function public.list_club_message_deliveries(uuid, uuid) to authenticated;
grant execute on function public.list_club_sent_messages(uuid, integer) to authenticated;
grant execute on function public.delete_club_message(uuid, uuid) to authenticated;

commit;
