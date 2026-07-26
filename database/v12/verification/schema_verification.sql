\set ON_ERROR_STOP on

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') <> 31 THEN
    RAISE EXCEPTION 'Expected exactly 31 V1.2 public tables';
  END IF;
  IF (SELECT count(*) FROM public.accounts WHERE account_kind = 'system') <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one seeded system actor';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.accounts
    WHERE account_kind = 'system'
      AND (account_person_id IS NOT NULL OR account_auth_user_id IS NOT NULL OR account_status <> 'active')
  ) THEN
    RAISE EXCEPTION 'System actor violates non-login invariant';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'person_merged_into_person_id'
  ) THEN
    RAISE EXCEPTION 'Person merge column must not exist';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
  ) THEN
    RAISE EXCEPTION 'RLS policies are outside the V1.2 PR-02 boundary';
  END IF;
  IF to_regclass('v12_meta.seed_versions') IS NULL THEN
    RAISE EXCEPTION 'V1.2 seed version registry is missing';
  END IF;
END;
$$;

SELECT
  (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') AS table_count,
  (SELECT count(*) FROM public.roles) AS role_count,
  (SELECT count(*) FROM public.permissions) AS permission_count,
  (SELECT count(*) FROM public.role_permissions) AS grant_count,
  (SELECT count(*) FROM v12_meta.seed_versions) AS seed_version_count,
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relnamespace = 'public'::regnamespace AND NOT t.tgisinternal) AS trigger_count;
