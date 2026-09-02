# 交接筆記（2026-09-02）

> 先讀根目錄 `AGENTS.md`。權威來源是 GitHub `Leojung0823/rotary-platform-v2` 的 `main`。
> `/Users/leoj/Documents/Codex/2026-08-15/rotary/` 是舊快照，不在 git 裡，不能當基準。

## LINE OA 推播 staging 上線狀態（2026-09-03）

staging 執行版本 `67763b1`，`/api/health` 的 `issues` 與 `warnings` 都是空的。

已經在 staging 生效的：

- 訊息中心公告推播（`20260902000300`）與活動發布推播（`20260902000400`）。
- follow 事件自動配對（`20260902000200`，Codex 在平行分支完成，已審閱後整合）。
- 兩個旗標都已由平台管理員透過受保護 CLI 開啟：`line_oa_event_push_v1`、
  `line_oa_auto_pairing_v1`（CLI 一律送 `rollout=100`、單一環境，正好滿足自動配對要求的全量條件）。
- Render staging 已設 `LINE_OA_MODE=line`，以及 `LINE_OA_PANCHIAO_ELITE_CHANNEL_ACCESS_TOKEN`
  與 `LINE_OA_PANCHIAO_ELITE_CHANNEL_SECRET`（社代碼 `PANCHIAO-ELITE`）。
- **LINE Developers Console 的 webhook 已設定且 Verify 通過。** 這是整輪第一個
  「LINE 真的和平台講到話」的證據：它同時證明 webhook URL 可達、channel secret 的環境變數
  名稱與值正確，以及 HMAC-SHA256 驗章整條路可用。

**仍未完成**：實際送出一則 LINE 訊息並由真人收到。follower 配對與端對端推播驗收尚未執行。

### 部署過程中的兩個真實教訓

1. **加 feature flag key 要改六個地方，第七個是 CLI。** `scripts/set-feature-flags.mjs` 有自己的
   `IMPLEMENTED` 白名單，漏掉時的失敗點是「操作員已經在輸入密碼」，migration 早就部署完了。
   已補 `feature-flag-cli-security.test.ts` 的防回歸檢查。順帶發現
   `birthday_wishes_v1`、`message_board_v1`、`archive_handover_v1` 這三個已上線的 rollback key
   從來沒登記進 CLI，所以**目前無法用受保護 CLI 回滾留言板、文件中心或生日 V1**；已記入 TO-DO。

2. **Go-Live 曾在 `Trigger the protected staging deployment hook` 失敗一次**（run `33658380098`，
   `STAGING_DEPLOY_HOOK_REQUEST_FAILED`，15 秒逾時），但 `Apply remote migrations` **在那之前已經成功**。
   結果是資料庫比程式新。這次因為該 migration 純屬新增（可空欄位、index、兩個新 RPC、一個函式替換），
   舊程式不會呼叫新 RPC，所以是安全的，`/api/health` 也維持正常。
   用同一組 `expected_sha` 與 `plan_run_id` 重跑 Go-Live（run `33658883276`）即成功；
   migration 會自動跳過已套用的部分。**這個順序值得記住：migration 先於部署，失敗點在中間時資料庫會領先。**

## LINE OA 訊息推播接上真實 Messaging API（2026-09-02）

產品決定本輪先把**真實 Messaging API 接通**；事件驅動自動推播、Flex 圖文訊息與 webhook 自動配對
follower 排在後面。憑證狀態：已有 LINE OA 帳號，**channel access token 與 channel secret 尚未取得**，
所以本輪只做不需要憑證的程式、測試與文件。分支 `codex/line-oa-messaging-api`，起點 `main@9291584`。

**沒有新增 migration，沒有改任何 RPC／RLS，沒有動 LINE Developers Console，沒有修改 hosted 環境。**

已完成：

- `src/lib/line/messaging.ts` 真實模式的 provider 結果不再只有「成功或丟例外」：
  `credentials_rejected`（401／403）、`rate_limited`（429，保留 `Retry-After`）、
  `request_rejected`（其他 4xx）、`provider_unavailable`（5xx）與 `provider_timeout` 分開回報。
- 對 `api.line.me` 的請求加上 10 秒逾時，provider 不回應時 server action 不再無限等待。
- multicast 依 LINE 的 500 個 userId 上限自動分批；先前超過 500 位已配對社員的社整批會被退回。
- 429／5xx／逾時會重試一次，同一批沿用同一個 `x-line-retry-key`，所以重試不會重複發送；
  4xx 不重試。憑證被拒或達到額度上限時停止剩餘批次。
- 部分送達仍記在既有欄位裡：`delivery_status` 保持 `queued`／`sent`／`failed`／`mocked`，
  批次成敗放進 `payload_summary` 的 `batch_count`／`sent_batch_count`／`delivered_recipient_count`。
- 新增 `src/lib/line/oa-dispatch.ts`，讓 `src/app/line-oa-actions.ts` 與
  `src/app/api/v1/[...path]/route.ts` 共用同一套載入、送出與紀錄組裝；邊界測試會擋住任一方
  再直接呼叫 `sendLineOaMessage` 或 `readServerSecret`。這兩條路徑先前已經漂移：
  server action 支援標籤／社員鎖定，v1 路徑只會送給全部 following。
- 真實模式加上 localhost 防呆（mock 的 local-only 檢查的鏡像），避免開發機把真實訊息送給真實社員。
- `deployment-env.mjs` 在 `LINE_OA_MODE=line` 時要求
  `LINE_OA_<CLUB_CODE>_CHANNEL_ACCESS_TOKEN` 與對應 `_CHANNEL_SECRET` 成對存在且長度合理；
  檢查結果不回報社代碼或憑證值。mock 模式不受影響，所以現在的 staging 不會因此變成 degraded。
- 後台把新的 failure code 翻成可理解的中文提示，並提示查看推播紀錄。
- 新增 [`LINE_OA_MESSAGING_DEPLOYMENT_CHECKLIST.md`](../mvp/LINE_OA_MESSAGING_DEPLOYMENT_CHECKLIST.md)；
  先前只有 LINE Login 的檢查表。

### staging 已切換到真實 Messaging API（2026-09-02）

使用者已在 Render staging 設定 `LINE_OA_MODE=line` 與該社的 channel access token／channel secret。
Plan `33642182951`（sha `338c50c`）與 Go-Live `33644157634` 都已成功，staging 執行版本為
`338c50ca22ce`。部署後健康檢查：

```json
{"status":"ok","revision":"338c50ca22ce","checks":{"configuration":true,"database":true},
 "issues":[],"warnings":[]}
```

`warnings` 為空是這一輪的關鍵證據，它同時說明兩件事：`STAGING_LINE_OA_IS_MOCK` 不再成立，
所以 staging 確實是 `LINE_OA_MODE=line`；而且 `configuration` 仍為 true，代表本輪新增的憑證檢查
通過，也就是該社的 `..._CHANNEL_ACCESS_TOKEN` 與 `..._CHANNEL_SECRET` 成對存在且長度合理。
憑證缺一個的話 `configuration` 會變成 false、`issues` 會出現 `CONFIGURATION_INVALID`。

**但這還不是推播驗收。** 健康檢查只證明設定是通的，沒有證明任何訊息真的送到 LINE。
仍待：LINE Console 的 webhook 設定、至少一位已配對的 follower，以及實際送出一則訊息。

仍未完成、需要外部條件：

- ~~取得 channel access token 與 channel secret，並設進 Render staging 的該社環境變數。~~ **已完成（2026-09-02）**，見上。
- 在 LINE Developers Console 設定 webhook URL 與開啟 webhook。依 `AGENTS.md` 第 2 節，
  **更動 LINE channel 設定要先取得使用者同意**，本輪沒有動。
- staging 真實推播驗收：實際收到訊息、推播紀錄為 `sent` 且有 provider request id、
  `/api/health` 不再出現由 `STAGING_LINE_OA_IS_MOCK` 產生的 `DEPLOYMENT_WARNING`。
- 每月推播額度的超額行為要由產品決定；平台目前不會預先擋下超額送出。

本輪本機驗證（2026-09-02）：

```text
npm run typecheck                passed
npm run lint                     passed
npm test                         110 files / 705 tests passed
npm run build                    passed
npm run verify:db                47 verification SQL passed（exit 0，沒有新增 migration）
npm run check:migrations         passed
npm run check:db-verifications   47 files covered
git diff --check                 passed
full local Playwright E2E        170 passed、33 intentional skips、0 failed
line-oa-audience targeted E2E    2 passed（重新 build 後再跑一次）
```

完整 E2E 第一輪曾有 6 個失敗，全部是啟動時沒帶 `E2E_ADMIN_EMAIL`／`E2E_ADMIN_PASSWORD`
（`member-smoke`、`operator-invitation`、`password-recovery` 在 login helper 就丟錯）；
補上憑證後 8 passed、2 skipped，不是程式回歸。

`verify:db` 前要先 `scripts/configure-local-e2e-role-shells.mjs enabled` 再跑 fixture bootstrap：
`db reset` 後生日旗標預設關閉，`set_my_birthday_preference_v2` 的 `authenticated` EXECUTE 會被撤掉，
順序反了 fixture 會失敗。CI 的 browser-smoke workflow 就是這個順序。

## 幹部功能收斂到管理模式（2026-09-02）

本輪依 [`MANAGEMENT_MODE_SEPARATION_PLAN.md`](./MANAGEMENT_MODE_SEPARATION_PLAN.md) v2.1.5 實作，管理模式 runtime 已在
`main@9291584016ba0fb091f0115d5022d7bc0855834c` 部署並完成 staging 驗收；本機與 GitHub 回歸、一般 staging Go-Live，以及執行秘書 staging 專項 hosted acceptance 均已完成。使用者要求
本輪不手動 dispatch CI 與 Browser Smoke；兩者由同步到 `main` 後的既有 workflow 自動驗證。

已完成的程式範圍：

- 新增 `/clubs/{clubId}/birthday-collection`、`/clubs/{clubId}/archives`、`/clubs/{clubId}/events` 三個
  管理路由；三者都先驗證 UUID、指定社團、RPC 回傳社團與 `canManage/can_manage`，未通過就導向
  `/access-denied`，不渲染管理資料；沒有 `?mode=management` 時先正規化網址，避免管理面板出現在社員外殼。
- 抽出 `BirthdayCollectionManagement`、`ArchiveManagementPanel`、`EventManagementPanel`，管理表單與
  原本的 server action 共用；社員頁只保留社員操作／唯讀內容、通往管理模式的連結，並在入口旁說明
  幹部功能已移至社務管理模式。
- 舊的 `?mode=management` 收藏網址保留相容導向；管理 action、文件上傳完成後回到新的管理路由，不接受
  瀏覽器提供的 `returnUrl`；生日／封存操作會同時失效社員頁與新管理頁的快取。
- 管理第一層導覽固定為總覽、活動、出席（旗標開啟且有權限）、社員、訊息（旗標開啟且有權限）；生日、
  封存、IOU 等低頻功能改由總覽卡片依 `list_my_permissions(clubId)` 顯示。
- 權限 projection 使用 request-scoped、以 `clubId` 為 key 的 React cache；沒有新增 migration、沒有改
  RPC／RLS／Storage 授權規則。
- 本機 E2E fixture 的 enabled 情境補上 `archive_handover_v1`，並新增執行秘書從總覽進入生日徵集、封存
  建立／編輯／上傳，以及一般社員直開管理頁、跨社團 `clubId` 的拒絕測試路徑。
- `supabase/verification/archive_handover_security.sql` 已補齊封存管理流程的隔離驗證：十支管理 RPC 各有
  管理者成功、同社一般社員 `42501` 與跨社帳號 `42501` 的可回滾 fixture；另驗證失敗版本不可被完成、
  版本號仍連續，以及已封存項目不再出現在管理投影。
- 封存上傳 API 已在 Storage 回錯時移除唯一物件路徑、在檔案讀取／metadata finalize 失敗時標記版本失敗，
  並新增 7 項 route 測試覆蓋成功、失敗清理、跨社 `42501`、trusted Storage 不可用與跨站請求。

效能記錄：管理總覽依每個作用社別最多讀一次 permission projection，並以 request-scoped cache 重用；生日／
封存管理頁各以一次主要 projection 讀取，活動管理頁在權限通過後才並行讀取標籤、社員與封面 URL。查詢總數
與 TTFB 的前後比較本輪未量測，因此是否退步仍標記為「未量測」。

本輪驗證（隔離分支，2026-09-02 更新）：

```text
npm test                         109 files / 691 tests passed
npm run lint                     passed
npm run typecheck                passed
npm run build                    passed; 3 new management routes collected
npm run check:migrations         passed
npm run check:db-verifications   passed; 47 SQL files covered
git diff --check                 passed
E2E node --check / Playwright --list passed; 207 tests discovered
```

`supabase/verification/archive_handover_security.sql` 的新增 fixture 已隨完整 `npm run verify:db` 在本機資料庫
執行成功；它現在是本機資料庫通過證據的一部分，不再是只有靜態檔案的補強。
活動 verification 的有效呼叫也已全部明確傳入 `p_as_member`；歷史 migration 中的舊定義仍保留作為 migration
歷史，不代表目前 runtime overload。
`npm run verify:db` 已於 2026-09-02 完成：local database reset、schema lint 與全部 47 份 verification
均通過；schema lint 的 3 個既有 warning 未新增。本輪兩個 Browser Smoke 失敗案例已在本機回歸通過，完整
Browser Smoke `33614549502` 也已通過。新增驗收流程的 Staging Release `33634864876` 與 Staging Go-Live `33635029050` 已以
exact SHA `fe1a5cf1392f3eecb4411d1bac74c68e467cfeb5` 完成，staging health revision `fe1a5cf1392f`、`issues=[]`，
一般 hosted 社員驗收通過。其後最新的 Staging Release `33639237610`、Staging Go-Live `33639395650` 與執行秘書專項
`Staging Management Acceptance` `33639758501` 均以 exact SHA `9291584016ba0fb091f0115d5022d7bc0855834c` 完成；health
revision `9291584016ba`、`issues=[]`。執行秘書 hosted acceptance 已驗證無社籍 operator 可完成生日重跑與文件建立／上傳／編輯，且沒有執行不可逆交接確認。效能 TTFB 仍未量測；活動／活動封面仍待 staging 端到端驗收。

已新增並部署 `.github/workflows/staging-management-acceptance.yml` 與 [`STAGING_MANAGEMENT_ACCEPTANCE.md`](../deployment/STAGING_MANAGEMENT_ACCEPTANCE.md)。GitHub `staging` environment 的
`STAGING_TEST_OPERATOR_EMAIL`／`STAGING_TEST_OPERATOR_PASSWORD` 已設定；只確認 secret 名稱存在，不讀取或記錄值。workflow `33639758501` 已通過，因此第 11.2 節的生日／文件執行秘書 hosted acceptance 已完成。

## 生日祝福派發修復（2026-09-01）

**症狀**：社員看得到本月壽星，卻收不到祝福任務；排程回報 `skipped_count: 1`、其餘為 0。

**根因**：`current_can_manage_club()` 只認平台管理員與 `club_operator_permissions`（執行秘書）。社長與秘書
存在 `club_role_assignments`，該函式從不讀它，所以社長／秘書在**每一支生日管理 RPC** 都被擋下，排程
也找不到管理者而整社略過。這不只是排程問題，題庫、發布、審核、重跑全都受影響。

**修法**（`20260901000100`）：不動共用的 `current_can_manage_club()`——它與 provisioning 等領域共用，
在那裡放寬會授出遠超生日範圍的權限。改為新增 `current_can_manage_birthday_collection()`，它是
`current_has_club_permission(club, 'member.manage')` 的薄包裝；該權限鍵剛好等於社長＋秘書＋執行秘書，
且財務與一般社員從不持有。16 支生日函式由既有定義程式化擷取後只換權限呼叫，沒有重打。

排程改為在同社團內依序尋找執行秘書 → 社長 → 秘書，要求帳號有效、有 `auth_user_id`、角色路徑上社籍
有效、執行秘書路徑上權限未到期。**平台管理員在排程被刻意排除**：自動派發必須以該社真實幹部的身分執行。
找不到合格幹部仍然略過，但會回報 `skipped_reasons.no_active_birthday_manager`；原因以計數回報而非逐社
列出，因為這個結果會印進 CI log。

**派發時機**（`20260901000200`）：原本派發當月，1 號生日的壽星在生日當天才收到邀約，來不及寫。改為
**這個月派發下個月的批次**，1 號生日至少有整整一個月，月底生日接近兩個月。曾考慮滾動 30 天但否決：
它會讓同一個日曆月出現兩個生日月份的邀約，破壞「每位社員每個生日月份最多一則」這條產品規則。改用整月
平移可保留一批次對一個生日月份，配額因此完全不變。這也讓「明年」那組生日日期重新變成必要——十二月要
派發的是隔年一月。

**現況**：兩支 migration 都已通過 CI 的 database job（真實 Postgres + 47 個驗證 SQL），並已部署到
staging（runtime `2b0f68242f7c`，`/api/health` 的 `issues` 為空）。

**排程實測** run `33457645384`：

```json
{"status":"completed","generated_count":0,"notified_count":0,"skipped_count":1,
 "skipped_reasons":{"no_active_birthday_manager":1}}
```

**這是正確的略過，不是缺陷。** staging 的社團目前沒有任何有效的社長／秘書／執行秘書，所以自動派發沒有
可用的執行身分。要完成驗收還缺兩項 staging 測試資料：

1. 該社至少一位有效的社長或秘書（平台管理員可在 `/clubs/{clubId}/members/{membershipId}` 的「角色」表單指派）。
2. 至少一位**下個月**生日、且 `birthday_visibility_preferences` 為 `is_listed = true` 且
   `allow_wishes = true` 的社員。規格明訂既有沒有偏好列的社員維持不公開，所以舊資料不會自動符合。

補齊後手動觸發 `Birthday Collection Scheduler` 即可，預期 `generated_count > 0`、`skipped_count = 0`。

**上線前的缺口**：`.github/workflows/birthday-collection-scheduler.yml` 只有 `run-staging-scheduler`
一個 job，只打 `STAGING_BASE_URL`。**production 沒有對應排程**，正式上線後生日徵集不會自動跑，需要另做
production job、secret 與核准閘門。

## 交接給下一位代理（2026-08-31 staging Auth 修復輪）

這一輪只處理 staging Auth 同步失敗，沒有碰任何產品功能。接手前請先讀完這一節。

**已解決**：`Sync Staging Auth Redirect And Recovery Email` 從 8/4 之後就失敗，現已通過
（run `33400262734`）。原本卡住的是三個疊在一起的問題，前兩個一直遮住第三個：

1. 舊 Management API token 在 8/27 之後失效（8/27 的 Staging Release 還能用同一個 secret 跑
   `supabase link`，所以失效點在那之後）。
2. 重設時貼進 GitHub secret 的值夾帶非 ASCII 空白 `U+00A0`。`fetch` 會正規化 ASCII 空白，卻把
   `U+00A0` 原封送進 `Authorization` 標頭，hosted API 回 401。舊的防呆只擋 CR／LF，擋不到它。
3. 免費方案且使用預設郵件供應商時，Supabase 拒絕修改 email 範本，`PATCH /config/auth` 回 400。
   8/4 那次還是成功的，代表這個限制是之後才開始強制。

**行為改變**：`site_url`／`uri_allow_list` 與 email 範本現在分兩次 PATCH。先前兩者同包送出，範本欄位
造成的 400 會讓整包被丟棄——所以 staging 的 redirect **其實從未真正套用過**，這一輪才第一次生效並通過
嚴格驗證。範本那半邊若遇到「免費方案」這個特定 400，會記錄 `BLOCKED_BY_PLAN` 並讓 run 通過；**其他任何
400 仍然是紅燈**，這條邊界有單元測試釘住，不要為了讓 workflow 變綠而放寬它。

**已由產品決定暫時擱置**：接 custom SMTP 與 recovery email 範本同步都先不處理。理由是登入頁把
「使用 LINE 登入」放第一順位、平台密碼是次要路徑，預期會用到「忘記密碼」的社員極少，且登入頁已有
「聯絡社務管理員」的人工 fallback。

擱置期間請注意：redirect 正常，密碼重設流程可用；但信件仍是預設範本，`2ba8cda` 的 prefetch 防護
**尚未生效**，也**不要拿 recovery 信件當驗收證據**。`BLOCKED_BY_PLAN` 是預期輸出，**不要當成 bug 去修**。

重啟時機:production 上線前必須處理(預設寄信服務只寄給團隊成員)，或密碼登入比例上升。屆時替 staging
專案設定 custom SMTP 即可，範本同步會自動恢復嚴格驗證，**不需要改任何程式**。

**這一輪的 4 個 commit 都標了 `[skip ci]`**（`7e1a22b`、`8823f85`、`ead52e9`、`b49f0d7`），是使用者當下
的明確指示。本機已跑過 lint、typecheck 與 647 個測試全通過，但**這些 commit 沒有經過 CI 或 Browser
Smoke**。下次有任何高風險變更進 `main` 時，請讓完整 CI 跑一次把這段補回來。

**接手建議順序**：

1. ~~`Staging Release` → `Staging Go-Live`~~ **已完成**：plan `33403385635`、Go-Live `33403560211`
   均成功，staging runtime 已是 `9a0b0fcb959c`。下次部署時 `expected_sha` 一定要用
   `$(git rev-parse HEAD)`，不要手打。
2. ~~draft PR #40~~ **已於 2026-08-31 關閉**（base 過時、功能已在 `main`）；分支
   `feat/v0.9-announcements-notifications` 保留未刪。
3. `announcements_v09` 已對 **staging** 開啟（enabled、rollout 100%、僅 `staging`）；production 未開啟。
4. 仍未完成：iOS Safari／真實 Android 實機驗收，以及 M1 五位目標使用者形成性測試。實機驗收現在
   應一併涵蓋訊息中心。

**不在待辦內**：custom SMTP 與 recovery email 範本同步已由產品決定擱置（見上）。`BLOCKED_BY_PLAN`
是預期輸出，**不要主動去修**，也不要為了消除它而放寬斷言。

## 本次同步結果

目前權威 `main` 已合併 PR #77、PR #86、文件 PR #87／#88／#89、PR #91、PR #92 與 PR #93；閱讀時以 GitHub
`main` 的最新 commit 為準。PR #91 加入 staging Auth 設定同步流程，PR #92
同步功能目錄，PR #93 加入 CI／Browser Smoke 的變更範圍 gate。PR #86 修正台灣社團時區跨日造成的出席頁日期預設錯誤；
production 沒有修改。生日祝福 V2 與生日祝福徵集的程式、資料庫 migration、權限驗證、測試與文件均已進入 main。
staging runtime 已於 2026-08-31 透過 plan `33403385635`／Go-Live `33403560211` 部署到 `9a0b0fcb959c`，
`/api/health` 的 `issues` 為空，`DEPLOYMENT_WARNING` 是 staging 用 `LINE_OA_MODE=mock` 的預期警告。
該次 Go-Live 的 migration dry-run 回報 `Remote database is up to date.`，沒有待套用的 schema 變更。
注意此後若有新的文件 commit 進 `main`，runtime 會再次落後一個 commit；後續文件合併不代表 runtime 已部署。並保留原本的 Staging Release plan `33121197083`／Go-Live `33121275958` 證據。

PR #86 的 application、validate、database 與 Browser Smoke 均通過後以一般 merge 合併。生日專項 hosted acceptance
`33345182984` 已以程式 SHA `26520424b415` 通過，包含生日 V2 說明與祝福徵集入口。staging 平台管理員已透過受保護 CLI
開啟 `birthday_wishes_v2` 與 `birthday_wishes_collection_v1`；Render staging 與 GitHub staging secret 已同步。
排程 workflow `33361427466` 已成功通過，表示 protected scheduler route 的認證與執行均正常。

Auth 設定同步已修復，workflow `33399486309` 通過。原本 `33348350584` 的失敗是三個疊在一起的問題：舊
token 在 8/27 之後失效、重設時貼進 secret 的值夾帶非 ASCII 空白（U+00A0，`fetch` 會原封送進
Authorization 標頭，API 回 401），以及免費方案不允許修改 email 範本。腳本原本把所有失敗都收斂成同一個
`SUPABASE_MANAGEMENT_API_REQUEST_FAILED`，看不出 HTTP status，所以前兩個問題一直遮住第三個。

staging redirect（`site_url` 與 `uri_allow_list`）現已同步並嚴格驗證——先前 email 範本欄位造成的 400
會讓整包 PATCH 被丟棄，所以 redirect 其實從未真正套用。recovery email 範本仍被方案擋住，run log 會記錄
`BLOCKED_BY_PLAN`。在 staging 專案接上 custom SMTP 之前，信件仍使用預設範本，`2ba8cda` 的 prefetch 防護
尚未生效，因此**還不要把 recovery 信件當成驗收證據**。

## 已完成的主要切片

- 出席統計只計 `regular_meeting`。
- 社員名錄 profile 補回 `occupation`。
- 我的祝福 IOU 支援扶輪年度／總計篩選。
- 首頁 bounded notification projection 與訊息入口。
- `/me/security` 帳號安全分層與 recovery confirmation flow。
- 生日祝福 V2：新設定預設公開、年齡依同意顯示、同一作者同一壽星每日最多 10 則、作者匿名投影。
- 生日祝福徵集：每月批次、生日前 7 天排程、每位社員每月最多一則自動任務、100 題平台題庫、
  社團題庫 CRUD、題目快照、同批次題目不重複、題庫不足整批停止與可重試、發布／隱藏／重送、
  幹部管理、通知冪等、匿名公開牆與權限驗證。
- 社員固定四項導覽、首頁互動入口、幹部管理往返、巢狀路由 current state、名錄 responsive header。
- 非大版本文件修改的 CI／Browser Smoke 規則已進入 `main`：文件類變更只跑輕量 scope gate，程式／資料庫／部署等高風險變更仍完整檢查，分類失敗時 fail-open。

## 最近 migration

生日徵集的 forward-only migration 為 `20260824000700` 至 `20260824001700`；出席日期修正新增
`20260828000100_attendance_local_date_defaults.sql`。下次新增 migration 前仍須先
執行 `ls supabase/migrations/ | tail` 確認可用編號，不能憑記憶或修改已部署 migration。

新增資料表或 RPC 必須有 `supabase/verification/*.sql`，並登錄
`scripts/database-verification-files.txt`；verification 要測誰不能做什麼。

## 不可違反的資料與權限規則

1. 出席只使用 `20260811000100_attendance_domain_core.sql` 的 canonical authority；不要採用已關閉 PR #37 的
   `20260731000100_v08_attendance_management.sql`。
2. `list_club_events` 與 `list_my_event_page` 都需要第二個 boolean `p_as_member` 參數，舊單參數呼叫不存在。
3. mode、active-club cookie、導覽 visibility 只能作 UX；protected route、RPC、RLS 仍要自己授權。
4. GPS 不保存 raw coordinate 或 exact distance。產品已於 2026-08-31 決定**不設 accuracy 門檻**，
   只以 200 公尺距離判定；`accuracy` 不傳到伺服器，`maximumAge: 0` 已涵蓋定位新鮮度。理由見
   `docs/product/TO-DO-LIST.md` 第 1 節。**不要自行補上 accuracy 門檻**——那會誤傷室內 GPS 不準的
   社員，卻擋不到造假者（accuracy 同樣由手機端自報）。要濫用防護請強化動態 QR token。
5. 不要把登入狀態、角色、權限、社員名單或整個登入後首頁做公開快取。
6. `birthday_wishes_v2` 與 `birthday_wishes_collection_v1` 缺少明確 flag row 時必須維持關閉；
   scheduler 只接受 staging 的受保護呼叫，不能用 service role key 暴露給前端或一般 job。

## 仍未完成／需外部條件

- 生日祝福 V2 與徵集的程式、旗標、secret、staging 部署、hosted acceptance 與排程均已完成；不再有本輪
  birthday release blocker。歷史失敗 run `33121570908`／`33121704322` 保留作為設定前的追蹤證據。
- GPS accuracy 政策已於 2026-08-31 決定：不設門檻，維持 200 公尺距離判定。這一項已結案，不是待辦。
- recovery 的 Management API token 已修復、redirect 已同步；剩下的外部條件是替 staging 專案設定 custom
  SMTP（Resend 免費額度 3,000 封/月即足夠）。設定後 email 範本同步會自動恢復嚴格驗證，不需要再改程式。
  在那之前不要用 recovery 信件當驗收證據。
- iOS Safari／真實 Android 裝置驗收尚未做。
- M1 五位目標使用者形成性測試尚未安排。

## 驗證結果

本輪本機結果：

```text
npm test                         100 files / 631 tests passed
npm run typecheck                passed
npm run lint                     passed
npm run build                    passed
npm run verify:db                passed (2026-09-02; reset, lint, 47 verification SQL)
npm run check:migrations         passed
npm run check:db-verifications   47 files covered
git diff --check                 passed
targeted Browser regression       birthday collection passed; executive secretary archive upload passed
current management-mode Browser Smoke passed (run 33614549502; exact SHA 3a430687837f)
PR #86 Browser Smoke             passed (run 33120346924, 11m03s)
PR #86 CI database                passed (run 33120346988; 46 verification SQL)
PR #93 CI／Quality／Browser Smoke passed (runs 33347745255／33347745250／33347745221)
current main push CI              passed (run 33348357979)
previous management-mode Browser Smoke failed (run 33607348078; 172 passed / 2 failed / 2 flaky / 31 skipped); fixed by 3a43068
staging plan                      passed (run 33121197083)
staging Go-Live                   passed (run 33121275958)
staging birthday acceptance       passed (run 33345182984; V2 + collection enabled)
staging birthday scheduler        passed (run 33361427466; protected staging route)
staging Auth config sync           passed (run 33400262734; redirects verified,
                                  recovery template BLOCKED_BY_PLAN pending custom SMTP)
staging Auth fix commits           lint / typecheck / 647 tests passed locally;
                                  CI skipped by instruction ([skip ci])
staging plan (this round)          passed (run 33403385635; remote database up to date)
staging Go-Live (this round)       passed (run 33403560211; revision 9a0b0fcb959c,
                                  smoke + hosted member acceptance passed, issues empty)
```

`verify:db` 的 schema lint 仍有 3 個既有 warning：兩個 STABLE/VOLATILE 標記不一致，以及一個未使用
的 PL/pgSQL 變數；本輪沒有新增 warning。先前 Browser Smoke 的兩個失敗案例已在本機 Supabase 與
`localhost:3000` 回歸通過，完整 Browser Smoke `33614549502` 亦已通過；staging acceptance 與 production 不在目前已完成證據內。
