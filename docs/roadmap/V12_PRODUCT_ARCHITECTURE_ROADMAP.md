# Rotary Platform V1.2 產品與架構開發藍圖

- 文件名稱：`V12_PRODUCT_ARCHITECTURE_ROADMAP.md`
- 文件版本：V1.1
- 文件狀態：現行母版藍圖
- 適用範圍：Rotary Platform V1.2 Identity & Admin
- 目的：定義「要完成什麼、為什麼、先後順序、驗收條件與上線策略」
- 工程執行版：由 Codex 依實際 Repository 另行建立

---

## 文件治理與適用規範

本母版定義產品範圍、技術 Phase、Gate 與上線策略。所有 Codex、AI Agent 與人類工程師另須共同遵守：

- [`V12_ARCHITECTURE_DECISIONS.md`](../architecture/V12_ARCHITECTURE_DECISIONS.md)：已接受且不得由單一 PR 自行推翻的架構決策。
- [`V12_PROJECT_STRUCTURE.md`](../development/V12_PROJECT_STRUCTURE.md)：V1.2 與 Legacy 的檔案位置、canonical source 與依賴方向。
- [`DATABASE_STYLE_GUIDE.md`](../development/DATABASE_STYLE_GUIDE.md)：V1.2 migration、SQL、RLS、function、seed 與 database tests 規範。
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md)：Stage → Milestone → PR、協作、驗證、review 與權限邊界。
- [`V12_REPOSITORY_IMPLEMENTATION_PLAN.md`](V12_REPOSITORY_IMPLEMENTATION_PLAN.md)：既定 12 個 PR 的 repository-level scope、依賴與驗證。

若文件之間出現產品、安全或資料邊界衝突，實作者不得自行選擇；應記錄至 [`V12_DECISIONS_REQUIRED.md`](V12_DECISIONS_REQUIRED.md) 或新的架構決策，取得人工核准前維持 fail closed。

## 1. 現況與決策

### 1.1 現有後端

目前 Repository 中的 V0.3 後端包含：

- 4 份 Supabase migrations
- 25 張 public tables
- 42 個 PostgreSQL functions／RPC
- 25 張表已啟用 RLS
- 已有 Invitation、Membership、RBAC、LINE Login、LINE OA、Audit 等流程

### 1.2 V1.2 目標資料模型

目前 V1.2 `schema.sql` 為新的核心資料模型，包含：

- 31 張資料表
- 391 個欄位
- 240 個約束
- 123 個索引
- 18 個 triggers
- Person Merge 已移除
- RLS、Transaction Functions、Seed、Edge Functions 尚未完成

### 1.3 核心判定

V1.2 不是 V0.3 的增量修改，而是核心資料模型重設計。

因此正式採用：

> 平行建立 V1.2 後端，保留 V0.3 作為可運作基線；待 V1.2 完成驗證、資料遷移與前端切換後，再正式取代。

禁止：

- 直接把 V1.2 `schema.sql` 疊加至現有 migration
- 修改已執行的 Legacy Migration
- 在 Production Dashboard 手動改表
- 邊修改資料庫、邊讓既有前端直接追新版結構
- 未完成 RLS、Functions 與資料遷移驗證前切換正式流量

---

## 2. 產品目標

V1.2 第一階段只處理 Identity & Admin 核心能力。

核心使用者流程：

> 秘書建立社員資料
> → 系統檢查可能重複 Person
> → 建立 Membership 與 Invitation
> → 社員完成 LINE Login 或其他可信身份驗證
> → 接受邀請
> → 建立或連結 Account 與 Identity
> → 完成個人資料確認
> → 進入所屬扶輪社首頁

V1.2 必須達成：

1. Person、Membership、Account、Identity 完整分離。
2. 同一 Person 可加入多個 Club，但同時間最多一個有效人類 Account。
3. LINE Login 與 LINE OA 完全分離。
4. Invitation、Membership Status、Onboarding 具備一致交易流程。
5. Platform、District、Club、Self 權限可由 RLS 實際執行。
6. 重要操作具備 Audit、Idempotency、Lock、Rollback 與 Concurrency Test。
7. V0.3 資料能以可對帳、可重跑、可人工處理衝突的方式遷移至 V1.2。

---

## 3. MVP 範圍

### 3.1 必須完成

#### 身份與帳號

- LINE Login
- Account 建立與既有 Account 連結
- Identity 綁定與解除
- Account 狀態管理
- Account Session Ledger
- 裝置與 Account Device 關聯
- 登出及 Session 撤銷
- Auth User Reconciliation

#### 社員與邀請

- 秘書建立社員
- 建立或沿用 Person
- 跨社 Person 疑似重複檢查
- 建立 Membership
- 建立、發送、重發、撤銷 Invitation
- 接受 Invitation
- Membership Onboarding
- Membership 狀態變更及不可變歷史

#### 角色與權限

- Platform Admin
- Platform Support Operator
- District Admin
- Club President
- Club Secretary
- Club Member
- Platform／District／Club／Self RLS
- Role Assignment 有效期間與撤銷

#### LINE OA

- LINE OA Contact
- OA 與 Person／Membership 配對
- 解除配對
- OA 配對與 LINE Login 解綁互不影響

#### 稽核與安全

- Audit Log 不可變骨架
- Audit Payload 受控遮蔽
- Login Events
- Idempotency Records
- 安全事件與操作追蹤

### 3.2 暫緩

以下功能不列入 V1.2 第一階段上線條件：

- Account Merge 管理介面
- 複雜 Person Match 人工審核後台
- Audit Payload 遮蔽管理介面
- 活動
- 公告
- IOU
- Happy Wall
- 相簿
- AI 功能
- 複雜多地區跨組織管理
- 非必要報表與進階分析

Account Merge 可保留資料模型，但正式 Function 與操作介面延後，除非資料遷移實測證明上線前必須使用。

---

## 4. 架構責任邊界

### 4.1 PostgreSQL Schema

負責：

- Table
- Column
- Primary Key
- Foreign Key
- Check Constraint
- Unique Constraint
- Index
- Exclusion Constraint
- Column Comment
- 基礎 Trigger

不負責：

- 外部 API
- Secret
- HMAC Key
- Supabase Auth User 建立
- LINE API
- Email 發送

### 4.2 PostgreSQL Transaction Functions

負責：

- 跨表原子交易
- Row Lock
- 狀態驗證
- 快照與歷史同步
- Idempotency
- Audit Event
- 穩定錯誤碼
- Transaction Rollback

### 4.3 RLS

只負責：

- 誰可以存取
- 可以存取哪個 District
- 可以存取哪個 Club
- 是否只能存取本人資料
- Suspended／Locked Account 的限制

RLS 不負責一般生命週期畫面篩選。

### 4.4 Edge Functions／受控後端

負責：

- Invitation Token 產生
- HMAC-SHA-256
- Secret Manager
- LINE API
- Email
- Auth Admin API
- 外部請求驗證
- 速率限制
- Webhook
- 呼叫資料庫 Transaction Function

### 4.5 前端

負責：

- UI
- 表單驗證
- 導覽流程
- 顯示允許存取的資料
- 呼叫受控 API／RPC

前端不得：

- 直接寫入跨表交易流程
- 自行決定 Account ID
- 取得 service role
- 取得 HMAC Secret
- 修改 Audit Log
- 直接指派 Platform Admin

---

## 5. 技術工作階段（Phase）

以下 `Phase 0–9` 是技術工作包與 Gate 的既有標籤；開發管理層級另固定為 `Stage → Milestone → PR`，見 5.1。這項治理定義不改變各 Phase 的產品範圍或既定 12 個 PR 內容。

### 5.1 開發管理層級：Stage → Milestone → PR

- **Stage**：最高層交付區段，包含一組產品／架構成果與進入下一 Stage 的條件。
- **Milestone**：Stage 內具 owner、Gate、依賴與完成證據的可驗收結果。
- **PR**：最小可審查實作單位，只服務一個 Milestone 與一個主題。
- PR 完成不代表 Milestone 自動完成；Milestone 完成也不代表 Stage 自動放行。每一層仍需對應 Gate 與人工核准。

| Stage | Milestone | 既有技術 Phase | 既定 PR |
|---|---|---|---|
| Stage 1 — Foundation | A — Database Foundation Ready | Phase 0–1 | PR-01 |
| Stage 2 — Identity & Admin Core | B — Invitation & Onboarding Ready | Phase 2–3 | PR-02–03 |
| Stage 2 — Identity & Admin Core | C — Security & Access Ready | Phase 4–6 | PR-04–08 |
| Stage 3 — Migration Readiness | D — Legacy Shadow Migration Ready | Phase 7 | PR-09–10 |
| Stage 4 — Cutover Readiness | E — Frontend Cutover Ready | Phase 8 | PR-11 |
| Stage 5 — Release Readiness | F — Release Candidate Ready | Phase 9 | PR-12 |

Milestone D–F 是為既有 Phase 7–9 與 PR-09–12 補上的治理名稱，不新增產品功能，也不改變 Gate 7–9。

# Phase 0：Legacy Baseline 與隔離環境

### 目標

保留 V0.3 可運作基準，建立完全隔離的 V1.2 建置路徑。

### 交付物

- Git baseline tag
- Legacy 後端盤點
- V1.2 獨立本機建置目錄
- V1.2 單一重建命令
- V1.2 單一測試命令
- 禁止遠端 destructive command 的開發規範

### 驗收

- 現有 4 份 migration 無任何變更
- V1.2 可從空資料庫獨立建立
- V0.3 與 V1.2 不共用 migration history
- Git 工作區乾淨
- 未操作線上 Supabase

---

# Phase 1：Database Foundation

### 目標

將 V1.2 Schema 強化為可重建、可測試、可審查的資料庫骨架。

### 必做

- Bootstrap System Actor
- `account_kind = human | system`
- Anonymized 一致性規則
- Person Merge 完全移除驗證
- Devices／Account Devices 正式拆分
- 縮短識別碼
- FK Index Matrix
- Updated At Trigger 改寫
- 最小 Seed
- Schema／Constraint Tests

### 交付物

- `v12_schema.sql`
- `v12_indexes.sql`
- `v12_bootstrap.sql`
- `v12_seed.sql`
- `fk_index_matrix.md` 或 YAML
- Verification SQL
- pgTAP／SQL tests

### Gate 1 驗收

- 空資料庫完整 COMMIT
- Lint 無錯誤
- 所有自訂名稱不超過 55 bytes
- Person Merge 不存在
- System Actor 無 Person、Auth User、Identity、Session
- Active Human Account 必須具有 Person 與 Auth User
- Anonymized Account 不具 Auth User
- Seed 可重跑
- FK Index Matrix 與實際索引一致
- 所有測試通過

---

# Phase 2：Invitation Core

### 目標

完成邀請的建立、重發、非消耗式驗證、撤銷及冪等安全流程；final acceptance 保留給 Phase 3 原子 onboarding transaction。

### Transaction Functions

- `create_membership_invitation(...)`
- `resend_membership_invitation(...)`
- `validate_membership_invitation(...)`
- `revoke_membership_invitation(...)`

### Edge Functions

- `create-membership-invitation`
- `resend-membership-invitation`
- `validate-membership-invitation`

### 必須遵守

- Token：32 bytes CSPRNG
- 對外：版本前綴＋Base64url
- 儲存：HMAC-SHA-256 Digest
- HMAC 僅在 Edge Function／受控後端
- Secret 不進入 PostgreSQL
- 明文 Token 不進入 Log、Audit 或 Idempotency Hash
- 同一 Membership 同時間最多一筆 Pending Invitation
- Create／Resend／Revoke mutation 使用固定鎖定順序：Invitation → Membership → Account
- 相同請求可安全重試
- Validate retry 必須重新讀取 live state 與 Database Time；revoke、resend、expiry 或 terminal state 變更後不得回 stale positive eligibility
- Validate 要求經 JWT 驗證的 Auth User，但不建立 binding、不消耗 token、不保留 reservation
- Private validation primitive 不修改 Invitation；Phase 3 caller 必須在同一交易重新 lock 與驗證
- Public eligibility failures 使用完全一致的 404 `INVITATION_INVALID_OR_UNAVAILABLE` response，避免 Invitation enumeration oracle
- Distributed Rate Limit 狀態為 Deferred — Release Gate；完成前禁止 Public Staging／Production exposure，Local／CI 不算 Public Exposure，且不得以單一 worker memory counter 冒充完成

### Gate 2 驗收

- 同一 Idempotency Key 的 concurrent Create 只建立一筆 Invitation
- 相同 Idempotency Key 與相同 Payload 回傳原結果
- 相同 Key、不同 Payload 回傳衝突
- 同 key Validate 在 Invitation 未變時回等價結果；revoke／resend／expiry 後 fail closed
- Resend 後舊 Token hash 不可 Validate；過期、撤銷及 accepted fixture 均不可 Validate
- Validate 成功後 Invitation 仍為 pending、`consumed_at` 仍為 null，重複 Validate 不回 final replay
- HMAC Secret 不出現在資料庫、Log 或回傳值
- 所有失敗可完整 Rollback
- Automated Delivery 保持 Deferred；MVP 只使用 Manual Out-of-Band Delivery

---

# Phase 3：Membership、Onboarding 與 Person Match

### 目標

完成社員生命週期及建立 Person 前的疑似重複防護。

### Transaction Functions

- `check_person_match(...)`
- `create_person_and_membership(...)`
- `change_membership_status(...)`
- `complete_membership_onboarding(...)`
- `waive_membership_onboarding(...)`
- `cancel_membership_onboarding(...)`

### 核心規則

- Person Match 明文即時比對，不落地
- Request Digest 只供請求去重
- 不支援 Person Merge
- 疑似重複只能沿用既有 Person、建立新 Person、拒絕或轉人工審核
- Membership Status 是真實社員資格
- Onboarding Status 是平台加入進度
- Membership 快照與 History 必須同一 Transaction 更新
- Onboarding 詳細歷史由 Event Table 保存
- Final onboarding transaction 必須依 Invitation → Membership → Account 鎖序重新驗證 token、expiry 與可信 Auth User，完成核准 onboarding 後才在同一 COMMIT 寫 accepted、consumed、event、audit 與 idempotency；任一步失敗全部 rollback

### Gate 3 驗收

- 同一 Person 可有多個 Club Membership
- 同一 Person 同時間最多一筆有效 Human Account
- Membership 同時狀態變更不產生漂移
- 相同 effective_at 不允許兩筆未作廢事件
- Membership 終止時，未完成 Onboarding 轉為 cancelled
- 跨 Club 使用者看不到其他 Club 個資
- Person Match 不回傳他社 Person ID 或聯絡資訊
- 同一 Invitation 的 concurrent final accept 只成功一次；second/replay、accept-vs-resend、accept-vs-revoke、accepted Auth binding 與 onboarding rollback 都由 Phase 3 transaction tests 驗證

---

# Phase 4：RLS 與 RBAC

### 目標

讓 31 張表具備逐表、逐操作、可驗證的權限。

### Helper Functions

- `get_current_account_id()`
- `get_current_person_id()`
- `get_current_membership_ids()`
- `has_platform_permission(...)`
- `has_district_permission(...)`
- `has_club_permission(...)`
- `is_self_person(...)`

### RLS 原則

- 預設拒絕
- 不使用前端 service role
- 不依賴前端傳入 Account ID
- 角色撤銷依即時資料庫狀態
- 避免 Policy 遞迴
- `SECURITY DEFINER` 固定 `search_path`
- General Member 不可讀取完整 Email、手機、Identity、Device、Session、Audit
- Suspended／Locked Account 只能進入安全恢復流程

### Gate 4 驗收

- 31 張表均啟用 RLS
- 每張表具有明確 SELECT／INSERT／UPDATE／DELETE 決策
- Secretary 無法跨 Club
- District Admin 無法跨 District
- Self 無法讀取他人敏感資料
- General Member 無法讀取 Identity、Session、Audit
- 角色撤銷後立即失效
- RLS 測試完整通過

---

# Phase 5：Identity、Session、LINE Login 與 LINE OA

### 目標

完成登入身份、Session、裝置及 LINE 兩套模組。

### Transaction Functions

- `bind_identity(...)`
- `unbind_identity(...)`
- `revoke_account_session(...)`
- `link_line_oa_contact(...)`
- `unlink_line_oa_contact(...)`

### Edge Functions

- `line-login-callback`
- `line-oa-webhook`
- `auth-reconciliation`

### 核心規則

- LINE Login 與 LINE OA 分離
- Identity Provider Subject 具正確 Channel Scope
- LINE Channel 依 Environment 唯一
- Channel Secret 只保存 Secret Reference
- 解綁 LINE Login 不解除 OA
- 解除 OA 配對不影響登入
- Account Merge 不搬移 Device
- Reconciliation 排除 System Account

### Gate 5 驗收

- 不同 Channel／Environment 不會誤綁
- LINE Login Identity 唯一性有效
- OA Contact 與 Identity 不混用
- Session 可撤銷且可安全重試
- 外部 Session 已消失時，Ledger 仍可保存歷史
- Auth User 不存在時建立 Reconciliation Issue

---

# Phase 6：Audit 與安全治理

### 目標

完成可稽核、可遮蔽、不可任意刪除的安全紀錄。

### Transaction Functions

- `write_audit_event(...)`
- `redact_audit_payload(...)`

### 核心規則

- Audit Log 骨架不可 Update／Delete
- Audit Payload 只有專用 Function 可修改
- Redaction 本身產生新 Audit Event
- Audit 保存 Actor Role Snapshot
- Login Event 保存 Channel Config
- 敏感 Payload 遵守資料保存政策

### Gate 6 驗收

- 一般角色無法修改 Audit Log
- Payload 遮蔽後事件骨架仍存在
- 遮蔽操作可追蹤操作者、原因、政策版本與範圍
- 角色日後撤銷仍能還原事件發生時的授權角色
- 稽核與安全測試通過

---

# Phase 7：Legacy Mapping 與 Shadow Migration

### 目標

將 V0.3 資料以可驗證方式轉換至 V1.2。

### 交付物

- `legacy_to_v12_mapping.yaml`
- 25 張 Legacy Table Mapping
- 42 支 RPC 去留表
- Transform Scripts
- Conflict Rules
- Reconciliation Report
- Shadow Migration Runbook

### RPC 去留分類

每支現有 RPC 必須標示：

- 保留
- 重寫
- 合併
- 移除
- 延後

### 遷移原則

- 不直接 Rename 舊表
- 不靜默合併 Person
- 衝突進人工處理
- 可重跑
- 具 Idempotency
- 中途失敗可回滾
- 遷移前後數量可對帳

### Gate 7 驗收

- Person、Membership、Account、Identity、Role、OA、Audit 數量完成對帳
- 無孤兒 Foreign Key
- 衝突資料有完整案件清單
- 遷移可重跑且不重複
- Shadow Migration 至少完整成功兩次
- 未操作正式資料庫

---

# Phase 8：前端切換與 E2E

### 目標

將前端由 V0.3 API 契約切換至 V1.2。

### 交付物

- 新 TypeScript Database Types
- 新 API Client
- 秘書後台
- 社員 Invitation／Onboarding
- 身份與 Session 管理
- LINE Login
- LINE OA 配對
- 權限與錯誤畫面
- E2E Tests

### Gate 8 驗收

完整流程通過：

> 秘書建立社員
> → 疑似重複檢查
> → 建立邀請
> → 社員登入
> → 接受邀請
> → 確認資料
> → 進入社首頁

並驗證：

- 多 Membership
- Invitation 重發
- 中斷後恢復 Onboarding
- Suspended／Locked
- Identity 解綁
- Session 撤銷
- Club 權限隔離
- LINE Login／OA 分離

---

# Phase 9：Staging、切換與回滾

### 目標

完成正式上線前的資料、功能與營運驗證。

### 上線前要求

- Staging 完整 Migration
- Production Backup
- Cutover Runbook
- Rollback Runbook
- 資料凍結窗口
- 最終 Reconciliation
- 權限審查
- Secret Rotation 檢查
- 監控與告警
- 支援人員操作手冊

### 切換原則

建議採：

1. V0.3 暫停寫入。
2. 執行最後增量 Extract。
3. Transform／Load 至 V1.2。
4. 執行 Reconciliation。
5. 切換前端與 Edge Functions。
6. 進行 Smoke Test。
7. 開放流量。
8. 保留 V0.3 唯讀備援期間。

### 回滾觸發條件

- 關鍵登入失敗
- Invitation 無法接受
- RLS 發生資料外洩風險
- 資料對帳不平
- 大量 Identity 無法匹配
- Migration 出現不可接受的孤兒資料
- Audit 無法正確寫入

---

## 6. PR 拆分原則

每個 PR 只處理一個可驗收主題。

建議順序：

1. `PR-01 v12-database-foundation`
2. `PR-02 v12-invitation-core`
3. `PR-03 v12-membership-onboarding`
4. `PR-04 v12-rls-rbac`
5. `PR-05 v12-identity-session`
6. `PR-06 v12-line-login`
7. `PR-07 v12-line-oa`
8. `PR-08 v12-audit-security`
9. `PR-09 v12-legacy-mapping`
10. `PR-10 v12-shadow-migration`
11. `PR-11 v12-frontend-cutover`
12. `PR-12 v12-release-candidate`

禁止單一 PR 同時混合：

- Schema Foundation
- RLS
- Edge Functions
- 前端重構
- Legacy Migration

---

## 7. 每個 PR 的共同完成標準

每個 PR 必須提供：

- 修改摘要
- 決策與假設
- 新增／修改／未修改檔案
- Migration 影響
- API 契約影響
- RLS 影響
- 測試清單
- 實際測試結果
- Lint 結果
- Git Diff Summary
- 已知風險
- 回滾方式
- 下一個 PR 建議

不得只提交程式碼而沒有驗證結果。

---

## 8. 測試策略

### Schema Tests

- 空資料庫建立
- Constraint
- Foreign Key
- Index
- Identifier Length
- Column Comment
- Seed Idempotency
- Person Merge Removed
- System Actor

### Transaction Tests

- Row Lock
- Concurrency
- Idempotency
- Retry
- Rollback
- Stable Error Code

### RLS Tests

- Platform
- District
- Club
- Self
- General Member
- Suspended／Locked
- Cross-Club／Cross-District Denial

### Edge Function Tests

- Secret 不洩漏
- HMAC
- Rate Limit
- LINE Signature
- Auth Context
- RPC Error Mapping

### Migration Tests

- Re-runnable
- Count Reconciliation
- Conflict Report
- Orphan Detection
- Interrupted Run Recovery

### E2E Tests

- Invitation 主流程
- 多 Membership
- Onboarding Resume
- Session Revoke
- Identity Unbind
- LINE Login
- LINE OA Link／Unlink

---

## 9. 開發與審查角色

### 產品與架構母版

由產品負責人與 ChatGPT 維護：

- 功能範圍
- 領域邊界
- 優先順序
- 驗收 Gate
- 上線風險
- 延後項目

### Repository 工程計畫與實作

由 Codex 執行：

- 讀取 Repository
- 檔案級依賴盤點
- 建立 `V12_REPOSITORY_IMPLEMENTATION_PLAN.md`
- 拆分 PR
- 實際修改
- 執行 Migration、Lint、Tests
- 回報 Git Diff 與剩餘風險

### 人工核准

以下事項不得由 Codex 自行決定：

- 刪除或覆寫 Legacy Migration
- 操作 Production Supabase
- 改變產品 MVP 邊界
- 放寬 RLS
- 靜默合併 Person
- 刪除 Audit
- 修改資料保存政策
- 正式 Cutover
- 正式 Rollback

---

## 10. Codex 執行設定

Repository 執行計畫與複雜重構建議：

- 模型：GPT-5.3-Codex
- 推理強度：xhigh
- 第一輪模式：只盤點與產生工程計畫，不進行大規模修改
- 計畫核准後：逐 PR 實作

較機械式的註解、測試補齊或單一欄位調整，可視情況降為 high。

---

## 11. 近期三個里程碑

### Milestone A：Database Foundation Ready

- V1.2 隔離建置完成
- Schema Hardening 完成
- Seed 與 System Actor 完成
- Tests／Lint 全通過

### Milestone B：Invitation & Onboarding Ready

- Invitation 主流程完成
- Person Match 完成
- Membership Status／Onboarding 完成
- Concurrency／Idempotency 測試通過

### Milestone C：Security & Access Ready

- 31 張表 RLS 完成
- RBAC 完成
- Identity／Session 完成
- Audit 完成
- LINE Login／OA 核心流程完成

完成以上三個里程碑後，才進入 Legacy Shadow Migration 與前端切換。

---

## 12. 下一步

下一步不是立即讓 Codex修改全部程式碼。

應將本母版藍圖交給 Codex，要求它先：

1. 讀取實際 Repository。
2. 盤點 AGENTS.md、migrations、RPC、RLS、Edge Functions、前端 Supabase 呼叫及測試。
3. 對照本藍圖。
4. 建立檔案級 `V12_REPOSITORY_IMPLEMENTATION_PLAN.md`。
5. 建立 PR 拆分及依賴圖。
6. 回報所有衝突與需要人工決定的項目。
7. 不修改線上 Supabase。
8. 第一輪不做大規模程式碼修改。

待 Repository 執行計畫審查通過後，再從 `PR-01 v12-database-foundation` 開始實作。
