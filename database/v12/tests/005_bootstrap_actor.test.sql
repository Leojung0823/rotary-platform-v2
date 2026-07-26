BEGIN;
SET LOCAL search_path = extensions, public, pg_catalog;
SELECT plan(9);

SELECT is((SELECT count(*) FROM public.accounts WHERE account_kind = 'system'), 1::bigint, 'seed creates one system actor');
SELECT ok((SELECT bool_and(account_person_id IS NULL AND account_auth_user_id IS NULL AND account_status = 'active') FROM public.accounts WHERE account_kind = 'system'), 'system actor has no Person, Auth user, or login state');
SELECT is((SELECT count(*) FROM public.roles WHERE role_is_system_role AND role_status = 'active'), 6::bigint, 'six protected RBAC roles are seeded');
SELECT is((SELECT count(*) FROM public.permissions WHERE permission_status = 'active'), 12::bigint, 'permission catalog is seeded');
SELECT is((SELECT count(*) FROM public.role_permissions), 36::bigint, 'role-permission grants are seeded');
SELECT ok((SELECT bool_and(a.account_kind = 'system') FROM public.role_permissions rp JOIN public.accounts a ON a.account_id = rp.role_permission_granted_by_account_id), 'all seed grants are attributed to a system actor');
SELECT is((SELECT count(*) FROM public.platform_role_assignments), 0::bigint, 'seed does not fabricate the first human platform admin');
SELECT is((SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname LIKE '%bootstrap%'), 0::bigint, 'bootstrap exposes no ambient executable database function');
SELECT throws_ok(
  $$INSERT INTO public.auth_reconciliation_issues
      (auth_reconciliation_issue_account_id, auth_reconciliation_issue_type)
    SELECT account_id, 'missing_auth_user' FROM public.accounts
    WHERE account_kind = 'system' ORDER BY account_created_at LIMIT 1$$,
  '23514', NULL,
  'Auth reconciliation excludes system Accounts'
);

SELECT * FROM finish();
ROLLBACK;
