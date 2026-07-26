BEGIN;
SET LOCAL search_path = extensions, public, pg_catalog;
SELECT plan(6);

SELECT has_column('public', 'devices', 'device_fingerprint_scope', 'device has fingerprint namespace');
SELECT is((SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'devices' AND column_name LIKE '%account%'), 0::bigint, 'device is not owned by one Account');

INSERT INTO public.people (person_id, person_chinese_name) VALUES
  ('20000000-0000-4000-8000-000000000001', '裝置測試甲'),
  ('20000000-0000-4000-8000-000000000002', '裝置測試乙');
INSERT INTO public.accounts (account_id, account_person_id, account_auth_user_id, account_creation_source) VALUES
  ('21000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'administrative_repair'),
  ('21000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000002', 'administrative_repair');
INSERT INTO public.devices (device_id, device_fingerprint_scope, device_fingerprint_hash) VALUES
  ('23000000-0000-4000-8000-000000000001', 'platform', decode('aabbcc', 'hex'));

SELECT lives_ok(
  $$INSERT INTO public.account_devices (account_device_account_id, account_device_device_id) VALUES
      ('21000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001'),
      ('21000000-0000-4000-8000-000000000002', '23000000-0000-4000-8000-000000000001')$$,
  'one Device can be linked to different Accounts'
);
SELECT is((SELECT count(*) FROM public.account_devices WHERE account_device_device_id = '23000000-0000-4000-8000-000000000001'), 2::bigint, 'shared Device keeps two Account relationships');
SELECT throws_ok(
  $$INSERT INTO public.devices (device_fingerprint_scope, device_fingerprint_hash_version, device_fingerprint_hash)
      VALUES ('platform', 1, decode('aabbcc', 'hex'))$$,
  '23505', NULL,
  'same scope, version, and hash is deduplicated'
);
SELECT lives_ok(
  $$INSERT INTO public.devices (device_fingerprint_scope, device_fingerprint_hash_version, device_fingerprint_hash)
      VALUES ('partner', 1, decode('aabbcc', 'hex'))$$,
  'same hash can exist in a different fingerprint scope'
);

SELECT * FROM finish();
ROLLBACK;
