begin;

-- The join screen decides whether the signed-in account is the invited person
-- so it can either show the confirmation form or offer to switch accounts. It
-- had to infer that from whether the preview carried any contact detail,
-- because phone/email/birth_date are only populated for a matching viewer.
--
-- That inference breaks for a member the club recorded by name alone, which is
-- now allowed: a genuinely matching viewer whose person row has no phone, no
-- email and no birth date is indistinguishable from a stranger, so the invited
-- member is told the account does not match and can never complete the join.
--
-- Return the answer explicitly instead of leaving the caller to guess it.
create or replace function public.get_member_invitation_preview(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  result jsonb;
  viewer_account_id uuid := public.current_app_account_id();
begin
  select jsonb_build_object(
    'invitation_id', invitation.id,
    'club_id', club.id,
    'club_name', club.club_name,
    'status', case
      when invitation.expires_at <= now() and invitation.invitation_status in ('pending', 'sent') then 'expired'
      else invitation.invitation_status
    end,
    'expires_at', invitation.expires_at,
    'invitation_kind', invitation.invitation_kind,
    'name', person.canonical_name,
    'has_email', person.primary_email is not null,
    -- Still gated on the viewer being the invited person: this stays the only
    -- place the invitee's own contact details are disclosed.
    'viewer_matches', viewer_account.id is not null,
    'phone', case when viewer_account.id is not null then person.primary_phone else null end,
    'email', case when viewer_account.id is not null then person.primary_email else null end,
    'birth_date', case when viewer_account.id is not null then person.birth_date else null end
  )
  into result
  from public.member_invitations as invitation
  join public.clubs as club on club.id = invitation.club_id
  join public.people as person on person.id = invitation.person_id
  left join public.app_accounts as viewer_account
    on viewer_account.id = viewer_account_id
   and viewer_account.person_id = invitation.person_id
   and viewer_account.account_status = 'active'
  where invitation.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');

  return result;
end;
$$;

-- Same regression, one step further along the same flow: creating a member by
-- name alone is allowed, but confirming that invitation still demanded a phone
-- or an email, so a name-only member who got past the screen above would be
-- rejected on submit. This is the previous definition with that single
-- requirement removed; every other rule is untouched.
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
  normalized_name text := btrim(coalesce(p_name, ''));
  normalized_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
  normalized_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  auth_method text;
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
       select 1
       from public.app_accounts as account
       where account.id = account_id
         and account.person_id = target.person_id
         and account.account_status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'valid_bound_invitation_required';
  end if;

  if normalized_name = ''
     or char_length(normalized_name) > 160
     or (normalized_phone is not null and char_length(normalized_phone) > 40)
     or (normalized_email is not null and (
       char_length(normalized_email) > 320
       or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     ))
     or (p_birth_date is not null and (p_birth_date < date '1900-01-01' or p_birth_date > current_date)) then
    raise exception using errcode = '22023', message = 'required_member_profile_fields_missing';
  end if;

  update public.people
  set canonical_name = normalized_name,
      primary_phone = normalized_phone,
      primary_email = normalized_email,
      birth_date = p_birth_date,
      profile_completed_at = now()
  where id = target.person_id;

  update public.app_accounts
  set account_display_name = normalized_name
  where id = account_id;

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
  )
  on conflict (club_id, app_account_id, role_key) where assignment_status = 'active'
  do nothing;

  insert into public.notification_settings (app_account_id)
  values (account_id)
  on conflict do nothing;

  insert into public.privacy_settings (app_account_id)
  values (account_id)
  on conflict do nothing;

  insert into public.invitation_logs (
    invitation_id, club_id, actor_app_account_id, event_key
  ) values (
    target.id, target.club_id, account_id, 'accepted'
  );

  select case
    when exists (
      select 1 from public.line_identities as identity
      where identity.app_account_id = account_id and identity.identity_status = 'active'
    ) then 'line'
    else 'password'
  end into auth_method;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    target.club_id, account_id, 'member_invitation.accepted', 'club_membership', membership.id,
    jsonb_build_object('invitation_id', target.id, 'auth_method', auth_method)
  );

  return jsonb_build_object(
    'club_id', target.club_id,
    'membership_id', membership.id,
    'idempotent', false
  );
end;
$$;

commit;
