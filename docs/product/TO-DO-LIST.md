# Rotary Platform 待辦執行清單

更新日期：2026-08-31（Asia/Taipei）

權威來源：GitHub `Leojung0823/rotary-platform-v2` 的 `main`。本文件取代
`/Users/leoj/Documents/Codex/2026-08-23/rotary-platform-to-do-list/TO-DO-LIST.md`
的舊掃描結果；那份檔案屬於獨立 worktree，不是權威 repo 的版本。

狀態：`[x]` 已完成　`[>]` 程式完成、等待外部驗收　`[!]` 需要產品決定　`[ ]` 尚未開發

## 本輪結論

原待辦清單的 0、2–3、6–11 項，能在程式與本機環境完成的部分已完成；
GPS 只剩精度政策，密碼 recovery 只剩真實 staging 信件流程，Browser Smoke
只剩實機驗收。生日 V2 核心與生日祝福徵集程式已完成，PR #77 已合併，出席日期修正 PR #86 也已合併。

目前權威 `main` 是 `d4e9e298b40ed379df7424317005e34167dfaf53`；staging `/api/health`
於 2026-08-31 掃描通過，但執行版本仍是 `26520424b415b8f3e446d0ff53312330f30e76af`。
因此 staging 目前落後 `main`，不能把最新主線的 Auth 設定同步程式、功能目錄或 CI 範圍規則說成已部署。
健康檢查的 `issues` 為空，`DEPLOYMENT_WARNING` 是 staging 的預期警告；production 沒有修改。
生日徵集的兩個旗標已由 staging 平台管理員透過受保護流程開啟，Render scheduler secret 已同步，
針對 `26520424b415` 的 hosted acceptance `33345182984` 與排程 workflow `33345260361` 均成功。

## 逐項狀態

### 0. 掃描與工作邊界 `[x]`

- 已以權威 `main`、實際 migration、RPC、verification、TypeScript、測試和瀏覽器流程交叉確認。
- 已保留 PR #61 的 canonical Attendance；沒有採用已關閉 PR #37 的重複 authority。
- 所有新增資料庫 RPC／投影都有對應 verification SQL，並已登錄 manifest。
- 目前只有一個 open PR：舊的 draft PR #40，base 是過時的出席分支；公告功能已在 `main` 實作，不能直接合併。
- PR #93 已加入 CI／Browser Smoke 的變更範圍 gate：低風險文件只跑輕量 gate，高風險程式／資料庫／建置／流程修改才跑完整檢查；分類失敗時 fail-open。

### 1. GPS Check-in `[!]`

已完成 200 公尺 server-side 距離判定、fresh browser location、QR／人工 fallback，且不保存
原始座標或精確距離。尚未自行猜測 `accuracy` 門檻。

待產品決定：

1. 接受瀏覽器回傳的任何 accuracy，只以 200 公尺距離判定；或
2. 指定最大 accuracy 與定位 age，再補 server-side 拒絕規則與測試。

在決定前不改 GPS 契約；這是刻意的安全停點。

### 2. 社員優先行動版體驗 `[x]`

- 社員第一層固定為「首頁、活動、社員、我的」四項。
- 訊息未讀徽章移到首頁；社內互動改為首頁次要入口。
- 社務管理入口移到帳號選單，保留幹部進入管理與返回社員模式。
- 名錄 mobile label 改為「社員」。
- 關鍵控制補到至少 48px，並加入 320／375／412px 與 200% 字體驗收。

### 3. ExperienceContext 與 dashboard routing `[x]`

server-authoritative role、mode、active-club fallback 與 tenant boundary 已完成；cookie 和導覽
只作 UX 偏好，不是權限來源。

### 4. Authentication、release 與驗證 `[>]`

程式已完成 recovery 中繼確認頁：GET 不消耗 OTP，使用者明確確認後才驗證並建立短效
HttpOnly recovery marker；公開失敗 redirect 也已固定在 allow-listed origin。

仍缺：用專用 staging 測試帳號收到一封新的 recovery email，完成「點信 → 確認 → 更新密碼 →
重新登入」的真實驗收。不能以單元測試或本機 Mailpit 代替這項外部驗收。

最新受保護的 staging Auth 設定同步 workflow `33348350584` 在第一次 Management API 請求失敗；
目前要先重新確認 GitHub `staging` environment 的 `SUPABASE_ACCESS_TOKEN` 是否仍有效，不能使用舊信件
或猜測 token。此 workflow 未完成前，不重新寄 recovery 信件。

### 5. Browser Smoke 與行動版 `[>]`

- 固定底部導覽的 clearance、巢狀路由 current state、四項導覽、互動入口已用本機 Chromium 驗收。
- production build server 關鍵 E2E：29 passed、1 skipped；skip 是 Android 不執行會寫入共享資料的
  訊息測試，屬測試設計。

仍缺：iOS Safari／真實 Android 裝置驗收；自動化 Chromium 不能取代實機結論。
本次掃描也未把仍在執行中的 GitHub Browser Smoke run 當成已通過。

### 6. 出席率只計例會 `[x]`

`20260824000200_attendance_regular_meetings_only.sql` 已在 canonical Attendance 的統計函式加入
`event_type = 'regular_meeting'` 規則，並補上非例會但 `counts_for_attendance=true` 的 verification。

### 7. 我的捐款扶輪年度篩選 `[x]`

`20260824000300_blessing_iou_my_rotary_year.sql` 已提供本人限定的年度 projection；`null` 是總計，
`0` 是目前扶輪年度，年度邊界為 7/1 到隔年 7/1。`/me` 已加入 selector 與 stale club fallback。

### 8. 社員名錄個人檔案 404 `[x]`

`20260824000100_member_directory_profile_occupation.sql` 已把 `occupation` 補進 profile projection，
並保留同社授權、隱私遮罩與 verification；從名錄開啟 profile 的回歸流程已涵蓋。

### 9. 導覽目前位置與固定列遮擋 `[x]`

已改為 segment-aware resolver：首頁只匹配 `/dashboard`，活動／社員／我的匹配其子路由；
固定列 clearance 與 320px click 測試已通過。

### 10. 首頁通知中心 `[x]`

`20260824000500_member_home_notifications.sql` 已在既有 member-home projection 加入 bounded
通知摘要與未讀數；只取本人收件、最多 3 筆、不回傳訊息 ID。`announcements_v09` 關閉時不顯示
通知內容或徽章。

### 11. 名錄「我的資料與隱私」位置 `[x]`

已使用名錄專屬 responsive header，桌機右上、窄版安全換列，按鈕至少 48px；320px／200% 字體與
無水平溢位測試已通過。

## 另外掃描到、但不在舊清單內的待辦

### 生日祝福徵集 `[x]`

生日 V2 核心已完成（新設定預設公開、年齡依出生年份同意顯示、同一作者同一壽星每日最多 10 則、
作者匿名投影與幹部可見）。徵集程式已完成：

- 每月批次與生日前 7 天排程；
- 每位社員每月最多一則自動邀約的公平分配與冪等鍵；
- 100 題平台題庫、社團題庫 CRUD、題目快照、同批次題目文字不重複與題庫不足時整批停止；
- 徵集任務、參與者、發布／隱藏／重新送出狀態、匿名公開牆與幹部管理介面；
- service-role-only scheduler、訊息通知冪等、feature flag EXECUTE 邊界與 verification。

已完成 staging 外部啟用與驗收：平台管理員透過受保護 CLI 開啟
`birthday_wishes_v2`、`birthday_wishes_collection_v1`；Render 與 GitHub staging 的
`BIRTHDAY_COLLECTION_SCHEDULER_SECRET` 已同步。current-main hosted acceptance `33345182984`
已驗證生日 V2 與徵集入口，排程 workflow `33345260361` 已成功呼叫 protected staging route。
歷史失敗 run `33121570908`／`33121704322` 保留作為啟用前的追蹤證據；M1 真人使用者測試仍是另一個待辦。

規格請看 [`BIRTHDAY_WISHES_V2_PLAN.md`](../mvp/BIRTHDAY_WISHES_V2_PLAN.md)。

### M1 五位使用者形成性測試 `[ ]`

需要安排實際社員／幹部測試，不以自動化測試代替產品訪談與觀察。

## 下一步順序

1. 重新確認 staging Management API token，成功同步 Auth 設定後，再做新的 recovery 信件全流程。
2. 由產品決定 GPS 的 `accuracy`／定位 age 政策，再補 server-side 規則與驗證；決定前不猜門檻。
3. 安排 iOS Safari、Android Chrome 與五位目標使用者的 staging 驗收。
4. 另行決定是否明確開啟 `announcements_v09`；功能完成不代表目前對社員公開。

## 本輪驗證證據

已在本機執行：

- 上一輪程式基線的 `npm test`：100 files、631 tests passed；本次只做進度與部署狀態掃描，未重跑本機完整測試。
- 上一輪程式基線的 `npm run typecheck`、`npm run lint`、`npm run build`：passed；本次未重跑。
- `npm run verify:db`：本機未完成，因 Docker／Supabase 沒有回應而停止；PR #86 的 CI database job 已通過 46 份 verification SQL，schema lint 只有既有 3 個 warning。
- `npm run check:migrations`：passed。
- `npm run check:db-verifications`：manifest covers all 46 SQL files。
- role shell：18/18 passed。
- production build 關鍵 role／互動／訊息 E2E：29 passed、1 skipped。
- `git diff --check`：本輪程式與文件修改通過。
- PR #93 的 CI、Quality 與 Browser Smoke：passed（PR checks run `33347745255`、`33347745250`、`33347745221`）。
- current `main` push CI：passed（run `33348357979`）；同一 SHA 的 Browser Smoke `33348357995` 掃描時仍在執行。

以上程式與資料庫結果為既有驗證證據；current-main 的 Staging Go-Live run `33121275958` 已完成
migration apply、部署 revision wait、HTTPS smoke 與 hosted member acceptance。現在 `/api/health` 仍回報
staging runtime `26520424b415`，而 `main` 已是 `d4e9e298`；生日 V2／徵集 hosted acceptance `33345182984`
與 protected scheduler `33345260361` 是針對前一個已部署程式版本的成功證據。不能把文件或主線 merge SHA
誤當成 staging runtime revision，也不能用歷史失敗 run 取代最新成功結果。
瀏覽器本機驗收因本機 Supabase 未啟動而未重跑，不能以單元／資料庫驗證代替。production 不在本輪範圍。
