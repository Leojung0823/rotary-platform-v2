begin;

alter table public.people
  add column if not exists identity_status text not null default 'verified';

alter table public.people
  drop constraint if exists people_identity_status_check;
alter table public.people
  add constraint people_identity_status_check
  check (identity_status in ('provisional', 'verified', 'merged'));

alter table public.member_invitations
  drop constraint if exists member_invitations_idempotency_key_key;
drop index if exists public.member_invitations_idempotency_key_key;
create unique index if not exists member_invitations_club_idempotency_unique
  on public.member_invitations (club_id, idempotency_key);

alter table public.line_oa_accounts
  add column if not exists credential_ref text;
update public.line_oa_accounts
set credential_ref = encode(extensions.gen_random_bytes(12), 'hex')
where credential_ref is null;
alter table public.line_oa_accounts
  alter column credential_ref set default encode(extensions.gen_random_bytes(12), 'hex'),
  alter column credential_ref set not null;
alter table public.line_oa_accounts
  drop constraint if exists line_oa_accounts_credential_ref_check;
alter table public.line_oa_accounts
  add constraint line_oa_accounts_credential_ref_check
  check (credential_ref ~ '^[a-f0-9]{24}$');
create unique index if not exists line_oa_accounts_credential_ref_unique
  on public.line_oa_accounts (credential_ref);

-- A non-partial unique index allows PostgREST upsert conflict handling while
-- PostgreSQL still permits multiple NULL provider_event_id values.
drop index if exists public.line_webhooks_provider_event_unique;
create unique index line_webhooks_provider_event_unique
  on public.line_webhooks (line_oa_account_id, provider_event_id);

create or replace function public.create_member_invitation(
  p_club_id uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_birth_date date,
  p_delivery_method text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  actor_id uuid := public.current_app_account_id();
  normalized_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  normalized_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
  target_person public.people;
  target_membership public.club_memberships;
  existing_invite public.member_invitations;
  new_invite public.member_invitations;
  raw_token text;
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'invitation.manage') then
    raise exception using errcode = '42501', message = 'invitation_manage_required';
  end if;
  if btrim(coalesce(p_name, '')) = ''
     or char_length(btrim(coalesce(p_idempotency_key, ''))) < 8
     or char_length(btrim(coalesce(p_idempotency_key, ''))) > 200
     or p_delivery_method not in ('line', 'email', 'qr', 'link')
     or (normalized_email is null and normalized_phone is null) then
    raise exception using errcode = '22023', message = 'invalid_member_invitation_input';
  end if;

  -- Serialize the same club/key pair before checking or creating dependent
  -- provisional records. This avoids the check-then-insert race.
  perform pg_advisory_xact_lock(
    hashtextextended(p_club_id::text || ':' || btrim(p_idempotency_key), 0)
  );

  select invitation.* into existing_invite
  from public.member_invitations as invitation
  where invitation.club_id = p_club_id
    and invitation.idempotency_key = btrim(p_idempotency_key);
  if found then
    return jsonb_build_object(
      'invitation_id', existing_invite.id,
      'membership_id', existing_invite.membership_id,
      'invitation_status', existing_invite.invitation_status,
      'idempotent', true,
      'token', null
    );
  end if;

  -- Never search for or update a global person from club-supplied PII. Each
  -- invitation starts with a provisional identity that can be verified and
  -- merged only by a later trusted platform-level process.
  insert into public.people (
    canonical_name, primary_phone, primary_email, birth_date, identity_status
  ) values (
    btrim(p_name), normalized_phone, normalized_email, p_birth_date, 'provisional'
  ) returning * into target_person;

  insert into public.club_memberships (
    club_id, person_id, membership_status, created_by_app_account_id
  ) values (
    p_club_id, target_person.id, 'invited', actor_id
  ) returning * into target_membership;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.member_invitations (
    club_id, person_id, membership_id, delivery_method, token_hash, token_prefix,
    invitation_status, invited_by_app_account_id, idempotency_key, sent_at
  ) values (
    p_club_id, target_person.id, target_membership.id, p_delivery_method,
    encode(extensions.digest(raw_token, 'sha256'), 'hex'), left(raw_token, 8),
    'sent', actor_id, btrim(p_idempotency_key), now()
  ) returning * into new_invite;

  insert into public.invitation_logs (
    invitation_id, club_id, actor_app_account_id, event_key, delivery_method
  ) values
    (new_invite.id, p_club_id, actor_id, 'created', p_delivery_method),
    (new_invite.id, p_club_id, actor_id, 'sent', p_delivery_method);

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'member.invited', 'member_invitation', new_invite.id,
    jsonb_build_object(
      'membership_id', target_membership.id,
      'delivery_method', p_delivery_method,
      'person_identity_status', 'provisional'
    )
  );

  return jsonb_build_object(
    'invitation_id', new_invite.id,
    'membership_id', target_membership.id,
    'invitation_status', new_invite.invitation_status,
    'idempotent', false,
    'token', raw_token
  );
end;
$$;

create or replace function public.complete_member_invitation(
  p_token text,
  p_name text,
  p_phone text,
  p_email text,
  p_birth_date date
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  account_id uuid := public.current_app_account_id();
  target public.member_invitations;
  membership public.club_memberships;
begin
  if account_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select invitation.* into target
  from public.member_invitations as invitation
  where invitation.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'invitation_not_found';
  end if;
  if target.invitation_status = 'accepted' and target.accepted_by_app_account_id = account_id then
    return jsonb_build_object(
      'club_id', target.club_id,
      'membership_id', target.membership_id,
      'idempotent', true
    );
  end if;
  if target.invitation_status not in ('pending', 'sent')
     or target.expires_at <= now()
     or not exists (
       select 1 from public.app_accounts as account
       where account.id = account_id and account.person_id = target.person_id
     )
     or not exists (
       select 1 from public.line_identities as identity
       where identity.app_account_id = account_id and identity.identity_status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'valid_bound_invitation_required';
  end if;
  if btrim(coalesce(p_name, '')) = ''
     or (
       nullif(btrim(coalesce(p_phone, '')), '') is null
       and nullif(btrim(coalesce(p_email, '')), '') is null
     ) then
    raise exception using errcode = '22023', message = 'required_member_profile_fields_missing';
  end if;

  update public.people
  set canonical_name = btrim(p_name),
      primary_phone = nullif(btrim(coalesce(p_phone, '')), ''),
      primary_email = nullif(lower(btrim(coalesce(p_email, ''))), ''),
      birth_date = p_birth_date,
      profile_completed_at = now(),
      identity_status = 'verified'
  where id = target.person_id;

  update public.club_memberships
  set membership_status = 'active', joined_on = current_date, ended_on = null
  where id = target.membership_id
  returning * into membership;

  update public.member_invitations
  set invitation_status = 'accepted', accepted_at = now(), accepted_by_app_account_id = account_id
  where id = target.id;

  insert into public.club_role_assignments (
    club_id, app_account_id, role_key, granted_by_app_account_id
  ) values (
    target.club_id, account_id, 'member', target.invited_by_app_account_id
  ) on conflict (club_id, app_account_id, role_key)
    where assignment_status = 'active' do nothing;

  insert into public.notification_settings (app_account_id)
  values (account_id) on conflict do nothing;
  insert into public.privacy_settings (app_account_id)
  values (account_id) on conflict do nothing;
  insert into public.invitation_logs (
    invitation_id, club_id, actor_app_account_id, event_key
  ) values (target.id, target.club_id, account_id, 'accepted');
  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    target.club_id, account_id, 'member_invitation.accepted', 'club_membership', membership.id,
    jsonb_build_object('invitation_id', target.id, 'person_identity_status', 'verified')
  );

  return jsonb_build_object(
    'club_id', target.club_id,
    'membership_id', membership.id,
    'idempotent', false
  );
end;
$$;

commit;
