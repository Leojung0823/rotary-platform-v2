# Project State

> 本文件是專案 delivery state、核心架構與主要風險的持續更新快照。它是導航文件，不可取代目標 branch 的實際程式碼、migration、PR 與 CI 證據。

## Snapshot

- 專案：Rotary Platform V2
- Repository：`Leojung0823/rotary-platform-v2`
- 預設分支：`main`
- 狀態確認日期：2026-07-24（Asia/Taipei）
- `main` 最新確認 commit：`7d1ec98a9a9422dbeb07b25174f9e56fdb2566fb` — `Bootstrap Next.js V2 foundation`
- 目前階段：`main` 已完成應用基礎；第一個垂直功能與 V0.3 身份／管理系統正在 stacked Draft PR 中實作與審查，尚未合併到 `main`

## Product Goal

在不影響現有 Lovable 正式系統的前提下，重建可服務多個扶輪社的管理平台。Hosted 測試與部署使用獨立 staging 環境；schema、RLS、auth 與 provisioning 可先在隔離的本機 Supabase 開發及驗證。

第一個垂直功能為：

1. 平台管理員建立扶輪社。
2. 系統建立第一位執行秘書邀請。
3. 執行秘書使用自己的帳號接受邀請。
4. 系統授予該社管理權限。
5. 扶輪社由 `provisioning` 轉為 `active`。

## Confirmed Architecture Decisions

- 單一資料庫服務多個扶輪社，社級資料以 `club_id` 隔離。
- `people`、`app_accounts`、`club_memberships` 與 `club_operator_permissions` 分開建模。
- 執行秘書使用個人帳號與 operator 權限，不建立社員社籍。
- 同一扶輪社可以授權多位執行秘書。
- 執行秘書不出現在社員名冊與出席率分母。
- 同一人的 active membership 與 active operator access 依最終產品規則不得重疊。
- 現有 Lovable 系統繼續正式運作；V2 的 hosted 測試／部署使用獨立 staging Supabase。

詳細規則見 `docs/architecture/core-decisions.md`。

## Merged on `main`

### Repository foundation

- 建立私人 GitHub Repository 與 `main` 分支。
- 建立 Next.js App Router、React、TypeScript strict 與 Tailwind CSS 基礎。
- 建立 Supabase browser/server client 包裝。
- 建立 `.env.example`，預留 Supabase URL 與 publishable key 名稱。
- 建立基礎首頁，呈現 V2 目標與身份／權限原則。
- 建立 GitHub Actions `CI`，使用 Node.js 24 執行 install、lint、typecheck 與 build。
- 建立核心架構決策文件。

`main` 目前沒有已合併的 database migration、完整 auth、provisioning 或 V0.3 功能。

## In progress in open stacked PRs

目前交付鏈為：

```text
main
└─ PR #2  feat/supabase-core-baseline
   └─ PR #5  feat/supabase-issue-3
      └─ PR #7  feat/v0.3-identity-admin
```

這些 PR 均為 Draft。CI 成功代表自動檢查通過，不代表已完成安全審查或可跳過依賴順序。

### PR #2 — Supabase core identity baseline

- Base：`main`
- Head：`feat/supabase-core-baseline`
- 已確認 head SHA：`c536e2433e12b908bdd2a151601dcbee55d2275a`
- CI：`CI` success
- Repository 證據：
  - 版本化 Supabase local project
  - 核心 identity／club schema migration
  - `people`、`app_accounts`、`platform_roles`、`clubs`、`club_memberships`、`club_operator_permissions`、operator invites 與 audit logs
  - RLS enabled
  - 撤銷 `anon`、`authenticated` 的直接 table privileges
  - membership／operator overlap 防護與 verification SQL
- 尚未合併到 `main`。

### PR #5 — Local auth and club provisioning vertical slice

- Base：`feat/supabase-core-baseline`（依賴 PR #2）
- Head：`feat/supabase-issue-3`
- 已確認 head SHA：`e8c752495c5705d2a78477473ef1018675d5d907`
- CI：`CI` success、`Quality` success
- Repository 證據：
  - secure provisioning forward-only migration 與 SECURITY DEFINER RPC
  - 平台管理員、扶輪社建立、第一位 operator invitation、接受邀請與狀態流程
  - Traditional Chinese login／app shell／operator management
  - unit tests、migration history guard、local database verification 與 auth／Mailpit verification
  - `npm test`、`npm run check:migrations`、`npm run verify:db`、`npm run verify:auth`
- 尚未合併到 `main`，需先處理 PR #2 或在其合併後 retarget。

### PR #7 — V0.3 Identity & Admin

- Base：`feat/supabase-issue-3`（依賴 PR #5）
- Head：`feat/v0.3-identity-admin`
- 已確認 head SHA：`32716b39a60c30f1a92eb409f4ddc078896bbf8d`
- CI：`CI` success、`Quality` success
- Repository 證據：
  - invitation-first identity／member administration schema 與 RPC
  - LINE Login/OA、identity center、member／invitation／audit UI
  - local-only LINE mock、安全邊界、V0.3 verification SQL
  - lint、typecheck、14 tests、build、database／auth verification 與 audit checks
- 尚未合併到 `main`，需先處理 PR #2 與 PR #5。

### PR #8 — Project Rehydration workflow

- Base：`main`
- Head：`agent/project-rehydration`
- 新增 `AGENTS.md`、本文件與 `docs/PROJECT_REHYDRATION.md`
- 本 PR 僅修改文件，目的為讓新代理辨識 `main` 與 stacked PR 的差異，避免重複開發。

## Not confirmed／尚無 Repository 證據

- Hosted V2 staging Supabase 已建立、linked 或完成遠端驗證
- Staging deployment 與可驗收 URL
- Hosted staging secrets、ownership 與部署權限已完成確認
- 正式 LINE provider credentials、callback／webhook 設定已完成
- Lovable production data migration 策略與演練
- PR #2、#5、#7 已完成獨立人工安全審查
- 活動、例會、出席、公告、通知排程、CMS、會費／付款與其他後續模組已交付

「Not confirmed」表示 GitHub 中缺少足夠可驗證證據，不代表 Repository 以外一定不存在。

## Local-first safety boundary

以下工作可在隔離的本機環境進行，不必等待 hosted staging credentials：

- 撰寫與審查 migration／RLS／RPC
- `supabase db reset --local`
- `supabase db lint --local`
- verification SQL
- local Mailpit／Supabase Auth flow
- unit tests、lint、typecheck 與 build

以下動作需要先確認目標、ownership、秘密值與明確授權：

- Supabase link／push 或遠端 migration
- Hosted staging 測試或部署
- 設定真實 LINE credentials
- 讀寫 Lovable 或 production database
- 匯入正式資料

## Current Risks and Constraints

1. **Stacked PR 整合順序**  
   PR #5 依賴 #2，PR #7 依賴 #5。不得從 `main` 重新建立相同 schema 或功能，也不得跳過 base dependency 直接合併。

2. **大型 Draft PR 尚待人工審查**  
   PR #5 與 #7 變更範圍大。CI success 不能替代 migration、RLS、RPC、秘密值邊界與 UI 行為的獨立 review。

3. **Hosted staging 尚未確認**  
   本機開發與驗證可以繼續，但在 link、push、部署或使用真實 provider 前必須確認安全邊界。

4. **文件可能因並行 PR 過時**  
   每次重載都必須重新查詢 open PR、head SHA、base branch 與 Actions，而不是只相信本文件。

5. **正式 Lovable 系統必須維持隔離**  
   未經明確決策與審查，V2 不得連線或寫入正式資料庫。

## Current validation model

驗證命令應以目標 branch 的 `package.json` 與 workflow 為準。

`main` 目前提供：

```bash
npm run lint
npm run typecheck
npm run build
```

PR #5／#7 的堆疊分支另提供或使用：

```bash
npm ci
npm run check:migrations
npm run lint
npm run typecheck
npm test
npm run build
npm run verify:db
npm run bootstrap:superadmin
npm run verify:auth
```

GitHub Actions 應查詢 workflow runs、jobs 與 step conclusions。Legacy combined commit status 沒有 context，不等於 Actions 不存在或失敗。

## Recommended Next Work

### Priority 1 — Review and integrate the stacked delivery chain

1. 對 PR #2 執行獨立 schema、RLS、migration history 與 local verification review。
2. 修正後將 PR #2 標記 Ready 並合併，或保留 Draft 直到人工驗收完成。
3. 將 PR #5 更新／retarget 到合併後的 `main`，重新確認 diff、CI、Quality 與 local verification，再審查 provisioning/auth。
4. PR #5 完成後，以相同方式處理 PR #7。
5. 每層合併後，更新本文件的 Merged／In progress 狀態。

### Priority 2 — Confirm hosted staging boundary

在需要遠端驗收時再確認：

- staging Supabase ownership 與 project reference
- deployment target 與可驗收 URL
- secrets 管理與最小權限
- 禁止觸及 Lovable production 的操作邊界

### Priority 3 — Choose the next product slice

只有在確認 PR #2 → #5 → #7 的實際合併狀態後，才規劃下一個功能。不得重做已存在於 stacked PR 的 migration、RLS、auth、provisioning 或 identity administration。

## Update policy

- 只有 delivery state、核心架構、主要風險、外部環境或後續工作順序改變時才更新本文件。
- Stacked PR 各自只記錄相對於 base branch 的新增狀態。
- 純樣式、小修正或不影響交付狀態的重構通常不更新。
- 堆疊合併完成後，由最上層／最後合併 PR 或專門同步 PR 整理 `main` snapshot。

## Update Log

- 2026-07-24：建立 Project Rehydration 基礎文件。
- 2026-07-24：依獨立審查補入 PR #2 → #5 → #7 stacked delivery chain、local-first safety boundary、實際驗證命令與整合優先順序。
