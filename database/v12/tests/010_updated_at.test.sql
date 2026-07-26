BEGIN;
SET LOCAL search_path = extensions, public, pg_catalog;
SELECT plan(10);

SELECT is(
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgname LIKE '%updated_at'),
  18::bigint,
  'all 18 mutable tables have updated_at triggers'
);
SELECT is(
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgname LIKE '%updated_at'
     AND pg_get_triggerdef(t.oid) LIKE '%set_row_updated_at%'),
  0::bigint,
  'no generic dynamic-column updated_at trigger remains'
);
SELECT ok(
  (SELECT bool_and(NOT p.prosecdef) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'set_%_updated_at'),
  'updated_at functions are SECURITY INVOKER'
);
SELECT is(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'set_%_updated_at'
     AND NOT (p.proconfig @> ARRAY['search_path=""']::text[])),
  0::bigint,
  'updated_at functions pin an empty search_path'
);

INSERT INTO public.districts (district_id, district_code, district_name, district_country_code)
VALUES ('50000000-0000-4000-8000-000000000001', 'T500', '更新時間測試', 'TW');
SELECT ok(
  (SELECT district_updated_at IS NOT NULL FROM public.districts
   WHERE district_id = '50000000-0000-4000-8000-000000000001'),
  'INSERT receives the updated_at default'
);
CREATE TEMP TABLE initial_timestamp AS
SELECT district_updated_at AS value FROM public.districts WHERE district_id = '50000000-0000-4000-8000-000000000001';
SELECT pg_sleep(0.01);
UPDATE public.districts SET district_name = '更新時間測試二' WHERE district_id = '50000000-0000-4000-8000-000000000001';
SELECT ok(
  (SELECT district_updated_at > initial_timestamp.value FROM public.districts CROSS JOIN initial_timestamp
   WHERE district_id = '50000000-0000-4000-8000-000000000001'),
  'typed trigger advances updated_at within one transaction'
);
SELECT ok(
  (SELECT district_code = 'T500' AND district_country_code = 'TW'
   FROM public.districts WHERE district_id = '50000000-0000-4000-8000-000000000001'),
  'ordinary UPDATE preserves unrelated typed values'
);
SELECT is(
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE NOT t.tgisinternal AND c.relname IN (
     'membership_onboarding_events', 'membership_status_histories', 'login_events',
     'invitation_events', 'audit_logs', 'account_merge_events'
   ) AND t.tgname LIKE '%updated_at'),
  0::bigint,
  'append-only event tables have no updated_at trigger'
);
SELECT ok(
  (SELECT bool_and(pg_get_functiondef(p.oid) LIKE '%clock_timestamp()%')
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'set_%_updated_at'),
  'typed functions use wall-clock timestamp for observable updates'
);
SELECT is(
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgname LIKE '%updated_at'
     AND (t.tgtype & 16) = 0),
  0::bigint,
  'updated_at triggers execute before update'
);

SELECT * FROM finish();
ROLLBACK;
