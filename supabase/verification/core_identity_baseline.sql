-- Run after `npx supabase db reset --local`.
-- This script is read-only and fails if the baseline security invariants drift.

do $$
declare
  expected_tables constant text[] := array[
    'people',
    'app_accounts',
    'platform_roles',
    'clubs',
    'club_memberships',
    'club_operator_permissions',
    'club_operator_invites',
    'audit_logs'
  ];
  missing_tables text[];
  rls_disabled_tables text[];
  exposed_tables text[];
begin
  select array_agg(expected.table_name order by expected.table_name)
    into missing_tables
  from unnest(expected_tables) as expected(table_name)
  where to_regclass(format('public.%I', expected.table_name)) is null;

  if missing_tables is not null then
    raise exception 'Missing baseline tables: %', missing_tables;
  end if;

  select array_agg(class.relname order by class.relname)
    into rls_disabled_tables
  from pg_class as class
  join pg_namespace as namespace
    on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relname = any(expected_tables)
    and class.relkind in ('r', 'p')
    and not class.relrowsecurity;

  if rls_disabled_tables is not null then
    raise exception 'RLS is disabled on baseline tables: %', rls_disabled_tables;
  end if;

  select array_agg(distinct grants.table_name order by grants.table_name)
    into exposed_tables
  from information_schema.role_table_grants as grants
  where grants.table_schema = 'public'
    and grants.table_name = any(expected_tables)
    and grants.grantee in ('anon', 'authenticated');

  if exposed_tables is not null then
    raise exception 'Direct anon/authenticated table privileges found: %', exposed_tables;
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'club_memberships_one_active_per_person_per_club'
      and indexdef like '%(club_id, person_id)%'
      and indexdef like '%membership_status = ''active''%'
  ) then
    raise exception 'Missing per-club active membership uniqueness index.';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'club_operator_permissions_one_active_per_account_per_club'
      and indexdef like '%(club_id, app_account_id)%'
      and indexdef like '%assignment_status = ''active''%'
  ) then
    raise exception 'Missing active operator uniqueness index.';
  end if;

  if exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'club_operator_permissions'
      and indexdef like '%UNIQUE%'
      and indexdef like '%(club_id)%'
      and indexdef not like '%app_account_id%'
  ) then
    raise exception 'A club-wide unique index would incorrectly limit a club to one operator.';
  end if;

  -- Membership and operator authority used to be mutually exclusive, enforced
  -- by a trigger on each table. Rotary practice allows dual membership and
  -- allows a member of one club to serve as another club's executive secretary,
  -- so both triggers were dropped deliberately. Asserting their absence keeps
  -- the removal explicit: a reintroduced trigger would start refusing the
  -- pairings the platform now supports.
  if exists (
    select 1
    from pg_trigger
    where tgname in (
      'club_memberships_prevent_operator_overlap',
      'club_operator_permissions_prevent_member_overlap'
    )
      and not tgisinternal
  ) then
    raise exception 'The member/operator overlap triggers were reintroduced; dual membership is intended.';
  end if;

  -- What must not be lost with them: a membership row is not authority. That
  -- is asserted against live data in operator_membership_coexistence_security.
  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('prevent_member_operator_overlap', 'prevent_operator_member_overlap')
  ) then
    raise exception 'The overlap trigger functions still exist and could be re-attached.';
  end if;
end;
$$;

select
  class.relname as table_name,
  class.relrowsecurity as rls_enabled,
  class.relforcerowsecurity as force_rls
from pg_class as class
join pg_namespace as namespace
  on namespace.oid = class.relnamespace
where namespace.nspname = 'public'
  and class.relname in (
    'people',
    'app_accounts',
    'platform_roles',
    'clubs',
    'club_memberships',
    'club_operator_permissions',
    'club_operator_invites',
    'audit_logs'
  )
order by class.relname;
