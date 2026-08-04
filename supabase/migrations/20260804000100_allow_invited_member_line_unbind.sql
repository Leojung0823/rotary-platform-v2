begin;

create or replace function public.unbind_line_identity(
  p_club_id uuid,
  p_app_account_id uuid,
  p_reason text,
  p_create_rebind boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.line_identities;
  target_account public.app_accounts;
  membership public.club_memberships;
  raw_token text;
  rebind_invite public.member_invitations;
  revoked_sessions integer := 0;
begin
  if actor_id is null
     or not public.current_has_club_permission(p_club_id, 'identity.unbind') then
    raise exception using errcode = '42501', message = 'identity_unbind_required';
  end if;

  select identity.* into target
  from public.line_identities as identity
  where identity.app_account_id = p_app_account_id
    and identity.identity_status = 'active'
  for update;

  if not found then
    return jsonb_build_object('unbound', true, 'idempotent', true, 'rebind_token', null);
  end if;

  select account.* into target_account
  from public.app_accounts as account
  where account.id = target.app_account_id
  for update;

  select member.* into membership
  from public.club_memberships as member
  where member.club_id = p_club_id
    and member.person_id = target.person_id
    and member.membership_status in ('invited', 'active', 'suspended', 'disabled')
  order by member.created_at desc
  limit 1;

  if not found then
    raise exception using errcode = '42501', message = 'account_not_in_club';
  end if;

  if not public.current_has_platform_role(array['superadmin', 'platform_admin'])
     and exists (
       select 1
       from public.club_memberships as other_membership
       where other_membership.person_id = target.person_id
         and other_membership.club_id <> p_club_id
         and other_membership.membership_status in ('invited', 'active', 'suspended', 'disabled')
     ) then
    raise exception using errcode = '42501', message = 'cross_club_identity_unbind_requires_platform_admin';
  end if;

  update public.line_identities
  set identity_status = 'unbound',
      unbound_at = now(),
      unbound_by_app_account_id = actor_id,
      updated_at = now()
  where id = target.id;

  delete from auth.sessions
  where user_id = target_account.auth_user_id;
  get diagnostics revoked_sessions = row_count;

  update public.user_devices
  set revoked_at = coalesce(revoked_at, now()),
      trusted = false,
      updated_at = now()
  where app_account_id = target_account.id
    and revoked_at is null;

  if p_create_rebind
     and target_account.account_status = 'active'
     and membership.membership_status = 'active'
     and exists (
       select 1 from public.clubs as club
       where club.id = p_club_id and club.club_status = 'active'
     ) then
    update public.member_invitations
    set invitation_status = 'cancelled',
        cancelled_at = now(),
        cancelled_by_app_account_id = actor_id,
        updated_at = now()
    where membership_id = membership.id
      and invitation_status in ('pending', 'sent');

    raw_token := encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.member_invitations (
      club_id, person_id, membership_id, invitation_kind, delivery_method,
      token_hash, token_prefix, invitation_status, invited_by_app_account_id,
      idempotency_key, sent_at
    ) values (
      p_club_id, target.person_id, membership.id, 'line_rebind', 'link',
      encode(extensions.digest(raw_token, 'sha256'), 'hex'), left(raw_token, 8),
      'sent', actor_id,
      'rebind-' || target.id::text || '-' || floor(extract(epoch from clock_timestamp()))::bigint::text,
      now()
    )
    returning * into rebind_invite;

    insert into public.invitation_logs (
      invitation_id, club_id, actor_app_account_id, event_key, delivery_method
    ) values (
      rebind_invite.id, p_club_id, actor_id, 'created', 'link'
    );
  end if;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'line_identity.unbound', 'line_identity', target.id,
    jsonb_build_object(
      'reason', btrim(coalesce(p_reason, '')),
      'sessions_revoked', revoked_sessions,
      'devices_revoked', true,
      'rebind_created', rebind_invite.id is not null
    )
  );

  return jsonb_build_object(
    'unbound', true,
    'idempotent', false,
    'sessions_revoked', revoked_sessions,
    'rebind_invitation_id', rebind_invite.id,
    'rebind_token', raw_token
  );
end;
$$;

revoke all on function public.unbind_line_identity(uuid, uuid, text, boolean)
  from public, anon;
grant execute on function public.unbind_line_identity(uuid, uuid, text, boolean)
  to authenticated;

commit;
