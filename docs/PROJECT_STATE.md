# Project State

> 本文件是專案目前狀態的持續更新快照。重大功能、架構或交付狀態改變時，應在同一個 Pull Request 中更新本文件。

## Snapshot

- 專案：Rotary Platform V2
- Repository：`Leojung0823/rotary-platform-v2`
- 預設分支：`main`
- 狀態確認日期：2026-07-24（Asia/Taipei）
- `main` 最新確認 commit：`7d1ec98a9a9422dbeb07b25174f9e56fdb2566fb` — `Bootstrap Next.js V2 foundation`
- 目前階段：V2 基礎建置完成，第一個垂直功能尚未開始實作

## Product Goal

在不影響現有 Lovable 正式系統的前提下，以獨立 staging 環境重建可服務多個扶輪社的管理平台。第一個垂直功能為：

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
- 現有 Lovable 系統繼續正式運作；V2 使用獨立 staging Supabase。

詳細規則見 `docs/architecture/core-decisions.md`。

## Completed

### Repository foundation

- 建立私人 GitHub Repository 與 `main` 分支。
- 建立 Next.js App Router、React、TypeScript strict 與 Tailwind CSS 基礎。
- 建立 Supabase browser/server client 包裝。
- 建立 `.env.example`，預留 Supabase URL 與 publishable key。
- 建立基礎首頁，呈現 V2 目標與身份／權限原則。
- 建立 GitHub Actions CI。
- 建立核心架構決策文件。

### Current validation commands

```bash
npm run lint
npm run typecheck
npm run build
```

CI 目前在 Pull Request 與推送到 `main` 時使用 Node.js 24 執行上述檢查。狀態快照建立時，GitHub API 未回傳 `main` 最新 commit 的 combined status；不可據此宣稱 CI 已通過或失敗。

## Not Yet Implemented

截至本次狀態確認，在已檢查的 Repository 快照中尚未看到以下成果：

- V2 staging Supabase 專案與環境設定完成證據
- 資料庫 schema migrations
- Row Level Security policies
- 平台管理員認證與授權
- 建立扶輪社功能
- 執行秘書邀請與接受流程
- `provisioning` 至 `active` 狀態轉換
- 自動化測試套件與 domain-level tests
- staging 部署設定與可驗收 URL
- 正式資料遷移策略

「尚未看到」表示目前 Repository 中沒有足夠證據，不代表外部服務或未推送分支一定不存在。

## Current Risks and Constraints

1. **Staging infrastructure 尚未確認**  
   在建立認證、migration 或 RLS 前，需要先確認 V2 staging Supabase 專案與秘密值管理方式。

2. **多租戶隔離尚未經實作驗證**  
   `club_id` 隔離目前是架構決策，尚需透過 schema、RLS 與測試落實。

3. **身份與 operator 規則容易被簡化錯誤**  
   不可將執行秘書直接放入 `club_memberships`，也不可使用共用管理帳號。

4. **正式 Lovable 系統必須維持隔離**  
   未經明確決策與審查，V2 不得連線或寫入正式資料庫。

5. **CI 可見性不足**  
   本次查詢沒有取得最新 `main` commit 的 status context；新的 PR 應以實際 Actions 結果作為驗證依據。

## Recommended Next Work

### Priority 1 — Establish staging foundation

- 建立或確認獨立 V2 staging Supabase 專案。
- 將公開環境變數安全地設定於本機與 staging deployment。
- 確認 service-role key 不會進入前端或 Repository。
- 記錄 staging ownership、環境名稱與部署方式，但不要把秘密值寫入文件。

### Priority 2 — Design first vertical slice

建立可審查的資料模型與 migration，至少涵蓋：

- clubs
- people
- app_accounts
- club_memberships
- club_operator_permissions
- operator invitations
- club lifecycle status

同時定義唯一性、外鍵、稽核欄位與 RLS 邊界。

### Priority 3 — Implement and verify provisioning flow

- 平台管理員建立扶輪社
- 建立第一位 operator invitation
- 接受邀請並綁定個人帳號
- 授予社級 operator 權限
- 將扶輪社狀態轉為 `active`
- 建立成功、過期邀請、重複邀請、跨社存取與權限不足測試

## Definition of Done for the Next Vertical Slice

下一個垂直功能只有在以下條件成立時才可標示完成：

- migration 可重複套用於乾淨的 staging database
- RLS 可阻止未授權與跨社資料存取
- 每位 operator 使用個人帳號
- operator 不會被錯誤加入社員名冊
- UI／API／database 流程可從建立扶輪社走到 `active`
- lint、typecheck、build 與相關測試通過
- PR 說明包含驗證證據與已知限制
- 本文件已更新

## Update Log

- 2026-07-24：建立 Project Rehydration 基礎文件，記錄目前 Repository 的真實基礎狀態。