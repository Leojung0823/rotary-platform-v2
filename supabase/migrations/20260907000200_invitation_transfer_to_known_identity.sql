begin;

-- A club inviting someone who already uses the platform has no way to find
-- them: officers of one club cannot see another club's members, and the
-- invitation matches an existing person only by an exact email or phone the
-- inviting officer may not have. With neither, a second person record is
-- created for the same human, and claiming it with their LINE identity was
-- refused outright -- telling the officer to "merge the duplicate" through a
-- tool that does not exist.
--
-- So the claim moves the invitation onto the person the identity already
-- belongs to. Whoever holds the invitation link can already claim it today; the
-- difference is that the membership lands on an identified person instead of a
-- second phantom record.
create or replace function public.transfer_member_invitation_to_identity(
  p_token_hash text,
  p_target_app_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  target public.member_invitations;
  target_account public.app_accounts;
  source_person_id uuid;
begin
  if p_token_hash is null or length(p_token_hash) <> 64 or p_target_app_account_id is null then
    return jsonb_build_object('status', 'invalid_input');
  end if;

  select * into target_account
  from public.app_accounts
  where id = p_target_app_account_id
  for update;
  if not found or target_account.account_status <> 'active' then
    return jsonb_build_object('status', 'target_not_active');
  end if;

  select * into target
  from public.member_invitations
  where token_hash = p_token_hash
  for update;
  if not found
     or target.invitation_status not in ('pending', 'sent')
     or target.expires_at <= now() then
    return jsonb_build_object('status', 'invitation_not_claimable');
  end if;

  source_person_id := target.person_id;
  if source_person_id = target_account.person_id then
    return jsonb_build_object('status', 'already_owned', 'person_id', source_person_id);
  end if;

  -- The record being left behind must be the empty duplicate this exists to
  -- clean up. A person who can log in, or who has bound their own LINE, is a
  -- different human, and merging them is not recoverable.
  if exists (select 1 from public.app_accounts where person_id = source_person_id) then
    return jsonb_build_object('status', 'source_has_account');
  end if;
  if exists (
    select 1 from public.line_identities
    where person_id = source_person_id and identity_status = 'active'
  ) then
    return jsonb_build_object('status', 'source_has_identity');
  end if;

  -- Whatever the officer typed about the invitee stays with the record being
  -- retired. A club may add a membership but never rewrite the global person,
  -- so no name, phone or birth date is copied across.
  if exists (
    select 1 from public.club_memberships
    where club_id = target.club_id
      and person_id = target_account.person_id
      and membership_status = 'active'
  ) then
    return jsonb_build_object('status', 'already_member');
  end if;

  update public.club_memberships
  set person_id = target_account.person_id,
      updated_at = now()
  where id = target.membership_id;

  update public.member_invitations
  set person_id = target_account.person_id
  where id = target.id;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    target.club_id, target_account.id, 'member_invitation.transferred_to_known_identity',
    'member_invitation', target.id,
    jsonb_build_object('membership_id', target.membership_id)
  );

  return jsonb_build_object('status', 'transferred', 'person_id', target_account.person_id);
end;
$$;

comment on function public.transfer_member_invitation_to_identity(text, uuid) is
  'Moves a pending invitation onto the person a LINE identity already belongs to, when the invited record is a duplicate with no account and no identity of its own. Service-role only.';

revoke all on function public.transfer_member_invitation_to_identity(text, uuid)
  from public, anon, authenticated;
grant execute on function public.transfer_member_invitation_to_identity(text, uuid) to service_role;

commit;
