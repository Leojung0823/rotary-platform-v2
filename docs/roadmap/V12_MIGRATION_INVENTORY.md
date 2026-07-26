# V1.2 Legacy Migration Inventory

盤點基準：`feat/v12-database-foundation`、HEAD `32716b3`。本文件只描述既有 V0.3 migration；四個檔案不得修改。V1.2 必須使用獨立 migration history（母版要求見 `docs/roadmap/V12_PRODUCT_ARCHITECTURE_ROADMAP.md:242-263`）。

## 數量核對

| 項目 | 實際數量 | 來源 |
|---|---:|---|
| Legacy migrations | 4 | `supabase/migrations/` |
| Public tables | 25 | Migration 001 建 8 張；Migration 003 建 17 張 |
| Public functions | 42 | 4 個 trigger functions、3 個權限 helper、35 個 API/helper；Migration 004 取代同名 `list_manageable_clubs`，不是新增第 43 支 |
| RLS-enabled tables | 25 | `supabase/migrations/20260722000100_core_identity_and_club_access.sql:335-342`、`supabase/migrations/20260722000300_v03_identity_admin_schema.sql:305-321` |
| RLS policies | 0 | 四份 migration 沒有 `CREATE POLICY`；本機 catalog 亦為 0 |

## 逐檔盤點

### 20260722000100_core_identity_and_club_access.sql

- 目的：建立核心 Person、App Account、平台角色、Club、Membership、Club Operator、邀請與 Audit 骨架。
- Tables：`people`、`app_accounts`、`platform_roles`、`clubs`、`club_memberships`、`club_operator_permissions`、`club_operator_invites`、`audit_logs`（`supabase/migrations/20260722000100_core_identity_and_club_access.sql:6-195`）。
- Functions：`set_updated_at`、`prevent_app_account_identity_relink`、`prevent_member_operator_overlap`、`prevent_operator_member_overlap`（同檔 `:197-330`）。
- Constraints：Person/App Account 1:1、`auth_user_id` unique、平台角色與 operator/membership 狀態 check、有效 membership/active operator partial unique、operator 與 member 互斥 trigger。
- Indexes：identity、club/status、active assignment、pending invitation 主要查詢索引在同檔 table 定義旁。
- Seed：無。
- RLS／grants：8 張表啟用 RLS，撤銷 `anon`、`authenticated` 全部表權限；四個 trigger function 也撤銷 execute（同檔 `:335-356`）。沒有 policy。
- 回滾風險：若此檔被改寫，既有 migration checksum/history、V0.3 operator-vs-member 互斥規則與所有後續 FK 都會漂移；只可在獨立 V1.2 root 重建新模型。

### 20260722000200_secure_provisioning_workflow.sql

- 目的：以 `SECURITY DEFINER` RPC 封裝平台 bootstrap、Club 建立、operator 邀請／接受／撤銷及 provisioning 狀態。
- Tables／indexes／seed／RLS policy：不新增。
- Functions：12 個定義（同檔 `:7-526`），其中 `list_manageable_clubs` 後來由 Migration 004 取代。
- Security：每支 function 固定 `search_path`；helper 不授予 client，9 支 workflow RPC 授予 `authenticated`（同檔 `:531-552`）。
- Concurrency：`mark_operator_invitation_sent`、`accept_operator_invitation`、`revoke_operator` 使用 `FOR UPDATE`；邀請建立以 partial unique/idempotency key 防重。
- Audit：Club 建立、operator 邀請／接受／撤銷均寫入 `audit_logs`。
- 回滾風險：RPC 與 Migration 001 表結構高度耦合；V1.2 不能直接重放或 rename，必須逐支重寫／合併並保留錯誤與冪等契約。

### 20260722000300_v03_identity_admin_schema.sql

- 目的：擴充 identity/admin、RBAC、社員邀請、LINE Login、LINE OA、登入／裝置／偏好資料。
- Alters：為 `people` 加生日、頭像、profile completion，擴充 membership status（同檔 `:3-12`）。
- Tables：17 張，從 `permissions` 到 `line_webhooks`（同檔 `:14-251`）。
- Seed：12 個 permission、5 個 role、35 組 role-permission（同檔 `:254-288`）。
- Triggers：7 個既有 `set_updated_at` trigger（同檔 `:290-303`）。
- RLS／grants：17 張表啟用 RLS並撤銷 `anon`、`authenticated` 全部表權限；`service_role` 取得受限 CRUD/sequence 權限（同檔 `:305-339`）。沒有 policy。
- 回滾風險：此 migration 同時包含 schema 與 seed；V1.2 將 identity、OA、session、invitation、role 拆為不同 PR，不能整包複製。

### 20260722000400_v03_identity_admin_api.sql

- 目的：補齊 V0.3 identity/admin 應用 RPC 與 client execute grants。
- Tables／indexes／seed／RLS policy：不新增。
- Functions：26 個 `CREATE OR REPLACE`，但 `list_manageable_clubs` 取代 Migration 002 版本；實際 catalog 淨新增 25 支（同檔 `:3-840`）。
- Security：所有定義均為 `SECURITY DEFINER` 且固定 `search_path`；`get_member_invitation_preview` 唯一授予 `anon` + `authenticated`，其餘外部 RPC 授予 `authenticated`（同檔 `:844-895`）。
- Concurrency：邀請 create/resend/cancel/bind/complete、identity unbind 等採 `FOR UPDATE`；但鎖定順序未形成 V1.2 Gate 2 要求的統一 Invitation → Membership → Account 規格。
- Token：V0.3 以 PostgreSQL `digest(token, 'sha256')` 驗證，與 V1.2「HMAC-SHA-256 只在受控後端、secret 不進 DB」不同（同檔 `:251-351`；新邊界見 `docs/roadmap/V12_PRODUCT_ARCHITECTURE_ROADMAP.md:330-349`）。
- 回滾風險：前端 34 個 literal RPC 呼叫依賴此契約；V1.2 需先提供 typed client/compatibility adapter，才可移除或改名。

## Migration 執行順序與相依

```text
001 core schema
  └─ 002 provisioning RPC
  └─ 003 identity/admin schema + RBAC seed
       └─ 004 identity/admin RPC (also replaces one 002 function)
```

任何只重放 003/004 的做法都會因 001 的表、trigger function 及 002 的 helper 缺失而失敗。V1.2 應由 `database/v12/migrations/0001_v12_foundation.sql` 自空資料庫建立，不加入 `supabase/migrations/`。

## V1.2 migration 原則

1. 保持四個 legacy 檔案 byte-for-byte 不變。
2. 每個後續 PR 在 `database/v12/migrations/` 增加單向、可重跑測試的 migration；不得把 V1.2 檔案改放 legacy root。
3. Shadow transform 只讀 legacy、寫 V1.2，禁止直接 rename 舊表或靜默 merge Person（母版 `docs/roadmap/V12_PRODUCT_ARCHITECTURE_ROADMAP.md:503-545`）。
4. 每個 migration 必須有 schema/transaction/RLS 或 reconciliation tests，並由單一 `npm run db:v12:verify` 路徑執行。
5. Production/staging 執行不屬於本輪；必須等 PR-12、人工核准、backup、freeze window 與 rollback runbook。
