# Rotary Platform 待辦執行清單

更新日期：2026-09-11（Asia/Taipei）

權威來源：GitHub `Leojung0823/rotary-platform-v2` 的 `main`。本文件取代
`/Users/leoj/Documents/Codex/2026-08-23/rotary-platform-to-do-list/TO-DO-LIST.md`
的舊掃描結果；那份檔案屬於獨立 worktree，不是權威 repo 的版本。

狀態：`[x]` 已完成　`[>]` 程式完成、等待外部驗收　`[!]` 需要產品決定　`[ ]` 尚未開發

## 本輪結論

原待辦清單的 0、2–3、6–11 項，能在程式與本機環境完成的部分已完成；
GPS 精度政策已決定（不設 accuracy 門檻），密碼 recovery 已依產品決定擱置，Browser Smoke
只剩實機驗收。生日 V2 核心、生日祝福徵集、LINE OA 真實推播基礎與管理模式核心都已進入 `main`。
生日首頁通知修復與本輪 LINE／生日推播修補也已部署到 staging；產品 release `a8c1e55` 修正管理模式 hosted 驗收腳本的活動入口，後續 `e1ea85c` 再補上 LINE OA 自動配對的有效社籍日期窗口防護。

本輪又補上三個可在 repo 內完成的 LINE 缺口：webhook redelivery 雜湊穩定化、OA 後台安全顯示
環境變數名稱，以及生日徵集邀請的 LINE 推播路徑。這些修改已合併並部署到 staging；仍要做一次
生日邀請的實際送達驗收。

另補上 `line_oa_auto_pairing_v1` 共用旗標判斷的明確開啟要求（`68b12a5`）；main 已修正，尚未隨下一次 release 部署 staging。

LINE OA 的 staging 真實 Messaging API、訊息中心公告推播、活動發布推播與 webhook 基礎已完成真人送達驗收；
follow 自動配對的程式與 flag 已完成，但「LINE Login identity 精確對上社員」仍需專門真人驗收。

截至 2026-09-11 的權威基準：本輪產品程式修補基準是 `68b12a56a21e02e08ece4c91644ec74cad9b70f9`；本次文件同步前的 `main` 文件 commit 是 `e5b2f51`；最新產品／staging runtime revision 是
`e1ea85c3e941528731c0b34b724296ffd0498946`；本輪新增 LINE OA 自動配對的有效社籍日期窗口防護。
staging `/api/health` 回報 revision `e1ea85c3e941`、`status=ok`、`issues=[]`、`warnings=[]`。
最新已部署 migration 是
`20260911000300_line_oa_pairing_membership_window.sql`。

本輪產品修補的完整 `CI` `34580607934`、`Browser Smoke` `34580600621`，以及本次修補的 Staging Release Plan `34580616980`、
Staging Go-Live `34580767172` 均成功完成；Go-Live 的 HTTPS smoke 與 hosted member acceptance 也通過。
之後 docs-only 文件同步的 `CI` `34583431760`、`Browser Smoke` `34583431873` 僅執行變更範圍分類器，完整 jobs 依 gate 跳過。
產品 release 的 Staging Release Plan `34576631319`、Staging Go-Live `34576829556` 與 Staging Management Acceptance
`34577046356` 亦已成功完成；執行秘書管理驗收也通過。
之後的 scheduler environment 隔離修正已推到 `main` commit
`6de28163e40bddd812bfc2c43a30fd43e04d006c`；CI `34573685666` 與 Browser Smoke `34573685718`
均成功。管理驗收第一次 run `34575792573` 是驗收腳本誤找不存在的活動卡片；修正為點第一層「活動」導覽後重跑成功。

`68b12a5` 的自動 `CI` `34584379642` 與對應 `Browser Smoke` `34584379653` 均已成功（Browser Smoke 完整流程與 rollback 檢查通過）。
新的 Staging Release Plan `34584648135` 正在等待 staging environment 人工核准，尚未部署這個旗標安全修補。
該 plan 建立時的 SHA 是 `802d913`；因目前 `main` 後續只有 docs-only commit，不能把它當成目前 `main` exact SHA 的 Go-Live plan。

生日旗標與 Render staging 的 scheduler secret 已由受保護流程設定；GitHub workflow 已改用獨立的
`birthday-scheduler` environment，但該環境目前尚未放入 scheduler secret。歷史 hosted acceptance
`33345182984` 與歷史成功排程 `33361427466` 均通過；但最新排程 run `34563427385` 目前 `pending`
且沒有 jobs，日常自動執行尚未證明。
production 沒有修改，目前沒有 open PR。

## 逐項狀態

### 0. 掃描與工作邊界 `[x]`

- 已以權威 `main`、實際 migration、RPC、verification、TypeScript、測試和瀏覽器流程交叉確認。
- 已保留 PR #61 的 canonical Attendance；沒有採用已關閉 PR #37 的重複 authority。
- 所有新增資料庫 RPC／投影都有對應 verification SQL，並已登錄 manifest。
- 掃描當下沒有 open PR；PR #40 已關閉，因 base 過時且公告功能已在 `main`，保留的舊分支不能直接合併。
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

### 生日祝福徵集（核心 `[x]`；排程營運 `[>]`）

生日 V2 核心已完成（新設定預設公開、年齡依出生年份同意顯示、同一作者同一壽星每日最多 10 則、
作者匿名投影與幹部可見）。徵集程式已完成：

- 每月批次與生日前 7 天排程；
- 每位社員每月最多一則自動邀約的公平分配與冪等鍵；
- 100 題平台題庫、社團題庫 CRUD、題目快照、同批次題目文字不重複與題庫不足時整批停止；
- 徵集任務、參與者、發布／隱藏／重新送出狀態、匿名公開牆與幹部管理介面；
- service-role-only scheduler、訊息通知冪等、feature flag EXECUTE 邊界與 verification。

已完成 staging 外部啟用與核心驗收：平台管理員透過受保護 CLI 開啟
`birthday_wishes_v2`、`birthday_wishes_collection_v1`；Render staging 的
`BIRTHDAY_COLLECTION_SCHEDULER_SECRET` 已設定。GitHub workflow 已改用獨立的
`birthday-scheduler` environment，但該環境目前尚未放入同名 secret。current-main hosted acceptance `33345182984`
已驗證生日 V2 與徵集入口，歷史排程 workflow `33361427466` 也曾成功呼叫 protected staging route。
但最新排程 run `34563427385` 目前為 `pending`、沒有 jobs。已查明原因是舊 workflow 綁在需要人工核准的 `staging` environment；每日 schedule 會先停在環境審核，不能把 staging 保護直接移除。現在 workflow 已改用只允許 `main` 的 `birthday-scheduler` environment，staging URL 已設定；新 environment 的 scheduler secret 尚未放入，仍要補入後再驗證實際執行。
歷史失敗 run `33121570908`／`33121704322` 保留作為啟用前的追蹤證據；M1 真人使用者測試仍是另一個待辦。

規格請看 [`BIRTHDAY_WISHES_V2_PLAN.md`](../mvp/BIRTHDAY_WISHES_V2_PLAN.md)。

### LINE OA 訊息推播（真實 Messaging API）`[>]`

產品決定（2026-09-02）：本輪先把**真實 Messaging API 接通**，事件驅動推播、Flex 圖文與 webhook
自動配對排在後面。現在 channel access token／secret 已設入 staging，真實 Messaging API、訊息中心公告、
活動發布與 webhook 基礎均已完成 staging 真人驗收；剩下的是 production 準備、額度政策與後續功能缺口。

#### 現況（已在 `main`，不是待辦）

- `src/lib/line/messaging.ts`：broadcast／multicast／push／reply 與 webhook HMAC-SHA256 驗章。
- `/clubs/[clubId]/line-oa`：OA 設定、webhook URL、手動配對 follower、手動發送純文字訊息
  （可用標籤／社員鎖定對象，經 `resolve_club_audience`）、推播紀錄。
- `/api/line-oa/webhook/[clubId]`：驗章、256KB／100 events／120 req-per-min 上限與冪等。
- `record_line_push` RPC 需要 `oa.manage`，並寫入 `line_push_logs` 與 `audit_logs`。
- 各社憑證只從 server 環境變數讀取，key 命名為
  `LINE_OA_<CLUB_CODE>_CHANNEL_ACCESS_TOKEN` 與 `LINE_OA_<CLUB_CODE>_CHANNEL_SECRET`，不入庫、不進瀏覽器。

staging 目前為 `LINE_OA_MODE=line`，`/api/health` 的 `warnings=[]`；真實推播已在 2026-09-03 驗收，
包括訊息中心公告與活動發布送達真人 LINE。production 仍未修改。

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
- `[x]` 在 **LINE Developers Console 設定 webhook URL** 為
  `<站台>/api/line-oa/webhook/<clubId>` 並啟用 webhook、關閉自動回覆訊息。
  **2026-09-03 已設定並 Verify 通過，且已完成真實 follow／公告／活動推播驗收。**
- `[x]` 在 Render staging 設定 `LINE_OA_MODE=line` 與該社的兩個環境變數，重新部署。
  **已完成（2026-09-02）**：Go-Live `33644157634` 後 staging 執行 `338c50ca22ce`，
  `/api/health` 的 `issues` 與 `warnings` 都是空的，代表 mode 已是 `line` 且憑證成對檢查通過。
- `[x]` **staging 真實推播驗收（2026-09-03 通過）**：webhook 收到 follow 事件、follower 自動
  出現在後台、訊息中心公告實際送達真人的 LINE。`/api/health` 的 `warnings` 已為空。
  卡關原因是 LINE Official Account Manager「回應設定」裡的 Webhook 開關預設關閉，
  而 Developers Console 的 Verify 在它關著時仍會成功。
- `[ ]` 確認你所在區域與方案的**每月推播額度**與超額行為，決定超額時要擋下還是照送。
- `[ ]` **production 憑證**：`deployment-env.mjs` 已強制 production 必須是 `LINE_OA_MODE=line`，
  沒有 production 憑證就無法部署 production。

#### 本輪驗證

typecheck、lint、`npm test`（110 檔／705 tests）、build、`npm run verify:db`（47 份、exit 0、
沒有新增 migration）、`check:migrations`、`check:db-verifications`、`git diff --check` 全部通過；
完整本機 Playwright 170 passed、33 刻意 skip、0 failed，`line-oa-audience` 在重新 build 後再跑 2 passed。
第一輪的 6 個失敗是啟動時缺 `E2E_ADMIN_EMAIL`／`E2E_ADMIN_PASSWORD`，補上後 8 passed、2 skipped。

#### 設定時發現的缺口

- `[x]` **webhook 冪等的 payload hash 會把合法重送誤判成竄改**（本輪已修）。
  `claim_line_webhook_event` 比對的 `payload_hash` 是**整個 request body** 的 SHA-256，
  但 LINE 重送同一個事件時會帶 `deliveryContext.isRedelivery: true`（原本是 `false`），
  body 因此不同、hash 也不同，同一個 `webhookEventId` 會撞上
  `webhook_event_payload_mismatch` 並回 409。

  現在 HMAC 仍驗證原始 body，但雜湊只忽略 `deliveryContext.isRedelivery`，其他事件內容與其他
  delivery metadata 仍會改變雜湊；因此合法重送不會誤判，內容被改寫仍會被拒絕。這只對修正後
  新收到的 webhook 生效；舊資料只保存舊版 raw hash，無法在不放寬竄改檢查的前提下回算，
  舊事件的失敗重送仍需人工處理。

- `[x]` **Follower 表格沒有配對控制項**（2026-09-03 已修）。webhook 送進來的 follower 是未配對的，
  但那一列只有「解除 OA 配對」，而表格把 OA userId 截斷顯示，所以幹部得回 LINE Console 抄完整
  ID 才配得了。現在未配對的列可以直接下拉選社員完成配對；完整 ID 本來就在伺服器端，不用新增 migration。

- `[x]` **「尚未加入官方帳號」文案誤導**（本輪已修）。現在寫成「尚未與本社 LINE OA 完成配對」，
  對應實際的資料狀態，不把「已加好友但尚未配對」說成「沒加好友」。

- `[x]` **設錯社的 OA 帳號無法從畫面移除**（2026-09-03 已修）。OA 設定卡片加了「停用這個 OA 帳號」，
  呼叫既有的 `configure_line_oa` 傳 `disabled`（不用新 migration，資料庫本來就支援）。
  停用後 `get_line_oa_admin` 不再投影該列，頁面回到未設定狀態，重新儲存即可再次啟用。
  原本的風險是：殘留的設定在有人建立剛好同名的環境變數時會突然變成活的。

- `[x]` **旗標 CLI 不認得三個已上線的 rollback key**（2026-09-03 已修）：`birthday_wishes_v1`、`message_board_v1`、
  `archive_handover_v1` 不在 `scripts/set-feature-flags.mjs` 的 `IMPLEMENTED` 裡，
  所以**沒辦法用這支受保護的 CLI 回滾留言板、文件中心或生日 V1**。
  一份清單被當成兩種用途。已拆成 `TOGGLEABLE`（CLI 認得、可以關掉的全部 key）與
  `BULK_ENABLE`（`--all-implemented` 會打開的 key）；三個 rollback key 進前者、不進後者。
  測試會確認 `BULK_ENABLE` 是 `TOGGLEABLE` 的子集、三個 rollback key 在前者不在後者，
  以及 CLI 認得程式宣告的每一個 key。

- `[x]` **後台沒有顯示該社要設定的環境變數名稱**（本輪已修）。新增
  `20260911000100_line_oa_admin_env_keys.sql`，`/clubs/{clubId}/line-oa` 只投影
  `access_token_env_key`／`webhook_secret_env_key` 的名稱，不投影任何 token／secret 值；並以
  `line_oa_admin_env_keys_security.sql` 驗證同社權限、跨社隔離、一般社員拒絕與瀏覽器不能直讀資料表。

#### 本輪明確不做（已排序在後）

- `[x]` **事件驅動自動推播：訊息中心公告已完成**（2026-09-02，分支 `codex/line-oa-event-push`）。
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

  `npm run verify:db`、manifest 驗證與 staging 真人送達驗收均已完成。

- `[x]` **活動發布推播已完成並驗收**（2026-09-03，分支 `codex/line-oa-event-publish-push`）。
  掛在 `publish_club_event` 之後而不是建立時 —— 草稿還不是消息。
  授權用 `event.manage`（發布活動的同一個權限），不是訊息中心的 `member.manage`。
  收件人尊重活動本身的對象設定（沒有 audience 列＝全社），加上已配對、仍在追蹤、通知開關沒關。
  `line_push_logs.source_event_id` 有 partial unique index，一場活動只推一次。
  推播文字帶標題、時間（Asia/Taipei、24 小時制、含星期）與地點；推播失敗只改成另一個成功代碼，
  不會讓發布變成失敗。**2026-09-03 已在 staging 端對端驗收：發布活動後推播實際送達手機。**

- `[>]` 事件驅動自動推播的**最後一個來源**：生日祝福徵集邀請。程式已完成
  `20260911000200_birthday_collection_line_push.sql`、scheduler route 串接、service-role-only
  收件人投影／推播紀錄、既有 `line_oa_event_push_v1` 明確啟用閘門與單元測試；migration
  已部署到 staging，仍待 staging 實際收到邀請 LINE 的驗收。通知目前由
  `ensure_birthday_wish_collection_notification`（service-role scheduler）建立，沒有登入使用者，
  所以特別使用 service-role 版本，不擴大前兩條 `member.manage`／`event.manage` 的權限。
- `[ ]` Flex 圖文訊息與訊息模板（`messaging.ts` 已支援 flex payload，後台只送純文字）。
- `[>]` webhook `follow` 事件自動配對 follower 的 migration、route、verification、flag、日期窗口防護與 staging 部署已完成；
  共用旗標判斷的 fail-closed 修補已在 main 完成，尚待 staging 部署；仍待用「曾以 LINE Login 登入的社員加入同一社 OA」驗證精確 identity pairing，以及多社／外社／停權／退社實例。

### 雙重社籍與跨社執行秘書 `[>]`

產品決定（2026-09-03）：**同一個人可以同時在多個扶輪社有有效社籍，也可以在擔任社員的同時
擔任執行秘書**（本社或他社）。原本的「有效社友不能當執行秘書」規則已移除。

`20260903000100_allow_operator_membership.sql`：

- 移除四個 provisioning RPC 裡的 `active_member_cannot_be_operator` 檢查。
  這四處只是提前給出好看的錯誤，**真正的把關者是兩個 trigger**，
  `club_memberships_prevent_operator_overlap` 與 `club_operator_permissions_prevent_member_overlap`，
  兩個都已刪除（連同它們的函式，避免被重新掛上）。
- **修掉移除互斥後才會出現的破洞**：`resolve_my_experience_context` 的 `member_clubs.can_manage`
  原本只看社長／秘書／財務的角色指派。同時是某社社員又是該社執行秘書的人，會被投影成
  `can_manage=false` 的一般社員，而且因為已在 `member_clubs` 而被排除於 `managed_only_clubs`
  之外，**管理外殼會整個消失**。現在 `can_manage` 也認 `club_operator_permissions`。
- 資料模型本來就允許雙重社籍：唯一索引是 `(club_id, person_id)`，沒有跨社數量限制。

驗證：`operator_membership_coexistence_security.sql` 測雙重社籍、跨社執行秘書、名錄不重複、
`can_manage` 不會遺失、**以及社籍不會憑空變成管理權限**。
`core_identity_baseline.sql` 與 `provisioning_security.sql` 的舊斷言已改成驗證新的不變條件，
不是刪掉：baseline 現在斷言那兩個 trigger 與其函式**不存在**，重新掛上會失敗。

切換社別不需要新做：側欄本來就有收合式的 `ClubSwitcher`（兩次點擊），
`member_clubs` 也本來就會投影全部社籍，只是先前不可能有多社社員所以沒人走到。
只更新了那段寫著「membership and operator status are mutually exclusive」的過時註解與畫面文案。

程式已合併至 `main`，並包含在目前 staging runtime；仍待多社社員、外社社員、停權／退社與跨社執行秘書的真人操作驗收。

### M1 五位使用者形成性測試 `[ ]`

需要安排實際社員／幹部測試，不以自動化測試代替產品訪談與觀察。

## 下一步順序

1. **先處理生日 scheduler 的營運狀態** `[>]`：workflow 已改用只允許 `main` 的 `birthday-scheduler` environment，staging URL 已設定；目前還缺該 environment 的 scheduler secret。下一步補入必要 secret，再確認下一次真的呼叫 protected staging route；不要移除 staging 部署保護。歷史成功 run `33361427466` 只能證明當時成功。
2. **完成 LINE OA follow 自動配對真人驗收** `[>]`：程式已在 `main`／staging，仍要由一位曾以 LINE Login 登入的社員加入同一社 OA，確認後台自動顯示正確姓名；另測多社、外社、停權／退社不會誤配。
3. **完成管理模式 hosted 驗收** `[x]`：執行秘書已從管理總覽完成生日重跑、文件建立／上傳／編輯，以及活動建立、封面上傳、發布與取消（run `34577046356`）。
4. **補量測管理頁 TTFB** `[>]`：目前只有未登入 `/login` 的 Chrome lab 數字；管理頁需要登入狀態，仍待用受保護測試帳號量測前後差異。
5. **安排 iOS Safari、Android Chrome 與 M1 五位目標使用者測試** `[ ]`；實機與訪談不由自動化 Chromium 取代。
6. **準備 production** `[!]`：另做 production 生日 scheduler job／secret／核准閘門，取得 production LINE 憑證並決定額度政策，另行決定是否開啟 production `announcements_v09`。
7. **後續 LINE OA 缺口**：webhook redelivery payload hash、生日邀請 LINE 推播、後台顯示環境變數名稱的程式修補已完成並部署；仍未完成的是生日邀請實際送達、Flex 模板、推播額度政策，以及 follow 配對真人驗收。
8. **Recovery email 維持暫緩** `[!]`：custom SMTP 與真實 email flow 只有在 production 上線或密碼登入比例上升時重啟。

## 歷史驗證證據（管理模式輪，2026-09-02）

管理模式分離隔離分支已在本機執行：

- `npm test`：108 files、683 tests passed。
- `npm run typecheck`、`npm run lint`、`npm run build`：passed。
- `npm run check:migrations`：passed。
- `npm run check:db-verifications`：manifest covers all 47 SQL files。
- `git diff --check`：passed。
- E2E `node --check` 與 Playwright `--list`：passed，207 tests discovered。
- `npm run verify:db`：本機 reset、schema lint 與全部 47 份 verification SQL 均通過；schema lint 只有既有 3 個 warning。
- 本機針對先前 Browser Smoke 兩個失敗案例的回歸均通過；GitHub CI 與完整 Browser Smoke `33614549502` 已通過（本輪沒有手動 dispatch）。以下 staging 文字是當時的歷史狀態，不能覆蓋本文件前面的最新掃描。

以上程式與資料庫結果為既有驗證證據；當時的 Staging Go-Live 已完成 migration apply、部署 revision wait、HTTPS smoke 與 hosted member acceptance。生日 V2／徵集 hosted acceptance `33345182984` 與 protected scheduler `33361427466` 也是歷史成功證據。

## 最新掃描證據（2026-09-11；本輪部署後基準）

- staging runtime revision 為 `e1ea85c3e941528731c0b34b724296ffd0498946`；main 另有尚未部署 staging 的旗標安全修補 `68b12a5`；沒有 open PR。
- staging health：revision `e1ea85c3e941`、`status=ok`、`issues=[]`、`warnings=[]`；與本次 Go-Live 的 exact SHA 相符。
- `20260911000300_line_oa_pairing_membership_window.sql` 已部署；active 但 `ended_on` 已過期的社籍不再可自動配對。
- 本次修補 push 後的 `CI` `34580607934`、`Browser Smoke` `34580600621`：以 `e1ea85c` 成功完成；先前產品 release 的 CI／Browser Smoke 亦已成功。
- Staging Release Plan `34580616980`、Staging Go-Live `34580767172`：以 `e1ea85c` 通過；migration apply、HTTPS smoke 與 hosted member acceptance 成功。
- Staging Management Acceptance `34577046356`：以 `a8c1e55` 通過；執行秘書完成生日、文件、活動與活動封面流程。
- 最新 Birthday Collection Scheduler `34563427385`：`pending`、無 jobs；每日自動排程目前未證明。
- 目前沒有 open PR；production 沒有修改。
