begin;

-- 首頁上方的搜尋框本來沒有功能。
--
-- One question across the three things a member looks for -- an event, a
-- fellow member, a notice they were sent -- answered in one round trip.
--
-- Every branch reuses the visibility rule that already governs its own page,
-- restated here rather than re-derived: an event addressed to particular tags
-- stays invisible to everyone outside them (event_includes_current_member),
-- the directory shows what each member's own privacy settings allow, and a
-- message is only ever visible to the membership it was actually delivered to
-- (club_message_recipients). A search that widens any of these would be a
-- privacy leak wearing a magnifying glass.
--
-- Matching is case-insensitive substring, not full text: a club has hundreds
-- of rows, not millions, and Chinese has no word boundaries for a default
-- tsquery parser to find -- "理事" would not match "理事會" under `simple`.

create or replace function public.search_my_club(
  p_club_id uuid,
  p_query text,
  p_limit integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  my_membership_id uuid := public.current_club_membership_id(p_club_id);
  needle text := btrim(coalesce(p_query, ''));
  pattern text;
  result jsonb;
begin
  if actor_id is null or not public.current_can_access_club_events(p_club_id) then
    raise exception using errcode = '42501', message = 'search_read_required';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception using errcode = '22023', message = 'invalid_search_limit';
  end if;

  -- One character matches most of the club and answers nothing. An empty
  -- result is the honest answer to "search for anything".
  if char_length(needle) < 2 then
    return jsonb_build_object(
      'query', needle, 'events', '[]'::jsonb, 'members', '[]'::jsonb, 'messages', '[]'::jsonb
    );
  end if;

  -- The needle is escaped before it becomes a pattern: a member typing "100%"
  -- is searching for a percentage, not for everything.
  pattern := '%' || replace(replace(replace(needle, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  select jsonb_build_object(
    'query', needle,
    'events', coalesce((
      select jsonb_agg(item order by item->>'starts_at' desc)
      from (
        select jsonb_build_object(
          'id', event.id,
          'title', event.title,
          'location', event.location,
          'starts_at', event.starts_at
        ) as item
        from public.club_events as event
        where event.club_id = p_club_id
          and event.event_status = 'published'
          -- The audience rule, unchanged. A targeted event is not findable by
          -- someone it was not addressed to.
          and public.event_includes_current_member(event.id)
          and (
            event.title ilike pattern
            or event.location ilike pattern
            or event.description ilike pattern
          )
        order by event.starts_at desc, event.id desc
        limit p_limit
      ) as found
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(item order by item->>'display_name')
      from (
        select jsonb_build_object(
          'membership_id', membership.id,
          'display_name', person.canonical_name,
          'occupation', person.occupation
        ) as item
        from public.club_memberships as membership
        join public.people as person on person.id = membership.person_id
        where membership.club_id = p_club_id
          and membership.membership_status = 'active'
          -- Name and occupation only. Email and phone are shown in the
          -- directory only when that member allowed it, so searching them
          -- would confirm a value the searcher is not allowed to read.
          and (person.canonical_name ilike pattern or person.occupation ilike pattern)
        order by person.canonical_name, membership.id
        limit p_limit
      ) as found
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(item order by item->>'published_at' desc)
      from (
        select jsonb_build_object(
          'id', message.id,
          'title', message.title,
          'published_at', message.published_at,
          'is_unread', recipient.read_at is null
        ) as item
        from public.club_message_recipients as recipient
        join public.club_messages as message on message.id = recipient.message_id
        where recipient.club_id = p_club_id
          -- Delivered to this membership. Not "sent to this club".
          and recipient.membership_id = my_membership_id
          and message.status = 'active'
          and (message.title ilike pattern or message.body ilike pattern)
        order by message.published_at desc, message.id desc
        limit p_limit
      ) as found
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.search_my_club(uuid, text, integer) from public, anon;
grant execute on function public.search_my_club(uuid, text, integer) to authenticated;

commit;
