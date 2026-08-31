# 交接筆記（2026-08-31）

> 先讀根目錄 `AGENTS.md`。權威來源是 GitHub `Leojung0823/rotary-platform-v2` 的 `main`。
> `/Users/leoj/Documents/Codex/2026-08-15/rotary/` 是舊快照，不在 git 裡，不能當基準。

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
2. GPS accuracy／定位 age 政策仍等產品決定，在那之前不要改 GPS 契約。
3. draft PR #40 的 base 是過時的 `feat/v0.8-attendance-management`，公告功能已在 `main` 實作，
   不能直接合併；請確認要關閉還是重開。

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
4. GPS 不保存 raw coordinate 或 exact distance；accuracy 門檻尚未由產品決定，不可自行猜測。
5. 不要把登入狀態、角色、權限、社員名單或整個登入後首頁做公開快取。
6. `birthday_wishes_v2` 與 `birthday_wishes_collection_v1` 缺少明確 flag row 時必須維持關閉；
   scheduler 只接受 staging 的受保護呼叫，不能用 service role key 暴露給前端或一般 job。

## 仍未完成／需外部條件

- 生日祝福 V2 與徵集的程式、旗標、secret、staging 部署、hosted acceptance 與排程均已完成；不再有本輪
  birthday release blocker。歷史失敗 run `33121570908`／`33121704322` 保留作為設定前的追蹤證據。
- GPS accuracy／定位 age 政策要由產品選定後才能 harden。
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
npm run verify:db                not completed locally (Docker/Supabase unresponsive)
npm run check:migrations         passed
npm run check:db-verifications   46 files covered
git diff --check                 passed
PR #86 Browser Smoke             passed (run 33120346924, 11m03s)
PR #86 CI database                passed (run 33120346988; 46 verification SQL)
PR #93 CI／Quality／Browser Smoke passed (runs 33347745255／33347745250／33347745221)
current main push CI              passed (run 33348357979)
current main Browser Smoke        in progress at scan (run 33348357995)
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
的 PL/pgSQL 變數；本輪沒有新增 warning。瀏覽器本機若沒有 Supabase 不得宣稱已完成；本輪 PR 與 main
的隔離 Browser Smoke 均已通過。production 不在本輪範圍。
