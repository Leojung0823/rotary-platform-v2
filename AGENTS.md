# 給 AI 代理的工作指引

這個 repo 經常同時有多個 AI 代理在不同分支上工作。這份文件記錄的是**實際會出事的地方**，不是通用的程式風格建議。每一條都對應曾經真正發生過的問題。

## 1. 事實來源

以 repository 的實際檔案、Git 歷史、CI 結果為準。不要只依賴聊天摘要、PR 說明或前一個代理的「已完成」宣告——那些可能過時或樂觀。

**動手前務必確認所有 open PR**，特別是 stacked PR 的 base/head 關係。這個 repo 發生過多個代理各自從 main 建立同一個功能的 schema。

## 2. 工作與交付方式

目前的節奏是：**本機開發 → 完整驗證 → 清楚的 commit → 直接同步 `main` → Plan→Go-Live 部署 staging**。

使用者已明確授權直接推 `main` 並自動執行部署流程，不需要每次詢問。但下列仍須事先說明並取得同意：

- 刪除性操作（刪除服務、資料、分支）
- 修改 production 環境或 production Supabase 專案
- 更動 LINE channel 設定、網域、或任何會影響現有社員登入的東西

多代理協作時，**不要對別人的分支 force push**——用 merge 而非 rebase，對方可能還在上面工作。

## 3. Migration 規則（最常出事的地方）

檔名格式 `YYYYMMDDNNNNNN_描述.sql`，例如 `20260820000100_event_cover_images.sql`。

### 三條硬規則

1. **時間戳必須排在所有「已部署到 staging」的 migration 之後。** 排在前面的話 `supabase db push` 會直接拒絕，整個部署卡住。舊分支（幾週前開的）幾乎一定會踩到這個。

2. **不要跟別人撞號。** 同一天多個功能並行時，各自都會假設自己是 `000100`。合併前先看 `ls supabase/migrations/ | tail`，往後挑一個沒用過的編號。

3. **已經部署出去的 migration 不可修改、改名或刪除。** 只能往前加新的。

### 重新編號的時機

未合併的 migration 可以自由改名（`check:migrations` 只保護基線分支上已存在的檔案）。**一旦合併並部署就不能再動。** 所以撞號要在合併前解決。

改名時記得一起更新引用檔名的測試——`src/lib/product/product-rollout-db-contract.test.ts` 會指向「最新宣告 feature flag 約束的 migration」。

### Postgres 的兩個陷阱

- `CREATE OR REPLACE FUNCTION` **無法**改變回傳型別或參數列表。要加參數或改 `RETURNS TABLE` 必須先 `DROP FUNCTION`。
- 改動「已套用過」的 migration 檔案，`db push` 不會重跑（它只認檔名）。必須 `npx supabase db reset --local`。

### 改動函式簽章時，記得驗證檔會寫死簽章

`supabase/verification/*.sql` 裡的 `has_function_privilege('...', 'public.fn(uuid,text)', 'EXECUTE')` 是**完整簽章字串**。加參數並 DROP 重建之後，舊的驗證檔會失敗並顯示「function does not exist」。

只跑新寫的驗證檔不會發現，一定要跑完整的 `npm run verify:db`。

### 改寫既有函式時

不要憑記憶重打整個函式。用程式化方式從原始 migration 擷取，只改要改的那一行。曾經發生過重寫時漏掉「授予 member 角色」「建立通知設定」等關鍵步驟。

## 4. 每次 commit 前必須跑

```bash
npm run typecheck && npm run lint && npm test
npm run verify:db          # 完整 db reset + 所有驗證 SQL
npm run check:migrations   # migration 前向性
```

改到 UI 或流程時，還要跑瀏覽器測試（見第 6 節）。

**不要標 `[skip ci]`。** 這個 repo 曾經有五個 PR 全部標了 skip，結果累積上萬行從未經過 CI 的程式碼。

## 5. 安全邊界

這個專案的權限模型是核心資產，改動時要特別小心。

- **所有 mutation 走 RPC**，不要讓瀏覽器直接寫表。RLS 是最後防線不是唯一防線。
- **`security definer` 函式必須設 `search_path`**。
- **有些輔助函式刻意從 `authenticated` 撤銷**（例如 `current_has_club_permission`、`current_can_access_club_events`），它們只給 definer 函式內部使用。需要在 RLS policy 或 Storage policy 用到時，**不要解除撤銷**——另外做一個窄接口的 definer wrapper，只回答呼叫者自己的權限。
- **Storage 上傳若由瀏覽器直接進行**（為了不讓檔案位元組經過伺服器），那 Storage 的 row policy 就是唯一的授權邊界，必須寫得跟對應領域的權限規則一致。
- 新功能一律加 **feature flag 且預設 fail closed**。
- 新的資料表／RPC 要有對應的 `supabase/verification/*.sql`，並註冊進 `scripts/database-verification-files.txt`。

驗證檔要測「誰不能做什麼」，不只是「誰可以」：一般社員、外社社員、停權帳號都要涵蓋。

**注意**：驗證檔裡以 `set local role authenticated` 執行時，不能直接讀多數 `public` 資料表（那是刻意的，應用程式都走 RPC）。斷言要放在 `reset role` 之後。

## 6. 測試慣例

| 類型 | 位置 | 用途 |
|---|---|---|
| 單元 | `src/**/*.test.ts` | 純邏輯、輸入驗證 |
| 邊界 | `src/**/*security-boundary.test.ts` | 掃描原始碼，確保不變條件沒被破壞 |
| 資料庫 | `supabase/verification/*.sql` | 權限與 RLS，在真實 Postgres 上跑 |
| 瀏覽器 | `e2e/tests/*.e2e.mjs` | 真實流程 |

### 瀏覽器測試的四個常見陷阱

1. **單一測試預設只有 30 秒。** 一個測試裡塞多次登入會在 CI 超時（本機比較快所以看不出來）。拆成多個測試，或對真的很重的測試用 `test.setTimeout()`。
2. **不要斷言在「起始狀態」上。** 例如按鈕文字會因為前一輪測試留下的資料而改變。要斷言受測的**行為**。
3. **會改變資料的測試只在單一 viewport 執行**（用 `test.skip(testInfo.project.name !== ...)`），否則後面的 viewport 會看到被改過的狀態。
4. **`loading="lazy"` 的圖片要先捲動到可見範圍**才會載入，否則會被判定為 hidden。
5. **`count()` 不會等待，`expect()` 才會。** 外殼是在 Suspense 邊界後串流進來的，直接 `count()` 會數到還沒渲染的空頁面而得到 0。要數之前先 `await expect(locator.first()).toBeVisible()`。
6. **`next start` 會沿用 3000 埠上已存在的 server。** 如果前一次的 server 沒關掉，Playwright 會直接重用它，跑的是**舊的 build**——症狀是程式明明改了、`.next` 產物裡也有新字串，但畫面就是舊的。懷疑之前先 `lsof -ti:3000 | xargs kill`。今天為此誤判過兩次。
7. **導覽連結的可及名稱只包含當前斷點看得見的那個標籤。** 桌機是完整名稱、手機是短標籤（`display: none` 的文字不計入可及名稱），所以跨尺寸的測試要用 regex 同時涵蓋兩者。

本機連續跑兩次完整測試前，要重跑 fixture：

```bash
node --env-file=.env.local scripts/bootstrap-superadmin.mjs
E2E_ROLE_PASSWORD=... node --env-file=.env.local scripts/bootstrap-role-shell-browser-fixtures.mjs
node --env-file=.env.local scripts/configure-local-e2e-role-shells.mjs enabled
```

（本機 Supabase 資料在 `db reset` 後會清空，superadmin 需要重建。）

### `db reset` 之後可能要重啟整個 stack

`npm run verify:db` 會做 `db reset`，而 **GoTrue 的 auth schema migration 只在容器啟動時套用**。重置後 `auth.users` 可能缺欄位（實際遇過缺 `banned_until`），任何 admin API 呼叫都會失敗，症狀是 bootstrap 腳本回報「could not inspect Auth users」，接著所有瀏覽器測試因為登入失敗而全掛。

不是程式問題。修法：

```bash
npx supabase stop && npx supabase start
npx supabase db reset --local
```

然後重跑上面的 fixture 指令。

### 本機跑多個會改資料的測試專案要加 `--workers=1`

CI 設定就是 `workers: 1`，本機預設會依 CPU 開多工。多個專案同時對同一個測試社建標籤、建活動、發訊息會互相踩到，症狀是好幾個不相干的套件同時失敗、但單獨跑都過。

```bash
npx playwright test --workers=1 --project=... --project=...
```

### 測試不要依賴別的套件留下的資料

需要標籤、活動、LINE OA 帳號之類的前提時，加進 `scripts/bootstrap-role-shell-browser-fixtures.mjs`，不要假設別的測試會先建好——否則測試是依專案執行順序決定成敗，不是依行為。

### `notFound()` 在串流開始後只能回 200

標頭已經送出了，所以不要斷言 404 狀態碼。要斷言的是**畫面上沒有洩漏任何內容**，那才是真正要保證的事。

## 7. 部署

`Staging Release`（plan，乾跑）→ `Staging Go-Live`（套用 migration + 部署 + 真實帳號驗收）。

- 兩者都會停在 **staging environment 的人工核准閘門**。卡在 `waiting` 是在等核准，**不是帳單問題**。
- Go-Live 需要傳入 `expected_sha`。**一定要用 `$(git rev-parse HEAD)`**，不要手打。
- 部署完用 `/api/health` 確認：`issues` 必須是空的。
- `warnings: ["DEPLOYMENT_WARNING"]` 是預期的——staging 用 `LINE_OA_MODE=mock` 就會產生。

環境細節見 `docs/deployment/STAGING_RUNBOOK.md`；機房搬遷見 `RENDER_REGION_MIGRATION.md`。

## 8. 效能考量

Staging 跑在 Render 免費方案（0.1 CPU），資料庫在首爾。**單次資料庫往返約 180ms**，所以頁面速度取決於**循序往返的次數**，不是查詢總數。

寫伺服器元件時：

- 互不相依的讀取要**同時發動**再一起 await，不要一個等完才發下一個。
- 需要「先查清單再查內容」的頁面，考慮做一個組合型 RPC 讓資料庫一次回答（參考 `list_my_event_page`）。組合時**呼叫既有函式**而不是重寫查詢，這樣授權與排序邏輯只有一份。
- 大檔案不要經過應用程式伺服器。

目前每個登入頁約 2 次循序往返，這是刻意維持的。

## 9. CI 已知問題

Chromium 安裝步驟偶爾會因為 Ubuntu 鏡像站無法連線而**停住**（不是報錯）。已加上逾時與重試，並在重試前清除殘留的 apt 鎖。若看到該步驟失敗，先重跑再懷疑程式碼。

## 10. 不要做的事

- 不要提交 `.env`、密碼、API 金鑰、service-role key、LINE secret。
- 不要把秘密值放進 build args、PR 說明或訊息。
- 不要在未取得授權的情況下連線或修改 production 資料庫。
- 不要為了讓測試通過而放寬斷言——先確認那是測試的問題還是功能的問題。
