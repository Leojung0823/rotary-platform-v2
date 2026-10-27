begin;

alter table public.club_discussion_topics
  add column updated_at timestamptz not null default statement_timestamp(),
  add column updated_by_app_account_id uuid references public.app_accounts(id) on delete restrict,
  add column deleted_at timestamptz,
  add column deleted_by_app_account_id uuid references public.app_accounts(id) on delete restrict;

create index club_discussion_topics_active_club_deadline_idx
  on public.club_discussion_topics (club_id, deadline_at, created_at desc)
  where deleted_at is null;

-- Deleted topics are hidden from every member projection that calls this
-- internal audience predicate, including the outstanding-vote task list.
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
      and topic.deleted_at is null
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
  where topic.club_id = p_club_id and topic.deleted_at is null;
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
    where topic.id = p_topic_id and topic.club_id = p_club_id and topic.deleted_at is null
  ) then
    return null;
  end if;
  return public.discussion_topic_projection(p_club_id, p_topic_id, null, true);
end;
$$;

create or replace function public.get_club_discussion_topic_edit(
  p_club_id uuid,
  p_topic_id uuid
)
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

  select jsonb_build_object(
    'id', topic.id,
    'club_id', topic.club_id,
    'title', topic.title,
    'description', topic.description,
    'deadline_at', topic.deadline_at,
    'audience_kind', topic.audience_kind,
    'anonymous_votes', topic.anonymous_votes,
    'options', coalesce((
      select jsonb_agg(jsonb_build_object('id', option.id, 'label', option.option_text)
        order by option.option_order)
      from public.club_discussion_topic_options as option
      where option.topic_id = topic.id and option.club_id = topic.club_id
    ), '[]'::jsonb),
    'audience_tag_ids', coalesce((
      select jsonb_agg(audience.tag_id order by audience.tag_id)
      from public.club_discussion_topic_tags as audience
      where audience.topic_id = topic.id and audience.club_id = topic.club_id
    ), '[]'::jsonb),
    'audience_membership_ids', coalesce((
      select jsonb_agg(recipient.membership_id order by recipient.membership_id)
      from public.club_discussion_topic_recipients as recipient
      where recipient.topic_id = topic.id and recipient.club_id = topic.club_id
    ), '[]'::jsonb),
    'vote_count', (select count(*)::integer from public.club_discussion_topic_votes as ballot
      where ballot.topic_id = topic.id and ballot.club_id = topic.club_id),
    'comment_count', (select count(*)::integer from public.club_discussion_topic_comments as comment
      where comment.topic_id = topic.id and comment.club_id = topic.club_id)
  ) into result
  from public.club_discussion_topics as topic
  where topic.id = p_topic_id and topic.club_id = p_club_id and topic.deleted_at is null;

  return result;
end;
$$;

create or replace function public.update_club_discussion_topic(
  p_club_id uuid,
  p_topic_id uuid,
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
  current_topic public.club_discussion_topics%rowtype;
  has_activity boolean;
  stored_tag_count integer;
  stored_recipient_count integer;
  stored_options jsonb;
begin
  if actor_id is null
     or not public.current_has_club_permission(p_club_id, 'discussion.manage') then
    raise exception using errcode = '42501', message = 'discussion_manage_required';
  end if;

  select topic.* into current_topic
  from public.club_discussion_topics as topic
  where topic.id = p_topic_id and topic.club_id = p_club_id and topic.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'discussion_topic_unavailable';
  end if;

  if p_title is null or char_length(btrim(p_title)) not between 2 and 120
    or p_description is null or char_length(btrim(p_description)) not between 1 and 5000
    or p_deadline_at is null or p_deadline_at > statement_timestamp() + interval '365 days'
    or p_audience_kind is null or p_audience_kind not in ('all', 'tags', 'people')
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
      or exists (select 1 from unnest(p_tag_ids) as selected(id) where selected.id is null)
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
      or exists (select 1 from unnest(p_membership_ids) as selected(id) where selected.id is null)
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

  select count(*)::integer into stored_tag_count
  from public.club_discussion_topic_tags as audience
  where audience.topic_id = p_topic_id and audience.club_id = p_club_id;
  select count(*)::integer into stored_recipient_count
  from public.club_discussion_topic_recipients as recipient
  where recipient.topic_id = p_topic_id and recipient.club_id = p_club_id;
  select coalesce(jsonb_agg(option.option_text order by option.option_order), '[]'::jsonb)
    into stored_options
  from public.club_discussion_topic_options as option
  where option.topic_id = p_topic_id and option.club_id = p_club_id;

  select exists (
    select 1 from public.club_discussion_topic_votes as ballot
    where ballot.topic_id = p_topic_id and ballot.club_id = p_club_id
    union all
    select 1 from public.club_discussion_topic_comments as comment
    where comment.topic_id = p_topic_id and comment.club_id = p_club_id
  ) into has_activity;

  if has_activity and (
    current_topic.audience_kind is distinct from p_audience_kind
    or current_topic.anonymous_votes is distinct from p_anonymous_votes
    or stored_tag_count <> cardinality(p_tag_ids)
    or exists (
      select 1 from public.club_discussion_topic_tags as audience
      where audience.topic_id = p_topic_id and audience.club_id = p_club_id
        and not audience.tag_id = any(p_tag_ids)
    )
    or stored_recipient_count <> cardinality(p_membership_ids)
    or exists (
      select 1 from public.club_discussion_topic_recipients as recipient
      where recipient.topic_id = p_topic_id and recipient.club_id = p_club_id
        and not recipient.membership_id = any(p_membership_ids)
    )
    or stored_options is distinct from p_options
  ) then
    raise exception using errcode = '22023', message = 'discussion_topic_structure_locked';
  end if;

  update public.club_discussion_topics
  set title = btrim(p_title),
      description = btrim(p_description),
      deadline_at = p_deadline_at,
      audience_kind = p_audience_kind,
      anonymous_votes = p_anonymous_votes,
      updated_at = statement_timestamp(),
      updated_by_app_account_id = actor_id
  where id = p_topic_id and club_id = p_club_id and deleted_at is null;

  if not has_activity then
    delete from public.club_discussion_topic_tags
    where topic_id = p_topic_id and club_id = p_club_id;
    delete from public.club_discussion_topic_recipients
    where topic_id = p_topic_id and club_id = p_club_id;
    delete from public.club_discussion_topic_options
    where topic_id = p_topic_id and club_id = p_club_id;

    if p_audience_kind = 'tags' then
      insert into public.club_discussion_topic_tags (topic_id, tag_id, club_id)
      select p_topic_id, selected.id, p_club_id from unnest(p_tag_ids) as selected(id);
    elsif p_audience_kind = 'people' then
      insert into public.club_discussion_topic_recipients (topic_id, membership_id, club_id)
      select p_topic_id, selected.id, p_club_id from unnest(p_membership_ids) as selected(id);
    end if;

    insert into public.club_discussion_topic_options (topic_id, club_id, option_order, option_text)
    select p_topic_id, p_club_id, value.ordinality::integer, btrim(value.option_text)
    from jsonb_array_elements_text(p_options) with ordinality as value(option_text, ordinality);
  end if;

  return jsonb_build_object('id', p_topic_id, 'club_id', p_club_id);
end;
$$;

create or replace function public.delete_club_discussion_topic(p_club_id uuid, p_topic_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
begin
  if actor_id is null
     or not public.current_has_club_permission(p_club_id, 'discussion.manage') then
    raise exception using errcode = '42501', message = 'discussion_manage_required';
  end if;

  update public.club_discussion_topics
  set deleted_at = statement_timestamp(),
      deleted_by_app_account_id = actor_id,
      updated_at = statement_timestamp(),
      updated_by_app_account_id = actor_id
  where id = p_topic_id and club_id = p_club_id and deleted_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'discussion_topic_unavailable';
  end if;

  return jsonb_build_object('id', p_topic_id, 'club_id', p_club_id, 'deleted', true);
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

  perform 1 from public.club_discussion_topics as topic
  where topic.id = p_topic_id and topic.club_id = p_club_id
    and topic.deleted_at is null and topic.deadline_at > statement_timestamp()
  for update;
  if not found
    or not public.discussion_topic_includes_membership(p_topic_id, p_club_id, active_membership_id) then
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

  perform 1 from public.club_discussion_topics as topic
  where topic.id = p_topic_id and topic.club_id = p_club_id
    and topic.deleted_at is null and topic.deadline_at > statement_timestamp()
  for update;
  if not found
    or not public.discussion_topic_includes_membership(p_topic_id, p_club_id, active_membership_id) then
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

  -- Return only aggregate counts and the caller's own choice. In particular,
  -- never return voter identities or the expensive comments projection here.
  select jsonb_build_object(
    'topic_id', p_topic_id,
    'club_id', p_club_id,
    'my_vote_option_id', p_option_id,
    'vote_count', (select count(*)::integer from public.club_discussion_topic_votes as ballot
      where ballot.topic_id = p_topic_id and ballot.club_id = p_club_id),
    'options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', option.id,
        'vote_count', (select count(*)::integer from public.club_discussion_topic_votes as ballot
          where ballot.topic_id = option.topic_id and ballot.club_id = option.club_id
            and ballot.option_id = option.id)
      ) order by option.option_order)
      from public.club_discussion_topic_options as option
      where option.topic_id = p_topic_id and option.club_id = p_club_id
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_club_discussion_topic_edit(uuid, uuid) from public, anon;
revoke all on function public.update_club_discussion_topic(uuid, uuid, text, text, timestamptz, text, uuid[], uuid[], boolean, jsonb)
  from public, anon;
revoke all on function public.delete_club_discussion_topic(uuid, uuid) from public, anon;
grant execute on function public.get_club_discussion_topic_edit(uuid, uuid) to authenticated;
grant execute on function public.update_club_discussion_topic(uuid, uuid, text, text, timestamptz, text, uuid[], uuid[], boolean, jsonb)
  to authenticated;
grant execute on function public.delete_club_discussion_topic(uuid, uuid) to authenticated;

commit;
