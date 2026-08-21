begin;

-- What the tag picker on a member's page needs, in one question: every tag the
-- club currently offers, and whether this member carries it. Asking "which
-- tags exist" and "which does this member have" separately would be two round
-- trips for a single control.

create or replace function public.get_membership_tag_assignment(
  p_club_id uuid,
  p_membership_id uuid
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
     or not public.current_has_club_permission(p_club_id, 'member.manage') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;
  if not exists (
    select 1 from public.club_memberships
    where id = p_membership_id and club_id = p_club_id
  ) then
    raise exception using errcode = 'P0002', message = 'membership_not_available';
  end if;

  select jsonb_build_object('tags', coalesce(jsonb_agg(jsonb_build_object(
    'tag_id', tag.id,
    'tag_name', tag.tag_name,
    'description', tag.description,
    'assigned', exists (
      select 1 from public.club_membership_tags as tagged
      where tagged.tag_id = tag.id
        and tagged.membership_id = p_membership_id
    )
  ) order by tag.tag_name), '[]'::jsonb))
  into result
  from public.club_member_tags as tag
  where tag.club_id = p_club_id and tag.tag_status = 'active';

  return coalesce(result, jsonb_build_object('tags', '[]'::jsonb));
end;
$$;

revoke all on function public.get_membership_tag_assignment(uuid, uuid) from public, anon;
grant execute on function public.get_membership_tag_assignment(uuid, uuid) to authenticated;

commit;
