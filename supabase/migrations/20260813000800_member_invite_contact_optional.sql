begin;

-- Contact info was unconditionally required, but 'qr' and 'link' delivery
-- never send anything programmatically anyway (the secretary hands the
-- token over directly) -- so a name alone (an English nickname counts) is
-- enough to pre-create a member for those methods. Only 'email' delivery
-- still needs an actual email to make sense.
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
  shared_elsewhere boolean := false;
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'invitation.manage') then
    raise exception using errcode = '42501', message = 'invitation_manage_required';
  end if;

  if btrim(coalesce(p_name, '')) = ''
     or btrim(coalesce(p_idempotency_key, '')) = ''
     or p_delivery_method not in ('line', 'email', 'qr', 'link')
     or (p_delivery_method = 'email' and normalized_email is null) then
    raise exception using errcode = '22023', message = 'invalid_member_invitation_input';
  end if;

  select invitation.* into existing_invite
  from public.member_invitations as invitation
  where invitation.idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object(
      'invitation_id', existing_invite.id,
      'membership_id', existing_invite.membership_id,
      'invitation_status', existing_invite.invitation_status,
      'idempotent', true,
      'token', null
    );
  end if;

  if normalized_email is not null then
    select person.* into target_person
    from public.people as person
    where lower(btrim(person.primary_email)) = normalized_email
    limit 1
    for update;
  end if;

  if not found and normalized_phone is not null then
    select person.* into target_person
    from public.people as person
    where regexp_replace(coalesce(person.primary_phone, ''), '[^0-9+]', '', 'g') = normalized_phone
    limit 1
    for update;
  end if;

  if not found then
    insert into public.people (canonical_name, primary_phone, primary_email, birth_date)
    values (btrim(p_name), normalized_phone, normalized_email, p_birth_date)
    returning * into target_person;
  else
    select exists (
      select 1
      from public.club_memberships as existing_membership
      where existing_membership.person_id = target_person.id
        and existing_membership.club_id <> p_club_id
        and existing_membership.membership_status in ('invited', 'active', 'suspended', 'disabled')
    ) into shared_elsewhere;

    if shared_elsewhere and not public.current_has_platform_role(array['superadmin', 'platform_admin']) then
      if normalized_email is not null
         and target_person.primary_email is not null
         and lower(btrim(target_person.primary_email)) <> normalized_email then
        raise exception using errcode = '42501', message = 'shared_identity_contact_mismatch';
      end if;
      if normalized_phone is not null
         and target_person.primary_phone is not null
         and regexp_replace(target_person.primary_phone, '[^0-9+]', '', 'g') <> normalized_phone then
        raise exception using errcode = '42501', message = 'shared_identity_contact_mismatch';
      end if;
      -- The caller may add a club membership, but cannot rewrite the global person.
    else
      update public.people
      set canonical_name = coalesce(nullif(btrim(p_name), ''), canonical_name),
          primary_phone = coalesce(primary_phone, normalized_phone),
          primary_email = coalesce(primary_email, normalized_email),
          birth_date = coalesce(birth_date, p_birth_date)
      where id = target_person.id
      returning * into target_person;
    end if;
  end if;

  select membership.* into target_membership
  from public.club_memberships as membership
  where membership.club_id = p_club_id
    and membership.person_id = target_person.id
    and membership.membership_status in ('invited', 'active', 'suspended', 'disabled')
  order by membership.created_at desc
  limit 1
  for update;

  if found and target_membership.membership_status <> 'invited' then
    raise exception using errcode = '23505', message = 'member_already_exists_in_club';
  end if;

  if not found then
    insert into public.club_memberships (
      club_id, person_id, membership_status, created_by_app_account_id
    ) values (
      p_club_id, target_person.id, 'invited', actor_id
    )
    returning * into target_membership;
  end if;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.member_invitations (
    club_id, person_id, membership_id, delivery_method, token_hash, token_prefix,
    invitation_status, invited_by_app_account_id, idempotency_key, sent_at
  ) values (
    p_club_id, target_person.id, target_membership.id, p_delivery_method,
    encode(extensions.digest(raw_token, 'sha256'), 'hex'), left(raw_token, 8),
    'sent', actor_id, p_idempotency_key, now()
  )
  returning * into new_invite;

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
      'shared_identity_preserved', shared_elsewhere
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

commit;
