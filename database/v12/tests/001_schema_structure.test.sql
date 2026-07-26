BEGIN;
SET LOCAL search_path = extensions, public, pg_catalog;
SELECT plan(15);

SELECT is(
  (SELECT count(*) FROM pg_tables WHERE schemaname = 'public'),
  31::bigint,
  'V1.2 foundation has exactly 31 public tables'
);
SELECT has_table('public', 'people', 'people exists');
SELECT has_table('public', 'accounts', 'accounts exists');
SELECT has_table('public', 'memberships', 'memberships exists');
SELECT has_table('public', 'invitations', 'invitations exists');
SELECT has_table('public', 'identities', 'identities exists');
SELECT has_table('public', 'line_oa_contacts', 'LINE OA is separate from login identity');
SELECT has_column('public', 'audit_logs', 'audit_log_actor_role_code', 'audit role snapshot exists');
SELECT has_column('public', 'login_events', 'login_event_channel_config_id', 'login event channel attribution exists');
SELECT has_column('public', 'invitations', 'invitation_marked_expired_at', 'explicit marked-expired timestamp exists');
SELECT has_column('public', 'accounts', 'account_kind', 'human/system account discriminator exists');
SELECT has_column('public', 'devices', 'device_fingerprint_scope', 'device fingerprint scope exists');
SELECT throws_ok(
  $$INSERT INTO public.roles (role_scope_type, role_code, role_name)
    VALUES ('club_term', 'invalid.club_term', '不合法任期角色')$$,
  '23514', NULL,
  'role scope cannot be club_term'
);
INSERT INTO public.line_channel_configs (
  line_channel_provider_id, line_channel_external_channel_id,
  line_channel_type, line_channel_environment, line_channel_display_name
) VALUES ('provider-a', 'channel-structure-test', 'login', 'development', '測試頻道');
SELECT throws_ok(
  $$INSERT INTO public.line_channel_configs
      (line_channel_provider_id, line_channel_external_channel_id,
       line_channel_type, line_channel_environment, line_channel_display_name)
    VALUES ('provider-b', 'channel-structure-test', 'login', 'development', '重複頻道')$$,
  '23505', NULL,
  'LINE external channel is unique within one environment'
);
SELECT lives_ok(
  $$INSERT INTO public.line_channel_configs
      (line_channel_provider_id, line_channel_external_channel_id,
       line_channel_type, line_channel_environment, line_channel_display_name)
    VALUES ('provider-a', 'channel-structure-test', 'login', 'staging', '測試頻道 staging')$$,
  'same LINE external channel can exist in a different environment'
);

SELECT * FROM finish();
ROLLBACK;
