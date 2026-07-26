\set ON_ERROR_STOP on

DO $$
DECLARE
  versions text[];
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'Supabase migration history is missing from the V1.2 workdir';
  END IF;

  SELECT array_agg(version ORDER BY version)
  INTO versions
  FROM supabase_migrations.schema_migrations;

  IF versions IS DISTINCT FROM ARRAY['0001', '0002']::text[] THEN
    RAISE EXCEPTION 'Unexpected V1.2 migration history: %', versions;
  END IF;
END;
$$;

SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version;
