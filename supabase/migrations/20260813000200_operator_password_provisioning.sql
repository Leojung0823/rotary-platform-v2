begin;

-- Email-based operator invitations depend on hosted SMTP being configured,
-- which staging does not have. Replace that path with direct provisioning:
-- the club manager sets a password up front, the server creates the auth
-- user via the admin API, then this function performs the same acceptance
-- side effects as accept_operator_invitation (permission grant, invite
-- status, club activation) — driven by the inviting manager's permission
-- rather than the target user's own session.

create or replace function public.provision_operator_account(
  p_invite_id uuid,
  p_target_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  auth_id uuid := p_target_auth_user_id;
  auth_email text;
  target_invite public.club_operator_invites;
  target_person public.people;
  target_account public.app_accounts;
  new_permission public.club_operator_permissions;
begin
  if actor_id is null or auth_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select invite.* into target_invite
  from public.club_operator_invites as invite
  where invite.id = p_invite_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'matching_invitation_not_found';
  end if;
  if not public.current_can_manage_club(target_invite.club_id) then
    raise exception using errcode = '42501', message = 'club_manager_required';
  end if;

  select lower(btrim(coalesce(user_record.email, ''))) into auth_email
  from auth.users as user_record where user_record.id = auth_id;
  if auth_email = '' or auth_email <> target_invite.email_normalized then
    raise exception using errcode = '42501', message = 'target_account_email_mismatch';
  end if;

  if target_invite.invite_status = 'accepted' then
    if exists (select 1 from public.app_accounts as account
      where account.id = target_invite.accepted_app_account_id and account.auth_user_id = auth_id) then
      return jsonb_build_object('club_id', target_invite.club_id, 'invite_id', target_invite.id,
        'permission_id', (select permission.id from public.club_operator_permissions as permission
          where permission.club_id = target_invite.club_id
            and permission.app_account_id = target_invite.accepted_app_account_id
            and permission.assignment_status = 'active' limit 1),
        'idempotent', true);
    end if;
    raise exception using errcode = '42501', message = 'invitation_already_claimed';
  end if;
  if target_invite.invite_status not in ('pending', 'sent') then
    raise exception using errcode = '22023', message = 'invitation_not_claimable';
  end if;
  if target_invite.expires_at <= now() then
    update public.club_operator_invites set invite_status = 'expired' where id = target_invite.id;
    raise exception using errcode = '22023', message = 'invitation_expired';
  end if;

  select account.* into target_account from public.app_accounts as account
  where account.auth_user_id = auth_id or account.login_email_normalized = auth_email
  order by (account.auth_user_id = auth_id) desc limit 1 for update;
  if found and (target_account.auth_user_id <> auth_id or target_account.login_email_normalized <> auth_email) then
    raise exception using errcode = '23505', message = 'email_linked_to_another_auth_user';
  end if;
  if not found then
    select person.* into target_person from public.people as person
    where lower(btrim(person.primary_email)) = auth_email limit 1 for update;
    if not found then
      insert into public.people (canonical_name, primary_email)
      values (target_invite.display_name, auth_email) returning * into target_person;
    end if;
    insert into public.app_accounts (
      auth_user_id, person_id, login_email, account_display_name
    ) values (
      auth_id, target_person.id, auth_email, target_invite.display_name
    ) returning * into target_account;
  end if;

  if exists (select 1 from public.club_memberships as membership
    where membership.person_id = target_account.person_id and membership.membership_status = 'active') then
    raise exception using errcode = '23514', message = 'active_member_cannot_be_operator';
  end if;

  insert into public.club_operator_permissions (
    club_id, app_account_id, permission_level, granted_by_app_account_id
  ) values (
    target_invite.club_id, target_account.id, target_invite.permission_level, target_invite.invited_by_app_account_id
  )
  on conflict (club_id, app_account_id) where assignment_status = 'active'
  do update set updated_at = now()
  returning * into new_permission;

  update public.club_operator_invites
  set invite_status = 'accepted', accepted_at = now(), accepted_app_account_id = target_account.id
  where id = target_invite.id;
  update public.clubs
  set club_status = 'active', activated_at = coalesce(activated_at, now())
  where id = target_invite.club_id and club_status = 'provisioning';

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (target_invite.club_id, actor_id, 'operator_invite.provisioned_with_password', 'club_operator_permission',
    new_permission.id, jsonb_build_object('invite_id', target_invite.id));

  return jsonb_build_object('club_id', target_invite.club_id, 'invite_id', target_invite.id,
    'permission_id', new_permission.id, 'idempotent', false);
end;
$$;

revoke all on function public.provision_operator_account(uuid, uuid) from public, anon, authenticated;
grant execute on function public.provision_operator_account(uuid, uuid) to authenticated;

commit;
