BEGIN;
SET LOCAL search_path = extensions, public, pg_catalog;
SELECT plan(7);

SELECT is((SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'person_merged_into_person_id'), 0::bigint, 'Person merge target column is absent');
SELECT is((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND lower(c.relname) LIKE '%person_merge%'), 0::bigint, 'Person merge relation/index is absent');
SELECT is((SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND lower(p.proname) LIKE '%person_merge%'), 0::bigint, 'Person merge function is absent');
SELECT is((SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public' AND lower(c.conname) LIKE '%person_merge%'), 0::bigint, 'Person merge constraint is absent');
SELECT throws_ok(
  $$INSERT INTO public.people (person_status) VALUES ('merged')$$,
  '23514', NULL,
  'Person status cannot be merged'
);
SELECT ok(
  (SELECT pg_get_constraintdef(oid) NOT LIKE '%merged%' FROM pg_constraint WHERE conname = 'ck_people__status'),
  'people status constraint contains no merged state'
);
SELECT ok(
  (SELECT pg_get_constraintdef(oid) LIKE '%manual_review_required%' AND pg_get_constraintdef(oid) LIKE '%create_new_person%'
   FROM pg_constraint WHERE conname = 'ck_person_match_cases__result'),
  'person matching resolves pre-create decisions without merging Persons'
);

SELECT * FROM finish();
ROLLBACK;
