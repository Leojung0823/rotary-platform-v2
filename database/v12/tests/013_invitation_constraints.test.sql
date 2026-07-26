BEGIN;
SET LOCAL search_path = extensions, public, pg_catalog;
SELECT plan(18);

INSERT INTO public.districts (
  district_id, district_code, district_name, district_country_code
) VALUES (
  'a1000000-0000-4000-8000-000000000001', 'TCON', '邀請約束測試地區', 'TW'
);

INSERT INTO public.clubs (
  club_id, club_district_id, club_rotary_number, club_name
) VALUES (
  'a1100000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'CCON', '邀請約束測試社'
);

INSERT INTO public.people (person_id, person_chinese_name)
SELECT
  ('a12' || lpad(series::text, 5, '0') || '-0000-4000-8000-' ||
    lpad(series::text, 12, '0'))::uuid,
  '約束測試人員 ' || series
FROM generate_series(1, 6) AS series;

INSERT INTO public.memberships (
  membership_id, membership_person_id, membership_club_id,
  membership_status, membership_onboarding_status
)
SELECT
  ('a13' || lpad(series::text, 5, '0') || '-0000-4000-8000-' ||
    lpad(series::text, 12, '0'))::uuid,
  ('a12' || lpad(series::text, 5, '0') || '-0000-4000-8000-' ||
    lpad(series::text, 12, '0'))::uuid,
  'a1100000-0000-4000-8000-000000000001',
  'pending', 'not_started'
FROM generate_series(1, 6) AS series;

SELECT lives_ok(
  $$INSERT INTO public.invitations (
      invitation_id, invitation_membership_id, invitation_token_hash,
      invitation_hmac_key_version, invitation_token_version,
      invitation_token_nonce, invitation_token_issued_at,
      invitation_delivery_channel, invitation_status, invitation_expires_at,
      invitation_created_by_account_id
    ) VALUES (
      'a1400000-0000-4000-8000-000000000001',
      'a1300001-0000-4000-8000-000000000001', decode(repeat('a1', 32), 'hex'),
      1, 1, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      date_trunc('second', now() - interval '1 minute'),
      'manual_link', 'pending', date_trunc('second', now() + interval '1 day'),
      '00000000-0000-0000-0000-000000000001'
    )$$,
  'Database accepts a legal pending Invitation'
);

SELECT lives_ok(
  $$INSERT INTO public.invitations (
      invitation_id, invitation_membership_id, invitation_token_hash,
      invitation_hmac_key_version, invitation_token_version,
      invitation_token_nonce, invitation_token_issued_at,
      invitation_delivery_channel, invitation_status, invitation_expires_at,
      invitation_revoked_at, invitation_revoked_by_account_id,
      invitation_revoke_reason, invitation_created_by_account_id
    ) VALUES (
      'a1400000-0000-4000-8000-000000000002',
      'a1300002-0000-4000-8000-000000000002', decode(repeat('a2', 32), 'hex'),
      1, 1, 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      date_trunc('second', now() - interval '1 minute'),
      'manual_link', 'revoked', date_trunc('second', now() + interval '1 day'),
      date_trunc('second', now()), '00000000-0000-0000-0000-000000000001',
      'security_response', '00000000-0000-0000-0000-000000000001'
    )$$,
  'Database accepts a legal revoked Invitation'
);

SELECT lives_ok(
  $$INSERT INTO public.invitations (
      invitation_id, invitation_membership_id, invitation_token_hash,
      invitation_hmac_key_version, invitation_token_version,
      invitation_token_nonce, invitation_token_issued_at,
      invitation_delivery_channel, invitation_status, invitation_expires_at,
      invitation_marked_expired_at, invitation_created_by_account_id,
      invitation_created_at
    ) VALUES (
      'a1400000-0000-4000-8000-000000000003',
      'a1300003-0000-4000-8000-000000000003', decode(repeat('a3', 32), 'hex'),
      1, 1, 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
      date_trunc('second', now() - interval '2 days'),
      'manual_link', 'expired', date_trunc('second', now() - interval '1 day'),
      date_trunc('second', now()), '00000000-0000-0000-0000-000000000001',
      date_trunc('second', now() - interval '2 days')
    )$$,
  'Database accepts a legal expired Invitation'
);

SELECT lives_ok(
  $$INSERT INTO public.invitations (
      invitation_id, invitation_membership_id, invitation_token_hash,
      invitation_hmac_key_version, invitation_token_version,
      invitation_token_nonce, invitation_token_issued_at,
      invitation_delivery_channel, invitation_status, invitation_expires_at,
      invitation_accepted_at, invitation_accepted_by_auth_user_id,
      invitation_consumed_at, invitation_created_by_account_id
    ) VALUES (
      'a1400000-0000-4000-8000-000000000004',
      'a1300004-0000-4000-8000-000000000004', decode(repeat('a4', 32), 'hex'),
      1, 1, 'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
      date_trunc('second', now() - interval '1 minute'),
      'manual_link', 'accepted', date_trunc('second', now() + interval '1 day'),
      date_trunc('second', now()), 'a1500000-0000-4000-8000-000000000004',
      date_trunc('second', now() + interval '1 second'),
      '00000000-0000-0000-0000-000000000001'
    )$$,
  'Database accepts a legal accepted Invitation'
);

SELECT lives_ok(
  $$INSERT INTO public.invitations (
      invitation_id, invitation_membership_id, invitation_token_hash,
      invitation_hmac_key_version, invitation_token_version,
      invitation_token_nonce, invitation_token_issued_at,
      invitation_delivery_channel, invitation_status, invitation_expires_at,
      invitation_accepted_at, invitation_accepted_by_auth_user_id,
      invitation_consumed_at, invitation_created_by_account_id
    ) VALUES (
      'a1400000-0000-4000-8000-000000000005',
      'a1300005-0000-4000-8000-000000000005', decode(repeat('a5', 32), 'hex'),
      1, 1, 'EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE',
      date_trunc('second', now() - interval '1 minute'),
      'manual_link', 'accepted', date_trunc('second', now() + interval '1 day'),
      date_trunc('second', now()), 'a1500000-0000-4000-8000-000000000005',
      date_trunc('second', now()), '00000000-0000-0000-0000-000000000001'
    )$$,
  'Database accepts equal accepted_at and consumed_at timestamps'
);

SELECT lives_ok(
  $$INSERT INTO public.invitations (
      invitation_id, invitation_membership_id, invitation_token_hash,
      invitation_hmac_key_version, invitation_token_version,
      invitation_token_nonce, invitation_token_issued_at,
      invitation_delivery_channel, invitation_status, invitation_expires_at,
      invitation_accepted_at, invitation_accepted_by_auth_user_id,
      invitation_consumed_at, invitation_created_by_account_id
    ) VALUES (
      'a1400000-0000-4000-8000-000000000006',
      'a1300006-0000-4000-8000-000000000006', decode(repeat('a6', 32), 'hex'),
      1, 1, 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
      date_trunc('second', now() - interval '1 minute'),
      'manual_link', 'accepted', date_trunc('second', now() + interval '1 day'),
      date_trunc('second', now()), 'a1500000-0000-4000-8000-000000000006',
      date_trunc('second', now() + interval '1 minute'),
      '00000000-0000-0000-0000-000000000001'
    )$$,
  'Database accepts consumed_at later than accepted_at'
);

SELECT throws_ok(
  $$UPDATE public.invitations SET
      invitation_status = 'accepted',
      invitation_accepted_by_auth_user_id = 'a1500000-0000-4000-8000-000000000001'
    WHERE invitation_id = 'a1400000-0000-4000-8000-000000000001'$$,
  '23514', NULL, 'Database rejects accepted with accepted_at null'
);

SELECT throws_ok(
  $$UPDATE public.invitations SET
      invitation_status = 'accepted', invitation_accepted_at = now(),
      invitation_accepted_by_auth_user_id = 'a1500000-0000-4000-8000-000000000001'
    WHERE invitation_id = 'a1400000-0000-4000-8000-000000000001'$$,
  '23514', NULL, 'Database rejects accepted with consumed_at null'
);

SELECT throws_ok(
  $$UPDATE public.invitations SET invitation_accepted_at = now()
    WHERE invitation_id = 'a1400000-0000-4000-8000-000000000001'$$,
  '23514', NULL, 'Database rejects pending with accepted_at non-null'
);

SELECT throws_ok(
  $$UPDATE public.invitations SET invitation_consumed_at = now()
    WHERE invitation_id = 'a1400000-0000-4000-8000-000000000001'$$,
  '23514', NULL, 'Database rejects pending with consumed_at non-null'
);

SELECT throws_ok(
  $$UPDATE public.invitations SET invitation_accepted_at = now()
    WHERE invitation_id = 'a1400000-0000-4000-8000-000000000002'$$,
  '23514', NULL, 'Database rejects revoked with accepted_at non-null'
);

SELECT throws_ok(
  $$UPDATE public.invitations SET invitation_consumed_at = now()
    WHERE invitation_id = 'a1400000-0000-4000-8000-000000000002'$$,
  '23514', NULL, 'Database rejects revoked with consumed_at non-null'
);

SELECT throws_ok(
  $$UPDATE public.invitations SET invitation_accepted_at = now()
    WHERE invitation_id = 'a1400000-0000-4000-8000-000000000003'$$,
  '23514', NULL, 'Database rejects expired with accepted_at non-null'
);

SELECT throws_ok(
  $$UPDATE public.invitations SET invitation_consumed_at = now()
    WHERE invitation_id = 'a1400000-0000-4000-8000-000000000003'$$,
  '23514', NULL, 'Database rejects expired with consumed_at non-null'
);

SELECT throws_ok(
  $$UPDATE public.invitations SET
      invitation_status = 'accepted',
      invitation_accepted_at = invitation_token_issued_at - interval '1 second',
      invitation_consumed_at = invitation_token_issued_at,
      invitation_accepted_by_auth_user_id = 'a1500000-0000-4000-8000-000000000001'
    WHERE invitation_id = 'a1400000-0000-4000-8000-000000000001'$$,
  '23514', NULL, 'Database rejects accepted_at earlier than issued_at'
);

SELECT throws_ok(
  $$UPDATE public.invitations SET
      invitation_status = 'accepted', invitation_accepted_at = now(),
      invitation_consumed_at = now() - interval '1 second',
      invitation_accepted_by_auth_user_id = 'a1500000-0000-4000-8000-000000000001'
    WHERE invitation_id = 'a1400000-0000-4000-8000-000000000001'$$,
  '23514', NULL, 'Database rejects consumed_at earlier than accepted_at'
);

SELECT throws_ok(
  $$UPDATE public.invitations
    SET invitation_expires_at = invitation_token_issued_at
    WHERE invitation_id = 'a1400000-0000-4000-8000-000000000001'$$,
  '23514', NULL, 'Database rejects expires_at equal to issued_at'
);

SELECT throws_ok(
  $$UPDATE public.invitations
    SET invitation_expires_at = invitation_token_issued_at - interval '1 second'
    WHERE invitation_id = 'a1400000-0000-4000-8000-000000000001'$$,
  '23514', NULL, 'Database rejects expires_at earlier than issued_at'
);

SELECT * FROM finish();
ROLLBACK;
