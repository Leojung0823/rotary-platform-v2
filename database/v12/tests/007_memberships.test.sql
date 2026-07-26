BEGIN;
SET LOCAL search_path = extensions, public, pg_catalog;
SELECT plan(8);

INSERT INTO public.districts (district_id, district_code, district_name, district_country_code)
VALUES ('30000000-0000-4000-8000-000000000001', 'T300', '測試地區', 'TW');
INSERT INTO public.clubs (club_id, club_district_id, club_rotary_number, club_name)
VALUES ('31000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'C300', '測試扶輪社');
INSERT INTO public.people (person_id, person_chinese_name)
VALUES ('32000000-0000-4000-8000-000000000001', '社員測試');
INSERT INTO public.memberships (membership_id, membership_person_id, membership_club_id)
VALUES ('33000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001');

SELECT throws_ok(
  $$INSERT INTO public.memberships (membership_person_id, membership_club_id)
      VALUES ('32000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001')$$,
  '23505', NULL,
  'same Person and Club cannot have two live Memberships'
);
SELECT lives_ok(
  $$UPDATE public.memberships SET membership_status = 'resigned', membership_ended_on = current_date
      WHERE membership_id = '33000000-0000-4000-8000-000000000001';
    INSERT INTO public.memberships (membership_person_id, membership_club_id)
      VALUES ('32000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001')$$,
  'historical terminal Membership does not block a new live Membership'
);
SELECT lives_ok(
  $$INSERT INTO public.membership_onboarding_events
      (membership_onboarding_event_membership_id, membership_onboarding_event_new_status, membership_onboarding_event_type)
    VALUES
      ('33000000-0000-4000-8000-000000000001', 'in_progress', 'started'),
      ('33000000-0000-4000-8000-000000000001', 'completed', 'completed')$$,
  'onboarding transitions are append-only events'
);
SELECT ok(
  (SELECT max(membership_onboarding_event_sequence) > min(membership_onboarding_event_sequence)
   FROM public.membership_onboarding_events WHERE membership_onboarding_event_membership_id = '33000000-0000-4000-8000-000000000001'),
  'onboarding event sequence is monotonic'
);
INSERT INTO public.membership_status_histories (
  membership_status_history_membership_id, membership_status_history_previous_status,
  membership_status_history_new_status, membership_status_history_effective_at,
  membership_status_history_reason_code
) VALUES (
  '33000000-0000-4000-8000-000000000001', 'pending', 'resigned', '2026-07-22 00:00:00+00', 'test'
);
SELECT throws_ok(
  $$INSERT INTO public.membership_status_histories
      (membership_status_history_membership_id, membership_status_history_previous_status,
       membership_status_history_new_status, membership_status_history_effective_at,
       membership_status_history_reason_code)
    VALUES ('33000000-0000-4000-8000-000000000001', 'pending', 'active',
            '2026-07-22 00:00:00+00', 'duplicate')$$,
  '23505', NULL,
  'one live status event per Membership effective timestamp'
);
SELECT has_index('public', 'membership_status_histories', 'ix_msh__supersedes', 'correction chain FK has an index');
SELECT ok(
  (SELECT col_description('public.membership_status_histories'::regclass, attnum) LIKE '%not a business version number%'
   FROM pg_attribute
   WHERE attrelid = 'public.membership_status_histories'::regclass
     AND attname = 'membership_status_history_sequence'),
  'history sequence comment excludes business version semantics'
);
SELECT ok(
  (SELECT indexdef NOT LIKE '%membership_status_history_sequence%'
   FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'uq_msh__membership_effective_live'),
  'effective-at uniqueness does not use the global history sequence'
);

SELECT * FROM finish();
ROLLBACK;
