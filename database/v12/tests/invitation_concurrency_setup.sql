\set ON_ERROR_STOP on

BEGIN;

INSERT INTO public.districts (
  district_id, district_code, district_name, district_country_code
)
VALUES (
  '80000000-0000-4000-8000-000000000001',
  'C800', 'Invitation concurrency district', 'TW'
);
INSERT INTO public.clubs (
  club_id, club_district_id, club_rotary_number, club_name
)
VALUES (
  '81000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000001',
  'C800', 'Invitation concurrency club'
);
INSERT INTO public.people (person_id, person_chinese_name)
VALUES
  ('82000000-0000-4000-8000-000000000002', 'Invitation concurrency manager'),
  ('82000000-0000-4000-8000-000000000003', 'Invitation concurrent create target');
INSERT INTO public.accounts (
  account_id, account_person_id, account_auth_user_id,
  account_status, account_creation_source
)
VALUES (
  '82500000-0000-4000-8000-000000000002',
  '82000000-0000-4000-8000-000000000002',
  '85000000-0000-4000-8000-000000000002',
  'active', 'administrative_repair'
);
INSERT INTO public.memberships (
  membership_id, membership_person_id, membership_club_id,
  membership_status, membership_onboarding_status
)
VALUES
  (
    '83000000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000001',
    'active', 'completed'
  ),
  (
    '83000000-0000-4000-8000-000000000003',
    '82000000-0000-4000-8000-000000000003',
    '81000000-0000-4000-8000-000000000001',
    'pending', 'not_started'
  );
INSERT INTO public.membership_role_assignments (
  membership_role_assignment_membership_id,
  membership_role_assignment_role_id,
  membership_role_assignment_starts_at,
  membership_role_assignment_status,
  membership_role_assignment_assigned_by_account_id,
  membership_role_assignment_reason_code
)
SELECT
  '83000000-0000-4000-8000-000000000002',
  role_id,
  now() - interval '1 day',
  'active',
  '00000000-0000-0000-0000-000000000001',
  'test_fixture'
FROM public.roles
WHERE role_code = 'club.secretary';

COMMIT;
