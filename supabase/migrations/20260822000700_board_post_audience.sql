begin;

-- A post can now be addressed to tags, the same way an event can.
--
-- Deliberately tags only, with no named-member option. Addressing named
-- individuals on a board is a private message, which carries expectations
-- about notification, reply and retention that this feature does not meet;
-- it should not arrive by accident through an audience picker.
--
-- Recreated rather than replaced because adding a defaulted parameter would
-- leave the two-argument version callable and the call ambiguous. The audience
-- is written in the same statement as the post, so a post can never exist
-- briefly addressed to everyone before its audience is attached.

drop function if exists public.create_board_post(uuid, text);

create function public.create_board_post(
  p_club_id uuid,
  p_content text,
  p_tag_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  normalized_content text := public.normalize_board_post_content(p_content);
  created_post public.board_posts;
  wanted_tags uuid[] := coalesce(p_tag_ids, '{}'::uuid[]);
  result jsonb;
begin
  if actor_id is null or not public.current_has_active_board_membership(p_club_id) then
    raise exception using errcode = '42501', message = 'active_club_membership_required';
  end if;

  if normalized_content is null or normalized_content = '' or char_length(normalized_content) > 1000 then
    raise exception using errcode = '22023', message = 'invalid_board_content';
  end if;

  -- Only a member manager may address part of the club; an ordinary member
  -- posts to everyone, as they always have.
  if coalesce(array_length(wanted_tags, 1), 0) > 0
     and not public.current_has_club_permission(p_club_id, 'member.manage') then
    raise exception using errcode = '42501', message = 'member_manage_required';
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

  insert into public.board_posts (club_id, author_app_account_id, content)
  values (p_club_id, actor_id, normalized_content)
  returning * into created_post;

  insert into public.board_post_audiences (post_id, tag_id, club_id)
  select created_post.id, requested.tag_id, p_club_id
  from unnest(wanted_tags) as requested(tag_id);

  select jsonb_build_object(
    'id', created_post.id,
    'content', created_post.content,
    'created_at', created_post.created_at,
    'updated_at', created_post.updated_at,
    'author_display_name', account.account_display_name,
    'author_avatar_url', person.avatar_url,
    'can_edit', true,
    'can_delete', true
  ) into result
  from public.app_accounts as account
  join public.people as person on person.id = account.person_id
  where account.id = actor_id;

  return result;
end;
$$;


revoke all on function public.create_board_post(uuid, text, uuid[]) from public, anon;
grant execute on function public.create_board_post(uuid, text, uuid[]) to authenticated;

commit;
