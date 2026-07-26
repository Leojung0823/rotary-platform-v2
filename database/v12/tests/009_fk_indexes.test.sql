BEGIN;
SET LOCAL search_path = extensions, public, pg_catalog;
SELECT plan(10);

CREATE TEMP TABLE expected_unindexed_fk (constraint_name text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO expected_unindexed_fk VALUES
  ('fk_account_devices__revoked_by'),
  ('fk_account_merge_events__actor'),
  ('fk_account_sessions__revoked_by'),
  ('fk_accounts__closed_by'),
  ('fk_accounts__updated_by'),
  ('fk_audit_log_payloads__redacted_by'),
  ('fk_auth_reconciliation_issues__resolved_by'),
  ('fk_district_role_assignments__assigned_by'),
  ('fk_district_role_assignments__revoked_by'),
  ('fk_identities__bound_by'),
  ('fk_identities__unbound_by'),
  ('fk_invitation_events__actor'),
  ('fk_invitations__accepted_by'),
  ('fk_invitations__created_by'),
  ('fk_invitations__revoked_by'),
  ('fk_line_channel_configs__created_by'),
  ('fk_line_channel_configs__updated_by'),
  ('fk_line_oa_member_links__linked_by'),
  ('fk_line_oa_member_links__unlinked_by'),
  ('fk_onboarding_events__actor'),
  ('fk_membership_role_assignments__assigned_by'),
  ('fk_membership_role_assignments__revoked_by'),
  ('fk_msh__changed_by'),
  ('fk_msh__voided_by'),
  ('fk_memberships__created_by'),
  ('fk_memberships__updated_by'),
  ('fk_person_contacts__created_by'),
  ('fk_person_contacts__updated_by'),
  ('fk_person_match_cases__reviewer'),
  ('fk_platform_role_assignments__assigned_by'),
  ('fk_platform_role_assignments__revoked_by'),
  ('fk_role_permissions__granted_by');

CREATE TEMP VIEW actual_unindexed_fk AS
SELECT con.conname
FROM pg_constraint con
WHERE con.contype = 'f' AND con.connamespace = 'public'::regnamespace
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = con.conrelid AND i.indisvalid
      AND (i.indkey::smallint[])[0:cardinality(con.conkey)-1] = con.conkey
  );

SELECT is((SELECT count(*) FROM actual_unindexed_fk), 32::bigint, 'exactly 32 low-value actor/history FKs intentionally omit an index');
SELECT is((SELECT count(*) FROM actual_unindexed_fk a LEFT JOIN expected_unindexed_fk e ON e.constraint_name = a.conname WHERE e.constraint_name IS NULL), 0::bigint, 'no undocumented FK index gap exists');
SELECT has_index('public', 'person_match_cases', 'ix_pmc__candidate', 'candidate Person FK is indexed');
SELECT has_index('public', 'login_events', 'ix_le__account_device_time', 'login Account Device FK is indexed');
SELECT has_index('public', 'membership_status_histories', 'ix_msh__supersedes', 'supersedes FK is indexed');
SELECT has_index('public', 'platform_role_assignments', 'ix_pra__role', 'platform Role FK is indexed');
SELECT has_index('public', 'district_role_assignments', 'ix_dra__role', 'district Role FK is indexed');
SELECT has_index('public', 'membership_role_assignments', 'ix_mra__role', 'membership Role FK is indexed');
SELECT has_index('public', 'audit_logs', 'ix_audit__district_time', 'audit District FK is indexed for scoped time queries');
SELECT has_index('public', 'idempotency_records', 'ix_idem__actor_expiry', 'idempotency actor FK is indexed for cleanup queries');

SELECT * FROM finish();
ROLLBACK;
