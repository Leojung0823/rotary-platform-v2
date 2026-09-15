begin;

-- Tagging one member at a time is the only way to build an audience today, and
-- an audience is usually a group that is decided all at once: "the board",
-- "this year's new members". Twenty visits to twenty member pages is why the
-- feature went unused.
--
-- This applies ONE tag to MANY memberships, which is the shape of the decision
-- being made. It is deliberately not set_membership_tags in bulk: that replaces
-- a member's whole tag set, and doing that across a selection would silently
-- strip every other tag those members hold.
--
-- Removal is included because a mis-tagged batch otherwise has no undo but
-- twenty more visits.

create or replace function public.apply_member_tag_to_memberships(
  p_club_id uuid,
  p_tag_id uuid,
  p_membership_ids uuid[],
  p_mode text default 'assign'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  wanted uuid[] := coalesce(p_membership_ids, '{}'::uuid[]);
  affected integer := 0;
begin
  if actor_id is null
     or not public.current_has_club_permission(p_club_id, 'member.manage') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;

  if p_mode is null or p_mode not in ('assign', 'remove') then
    raise exception using errcode = '22023', message = 'invalid_member_tag';
  end if;

  -- A caller with no selection has asked for nothing; that is not an error, but
  -- it must not write an audit entry claiming a change was made.
  if coalesce(array_length(wanted, 1), 0) = 0 then
    return jsonb_build_object('mode', p_mode, 'affected_count', 0);
  end if;

  -- The tag must be this club's and still active, so a tag id lifted from
  -- another club can never be attached by passing it in directly.
  if not exists (
    select 1 from public.club_member_tags as tag
    where tag.id = p_tag_id
      and tag.club_id = p_club_id
      and tag.tag_status = 'active'
  ) then
    raise exception using errcode = 'P0002', message = 'member_tag_not_available';
  end if;

  -- Every membership must be this club's. Rejecting the whole batch rather than
  -- skipping strangers means the count reported back is the count the officer
  -- selected; a partial write they were never told about is worse than a retry.
  if exists (
    select 1 from unnest(wanted) as requested(membership_id)
    where not exists (
      select 1 from public.club_memberships as membership
      where membership.id = requested.membership_id
        and membership.club_id = p_club_id
    )
  ) then
    raise exception using errcode = 'P0002', message = 'membership_not_available';
  end if;

  if p_mode = 'assign' then
    with inserted as (
      insert into public.club_membership_tags (
        membership_id, tag_id, club_id, assigned_by_app_account_id
      )
      select requested.membership_id, p_tag_id, p_club_id, actor_id
      from unnest(wanted) as requested(membership_id)
      on conflict (membership_id, tag_id) do nothing
      returning 1
    )
    select count(*) into affected from inserted;
  else
    with removed as (
      delete from public.club_membership_tags
      where club_id = p_club_id
        and tag_id = p_tag_id
        and membership_id = any (wanted)
      returning 1
    )
    select count(*) into affected from removed;
  end if;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id,
    actor_id,
    case when p_mode = 'assign' then 'member_tag.batch_assigned' else 'member_tag.batch_removed' end,
    'club_member_tag',
    p_tag_id,
    jsonb_build_object(
      'selected_count', array_length(wanted, 1),
      'affected_count', affected
    )
  );

  return jsonb_build_object('mode', p_mode, 'affected_count', affected);
end;
$$;

revoke all on function public.apply_member_tag_to_memberships(uuid, uuid, uuid[], text) from public, anon;
grant execute on function public.apply_member_tag_to_memberships(uuid, uuid, uuid[], text) to authenticated;

commit;
