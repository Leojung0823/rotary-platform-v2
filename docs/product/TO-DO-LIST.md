# Rotary Platform 待辦執行清單

更新日期：2026-09-02（Asia/Taipei）

權威來源：GitHub `Leojung0823/rotary-platform-v2` 的 `main`。本文件取代
`/Users/leoj/Documents/Codex/2026-08-23/rotary-platform-to-do-list/TO-DO-LIST.md`
的舊掃描結果；那份檔案屬於獨立 worktree，不是權威 repo 的版本。

狀態：`[x]` 已完成　`[>]` 程式完成、等待外部驗收　`[!]` 需要產品決定　`[ ]` 尚未開發

## 本輪結論

原待辦清單的 0、2–3、6–11 項，能在程式與本機環境完成的部分已完成；
GPS 精度政策已決定（不設 accuracy 門檻），密碼 recovery 已依產品決定擱置，Browser Smoke
只剩實機驗收。生日 V2 核心與生日祝福徵集程式已完成，PR #77 已合併，出席日期修正 PR #86 也已合併。
本輪管理模式分離已在隔離分支完成程式搬遷，本機資料庫與兩個 Browser Smoke 失敗案例回歸均通過；完整 GitHub
自動檢查、staging 驗收與部署仍待完成。

目前權威來源是 GitHub `main`；staging `/api/health`
於 2026-08-31 掃描通過，執行版本已透過 plan `33403385635`／Go-Live `33403560211` 更新為
`9a0b0fcb959c2c9398c70e133ef5b04880998f16`，與當時的 `main` 一致。本輪的 Auth 設定同步修復、功能目錄與
CI 範圍規則都已隨這次部署上線。此後若再有 commit 進 `main`，runtime 會再度落後，屆時不能把主線內容說成已部署。
健康檢查的 `issues` 為空，`DEPLOYMENT_WARNING` 是 staging 的預期警告；production 沒有修改。
生日徵集的兩個旗標已由 staging 平台管理員透過受保護流程開啟，Render scheduler secret 已同步，
針對 `26520424b415` 的 hosted acceptance `33345182984` 與最新排程 workflow `33361427466` 均成功。

## 逐項狀態

### 0. 掃描與工作邊界 `[x]`

- 已以權威 `main`、實際 migration、RPC、verification、TypeScript、測試和瀏覽器流程交叉確認。
- 已保留 PR #61 的 canonical Attendance；沒有採用已關閉 PR #37 的重複 authority。
- 所有新增資料庫 RPC／投影都有對應 verification SQL，並已登錄 manifest。
- 目前只有一個 open PR：舊的 draft PR #40，base 是過時的出席分支；公告功能已在 `main` 實作，不能直接合併。
- PR #93 已加入 CI／Browser Smoke 的變更範圍 gate：低風險文件只跑輕量 gate，高風險程式／資料庫／建置／流程修改才跑完整檢查；分類失敗時 fail-open。

### 1. GPS Check-in `[x]`

已完成 200 公尺 server-side 距離判定、fresh browser location、QR／人工 fallback，且不保存
原始座標或精確距離。

**產品已於 2026-08-31 決定：不設 `accuracy` 門檻，只以 200 公尺距離判定。** 前端沿用
`{ enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }`，`maximumAge: 0` 已強制每次重新定位，
因此「定位 age」不需要另設規則。`accuracy` 不傳到伺服器，契約維持現狀。

決定理由：

- **門檻擋不到作弊。** 座標由手機端送出，`accuracy` 由同一個手機端送出。要造假的人可以同時聲稱
  「座標＝會場、accuracy＝5 公尺」，門檻對他零成本。
- **卻會誤傷誠實的人。** 例會多在飯店、餐廳等室內場地，室內 GPS 誤差常達 50–500 公尺，設門檻會拒絕
  真的在現場的社員，形成「誠實的人被擋、作弊的人通過」的最壞組合。
- **已有備援。** GPS 不準的社員仍可走 QR 掃碼或人工補登；`gps-security-boundary.test.ts` 已要求任一
  簽到方式單獨都要能用。
- **真正的防線是動態 QR token**，那部分已完成。

**不要因為「看起來少了驗證」就自行補上 accuracy 門檻**——那會推翻這個決定。若日後真的觀察到濫用，
應該強化動態 QR token 與簽到 session，而不是加 accuracy 規則。要改變這個決定需要新的產品決策。

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

staging Auth 設定同步已修復（run `33400262734`），redirect 已同步並通過嚴格驗證。

**recovery email 範本同步已由產品決定暫時擱置**，不是待修的缺陷。理由：登入頁把「使用 LINE 登入」
放在第一順位，平台密碼是分隔線下方的次要路徑，預期實際使用「忘記密碼」的社員極少；登入頁本身也已
提供「聯絡所屬扶輪社的社務管理員」的人工 fallback。

擱置期間的已知狀態與殘留風險：

- redirect 正常，密碼重設流程本身可用。
- 信件仍使用 Supabase 預設範本，因此 `2ba8cda` 的 prefetch 防護**尚未生效**；少數使用密碼登入
  又觸發忘記密碼的社員，連結有被郵件或防毒軟體提前消耗的可能。
- Supabase 預設寄信服務只寄得到專案團隊成員，所以無法對一般測試帳號完成真實信件驗收。

因此本節的「真實 recovery email 驗收」一併順延，不列為 release blocker。

**Auth 同步 workflow 出現 `BLOCKED_BY_PLAN` 是預期行為，不要當成 bug 去修**，也不要為了消除它而
放寬既有斷言——那條分支只接受「免費方案拒絕 email 範本」這一種 400，其餘 400 仍是紅燈。

需要重新啟動這件事的時機：

1. **production 上線前必須處理**——預設寄信服務只寄給團隊成員，production 無法運作。
2. 密碼登入比例上升，或有社員回報密碼重設失敗。

處理方式是替 staging 專案設定 custom SMTP（Resend 免費額度 3,000 封/月即足夠），設定後範本同步會
自動恢復嚴格驗證，不需要改任何程式。

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
已驗證生日 V2 與徵集入口，最新排程 workflow `33361427466` 已成功呼叫 protected staging route。
歷史失敗 run `33121570908`／`33121704322` 保留作為啟用前的追蹤證據；M1 真人使用者測試仍是另一個待辦。

規格請看 [`BIRTHDAY_WISHES_V2_PLAN.md`](../mvp/BIRTHDAY_WISHES_V2_PLAN.md)。

### M1 五位使用者形成性測試 `[ ]`

需要安排實際社員／幹部測試，不以自動化測試代替產品訪談與觀察。

## 下一步順序

1. ~~補齊生日派發的 staging 測試資料~~ **已完成驗收**（2026-09-01，run `33467004279`）：

   ```json
   {"generated_count":1,"notified_count":1,"failed_count":0,
    "skipped_count":1,"skipped_reasons":{"no_active_birthday_manager":1}}
   ```

   賽博ＡＩ扶輪社找到管理者、產生十月批次並送出通知。`skipped_count: 1` 是
   Rotary Platform Staging Test Club 尚未指派幹部，**這是驗收條件第 9 條要的正確略過，不是缺陷**。

   仍待人工確認一項：以該社十月壽星**以外**的社員登入，確認畫面上真的看得到任務、題目正確、可以填寫。
   資料庫層已回報產生與通知，但畫面呈現無法由排程結果證明。

   指派幹部時注意排程要求 `auth_user_id is not null`：只有真的能登入的社員才會被選為執行身分，
   匯入但從未建立登入帳號的社員即使畫面上指派了角色也不會被採用。
2. **上線前必辦**：生日徵集排程目前只有 `run-staging-scheduler` 一個 job，只打 `STAGING_BASE_URL`。
   production 沒有對應排程，正式上線後生日徵集不會自動派發，需要另做 production job、secret 與核准閘門。
3. **幹部功能一律收進管理模式，社員頁面不放幹部控制項** `[>]`

   產品決定（2026-09-01）。完整企劃見
   **[`docs/product/MANAGEMENT_MODE_SEPARATION_PLAN.md`](./MANAGEMENT_MODE_SEPARATION_PLAN.md)**，
   內含現況盤點、目標架構、逐頁執行內容、測試策略與驗收條件。

   已完成隔離分支的程式搬遷：三個管理路由、三個共用管理 panel、舊管理網址相容導向、管理 action 回程、
   權限投影快取與管理總覽卡片均已加入；沒有新增 migration，也沒有改 RPC／RLS。社員頁已移除管理表單，
   只保留社員操作／唯讀內容與管理模式連結。

   本輪本機驗證：108 個測試檔、683 tests passed；lint、typecheck、build、migration／verification manifest
   檢查、`npm run verify:db` 與 E2E 語法／清單檢查通過。先前 Browser Smoke 的生日題庫與執秘文件上傳失敗案例，
   已用 `localhost:3000` 在本機回歸通過；完整 Browser Smoke、staging 執行秘書驗收與效能 TTFB 尚未完成。程式目前在隔離分支
   `codex/management-mode-separation`，待 GitHub 自動檢查與外部驗收後才可標記 `[x]`。

4. 安排 iOS Safari、Android Chrome 實機驗收，以及 M1 五位目標使用者形成性測試。實機驗收應一併涵蓋訊息中心。
5. 另行決定是否對 production 開啟 `announcements_v09`；staging 已開啟不代表 production 已公開。

已結案、不在下一步內：staging Management API token 已修復且 Auth 設定同步通過（run `33400262734`）；
recovery email 範本與 custom SMTP 已由產品決定擱置；GPS accuracy 政策已決定不設門檻；
`announcements_v09` 已於 2026-08-31 對 staging 開啟（enabled、rollout 100%、僅 `staging`，production 未開啟）；
draft PR #40 已關閉，分支保留；生日派發的權限與提前一個月派發已修復並部署。

## 本輪驗證證據

管理模式分離隔離分支已在本機執行：

- `npm test`：108 files、683 tests passed。
- `npm run typecheck`、`npm run lint`、`npm run build`：passed。
- `npm run check:migrations`：passed。
- `npm run check:db-verifications`：manifest covers all 47 SQL files。
- `git diff --check`：passed。
- E2E `node --check` 與 Playwright `--list`：passed，207 tests discovered。
- `npm run verify:db`：本機 reset、schema lint 與全部 47 份 verification SQL 均通過；schema lint 只有既有 3 個 warning。
- 本機針對先前 Browser Smoke 兩個失敗案例的回歸均通過；本輪沒有手動 dispatch CI／Browser Smoke，完整 workflow、staging acceptance 與部署仍待完成。

以上程式與資料庫結果為既有驗證證據；current-main 的 Staging Go-Live run `33121275958` 已完成
migration apply、部署 revision wait、HTTPS smoke 與 hosted member acceptance。現在 `/api/health` 仍回報
staging runtime `26520424b415`，而主線可能已在文件合併後前進；生日 V2／徵集 hosted acceptance `33345182984`
與 protected scheduler `33361427466` 是針對前一個已部署程式版本的成功證據。不能把文件或主線 merge SHA
誤當成 staging runtime revision，也不能用歷史失敗 run 取代最新成功結果。
瀏覽器本機驗收已在本機 Supabase 與 `localhost:3000` 完成兩個失敗案例回歸，但不能代替完整 Browser Smoke 或 staging
執行秘書驗收。production 不在本輪範圍。
