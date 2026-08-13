begin;

-- The member directory card needs a profession-style line under the name
-- (matching the reference design), not contact info. people has no such
-- field yet; add it as public profile data (unlike phone/email/birth year,
-- not privacy-gated — an occupation tag is display-directory content, not
-- a contact channel).
alter table public.people add column occupation text
  check (occupation is null or char_length(occupation) <= 100);

-- One-time backfill: LINE Login has been capturing a real profile picture
-- into line_identities.picture_url all along (see the prior migration),
-- but people.avatar_url only gets synced going forward, on the next bind
-- or login. Anyone who logged in before that fix would otherwise keep
-- showing the initial-letter placeholder until they happen to log in again.
update public.people as person
set avatar_url = identity.picture_url
from public.line_identities as identity
where identity.person_id = person.id
  and identity.identity_status = 'active'
  and identity.picture_url is not null
  and person.avatar_url is null;

-- Adding a parameter changes the function's identity (name + input types),
-- so CREATE OR REPLACE would create a second overload instead of replacing
-- this one, leaving calls with the old 4-argument shape ambiguous.
drop function if exists public.update_my_profile(text, text, text, date);

create or replace function public.update_my_profile(
  p_name text,
  p_phone text,
  p_email text,
  p_birth_date date,
  p_occupation text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor public.app_accounts;
  normalized_name text := btrim(coalesce(p_name, ''));
  normalized_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
  normalized_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  normalized_occupation text := nullif(btrim(coalesce(p_occupation, '')), '');
begin
  select account.* into actor
  from public.app_accounts as account
  where account.auth_user_id = auth.uid()
    and account.account_status = 'active'
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'active_account_required';
  end if;

  if normalized_name = '' or char_length(normalized_name) > 160
     or (normalized_phone is null and normalized_email is null)
     or (normalized_phone is not null and char_length(normalized_phone) > 40)
     or (normalized_email is not null and (
       char_length(normalized_email) > 320
       or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     ))
     or (p_birth_date is not null and (
       p_birth_date < date '1900-01-01'
       or p_birth_date > current_date
     ))
     or (normalized_occupation is not null and char_length(normalized_occupation) > 100) then
    raise exception using errcode = '22023', message = 'invalid_self_profile_input';
  end if;

  update public.people
  set canonical_name = normalized_name,
      primary_phone = normalized_phone,
      primary_email = normalized_email,
      birth_date = p_birth_date,
      occupation = normalized_occupation
  where id = actor.person_id;

  update public.app_accounts
  set account_display_name = normalized_name
  where id = actor.id;

  insert into public.audit_logs (
    club_id,
    actor_app_account_id,
    action_key,
    subject_type,
    subject_id,
    metadata
  ) values (
    null,
    actor.id,
    'member.self_profile_updated',
    'person',
    actor.person_id,
    jsonb_build_object(
      'has_phone', normalized_phone is not null,
      'has_email', normalized_email is not null,
      'has_birth_date', p_birth_date is not null,
      'has_occupation', normalized_occupation is not null
    )
  );

  return jsonb_build_object(
    'display_name', normalized_name,
    'phone', normalized_phone,
    'email', normalized_email,
    'birth_date', p_birth_date,
    'occupation', normalized_occupation
  );
end;
$$;

create or replace function public.get_my_identity_center()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  account_id uuid := public.current_app_account_id();
  current_session_id uuid;
  result jsonb;
begin
  if account_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  begin
    current_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when invalid_text_representation then
    current_session_id := null;
  end;

  select jsonb_build_object(
    'account', jsonb_build_object(
      'status', account.account_status,
      'has_active_access', public.account_has_active_access(account.id),
      'has_password_login', exists (
        select 1
        from auth.users as users
        where users.id = account.auth_user_id
          and nullif(users.encrypted_password, '') is not null
          and lower(coalesce(users.email, '')) not like '%@identity.local'
      )
    ),
    'profile', jsonb_build_object(
      'display_name', person.canonical_name,
      'phone', person.primary_phone,
      'email', person.primary_email,
      'birth_date', person.birth_date,
      'avatar_url', person.avatar_url,
      'occupation', person.occupation,
      'profile_completed_at', person.profile_completed_at
    ),
    'line_identity', (
      select jsonb_build_object(
        'id', identity.id,
        'status', identity.identity_status,
        'display_name', identity.display_name,
        'picture_url', identity.picture_url,
        'bound_at', identity.bound_at,
        'last_login_at', identity.last_login_at
      )
      from public.line_identities as identity
      where identity.app_account_id = account_id
        and identity.identity_status = 'active'
      order by identity.created_at desc
      limit 1
    ),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', device.id,
        'name', device.device_name,
        'trusted', device.trusted,
        'last_seen_at', device.last_seen_at,
        'revoked_at', device.revoked_at,
        'is_current', current_session_id is not null and device.session_id = current_session_id
      ) order by device.last_seen_at desc)
      from public.user_devices as device
      where device.app_account_id = account_id
    ), '[]'::jsonb),
    'login_history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider', history.provider_key,
        'outcome', history.outcome,
        'created_at', history.created_at,
        'user_agent', history.user_agent
      ) order by history.created_at desc)
      from (
        select * from public.login_history
        where app_account_id = account_id
        order by created_at desc
        limit 20
      ) as history
    ), '[]'::jsonb),
    'notification_settings', (
      select to_jsonb(settings) - 'app_account_id'
      from public.notification_settings as settings
      where settings.app_account_id = account_id
    ),
    'privacy_settings', (
      select to_jsonb(settings) - 'app_account_id'
      from public.privacy_settings as settings
      where settings.app_account_id = account_id
    )
  ) into result
  from public.app_accounts as account
  join public.people as person on person.id = account.person_id
  where account.id = account_id;

  return result;
end;
$$;

-- Directory card now shows occupation instead of contact info under the
-- name; not privacy-gated (see column comment above). Adding a column to
-- the RETURNS TABLE signature requires dropping the old function first —
-- CREATE OR REPLACE cannot change the OUT parameter list.
drop function if exists public.list_club_member_directory(uuid, text);

create or replace function public.list_club_member_directory(
  p_club_id uuid,
  p_query text default null
)
returns table (
  membership_id uuid,
  display_name text,
  avatar_url text,
  role_key text,
  occupation text,
  email text,
  phone text,
  birth_year integer,
  is_self boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  with caller as (
    select account.person_id
    from public.app_accounts as account
    where account.auth_user_id = auth.uid()
      and account.account_status = 'active'
  )
  select
    membership.id,
    person.canonical_name,
    person.avatar_url,
    coalesce(role_assignment.role_key, 'member'),
    person.occupation,
    case
      when person.id = caller.person_id or coalesce(privacy.show_email_to_club, false)
        then person.primary_email
      else null
    end,
    case
      when person.id = caller.person_id or coalesce(privacy.show_phone_to_club, false)
        then person.primary_phone
      else null
    end,
    case
      when person.id = caller.person_id or coalesce(privacy.show_birthday_year, false)
        then extract(year from person.birth_date)::integer
      else null
    end,
    person.id = caller.person_id
  from public.club_memberships as membership
  join public.people as person on person.id = membership.person_id
  cross join caller
  left join public.app_accounts as target_account
    on target_account.person_id = person.id
   and target_account.account_status = 'active'
  left join public.privacy_settings as privacy
    on privacy.app_account_id = target_account.id
  left join lateral (
    select assignment.role_key
    from public.club_role_assignments as assignment
    where assignment.club_id = membership.club_id
      and assignment.app_account_id = target_account.id
      and assignment.assignment_status = 'active'
    order by case assignment.role_key
      when 'president' then 1
      when 'secretary' then 2
      when 'finance' then 3
      else 4
    end
    limit 1
  ) as role_assignment on true
  where (public.current_has_active_club_membership(p_club_id) or public.current_can_manage_club(p_club_id))
    and membership.club_id = p_club_id
    and membership.membership_status = 'active'
    and (
      nullif(btrim(coalesce(p_query, '')), '') is null
      or person.canonical_name ilike '%' || btrim(p_query) || '%'
    )
  order by
    case coalesce(role_assignment.role_key, 'member')
      when 'president' then 1
      when 'secretary' then 2
      when 'finance' then 3
      else 4
    end,
    person.canonical_name,
    membership.id
$$;

commit;
