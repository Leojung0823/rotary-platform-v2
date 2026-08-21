begin;

-- One definition of "who is this addressed to", shared by every surface that
-- addresses people: an event, a board post, and a LINE OA push.
--
-- Keeping this in one function matters because the surfaces disagree about
-- almost everything else. A LINE push can only reach members who have paired
-- their OA account, while an event is visible to a member whether or not they
-- use LINE at all. If each surface computed its own audience, "the board" would
-- quietly mean a different set of people in each of them.
--
-- Empty tags and empty members means the whole club, matching how an event or
-- post with no audience rows is addressed to everyone.

create or replace function public.resolve_club_audience(
  p_club_id uuid,
  p_tag_ids uuid[] default '{}'::uuid[],
  p_membership_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  wanted_tags uuid[] := coalesce(p_tag_ids, '{}'::uuid[]);
  wanted_members uuid[] := coalesce(p_membership_ids, '{}'::uuid[]);
  whole_club boolean := coalesce(array_length(wanted_tags, 1), 0) = 0
    and coalesce(array_length(wanted_members, 1), 0) = 0;
  result jsonb;
begin
  if actor_id is null
     or not public.current_has_club_permission(p_club_id, 'member.manage') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;

  with matched as (
    select distinct membership.id as membership_id,
      person.canonical_name as display_name
    from public.club_memberships as membership
    join public.people as person on person.id = membership.person_id
    where membership.club_id = p_club_id
      and membership.membership_status = 'active'
      and (
        whole_club
        or exists (
          select 1 from public.club_membership_tags as tagged
          where tagged.membership_id = membership.id
            and tagged.tag_id = any (wanted_tags)
        )
        or membership.id = any (wanted_members)
      )
  ), reachable as (
    select matched.membership_id,
      matched.display_name,
      -- A member may have paired more than one OA identity over time; only a
      -- currently following pairing can actually receive a push.
      (
        select follower.oa_user_id
        from public.line_oa_followers as follower
        join public.club_memberships as membership on membership.id = matched.membership_id
        where follower.club_id = p_club_id
          and follower.person_id = membership.person_id
          and follower.follower_status = 'following'
        order by follower.paired_at desc nulls last
        limit 1
      ) as oa_user_id
    from matched
  )
  select jsonb_build_object(
    'whole_club', whole_club,
    'member_count', count(*),
    'reachable_count', count(*) filter (where oa_user_id is not null),
    'members', coalesce(jsonb_agg(jsonb_build_object(
      'membership_id', membership_id,
      'display_name', display_name,
      'line_reachable', oa_user_id is not null
    ) order by display_name), '[]'::jsonb),
    -- Recipient identifiers are returned so a push can be addressed without a
    -- second query; they are OA-scoped ids, never LINE Login identities.
    'oa_user_ids', coalesce(jsonb_agg(oa_user_id) filter (where oa_user_id is not null), '[]'::jsonb)
  ) into result
  from reachable;

  return result;
end;
$$;

revoke all on function public.resolve_club_audience(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.resolve_club_audience(uuid, uuid[], uuid[]) to authenticated;

commit;
