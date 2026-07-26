BEGIN;
SET LOCAL search_path = extensions, public, pg_catalog;
SELECT plan(81);

INSERT INTO public.districts (
  district_id, district_code, district_name, district_country_code
)
VALUES (
  '60000000-0000-4000-8000-000000000001', 'T600', '邀請核心測試地區', 'TW'
);

INSERT INTO public.clubs (
  club_id, club_district_id, club_rotary_number, club_name
)
VALUES
  (
    '61000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    'C600', '邀請核心測試社'
  ),
  (
    '61000000-0000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000001',
    'C601', '跨社授權測試社'
  );

INSERT INTO public.people (person_id, person_chinese_name)
VALUES
  ('62000000-0000-4000-8000-000000000001', '受邀社員測試'),
  ('62000000-0000-4000-8000-000000000002', '邀請管理者測試'),
  ('62000000-0000-4000-8000-000000000003', '跨社受邀社員測試'),
  ('62000000-0000-4000-8000-000000000004', '撤銷邀請測試'),
  ('62000000-0000-4000-8000-000000000005', '已接受狀態測試'),
  ('62000000-0000-4000-8000-000000000006', '過期邀請測試'),
  ('62000000-0000-4000-8000-000000000007', '約束測試'),
  ('62000000-0000-4000-8000-000000000008', 'Validate 到期重試測試');

INSERT INTO public.accounts (
  account_id, account_person_id, account_auth_user_id,
  account_status, account_creation_source
)
VALUES (
  '62200000-0000-4000-8000-000000000002',
  '62000000-0000-4000-8000-000000000002',
  '62300000-0000-4000-8000-000000000002',
  'active', 'administrative_repair'
);

INSERT INTO public.memberships (
  membership_id, membership_person_id, membership_club_id,
  membership_status, membership_onboarding_status
)
VALUES
  (
    '63000000-0000-4000-8000-000000000001',
    '62000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001',
    'pending', 'not_started'
  ),
  (
    '62400000-0000-4000-8000-000000000002',
    '62000000-0000-4000-8000-000000000002',
    '61000000-0000-4000-8000-000000000001',
    'active', 'completed'
  ),
  (
    '63000000-0000-4000-8000-000000000003',
    '62000000-0000-4000-8000-000000000003',
    '61000000-0000-4000-8000-000000000002',
    'pending', 'not_started'
  ),
  (
    '63000000-0000-4000-8000-000000000004',
    '62000000-0000-4000-8000-000000000004',
    '61000000-0000-4000-8000-000000000001',
    'pending', 'not_started'
  ),
  (
    '63000000-0000-4000-8000-000000000005',
    '62000000-0000-4000-8000-000000000005',
    '61000000-0000-4000-8000-000000000001',
    'pending', 'not_started'
  ),
  (
    '63000000-0000-4000-8000-000000000006',
    '62000000-0000-4000-8000-000000000006',
    '61000000-0000-4000-8000-000000000001',
    'pending', 'not_started'
  ),
  (
    '63000000-0000-4000-8000-000000000007',
    '62000000-0000-4000-8000-000000000007',
    '61000000-0000-4000-8000-000000000001',
    'pending', 'not_started'
  ),
  (
    '63000000-0000-4000-8000-000000000008',
    '62000000-0000-4000-8000-000000000008',
    '61000000-0000-4000-8000-000000000001',
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
  '62400000-0000-4000-8000-000000000002',
  role_id,
  now() - interval '1 day',
  'active',
  '00000000-0000-0000-0000-000000000001',
  'test_fixture'
FROM public.roles
WHERE role_code = 'club.secretary';

CREATE TEMP TABLE invitation_test_material ON COMMIT DROP AS
SELECT
  date_trunc('second', clock_timestamp() - interval '1 second') AS issued_at,
  date_trunc('second', clock_timestamp() + interval '1 day') AS expires_at;

CREATE TEMP TABLE invitation_domain_counts ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.people) AS people_count,
  (SELECT count(*) FROM public.accounts) AS accounts_count,
  (SELECT count(*) FROM public.memberships) AS memberships_count;

SELECT is(
  (SELECT invitation_error_code FROM public.create_membership_invitation(
    '64000000-0000-4000-8000-000000000090',
    '63000000-0000-4000-8000-000000000001',
    decode(repeat('01', 32), 'hex'), 1::smallint, 1::smallint,
    'NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN',
    (SELECT issued_at FROM invitation_test_material),
    (SELECT expires_at FROM invitation_test_material),
    'manual_link', NULL, 'short', decode(repeat('02', 32), 'hex'),
    '62300000-0000-4000-8000-000000000002',
    '64100000-0000-4000-8000-000000000090'
  )),
  'INVITATION_IDEMPOTENCY_CONFLICT',
  'Create rejects a malformed idempotency key with a stable code'
);

SELECT is(
  (SELECT invitation_error_code FROM public.create_membership_invitation(
    '64000000-0000-4000-8000-000000000091',
    '63000000-0000-4000-8000-000000000001',
    decode(repeat('03', 32), 'hex'), 1::smallint, 1::smallint,
    'OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO',
    (SELECT issued_at FROM invitation_test_material),
    (SELECT expires_at FROM invitation_test_material),
    'line_oa', NULL, 'create-invalid-channel1', decode(repeat('04', 32), 'hex'),
    '62300000-0000-4000-8000-000000000002',
    '64100000-0000-4000-8000-000000000091'
  )),
  'INVITATION_INVALID_SIGNATURE',
  'Create fails closed for an unapproved automated delivery channel'
);

SELECT is(
  (SELECT invitation_error_code FROM public.create_membership_invitation(
    '64000000-0000-4000-8000-000000000092',
    '63000000-0000-4000-8000-000000000001',
    decode(repeat('05', 32), 'hex'), 1::smallint, 1::smallint,
    'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP',
    (SELECT issued_at FROM invitation_test_material),
    (SELECT issued_at + interval '8 days' FROM invitation_test_material),
    'manual_link', NULL, 'create-overlong-ttl-01', decode(repeat('06', 32), 'hex'),
    '62300000-0000-4000-8000-000000000002',
    '64100000-0000-4000-8000-000000000092'
  )),
  'INVITATION_INVALID_SIGNATURE',
  'Create rejects a token lifetime longer than seven days'
);

SELECT is(
  (SELECT invitation_error_code FROM public.create_membership_invitation(
    '64000000-0000-4000-8000-000000000093',
    '63000000-0000-4000-8000-000000000001',
    decode(repeat('07', 32), 'hex'), 1::smallint, 1::smallint,
    'QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ',
    (SELECT issued_at FROM invitation_test_material),
    (SELECT expires_at FROM invitation_test_material),
    'manual_link', 'sensitive@example.test',
    'create-invalid-dest-001', decode(repeat('08', 32), 'hex'),
    '62300000-0000-4000-8000-000000000002',
    '64100000-0000-4000-8000-000000000093'
  )),
  'INVITATION_INVALID_SIGNATURE',
  'Manual delivery rejects destination material at the database boundary'
);

SELECT is(
  (SELECT invitation_error_code FROM public.create_membership_invitation(
    '64000000-0000-4000-8000-000000000094',
    '63000000-0000-4000-8000-000000000001',
    decode(repeat('09', 32), 'hex'), 1::smallint, 1::smallint,
    'RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR',
    (SELECT issued_at FROM invitation_test_material),
    (SELECT expires_at FROM invitation_test_material),
    'manual_link', NULL, 'create-unknown-actor-01', decode(repeat('0a', 32), 'hex'),
    '62300000-0000-4000-8000-000000000099',
    '64100000-0000-4000-8000-000000000094'
  )),
  'INVITATION_NOT_FOUND',
  'Unauthorized Create fails closed without an active managing Account'
);

SELECT is(
  (SELECT invitation_error_code FROM public.create_membership_invitation(
    '64000000-0000-4000-8000-000000000095',
    '63000000-0000-4000-8000-000000000003',
    decode(repeat('0b', 32), 'hex'), 1::smallint, 1::smallint,
    'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS',
    (SELECT issued_at FROM invitation_test_material),
    (SELECT expires_at FROM invitation_test_material),
    'manual_link', NULL, 'create-cross-club-0001', decode(repeat('0c', 32), 'hex'),
    '62300000-0000-4000-8000-000000000002',
    '64100000-0000-4000-8000-000000000095'
  )),
  'INVITATION_NOT_FOUND',
  'Create authority cannot cross the Club boundary'
);

SELECT is(
  (SELECT count(*) FROM public.invitations WHERE invitation_id IN (
    '64000000-0000-4000-8000-000000000090',
    '64000000-0000-4000-8000-000000000091',
    '64000000-0000-4000-8000-000000000092',
    '64000000-0000-4000-8000-000000000093',
    '64000000-0000-4000-8000-000000000094',
    '64000000-0000-4000-8000-000000000095'
  )),
  0::bigint,
  'Rejected Create requests leave no Invitation rows'
);

SELECT is(
  (SELECT invitation_error_code FROM public.create_membership_invitation(
    '64000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex'), 1::smallint, 1::smallint,
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    (SELECT issued_at FROM invitation_test_material),
    (SELECT expires_at FROM invitation_test_material),
    'manual_link', NULL, 'create-idempotency-0001', decode(repeat('21', 32), 'hex'),
    '62300000-0000-4000-8000-000000000002',
    '64100000-0000-4000-8000-000000000001'
  )),
  NULL::text,
  'Create Invitation succeeds through the controlled transaction'
);

SELECT is(
  (SELECT invitation_status FROM public.invitations
   WHERE invitation_id = '64000000-0000-4000-8000-000000000001'),
  'pending',
  'Create leaves the Invitation pending'
);

SELECT is(
  (SELECT count(*) FROM public.invitation_events
   WHERE invitation_event_invitation_id = '64000000-0000-4000-8000-000000000001'
     AND invitation_event_type = 'created'),
  1::bigint,
  'Create records one Created event'
);

SELECT is(
  (SELECT count(*) FROM public.invitation_events
   WHERE invitation_event_invitation_id = '64000000-0000-4000-8000-000000000001'
     AND invitation_event_type = 'delivery_handoff'
     AND invitation_event_reason_code = 'issued'),
  1::bigint,
  'Manual out-of-band issuance records one Delivery Handoff without claiming receipt'
);

SELECT is(
  (SELECT invitation_id FROM public.create_membership_invitation(
    '64000000-0000-4000-8000-000000000099',
    '63000000-0000-4000-8000-000000000001',
    decode(repeat('12', 32), 'hex'), 1::smallint, 1::smallint,
    'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    (SELECT issued_at FROM invitation_test_material),
    (SELECT expires_at FROM invitation_test_material),
    'manual_link', NULL, 'create-idempotency-0001', decode(repeat('21', 32), 'hex'),
    '62300000-0000-4000-8000-000000000002',
    '64100000-0000-4000-8000-000000000002'
  )),
  '64000000-0000-4000-8000-000000000001'::uuid,
  'Same-key Create retry returns the original Invitation'
);

SELECT ok(
  (SELECT invitation_is_replay FROM public.create_membership_invitation(
    '64000000-0000-4000-8000-000000000098',
    '63000000-0000-4000-8000-000000000001',
    decode(repeat('13', 32), 'hex'), 1::smallint, 1::smallint,
    'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
    (SELECT issued_at FROM invitation_test_material),
    (SELECT expires_at FROM invitation_test_material),
    'manual_link', NULL, 'create-idempotency-0001', decode(repeat('21', 32), 'hex'),
    '62300000-0000-4000-8000-000000000002',
    '64100000-0000-4000-8000-000000000003'
  )),
  'Same-key Create retry is identified as an idempotent replay'
);

SELECT is(
  (SELECT invitation_error_code FROM public.create_membership_invitation(
    '64000000-0000-4000-8000-000000000097',
    '63000000-0000-4000-8000-000000000001',
    decode(repeat('14', 32), 'hex'), 1::smallint, 1::smallint,
    'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
    (SELECT issued_at FROM invitation_test_material),
    (SELECT expires_at FROM invitation_test_material),
    'manual_link', NULL, 'create-idempotency-0001', decode(repeat('22', 32), 'hex'),
    '62300000-0000-4000-8000-000000000002',
    '64100000-0000-4000-8000-000000000004'
  )),
  'INVITATION_IDEMPOTENCY_CONFLICT',
  'Same Create key with different semantic payload conflicts'
);

SELECT is(
  (SELECT invitation_error_code FROM public.resend_membership_invitation(
    '64000000-0000-4000-8000-000000000001',
    decode(repeat('15', 32), 'hex'), 1::smallint, 1::smallint,
    'NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN',
    (SELECT issued_at FROM invitation_test_material),
    (SELECT expires_at FROM invitation_test_material),
    'resend-unauthorized-01', decode(repeat('23', 32), 'hex'),
    '62300000-0000-4000-8000-000000000099',
    '64100000-0000-4000-8000-000000000005'
  )),
  'INVITATION_NOT_FOUND',
  'Unauthorized Resend fails closed'
);

SELECT is(
  (SELECT invitation_error_code FROM public.resend_membership_invitation(
    '64000000-0000-4000-8000-000000000001',
    decode(repeat('15', 32), 'hex'), 1::smallint, 1::smallint,
    'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
    (SELECT issued_at FROM invitation_test_material),
    (SELECT expires_at FROM invitation_test_material),
    'resend-idempotency-01', decode(repeat('24', 32), 'hex'),
    '62300000-0000-4000-8000-000000000002',
    '64100000-0000-4000-8000-000000000006'
  )),
  NULL::text,
  'Resend rotates controlled token metadata'
);

SELECT ok(
  (SELECT invitation_token_hash = decode(repeat('15', 32), 'hex')
      AND invitation_token_nonce = 'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM'
   FROM public.invitations
   WHERE invitation_id = '64000000-0000-4000-8000-000000000001'),
  'Resend persists only the replacement HMAC hash and nonce'
);

SELECT is(
  (SELECT invitation_error_code FROM public.validate_membership_invitation(
    '64000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex'), 1::smallint, 1::smallint,
    (SELECT issued_at FROM invitation_test_material),
    (SELECT expires_at FROM invitation_test_material),
    'validate-old-token-0001', decode(repeat('31', 32), 'hex'),
    '65000000-0000-4000-8000-000000000001',
    '65100000-0000-4000-8000-000000000001'
  )),
  'INVITATION_INVALID_SIGNATURE',
  'Resend invalidates the prior token hash and signed metadata'
);

SELECT ok(
  (SELECT invitation_is_replay FROM public.resend_membership_invitation(
    '64000000-0000-4000-8000-000000000001',
    decode(repeat('15', 32), 'hex'), 1::smallint, 1::smallint,
    'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
    (SELECT issued_at FROM invitation_test_material),
    (SELECT expires_at FROM invitation_test_material),
    'resend-idempotency-01', decode(repeat('24', 32), 'hex'),
    '62300000-0000-4000-8000-000000000002',
    '64100000-0000-4000-8000-000000000007'
  )),
  'Same-key Resend retry is idempotent and cannot reproduce plaintext'
);

CREATE TEMP TABLE first_validation ON COMMIT DROP AS
SELECT * FROM public.validate_membership_invitation(
  '64000000-0000-4000-8000-000000000001',
  decode(repeat('15', 32), 'hex'), 1::smallint, 1::smallint,
  (SELECT issued_at FROM invitation_test_material),
  (SELECT expires_at FROM invitation_test_material),
  'validate-idempotency-01', decode(repeat('32', 32), 'hex'),
  '65000000-0000-4000-8000-000000000001',
  '65100000-0000-4000-8000-000000000002'
);

SELECT is(
  (SELECT invitation_error_code FROM first_validation),
  NULL::text,
  'Valid pending Invitation passes preflight validation'
);

SELECT ok(
  (SELECT invitation_is_valid
      AND invitation_can_attempt_onboarding
      AND invitation_validated_at IS NOT NULL
   FROM first_validation),
  'Successful preflight returns only validation readiness metadata'
);

SELECT is(
  (SELECT invitation_status FROM public.invitations
   WHERE invitation_id = '64000000-0000-4000-8000-000000000001'),
  'pending',
  'Validate does not change pending Invitation status'
);

SELECT ok(
  (SELECT invitation_consumed_at IS NULL
      AND invitation_accepted_at IS NULL
      AND invitation_accepted_by_account_id IS NULL
      AND invitation_accepted_by_auth_user_id IS NULL
   FROM public.invitations
   WHERE invitation_id = '64000000-0000-4000-8000-000000000001'),
  'Validate does not consume, accept, or bind the Invitation'
);

SELECT is(
  (SELECT count(*) FROM public.invitation_events
   WHERE invitation_event_invitation_id = '64000000-0000-4000-8000-000000000001'
     AND invitation_event_type = 'validated'),
  1::bigint,
  'Successful preflight records one Validated event'
);

SELECT ok(
  (SELECT invitation_event_actor_auth_user_id =
      '65000000-0000-4000-8000-000000000001'
      AND invitation_event_actor_account_id IS NULL
   FROM public.invitation_events
   WHERE invitation_event_invitation_id = '64000000-0000-4000-8000-000000000001'
     AND invitation_event_type = 'validated'),
  'Validate records the authenticated Auth User without inventing an Account binding'
);

SELECT is(
  (SELECT count(*) FROM public.audit_logs
   WHERE audit_log_target_id = '64000000-0000-4000-8000-000000000001'
     AND audit_log_action_code = 'invitation.validated'
     AND audit_log_result = 'success'),
  1::bigint,
  'Successful preflight records a minimal validated audit skeleton'
);

SELECT ok(
  (SELECT audit_log_actor_account_id IS NULL
   FROM public.audit_logs
   WHERE audit_log_target_id = '64000000-0000-4000-8000-000000000001'
     AND audit_log_action_code = 'invitation.validated'),
  'Validate leaves Audit actor Account null when no trusted Account mapping exists'
);

SELECT is(
  (SELECT count(*)
   FROM public.invitation_events
   WHERE invitation_event_invitation_id = '64000000-0000-4000-8000-000000000001'
     AND invitation_event_type = 'validated'
     AND coalesce(invitation_event_reason_detail, '') ~* '(authorization|bearer)'
  ),
  0::bigint,
  'Validate event payload never contains an Authorization header'
);

CREATE TEMP TABLE retry_validation ON COMMIT DROP AS
SELECT * FROM public.validate_membership_invitation(
  '64000000-0000-4000-8000-000000000001',
  decode(repeat('15', 32), 'hex'), 1::smallint, 1::smallint,
  (SELECT issued_at FROM invitation_test_material),
  (SELECT expires_at FROM invitation_test_material),
  'validate-idempotency-01', decode(repeat('32', 32), 'hex'),
  '65000000-0000-4000-8000-000000000001',
  '65100000-0000-4000-8000-000000000003'
);

SELECT is(
  (SELECT invitation_error_code FROM retry_validation),
  NULL::text,
  'Same-key Validate retry returns the original success'
);

SELECT ok(
  (SELECT invitation_is_idempotent_retry FROM retry_validation),
  'Same-key Validate retry is identified only as a request idempotency retry'
);

SELECT is(
  (SELECT invitation_validated_at FROM retry_validation),
  (SELECT invitation_validated_at FROM first_validation),
  'Same-key Validate retry returns the original completion timestamp'
);

CREATE TEMP TABLE repeated_validation ON COMMIT DROP AS
SELECT * FROM public.validate_membership_invitation(
  '64000000-0000-4000-8000-000000000001',
  decode(repeat('15', 32), 'hex'), 1::smallint, 1::smallint,
  (SELECT issued_at FROM invitation_test_material),
  (SELECT expires_at FROM invitation_test_material),
  'validate-new-key-00001', decode(repeat('33', 32), 'hex'),
  '65000000-0000-4000-8000-000000000001',
  '65100000-0000-4000-8000-000000000004'
);

SELECT is(
  (SELECT invitation_error_code FROM repeated_validation),
  NULL::text,
  'Repeated Validate with a new key remains successful'
);

SELECT ok(
  NOT (SELECT invitation_is_idempotent_retry FROM repeated_validation),
  'Repeated Validate with a new key is not classified as token replay'
);

SELECT ok(
  (SELECT invitation_status = 'pending'
      AND invitation_consumed_at IS NULL
      AND invitation_accepted_at IS NULL
   FROM public.invitations
   WHERE invitation_id = '64000000-0000-4000-8000-000000000001'),
  'Repeated Validate remains non-consuming and non-accepting'
);

SELECT is(
  (SELECT count(*) FROM public.invitation_events
   WHERE invitation_event_invitation_id = '64000000-0000-4000-8000-000000000001'
     AND invitation_event_type = 'replay_attempt'),
  0::bigint,
  'PR-02 Validate never emits a final-accept replay event'
);

SELECT is(
  (SELECT invitation_error_code FROM public.resend_membership_invitation(
    '64000000-0000-4000-8000-000000000001',
    decode(repeat('16', 32), 'hex'), 1::smallint, 1::smallint,
    'NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN',
    (SELECT issued_at FROM invitation_test_material),
    (SELECT expires_at FROM invitation_test_material),
    'resend-after-validate1', decode(repeat('38', 32), 'hex'),
    '62300000-0000-4000-8000-000000000002',
    '65100000-0000-4000-8000-000000000013'
  )),
  NULL::text,
  'Resend can rotate a still-live Invitation after non-consuming Validate'
);

CREATE TEMP TABLE stale_after_resend ON COMMIT DROP AS
SELECT * FROM public.validate_membership_invitation(
  '64000000-0000-4000-8000-000000000001',
  decode(repeat('15', 32), 'hex'), 1::smallint, 1::smallint,
  (SELECT issued_at FROM invitation_test_material),
  (SELECT expires_at FROM invitation_test_material),
  'validate-idempotency-01', decode(repeat('32', 32), 'hex'),
  '65000000-0000-4000-8000-000000000001',
  '65100000-0000-4000-8000-000000000014'
);

SELECT is(
  (SELECT invitation_error_code FROM stale_after_resend),
  'INVITATION_INVALID_SIGNATURE',
  'Same-key Validate retry fails after Resend invalidates the prior token'
);

SELECT ok(
  (SELECT invitation_is_idempotent_retry
      AND NOT invitation_is_valid
      AND NOT invitation_can_attempt_onboarding
   FROM stale_after_resend),
  'Resend-invalidated retry cannot return stale positive onboarding eligibility'
);

CREATE TEMP TABLE validation_before_revoke ON COMMIT DROP AS
SELECT * FROM public.validate_membership_invitation(
  '64000000-0000-4000-8000-000000000001',
  decode(repeat('16', 32), 'hex'), 1::smallint, 1::smallint,
  (SELECT issued_at FROM invitation_test_material),
  (SELECT expires_at FROM invitation_test_material),
  'validate-before-revoke', decode(repeat('39', 32), 'hex'),
  '65000000-0000-4000-8000-000000000001',
  '65100000-0000-4000-8000-000000000015'
);

SELECT is(
  (SELECT invitation_error_code FROM validation_before_revoke),
  NULL::text,
  'Current replacement token validates before a later revoke'
);

SELECT is(
  (SELECT invitation_error_code FROM public.revoke_membership_invitation(
    '64000000-0000-4000-8000-000000000001', 'security_response',
    'revoke-after-validate1', decode(repeat('3a', 32), 'hex'),
    '62300000-0000-4000-8000-000000000002',
    '65100000-0000-4000-8000-000000000016'
  )),
  NULL::text,
  'Revoke can terminally invalidate a previously validated Invitation'
);

CREATE TEMP TABLE stale_after_revoke ON COMMIT DROP AS
SELECT * FROM public.validate_membership_invitation(
  '64000000-0000-4000-8000-000000000001',
  decode(repeat('16', 32), 'hex'), 1::smallint, 1::smallint,
  (SELECT issued_at FROM invitation_test_material),
  (SELECT expires_at FROM invitation_test_material),
  'validate-before-revoke', decode(repeat('39', 32), 'hex'),
  '65000000-0000-4000-8000-000000000001',
  '65100000-0000-4000-8000-000000000017'
);

SELECT is(
  (SELECT invitation_error_code FROM stale_after_revoke),
  'INVITATION_REVOKED',
  'Same-key Validate retry rechecks and observes a later revoke'
);

SELECT ok(
  (SELECT invitation_is_idempotent_retry
      AND NOT invitation_is_valid
      AND NOT invitation_can_attempt_onboarding
   FROM stale_after_revoke),
  'Revoked retry cannot return stale positive onboarding eligibility'
);

SELECT ok(
  (SELECT invitation_status = 'revoked'
      AND invitation_consumed_at IS NULL
      AND invitation_accepted_at IS NULL
   FROM public.invitations
   WHERE invitation_id = '64000000-0000-4000-8000-000000000001'),
  'Revoke-after-Validate remains unconsumed and unaccepted'
);

INSERT INTO public.invitations (
  invitation_id, invitation_membership_id, invitation_token_hash,
  invitation_hmac_key_version, invitation_token_version,
  invitation_token_nonce, invitation_token_issued_at,
  invitation_delivery_channel, invitation_expires_at,
  invitation_created_by_account_id
)
VALUES (
  '64000000-0000-4000-8000-000000000008',
  '63000000-0000-4000-8000-000000000008',
  decode(repeat('18', 32), 'hex'), 1, 1,
  'LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL',
  clock_timestamp() - interval '1 second',
  'manual_link', clock_timestamp() + interval '1 second',
  '62200000-0000-4000-8000-000000000002'
);

SELECT is(
  (SELECT invitation_error_code FROM public.validate_membership_invitation(
    '64000000-0000-4000-8000-000000000008',
    decode(repeat('18', 32), 'hex'), 1::smallint, 1::smallint,
    (SELECT invitation_token_issued_at FROM public.invitations
     WHERE invitation_id = '64000000-0000-4000-8000-000000000008'),
    (SELECT invitation_expires_at FROM public.invitations
     WHERE invitation_id = '64000000-0000-4000-8000-000000000008'),
    'validate-before-expiry1', decode(repeat('3b', 32), 'hex'),
    '65000000-0000-4000-8000-000000000001',
    '65100000-0000-4000-8000-000000000018'
  )),
  NULL::text,
  'Invitation can validate immediately before its effective expiry'
);

SELECT pg_sleep(1.1);

CREATE TEMP TABLE stale_after_expiry ON COMMIT DROP AS
SELECT * FROM public.validate_membership_invitation(
  '64000000-0000-4000-8000-000000000008',
  decode(repeat('18', 32), 'hex'), 1::smallint, 1::smallint,
  (SELECT invitation_token_issued_at FROM public.invitations
   WHERE invitation_id = '64000000-0000-4000-8000-000000000008'),
  (SELECT invitation_expires_at FROM public.invitations
   WHERE invitation_id = '64000000-0000-4000-8000-000000000008'),
  'validate-before-expiry1', decode(repeat('3b', 32), 'hex'),
  '65000000-0000-4000-8000-000000000001',
  '65100000-0000-4000-8000-000000000019'
);

SELECT is(
  (SELECT invitation_error_code FROM stale_after_expiry),
  'INVITATION_EXPIRED',
  'Same-key Validate retry uses Database Time and observes later expiry'
);

SELECT ok(
  (SELECT invitation_is_idempotent_retry
      AND NOT invitation_is_valid
      AND NOT invitation_can_attempt_onboarding
   FROM stale_after_expiry),
  'Expired retry cannot return stale positive onboarding eligibility'
);

SELECT ok(
  (SELECT invitation_status = 'pending'
      AND invitation_marked_expired_at IS NULL
      AND invitation_consumed_at IS NULL
   FROM public.invitations
   WHERE invitation_id = '64000000-0000-4000-8000-000000000008'),
  'Validate expiry retry remains non-mutating and leaves materialization to a mutation flow'
);

SELECT is(
  (SELECT count(*) FROM public.invitation_events
   WHERE invitation_event_invitation_id = '64000000-0000-4000-8000-000000000001'
     AND invitation_event_type = 'validated'),
  3::bigint,
  'Same-key retries across unchanged and changed state do not duplicate Validated events'
);

SELECT is(
  (SELECT invitation_error_code FROM public.validate_membership_invitation(
    '64000000-0000-4000-8000-000000000001',
    decode(repeat('99', 32), 'hex'), 1::smallint, 1::smallint,
    (SELECT issued_at FROM invitation_test_material),
    (SELECT expires_at FROM invitation_test_material),
    'validate-invalid-hash1', decode(repeat('34', 32), 'hex'),
    '65000000-0000-4000-8000-000000000001',
    '65100000-0000-4000-8000-000000000005'
  )),
  'INVITATION_INVALID_SIGNATURE',
  'Invalid HMAC-derived storage hash fails validation'
);

SELECT ok(
  pg_get_function_identity_arguments(
    'public.validate_membership_invitation(uuid,bytea,smallint,smallint,timestamptz,timestamptz,text,bytea,uuid,uuid)'::regprocedure
  ) !~* '(nonce|plaintext|signature|secret|account_id|person_id)',
  'Public Validate RPC does not accept nonce, plaintext token, signature, or secret parameters'
);

SELECT is(
  (SELECT invitation_error_code FROM public.validate_membership_invitation(
    '64000000-0000-4000-8000-000000000001',
    decode(repeat('15', 32), 'hex'), 2::smallint, 1::smallint,
    (SELECT issued_at FROM invitation_test_material),
    (SELECT expires_at FROM invitation_test_material),
    'validate-token-version', decode(repeat('36', 32), 'hex'),
    '65000000-0000-4000-8000-000000000001',
    '65100000-0000-4000-8000-000000000007'
  )),
  'INVITATION_INVALID_SIGNATURE',
  'Unknown token envelope version fails closed'
);

SELECT is(
  (SELECT invitation_error_code FROM public.validate_membership_invitation(
    '64000000-0000-4000-8000-000000000001',
    decode(repeat('15', 32), 'hex'), 1::smallint, 2::smallint,
    (SELECT issued_at FROM invitation_test_material),
    (SELECT expires_at FROM invitation_test_material),
    'validate-key-version01', decode(repeat('37', 32), 'hex'),
    '65000000-0000-4000-8000-000000000001',
    '65100000-0000-4000-8000-000000000008'
  )),
  'INVITATION_INVALID_SIGNATURE',
  'Unknown HMAC key version fails validation'
);

SELECT is(
  (SELECT invitation_error_code FROM public.create_membership_invitation(
    '64000000-0000-4000-8000-000000000004',
    '63000000-0000-4000-8000-000000000004',
    decode(repeat('41', 32), 'hex'), 1::smallint, 1::smallint,
    'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
    (SELECT issued_at FROM invitation_test_material),
    (SELECT expires_at FROM invitation_test_material),
    'manual_link', NULL, 'create-for-revoke-001', decode(repeat('42', 32), 'hex'),
    '62300000-0000-4000-8000-000000000002',
    '64100000-0000-4000-8000-000000000008'
  )),
  NULL::text,
  'Create prepares a pending Invitation for revoke testing'
);

SELECT is(
  (SELECT invitation_error_code FROM public.revoke_membership_invitation(
    '64000000-0000-4000-8000-000000000004', 'operator_revoked',
    'revoke-idempotency-01', decode(repeat('43', 32), 'hex'),
    '62300000-0000-4000-8000-000000000002',
    '65100000-0000-4000-8000-000000000009'
  )),
  NULL::text,
  'Revoke transitions a pending Invitation atomically'
);

SELECT is(
  (SELECT invitation_status FROM public.invitations
   WHERE invitation_id = '64000000-0000-4000-8000-000000000004'),
  'revoked',
  'Revoke persists only the revoked terminal state'
);

SELECT is(
  (SELECT invitation_error_code FROM public.validate_membership_invitation(
    '64000000-0000-4000-8000-000000000004',
    decode(repeat('41', 32), 'hex'), 1::smallint, 1::smallint,
    (SELECT issued_at FROM invitation_test_material),
    (SELECT expires_at FROM invitation_test_material),
    'validate-revoked-0001', decode(repeat('44', 32), 'hex'),
    '65000000-0000-4000-8000-000000000001',
    '65100000-0000-4000-8000-000000000010'
  )),
  'INVITATION_REVOKED',
  'Revoked Invitation cannot pass preflight validation'
);

INSERT INTO public.invitations (
  invitation_id, invitation_membership_id, invitation_token_hash,
  invitation_hmac_key_version, invitation_token_version,
  invitation_token_nonce, invitation_token_issued_at,
  invitation_delivery_channel, invitation_expires_at,
  invitation_created_by_account_id, invitation_created_at
)
VALUES (
  '64000000-0000-4000-8000-000000000006',
  '63000000-0000-4000-8000-000000000006',
  decode(repeat('51', 32), 'hex'), 1, 1,
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  date_trunc('second', now() - interval '2 days') + interval '1 second',
  'manual_link', date_trunc('second', now() - interval '1 day'),
  '62200000-0000-4000-8000-000000000002',
  date_trunc('second', now() - interval '2 days')
);

SELECT is(
  (SELECT invitation_error_code FROM public.validate_membership_invitation(
    '64000000-0000-4000-8000-000000000006',
    decode(repeat('51', 32), 'hex'), 1::smallint, 1::smallint,
    (SELECT invitation_token_issued_at FROM public.invitations
     WHERE invitation_id = '64000000-0000-4000-8000-000000000006'),
    (SELECT invitation_expires_at FROM public.invitations
     WHERE invitation_id = '64000000-0000-4000-8000-000000000006'),
    'validate-expired-0001', decode(repeat('52', 32), 'hex'),
    '65000000-0000-4000-8000-000000000001',
    '65100000-0000-4000-8000-000000000011'
  )),
  'INVITATION_EXPIRED',
  'Expired Invitation cannot pass preflight validation'
);

SELECT ok(
  (SELECT invitation_status = 'pending'
      AND invitation_marked_expired_at IS NULL
      AND invitation_consumed_at IS NULL
   FROM public.invitations
   WHERE invitation_id = '64000000-0000-4000-8000-000000000006'),
  'Expired preflight remains non-mutating and does not half-transition state'
);

INSERT INTO public.invitations (
  invitation_id, invitation_membership_id, invitation_token_hash,
  invitation_hmac_key_version, invitation_token_version,
  invitation_token_nonce, invitation_token_issued_at,
  invitation_delivery_channel, invitation_status, invitation_expires_at,
  invitation_accepted_at, invitation_accepted_by_auth_user_id,
  invitation_consumed_at, invitation_created_by_account_id,
  invitation_created_at
)
VALUES (
  '64000000-0000-4000-8000-000000000005',
  '63000000-0000-4000-8000-000000000005',
  decode(repeat('61', 32), 'hex'), 1, 1,
  'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH',
  date_trunc('second', now() - interval '1 minute'),
  'manual_link', 'accepted', date_trunc('second', now() + interval '1 day'),
  date_trunc('second', now()), '65000000-0000-4000-8000-000000000002',
  date_trunc('second', now()),
  '62200000-0000-4000-8000-000000000002',
  date_trunc('second', now() - interval '2 minutes')
);

SELECT is(
  (SELECT invitation_error_code FROM public.validate_membership_invitation(
    '64000000-0000-4000-8000-000000000005',
    decode(repeat('61', 32), 'hex'), 1::smallint, 1::smallint,
    (SELECT invitation_token_issued_at FROM public.invitations
     WHERE invitation_id = '64000000-0000-4000-8000-000000000005'),
    (SELECT invitation_expires_at FROM public.invitations
     WHERE invitation_id = '64000000-0000-4000-8000-000000000005'),
    'validate-accepted-001', decode(repeat('62', 32), 'hex'),
    '65000000-0000-4000-8000-000000000001',
    '65100000-0000-4000-8000-000000000012'
  )),
  'INVITATION_ALREADY_ACCEPTED',
  'Accepted fixture cannot pass PR-02 preflight validation'
);

SELECT ok(
  (SELECT invitation_status = 'accepted'
      AND invitation_consumed_at IS NOT NULL
      AND invitation_accepted_by_auth_user_id = '65000000-0000-4000-8000-000000000002'
   FROM public.invitations
   WHERE invitation_id = '64000000-0000-4000-8000-000000000005'),
  'Accepted fixture preserves the future PR-03 accepted and consumed invariant'
);

SELECT throws_ok(
  $$INSERT INTO public.invitations (
      invitation_membership_id, invitation_token_hash,
      invitation_hmac_key_version, invitation_token_version,
      invitation_token_nonce, invitation_token_issued_at,
      invitation_delivery_channel, invitation_status,
      invitation_expires_at, invitation_accepted_at,
      invitation_accepted_by_auth_user_id,
      invitation_created_by_account_id
    ) VALUES (
      '63000000-0000-4000-8000-000000000007', decode(repeat('63', 32), 'hex'),
      1, 1, 'IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII',
      now() - interval '1 minute', 'manual_link', 'accepted',
      now() + interval '1 day', now(),
      '65000000-0000-4000-8000-000000000003',
      '62200000-0000-4000-8000-000000000002'
    )$$,
  '23514', NULL,
  'Accepted state cannot exist without consumed_at'
);

SELECT throws_ok(
  $$INSERT INTO public.invitations (
      invitation_membership_id, invitation_token_hash,
      invitation_hmac_key_version, invitation_token_version,
      invitation_token_nonce, invitation_token_issued_at,
      invitation_delivery_channel, invitation_status,
      invitation_expires_at, invitation_consumed_at,
      invitation_created_by_account_id
    ) VALUES (
      '63000000-0000-4000-8000-000000000007', decode(repeat('64', 32), 'hex'),
      1, 1, 'JJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ',
      now() - interval '1 minute', 'manual_link', 'pending',
      now() + interval '1 day', now(),
      '62200000-0000-4000-8000-000000000002'
    )$$,
  '23514', NULL,
  'Consumed state cannot exist unless status is accepted'
);

SELECT is(
  (SELECT count(*) FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname = 'accept_membership_invitation'),
  0::bigint,
  'PR-02 exposes no public final acceptance function'
);

SELECT ok(
  (SELECT pg_get_userbyid(proowner) = 'postgres'
      AND prosecdef
      AND provolatile = 'v'
      AND proconfig = ARRAY['search_path=""']
   FROM pg_proc
   WHERE oid = 'public.validate_membership_invitation(uuid,bytea,smallint,smallint,timestamptz,timestamptz,text,bytea,uuid,uuid)'::regprocedure),
  'Public Validate RPC is a postgres-owned fixed-path SECURITY DEFINER mutation boundary'
);

SELECT ok(
  (SELECT has_function_privilege('service_role', oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')
   FROM pg_proc
   WHERE oid = 'public.validate_membership_invitation(uuid,bytea,smallint,smallint,timestamptz,timestamptz,text,bytea,uuid,uuid)'::regprocedure),
  'Only the trusted Edge service role can execute Public Validate RPC'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc AS function_record
    CROSS JOIN LATERAL aclexplode(
      coalesce(function_record.proacl, acldefault('f', function_record.proowner))
    ) AS privilege
    WHERE function_record.oid = 'public.validate_membership_invitation(uuid,bytea,smallint,smallint,timestamptz,timestamptz,text,bytea,uuid,uuid)'::regprocedure
      AND privilege.grantee = 0
      AND privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no implicit Execute privilege on Validate RPC'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc AS function_record
    CROSS JOIN LATERAL aclexplode(
      coalesce(function_record.proacl, acldefault('f', function_record.proowner))
    ) AS privilege
    WHERE function_record.oid = 'v12_invitation.validate_token_snapshot(uuid,bytea,smallint,smallint,timestamptz,timestamptz)'::regprocedure
      AND privilege.grantee = 0
      AND privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no implicit Execute privilege on the private validation helper'
);

SELECT ok(
  NOT has_schema_privilege('anon', 'v12_invitation', 'USAGE')
    AND NOT has_schema_privilege('authenticated', 'v12_invitation', 'USAGE')
    AND NOT has_schema_privilege('service_role', 'v12_invitation', 'USAGE'),
  'Private helper schema denies Usage to every API role'
);

SELECT ok(
  has_function_privilege(
    'postgres',
    'public.validate_membership_invitation(uuid,bytea,smallint,smallint,timestamptz,timestamptz,text,bytea,uuid,uuid)',
    'EXECUTE'
  ) AND has_function_privilege(
    'postgres',
    'v12_invitation.validate_token_snapshot(uuid,bytea,smallint,smallint,timestamptz,timestamptz)',
    'EXECUTE'
  ),
  'Function owner retains only the required owner execution capability'
);

SELECT ok(
  pg_get_function_result(
    'public.validate_membership_invitation(uuid,bytea,smallint,smallint,timestamptz,timestamptz,text,bytea,uuid,uuid)'::regprocedure
  ) LIKE '%invitation_is_idempotent_retry boolean%',
  'Validate result names request idempotency without final replay semantics'
);

SELECT ok(
  (SELECT prosrc !~* 'EXECUTE[[:space:]]'
      AND prosrc !~ 'invitation_status[[:space:]]*=[[:space:]]*''accepted'''
      AND prosrc !~ 'invitation_consumed_at[[:space:]]*='
   FROM pg_proc
   WHERE oid = 'public.validate_membership_invitation(uuid,bytea,smallint,smallint,timestamptz,timestamptz,text,bytea,uuid,uuid)'::regprocedure),
  'Validate RPC uses no dynamic SQL and has no accepted or consumed write path'
);

SELECT ok(
  (SELECT provolatile = 's'
      AND NOT prosecdef
      AND proconfig = ARRAY['search_path=""']
      AND NOT has_function_privilege('service_role', oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')
   FROM pg_proc
   WHERE oid = 'v12_invitation.validate_token_snapshot(uuid,bytea,smallint,smallint,timestamptz,timestamptz)'::regprocedure),
  'Private token validator is read-only by contract, fixed-path, and owner-only'
);

SELECT is(
  (SELECT count(*) FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname IN (
       'create_membership_invitation', 'resend_membership_invitation',
       'validate_membership_invitation', 'revoke_membership_invitation'
     )
     AND (
       pg_get_functiondef(oid) ~ 'SET[[:space:]]+invitation_status[[:space:]]*=[[:space:]]*''accepted'''
       OR pg_get_functiondef(oid) ~ 'invitation_consumed_at[[:space:]]*='
     )),
  0::bigint,
  'PR-02 public functions contain no final accepted or consumed write path'
);

SELECT is(
  (SELECT count(*) FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN ('invitations', 'invitation_events', 'idempotency_records', 'audit_logs')
     AND column_name ~ '(^|_)(plaintext_token|plain_token|raw_token|token_plain|token)$'),
  0::bigint,
  'Plaintext invitation tokens have no database column'
);

SELECT is(
  (SELECT count(*) FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN ('invitation_events', 'audit_logs')
     AND column_name ~ '(secret|hmac|nonce|token_hash|token_digest|raw_token)'),
  0::bigint,
  'Validated audit skeleton has no token, nonce, HMAC, or secret field'
);

SELECT is(
  (SELECT bool_and(
     prosecdef
     AND proconfig = ARRAY['search_path=""']
     AND has_function_privilege('service_role', oid, 'EXECUTE')
     AND NOT has_function_privilege('anon', oid, 'EXECUTE')
     AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')
   )
   FROM pg_proc
   WHERE oid IN (
     'public.create_membership_invitation(uuid,uuid,bytea,smallint,smallint,text,timestamptz,timestamptz,text,text,text,bytea,uuid,uuid)'::regprocedure,
     'public.resend_membership_invitation(uuid,bytea,smallint,smallint,text,timestamptz,timestamptz,text,bytea,uuid,uuid)'::regprocedure,
     'public.validate_membership_invitation(uuid,bytea,smallint,smallint,timestamptz,timestamptz,text,bytea,uuid,uuid)'::regprocedure,
     'public.revoke_membership_invitation(uuid,text,text,bytea,uuid,uuid)'::regprocedure
   )),
  true,
  'Only service_role can execute fixed-path PR-02 public functions'
);

SELECT is(
  (SELECT bool_or(
     has_table_privilege('service_role', table_record.oid, 'SELECT')
     OR has_table_privilege('service_role', table_record.oid, 'INSERT')
     OR has_table_privilege('service_role', table_record.oid, 'UPDATE')
     OR has_table_privilege('service_role', table_record.oid, 'DELETE')
   )
   FROM pg_class AS table_record
   WHERE table_record.oid IN (
     'public.invitations'::regclass,
     'public.invitation_events'::regclass,
     'public.idempotency_records'::regclass,
     'public.audit_logs'::regclass
   )),
  false,
  'Service role cannot bypass PR-02 functions through direct table access'
);

SELECT ok(
  (SELECT octet_length(invitation_token_hash) = 32
   FROM public.invitations
   WHERE invitation_id = '64000000-0000-4000-8000-000000000001'),
  'Database stores only a 32-byte HMAC-derived token hash'
);

SELECT is(
  (SELECT invitation_error_code FROM public.create_membership_invitation(
    '64000000-0000-4000-8000-000000000096',
    '63000000-0000-4000-8000-000000000007',
    decode(repeat('65', 32), 'hex'), 1::smallint, 1::smallint,
    'NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN',
    (SELECT issued_at FROM invitation_test_material),
    (SELECT expires_at FROM invitation_test_material),
    'manual_link', NULL, 'create-fault-rollback1', decode(repeat('66', 32), 'hex'),
    '62300000-0000-4000-8000-000000000002',
    '64100000-0000-4000-8000-000000000096'
  )),
  'INVITATION_INVALID_SIGNATURE',
  'Duplicate nonce fault returns a stable safe error'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.invitations
    WHERE invitation_id = '64000000-0000-4000-8000-000000000096'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.invitation_events
    WHERE invitation_event_invitation_id = '64000000-0000-4000-8000-000000000096'
  ),
  'Fault injection rolls back Invitation and event side effects'
);

SELECT ok(
  (SELECT
    people_count = (SELECT count(*) FROM public.people)
    AND accounts_count = (SELECT count(*) FROM public.accounts)
    AND memberships_count = (SELECT count(*) FROM public.memberships)
   FROM invitation_domain_counts),
  'PR-02 functions cannot create Person, Account, Membership, or onboarding objects'
);

SELECT * FROM finish();
ROLLBACK;
