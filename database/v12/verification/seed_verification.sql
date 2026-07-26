\set ON_ERROR_STOP on

DO $$
BEGIN
  IF (SELECT count(*) FROM public.accounts WHERE account_kind = 'system') <> 1 THEN
    RAISE EXCEPTION 'Expected one deterministic system actor';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.accounts
    WHERE account_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND account_kind = 'system'
      AND account_status = 'active'
      AND account_person_id IS NULL
      AND account_auth_user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Deterministic system actor invariant drifted';
  END IF;
  IF (SELECT count(*) FROM public.roles) <> 6
    OR (SELECT count(*) FROM public.permissions) <> 12
    OR (SELECT count(*) FROM public.role_permissions) <> 36 THEN
    RAISE EXCEPTION 'Seeded RBAC catalog counts drifted';
  END IF;
  IF (SELECT count(*) FROM v12_meta.seed_versions) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM v12_meta.seed_versions
      WHERE seed_version = '0001_system_actor_and_rbac'
    ) THEN
    RAISE EXCEPTION 'Seed version registry drifted';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.accounts WHERE account_kind = 'human'
  ) OR EXISTS (
    SELECT 1 FROM public.people
  ) OR EXISTS (
    SELECT 1 FROM public.invitations
  ) THEN
    RAISE EXCEPTION 'Foundation seed must not create people, human accounts, or invitations';
  END IF;
END;
$$;

SELECT seed_version, seed_description, seed_applied_at
FROM v12_meta.seed_versions
ORDER BY seed_version;
