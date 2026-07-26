BEGIN;
SET LOCAL search_path = extensions, public, pg_catalog;
SELECT plan(5);

SELECT has_schema('v12_test', 'shared pgTAP helper schema is bootstrapped');
SELECT ok(
  to_regprocedure('v12_test.seed_catalog_is_valid()') IS NOT NULL,
  'shared seed assertion helper exists'
);
SELECT ok(
  to_regprocedure('v12_test.create_organization_fixture(text)') IS NOT NULL,
  'shared organization fixture exists'
);
SELECT lives_ok(
  $$SELECT * FROM v12_test.create_organization_fixture('framework-test')$$,
  'shared fixture creates deterministic synthetic organization rows'
);
SELECT ok(
  v12_test.seed_catalog_is_valid(),
  'shared assertion validates the seeded foundation catalog'
);

SELECT * FROM finish();
ROLLBACK;
