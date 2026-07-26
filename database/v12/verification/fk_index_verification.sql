\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE v12_fk_no_index_manifest (
  constraint_name text PRIMARY KEY,
  reason text NOT NULL
) ON COMMIT DROP;

INSERT INTO v12_fk_no_index_manifest VALUES
  ('fk_account_devices__revoked_by', 'Sparse revocation actor; account_devices is queried by account/device indexes.'),
  ('fk_account_merge_events__actor', 'Append-only actor attribution; source and target drive reads.'),
  ('fk_account_sessions__revoked_by', 'Sparse revocation actor; account and status indexes drive reads.'),
  ('fk_accounts__closed_by', 'Terminal audit attribution; Accounts are retained, not parent-delete targets.'),
  ('fk_accounts__updated_by', 'Audit attribution; Person/Auth lookups drive reads.'),
  ('fk_audit_log_payloads__redacted_by', 'Sparse redaction actor on one-to-one audit payloads.'),
  ('fk_auth_reconciliation_issues__resolved_by', 'Sparse resolution actor; account/status indexes drive the workflow.'),
  ('fk_district_role_assignments__assigned_by', 'Immutable actor attribution; account/district/role drive reads.'),
  ('fk_district_role_assignments__revoked_by', 'Sparse revocation actor; account/district/role drive reads.'),
  ('fk_identities__bound_by', 'Historical actor attribution; account/provider identity drive reads.'),
  ('fk_identities__unbound_by', 'Sparse unbind actor; account/provider identity drive reads.'),
  ('fk_invitation_events__actor', 'Append-only actor attribution; invitation/time drives reads.'),
  ('fk_invitations__accepted_by', 'Sparse terminal actor; membership/status drives reads.'),
  ('fk_invitations__created_by', 'Audit attribution; membership/status drives reads.'),
  ('fk_invitations__revoked_by', 'Sparse terminal actor; membership/status drives reads.'),
  ('fk_line_channel_configs__created_by', 'Very small configuration table with audit-only actor.'),
  ('fk_line_channel_configs__updated_by', 'Very small configuration table with audit-only actor.'),
  ('fk_line_oa_member_links__linked_by', 'Audit-only actor; contact/person/membership drive reads.'),
  ('fk_line_oa_member_links__unlinked_by', 'Sparse audit-only actor; contact/person/membership drive reads.'),
  ('fk_onboarding_events__actor', 'Append-only actor attribution; membership/time drives reads.'),
  ('fk_membership_role_assignments__assigned_by', 'Immutable actor attribution; membership/role/term drive reads.'),
  ('fk_membership_role_assignments__revoked_by', 'Sparse revocation actor; membership/role/term drive reads.'),
  ('fk_msh__changed_by', 'Append-only actor attribution; membership/effective time drives reads.'),
  ('fk_msh__voided_by', 'Sparse correction actor; membership/effective time drives reads.'),
  ('fk_memberships__created_by', 'Audit attribution; Person and Club drive authorization queries.'),
  ('fk_memberships__updated_by', 'Audit attribution; Person and Club drive authorization queries.'),
  ('fk_person_contacts__created_by', 'Audit attribution; Person and normalized contact drive reads.'),
  ('fk_person_contacts__updated_by', 'Audit attribution; Person and normalized contact drive reads.'),
  ('fk_person_match_cases__reviewer', 'Sparse reviewer attribution; requester/club/candidate drive the queue.'),
  ('fk_platform_role_assignments__assigned_by', 'Immutable actor attribution; account and role drive reads.'),
  ('fk_platform_role_assignments__revoked_by', 'Sparse revocation actor; account and role drive reads.'),
  ('fk_role_permissions__granted_by', 'Small seeded matrix with audit-only actor attribution.');

CREATE TEMP VIEW v12_fk_matrix AS
WITH fk AS (
  SELECT
    con.conname,
    con.conrelid,
    con.confrelid,
    con.conkey,
    child.relname AS fk_table,
    parent.relname AS target_table,
    string_agg(a.attname, ', ' ORDER BY u.ordinality) AS fk_columns
  FROM pg_constraint con
  JOIN pg_class child ON child.oid = con.conrelid
  JOIN pg_class parent ON parent.oid = con.confrelid
  CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY u(attnum, ordinality)
  JOIN pg_attribute a ON a.attrelid = child.oid AND a.attnum = u.attnum
  WHERE con.contype = 'f' AND con.connamespace = 'public'::regnamespace
  GROUP BY con.conname, con.conrelid, con.confrelid, con.conkey, child.relname, parent.relname
), indexed AS (
  SELECT fk.*,
    (
      SELECT ic.relname
      FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
      WHERE i.indrelid = fk.conrelid AND i.indisvalid
        AND (i.indkey::smallint[])[0:cardinality(fk.conkey)-1] = fk.conkey
      ORDER BY i.indisunique DESC, ic.relname
      LIMIT 1
    ) AS index_name
  FROM fk
)
SELECT
  i.fk_table,
  i.fk_columns,
  i.target_table,
  CASE WHEN i.index_name IN (
    'ix_pmc__candidate', 'ix_le__account_device_time', 'ix_msh__supersedes',
    'ix_pra__role', 'ix_dra__role', 'ix_mra__role',
    'ix_audit__district_time', 'ix_idem__actor_expiry'
  ) THEN NULL ELSE i.index_name END AS existing_left_prefix_index,
  CASE WHEN i.index_name IN (
    'ix_pmc__candidate', 'ix_le__account_device_time', 'ix_msh__supersedes',
    'ix_pra__role', 'ix_dra__role', 'ix_mra__role',
    'ix_audit__district_time', 'ix_idem__actor_expiry'
  ) THEN i.index_name ELSE NULL END AS proposed_index,
  CASE
    WHEN i.index_name IS NULL THEN 'no_index'
    WHEN i.index_name IN (
      'ix_pmc__candidate', 'ix_le__account_device_time', 'ix_msh__supersedes',
      'ix_pra__role', 'ix_dra__role', 'ix_mra__role',
      'ix_audit__district_time', 'ix_idem__actor_expiry'
    ) THEN 'add_index'
    ELSE 'existing_index'
  END AS decision,
  COALESCE(
    m.reason,
    CASE WHEN i.index_name IS NULL THEN NULL
         ELSE 'Existing or newly added left-prefix index supports join, authorization, lifecycle, or parent checks.' END
  ) AS reason,
  i.conname AS constraint_name
FROM indexed i
LEFT JOIN v12_fk_no_index_manifest m ON m.constraint_name = i.conname;

DO $$
DECLARE
  gap_count bigint;
BEGIN
  SELECT count(*) INTO gap_count
  FROM v12_fk_matrix
  WHERE decision = 'no_index' AND reason IS NULL;
  IF gap_count <> 0 THEN
    RAISE EXCEPTION '% undocumented FK index gaps exist', gap_count;
  END IF;

  SELECT count(*) INTO gap_count
  FROM v12_fk_no_index_manifest m
  LEFT JOIN v12_fk_matrix x ON x.constraint_name = m.constraint_name AND x.decision = 'no_index'
  WHERE x.constraint_name IS NULL;
  IF gap_count <> 0 THEN
    RAISE EXCEPTION '% FK no-index manifest entries are stale', gap_count;
  END IF;
END;
$$;

SELECT fk_table, constraint_name, fk_columns, target_table,
       COALESCE(existing_left_prefix_index, '—') AS existing_left_prefix_index,
       COALESCE(proposed_index, '—') AS proposed_index,
       decision, reason
FROM v12_fk_matrix
ORDER BY fk_table, constraint_name;

SELECT decision, count(*) AS fk_count
FROM v12_fk_matrix
GROUP BY decision
ORDER BY decision;

COMMIT;
