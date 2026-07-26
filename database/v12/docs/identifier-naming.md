# Identifier naming and shortening

V1.2 對 public schema 的 relation、column、function、constraint 與 trigger 名稱設定 55 UTF-8 bytes 上限，保留 PostgreSQL 63-byte 上限的維運空間。Constraint 使用 `pk_`、`fk_`、`uq_`、`ck_`、`ex_`；index 使用 `ix_`／`uq_`；sequence 使用 `seq_`；trigger 使用 `trg_`。

以下縮寫用於最容易因完整 table／column 名稱超限的識別碼：

| 縮寫 | 對應 |
|---|---|
| `dis` | districts |
| `ct` | club_terms |
| `pc` | person_contacts |
| `pmc` | person_match_cases |
| `moe` | membership_onboarding_events |
| `msh` | membership_status_histories |
| `ame` | account_merge_events |
| `ad` | account_devices |
| `lcc` | line_channel_configs |
| `le` | login_events |
| `ie` | invitation_events |
| `rp` | role_permissions |
| `pra` | platform_role_assignments |
| `dra` | district_role_assignments |
| `mra` | membership_role_assignments |
| `loc` | line_oa_contacts |
| `loml` | line_oa_member_links |
| `alp` | audit_log_payloads |
| `idem` | idempotency_records |
| `ari` | auth_reconciliation_issues |

Identity sequences 明確命名為 `seq_moe__sequence` 與 `seq_msh__sequence`，避免 PostgreSQL 自動產生冗長名稱。所有 31 個 PK 也使用顯式名稱；較短且可讀的表保留語意清楚的 `pk_person`、`pk_account`、`pk_membership` 等形式。

`verification/identifier_length.sql` 會查詢實際 catalog 並在任一 public identifier 超過 55 bytes 或 constraint prefix 不合法時失敗；pgTAP 的 `002_identifier_length.test.sql` 會做同一安全檢查。
