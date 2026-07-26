# Foreign-key index matrix

完整且可執行的 FK Index Matrix 位於 `verification/fk_index_verification.sql`。它直接由 PostgreSQL catalog 產出每一筆 FK 的：

- FK table 與 column；
- target table；
- 可用的 left-prefix index；
- `existing_index`、`add_index` 或 `no_index` 決策；
- 決策原因與 constraint name。

目前矩陣共 85 個 FK：45 個沿用既有 left-prefix index、8 個新增 index、32 個有明確原因而不建立 index。Verification 會在出現未記錄缺口、或 no-index manifest 已過期時直接失敗。

## 新增的八個索引

| Index | FK 使用情境 | 原因 |
|---|---|---|
| `ix_pmc__candidate` | person match candidate → people | 人工比對佇列會依 candidate 回查。 |
| `ix_le__account_device_time` | login event → account device | 裝置安全與登入時間軸是高頻查詢。 |
| `ix_msh__supersedes` | status history correction chain | 修正／supersede chain 需要 parent check 與追溯。 |
| `ix_pra__role` | platform assignment → role | RBAC role 展開與 parent check。 |
| `ix_dra__role` | district assignment → role | RBAC role 展開與 parent check。 |
| `ix_mra__role` | membership assignment → role | RBAC role 展開與 parent check。 |
| `ix_audit__district_time` | audit log → district | 地區 scope 的時間序 audit 查詢。 |
| `ix_idem__actor_expiry` | idempotency → actor | actor 範圍查核與 expiration cleanup。 |

## 32 個 no-index 決策

這些欄位都是低選擇性的 created/updated/assigned/revoked actor attribution，或只在罕見 correction/reconciliation 流程使用。主要查詢已由 business parent、scope、status 與 time index 支援；Accounts 與歷史事件採保留策略，不依賴高頻 parent delete。因此不盲目增加 32 個單欄索引：

| Table | 未另建 index 的 FK columns |
|---|---|
| account_devices | account_device_revoked_by_account_id |
| account_merge_events | account_merge_event_merged_by_account_id |
| account_sessions | account_session_revoked_by_account_id |
| accounts | account_closed_by_account_id; account_updated_by_account_id |
| audit_log_payloads | audit_log_payload_redacted_by_account_id |
| auth_reconciliation_issues | auth_reconciliation_issue_resolved_by_account_id |
| district_role_assignments | district_role_assignment_assigned_by_account_id; district_role_assignment_revoked_by_account_id |
| identities | identity_bound_by_account_id; identity_unbound_by_account_id |
| invitation_events | invitation_event_actor_account_id |
| invitations | invitation_accepted_by_account_id; invitation_created_by_account_id; invitation_revoked_by_account_id |
| line_channel_configs | line_channel_created_by_account_id; line_channel_updated_by_account_id |
| line_oa_member_links | line_oa_member_link_linked_by_account_id; line_oa_member_link_unlinked_by_account_id |
| membership_onboarding_events | membership_onboarding_event_actor_account_id |
| membership_role_assignments | membership_role_assignment_assigned_by_account_id; membership_role_assignment_revoked_by_account_id |
| membership_status_histories | membership_status_history_changed_by_account_id; membership_status_history_voided_by_account_id |
| memberships | membership_created_by_account_id; membership_updated_by_account_id |
| person_contacts | person_contact_created_by_account_id; person_contact_updated_by_account_id |
| person_match_cases | person_match_case_reviewed_by_account_id |
| platform_role_assignments | platform_role_assignment_assigned_by_account_id; platform_role_assignment_revoked_by_account_id |
| role_permissions | role_permission_granted_by_account_id |

若未來 query plan、RLS helper 或 hard-delete policy 改變，應以實際 workload 更新 matrix 與 manifest，而不是在未量測前預先建立所有索引。
