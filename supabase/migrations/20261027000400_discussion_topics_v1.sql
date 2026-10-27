begin;

insert into public.permissions (permission_key, description_zh_hant)
values ('discussion.manage', '發佈議題、選擇參與對象並查看具名投票')
on conflict (permission_key) do nothing;

insert into public.role_permissions (role_key, permission_key)
select granted.role_key, 'discussion.manage'
from public.role_permissions as granted
where granted.permission_key = 'member.manage'
on conflict (role_key, permission_key) do nothing;

create table public.club_discussion_topics (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  title text not null,
  description text not null,
  deadline_at timestamptz not null,
  audience_kind text not null,
  anonymous_votes boolean not null default true,
  created_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  constraint club_discussion_topics_title_check check (char_length(btrim(title)) between 2 and 120),
  constraint club_discussion_topics_description_check check (char_length(btrim(description)) between 1 and 5000),
  constraint club_discussion_topics_audience_check check (audience_kind in ('all', 'tags', 'people')),
  constraint club_discussion_topics_id_club_unique unique (id, club_id)
);

create index club_discussion_topics_club_deadline_idx
  on public.club_discussion_topics (club_id, deadline_at, created_at desc);

create table public.club_discussion_topic_tags (
  topic_id uuid not null,
  tag_id uuid not null,
  club_id uuid not null references public.clubs(id) on delete restrict,
  primary key (topic_id, tag_id),
  constraint club_discussion_topic_tags_topic_fkey
    foreign key (topic_id, club_id)
    references public.club_discussion_topics (id, club_id) on delete restrict,
  constraint club_discussion_topic_tags_tag_fkey
    foreign key (tag_id, club_id)
    references public.club_member_tags (id, club_id) on delete restrict
);

create table public.club_discussion_topic_recipients (
  topic_id uuid not null,
  membership_id uuid not null,
  club_id uuid not null references public.clubs(id) on delete restrict,
  primary key (topic_id, membership_id),
  constraint club_discussion_topic_recipients_topic_fkey
    foreign key (topic_id, club_id)
    references public.club_discussion_topics (id, club_id) on delete restrict,
  constraint club_discussion_topic_recipients_membership_fkey
    foreign key (membership_id, club_id)
    references public.club_memberships (id, club_id) on delete restrict
);

create table public.club_discussion_topic_options (
  id uuid primary key default extensions.gen_random_uuid(),
  topic_id uuid not null,
  club_id uuid not null references public.clubs(id) on delete restrict,
  option_order integer not null,
  option_text text not null,
  constraint club_discussion_topic_options_text_check check (char_length(btrim(option_text)) between 1 and 100),
  constraint club_discussion_topic_options_order_check check (option_order between 1 and 8),
  constraint club_discussion_topic_options_topic_fkey
    foreign key (topic_id, club_id)
    references public.club_discussion_topics (id, club_id) on delete restrict,
  constraint club_discussion_topic_options_id_topic_club_unique unique (id, topic_id, club_id),
  constraint club_discussion_topic_options_order_unique unique (topic_id, option_order)
);

create table public.club_discussion_topic_comments (
  id uuid primary key default extensions.gen_random_uuid(),
  topic_id uuid not null,
  club_id uuid not null references public.clubs(id) on delete restrict,
  membership_id uuid not null,
  author_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  body text not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint club_discussion_topic_comments_body_check check (char_length(btrim(body)) between 1 and 2000),
  constraint club_discussion_topic_comments_topic_fkey
    foreign key (topic_id, club_id)
    references public.club_discussion_topics (id, club_id) on delete restrict,
  constraint club_discussion_topic_comments_membership_fkey
    foreign key (membership_id, club_id)
    references public.club_memberships (id, club_id) on delete restrict
);

create index club_discussion_topic_comments_thread_idx
  on public.club_discussion_topic_comments (topic_id, created_at, id);

create table public.club_discussion_topic_votes (
  topic_id uuid not null,
  club_id uuid not null references public.clubs(id) on delete restrict,
  membership_id uuid not null,
  option_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (topic_id, membership_id),
  constraint club_discussion_topic_votes_topic_fkey
    foreign key (topic_id, club_id)
    references public.club_discussion_topics (id, club_id) on delete restrict,
  constraint club_discussion_topic_votes_membership_fkey
    foreign key (membership_id, club_id)
    references public.club_memberships (id, club_id) on delete restrict,
  constraint club_discussion_topic_votes_option_fkey
    foreign key (option_id, topic_id, club_id)
    references public.club_discussion_topic_options (id, topic_id, club_id) on delete restrict
);

create index club_discussion_topic_votes_option_idx
  on public.club_discussion_topic_votes (topic_id, option_id);

alter table public.club_discussion_topics enable row level security;
alter table public.club_discussion_topic_tags enable row level security;
alter table public.club_discussion_topic_recipients enable row level security;
alter table public.club_discussion_topic_options enable row level security;
alter table public.club_discussion_topic_comments enable row level security;
alter table public.club_discussion_topic_votes enable row level security;

revoke all on table public.club_discussion_topics from public, anon, authenticated;
revoke all on table public.club_discussion_topic_tags from public, anon, authenticated;
revoke all on table public.club_discussion_topic_recipients from public, anon, authenticated;
revoke all on table public.club_discussion_topic_options from public, anon, authenticated;
revoke all on table public.club_discussion_topic_comments from public, anon, authenticated;
revoke all on table public.club_discussion_topic_votes from public, anon, authenticated;

-- Internal audience check: all audiences are evaluated inside a narrow
-- security-definer RPC. Tag targeting follows the club's existing live-tag
-- convention; named-member targeting remains explicit and club-scoped.
create or replace function public.discussion_topic_includes_membership(
  p_topic_id uuid,
  p_club_id uuid,
  p_membership_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.club_discussion_topics as topic
    join public.club_memberships as membership
      on membership.id = p_membership_id
     and membership.club_id = topic.club_id
     and membership.membership_status = 'active'
    join public.clubs as club
      on club.id = topic.club_id and club.club_status = 'active'
    where topic.id = p_topic_id
      and topic.club_id = p_club_id
      and case topic.audience_kind
        when 'all' then true
        when 'tags' then exists (
          select 1
          from public.club_discussion_topic_tags as audience
          join public.club_membership_tags as assignment
            on assignment.tag_id = audience.tag_id
           and assignment.membership_id = membership.id
           and assignment.club_id = topic.club_id
          join public.club_member_tags as tag
            on tag.id = audience.tag_id
           and tag.club_id = topic.club_id
          where audience.topic_id = topic.id
            and audience.club_id = topic.club_id
        )
        when 'people' then exists (
          select 1
          from public.club_discussion_topic_recipients as recipient
          where recipient.topic_id = topic.id
            and recipient.club_id = topic.club_id
            and recipient.membership_id = membership.id
        )
        else false
      end
  )
$$;

revoke all on function public.discussion_topic_includes_membership(uuid, uuid, uuid)
  from public, anon, authenticated;

-- The only projection that can contain ballot identities. It is called with
-- false by the member RPC and with true only by the management RPC. Anonymous
-- ballots are never joined to names, even for a manager.
create or replace function public.discussion_topic_projection(
  p_club_id uuid,
  p_topic_id uuid,
  p_membership_id uuid,
  p_include_named_votes boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'id', topic.id,
    'club_id', topic.club_id,
    'title', topic.title,
    'description', topic.description,
    'deadline_at', topic.deadline_at,
    'audience_kind', topic.audience_kind,
    'anonymous_votes', topic.anonymous_votes,
    'created_at', topic.created_at,
    'is_open', topic.deadline_at > statement_timestamp(),
    'vote_count', (
      select count(*)::integer
      from public.club_discussion_topic_votes as ballot
      where ballot.topic_id = topic.id and ballot.club_id = topic.club_id
    ),
    'comment_count', (
      select count(*)::integer
      from public.club_discussion_topic_comments as comment
      where comment.topic_id = topic.id and comment.club_id = topic.club_id
    ),
    'my_vote_option_id', (
      select ballot.option_id
      from public.club_discussion_topic_votes as ballot
      where ballot.topic_id = topic.id
        and ballot.club_id = topic.club_id
        and ballot.membership_id = p_membership_id
    ),
    'options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', option.id,
        'label', option.option_text,
        'vote_count', (
          select count(*)::integer
          from public.club_discussion_topic_votes as ballot
          where ballot.topic_id = option.topic_id
            and ballot.club_id = option.club_id
            and ballot.option_id = option.id
        )
      ) order by option.option_order)
      from public.club_discussion_topic_options as option
      where option.topic_id = topic.id and option.club_id = topic.club_id
    ), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', visible.id,
        'body', visible.body,
        'author_display_name', visible.author_display_name,
        'created_at', visible.created_at
      ) order by visible.created_at, visible.id)
      from (
        select comment.id, comment.body, comment.created_at,
          coalesce(nullif(account.account_display_name, ''), person.canonical_name) as author_display_name
        from public.club_discussion_topic_comments as comment
        join public.club_memberships as membership
          on membership.id = comment.membership_id
         and membership.club_id = comment.club_id
         and membership.membership_status = 'active'
        join public.people as person on person.id = membership.person_id
        left join public.app_accounts as account on account.id = comment.author_app_account_id
        where comment.topic_id = topic.id and comment.club_id = topic.club_id
        order by comment.created_at desc, comment.id desc
        limit 200
      ) as visible
    ), '[]'::jsonb),
    'named_votes', case
      when p_include_named_votes and not topic.anonymous_votes then coalesce((
        select jsonb_agg(jsonb_build_object(
          'membership_id', ballot.membership_id,
          'display_name', person.canonical_name,
          'option_id', ballot.option_id,
          'option_text', option.option_text
        ) order by person.canonical_name, ballot.membership_id)
        from public.club_discussion_topic_votes as ballot
        join public.club_memberships as membership
          on membership.id = ballot.membership_id
         and membership.club_id = ballot.club_id
         and membership.membership_status = 'active'
        join public.people as person on person.id = membership.person_id
        join public.club_discussion_topic_options as option
          on option.id = ballot.option_id
         and option.topic_id = ballot.topic_id
         and option.club_id = ballot.club_id
        where ballot.topic_id = topic.id and ballot.club_id = topic.club_id
      ), '[]'::jsonb)
      else '[]'::jsonb
    end
  ) into result
  from public.club_discussion_topics as topic
  where topic.id = p_topic_id and topic.club_id = p_club_id;

  return result;
end;
$$;

revoke all on function public.discussion_topic_projection(uuid, uuid, uuid, boolean)
  from public, anon, authenticated;

create or replace function public.create_club_discussion_topic(
  p_club_id uuid,
  p_title text,
  p_description text,
  p_deadline_at timestamptz,
  p_audience_kind text,
  p_tag_ids uuid[],
  p_membership_ids uuid[],
  p_anonymous_votes boolean,
  p_options jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  topic_id uuid;
begin
  if actor_id is null
    or not public.current_has_club_permission(p_club_id, 'discussion.manage') then
    raise exception using errcode = '42501', message = 'discussion_manage_required';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 2 and 120
    or p_description is null or char_length(btrim(p_description)) not between 1 and 5000
    or p_deadline_at is null
    or p_deadline_at <= statement_timestamp()
    or p_deadline_at > statement_timestamp() + interval '365 days'
    or p_audience_kind not in ('all', 'tags', 'people')
    or p_tag_ids is null or p_membership_ids is null
    or p_anonymous_votes is null
    or p_options is null or jsonb_typeof(p_options) <> 'array'
    or jsonb_array_length(p_options) not between 2 and 8 then
    raise exception using errcode = '22023', message = 'invalid_discussion_topic';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_options) as value(item)
    where jsonb_typeof(value.item) <> 'string'
      or char_length(btrim(value.item #>> '{}')) not between 1 and 100
  ) or (
    select count(distinct lower(btrim(value)))
    from jsonb_array_elements_text(p_options) as option_value(value)
  ) <> jsonb_array_length(p_options) then
    raise exception using errcode = '22023', message = 'invalid_discussion_options';
  end if;

  if p_audience_kind = 'all' then
    if cardinality(p_tag_ids) <> 0 or cardinality(p_membership_ids) <> 0 then
      raise exception using errcode = '22023', message = 'invalid_discussion_audience';
    end if;
  elsif p_audience_kind = 'tags' then
    if cardinality(p_tag_ids) not between 1 and 20 or cardinality(p_membership_ids) <> 0
      or (select count(distinct selected.id) from unnest(p_tag_ids) as selected(id)) <> cardinality(p_tag_ids)
      or exists (
        select 1 from unnest(p_tag_ids) as selected(id)
        left join public.club_member_tags as tag
          on tag.id = selected.id and tag.club_id = p_club_id and tag.tag_status = 'active'
        where tag.id is null
      ) then
      raise exception using errcode = '22023', message = 'invalid_discussion_audience';
    end if;
  elsif p_audience_kind = 'people' then
    if cardinality(p_membership_ids) not between 1 and 100 or cardinality(p_tag_ids) <> 0
      or (select count(distinct selected.id) from unnest(p_membership_ids) as selected(id)) <> cardinality(p_membership_ids)
      or exists (
        select 1 from unnest(p_membership_ids) as selected(id)
        left join public.club_memberships as membership
          on membership.id = selected.id
         and membership.club_id = p_club_id
         and membership.membership_status = 'active'
        where membership.id is null
      ) then
      raise exception using errcode = '22023', message = 'invalid_discussion_audience';
    end if;
  end if;

  insert into public.club_discussion_topics (
    club_id, title, description, deadline_at, audience_kind,
    anonymous_votes, created_by_app_account_id
  ) values (
    p_club_id, btrim(p_title), btrim(p_description), p_deadline_at,
    p_audience_kind, p_anonymous_votes, actor_id
  ) returning id into topic_id;

  if p_audience_kind = 'tags' then
    insert into public.club_discussion_topic_tags (topic_id, tag_id, club_id)
    select topic_id, selected.id, p_club_id from unnest(p_tag_ids) as selected(id);
  elsif p_audience_kind = 'people' then
    insert into public.club_discussion_topic_recipients (topic_id, membership_id, club_id)
    select topic_id, selected.id, p_club_id from unnest(p_membership_ids) as selected(id);
  end if;

  insert into public.club_discussion_topic_options (topic_id, club_id, option_order, option_text)
  select topic_id, p_club_id, value.ordinality::integer, btrim(value.option_text)
  from jsonb_array_elements_text(p_options) with ordinality as value(option_text, ordinality);

  return jsonb_build_object('id', topic_id, 'club_id', p_club_id);
end;
$$;

create or replace function public.list_my_club_discussion_topics(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  active_membership_id uuid;
  result jsonb;
begin
  select membership.id into active_membership_id
  from public.app_accounts as account
  join public.club_memberships as membership on membership.person_id = account.person_id
  join public.clubs as club on club.id = membership.club_id
  where account.id = actor_id and account.auth_user_id = auth.uid()
    and account.account_status = 'active'
    and membership.club_id = p_club_id and membership.membership_status = 'active'
    and club.club_status = 'active';
  if actor_id is null or active_membership_id is null then
    raise exception using errcode = '42501', message = 'active_discussion_membership_required';
  end if;

  select jsonb_build_object('club_id', p_club_id, 'topics', coalesce(jsonb_agg(
    jsonb_build_object(
      'id', topic.id,
      'club_id', topic.club_id,
      'title', topic.title,
      'description', topic.description,
      'deadline_at', topic.deadline_at,
      'audience_kind', topic.audience_kind,
      'anonymous_votes', topic.anonymous_votes,
      'created_at', topic.created_at,
      'is_open', topic.deadline_at > statement_timestamp(),
      'has_voted', exists (
        select 1 from public.club_discussion_topic_votes as ballot
        where ballot.topic_id = topic.id and ballot.club_id = topic.club_id
          and ballot.membership_id = active_membership_id
      ),
      'vote_count', (select count(*)::integer from public.club_discussion_topic_votes as ballot
        where ballot.topic_id = topic.id and ballot.club_id = topic.club_id),
      'comment_count', (select count(*)::integer from public.club_discussion_topic_comments as comment
        where comment.topic_id = topic.id and comment.club_id = topic.club_id)
    ) order by topic.deadline_at, topic.created_at desc, topic.id
  ), '[]'::jsonb)) into result
  from public.club_discussion_topics as topic
  where topic.club_id = p_club_id
    and public.discussion_topic_includes_membership(topic.id, p_club_id, active_membership_id);

  return result;
end;
$$;

create or replace function public.get_my_club_discussion_topic(p_club_id uuid, p_topic_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  active_membership_id uuid;
begin
  select membership.id into active_membership_id
  from public.app_accounts as account
  join public.club_memberships as membership on membership.person_id = account.person_id
  join public.clubs as club on club.id = membership.club_id
  where account.id = actor_id and account.auth_user_id = auth.uid()
    and account.account_status = 'active'
    and membership.club_id = p_club_id and membership.membership_status = 'active'
    and club.club_status = 'active';
  if actor_id is null or active_membership_id is null then
    raise exception using errcode = '42501', message = 'active_discussion_membership_required';
  end if;
  if not public.discussion_topic_includes_membership(p_topic_id, p_club_id, active_membership_id) then
    return null;
  end if;
  return public.discussion_topic_projection(p_club_id, p_topic_id, active_membership_id, false);
end;
$$;

create or replace function public.list_club_discussion_topics(p_club_id uuid)
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
     or not public.current_has_club_permission(p_club_id, 'discussion.manage') then
    raise exception using errcode = '42501', message = 'discussion_manage_required';
  end if;
  select jsonb_build_object('club_id', p_club_id, 'topics', coalesce(jsonb_agg(
    jsonb_build_object(
      'id', topic.id,
      'club_id', topic.club_id,
      'title', topic.title,
      'description', topic.description,
      'deadline_at', topic.deadline_at,
      'audience_kind', topic.audience_kind,
      'anonymous_votes', topic.anonymous_votes,
      'created_at', topic.created_at,
      'is_open', topic.deadline_at > statement_timestamp(),
      'vote_count', (select count(*)::integer from public.club_discussion_topic_votes as ballot
        where ballot.topic_id = topic.id and ballot.club_id = topic.club_id),
      'comment_count', (select count(*)::integer from public.club_discussion_topic_comments as comment
        where comment.topic_id = topic.id and comment.club_id = topic.club_id),
      'audience_count', case topic.audience_kind
        when 'all' then (select count(*)::integer from public.club_memberships as member
          where member.club_id = topic.club_id and member.membership_status = 'active')
        when 'tags' then (select count(distinct assignment.membership_id)::integer
          from public.club_discussion_topic_tags as audience
          join public.club_membership_tags as assignment
            on assignment.tag_id = audience.tag_id and assignment.club_id = audience.club_id
          join public.club_memberships as member
            on member.id = assignment.membership_id and member.club_id = topic.club_id
             and member.membership_status = 'active'
          where audience.topic_id = topic.id and audience.club_id = topic.club_id)
        else (select count(*)::integer from public.club_discussion_topic_recipients as recipient
          join public.club_memberships as member on member.id = recipient.membership_id
            and member.club_id = recipient.club_id and member.membership_status = 'active'
          where recipient.topic_id = topic.id and recipient.club_id = topic.club_id)
      end,
      'audience_tags', coalesce((select jsonb_agg(tag.tag_name order by tag.tag_name)
        from public.club_discussion_topic_tags as audience
        join public.club_member_tags as tag on tag.id = audience.tag_id and tag.club_id = audience.club_id
        where audience.topic_id = topic.id and audience.club_id = topic.club_id), '[]'::jsonb)
    ) order by topic.created_at desc, topic.id
  ), '[]'::jsonb)) into result
  from public.club_discussion_topics as topic
  where topic.club_id = p_club_id;
  return result;
end;
$$;

create or replace function public.get_club_discussion_topic(p_club_id uuid, p_topic_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if public.current_app_account_id() is null
     or not public.current_has_club_permission(p_club_id, 'discussion.manage') then
    raise exception using errcode = '42501', message = 'discussion_manage_required';
  end if;
  if not exists (
    select 1 from public.club_discussion_topics as topic
    where topic.id = p_topic_id and topic.club_id = p_club_id
  ) then
    return null;
  end if;
  return public.discussion_topic_projection(p_club_id, p_topic_id, null, true);
end;
$$;

create or replace function public.add_club_discussion_comment(
  p_club_id uuid,
  p_topic_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  active_membership_id uuid;
  comment_id uuid;
  result jsonb;
begin
  select membership.id into active_membership_id
  from public.app_accounts as account
  join public.club_memberships as membership on membership.person_id = account.person_id
  join public.clubs as club on club.id = membership.club_id
  where account.id = actor_id and account.auth_user_id = auth.uid()
    and account.account_status = 'active'
    and membership.club_id = p_club_id and membership.membership_status = 'active'
    and club.club_status = 'active';
  if actor_id is null or active_membership_id is null then
    raise exception using errcode = '42501', message = 'active_discussion_membership_required';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'invalid_discussion_comment';
  end if;
  if not public.discussion_topic_includes_membership(p_topic_id, p_club_id, active_membership_id)
    or not exists (select 1 from public.club_discussion_topics as topic
      where topic.id = p_topic_id and topic.club_id = p_club_id
        and topic.deadline_at > statement_timestamp()) then
    raise exception using errcode = 'P0002', message = 'discussion_topic_unavailable';
  end if;
  insert into public.club_discussion_topic_comments (
    topic_id, club_id, membership_id, author_app_account_id, body
  ) values (p_topic_id, p_club_id, active_membership_id, actor_id, btrim(p_body))
  returning id into comment_id;
  select jsonb_build_object(
    'id', comment.id,
    'body', comment.body,
    'author_display_name', coalesce(nullif(account.account_display_name, ''), person.canonical_name),
    'created_at', comment.created_at
  ) into result
  from public.club_discussion_topic_comments as comment
  join public.app_accounts as account on account.id = comment.author_app_account_id
  join public.people as person on person.id = account.person_id
  where comment.id = comment_id and comment.club_id = p_club_id;
  return result;
end;
$$;

create or replace function public.cast_club_discussion_vote(
  p_club_id uuid,
  p_topic_id uuid,
  p_option_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  active_membership_id uuid;
begin
  select membership.id into active_membership_id
  from public.app_accounts as account
  join public.club_memberships as membership on membership.person_id = account.person_id
  join public.clubs as club on club.id = membership.club_id
  where account.id = actor_id and account.auth_user_id = auth.uid()
    and account.account_status = 'active'
    and membership.club_id = p_club_id and membership.membership_status = 'active'
    and club.club_status = 'active';
  if actor_id is null or active_membership_id is null then
    raise exception using errcode = '42501', message = 'active_discussion_membership_required';
  end if;
  if not public.discussion_topic_includes_membership(p_topic_id, p_club_id, active_membership_id)
    or not exists (select 1 from public.club_discussion_topics as topic
      where topic.id = p_topic_id and topic.club_id = p_club_id
        and topic.deadline_at > statement_timestamp()) then
    raise exception using errcode = 'P0002', message = 'discussion_topic_unavailable';
  end if;
  if not exists (select 1 from public.club_discussion_topic_options as option
    where option.id = p_option_id and option.topic_id = p_topic_id and option.club_id = p_club_id) then
    raise exception using errcode = '22023', message = 'invalid_discussion_vote_option';
  end if;
  insert into public.club_discussion_topic_votes (
    topic_id, club_id, membership_id, option_id
  ) values (p_topic_id, p_club_id, active_membership_id, p_option_id)
  on conflict (topic_id, membership_id) do update
    set option_id = excluded.option_id,
        updated_at = statement_timestamp();
  return public.discussion_topic_projection(p_club_id, p_topic_id, active_membership_id, false);
end;
$$;

revoke all on function public.create_club_discussion_topic(uuid, text, text, timestamptz, text, uuid[], uuid[], boolean, jsonb)
  from public, anon;
revoke all on function public.list_my_club_discussion_topics(uuid)
  from public, anon;
revoke all on function public.get_my_club_discussion_topic(uuid, uuid)
  from public, anon;
revoke all on function public.list_club_discussion_topics(uuid)
  from public, anon;
revoke all on function public.get_club_discussion_topic(uuid, uuid)
  from public, anon;
revoke all on function public.add_club_discussion_comment(uuid, uuid, text)
  from public, anon;
revoke all on function public.cast_club_discussion_vote(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.create_club_discussion_topic(uuid, text, text, timestamptz, text, uuid[], uuid[], boolean, jsonb)
  to authenticated;
grant execute on function public.list_my_club_discussion_topics(uuid)
  to authenticated;
grant execute on function public.get_my_club_discussion_topic(uuid, uuid)
  to authenticated;
grant execute on function public.list_club_discussion_topics(uuid)
  to authenticated;
grant execute on function public.get_club_discussion_topic(uuid, uuid)
  to authenticated;
grant execute on function public.add_club_discussion_comment(uuid, uuid, text)
  to authenticated;
grant execute on function public.cast_club_discussion_vote(uuid, uuid, uuid)
  to authenticated;

-- Keep the member-home and paginated task centre projections canonical: add
-- the same outstanding-vote task to both current database definitions while
-- preserving all previous task logic byte-for-byte.
do $migration$
declare
  target_signature text;
  function_definition text;
  cte_marker text := '  ), candidate_tasks as (';
  cte_replacement text := $discussion_cte$
  ), discussion_topic_actionable as (
    select topic.id as topic_id, topic.title, topic.deadline_at
    from public.club_discussion_topics as topic
    where topic.club_id = p_club_id
      and topic.deadline_at > statement_timestamp()
      and public.discussion_topic_includes_membership(topic.id, p_club_id, active_membership_id)
      and not exists (
        select 1 from public.club_discussion_topic_votes as ballot
        where ballot.topic_id = topic.id
          and ballot.club_id = topic.club_id
          and ballot.membership_id = active_membership_id
      )
    order by topic.deadline_at, topic.id
    limit case when p_all_tasks then null::integer else 5 end
  ), candidate_tasks as (
  $discussion_cte$;
  counted_marker text := '  ), counted as (';
  counted_replacement text := $discussion_union$
    union all
    select
      6,
      task.deadline_at,
      task.title,
      task.topic_id::text,
      jsonb_build_object(
        'task_id', task.topic_id::text,
        'kind', 'topic_discussion',
        'title', '待完成議題投票',
        'detail', concat_ws(' · ', task.title,
          '截止 ' || pg_catalog.to_char(task.deadline_at at time zone 'Asia/Taipei', 'YYYY-MM-DD HH24:MI')),
        'action_path', concat('/topics/', task.topic_id::text,
          '?clubId=', p_club_id::text, '&mode=member'),
        'deadline', task.deadline_at,
        'hours_remaining', greatest(0, floor(extract(epoch from (
          task.deadline_at - statement_timestamp()
        )) / 3600)::integer),
        'count', null
      )
    from discussion_topic_actionable as task
  ), counted as (
  $discussion_union$;
begin
  foreach target_signature in array array[
    'public.list_my_member_pending_tasks(uuid,integer,integer,boolean)',
    'public.list_my_member_pending_tasks_with_joy_tasks(uuid,integer,integer,boolean,boolean)'
  ] loop
    select pg_catalog.pg_get_functiondef(target_signature::regprocedure)
      into function_definition;
    if function_definition like '%discussion_topic_actionable%'
       or function_definition like '%topic_discussion%' then
      raise exception 'discussion topic task already exists in %', target_signature;
    end if;
    if pg_catalog.length(function_definition)
        - pg_catalog.length(pg_catalog.replace(function_definition, cte_marker, ''))
        <> pg_catalog.length(cte_marker)
      or pg_catalog.length(function_definition)
        - pg_catalog.length(pg_catalog.replace(function_definition, counted_marker, ''))
        <> pg_catalog.length(counted_marker) then
      raise exception 'could not uniquely locate task projection insertion points in %', target_signature;
    end if;
    function_definition := pg_catalog.replace(function_definition, cte_marker, cte_replacement);
    function_definition := pg_catalog.replace(function_definition, counted_marker, counted_replacement);
    execute function_definition;
  end loop;
end;
$migration$;

do $verify$
declare
  core_definition text;
  full_definition text;
begin
  core_definition := pg_catalog.pg_get_functiondef(
    'public.list_my_member_pending_tasks(uuid,integer,integer,boolean)'::regprocedure
  );
  full_definition := pg_catalog.pg_get_functiondef(
    'public.list_my_member_pending_tasks_with_joy_tasks(uuid,integer,integer,boolean,boolean)'::regprocedure
  );
  if core_definition not like '%discussion_topic_actionable%'
     or core_definition not like '%topic_discussion%'
     or full_definition not like '%discussion_topic_actionable%'
     or full_definition not like '%topic_discussion%' then
    raise exception 'discussion topic tasks were not added to both member task projections';
  end if;
end;
$verify$;

commit;
