begin;

-- "Disabled" members stayed mixed into the member list, so a club that has been
-- running for a while shows more former members than current ones. They move to
-- their own page, newest archive first.
--
-- Sorting by archive time needed a timestamp that did not exist. ended_on is a
-- date, and updated_at moves on any later edit, so neither answers "when was
-- this person archived". A dedicated column does, and the audit trail already
-- records the moment each status change happened, so existing rows are
-- backfilled from it rather than guessed at.
--
-- set_membership_status is restated from its current definition (session and
-- device revocation, the self-suspend guard, the richer audit metadata) with
-- only archived_at added. Reviving the original 2026-07-22 body instead dropped
-- device revocation, which the verification suite caught.

alter table public.club_memberships
  add column archived_at timestamptz;

comment on column public.club_memberships.archived_at is
  'When the membership was archived (disabled or ended). Null while the member is current.';

update public.club_memberships as membership
set archived_at = coalesce(
  (
    select log.created_at
    from public.audit_logs as log
    where log.subject_type = 'club_membership'
      and log.subject_id = membership.id
      and log.action_key = 'membership.status_changed'
      and log.metadata ->> 'status' in ('disabled', 'ended')
    order by log.created_at desc
    limit 1
  ),
  membership.updated_at
)
where membership.membership_status in ('disabled', 'ended')
  and membership.archived_at is null;

create index club_memberships_archived_idx
  on public.club_memberships (club_id, archived_at desc)
  where membership_status in ('disabled', 'ended');

create or replace function public.set_membership_status(
  p_club_id uuid,
  p_membership_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target_membership public.club_memberships;
  target_account public.app_accounts;
  previous_status text;
  revoked_sessions integer := 0;
begin
  if actor_id is null
     or not public.current_has_club_permission(p_club_id, 'member.manage')
     or p_status not in ('active', 'suspended', 'disabled') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;

  select membership.* into target_membership
  from public.club_memberships as membership
  where membership.id = p_membership_id
    and membership.club_id = p_club_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'membership_not_found';
  end if;

  previous_status := target_membership.membership_status;

  select account.* into target_account
  from public.app_accounts as account
  where account.person_id = target_membership.person_id
  for update;

  if target_account.id = actor_id
     and p_status <> 'active'
     and not public.current_has_platform_role(array['superadmin', 'platform_admin']) then
    raise exception using errcode = '42501', message = 'self_membership_suspend_requires_platform_admin';
  end if;

  update public.club_memberships
  set membership_status = p_status,
      ended_on = case when p_status = 'disabled' then current_date else null end,
      -- Set on the way in, cleared on the way out, so restoring a member returns
      -- them to the main list instead of leaving a stale archive timestamp.
      archived_at = case when p_status = 'disabled' then now() else null end
  where id = target_membership.id;

  if target_account.id is not null
     and p_status <> 'active'
     and not public.account_has_active_access(target_account.id) then
    delete from auth.sessions
    where user_id = target_account.auth_user_id;
    get diagnostics revoked_sessions = row_count;

    update public.user_devices
    set revoked_at = coalesce(revoked_at, now()),
        trusted = false,
        updated_at = now()
    where app_account_id = target_account.id
      and revoked_at is null;
  end if;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'membership.status_changed', 'club_membership', target_membership.id,
    jsonb_build_object(
      'previous_status', previous_status,
      'status', p_status,
      'reason', btrim(coalesce(p_reason, '')),
      'sessions_revoked', revoked_sessions
    )
  );
end;
$$;

create or replace function public.list_club_members(p_club_id uuid, p_query text default null, p_status text default null)
returns table (
  membership_id uuid, person_id uuid, app_account_id uuid, line_identity_id uuid, oa_follower_id uuid,
  display_name text, phone text, email text, birth_date date,
  membership_status text, role_key text, line_login_status text, oa_status text, created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select membership.id, person.id, account.id, identity.id, follower.id,
    person.canonical_name, person.primary_phone, person.primary_email, person.birth_date,
    membership.membership_status,
    coalesce((select assignment.role_key from public.club_role_assignments as assignment
      where assignment.club_id = membership.club_id and assignment.app_account_id = account.id
        and assignment.assignment_status = 'active'
      order by case assignment.role_key when 'president' then 1 when 'secretary' then 2 when 'finance' then 3 else 4 end
      limit 1), 'member'),
    case when identity.id is null then 'unbound' else identity.identity_status end,
    case when follower.id is null then 'unpaired' else follower.follower_status end,
    membership.created_at
  from public.club_memberships as membership
  join public.people as person on person.id = membership.person_id
  left join public.app_accounts as account on account.person_id = person.id
  left join public.line_identities as identity on identity.app_account_id = account.id and identity.identity_status = 'active'
  left join public.line_oa_followers as follower on follower.club_id = membership.club_id
    and follower.person_id = person.id and follower.follower_status = 'following'
  where membership.club_id = p_club_id
    and public.current_has_club_permission(p_club_id, 'member.read')
    and (p_status is null or membership.membership_status = p_status)
    -- Archived members live on their own page. They stay reachable here when a
    -- caller names the status explicitly, so the status filter keeps working.
    and (p_status is not null or membership.membership_status not in ('disabled', 'ended'))
    and (nullif(btrim(coalesce(p_query, '')), '') is null
      or person.canonical_name ilike '%' || btrim(p_query) || '%'
      or coalesce(person.primary_email, '') ilike '%' || btrim(p_query) || '%'
      or coalesce(person.primary_phone, '') ilike '%' || btrim(p_query) || '%')
  order by person.canonical_name, membership.id
$$;

create or replace function public.list_club_archived_members(p_club_id uuid, p_query text default null)
returns table (
  membership_id uuid, person_id uuid, app_account_id uuid, line_identity_id uuid, oa_follower_id uuid,
  display_name text, phone text, email text, birth_date date,
  membership_status text, role_key text, line_login_status text, oa_status text, created_at timestamptz,
  archived_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select membership.id, person.id, account.id, identity.id, follower.id,
    person.canonical_name, person.primary_phone, person.primary_email, person.birth_date,
    membership.membership_status,
    coalesce((select assignment.role_key from public.club_role_assignments as assignment
      where assignment.club_id = membership.club_id and assignment.app_account_id = account.id
        and assignment.assignment_status = 'active'
      order by case assignment.role_key when 'president' then 1 when 'secretary' then 2 when 'finance' then 3 else 4 end
      limit 1), 'member'),
    case when identity.id is null then 'unbound' else identity.identity_status end,
    case when follower.id is null then 'unpaired' else follower.follower_status end,
    membership.created_at,
    membership.archived_at
  from public.club_memberships as membership
  join public.people as person on person.id = membership.person_id
  left join public.app_accounts as account on account.person_id = person.id
  left join public.line_identities as identity on identity.app_account_id = account.id and identity.identity_status = 'active'
  left join public.line_oa_followers as follower on follower.club_id = membership.club_id
    and follower.person_id = person.id and follower.follower_status = 'following'
  where membership.club_id = p_club_id
    and public.current_has_club_permission(p_club_id, 'member.read')
    and membership.membership_status in ('disabled', 'ended')
    and (nullif(btrim(coalesce(p_query, '')), '') is null
      or person.canonical_name ilike '%' || btrim(p_query) || '%'
      or coalesce(person.primary_email, '') ilike '%' || btrim(p_query) || '%'
      or coalesce(person.primary_phone, '') ilike '%' || btrim(p_query) || '%')
  order by membership.archived_at desc nulls last, person.canonical_name, membership.id
$$;

revoke all on function public.list_club_archived_members(uuid, text) from public, anon;
grant execute on function public.list_club_archived_members(uuid, text) to authenticated;

commit;
