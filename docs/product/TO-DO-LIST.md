# Rotary Platform 待辦執行清單

更新日期：2026-08-27（Asia/Taipei）

權威來源：GitHub `Leojung0823/rotary-platform-v2` 的 `main`。本文件取代
`/Users/leoj/Documents/Codex/2026-08-23/rotary-platform-to-do-list/TO-DO-LIST.md`
的舊掃描結果；那份檔案屬於獨立 worktree，不是權威 repo 的版本。

狀態：`[x]` 已完成　`[>]` 程式完成、等待外部驗收　`[!]` 需要產品決定　`[ ]` 尚未開發

## 本輪結論

原待辦清單的 0、2–3、6–11 項，能在程式與本機環境完成的部分已完成；
GPS 只剩精度政策，密碼 recovery 只剩真實 staging 信件流程，Browser Smoke
只剩實機驗收。生日 V2 核心與生日祝福徵集程式已完成，PR #77 已合併，且 main
SHA `7b3db9794e8c272774c1a3a0edfa8edf34d8c079` 已完成 staging Go-Live；徵集仍待
確認 staging flag 狀態、同步 Render scheduler secret、重跑排程專項 workflow 與社員／幹部真人驗收。

## 逐項狀態

### 0. 掃描與工作邊界 `[x]`

- 已以權威 `main`、實際 migration、RPC、verification、TypeScript、測試和瀏覽器流程交叉確認。
- 已保留 PR #61 的 canonical Attendance；沒有採用已關閉 PR #37 的重複 authority。
- 所有新增資料庫 RPC／投影都有對應 verification SQL，並已登錄 manifest。

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

### 5. Browser Smoke 與行動版 `[>]`

- 固定底部導覽的 clearance、巢狀路由 current state、四項導覽、互動入口已用本機 Chromium 驗收。
- production build server 關鍵 E2E：29 passed、1 skipped；skip 是 Android 不執行會寫入共享資料的
  訊息測試，屬測試設計。

仍缺：iOS Safari／真實 Android 裝置驗收；自動化 Chromium 不能取代實機結論。

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

### 生日祝福徵集 `[>]`

生日 V2 核心已完成（新設定預設公開、年齡依出生年份同意顯示、同一作者同一壽星每日最多 10 則、
作者匿名投影與幹部可見）。徵集程式已完成：

- 每月批次與生日前 7 天排程；
- 每位社員每月最多一則自動邀約的公平分配與冪等鍵；
- 100 題平台題庫、社團題庫 CRUD、題目快照、同批次題目文字不重複與題庫不足時整批停止；
- 徵集任務、參與者、發布／隱藏／重新送出狀態、匿名公開牆與幹部管理介面；
- service-role-only scheduler、訊息通知冪等、feature flag EXECUTE 邊界與 verification。

仍待：由 staging 管理員透過受保護流程確認／開啟 `birthday_wishes_collection_v1`，並先修正
Render 應用程式端與 GitHub 的 `BIRTHDAY_COLLECTION_SCHEDULER_SECRET` 不一致問題。手動執行的
排程 run `33117785366` 回傳 `401 unauthorized`，因此尚不能證明旗標或徵集商業流程已有效執行；
修正後還要重跑排程、徵集入口 hosted smoke，以及社員與幹部真人驗收。

規格請看 [`BIRTHDAY_WISHES_V2_PLAN.md`](../mvp/BIRTHDAY_WISHES_V2_PLAN.md)。

### M1 五位使用者形成性測試 `[ ]`

需要安排實際社員／幹部測試，不以自動化測試代替產品訪談與觀察。

## 本輪驗證證據

已在本機執行：

- `npm test`：100 files、631 tests passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run build`：passed。
- `npm run verify:db`：45 份 verification SQL passed；schema lint 只有既有 3 個 warning。
- `npm run check:migrations`：passed。
- `npm run check:db-verifications`：manifest covers all 45 SQL files。
- role shell：18/18 passed。
- production build 關鍵 role／互動／訊息 E2E：29 passed、1 skipped。
- `git diff --check`：本輪程式與文件修改通過。

以上程式與資料庫結果為本機證據；Staging Go-Live run `33028548354` 已以 exact main SHA
完成 migration apply、部署 revision wait、HTTPS smoke 與 hosted member acceptance，但
生日徵集專項 run `33117785366` 在 route 驗證階段回傳 `401 unauthorized`（GitHub secret 與
Render 應用程式端 secret 不一致或缺失），尚未完成有效的徵集 workflow；不能把這次失敗當成
旗標或業務流程通過。瀏覽器本機驗收因本機 Supabase 未啟動而未重跑，不能以單元／資料庫驗證代替。production 不在本輪範圍。
