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
本輪管理模式分離已在隔離分支完成程式搬遷，本機資料庫、GitHub CI、完整 Browser Smoke 與兩個失敗案例回歸均通過；
staging 驗收與部署仍待完成。

本輪新增 LINE OA 訊息推播的工作：既有的手動推播、webhook 驗章與推播紀錄都已在 `main`，
但 `LINE_OA_MODE` 一直是 `mock`，真實 Messaging API 從未送出過訊息。本輪先補真實模式的
錯誤分類、逾時、multicast 分批、憑證環境檢查與部署檢查表；憑證與 hosted 驗收仍待外部條件。

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

### LINE OA 訊息推播（真實 Messaging API）`[>]`

產品決定（2026-09-02）：本輪先把**真實 Messaging API 接通**，事件驅動推播、Flex 圖文與 webhook
自動配對排在後面。憑證狀態：已有 LINE OA 帳號，channel access token／secret **尚未取得**，
所以本輪只做「不需要憑證就能完成」的程式、測試與文件，hosted 驗收留待憑證到位。
**下面「本輪要做」的九項程式與文件已完成**，憑證與 hosted 驗收仍未完成。

#### 現況（已在 `main`，不是待辦）

- `src/lib/line/messaging.ts`：broadcast／multicast／push／reply 與 webhook HMAC-SHA256 驗章。
- `/clubs/[clubId]/line-oa`：OA 設定、webhook URL、手動配對 follower、手動發送純文字訊息
  （可用標籤／社員鎖定對象，經 `resolve_club_audience`）、推播紀錄。
- `/api/line-oa/webhook/[clubId]`：驗章、256KB／100 events／120 req-per-min 上限與冪等。
- `record_line_push` RPC 需要 `oa.manage`，並寫入 `line_push_logs` 與 `audit_logs`。
- 各社憑證只從 server 環境變數讀取，key 命名為
  `LINE_OA_<CLUB_CODE>_CHANNEL_ACCESS_TOKEN` 與 `LINE_OA_<CLUB_CODE>_CHANNEL_SECRET`，不入庫、不進瀏覽器。

**但 `LINE_OA_MODE` 預設 `mock`，staging 也是 `mock`；真實 Messaging API 從未實際送出過任何一則訊息。**
`/api/health` 目前的 `DEPLOYMENT_WARNING` 就是由 `deployment-env.mjs` 的 `STAGING_LINE_OA_IS_MOCK` 產生。

#### 本輪已完成（不需要憑證）`[x]`

1. `[x]` **真實模式的錯誤分類**。原本非 2xx 一律 `throw`，全部記成 `provider_error`。
   現在分成 `credentials_rejected`（401／403）、`rate_limited`（429，保留 `Retry-After`）、
   `request_rejected`（其他 4xx）、`provider_unavailable`（5xx）與 `provider_timeout`，
   並寫進 `line_push_logs.failure_code` 與後台的錯誤提示。
2. `[x]` **fetch 逾時**。對 `api.line.me` 的請求加上 10 秒 `AbortSignal.timeout`，
   provider 不回應時不再讓 server action 一直掛著。
3. `[x]` **multicast 分批**。單次最多 500 個 userId（`MULTICAST_RECIPIENT_LIMIT`），
   超過會自動分批；先前超過 500 位已配對社員的社整批會被 LINE 退回。
4. `[x]` **重試沿用同一個 `x-line-retry-key`**。429／5xx／逾時會重試一次，
   同一批用同一個 retry key，所以重試不會造成重複發送；不可恢復的 4xx 不重試。
   憑證被拒或達到額度上限時會停止剩下的批次，不再把配額打完。
5. `[x]` **部分成功的紀錄方式**。`line_push_logs.delivery_status` 仍只有
   `queued`／`sent`／`failed`／`mocked`，改以 `payload_summary` 記錄
   `batch_count`／`sent_batch_count`／`delivered_recipient_count`。**沒有新增 migration。**
6. `[x]` **`deployment-env.mjs` 補憑證檢查**。`LINE_OA_MODE=line` 時要求
   `LINE_OA_<CLUB_CODE>_CHANNEL_ACCESS_TOKEN` 與對應的 `_CHANNEL_SECRET` 成對存在且長度合理；
   檢查結果不會回報社代碼或憑證值。mock 模式不受影響。
7. `[x]` **真實模式的 localhost 防呆**。`NEXT_PUBLIC_SITE_URL` 指向 `localhost`／`127.0.0.1` 時
   拒絕呼叫真實 API，避免開發機把真實訊息送給真實社員（mock 的 local-only 檢查的鏡像）。
8. `[x]` **收斂兩條重複的推播路徑**。新增 `src/lib/line/oa-dispatch.ts`，
   `src/app/line-oa-actions.ts` 與 `src/app/api/v1/[...path]/route.ts` 共用同一套
   帳號／follower／憑證載入、送出與推播紀錄組裝；邊界測試會擋住任一方再直接呼叫
   `sendLineOaMessage` 或 `readServerSecret`。
9. `[x]` **測試與文件**。`messaging.test.ts` 補 10 個案例（分類、分批、重試同 key、
   不重試 4xx、逾時、access token 不外流）；`oa-dispatch.test.ts` 補紀錄組裝與共用邊界；
   `deployment-env.test.ts` 補憑證成對檢查與不洩漏社代碼。文件新增
   [`LINE_OA_MESSAGING_DEPLOYMENT_CHECKLIST.md`](../mvp/LINE_OA_MESSAGING_DEPLOYMENT_CHECKLIST.md)。

#### 需要外部條件，本輪不能做

- `[x]` 取得該社的 **channel access token 與 channel secret**（LINE Developers Console → Messaging API channel）。**已完成（2026-09-02）**。
- `[ ]` 在 **LINE Developers Console 設定 webhook URL** 為
  `<站台>/api/line-oa/webhook/<clubId>` 並啟用 webhook、關閉自動回覆訊息。
  依 `AGENTS.md` 第 2 節，**更動 LINE channel 設定需要事先取得你的同意**，我不會自己動。
- `[x]` 在 Render staging 設定 `LINE_OA_MODE=line` 與該社的兩個環境變數，重新部署。
  **已完成（2026-09-02）**：Go-Live `33644157634` 後 staging 執行 `338c50ca22ce`，
  `/api/health` 的 `issues` 與 `warnings` 都是空的，代表 mode 已是 `line` 且憑證成對檢查通過。
- `[ ]` **staging 真實推播驗收**：對測試 follower 送一則訊息，確認實際收到、推播紀錄為 `sent`、
  有 provider request id，且 `/api/health` 不再出現 `STAGING_LINE_OA_IS_MOCK` 警告。
- `[ ]` 確認你所在區域與方案的**每月推播額度**與超額行為，決定超額時要擋下還是照送。
- `[ ]` **production 憑證**：`deployment-env.mjs` 已強制 production 必須是 `LINE_OA_MODE=line`，
  沒有 production 憑證就無法部署 production。

#### 本輪驗證

typecheck、lint、`npm test`（110 檔／705 tests）、build、`npm run verify:db`（47 份、exit 0、
沒有新增 migration）、`check:migrations`、`check:db-verifications`、`git diff --check` 全部通過；
完整本機 Playwright 170 passed、33 刻意 skip、0 failed，`line-oa-audience` 在重新 build 後再跑 2 passed。
第一輪的 6 個失敗是啟動時缺 `E2E_ADMIN_EMAIL`／`E2E_ADMIN_PASSWORD`，補上後 8 passed、2 skipped。

#### 設定時發現的缺口 `[ ]`

- `[x]` **Follower 表格沒有配對控制項**（2026-09-03 已修）。webhook 送進來的 follower 是未配對的，
  但那一列只有「解除 OA 配對」，而表格把 OA userId 截斷顯示，所以幹部得回 LINE Console 抄完整
  ID 才配得了。現在未配對的列可以直接下拉選社員完成配對；完整 ID 本來就在伺服器端，不用新增 migration。

- `[ ]` **「尚未加入官方帳號」文案誤導**。畫面說的是「平台沒有配對紀錄」，不是「這個人沒加好友」。
  已經加了好友但還沒配對的人看到這句，只會以為自己加錯了。應改成「尚未與平台配對」之類的說法。

- `[ ]` **設錯社的 OA 帳號無法從畫面移除**。`configure_line_oa` 支援 `disabled` 狀態，但後台沒有
  對應的操作，設錯社之後那筆資料只能留著（沒有對應環境變數，所以會 fail closed，不會誤送）。

- `[ ]` **旗標 CLI 不認得三個已上線的 rollback key**：`birthday_wishes_v1`、`message_board_v1`、
  `archive_handover_v1` 不在 `scripts/set-feature-flags.mjs` 的 `IMPLEMENTED` 裡，
  所以**沒辦法用這支受保護的 CLI 回滾留言板、文件中心或生日 V1**。
  直接加進 `IMPLEMENTED` 會連帶讓 `--all-implemented` 把它們打開，那是「開啟」不是「可回滾」，
  兩件事需要分開的分類才對。`feature-flag-cli-security.test.ts` 已把這三個記成已知缺口，
  新增第四個沒登記的 key 會讓測試失敗。

- `[ ]` **後台沒有顯示該社要設定的環境變數名稱**。`/clubs/{clubId}/line-oa` 只說「由各社專屬的
  server environment key 讀取」，但沒有顯示是哪一個 key，設定的人得自己從 club code 推算
  （`LINE_OA_<CLUB_CODE 大寫、非英數字換底線>_CHANNEL_ACCESS_TOKEN` 與 `_CHANNEL_SECRET`）。
  `line_oa_accounts.access_token_env_key`／`webhook_secret_env_key` 存的是**變數名稱不是 secret**，
  可以安全地投影給有 `oa.manage` 的幹部看。需要改 `get_line_oa_admin` 的投影並補 verification，
  所以會有一個新的 migration，不併進本輪。

#### 本輪明確不做（已排序在後）

- `[>]` **事件驅動自動推播：訊息中心公告已完成**（2026-09-02，分支 `codex/line-oa-event-push`）。
  幹部在訊息中心發布訊息後，會自動推播 LINE 給「被指定到、已配對 LINE、且兩個通知開關都開著」的社員。

  - 社員偏好沿用既有的 `notification_settings.line_enabled` 與 `club_announcements`，
    沒有新做偏好資料表；缺列視為預設開啟。
  - 收件人由 `list_club_message_line_targets` 在資料庫解析，**不是**拿該社全部 follower —
    指定對象的訊息不能外洩給沒被指定的人。
  - `line_push_logs.source_message_id` 加上 partial unique index，一則訊息只會推一次；
    重複送出或連點不會讓同一則公告推兩次（LINE 訊息無法收回）。
  - 推播紀錄用 `record_club_message_line_push`，權限是 `member.manage`（發訊息的同一個權限），
    不是 `oa.manage`。手動推播的 `record_line_push` 維持原樣不動。
  - 旗標 `line_oa_event_push_v1` 預設關閉，關閉時連 `authenticated` 的 EXECUTE 都撤掉。
  - **LINE 推播失敗不會讓訊息變成發送失敗**：訊息中心的資料列已經寫入，畫面另外提示推播結果。

  仍待：`npm run verify:db`（等 Codex 讓出本機資料庫）、staging 驗收。

- `[>]` **活動發布推播已完成**（2026-09-03，分支 `codex/line-oa-event-publish-push`）。
  掛在 `publish_club_event` 之後而不是建立時 —— 草稿還不是消息。
  授權用 `event.manage`（發布活動的同一個權限），不是訊息中心的 `member.manage`。
  收件人尊重活動本身的對象設定（沒有 audience 列＝全社），加上已配對、仍在追蹤、通知開關沒關。
  `line_push_logs.source_event_id` 有 partial unique index，一場活動只推一次。
  推播文字帶標題、時間（Asia/Taipei、24 小時制、含星期）與地點；推播失敗只改成另一個成功代碼，
  不會讓發布變成失敗。

- `[ ]` 事件驅動自動推播的**最後一個來源**：生日祝福徵集邀請。
  訊息中心與活動這兩條已經把資料庫權限、冪等與偏好的模式建立起來，照同一套接即可。
  注意生日徵集的通知目前走 `ensure_birthday_wish_collection_notification`（service-role scheduler），
  沒有登入使用者，所以推播紀錄需要一個 service-role 版本，跟前兩條的 `member.manage`／`event.manage` 不同。
- `[ ]` Flex 圖文訊息與訊息模板（`messaging.ts` 已支援 flex payload，後台只送純文字）。
- `[ ]` webhook `follow` 事件自動配對 follower，減少後台手動輸入 OA userId。

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
   已用 `localhost:3000` 在本機回歸通過；完整 Browser Smoke `33614549502` 與 GitHub CI 已通過，staging 執行秘書驗收與效能 TTFB 尚未完成。程式目前在隔離分支
   `codex/management-mode-separation`，待 staging 外部驗收後才可標記 `[x]`。

4. 安排 iOS Safari、Android Chrome 實機驗收，以及 M1 五位目標使用者形成性測試。實機驗收應一併涵蓋訊息中心。
5. 另行決定是否對 production 開啟 `announcements_v09`；staging 已開啟不代表 production 已公開。

6. **LINE OA 訊息推播接上真實 Messaging API** `[ ]`（2026-09-02 起進行中）

   產品決定先做這一段，事件驅動推播、Flex 圖文與 webhook 自動配對排在後面。
   完整項目見上面的〈LINE OA 訊息推播（真實 Messaging API）〉。程式與文件不需要憑證即可完成；
   staging 真實推播驗收要等 channel access token／secret 到位，且 LINE Console 的 webhook
   設定需要另外取得同意才會動。

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
- 本機針對先前 Browser Smoke 兩個失敗案例的回歸均通過；GitHub CI 與完整 Browser Smoke `33614549502` 已通過（本輪沒有手動 dispatch），staging acceptance 與部署仍待完成。

以上程式與資料庫結果為既有驗證證據；current-main 的 Staging Go-Live run `33121275958` 已完成
migration apply、部署 revision wait、HTTPS smoke 與 hosted member acceptance。現在 `/api/health` 仍回報
staging runtime `26520424b415`，而主線可能已在文件合併後前進；生日 V2／徵集 hosted acceptance `33345182984`
與 protected scheduler `33361427466` 是針對前一個已部署程式版本的成功證據。不能把文件或主線 merge SHA
誤當成 staging runtime revision，也不能用歷史失敗 run 取代最新成功結果。
瀏覽器本機驗收已在本機 Supabase 與 `localhost:3000` 完成兩個失敗案例回歸，GitHub 完整 Browser Smoke 也已通過；仍不能代替 staging
執行秘書驗收。production 不在本輪範圍。
