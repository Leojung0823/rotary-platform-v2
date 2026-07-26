BEGIN;
SET LOCAL search_path = extensions, public, pg_catalog;
SELECT plan(6);

WITH names AS (
  SELECT relname AS identifier FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
  UNION ALL
  SELECT attname FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
  UNION ALL
  SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
  UNION ALL
  SELECT conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'
  UNION ALL
  SELECT tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
)
SELECT is((SELECT count(*) FROM names WHERE octet_length(identifier) > 55), 0::bigint, 'all public identifiers fit 55 UTF-8 bytes');

SELECT is(
  (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
   WHERE n.nspname = 'public' AND c.conname !~ '^(pk|fk|uq|ck|ex)_'),
  0::bigint,
  'all constraints use an approved prefix'
);
SELECT is(
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'i' AND c.relname !~ '^(pk|uq|ix|ex)_'),
  0::bigint,
  'all indexes use an approved prefix'
);
SELECT is(
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'S' AND c.relname !~ '^seq_'),
  0::bigint,
  'all sequences use seq_ prefix'
);
SELECT is(
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgname !~ '^trg_'),
  0::bigint,
  'all user triggers use trg_ prefix'
);
SELECT is(
  (SELECT count(*) FROM (SELECT conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' GROUP BY conname HAVING count(*) > 1) duplicate_names),
  0::bigint,
  'constraint names are unique in public schema'
);

SELECT * FROM finish();
ROLLBACK;
