begin;

-- 社長 answers for the club's own record, but could not maintain it. Two
-- functions decided who may: both asked current_can_manage_club, which knows
-- only platform authority and the delegated 執行秘書 seat, and has never
-- recognised a club role assignment. So a president -- who already holds
-- dashboard.read, member.manage, role.manage and the rest through
-- role_permissions -- opened 社務資料 and was told they had no permission.
--
-- The authority is expressed where every other club authority already lives:
-- a permission key granted to the role. current_can_manage_club stays in the
-- gate, so the 執行秘書 path is untouched.

insert into public.permissions (permission_key, description_zh_hant) values
  ('club.manage', '維護社務資料：扶輪社名稱與基本資料')
on conflict (permission_key) do nothing;

-- Not granted to secretary: an executive secretary reaches the same page
-- through current_can_manage_club, and widening the secretary role would also
-- hand it to every 秘書 role assignment, which was not asked for.
insert into public.role_permissions (role_key, permission_key) values
  ('platform_admin', 'club.manage'),
  ('president', 'club.manage')
on conflict (role_key, permission_key) do nothing;

-- The page a president lands on reads this first. Without the same widening it
-- would refuse them before the rename was ever reached. It also now returns the
-- English name, and says whether this caller may edit any of it, so the form is
-- shown by the same rule that decides whether a save is accepted.
create or replace function public.get_club_provisioning_status(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  auth_email text;
  can_manage_profile boolean;
  result jsonb;
begin
  select lower(btrim(coalesce(user_record.email, ''))) into auth_email
  from auth.users as user_record where user_record.id = auth.uid();

  can_manage_profile := public.current_can_manage_club(p_club_id)
    or public.current_has_club_permission(p_club_id, 'club.manage');

  if not can_manage_profile and not exists (
    select 1 from public.club_operator_invites as invite
    where invite.club_id = p_club_id
      and invite.email_normalized = auth_email
      and invite.invite_status in ('pending', 'sent')
      and invite.expires_at > now()
  ) then
    raise exception using errcode = '42501', message = 'club_access_required';
  end if;

  select jsonb_build_object(
    'club_id', club.id,
    'club_code', club.club_code,
    'club_name', club.club_name,
    'english_name', club.english_name,
    'club_status', club.club_status,
    'activated_at', club.activated_at,
    'can_manage_profile', can_manage_profile,
    'active_operator_count', (
      select count(*) from public.club_operator_permissions as permission
      where permission.club_id = club.id
        and permission.assignment_status = 'active'
        and permission.starts_at <= now()
        and (permission.ends_at is null or permission.ends_at > now())
    ),
    'pending_invitation_count', (
      select count(*) from public.club_operator_invites as invite
      where invite.club_id = club.id
        and invite.invite_status in ('pending', 'sent')
        and invite.expires_at > now()
    )
  ) into result
  from public.clubs as club
  where club.id = p_club_id;

  if result is null then
    raise exception using errcode = 'P0002', message = 'club_not_found';
  end if;
  return result;
end;
$$;

-- Replaced rather than overloaded: a defaulted third argument alongside the
-- two-argument function would make every existing call ambiguous.
drop function if exists public.update_club_name(uuid, text);

create function public.update_club_name(
  p_club_id uuid,
  p_club_name text,
  p_english_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target_club public.clubs;
  previous_name text;
  previous_english text;
  normalized_name text := btrim(coalesce(p_club_name, ''));
  -- null means "leave it as it is", so a caller that does not know about the
  -- English name cannot silently erase it. An empty string is a deliberate
  -- clear, which is why the two are not collapsed.
  english_provided boolean := p_english_name is not null;
  normalized_english text := nullif(btrim(coalesce(p_english_name, '')), '');
begin
  if actor_id is null or not (
    public.current_can_manage_club(p_club_id)
    or public.current_has_club_permission(p_club_id, 'club.manage')
  ) then
    raise exception using errcode = '42501', message = 'club_manager_required';
  end if;

  if char_length(normalized_name) < 2
     or char_length(normalized_name) > 100
     or normalized_name ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'invalid_club_name';
  end if;

  if english_provided and normalized_english is not null and (
    char_length(normalized_english) < 2
    or char_length(normalized_english) > 100
    or normalized_english ~ '[[:cntrl:]]'
  ) then
    raise exception using errcode = '22023', message = 'invalid_club_english_name';
  end if;

  select * into target_club
  from public.clubs
  where id = p_club_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'club_not_found';
  end if;

  previous_name := target_club.club_name;
  previous_english := target_club.english_name;
  if not english_provided then
    normalized_english := previous_english;
  end if;

  if previous_name = normalized_name
     and previous_english is not distinct from normalized_english then
    return jsonb_build_object(
      'club_id', target_club.id,
      'club_name', target_club.club_name,
      'english_name', target_club.english_name,
      'idempotent', true
    );
  end if;

  update public.clubs
  set club_name = normalized_name,
      english_name = normalized_english
  where id = p_club_id
  returning * into target_club;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    target_club.id,
    actor_id,
    'club.renamed',
    'club',
    target_club.id,
    jsonb_build_object(
      'club_name', normalized_name,
      'before', jsonb_build_object(
        'club_name', previous_name,
        'english_name', previous_english
      ),
      'after', jsonb_build_object(
        'club_name', normalized_name,
        'english_name', normalized_english
      )
    )
  );

  return jsonb_build_object(
    'club_id', target_club.id,
    'club_name', target_club.club_name,
    'english_name', target_club.english_name,
    'idempotent', false
  );
end;
$$;

revoke all on function public.update_club_name(uuid, text, text) from public, anon, authenticated;
grant execute on function public.update_club_name(uuid, text, text) to authenticated;

commit;
