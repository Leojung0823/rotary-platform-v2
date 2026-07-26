# V0.3 → V1.2 Legacy Table Mapping

盤點範圍為四份 `supabase/migrations/`。Legacy 共 25 張表；V1.2 foundation 共 31 張表（建立位置見 `database/v12/migrations/0001_v12_foundation.sql:40-2071`）。這是資料轉換規格，不授權接觸 staging/production。

## Mapping matrix（25/25）

| # | V0.3 table（定義） | 主要關聯／約束／使用 RPC | V1.2 目標 | 轉換與資料處理 |
|---:|---|---|---|---|
| 1 | `people` (`20260722000100...sql:6`) | 1:1 `app_accounts`；被 provisioning、member invitation、profile、OA pair、audit read 使用 | `people` + `person_contacts` (`0001...sql:169`, `:365`) | 姓名、生日、avatar 留在 Person；email/phone 正規化後拆 contact。重複不得自動 merge，建立 `person_match_cases`。
| 2 | `app_accounts` (`...00100...sql:18`) | unique `person_id`/`auth_user_id`；大多數 RPC 以 `auth.uid()` 解析 | `accounts` (`0001...sql:224`) | `auth_user_id` 改為外部 weak reference；依狀態轉 human/system。缺 Person 或 Auth 的 active human 列進 reconciliation，不硬補。
| 3 | `platform_roles` (`...00100...sql:38`) | `current_has_platform_role`、club provisioning；unique active role | `roles` + `platform_role_assignments` (`0001...sql:1426`, `:1521`) | role key 先經人工 mapping；assignment actor、時間、撤銷狀態保留。`superadmin` 是否映射 system role 需核准。
| 4 | `clubs` (`...00100...sql:58`) | 所有 club-scoped FK/RPC；code unique | `clubs` + `districts` (`0001...sql:40`, `:74`) | V0.3 無 district；每個 Club 必須指定既有/暫存 district，不能自行推斷。
| 5 | `club_memberships` (`...00100...sql:80`) | active membership partial unique；member/home/profile/invitation/dashboard/RBAC | `memberships` + `membership_status_histories` + `membership_onboarding_events` (`0001...sql:550`, `:625`, `:675`) | status 拆「社員資格」與「onboarding」；現況快照與合成初始 history/event 同 transaction 寫入。
| 6 | `club_operator_permissions` (`...00100...sql:105`) | `current_can_manage_club`、list/revoke operator；operator/member 互斥 | `membership_role_assignments`（必要時 `platform_role_assignments`）(`0001...sql:1646`) | operator 改為 RBAC assignment；V1.2 不應延續「operator 不能是 member」。角色映射需人工決策。
| 7 | `club_operator_invites` (`...00100...sql:138`) | provisioning invite create/send/accept/revoke；pending partial unique | `invitations` + `invitation_events` (`0001...sql:1277`, `:1385`) | 轉為 role/membership invitation 類型的產品決策；只搬 digest/metadata，不可製造或輸出 plaintext token。
| 8 | `audit_logs` (`...00100...sql:177`) | 多數 mutation 寫入；`list_club_audit` 讀取 | `audit_logs` + `audit_log_payloads` (`0001...sql:1836`, `:1903`) | immutable skeleton 與可遮蔽 payload 分離；metadata 欄位依 retention policy 分類。未知/敏感 payload 先隔離，不靜默丟棄。
| 9 | `permissions` (`...00300...sql:14`) | `role_permissions`、`current_has_club_permission`、`list_my_permissions` | `permissions` (`0001...sql:1460`) | key 需對 V1.2 Platform/District/Club/Self scope 重編；保留 legacy key 對照。
| 10 | `role_definitions` (`...00300...sql:20`) | 5 個 seeded role；`club_role_assignments` | `roles` (`0001...sql:1426`) | 角色 scope/name 轉換；`platform_admin` 重複於 `platform_roles` 的衝突交人工。
| 11 | `role_permissions` (`...00300...sql:28`) | RBAC join；`current_has_club_permission` | `role_permissions` (`0001...sql:1494`) | 只在 role/permission mapping 都成功後載入；無效 key 進 conflict report。
| 12 | `club_role_assignments` (`...00300...sql:35`) | assign/read permission；active partial unique | `membership_role_assignments` (`0001...sql:1646`) | 由 account 找 person + club membership；沒有對應 membership 不可硬建 assignment，列 reconciliation。
| 13 | `member_invitations` (`...00300...sql:55`) | create/resend/cancel/preview/bind/complete/list/unbind rebind | `invitations` + `invitation_events` (`0001...sql:1277`, `:1385`) | token SHA-256 不等同 V1.2 HMAC digest；legacy 尚未接受的 token 不應直接視為 V1.2 可驗證，需重新發行或受控兼容流程。
| 14 | `invitation_logs` (`...00300...sql:84`) | invitation lifecycle append log | `invitation_events` (`0001...sql:1385`) | event key/status 轉換，metadata 經敏感欄位掃描；維持原時間及 actor 可追溯性。
| 15 | `line_login_configs` (`...00300...sql:96`) | Next.js LINE provider 設定 | `line_channel_configs` (`0001...sql:977`) | 補 environment、channel purpose/scope；只搬 secret reference/env key，不搬 secret。channel 唯一性衝突需人工解決。
| 16 | `line_oauth_states` (`...00300...sql:110`) | LINE start/callback route 直接 CRUD | 無持久 foundation 對應 | 改由受控 Edge/transaction state store；未消耗且未過期 state 不做 shadow migration。保留統計，不搬認證材料。
| 17 | `line_identities` (`...00300...sql:122`) | bind/unbind/login/identity center/dashboard | `identities` (`0001...sql:1041`) | 必須加入 channel config + environment scope 後檢查唯一性；subject 衝突一律建人工案件。
| 18 | `login_history` (`...00300...sql:143`) | `record_login_and_device`、identity dashboard | `login_events` (`0001...sql:1212`) | append-only 搬移；IP/user agent 依 retention policy 處理，補 channel config 僅能用可證明資料。
| 19 | `user_devices` (`...00300...sql:157`) | record/revoke/identity center | `devices` + `account_devices` + `account_sessions` (`0001...sql:793`, `:839`, `:907`) | device 實體、account 關聯、session ledger 拆分；無穩定裝置識別者不得臆造共享關係。session 外部 ID 為 weak ref。
| 20 | `notification_settings` (`...00300...sql:173`) | `get_my_identity_center`、`update_my_settings` | foundation 無直接對應 | 先保留 legacy read-only；需產品決定新增 V1.2 preference table 或延後。不得塞入 unrelated JSON。
| 21 | `privacy_settings` (`...00300...sql:182`) | `get_my_identity_center`、`update_my_settings` | foundation 無直接對應 | 同上；先定義 privacy policy、預設值與歷史同意證據，再設計表。
| 22 | `line_oa_accounts` (`...00300...sql:191`) | configure/admin/pair/push/webhook | `line_channel_configs` (`0001...sql:977`) | OA channel 設定與 Login channel 可共表但 purpose 必須分離；只搬 secret references。每 club/channel/environment 關係需確認。
| 23 | `line_oa_followers` (`...00300...sql:208`) | pair/unpair/admin/dashboard；webhook direct write | `line_oa_contacts` + `line_oa_member_links` (`0001...sql:1717`, `:1766`) | follower/contact 與 member link 拆分；unpaired/blocked 歷史保留，不能影響 Login identity。
| 24 | `line_push_logs` (`...00300...sql:224`) | `record_line_push`、OA admin | foundation 無直接對應 | 若 MVP 要保留推播 ledger，需新增專用 append-only table；不可把 provider payload 放 audit。否則 legacy 唯讀保留，延後遷移。
| 25 | `line_webhooks` (`...00300...sql:239`) | OA webhook route direct insert/update | foundation 無直接對應 | 需決定 webhook receipt/processing ledger；只保留 hash、狀態與非敏感 metadata，原始 payload 不搬。

> 表定義的縮寫 `...00100...sql`、`...00300...sql` 分別指 `supabase/migrations/20260722000100_core_identity_and_club_access.sql` 與 `supabase/migrations/20260722000300_v03_identity_admin_schema.sql`；`0001...sql` 指 `database/v12/migrations/0001_v12_foundation.sql`。

## V1.2 新增但沒有單一 legacy 來源的表

- Organization：`districts`、`club_terms`。
- Identity quality：`person_match_cases`、`account_merge_events`（MVP 不提供 merge 操作；table 只可記錄明確政策允許的歷史）。
- Security ledger：`account_devices`、`account_sessions`、`auth_reconciliation_issues`。
- Role scope：`district_role_assignments`。
- Reliability：`idempotency_records`。
- Audit split：`audit_log_payloads`。

這些表不可由空值或猜測大量補資料；應以 bootstrap/system actor、明確 migration event 或 reconciliation case 建立。

## Shadow migration 順序

1. 建立 V1.2 schema、system actor、roles/permissions。
2. `districts` → `clubs` → `club_terms`。
3. `people` → `person_contacts` → `accounts`，衝突進 `person_match_cases` / `auth_reconciliation_issues`。
4. `memberships` → status histories/onboarding events。
5. identities/channels、devices/sessions、OA contacts/links。
6. invitations/events、role assignments。
7. audit skeleton/payload；最後處理可選的 preference/push/webhook deferred data。
8. 對帳 Person、Membership、Account、Identity、Role、OA、Audit 數量並檢查 orphan FK；完整成功兩次才可進 PR-11（母版 `docs/roadmap/V12_PRODUCT_ARCHITECTURE_ROADMAP.md:539-545`）。

## 必須由人工決定的 mapping

- V0.3 Club 對應哪一個 District。
- `superadmin` / `platform_admin` / operator / president / secretary / finance 的 V1.2 role key 與 scope。
- Pending legacy token 是全部撤銷重發，或建立一次性受控 compatibility acceptance。
- Email/phone 重複、Auth User 重複、LINE subject 跨 channel 衝突的裁決流程。
- notification/privacy/push/webhook 歷史是否進 MVP 新 schema。
- Audit payload retention、redaction 與法規保存期限。
