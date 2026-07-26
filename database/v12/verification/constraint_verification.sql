\set ON_ERROR_STOP on

DO $$
DECLARE
  violation_count bigint;
BEGIN
  SELECT count(*) INTO violation_count
  FROM pg_class table_class
  JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
  WHERE namespace.nspname = 'public'
    AND table_class.relkind = 'r'
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint constraint_record
      WHERE constraint_record.conrelid = table_class.oid
        AND constraint_record.contype = 'p'
    );
  IF violation_count <> 0 THEN
    RAISE EXCEPTION '% public tables are missing a named primary key', violation_count;
  END IF;

  SELECT count(*) INTO violation_count
  FROM pg_constraint constraint_record
  WHERE constraint_record.connamespace = 'public'::regnamespace
    AND NOT constraint_record.convalidated;
  IF violation_count <> 0 THEN
    RAISE EXCEPTION '% public constraints are not validated', violation_count;
  END IF;

  SELECT count(*) INTO violation_count
  FROM pg_constraint constraint_record
  WHERE constraint_record.connamespace = 'public'::regnamespace
    AND constraint_record.contype = 'f'
    AND constraint_record.confdeltype <> 'r';
  IF violation_count <> 0 THEN
    RAISE EXCEPTION '% public foreign keys do not use ON DELETE RESTRICT', violation_count;
  END IF;

  SELECT count(*) INTO violation_count
  FROM pg_class table_class
  JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
  WHERE namespace.nspname = 'public'
    AND table_class.relkind = 'r'
    AND obj_description(table_class.oid, 'pg_class') IS NULL;
  IF violation_count <> 0 THEN
    RAISE EXCEPTION '% public tables are missing comments', violation_count;
  END IF;

  SELECT count(*) INTO violation_count
  FROM pg_attribute attribute
  JOIN pg_class table_class ON table_class.oid = attribute.attrelid
  JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
  WHERE namespace.nspname = 'public'
    AND table_class.relkind = 'r'
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND col_description(table_class.oid, attribute.attnum) IS NULL;
  IF violation_count <> 0 THEN
    RAISE EXCEPTION '% public columns are missing comments', violation_count;
  END IF;
END;
$$;

SELECT
  count(*) FILTER (WHERE contype = 'p') AS primary_key_count,
  count(*) FILTER (WHERE contype = 'f') AS foreign_key_count,
  count(*) FILTER (WHERE contype = 'u') AS unique_constraint_count,
  count(*) FILTER (WHERE contype = 'c') AS check_constraint_count,
  count(*) FILTER (WHERE contype = 'x') AS exclusion_constraint_count
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace;
