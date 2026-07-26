\set ON_ERROR_STOP on

-- Controlled one-time bootstrap template.
-- Run only after replacing/providing these psql variables with a real existing
-- Supabase Auth user and the verified person's display name:
--   psql ... -v auth_user_id='...' -v chinese_name='...' \
--     -v english_name='...' -f first_platform_admin.sql
-- This script intentionally creates no Auth user, stores no password/token, and
-- grants the role through the seeded non-login system actor.

BEGIN;

CREATE TEMP TABLE v12_bootstrap_input ON COMMIT DROP AS
SELECT
  :'auth_user_id'::uuid AS auth_user_id,
  NULLIF(btrim(:'chinese_name'), '') AS chinese_name,
  NULLIF(btrim(:'english_name'), '') AS english_name;

DO $$
DECLARE
  requested_auth_user_id uuid;
  auth_user_exists boolean;
BEGIN
  SELECT auth_user_id INTO requested_auth_user_id FROM v12_bootstrap_input;

  IF requested_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_user_id is required';
  END IF;
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'auth.users does not exist; bootstrap must run in a Supabase database';
  END IF;

  EXECUTE 'SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = $1)'
    INTO auth_user_exists USING requested_auth_user_id;
  IF NOT auth_user_exists THEN
    RAISE EXCEPTION 'auth_user_id % does not exist in auth.users', requested_auth_user_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE account_kind = 'system') THEN
    RAISE EXCEPTION 'V1.2 system actor seed must run before bootstrap';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE role_code = 'platform.admin') THEN
    RAISE EXCEPTION 'V1.2 RBAC seed must run before bootstrap';
  END IF;
END;
$$;

WITH created_person AS (
  INSERT INTO public.people (
    person_chinese_name,
    person_english_name,
    person_status
  )
  SELECT chinese_name, english_name, 'active'
  FROM v12_bootstrap_input
  WHERE NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.account_auth_user_id = v12_bootstrap_input.auth_user_id
  )
  RETURNING person_id
), created_account AS (
  INSERT INTO public.accounts (
    account_kind,
    account_person_id,
    account_auth_user_id,
    account_status,
    account_creation_source,
    account_activated_at,
    account_updated_by_account_id
  )
  SELECT
    'human',
    created_person.person_id,
    v12_bootstrap_input.auth_user_id,
    'active',
    'administrative_repair',
    now(),
    actor.account_id
  FROM created_person
  CROSS JOIN v12_bootstrap_input
  CROSS JOIN LATERAL (
    SELECT account_id FROM public.accounts
    WHERE account_kind = 'system'
    ORDER BY account_created_at, account_id
    LIMIT 1
  ) actor
  RETURNING account_id
), bootstrap_account AS (
  SELECT account_id FROM created_account
  UNION ALL
  SELECT a.account_id
  FROM public.accounts a
  JOIN v12_bootstrap_input i ON i.auth_user_id = a.account_auth_user_id
  WHERE a.account_kind = 'human'
  LIMIT 1
), actor AS (
  SELECT account_id FROM public.accounts
  WHERE account_kind = 'system'
  ORDER BY account_created_at, account_id
  LIMIT 1
)
INSERT INTO public.platform_role_assignments (
  platform_role_assignment_account_id,
  platform_role_assignment_role_id,
  platform_role_assignment_starts_at,
  platform_role_assignment_status,
  platform_role_assignment_assigned_by_account_id,
  platform_role_assignment_reason_code,
  platform_role_assignment_reason_detail
)
SELECT
  bootstrap_account.account_id,
  roles.role_id,
  now(),
  'active',
  actor.account_id,
  'initial_platform_bootstrap',
  'Controlled first human platform administrator bootstrap.'
FROM bootstrap_account
CROSS JOIN actor
JOIN public.roles ON roles.role_code = 'platform.admin'
ON CONFLICT DO NOTHING;

COMMIT;
