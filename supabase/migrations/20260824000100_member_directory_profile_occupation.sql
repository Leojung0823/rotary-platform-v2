begin;

-- Keep the profile projection aligned with list_club_member_directory. The
-- directory parser intentionally rejects a partial contract, so every field in
-- the shared member shape must be projected here as well.
create or replace function public.get_club_member_directory_profile(
  p_club_id uuid,
  p_membership_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select jsonb_build_object(
    'membership_id', directory.membership_id,
    'display_name', directory.display_name,
    'avatar_url', directory.avatar_url,
    'role_key', directory.role_key,
    'occupation', directory.occupation,
    'email', directory.email,
    'phone', directory.phone,
    'birth_year', directory.birth_year,
    'is_self', directory.is_self
  )
  from public.list_club_member_directory(p_club_id, null) as directory
  where directory.membership_id = p_membership_id
$$;

revoke all on function public.get_club_member_directory_profile(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_club_member_directory_profile(uuid, uuid)
  to authenticated;

commit;
