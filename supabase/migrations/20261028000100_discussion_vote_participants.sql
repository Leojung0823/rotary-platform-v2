-- Show participation, without exposing an anonymous ballot's selected option.
-- Keep the existing projection and its callers' audience/management checks intact.
do $migration$
declare
  definition text;
  old_projection constant text := $replace$    'named_votes', case$replace$;
  new_projection constant text := $replace$    'voters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'membership_id', ballot.membership_id,
        'display_name', person.canonical_name
      ) order by person.canonical_name, ballot.membership_id)
      from public.club_discussion_topic_votes as ballot
      join public.club_memberships as membership
        on membership.id = ballot.membership_id
       and membership.club_id = ballot.club_id
      join public.people as person on person.id = membership.person_id
      where ballot.topic_id = topic.id and ballot.club_id = topic.club_id
    ), '[]'::jsonb),
    'named_votes', case$replace$;
begin
  select pg_get_functiondef('public.discussion_topic_projection(uuid,uuid,uuid,boolean)'::regprocedure)
    into strict definition;
  if position(old_projection in definition) = 0
    or position(old_projection in substring(definition from position(old_projection in definition) + length(old_projection))) > 0
  then
    raise exception 'Unexpected discussion topic projection definition';
  end if;
  execute replace(definition, old_projection, new_projection);
end
$migration$;
