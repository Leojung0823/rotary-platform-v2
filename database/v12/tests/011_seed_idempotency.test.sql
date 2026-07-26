BEGIN;
SET LOCAL search_path = extensions, public, pg_catalog;
SELECT plan(7);

SELECT is((SELECT count(*) FROM public.accounts WHERE account_kind = 'system'), 1::bigint, 'reapplied seed keeps one system actor');
SELECT is((SELECT count(*) FROM public.roles), 6::bigint, 'reapplied seed keeps six roles');
SELECT is((SELECT count(*) FROM public.permissions), 12::bigint, 'reapplied seed keeps twelve permissions');
SELECT is((SELECT count(*) FROM public.role_permissions), 36::bigint, 'reapplied seed keeps expected grants');
SELECT is((SELECT count(*) FROM (SELECT role_code FROM public.roles GROUP BY role_code HAVING count(*) > 1) d), 0::bigint, 'role codes remain unique');
SELECT is((SELECT count(*) FROM (SELECT permission_code FROM public.permissions GROUP BY permission_code HAVING count(*) > 1) d), 0::bigint, 'permission codes remain unique');
SELECT is((SELECT count(*) FROM (SELECT role_permission_role_id, role_permission_permission_id FROM public.role_permissions GROUP BY 1, 2 HAVING count(*) > 1) d), 0::bigint, 'role-permission pairs remain unique');

SELECT * FROM finish();
ROLLBACK;
