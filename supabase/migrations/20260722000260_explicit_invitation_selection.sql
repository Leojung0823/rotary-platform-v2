begin;

create or replace function public.current_verified_auth_email()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select lower(btrim(user_record.email))
  from auth.users as user_record
  where user_record.id = auth.uid()
    and user_record.email_confirmed_at is not null
    and btrim(coalesce(user_record.email, '')) <> ''
$$;

create or replace function public.list_current_operator_invitations()
returns table (
  invite_id uuid,
  club_id uuid,
  club_code text,
  club_name text,
  display_name text,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  verified_email text := public.current_verified_auth_email();
begin
  if verified_email is null then
    raise exception using errcode = '42501', message = 'verified_email_required';
  end if;

  return query
  select
    invite.id,
    club.id,
    club.club_code,
    club.club_name,
    invite.display_name,
    invite.expires_at
  from public.club_operator_invites as invite
  join public.clubs as club on club.id = invite.club_id
  where invite.email_normalized = verified_email
    and invite.invite_status in ('pending', 'sent')
    and invite.expires_at > pg_catalog.clock_timestamp()
  order by invite.created_at, invite.id;
end;
$$;

create or replace function public.accept_selected_operator_invitation(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  verified_email text := public.current_verified_auth_email();
begin
  if verified_email is null then
    raise exception using errcode = '42501', message = 'verified_email_required';
  end if;
  if p_invite_id is null then
    raise exception using errcode = '22023', message = 'invitation_selection_required';
  end if;

  if not exists (
    select 1
    from public.club_operator_invites as invite
    where invite.id = p_invite_id
      and invite.email_normalized = verified_email
      and invite.invite_status in ('pending', 'sent', 'accepted')
  ) then
    raise exception using errcode = 'P0002', message = 'matching_invitation_not_found';
  end if;

  return public.accept_operator_invitation(p_invite_id);
end;
$$;

-- The legacy nullable selector can silently choose the wrong club when one email
-- has multiple invitations. Keep it as an internal implementation detail only.
revoke execute on function public.accept_operator_invitation(uuid) from authenticated;

revoke all on function public.current_verified_auth_email()
  from public, anon, authenticated;
revoke all on function public.list_current_operator_invitations()
  from public, anon;
revoke all on function public.accept_selected_operator_invitation(uuid)
  from public, anon;

grant execute on function public.list_current_operator_invitations() to authenticated;
grant execute on function public.accept_selected_operator_invitation(uuid) to authenticated;

commit;
