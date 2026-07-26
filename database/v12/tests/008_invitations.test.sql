BEGIN;
SET LOCAL search_path = extensions, public, pg_catalog;
SELECT plan(7);

INSERT INTO public.districts (district_id, district_code, district_name, district_country_code)
VALUES ('40000000-0000-4000-8000-000000000001', 'T400', '邀請測試地區', 'TW');
INSERT INTO public.clubs (club_id, club_district_id, club_rotary_number, club_name)
VALUES ('41000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'C400', '邀請測試社');
INSERT INTO public.people (person_id, person_chinese_name)
VALUES ('42000000-0000-4000-8000-000000000001', '邀請測試社員');
INSERT INTO public.memberships (membership_id, membership_person_id, membership_club_id)
VALUES ('43000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001');

INSERT INTO public.invitations (
  invitation_id, invitation_membership_id, invitation_token_hash,
  invitation_hmac_key_version, invitation_token_version,
  invitation_token_nonce, invitation_token_issued_at, invitation_delivery_channel,
  invitation_expires_at, invitation_created_by_account_id
)
SELECT '44000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001',
       decode(repeat('01', 32), 'hex'), 1, 1,
       'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', now(),
       'manual_link', now() + interval '1 day', account_id
FROM public.accounts WHERE account_kind = 'system' ORDER BY account_created_at LIMIT 1;

SELECT throws_ok(
  $$INSERT INTO public.invitations
      (invitation_membership_id, invitation_token_hash, invitation_hmac_key_version,
       invitation_token_version, invitation_token_nonce, invitation_token_issued_at,
       invitation_delivery_channel, invitation_expires_at, invitation_created_by_account_id)
    SELECT '43000000-0000-4000-8000-000000000001', decode(repeat('04', 32), 'hex'), 1,
           1, 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', now(),
           'email', now() + interval '1 day', account_id
    FROM public.accounts WHERE account_kind = 'system' ORDER BY account_created_at LIMIT 1$$,
  '23505', NULL,
  'one pending Invitation is allowed per Membership'
);
SELECT ok(
  (SELECT pg_get_expr(i.indpred, i.indrelid) NOT LIKE '%now(%'
   FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
   WHERE c.relname = 'uq_invitations__membership_pending'),
  'pending Invitation unique predicate does not use now()'
);
SELECT has_column('public', 'invitations', 'invitation_marked_expired_at', 'marked-expired timestamp has the required name');
SELECT is(
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invitations' AND column_name ~ '(^|_)token$|token_plain|raw_token'),
  0::bigint,
  'Invitation stores no plaintext token column'
);
SELECT ok(
  (SELECT col_description('public.invitations'::regclass, attnum) LIKE '%HMAC-SHA-256%'
   FROM pg_attribute WHERE attrelid = 'public.invitations'::regclass AND attname = 'invitation_token_hash'),
  'token digest documents HMAC-SHA-256 and trusted-boundary handling'
);
SELECT throws_ok(
  $$INSERT INTO public.invitations
      (invitation_membership_id, invitation_token_hash, invitation_hmac_key_version,
       invitation_token_version, invitation_token_nonce, invitation_token_issued_at,
       invitation_delivery_channel, invitation_status, invitation_expires_at,
       invitation_created_by_account_id)
    SELECT '43000000-0000-4000-8000-000000000001', decode(repeat('07', 32), 'hex'), 1,
           1, 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', now(),
           'email', 'expired', now() + interval '1 day', account_id
    FROM public.accounts WHERE account_kind = 'system' ORDER BY account_created_at LIMIT 1$$,
  '23514', NULL,
  'expired Invitation requires invitation_marked_expired_at'
);
UPDATE public.invitations
SET invitation_status = 'revoked', invitation_revoked_at = now(),
    invitation_revoked_by_account_id = (SELECT account_id FROM public.accounts WHERE account_kind = 'system' ORDER BY account_created_at LIMIT 1),
    invitation_revoke_reason = 'security_response'
WHERE invitation_id = '44000000-0000-4000-8000-000000000001';
SELECT lives_ok(
  $$INSERT INTO public.invitations
      (invitation_membership_id, invitation_token_hash, invitation_hmac_key_version,
       invitation_token_version, invitation_token_nonce, invitation_token_issued_at,
       invitation_delivery_channel, invitation_expires_at, invitation_created_by_account_id)
    SELECT '43000000-0000-4000-8000-000000000001', decode(repeat('01', 32), 'hex'), 2,
           1, 'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD', now(),
           'manual_link', now() + interval '1 day', account_id
    FROM public.accounts WHERE account_kind = 'system' ORDER BY account_created_at LIMIT 1$$,
  'same digest bytes can coexist under a new hash-key version'
);

SELECT * FROM finish();
ROLLBACK;
