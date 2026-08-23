# 今日工單：三線平行修復與 Staging 發布（2026-08-23）

## 今日目標

在不覆蓋現有生日祝福企劃、不修改 production、不放寬登入／權限／社團隔離的前提下，完成三條互不相依的工作線；由工頭整合、驗證、同步 `main`，再依 `Staging Release → Staging Go-Live` 發布測試站。

## 起始基線與保護範圍

- Repository：`Leojung0823/rotary-platform-v2`
- 分支：`main`
- 起始 SHA：`5d6cc42446f92d86deb443c866a12c02bdb49280`
- 既有未提交內容，所有工作線都不得修改或覆蓋：
  - `docs/mvp/BIRTHDAY_WISHES_V2_PLAN.md`
  - `docs/mvp/BIRTHDAY_WISHES_QUESTION_BANK_V1.md`
- 不使用已關閉 PR #37 的出席 migration。
- `list_club_events` 與 `list_my_event_page` 均使用現行雙參數簽章。
- 新 migration 先從 `20260823000100` 起算，整合前再次確認沒有撞號。
- 不修改 production、Supabase production、LINE channel、網域或登入設定。
- 不手動觸發一般 CI，也不使用 `[skip ci]`；推送 `main` 後若 GitHub 自動執行既有檢查，保留其正常行為。

## 分工

### AI 一號：手機版「我的出席」入口修復

問題：目前 Browser Smoke 在 Android Chromium 與 412px viewport 都無法點擊「開啟出席紀錄」，有其他卡片或導覽元素攔截 pointer event。

交付：

1. 找出真正的覆蓋／層級／排版原因，不用強制 click 掩蓋問題。
2. 修正手機與窄螢幕的可點擊區域，維持至少 48px 操作尺寸與鍵盤可用性。
3. 加強或修正出席 E2E，讓測試驗證真實點擊與導頁。

專屬寫入範圍：

- `src/app/(authenticated)/me/page.tsx`
- `src/app/globals.css`（只有查明根因在共用樣式時才可修改）
- `e2e/tests/attendance.e2e.mjs`

驗證：目標出席 E2E、typecheck、lint、相關單元測試與 `git diff --check`。

### AI 二號：訊息留言板 lint 修復

問題：最新 CI 在 `src/components/message-board/message-board.tsx` 有兩個 `no-unused-expressions` 警告。

交付：

1. 找出兩個警告的真正原因。
2. 改成清楚、等價且可維護的程式，不改變留言板行為與 API／權限邊界。
3. 若現有測試無法涵蓋該行為，僅在專屬範圍內補最小測試。

專屬寫入範圍：

- `src/components/message-board/message-board.tsx`
- `src/lib/message-board/security-boundary.test.ts`（確有需要才修改）

驗證：目標測試、typecheck、lint 與 `git diff --check`。

### AI 三號：既有獨立領域補上可回滾功能開關

問題：生日祝福、社內留言板、文件中心已存在，但沒有完整 feature flag 閘門；其中生日與留言板已由互動中心曝光。

交付：

1. 新增三個獨立 feature key：`birthday_wishes_v1`、`message_board_v1`、`archive_handover_v1`。
2. 更新資料庫約束、稽核約束與 `set_platform_feature_flag` 白名單；用新的 forward-only migration，不改舊 migration。
3. 導覽入口與直接路由使用同一個 flag；評估失敗必須 fail closed。
4. 不修改任何既有領域資料表、RPC、RLS、角色或權限。
5. 補 feature flag 單元／安全邊界測試與 DB verification，並登錄 manifest。

專屬寫入範圍：

- `supabase/migrations/20260823000100_*`
- `supabase/verification/*feature*flag*.sql`（新增檔優先）
- `scripts/database-verification-files.txt`
- `src/lib/product/feature-flags.ts`
- `src/lib/product/*feature*flag*.test.ts`
- `src/app/(authenticated)/interact/page.tsx`
- `src/app/(authenticated)/board/page.tsx`
- `src/app/(authenticated)/birthdays/page.tsx`
- `src/app/(authenticated)/archives/page.tsx`

驗證：feature flag 單元測試、typecheck、lint、`check:migrations`、完整 DB verification 與 `git diff --check`。

## 工頭整合閘門

三位 AI 都要回報：根因、變更檔案、驗證命令、結果、未完成風險。工頭完成以下工作後才可發布：

1. 確認三條變更的檔案範圍沒有重疊，生日企劃文件未被覆蓋。
2. 逐一審查 diff，確認沒有密鑰、production 變更、權限放寬或舊 migration 修改。
3. 整合後執行 typecheck、lint、單元測試、build、migration 檢查、DB verification、目標瀏覽器測試與 `git diff --check`。
4. 只有全部必要閘門通過才 commit 並 push `main`；失敗就停止發布並回報。
5. 以整合後的精確 SHA 執行 `Staging Release`，通過後再執行 `Staging Go-Live`。
6. 最後檢查 `/api/health` 的 revision 與整合 SHA 相同，且 `issues` 為空。

## 完成定義

- 三位 AI 已各自完成、驗證並回報。
- 手機版出席入口可真實點擊。
- 留言板 lint 不再出現該兩項警告。
- 三個既有獨立領域可由平台 feature flag 安全關閉，入口與直達頁一致。
- 本機必要驗證全部通過。
- `main` 與 staging 健康檢查均指向同一個新 SHA。
