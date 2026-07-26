# V0.3 RLS Inventory and V1.2 Policy Plan

## 結論

V0.3 的 25 張 public table 全部 `ENABLE ROW LEVEL SECURITY`，但 **0 個 `CREATE POLICY`**。因此對 `anon` / `authenticated` 的直接 `SELECT`、`INSERT`、`UPDATE`、`DELETE` 全部不可用；應用透過被授權的 `SECURITY DEFINER` functions 存取。證據：核心 8 張表在 `supabase/migrations/20260722000100_core_identity_and_club_access.sql:335-351`，其餘 17 張在 `supabase/migrations/20260722000300_v03_identity_admin_schema.sql:305-339`；RPC grants 在 `supabase/migrations/20260722000200_secure_provisioning_workflow.sql:531-552` 及 `supabase/migrations/20260722000400_v03_identity_admin_api.sql:844-895`。

這個模式是「RLS fail-closed + RPC capability」，不是逐列 policy 授權。現況沒有 policy recursion，但也沒有任何 policy 可搬到 V1.2。RLS helper 會用 `auth.uid()` 解析 account；例如 `current_app_account_id` 在 `supabase/migrations/20260722000200_secure_provisioning_workflow.sql:7-17`，club permission helper 在 `supabase/migrations/20260722000400_v03_identity_admin_api.sql:3-32`。

## Legacy 逐表矩陣（25/25）

下表的 S/I/U/D 均指 `anon` / `authenticated` 直接表操作。所有列都是「無 policy → deny」；`service_role` 不受 RLS，且 Migration 003 另有明確 grants。

因此每一列的 legacy policy name、command、target role、`USING`、`WITH CHECK` 均為 **N/A（不存在）**；不是省略盤點。表中的 S/I/U/D 明確記錄缺少 policy 時的實際拒絕結果。

| Table | RLS | S | I | U | D | 實際存取邊界／風險 |
|---|---|---|---|---|---|---|
| `people` | on | deny | deny | deny | deny | member/profile/invitation RPC；service route 亦直接寫。含 PII，V1.2 必須 self/club admin 分欄授權。
| `app_accounts` | on | deny | deny | deny | deny | helper 以 `auth.uid()` 解析；bootstrap/LINE callback 直接 service write。不可接受前端 account id 作授權依據。
| `platform_roles` | on | deny | deny | deny | deny | `current_has_platform_role`、provisioning RPC。V1.2 角色撤銷必須即時生效。
| `clubs` | on | deny | deny | deny | deny | manageable/home/provisioning read/write；scope 由 helper/RPC 控制。
| `club_memberships` | on | deny | deny | deny | deny | home/member/invitation/RBAC；跨社 PII 的核心隔離點。
| `club_operator_permissions` | on | deny | deny | deny | deny | legacy manager capability；V1.2 由 scoped role assignment 取代。
| `club_operator_invites` | on | deny | deny | deny | deny | operator provisioning RPC，邀請 token hash 不可暴露。
| `audit_logs` | on | deny | deny | deny | deny | mutation RPC append、`list_club_audit` read；V1.2 skeleton 必須不可 update/delete。
| `permissions` | on | deny | deny | deny | deny | service seed、permission helper。普通 client 不應直接改 RBAC catalog。
| `role_definitions` | on | deny | deny | deny | deny | service seed、assignment helper。系統角色由 migration 管理。
| `role_permissions` | on | deny | deny | deny | deny | permission evaluation；避免 policy 直接 join 自己造成遞迴。
| `club_role_assignments` | on | deny | deny | deny | deny | `assign_club_role` / helper；V1.2 映射 membership assignment。
| `member_invitations` | on | deny | deny | deny | deny | invitation RPC；LINE callback service direct read。token digest、狀態、PII 都不可 general read。
| `invitation_logs` | on | deny | deny | deny | deny | invitation RPC append；應為 immutable event ledger。
| `line_login_configs` | on | deny | deny | deny | deny | service-controlled config；secret 僅存 reference。
| `line_oauth_states` | on | deny | deny | deny | deny | LINE routes service direct CRUD；短期 auth material，不應有 client policy。
| `line_identities` | on | deny | deny | deny | deny | bind/unbind/identity center；provider subject 為敏感識別資料。
| `login_history` | on | deny | deny | deny | deny | authenticated RPC append/self read via aggregate；不可 general member read。
| `user_devices` | on | deny | deny | deny | deny | self device RPC；不可跨 account。
| `notification_settings` | on | deny | deny | deny | deny | self settings RPC；V1.2 foundation 尚無對應表。
| `privacy_settings` | on | deny | deny | deny | deny | self settings RPC；V1.2 foundation 尚無對應表。
| `line_oa_accounts` | on | deny | deny | deny | deny | OA admin RPC/webhook service access；Login/OA scope 必須分離。
| `line_oa_followers` | on | deny | deny | deny | deny | OA pair RPC + service webhook/action direct write；不可影響 Login identity。
| `line_push_logs` | on | deny | deny | deny | deny | `record_line_push` append、OA admin aggregate；無一般 client write。
| `line_webhooks` | on | deny | deny | deny | deny | webhook service insert/update；無 client policy。

## `SECURITY DEFINER` 評估

- 42 支 function 中 38 支為 `SECURITY DEFINER`；4 支 trigger functions 是 invoker。所有 function 都有固定 `search_path`。
- Client execute 只開放列在 migration grants 的 RPC；`current_app_account_id`、`current_has_platform_role`、`current_can_manage_club`、`current_has_club_permission` 等 helper 沒有授予 client。
- 好處：在 0-policy 狀態下仍 fail closed，且可把跨表 transaction 放在 DB。
- 風險：每支 definer function 都是 RLS bypass boundary；任何漏掉 club/account predicate 的查詢都可能跨租戶。`service_role` Next.js routes 也繞過 RLS，尤其 LINE callback 與 OA webhook。
- V1.2 必須保留 fixed `search_path`、最小 execute grant、server-derived actor/scope；不得讓前端傳 account id 決定權限（母版 `docs/roadmap/V12_PRODUCT_ARCHITECTURE_ROADMAP.md:407-416`）。

## V1.2 31-table policy design matrix

這是 PR-04 的初始 deny/allow 設計；實際 policy 名稱與 SQL 必須在 PR-04 review。`TF` 表示 client 不直接 mutation，只能由 transaction function/controlled backend 執行。

| V1.2 table | SELECT | INSERT | UPDATE | DELETE | Scope/helper |
|---|---|---|---|---|---|
| `districts` | platform；district/club scoped summary | TF | TF | deny | platform/district permission |
| `clubs` | platform/district；本社 member | TF | TF | deny | district/club permission |
| `club_terms` | platform/district；本社 member | TF | TF | deny | club scope |
| `people` | self；具 PII 權限的同社 admin | TF | self-safe fields via TF/admin TF | deny | `is_self_person`, `has_club_permission` |
| `accounts` | self；受控 security admin | TF | self-safe fields/TF | deny | current account；system actor 永不 client visible |
| `person_contacts` | self；具 PII 權限的同社 admin | TF | TF | deny | self + active membership scope |
| `person_match_cases` | authorized club/platform reviewer only | TF | TF | deny | 不回傳他社候選 PII |
| `memberships` | self；同社 authorized roles | TF | TF | deny | current memberships/club permission |
| `membership_onboarding_events` | self；同社 admin | TF | deny | deny | immutable event |
| `membership_status_histories` | self；同社 admin | TF | deny | deny | immutable history |
| `account_merge_events` | security/platform only | TF | deny | deny | merge 不在 MVP，預設無 client insert |
| `devices` | 經 self account-device 關聯 | TF | TF | deny | self only |
| `account_devices` | self | TF | TF revoke/trust | deny | current account |
| `account_sessions` | self | TF | TF revoke | deny | current account；external session weak ref |
| `line_channel_configs` | platform/channel admin，遮蔽 secret ref | TF | TF | deny | environment + channel permission |
| `identities` | self；identity admin minimal | TF | TF bind/unbind | deny | self / scoped permission |
| `login_events` | self；security admin | TF | deny | deny | append-only |
| `invitations` | inviter/admin；token preview 只能 controlled endpoint | TF | TF | deny | club permission；不以 plaintext token 查表 |
| `invitation_events` | inviter/admin；接受者受控摘要 | TF | deny | deny | immutable event |
| `roles` | authenticated catalog read | seed/TF | seed/TF | deny | system catalog |
| `permissions` | authenticated catalog read | seed/TF | seed/TF | deny | system catalog |
| `role_permissions` | authorized catalog read | seed/TF | seed/TF | deny | helper 必須防 policy recursion |
| `platform_role_assignments` | self summary；platform admin | TF | TF revoke | deny | platform permission |
| `district_role_assignments` | self summary；district/platform admin | TF | TF revoke | deny | district permission |
| `membership_role_assignments` | self summary；same-club authorized | TF | TF revoke | deny | club permission + membership |
| `line_oa_contacts` | OA admin；self limited status | TF | TF | deny | channel/environment + club |
| `line_oa_member_links` | OA admin；self limited status | TF | TF unlink | deny | OA/Login strictly separate |
| `audit_logs` | scoped audit permission | TF | deny | deny | immutable skeleton |
| `audit_log_payloads` | narrower scoped audit permission | TF | only `redact_audit_payload` | deny | payload redaction path |
| `idempotency_records` | controlled backend only | TF | TF | scheduled retention only | no client policy; hash cannot contain token |
| `auth_reconciliation_issues` | platform/security admin only | TF | TF resolve | deny | system accounts excluded |

## PR-04 必測情境

1. anonymous、無 account、locked/suspended account 預設拒絕。
2. Secretary 可操作自己 Club，不能讀/寫其他 Club；District Admin 不可跨 District。
3. General Member 只能讀 self/允許的 club summary，不能讀完整 email/phone、Identity、Device、Session、Audit。
4. role revoke 後同一 session 的下一次 query 立即失效，不依賴 JWT 中過期 role claim。
5. helper 與 policy 無 recursion；用 `EXPLAIN`/timeout 及交叉角色 pgTAP 驗證。
6. definer function execute grants 採 allowlist；anon 只可進受控 invitation entry endpoint，不直接讀表。
7. service role 只出現在 Edge/controlled backend；前端 bundle、log、response 均不得包含 key。
8. 每張表逐一驗證 S/I/U/D，不以「有 RLS」取代 policy 行為測試（Gate 4：`docs/roadmap/V12_PRODUCT_ARCHITECTURE_ROADMAP.md:418-427`）。
