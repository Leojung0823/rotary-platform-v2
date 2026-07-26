CREATE OR REPLACE FUNCTION v12_test.seed_catalog_is_valid()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    (SELECT count(*) = 1 FROM public.accounts WHERE account_kind = 'system')
    AND (SELECT count(*) = 6 FROM public.roles)
    AND (SELECT count(*) = 12 FROM public.permissions)
    AND (SELECT count(*) = 36 FROM public.role_permissions)
    AND (SELECT count(*) = 1 FROM v12_meta.seed_versions)
$$;

COMMENT ON FUNCTION v12_test.seed_catalog_is_valid() IS 'Shared pgTAP assertion helper for deterministic V1.2 seed catalog counts.';
