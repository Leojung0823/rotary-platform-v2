BEGIN;
SET LOCAL search_path = extensions, public, pg_catalog;
SELECT plan(12);

INSERT INTO public.people (person_id, person_chinese_name) VALUES
  ('10000000-0000-4000-8000-000000000001', '帳號測試甲'),
  ('10000000-0000-4000-8000-000000000002', '帳號測試乙');

SELECT lives_ok(
  $$INSERT INTO public.accounts (account_id, account_person_id, account_auth_user_id, account_status, account_creation_source)
    VALUES ('11000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
            '12000000-0000-4000-8000-000000000001', 'active', 'invitation_onboarding')$$,
  'active human Account accepts real Person and Auth references'
);
SELECT throws_ok(
  $$INSERT INTO public.accounts (account_person_id, account_auth_user_id, account_status, account_creation_source)
    VALUES ('10000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000002',
            'active', 'administrative_repair')$$,
  '23505', NULL,
  'one Person cannot have two live human Accounts'
);
SELECT throws_ok(
  $$INSERT INTO public.accounts (account_person_id, account_status, account_creation_source)
    VALUES ('10000000-0000-4000-8000-000000000002', 'active', 'administrative_repair')$$,
  '23514', NULL,
  'active human Account requires Auth user'
);
SELECT lives_ok(
  $$INSERT INTO public.accounts (account_kind, account_status, account_creation_source)
    VALUES ('system', 'active', 'data_migration')$$,
  'system Account requires neither Person nor Auth user'
);
SELECT lives_ok(
  $$UPDATE public.accounts SET account_status = 'anonymized', account_auth_user_id = NULL,
      account_anonymized_at = clock_timestamp()
    WHERE account_id = '11000000-0000-4000-8000-000000000001'$$,
  'anonymized Account drops its Auth reference'
);
SELECT lives_ok(
  $$INSERT INTO public.accounts (account_id, account_person_id, account_auth_user_id, account_status, account_creation_source)
    VALUES ('11000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000003',
            'active', 'administrative_repair')$$,
  'anonymized Account is outside live Person uniqueness'
);
SELECT throws_ok(
  $$INSERT INTO public.identities (identity_account_id, identity_provider, identity_provider_subject, identity_provider_tenant)
    VALUES ('11000000-0000-4000-8000-000000000001', 'email', 'anonymous@example.invalid', 'test')$$,
  '23514', NULL,
  'anonymized Account cannot receive a login identity'
);
SELECT throws_ok(
  $$INSERT INTO public.account_sessions (account_session_auth_session_id, account_session_account_id)
    VALUES (gen_random_uuid(), '11000000-0000-4000-8000-000000000001')$$,
  '23514', NULL,
  'anonymized Account cannot receive a session'
);
INSERT INTO public.identities (
  identity_account_id, identity_provider, identity_provider_subject, identity_provider_tenant
) VALUES (
  '11000000-0000-4000-8000-000000000002', 'email', 'live@example.invalid', 'test'
);
SELECT throws_ok(
  $$UPDATE public.accounts SET account_status = 'anonymized', account_auth_user_id = NULL,
      account_anonymized_at = clock_timestamp()
    WHERE account_id = '11000000-0000-4000-8000-000000000002'$$,
  '23514', NULL,
  'live identity must be ended before Account anonymization'
);
SELECT throws_ok(
  $$INSERT INTO public.accounts (account_person_id, account_auth_user_id, account_status,
      account_creation_source, account_anonymized_at)
    VALUES ('10000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000004',
            'anonymized', 'administrative_repair', now())$$,
  '23514', NULL,
  'anonymized Account cannot retain an Auth user'
);
SELECT throws_ok(
  $$INSERT INTO public.identities (identity_account_id, identity_provider, identity_provider_subject, identity_provider_tenant)
    SELECT account_id, 'email', 'system@example.invalid', 'test'
    FROM public.accounts WHERE account_kind = 'system' ORDER BY account_created_at LIMIT 1$$,
  '23514', NULL,
  'system Account cannot own a login identity'
);
SELECT throws_ok(
  $$INSERT INTO public.account_sessions (account_session_auth_session_id, account_session_account_id)
    SELECT gen_random_uuid(), account_id FROM public.accounts WHERE account_kind = 'system' ORDER BY account_created_at LIMIT 1$$,
  '23514', NULL,
  'system Account cannot own a session'
);

SELECT * FROM finish();
ROLLBACK;
