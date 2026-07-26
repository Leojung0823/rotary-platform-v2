\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  invitation_statuses text[];
  public_function_count integer;
  insecure_function_count integer;
  private_validator_oid oid;
  validate_rpc_oid oid;
BEGIN
  IF to_regnamespace('v12_invitation') IS NULL THEN
    RAISE EXCEPTION 'Private Invitation helper schema is missing';
  END IF;

  IF has_schema_privilege('anon', 'v12_invitation', 'USAGE')
    OR has_schema_privilege('authenticated', 'v12_invitation', 'USAGE')
    OR has_schema_privilege('service_role', 'v12_invitation', 'USAGE')
  THEN
    RAISE EXCEPTION 'Invitation helper schema is exposed to an API role';
  END IF;

  SELECT array_agg(status ORDER BY status)
  INTO invitation_statuses
  FROM (
    SELECT DISTINCT match[1] AS status
    FROM pg_constraint AS constraint_record
    CROSS JOIN LATERAL regexp_matches(
      pg_get_constraintdef(constraint_record.oid),
      '''([a-z_]+)''',
      'g'
    ) AS match
    WHERE constraint_record.conrelid = 'public.invitations'::regclass
      AND constraint_record.conname = 'ck_invitations__status'
  ) AS allowed;
  IF invitation_statuses IS DISTINCT FROM
    ARRAY['accepted', 'expired', 'pending', 'revoked']::text[]
  THEN
    RAISE EXCEPTION 'Invitation status contract drifted: %', invitation_statuses;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (
        'invitations', 'invitation_events', 'idempotency_records', 'audit_logs'
      )
      AND column_name ~ '(^|_)(plaintext_token|plain_token|raw_token|token_plain|token)$'
  ) THEN
    RAISE EXCEPTION 'A plaintext Invitation token column exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.invitations'::regclass
      AND conname = 'ck_invitations__token_hash'
      AND pg_get_constraintdef(oid) LIKE '%octet_length(invitation_token_hash) = 32%'
  ) THEN
    RAISE EXCEPTION 'Invitation HMAC hash length constraint is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.invitations'::regclass
      AND conname = 'ck_invitations__accepted_state'
      AND pg_get_constraintdef(oid) LIKE '%invitation_status = ''accepted''%'
      AND pg_get_constraintdef(oid) LIKE '%invitation_consumed_at IS NOT NULL%'
      AND pg_get_constraintdef(oid) LIKE '%invitation_status <> ''accepted''%'
      AND pg_get_constraintdef(oid) LIKE '%invitation_consumed_at IS NULL%'
  ) THEN
    RAISE EXCEPTION 'Accepted and consumed state reciprocity constraint is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.invitations'::regclass
      AND conname = 'ck_invitations__acceptance_time'
      AND pg_get_constraintdef(oid) LIKE '%invitation_accepted_at >= invitation_token_issued_at%'
      AND pg_get_constraintdef(oid) LIKE '%invitation_consumed_at >= invitation_accepted_at%'
  ) THEN
    RAISE EXCEPTION 'Accepted and consumed timestamp ordering constraint is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'accept_membership_invitation'
  ) THEN
    RAISE EXCEPTION 'PR-02 must not expose accept_membership_invitation';
  END IF;

  SELECT count(*)
  INTO public_function_count
  FROM pg_proc
  WHERE oid IN (
    'public.create_membership_invitation(uuid,uuid,bytea,smallint,smallint,text,timestamptz,timestamptz,text,text,text,bytea,uuid,uuid)'::regprocedure,
    'public.resend_membership_invitation(uuid,bytea,smallint,smallint,text,timestamptz,timestamptz,text,bytea,uuid,uuid)'::regprocedure,
    'public.validate_membership_invitation(uuid,bytea,smallint,smallint,timestamptz,timestamptz,text,bytea,uuid,uuid)'::regprocedure,
    'public.revoke_membership_invitation(uuid,text,text,bytea,uuid,uuid)'::regprocedure
  );
  IF public_function_count <> 4 THEN
    RAISE EXCEPTION 'Expected exactly four PR-02 public Invitation functions';
  END IF;

  SELECT count(*)
  INTO insecure_function_count
  FROM pg_proc
  WHERE oid IN (
    'public.create_membership_invitation(uuid,uuid,bytea,smallint,smallint,text,timestamptz,timestamptz,text,text,text,bytea,uuid,uuid)'::regprocedure,
    'public.resend_membership_invitation(uuid,bytea,smallint,smallint,text,timestamptz,timestamptz,text,bytea,uuid,uuid)'::regprocedure,
    'public.validate_membership_invitation(uuid,bytea,smallint,smallint,timestamptz,timestamptz,text,bytea,uuid,uuid)'::regprocedure,
    'public.revoke_membership_invitation(uuid,text,text,bytea,uuid,uuid)'::regprocedure
  )
    AND (
      NOT prosecdef
      OR proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
      OR NOT has_function_privilege('service_role', oid, 'EXECUTE')
      OR has_function_privilege('anon', oid, 'EXECUTE')
      OR has_function_privilege('authenticated', oid, 'EXECUTE')
    );
  IF insecure_function_count <> 0 THEN
    RAISE EXCEPTION '% PR-02 public functions violate the execution boundary',
      insecure_function_count;
  END IF;

  private_validator_oid :=
    'v12_invitation.validate_token_snapshot(uuid,bytea,smallint,smallint,timestamptz,timestamptz)'::regprocedure;
  validate_rpc_oid :=
    'public.validate_membership_invitation(uuid,bytea,smallint,smallint,timestamptz,timestamptz,text,bytea,uuid,uuid)'::regprocedure;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid = private_validator_oid
      AND NOT prosecdef
      AND provolatile = 's'
      AND proconfig = ARRAY['search_path=""']::text[]
      AND NOT has_function_privilege('anon', oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')
      AND NOT has_function_privilege('service_role', oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'Private validation primitive is not owner-only and read-only';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid = validate_rpc_oid
      AND pg_get_userbyid(proowner) = 'postgres'
      AND prokind = 'f'
      AND provolatile = 'v'
      AND prosecdef
      AND proconfig = ARRAY['search_path=""']::text[]
      AND has_function_privilege('postgres', oid, 'EXECUTE')
      AND has_function_privilege('service_role', oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')
      AND pg_get_function_result(oid) LIKE
        '%invitation_is_idempotent_retry boolean%'
  ) THEN
    RAISE EXCEPTION 'Public Validate RPC owner, kind, volatility, path, result, or role ACL drifted';
  END IF;

  IF pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid = private_validator_oid))
      IS DISTINCT FROM 'postgres'
    OR NOT has_function_privilege('postgres', private_validator_oid, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Private validation primitive owner capability drifted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS function_record
    CROSS JOIN LATERAL aclexplode(
      coalesce(function_record.proacl, acldefault('f', function_record.proowner))
    ) AS privilege
    WHERE function_record.oid IN (validate_rpc_oid, private_validator_oid)
      AND privilege.grantee = 0
      AND privilege.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PUBLIC retains an Invitation validation Execute grant';
  END IF;

  IF (SELECT pg_get_function_identity_arguments(validate_rpc_oid)) ~*
      '(nonce|plaintext|signature|secret|account_id|person_id)'
  THEN
    RAISE EXCEPTION 'Public Validate RPC accepts forbidden token or domain identity material';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid IN (validate_rpc_oid, private_validator_oid)
      AND prosrc ~* '\mEXECUTE\M'
  ) THEN
    RAISE EXCEPTION 'Invitation validation boundary uses dynamic SQL';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN (
        'create_membership_invitation', 'resend_membership_invitation',
        'validate_membership_invitation', 'revoke_membership_invitation'
      )
      AND (
        pg_get_functiondef(oid) ~
          'SET[[:space:]]+invitation_status[[:space:]]*=[[:space:]]*''accepted'''
        OR pg_get_functiondef(oid) ~ 'invitation_consumed_at[[:space:]]*='
      )
  ) THEN
    RAISE EXCEPTION 'A PR-02 public function can write accepted or consumed state';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('invitation_events', 'audit_logs')
      AND column_name ~ '(token|secret|hmac|nonce|key)'
  ) THEN
    RAISE EXCEPTION 'Invitation audit skeleton contains sensitive token material fields';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invitation_events'
      AND column_name = 'invitation_event_actor_auth_user_id'
      AND data_type = 'uuid'
  ) THEN
    RAISE EXCEPTION 'Invitation event authenticated Auth User attribution is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class AS table_record
    WHERE table_record.oid IN (
      'public.invitations'::regclass,
      'public.invitation_events'::regclass,
      'public.idempotency_records'::regclass,
      'public.audit_logs'::regclass
    )
      AND (
        has_table_privilege('service_role', table_record.oid, 'SELECT')
        OR has_table_privilege('service_role', table_record.oid, 'INSERT')
        OR has_table_privilege('service_role', table_record.oid, 'UPDATE')
        OR has_table_privilege('service_role', table_record.oid, 'DELETE')
        OR has_table_privilege('service_role', table_record.oid, 'TRUNCATE')
        OR has_table_privilege('service_role', table_record.oid, 'REFERENCES')
        OR has_table_privilege('service_role', table_record.oid, 'TRIGGER')
      )
  ) THEN
    RAISE EXCEPTION 'service_role can bypass a PR-02 Invitation function';
  END IF;
END;
$$;

INSERT INTO public.districts (
  district_id, district_code, district_name, district_country_code
)
VALUES (
  '70000000-0000-4000-8000-000000000001',
  'V700', 'Invitation verification district', 'TW'
);

INSERT INTO public.clubs (
  club_id, club_district_id, club_rotary_number, club_name
)
VALUES (
  '71000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  'V700', 'Invitation verification club'
);

INSERT INTO public.people (person_id, person_chinese_name)
VALUES
  ('72000000-0000-4000-8000-000000000001', 'Pending invitation verification'),
  ('72000000-0000-4000-8000-000000000002', 'Expired invitation verification'),
  ('72000000-0000-4000-8000-000000000003', 'Revoked invitation verification'),
  ('72000000-0000-4000-8000-000000000004', 'Accepted invitation verification'),
  ('72000000-0000-4000-8000-000000000005', 'Stale revoke verification'),
  ('72000000-0000-4000-8000-000000000006', 'Stale resend verification'),
  ('72000000-0000-4000-8000-000000000007', 'Stale expiry verification');

INSERT INTO public.memberships (
  membership_id, membership_person_id, membership_club_id,
  membership_status, membership_onboarding_status
)
VALUES
  (
    '73000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'pending', 'not_started'
  ),
  (
    '73000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000001',
    'pending', 'not_started'
  ),
  (
    '73000000-0000-4000-8000-000000000003',
    '72000000-0000-4000-8000-000000000003',
    '71000000-0000-4000-8000-000000000001',
    'pending', 'not_started'
  ),
  (
    '73000000-0000-4000-8000-000000000004',
    '72000000-0000-4000-8000-000000000004',
    '71000000-0000-4000-8000-000000000001',
    'pending', 'not_started'
  ),
  (
    '73000000-0000-4000-8000-000000000005',
    '72000000-0000-4000-8000-000000000005',
    '71000000-0000-4000-8000-000000000001',
    'pending', 'not_started'
  ),
  (
    '73000000-0000-4000-8000-000000000006',
    '72000000-0000-4000-8000-000000000006',
    '71000000-0000-4000-8000-000000000001',
    'pending', 'not_started'
  ),
  (
    '73000000-0000-4000-8000-000000000007',
    '72000000-0000-4000-8000-000000000007',
    '71000000-0000-4000-8000-000000000001',
    'pending', 'not_started'
  );

INSERT INTO public.invitations (
  invitation_id, invitation_membership_id, invitation_token_hash,
  invitation_hmac_key_version, invitation_token_version,
  invitation_token_nonce, invitation_token_issued_at,
  invitation_delivery_channel, invitation_status, invitation_expires_at,
  invitation_created_by_account_id, invitation_created_at,
  invitation_revoked_at, invitation_revoked_by_account_id,
  invitation_revoke_reason, invitation_accepted_at,
  invitation_accepted_by_auth_user_id, invitation_consumed_at
)
VALUES
  (
    '74000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    decode(repeat('71', 32), 'hex'), 1, 1,
    'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH',
    date_trunc('second', now() - interval '1 second'),
    'manual_link', 'pending', date_trunc('second', now() + interval '1 day'),
    '00000000-0000-0000-0000-000000000001', now() - interval '1 minute',
    NULL, NULL, NULL, NULL, NULL, NULL
  ),
  (
    '74000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    decode(repeat('72', 32), 'hex'), 1, 1,
    'IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII',
    date_trunc('second', now() - interval '2 days') + interval '1 second',
    'manual_link', 'pending', date_trunc('second', now() - interval '1 day'),
    '00000000-0000-0000-0000-000000000001',
    date_trunc('second', now() - interval '2 days'),
    NULL, NULL, NULL, NULL, NULL, NULL
  ),
  (
    '74000000-0000-4000-8000-000000000003',
    '73000000-0000-4000-8000-000000000003',
    decode(repeat('73', 32), 'hex'), 1, 1,
    'JJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ',
    date_trunc('second', now() - interval '1 second'),
    'manual_link', 'revoked', date_trunc('second', now() + interval '1 day'),
    '00000000-0000-0000-0000-000000000001', now() - interval '1 minute',
    now(), '00000000-0000-0000-0000-000000000001',
    'security_response', NULL, NULL, NULL
  ),
  (
    '74000000-0000-4000-8000-000000000004',
    '73000000-0000-4000-8000-000000000004',
    decode(repeat('74', 32), 'hex'), 1, 1,
    'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
    date_trunc('second', now() - interval '1 minute'),
    'manual_link', 'accepted', date_trunc('second', now() + interval '1 day'),
    '00000000-0000-0000-0000-000000000001', now() - interval '2 minutes',
    NULL, NULL, NULL, date_trunc('second', now()),
    '75000000-0000-4000-8000-000000000004', date_trunc('second', now())
  ),
  (
    '74000000-0000-4000-8000-000000000005',
    '73000000-0000-4000-8000-000000000005',
    decode(repeat('75', 32), 'hex'), 1, 1,
    'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
    date_trunc('second', now() - interval '1 second'),
    'manual_link', 'pending', date_trunc('second', now() + interval '1 day'),
    '00000000-0000-0000-0000-000000000001', now() - interval '1 minute',
    NULL, NULL, NULL, NULL, NULL, NULL
  ),
  (
    '74000000-0000-4000-8000-000000000006',
    '73000000-0000-4000-8000-000000000006',
    decode(repeat('76', 32), 'hex'), 1, 1,
    'NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN',
    date_trunc('second', now() - interval '1 second'),
    'manual_link', 'pending', date_trunc('second', now() + interval '1 day'),
    '00000000-0000-0000-0000-000000000001', now() - interval '1 minute',
    NULL, NULL, NULL, NULL, NULL, NULL
  ),
  (
    '74000000-0000-4000-8000-000000000007',
    '73000000-0000-4000-8000-000000000007',
    decode(repeat('77', 32), 'hex'), 1, 1,
    'OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO',
    clock_timestamp() - interval '1 second',
    'manual_link', 'pending', clock_timestamp() + interval '1 second',
    '00000000-0000-0000-0000-000000000001', clock_timestamp(),
    NULL, NULL, NULL, NULL, NULL, NULL
  );

DO $$
DECLARE
  result_record record;
  first_validated_at timestamptz;
  resend_old_issued_at timestamptz;
  resend_old_expires_at timestamptz;
  expiry_issued_at timestamptz;
  expiry_expires_at timestamptz;
  people_before bigint;
  accounts_before bigint;
  memberships_before bigint;
BEGIN
  SELECT count(*) INTO people_before FROM public.people;
  SELECT count(*) INTO accounts_before FROM public.accounts;
  SELECT count(*) INTO memberships_before FROM public.memberships;

  SELECT * INTO result_record
  FROM public.validate_membership_invitation(
    '74000000-0000-4000-8000-000000000001',
    decode(repeat('ff', 32), 'hex'), 1::smallint, 1::smallint,
    (SELECT invitation_token_issued_at FROM public.invitations
     WHERE invitation_id = '74000000-0000-4000-8000-000000000001'),
    (SELECT invitation_expires_at FROM public.invitations
     WHERE invitation_id = '74000000-0000-4000-8000-000000000001'),
    'verify-invalid-signature', decode(repeat('81', 32), 'hex'),
    '75000000-0000-4000-8000-000000000001',
    '75100000-0000-4000-8000-000000000001'
  );
  IF result_record.invitation_error_code IS DISTINCT FROM 'INVITATION_INVALID_SIGNATURE' THEN
    RAISE EXCEPTION 'Invalid Invitation signature did not fail safely';
  END IF;

  SELECT * INTO result_record
  FROM public.validate_membership_invitation(
    '74000000-0000-4000-8000-000000000001',
    decode(repeat('71', 32), 'hex'), 1::smallint, 1::smallint,
    (SELECT invitation_token_issued_at FROM public.invitations
     WHERE invitation_id = '74000000-0000-4000-8000-000000000001'),
    (SELECT invitation_expires_at FROM public.invitations
     WHERE invitation_id = '74000000-0000-4000-8000-000000000001'),
    'verify-validate-same', decode(repeat('82', 32), 'hex'),
    '75000000-0000-4000-8000-000000000001',
    '75100000-0000-4000-8000-000000000002'
  );
  IF result_record.invitation_error_code IS NOT NULL
    OR result_record.invitation_is_valid IS DISTINCT FROM true
    OR result_record.invitation_can_attempt_onboarding IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'Valid Invitation preflight failed';
  END IF;
  first_validated_at := result_record.invitation_validated_at;

  SELECT * INTO result_record
  FROM public.validate_membership_invitation(
    '74000000-0000-4000-8000-000000000001',
    decode(repeat('71', 32), 'hex'), 1::smallint, 1::smallint,
    (SELECT invitation_token_issued_at FROM public.invitations
     WHERE invitation_id = '74000000-0000-4000-8000-000000000001'),
    (SELECT invitation_expires_at FROM public.invitations
     WHERE invitation_id = '74000000-0000-4000-8000-000000000001'),
    'verify-validate-same', decode(repeat('82', 32), 'hex'),
    '75000000-0000-4000-8000-000000000001',
    '75100000-0000-4000-8000-000000000003'
  );
  IF result_record.invitation_error_code IS NOT NULL
    OR result_record.invitation_is_idempotent_retry IS DISTINCT FROM true
    OR result_record.invitation_validated_at IS DISTINCT FROM first_validated_at
  THEN
    RAISE EXCEPTION 'Same-key Validate did not return stable idempotent success';
  END IF;

  SELECT * INTO result_record
  FROM public.validate_membership_invitation(
    '74000000-0000-4000-8000-000000000001',
    decode(repeat('71', 32), 'hex'), 1::smallint, 1::smallint,
    (SELECT invitation_token_issued_at FROM public.invitations
     WHERE invitation_id = '74000000-0000-4000-8000-000000000001'),
    (SELECT invitation_expires_at FROM public.invitations
     WHERE invitation_id = '74000000-0000-4000-8000-000000000001'),
    'verify-validate-new1', decode(repeat('83', 32), 'hex'),
    '75000000-0000-4000-8000-000000000001',
    '75100000-0000-4000-8000-000000000004'
  );
  IF result_record.invitation_error_code IS NOT NULL
    OR result_record.invitation_is_idempotent_retry IS DISTINCT FROM false
  THEN
    RAISE EXCEPTION 'Repeated Validate with a new key was treated as token replay';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.invitations
    WHERE invitation_id = '74000000-0000-4000-8000-000000000001'
      AND invitation_status = 'pending'
      AND invitation_accepted_at IS NULL
      AND invitation_accepted_by_account_id IS NULL
      AND invitation_accepted_by_auth_user_id IS NULL
      AND invitation_consumed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Validate mutated pending, accepted, consumed, or binding state';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.invitation_events
    WHERE invitation_event_invitation_id = '74000000-0000-4000-8000-000000000001'
      AND invitation_event_type = 'validated'
      AND invitation_event_actor_auth_user_id =
        '75000000-0000-4000-8000-000000000001'
      AND invitation_event_actor_account_id IS NULL
      AND invitation_event_reason_detail IS NULL
  ) THEN
    RAISE EXCEPTION 'Validate did not preserve Auth User actor semantics without Account binding';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.audit_logs
    WHERE audit_log_target_id = '74000000-0000-4000-8000-000000000001'
      AND audit_log_action_code = 'invitation.validated'
      AND audit_log_actor_account_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Validate invented an Audit actor Account for an unbound Auth User';
  END IF;

  SELECT * INTO result_record
  FROM public.validate_membership_invitation(
    '74000000-0000-4000-8000-000000000002',
    decode(repeat('72', 32), 'hex'), 1::smallint, 1::smallint,
    (SELECT invitation_token_issued_at FROM public.invitations
     WHERE invitation_id = '74000000-0000-4000-8000-000000000002'),
    (SELECT invitation_expires_at FROM public.invitations
     WHERE invitation_id = '74000000-0000-4000-8000-000000000002'),
    'verify-expired-token', decode(repeat('84', 32), 'hex'),
    '75000000-0000-4000-8000-000000000001',
    '75100000-0000-4000-8000-000000000005'
  );
  IF result_record.invitation_error_code IS DISTINCT FROM 'INVITATION_EXPIRED'
    OR NOT EXISTS (
      SELECT 1 FROM public.invitations
      WHERE invitation_id = '74000000-0000-4000-8000-000000000002'
        AND invitation_status = 'pending'
        AND invitation_marked_expired_at IS NULL
    )
  THEN
    RAISE EXCEPTION 'Expired Validate failed or mutated Invitation state';
  END IF;

  SELECT * INTO result_record
  FROM public.validate_membership_invitation(
    '74000000-0000-4000-8000-000000000003',
    decode(repeat('73', 32), 'hex'), 1::smallint, 1::smallint,
    (SELECT invitation_token_issued_at FROM public.invitations
     WHERE invitation_id = '74000000-0000-4000-8000-000000000003'),
    (SELECT invitation_expires_at FROM public.invitations
     WHERE invitation_id = '74000000-0000-4000-8000-000000000003'),
    'verify-revoked-token', decode(repeat('85', 32), 'hex'),
    '75000000-0000-4000-8000-000000000001',
    '75100000-0000-4000-8000-000000000006'
  );
  IF result_record.invitation_error_code IS DISTINCT FROM 'INVITATION_REVOKED' THEN
    RAISE EXCEPTION 'Revoked Validate did not fail';
  END IF;

  SELECT * INTO result_record
  FROM public.validate_membership_invitation(
    '74000000-0000-4000-8000-000000000004',
    decode(repeat('74', 32), 'hex'), 1::smallint, 1::smallint,
    (SELECT invitation_token_issued_at FROM public.invitations
     WHERE invitation_id = '74000000-0000-4000-8000-000000000004'),
    (SELECT invitation_expires_at FROM public.invitations
     WHERE invitation_id = '74000000-0000-4000-8000-000000000004'),
    'verify-accepted-fixture', decode(repeat('86', 32), 'hex'),
    '75000000-0000-4000-8000-000000000001',
    '75100000-0000-4000-8000-000000000007'
  );
  IF result_record.invitation_error_code IS DISTINCT FROM 'INVITATION_ALREADY_ACCEPTED' THEN
    RAISE EXCEPTION 'Accepted fixture Validate did not fail';
  END IF;

  SELECT * INTO result_record
  FROM public.validate_membership_invitation(
    '74000000-0000-4000-8000-000000000005',
    decode(repeat('75', 32), 'hex'), 1::smallint, 1::smallint,
    (SELECT invitation_token_issued_at FROM public.invitations
     WHERE invitation_id = '74000000-0000-4000-8000-000000000005'),
    (SELECT invitation_expires_at FROM public.invitations
     WHERE invitation_id = '74000000-0000-4000-8000-000000000005'),
    'verify-before-revoke', decode(repeat('87', 32), 'hex'),
    '75000000-0000-4000-8000-000000000001',
    '75100000-0000-4000-8000-000000000008'
  );
  IF result_record.invitation_error_code IS NOT NULL THEN
    RAISE EXCEPTION 'Pre-revoke Validate setup failed';
  END IF;

  UPDATE public.invitations
  SET invitation_status = 'revoked',
      invitation_revoked_at = clock_timestamp(),
      invitation_revoked_by_account_id = '00000000-0000-0000-0000-000000000001',
      invitation_revoke_reason = 'security_response'
  WHERE invitation_id = '74000000-0000-4000-8000-000000000005';

  SELECT * INTO result_record
  FROM public.validate_membership_invitation(
    '74000000-0000-4000-8000-000000000005',
    decode(repeat('75', 32), 'hex'), 1::smallint, 1::smallint,
    (SELECT invitation_token_issued_at FROM public.invitations
     WHERE invitation_id = '74000000-0000-4000-8000-000000000005'),
    (SELECT invitation_expires_at FROM public.invitations
     WHERE invitation_id = '74000000-0000-4000-8000-000000000005'),
    'verify-before-revoke', decode(repeat('87', 32), 'hex'),
    '75000000-0000-4000-8000-000000000001',
    '75100000-0000-4000-8000-000000000009'
  );
  IF result_record.invitation_error_code IS DISTINCT FROM 'INVITATION_REVOKED'
    OR result_record.invitation_is_idempotent_retry IS DISTINCT FROM true
    OR result_record.invitation_can_attempt_onboarding IS DISTINCT FROM false
  THEN
    RAISE EXCEPTION 'Same-key Validate returned stale positive state after revoke';
  END IF;

  SELECT invitation_token_issued_at, invitation_expires_at
  INTO resend_old_issued_at, resend_old_expires_at
  FROM public.invitations
  WHERE invitation_id = '74000000-0000-4000-8000-000000000006';

  SELECT * INTO result_record
  FROM public.validate_membership_invitation(
    '74000000-0000-4000-8000-000000000006',
    decode(repeat('76', 32), 'hex'), 1::smallint, 1::smallint,
    resend_old_issued_at, resend_old_expires_at,
    'verify-before-resend', decode(repeat('88', 32), 'hex'),
    '75000000-0000-4000-8000-000000000001',
    '75100000-0000-4000-8000-000000000010'
  );
  IF result_record.invitation_error_code IS NOT NULL THEN
    RAISE EXCEPTION 'Pre-resend Validate setup failed';
  END IF;

  UPDATE public.invitations
  SET invitation_token_hash = decode(repeat('86', 32), 'hex'),
      invitation_token_nonce = 'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP',
      invitation_token_issued_at = date_trunc('second', clock_timestamp()),
      invitation_expires_at = date_trunc('second', clock_timestamp() + interval '1 day')
  WHERE invitation_id = '74000000-0000-4000-8000-000000000006';

  SELECT * INTO result_record
  FROM public.validate_membership_invitation(
    '74000000-0000-4000-8000-000000000006',
    decode(repeat('76', 32), 'hex'), 1::smallint, 1::smallint,
    resend_old_issued_at, resend_old_expires_at,
    'verify-before-resend', decode(repeat('88', 32), 'hex'),
    '75000000-0000-4000-8000-000000000001',
    '75100000-0000-4000-8000-000000000011'
  );
  IF result_record.invitation_error_code IS DISTINCT FROM 'INVITATION_INVALID_SIGNATURE'
    OR result_record.invitation_is_idempotent_retry IS DISTINCT FROM true
    OR result_record.invitation_can_attempt_onboarding IS DISTINCT FROM false
  THEN
    RAISE EXCEPTION 'Same-key Validate returned stale positive state after resend';
  END IF;

  SELECT invitation_token_issued_at, invitation_expires_at
  INTO expiry_issued_at, expiry_expires_at
  FROM public.invitations
  WHERE invitation_id = '74000000-0000-4000-8000-000000000007';

  SELECT * INTO result_record
  FROM public.validate_membership_invitation(
    '74000000-0000-4000-8000-000000000007',
    decode(repeat('77', 32), 'hex'), 1::smallint, 1::smallint,
    expiry_issued_at, expiry_expires_at,
    'verify-before-expiry', decode(repeat('89', 32), 'hex'),
    '75000000-0000-4000-8000-000000000001',
    '75100000-0000-4000-8000-000000000012'
  );
  IF result_record.invitation_error_code IS NOT NULL THEN
    RAISE EXCEPTION 'Pre-expiry Validate setup failed';
  END IF;

  PERFORM pg_sleep(1.1);

  SELECT * INTO result_record
  FROM public.validate_membership_invitation(
    '74000000-0000-4000-8000-000000000007',
    decode(repeat('77', 32), 'hex'), 1::smallint, 1::smallint,
    expiry_issued_at, expiry_expires_at,
    'verify-before-expiry', decode(repeat('89', 32), 'hex'),
    '75000000-0000-4000-8000-000000000001',
    '75100000-0000-4000-8000-000000000013'
  );
  IF result_record.invitation_error_code IS DISTINCT FROM 'INVITATION_EXPIRED'
    OR result_record.invitation_is_idempotent_retry IS DISTINCT FROM true
    OR result_record.invitation_can_attempt_onboarding IS DISTINCT FROM false
    OR NOT EXISTS (
      SELECT 1 FROM public.invitations
      WHERE invitation_id = '74000000-0000-4000-8000-000000000007'
        AND invitation_status = 'pending'
        AND invitation_marked_expired_at IS NULL
        AND invitation_consumed_at IS NULL
    )
  THEN
    RAISE EXCEPTION
      'Same-key Validate returned stale positive state or mutated expiry: code=%, retry=%, eligible=%, state=%',
      result_record.invitation_error_code,
      result_record.invitation_is_idempotent_retry,
      result_record.invitation_can_attempt_onboarding,
      (SELECT row(invitation_status, invitation_marked_expired_at, invitation_consumed_at)::text
       FROM public.invitations
       WHERE invitation_id = '74000000-0000-4000-8000-000000000007');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invitation_events
    WHERE invitation_event_type IN ('accepted', 'replay_attempt')
  ) OR EXISTS (
    SELECT 1
    FROM public.audit_logs
    WHERE audit_log_action_code IN ('invitation.accepted', 'invitation.replay_attempt')
  ) THEN
    RAISE EXCEPTION 'PR-02 Validate emitted accepted or final replay audit';
  END IF;

  IF (SELECT count(*) FROM public.people) <> people_before
    OR (SELECT count(*) FROM public.accounts) <> accounts_before
    OR (SELECT count(*) FROM public.memberships) <> memberships_before
  THEN
    RAISE EXCEPTION 'PR-02 validation crossed the onboarding domain boundary';
  END IF;
END;
$$;

SELECT
  (SELECT count(*) FROM public.invitations) AS invitation_count,
  (SELECT count(*) FROM public.invitation_events) AS invitation_event_count,
  (SELECT count(*) FROM pg_proc WHERE pronamespace = 'v12_invitation'::regnamespace)
    AS private_helper_count,
  (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
    AND proname IN (
      'create_membership_invitation', 'resend_membership_invitation',
      'validate_membership_invitation', 'revoke_membership_invitation'
    )) AS public_function_count;

ROLLBACK;
