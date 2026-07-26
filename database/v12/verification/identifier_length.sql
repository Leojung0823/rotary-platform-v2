\set ON_ERROR_STOP on

CREATE TEMP VIEW v12_public_identifiers AS
SELECT 'relation'::text AS kind, relname::text AS identifier
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
UNION ALL
SELECT 'column', attname
FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
UNION ALL
SELECT 'function', proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
UNION ALL
SELECT 'constraint', conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'
UNION ALL
SELECT 'trigger', tgname
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal;

DO $$
DECLARE
  violation_count bigint;
BEGIN
  SELECT count(*) INTO violation_count
  FROM v12_public_identifiers
  WHERE octet_length(identifier) > 55;
  IF violation_count <> 0 THEN
    RAISE EXCEPTION '% public identifiers exceed 55 UTF-8 bytes', violation_count;
  END IF;

  SELECT count(*) INTO violation_count
  FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
  WHERE n.nspname = 'public' AND c.conname !~ '^(pk|fk|uq|ck|ex)_';
  IF violation_count <> 0 THEN
    RAISE EXCEPTION '% constraints have an invalid prefix', violation_count;
  END IF;

  SELECT count(*) INTO violation_count
  FROM (
    SELECT conname
    FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public'
    GROUP BY conname HAVING count(*) > 1
  ) duplicates;
  IF violation_count <> 0 THEN
    RAISE EXCEPTION '% duplicate public constraint names exist', violation_count;
  END IF;

  SELECT count(*) INTO violation_count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND ((c.relkind = 'i' AND c.relname !~ '^(pk|uq|ix|ex)_')
      OR (c.relkind = 'S' AND c.relname !~ '^seq_'));
  IF violation_count <> 0 THEN
    RAISE EXCEPTION '% indexes or sequences have an invalid/automatic name', violation_count;
  END IF;

  SELECT count(*) INTO violation_count
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  WHERE c.relnamespace = 'public'::regnamespace
    AND NOT t.tgisinternal AND t.tgname !~ '^trg_';
  IF violation_count <> 0 THEN
    RAISE EXCEPTION '% triggers have an invalid name', violation_count;
  END IF;
END;
$$;

SELECT kind, max(octet_length(identifier)) AS maximum_bytes, count(*) AS identifier_count
FROM v12_public_identifiers
GROUP BY kind
ORDER BY kind;
