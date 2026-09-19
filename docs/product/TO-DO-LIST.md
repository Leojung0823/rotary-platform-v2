# Rotary Platform 待辦執行清單

更新日期：2026-09-20（Asia/Taipei；最新主線 SHA 請以 `git rev-parse origin/main` 現場核對）

權威來源：GitHub `Leojung0823/rotary-platform-v2` 的 `main`。本文件取代
`/Users/leoj/Documents/Codex/2026-08-23/rotary-platform-to-do-list/TO-DO-LIST.md`
的舊掃描結果；那份檔案屬於獨立 worktree，不是權威 repo 的版本。

狀態：`[x]` 已完成　`[>]` 程式完成、等待外部驗收　`[!]` 需要產品決定　`[ ]` 尚未開發

## 2026-09-20 最新補充（活動取消安全邊界已推送；staging 等待憑證修復）

- 權威主線目前為 `origin/main=163a3e512b7623baddb8150feb74616cc50bb47c`；工作樹只保留既有未追蹤的
  `docs/product/EXTERNAL_PLATFORM_PUBLISHING_PLAN_V1.md`，沒有納入本輪提交。
- 新增 `20260920000200_event_cancellation_timeout_boundary.sql`，把活動取消 RPC 的 lock／statement wait 設上限；超時會回傳可重試錯誤，
  不改登入、權限、活動狀態規則或 production。相關 action mapping、頁面提示與回歸測試已推上 `main`。
- 本機 `verify:db`、`check:migrations`、`check:db-verifications`、typecheck、lint、Vitest `197` 檔／`1463` tests、build、diff check 均通過；
  lint 只有既有 `readdirSync` 未使用 warning。自動 CI `35463925758` 與 Browser Smoke `35463925775` 均成功，沒有手動觸發。
- Staging Release plan `35464563367` 成功；Go-Live `35464656975` 在 `supabase link` 因 GitHub staging secret
  `SUPABASE_ACCESS_TOKEN` 對 project `vmmzdautcsgknhyqrsto` 授權失敗而停止，migration 尚未套用、程式尚未部署。
- staging `/api/health` 現場仍是 `revision=07002d81be23`、`status=ok`、`issues=[]`；production 沒有修改。下一步是更新該 secret 後，
  以同一個 exact SHA 與已成功 plan 重新執行 Go-Live，再驗證活動取消 hosted acceptance。

## 2026-09-20 最新補充（活動取消 hosted 核對與乾淨 staging 版本）

- 權威主線為 `origin/main=c4e0305c17202f76b54f3b95984b3e40c701d70c`；staging 產品 runtime 仍是
  `07002d81be23140b581ce5b92d0b55046b249b15`；目前沒有 open PR。工作樹仍只保留既有、未追蹤的
  `docs/product/EXTERNAL_PLATFORM_PUBLISHING_PLAN_V1.md`，本輪沒有讀寫或納入提交。
- 新增 forward-only migration `20260920000100_event_cancellation_qr_index.sql`，替活動取消時依 `event_id` 撤銷仍有效的動態 QR
  credential 建立 partial index；沒有改登入、權限、RLS、活動狀態規則或 production。
- 本機 `npm run verify:db`、`npm run check:migrations`、`npm run check:db-verifications`、`git diff --check` 均成功；資料庫驗證仍只有既有 lint warnings。
- Staging Release `35462618738`、Staging Go-Live `35462672034` 已用同一 exact SHA 成功；staging health 現在是
  `revision=07002d81be23`、`status=ok`、`configuration=true`、`database=true`、`issues=[]`、`warnings=[]`；production 沒有修改。
- 活動取消曾在 `35461215133`、`35462041541` 逾時。受保護診斷驗收 `35462472207` 在相同產品 runtime（只多測試 log）三項全部成功，記錄到取消 POST 有收到 `303`；因此不是固定的按鈕／路由錯誤，也不能把 partial index 宣稱為已證實的唯一根因。
- 乾淨版本的 hosted acceptance `35462819114` 仍有兩個不穩定結果：管理頁一次出現 4px 橫向溢出，活動取消再次在 30 秒內未跳轉。這是目前仍需追的 hosted acceptance flakiness，不把活動管理標成完全結案；測試 log 不含 credential 或 request body。
- 自動 CI `35462613423` 已成功；Browser Smoke `35463068436` 也已完成並成功。兩者都是 push 後自動執行，沒有手動重跑。

本輪沒有把下列外部／真人項目誤標完成：E-03 LINE follow 正確身份配對、E-06 登入後 LCP／FCP／TTFB／INP、E-07 實機／M1、E-08 production 決策、E-10 停權／退社／外社負向矩陣、E-11 各社 OA／Rich Menu 外部設定，以及社費實際收款／核銷 hosted 驗收；E-09 recovery email 依產品決定暫緩。

## 2026-09-20 最新補充（Browser Smoke 逾時保護與社費唯讀驗收）

- `c48f7f0` 已在 `.github/workflows/browser-smoke.yml` 為 `supabase start` 與 `supabase db reset --local` 加上 10 分鐘單步逾時，失敗時保留最近日誌；這只改善驗收工作流，不改產品 runtime、資料庫或 staging／production。
- 已登入 staging 的 PANCHIAO-ELITE 唯讀驗收：社務管理模式可開啟「社費與核銷」、看到 2026-27 年度與 CSV／Excel／PDF 匯出入口；社員模式只看到自己的應收、收款、代墊申請與狀態，沒有收款名單或管理操作。
- 該 staging 年度目前是 0 筆應收、0 筆收款、0 筆代墊；為避免留下不可直接刪除的財務測試紀錄，本輪沒有建立收款／核銷資料。因此社費的實際收款、部分收款、代墊核銷與完整負向角色矩陣仍未結案。
- 舊的 Browser Smoke `35459724643` 仍是 `in_progress`，不採用為通過證據；本輪沒有手動重跑。文件更新與工作流修正均不代表產品已重新部署。

## 2026-09-20 最新補充（生日設定可見性回歸測試已推上 main）

- 已新增 `e2e/tests/birthday-v2.e2e.mjs` 的非變更型回歸案例：社員模式的 `/me?mode=member` 必須看得到「生日公開設定」，且不能重新出現已關閉的通用「隱私設定」卡片；同時檢查頁面沒有橫向溢出。
- 測試提交 `ab666c120798ca45c44e3c238d59e976b08c8ad6` 已推上 `main`。這只補測試，不改 staging runtime；目前 staging 仍是 `a4fd0d6f47b3`，不需因測試提交重新部署。
- 自動 CI `35459724663` 已成功；對應 Browser Smoke `35459724643` 在本次核對時仍執行中，沒有手動重跑，也不把未完成的 run 當成通過證據。最新主線請以 `git rev-parse origin/main` 現場核對。
- 工作樹仍只保留既有、未追蹤的 `docs/product/EXTERNAL_PLATFORM_PUBLISHING_PLAN_V1.md`，本輪未讀寫、未加入提交。

## 2026-09-20 最新核對（生日設定獨立顯示修正已發布）

- 本節的產品與 staging 證據對應產品 commit／staging runtime `a4fd0d6f47b38d78922d5bdc3316b4949d191ab6`；後續文件同步 commit
  只更新紀錄、不重新部署，最新 `origin/main` 請以現場 `git rev-parse origin/main` 核對。目前沒有 open PR。工作樹仍只保留既有、未追蹤的
  `docs/product/EXTERNAL_PLATFORM_PUBLISHING_PLAN_V1.md`，本輪沒有讀寫或納入它。
- 本輪真正修正的缺口是：生日公開設定原本被 `SHOW_PRIVACY_SETTINGS = false` 一起隱藏，導致生日旗標已開啟但社員在「我的」頁看不到設定。
  現在生日設定是獨立卡片；通用「通知／名冊隱私」仍維持關閉，沒有放寬其他設定。
- 程式檔為 `src/app/(authenticated)/me/page.tsx`，回歸測試為 `src/lib/privacy-in-one-place.test.ts`；沒有新增 migration、沒有修改登入／權限／社團隔離。
  本機生日邊界測試 9/9、完整 Vitest `196` 檔／`1459` tests、typecheck、lint（既有 `readdirSync` warning）與 build 均通過。
- 自動 CI `35459107612` 已成功；Browser Smoke `35459107627` 仍在執行，沒有手動重跑，也不把未完成的 run 當成通過證據。
- Staging Release `35459226960` 與 Staging Go-Live `35459318377` 使用同一個 exact SHA；Go-Live、HTTPS smoke、hosted acceptance 全部成功。
  staging `/api/health` 現場回報 `revision=a4fd0d6f47b3`、`status=ok`、`configuration=true`、`database=true`、`issues=[]`、`warnings=[]`；production 沒有修改。
- 已登入 staging 的 LEO 社員模式唯讀驗收確認 `/me?mode=member` 顯示「生日公開設定」，並分別列出 PANCHIAO-ELITE／HAPPY 的設定與開關。
  目前只證明顯示與社籍分開投影；另一社員、關閉後生日牆面消失、儲存後恢復等完整真人驗收仍未完成。
- 目前不能誠實結案的外部項目仍是 E-03、E-06、E-07、E-08、E-10、E-11、社費 hosted 角色／收款核銷驗收；E-09 依產品決定暫緩。
  E-05、服務計劃 hosted 草稿／發布邊界與本輪生日設定「看得到」已完成，不要重做已完成項目。

## 2026-09-20 最新掃描補充（待辦與 staging 現場）

- `origin/main` 現場核對為 `3e9d8056c4ff25f41e1ce93a4b4b26027f1c2c82`；目前沒有 open PR。工作樹只保留既有、未追蹤的
  `docs/product/EXTERNAL_PLATFORM_PUBLISHING_PLAN_V1.md`，本輪沒有讀寫或納入它。
- staging `/api/health` 現場回報 `status=ok`、`revision=425a166e2469`、`configuration=true`、`database=true`、
  `issues=[]`、`warnings=[]`；這是目前已部署的產品程式 revision，文件提交沒有重新部署 staging。
- 自動 Browser Smoke `35458088029` 的 `member-browser-smoke` 仍是 `in_progress`，不能當成通過證據；沒有手動重跑，也沒有把它當成
  阻塞產品 release 的理由。其餘同一 SHA 的 CI、Staging Release 與 Staging Go-Live 已成功。
- 已登入 staging 的社務管理帳號唯讀檢查社費頁：`2026-27` 年度、CSV／Excel／PDF 入口、收款名單與代墊入口均能開啟；目前該年度是
  0 筆應收、0 筆收款、0 筆代墊，因此**實際收款／沖銷、代墊／核銷及一般社員／外社／無 `finance.read` 的負向矩陣仍未驗收**。
- 原始碼掃描沒有發現未登錄的 `TODO`／`FIXME` 產品工作；目前未結案清單仍以 E-03、E-06、E-07、E-08、E-10、E-11、社費 hosted
  角色驗收、生日設定 hosted／真人驗收、Rich Menu 外部設定、手機與 M1 測試為主。這些需要真人、外部帳號、實機或產品決策，不能只靠
  再寫本機程式誠實結案。

## 2026-09-20 最新核對（跨社管理深連結已修正並發布）

- 程式提交 `425a166e2469db49ff8e6b995e04b066f011c926` 已推上 `main`；Staging Release
  `35458106373` 與 Staging Go-Live `35458190522` 使用同一個 exact SHA，migration dry-run／apply、部署、exact revision、HTTPS smoke
  與 hosted acceptance 全部成功。production 沒有修改。
- staging `/api/health` 現場回報 `status=ok`、`revision=425a166e2469`、`configuration=true`、`database=true`、`issues=[]`、`warnings=[]`。
- 實際重現並修正一個跨社 UX 缺口：直接開 `/clubs/<clubId>/...` 時，頁面內容會依網址社團載入，但側欄可能仍沿用另一社的 active-club cookie。
  代理層現在只轉送格式正確的 route／query club ID 作為顯示偏好；shell 與 `currentExperienceMode` 都經同一個本人可用社團 projection 驗證，
  不把網址或 cookie 當權限來源。瀏覽器自行注入的 `x-rotary-*` header 會被覆蓋。
- 新增 `src/proxy.test.ts` 的 route／query／非法 ID 測試，以及 `e2e/tests/role-shells.e2e.mjs` 的雙管理社團深連結回歸測試。
  本機 Vitest 為 `196` 檔／`1459` tests；typecheck、lint（既有 warning）、build、verify:db、migration guard、verification manifest、
  diff check 均通過。沒有手動觸發 CI 或 Browser Smoke。
- 已登入 staging 的唯讀驗收：直接開 HAPPY 與 PANCHIAO 管理深連結時，側欄目前社別、頁面標題、活動資料與導覽連結均一致。
  E-10 仍不能結案，因停權／退社／外社執行秘書的負向矩陣尚未有真人 staging 證據。
- E-06 登入後 LCP／FCP／TTFB／INP 仍是**未量測**；這次只驗證社別一致性，沒有把瀏覽器畫面驗收當成效能數字。

## 2026-09-20 最新核對（服務計劃 hosted 雙帳號驗收完成）

- 產品與驗收 exact SHA `f72aa2db440ae8278cbe791411b17e9f1d0197b4` 已由 Staging Go-Live `35456273015` 部署；staging health 回報 `status=ok`、`revision=f72aa2db440a`、`configuration=true`、`database=true`、`issues=[]`、`warnings=[]`，production 沒有修改。
- Staging Management Acceptance `35456938712` 兩個測試全部成功：服務計劃草稿對一般社員不可見，發布後可見四大分類，重新存成草稿後再次隱藏；生日、文件建立／上傳／編輯、活動建立／封面／發布／取消也通過。
- 前一次 run `35456431449` 的活動取消 redirect 曾逾時；本機重現成功，使用同一 exact SHA 重跑後 `35456938712` 全綠，沒有改活動 runtime。
- 本機 typecheck、lint（既有 warning）、Vitest `196` 檔／`1458` tests、build、verify:db、migration guard、verification manifest、diff check 均通過；自動 CI `35456012202`、Browser Smoke `35456012210` 均成功，沒有手動重跑。
- 既有未追蹤的 `docs/product/EXTERNAL_PLATFORM_PUBLISHING_PLAN_V1.md` 未納入本輪；文件同步提交不需重新部署 staging。

## 2026-09-19 最新核對（E-05 已結案；推播受眾隔離已修正）

- 本輪程式提交 `d9468bdc291926eab80e1034c4846efc175460f0` 已推上 `main`，並由 Staging Go-Live `35446974648` 以 exact SHA 完成 migration、部署、HTTPS smoke 與 hosted member acceptance；文件後續提交會讓 `main` 再前進，精確主線 SHA 請以 `git rev-parse origin/main` 現場核對。
- staging `/api/health` 現場回報 `status=ok`、`environment=staging`、`revision=d9468bdc2919`、`configuration=true`、`database=true`、`issues=[]`、`warnings=[]`；production 沒有修改。
- E-05 專項驗收 `35445780317` 成功：建立合成 `rate_limited` push log、不呼叫 LINE API；管理幹部看到「LINE 推播已暫停」與部分送達數字，一般社員無法進入管理頁且看不到提醒；fixture cleanup 成功。
- 本輪沒有 open PR；自動 CI／Browser Smoke 由 push 產生，但沒有手動觸發或重跑；未執行 production 操作。工作樹只保留既有未追蹤的 `docs/product/EXTERNAL_PLATFORM_PUBLISHING_PLAN_V1.md`，沒有覆蓋它。

## 2026-09-19 LINE OA 推播受眾隔離修正

- 實際掃描發現共同推播 loader 原本只看 follower 的 `following` 狀態，沒有再確認 follower 對應的社員目前仍是該社的 active membership；退社／停權／外社或尚未配對的舊 follower row 可能被納入全社推播。
- 已修正 `src/lib/line/oa-dispatch.ts`：同時讀取該社 active memberships，再只保留 active person 的 following follower，並對 OA user id 去重。所有手動廣播與既有 API 推播共用這個受眾邊界；沒有放寬 RLS、權限或社團隔離。
- 新增 `src/lib/line/oa-dispatch.test.ts` 回歸測試，確認 active follower 保留、ended／unpaired follower 排除，以及查詢包含 `membership_status=active`。
- 本機 `typecheck`、`lint`、完整 `npm test`（196 檔／1456 tests）、`build`、`verify:db`、`check:migrations`、`check:db-verifications`、`git diff --check` 均通過；lint 只有既有的 `readdirSync` 未使用警告，資料庫驗證只有既有 schema lint 警告。
- 這項修正已在 staging Go-Live `35446974648` 驗證；沒有新增 migration，也沒有修改 production。

## 2026-09-19 E-05 決策與實作進度（本節優先）

> 本節保留首次完成程式時的中間快照；E-05 的最終 staging 驗收已在上方「最新核對」完成，狀態以 `[x]` 與 run `35445780317` 為準。

- **產品決策已確認**：LINE 回報推播頻率／方案額度上限（429）時，採「停止並提示」，不採「繼續送並只記錄」。現有同一批次最多重試一次且沿用同一個 retry key；確認仍是 `rate_limited` 後，立即停止後續批次。
- **本輪已補上管理提醒**：`get_line_oa_quota_notice` 只允許有 `oa.read` 的社務管理幹部讀取，讀取最新一筆會員訊息推播紀錄；若最新結果是 `rate_limited`，`/clubs/<clubId>/line-oa?mode=management` 顯示醒目錯誤通知與部分送達數字。手動送出仍會在返回頁面立即提示；下一次推播有其他結果後，舊提醒自動消失。
- **資料隔離**：提醒不寫入全社訊息中心，不會送給一般社員；只透過該社的管理頁投影顯示。通知投影不含 access token、channel secret 或 provider request id。
- **本輪再補驗收工具**：新增受保護的 `.github/workflows/staging-line-quota-acceptance.yml`。它只接受 `workflow_dispatch`、`main`、exact SHA 與 `TEST-STAGING-LINE-QUOTA`，只對名稱與代碼明確是 staging/test 的測試社團建立合成 OA／rate-limited log，讓 hosted browser 驗收管理員看得到提示；不呼叫 LINE API，驗收後只清理自己建立且有 marker 的資料。若測試社團已有啟用中的 OA，流程會停止，不會覆蓋或刪除。
- **目前狀態**：E-05 的程式、migration、verification、單元測試、受保護 staging UI 驗收與 cleanup 均已完成；Staging Go-Live `35446974648` 的 runtime 為 `d9468bdc291926eab80e1034c4846efc175460f0`，`/api/health` 回報 `status=ok`、`issues=[]`。已登入的社務管理頁最新推播為 `sent`，目前沒有額度警示；不要為了驗收硬打真實額度。`line-oa-audience-1440` 本機回歸確認管理幹部看到停止提示與部分送達數字，一般社員被拒絕且看不到提醒；staging 專項 `35445780317` 已用合成資料完成同一條可見性驗收。未用真實社員做額度壓力測試，也沒有偽造正式 LINE 429。

## 2026-09-19 最新現場核對（本節優先）

> 本節是 `8f109d0` runtime 的前一版快照；最新 runtime 與 E-05 結果請以上方「最新核對」為準。

- 2026-09-19 現場核對 staging runtime exact SHA 為 `8f109d0fba579397a7f5e8d7d5a591771f09ab2a`；Staging Go-Live `35440209578` 成功，staging `/api/health` 回報 `revision=8f109d0fba57`、`status=ok`、`issues=[]`，production 沒有修改。本段核對時的主線基準為 `b49ae9e8db6337b19058d3033c67bbdfb04b6184`；後續只增加本機 fixture、瀏覽器回歸測試與進度文件，未重新部署 staging。自動 CI `35443369737` 與 Browser Smoke `35443369707` 均成功；最新主線請以 `git rev-parse origin/main` 現場核對。
- Staging Management Acceptance `35440318825` 成功：無社籍執行秘書完成生日重跑、文件建立／上傳／編輯，以及活動建立／封面／發布／取消。這完成管理模式的 hosted 正向流程，但不等於社費、服務計劃的完整角色矩陣或 E-10 負向矩陣完成。
- 本機針對性瀏覽器驗收補充通過：`officer-mode-1440` 為 9 passed／1 intentional skip，涵蓋社員／社務模式邊界、跨社管理路徑拒絕、社費與 CSV／Excel／PDF 匯出及無社籍執行秘書；`interact-hub-1440`／`375` 共 4 passed；`line-oa-rich-menu-1440` 1 passed；`line-oa-audience-1440` 5 passed，涵蓋額度停止提示的管理員可見性與社員拒絕。這些是本機回歸證據，不取代 staging 真人與各社 OA 驗收。
- 已登入 staging 的唯讀抽查確認：LINE OA 管理頁最新推播為 `sent`、目前沒有額度提醒；社費管理頁可讀取 2026–27 年度與 CSV／Excel／PDF 匯出入口；社員「我的」頁有社費入口與代墊申請；服務計劃管理草稿不會出現在社員頁。未為測試硬打真實 429。
- Chrome DevTools MCP 目前沒有 staging 登入 session，導向管理頁會回 `/login`；因此 E-06 登入後 LCP／FCP／TTFB／INP 仍是**未量測**。桌面 Chrome 只作畫面唯讀驗收，不把非 DevTools trace 的數字當效能證據。
- 目前仍不能誠實結案的項目：E-03 follow 配對真人核對、E-06 可比效能數據、E-07 實機／M1、E-08 production 決策、E-10 多社／停權／退社／外社負向矩陣、E-11 各社 OA／Rich Menu 外部設定；E-09 recovery email 依產品決定暫緩。E-05 已完成產品決策、程式、staging 發布、管理員／社員隔離驗收與 cleanup。

## 2026-09-18 現場基線（本節優先）

本節以 GitHub `origin/main`、GitHub Actions 與 staging `/api/health` 現場核對；下面較早內容保留作為歷史證據。

- Staging runtime 基線仍是 `211b363526ca1398f2cba49708d9c7a0dfca1422`（PR #202 已合併，另加入 LINE OA 待辦整合）；本輪程式／測試修正為 `16fcc25`、`5f794e1`。目前 `main` head 一律以 `git rev-parse origin/main` 現場核對；目前沒有 open PR。
- `16fcc25`、`5f794e1` 只修正 `member-home` E2E 對舊版 LINE 首頁卡片的過時斷言，沒有改 runtime、資料庫或權限。前一輪 `35310867689` 有 6 個舊斷言失敗；更新一次後 `35312050315` 剩 1 個漏網舊斷言失敗，另有 1 個標籤測試 retry 後通過的 flaky。最新自動 CI `35313186838` 與 Browser Smoke `35313186884` 均已成功；Browser Smoke 的 member-browser-smoke 與兩個 rollback check 也都成功。
- Staging Release `35308584458` 成功；第一次 Go-Live `35308757890` 因 Render 免費方案在等待窗口內尚未切換而失敗，未進入 smoke／hosted acceptance。取消卡住的 Render deploy 後，以同一個 exact SHA 重跑 Go-Live `35309848544` 並全部成功；staging `/api/health` 現場回報 `status=ok`、`revision=211b363526ca`、`configuration=true`、`database=true`、`issues=[]`、`warnings=[]`。production 沒有修改。
- #199、#200、#201、#202 已進入 `main`；這些最近變更沒有新增本輪未發布的 migration。後續若只更新文件，不需重新部署 staging。
- 首頁資料庫待辦投影仍只有 `event_response`、`dues_outstanding`、`birthday_wish`、`unread_messages`、`profile_incomplete` 五種；主線 `211b363` 已在應用層以同一個 caller-only `get_my_line_oa_onboarding_status` RPC 追加 LINE OA 任務。未綁定、未加入、已加入待配對、資料衝突會顯示不同文字；已配對、OA 未驗證或查詢失敗不顯示。任務連到 `/me/line-oa`，且和首頁原本的資料查詢用 `Promise.all` 同時執行。這個版本已部署到 staging；仍需用乾淨真人帳號驗收「未加入時出現、完成配對後消失」。
- 本輪補強了本機瀏覽器驗收 fixture：新增「LINE Login 已綁定、但尚未加入 OA」社員，`member-home` E2E 會確認首頁待辦出現「加入本社 LINE OA」並連到 `/me/line-oa`。這是本機回歸證據，不取代 staging 真人驗收；本輪沒有修改資料庫結構。
- 本輪本機驗證：typecheck、lint、完整 Vitest `193` 檔／`1445` tests、build、`check:migrations`、`check:db-verifications` 通過；`verify:db` 因本機 Docker／Supabase reset 長時間無回應而中止，未宣稱通過。沒有手動觸發 CI 或 Browser Smoke。
- 2026-09-19 再次嘗試 E-06／E-07：Chrome DevTools MCP 的 staging 頁面仍沒有登入 session，開管理頁會回到 `/login`；桌面 Chrome 的已登入頁面只能做畫面唯讀驗收，沒有把它的數字冒充 DevTools trace；iPhone 鏡像停在「解鎖你的 iPhone」，沒有產生實機驗收證據。E-06 的登入後 LCP／FCP／TTFB／INP 仍是未量測，E-07 維持未結案。
- 尚未結案且需要外部條件／產品決定的項目仍是 E-03、E-06、E-07、E-08、E-10、E-11；E-05 的產品決策、程式、正常 staging 發布與本機可見性驗收已完成，現在只等不消耗正式額度的 staging rate-limited UI 專項證據；E-09 依產品決定暫緩。這些不能只靠本機程式修改誠實結案。
- 2026-09-18 已由平台管理員透過受保護 CLI 開啟 staging `dues_finance_v1`；本次以已登入的社務管理帳號做唯讀 hosted 驗收，管理頁可開啟 2026–27 年度、空資料摘要與 CSV／Excel／PDF 匯出入口，社員模式也可從「我的」查看社費並看到代墊申請入口。仍需有實際應收資料的收款／核銷結果，以及一般社員、外社與無 `finance.read` 帳號的負向矩陣；旗標開啟不等於完整結案。
- 年度服務計劃已完成唯讀 hosted 抽查：管理模式可看到四大分類的 staging 草稿，社員模式只看到「本年度的服務計劃尚未發布」，草稿沒有外洩；仍需另一個一般社員帳號的正式角色矩陣與發布後內容驗收。

## 2026-09-17 最新基線（簽到可用性說明修正已發布；本節優先）

本節以 GitHub `origin/main`、PR 狀態、Staging Release、Staging Go-Live 與 staging `/api/health` 現場核對；下面較早的 2026-09-17 段落是歷史紀錄，不得覆蓋本節。

- 最新主線與 staging 都已核對為 `eaafe00eed1afab4314f0d5ccc0a875571d832a5`；PR #198「簽到頁說出這裡為什麼是空的」已合併，包含逐場說明定位簽到阻礙原因，以及不計入出席的活動仍可開啟簽到。這次沒有新增 migration。
- Staging Release plan `35185140008` 與 Staging Go-Live `35185217321` 使用同一個 exact SHA `eaafe00eed1afab4314f0d5ccc0a875571d832a5`；migration dry-run、部署、exact revision wait、HTTPS smoke 與 hosted acceptance 全部成功。
- staging `/api/health` 現場回報 `status=ok`、`revision=eaafe00eed1a`、`configuration=true`、`database=true`、`issues=[]`、`warnings=[]`；production 沒有修改。
- PR #198 的自動 CI 與 Browser Smoke 是 push 後自動產生，沒有手動 dispatch／重跑；部署使用 Go-Live 自己的受保護檢查。文件後續若只更新進度，不需重新部署 staging。
- 目前尚未結案的外部／決策待辦仍是 E-03、E-05、E-06、E-07、E-08、E-10、E-11；E-09 依產品決定暫緩。E-01、E-02、E-04、E-12 維持已完成。E-10 已補上執行秘書 hosted 正向驗收，但停權／退社／外社負向矩陣仍待真人帳號。

## 2026-09-17 文件同步基線（歷史；已被上方最新基線取代）

本次以 GitHub `main`、GitHub Actions、staging `/api/health` 與已登入社員頁 DOM 交叉核對：

- 本次程式修正包含在 staging Go-Live 的 exact SHA `3e955553d7ee62dc02d33ea584006b9424704dad`；Staging Release
  `35130111743` 與 Go-Live `35130278609` 使用同一個 SHA 並成功。staging `/api/health` 回報 `status=ok`、
  `configuration=true`、`database=true`、`issues=[]`、`warnings=[]`，revision 為 `3e955553d7ee`；production 沒有修改。
- 本輪新增 migration `20260917000100_club_affairs_member_read_access.sql` 已在 Go-Live 套用，新增 verification 也通過；
  一般 active 社員可以讀自己的社務公開投影，外社與停權社員仍被拒絕。Go-Live 的 migration、部署、exact revision、HTTPS smoke
  與 hosted member acceptance 全部成功。
- 本輪程式提交 `15bfd0af2919bc8f45f401266e1855569f106ecb` 修正多社社員切換後社務頁仍顯示第一社的問題；文件提交後的主線 SHA
  請以 `git rev-parse origin/main` 現場核對。自動 CI／Browser Smoke 沒有手動觸發或重跑；程式 push 的兩個自動 run 已取消，
  後續文件 push 的自動 run `35129653090`／`35129653326` 最後成功。
- 真實登入 LEO 社員頁 `/dashboard?mode=member` 重新載入後，`/hero-mountains.webp` 圖片 DOM 為 `1` 張、preload 為
  `1` 個（body 1、head 0）。目前 staging 使用 `next/image` 單一元件管理 preload，並以 `unoptimized` 直接載入小型靜態檔；
  沒有改登入、角色、權限、社團隔離或登入後首頁公開快取。
- 本機完整品質／資料庫驗證與 `member-home-1440` `3 passed` 均通過。舊 Staging Release `35084851997` 的取消只影響舊 head，
  不影響目前 `3e955553d7ee` 的 staging。
- 2026-09-17 再用已登入 staging 測試帳號做唯讀驗收：社員模式只有社員導覽；社務管理模式顯示 8 項管理功能。
  服務計劃在管理端仍是草稿，社員端顯示「尚未發布」；直接開啟社費管理頁回 404，與 `dues_finance_v1` 關閉相符；
  Rich Menu 管理區也未顯示，與 `line_rich_menu_v1` 關閉相符。這補強模式邊界與草稿隔離，但不等於 E-03／E-07／E-10／E-11 已結案。
- Go-Live 後以同一個已登入 staging 社員帳號做唯讀回歸：從 `PANCHIAO-ELITE` 切到 `HAPPY`，再開
  `/club-affairs?mode=member`，頁面顯示 `社務 · HAPPY`、`虛擬扶輪社` 與 HAPPY 的年度服務計劃；切回
  `PANCHIAO-ELITE` 後又顯示板橋群英扶輪社資料。這確認本輪 active-club cookie 修正已在 hosted 生效，完成 E-10 的正向切換證據；
  停權／退社／外社執行秘書等負向矩陣仍待真人帳號驗收。
- 本輪 Chrome DevTools MCP 的兩個頁面雖帶有社員／管理 query，實際身份都解析成平台管理員，因此沒有採用其效能數字；
  已登入社員頁的 CUA 瀏覽器可以做畫面驗收，但無法取得 Performance API 的有效資料。E-06 的本次 runtime FCP／TTFB／LCP／INP 仍是未量測。
- E-06 的「重複 preload」已完成程式修正與 hosted DOM 驗收；同一 runtime／快取條件下的 LCP、FCP、TTFB、INP 前後比較仍未量測，
  因此 E-06 仍維持 `[>]`。

## 2026-09-17 本輪開發修正（最新）

- 本輪程式提交為 `15bfd0af2919bc8f45f401266e1855569f106ecb`，已包含在 staging Go-Live exact SHA
  `3e955553d7ee62dc02d33ea584006b9424704dad`；文件更新後 main 會再前進，請以 `git rev-parse origin/main` 現場核對。
  本輪沒有修改 production。
- 實際驗收發現：多社社員切換到第二個社團後，社員導覽的「社務」頁仍用第一個社團；原因是該頁沒有讀取 shell 使用的
  `rotary_active_club_v1` cookie，而是把 `resolveExperienceContext(null)` 當成第一個候選社團。這是頁面顯示錯社的資料隔離缺口。
- 已修正 `src/app/(authenticated)/club-affairs/page.tsx`：讀取並驗證 active-club cookie，再把同一個社團偏好傳給 context resolver；同時保留
  `get_club_affairs_page` 自己的後端社籍檢查。
- 已新增 forward-only migration `20260917000100_club_affairs_member_read_access.sql`：一般 active 社員可以讀取社務公開投影，
  不會因此取得廣義 `member.read`；外社使用者與停權社員仍被拒絕。新增驗證 `club_affairs_member_access.sql` 並加入 manifest。
- 本機已通過：`npm run typecheck`、`npm run lint`、`npm test`（181 檔／1347 tests）、`npm run build`、完整 `npm run verify:db`、
  `npm run check:migrations`、`npm run check:db-verifications`、`git diff --check`；本機 `member-home-1440` 為 `3 passed`。
- Push 後自動建立 CI `35129357577` 與 Browser Smoke `35129357651`；依「後續開發不手動跑 CI」規則已取消，沒有手動 dispatch／重跑。
  這兩個 run 不作為本輪驗收證據。Go-Live `35130278609` 已完成發布，下一步只剩使用多社社員在 hosted 環境做同一條
  「切換社團 → 開社務」的負向矩陣驗收；正向路徑已完成。

### 2026-09-16 本機角色回歸補充

- 本機 `officer-mode-1440`：9 passed、1 刻意跳過手機版；`officer-mode-375`：7 passed、3 個資料變更測試依設計跳過。已涵蓋社員／社務模式切換、跨社管理路由拒絕、社費只在管理模式顯示、生日管理入口，以及文件建立／編輯／上傳。
- 本機 `line-oa-rich-menu-1440`：1 passed。已涵蓋 mock OA 的 Rich Menu 發布與停用；這不是 staging OA 或真人手機驗收證據。
- 本機 `role-shells-1440` 新增退社 fixture 後，撤銷管理者、停權社員、退社社員的 role-shell 負向測試通過；這是本機後端路由證據，不能取代 staging 真人驗收。
- 本機安全邊界測試：4 檔、20 tests passed，涵蓋管理模式、社費旗標、Rich Menu 旗標與首頁效能邊界。
- 自動 Browser Smoke `35116581323`（head `09477c2`）已完成但非全綠：`188 passed`、`57 skipped`、`1 failed`、`1 flaky`。
  失敗是 role-shell 負向登入測試填密碼時輸入框被串流重繪卸載；GPS 到場簽到測試為 flaky。它早於本輪 `c58a90c`，沒有手動重跑，
  不能當成本輪效能修正的 staging 結果。
- Staging Release `35084851997` 已取消；它的 head 是舊版 `857b9dc54a4cc98e67f86b264d2014c91b4f38c1`，不影響目前 staging，也沒有因取消而回滾程式。
- 以 Chrome DevTools 重新量測真實 LEO 社員首頁：LCP `1.30 s`、CLS `0.01`，LCP 元素為首頁 hero `<img>`；FCP／TTFB／INP 未量測。
  這次 runtime 為 `bd8a8e9d0205`、快取未停用，不能直接宣稱相較舊 runtime 的因果改善。
- 以上只補充本機證據，不把 E-03、E-06、E-07、E-10、E-11 的真人／外部驗收改標成完成。

## 2026-09-16 最新掃描（歷史；已被上方最新基線取代）

本次以 GitHub `Leojung0823/rotary-platform-v2` 的 `origin/main`、GitHub Actions 與 staging
實際健康檢查交叉核對；舊的 2026-09-15 段落保留作為歷史紀錄，不再當作目前狀態。

- `origin/main` 最新 SHA 請以 `git rev-parse origin/main` 現場核對；本輪最新效能程式提交為
  `c58a90ccdd0a2fcc1e1b7290bfd70c6c081e617f`。
- staging `/api/health`：`status=ok`、`revision=bd8a8e9d0205`、`configuration=true`、
  `database=true`、`issues=[]`、`warnings=[]`。production 沒有修改。
- 9/16 已進入主線並部署至 staging 的修正／功能包括：首頁待辦完成後移除生日提醒、社費提醒連到實際應付年度、
  只有 Email 的社員可以清除個人資料提醒、活動報名截止日可留空、生日徵集可編輯日期／關閉、
  管理員批次修復未配對 follower、手機表格卡片不再把整頁撐寬，以及測試 fixture race 修正。
- 新增的資料庫 migration `20260916001500_dues_reminder_lands_on_the_year_owed.sql` 已在前一個 Staging Go-Live
  `35083792540` 套用，目前 staging 仍包含它；本輪 `bd8a8e9` 沒有新增 migration，仍要依 migration／rollback 規則管理後續變更。
- PR #188、#189、#190 都已正常 merge；本輪效能修正的自動 CI `35100760020` 與 Browser Smoke `35100760034` 均成功，
  Staging Release `35102157586` 與 Go-Live `35102495571` 也以同一個 exact SHA 成功完成。
- **判斷規則**：open PR 未通過完整必要檢查前，不算主線完成；已 merge 也不等於 staging 已部署。不能 force push 或 rebase 別人的分支。

### 這次掃描後的實際結論

1. 不是「主線沒有更新」：主線已包含 `c58a90c` 的 preload 修正，產品程式 staging 仍在上一版 `bd8a8e9`。
2. 不是「所有待辦都完成」：E-03、E-05、E-06、E-07、E-08、E-10、E-11 仍需要真人、效能工具、產品決策或外部 OA 設定。
3. #188／#189／#190 已合併、檢查已通過並發布至 staging；本輪 `c58a90c` 效能修正已在本機驗證但尚未發布，下一步是完成剩餘真人／外部驗收。

## 2026-09-15 GitHub 開發狀態快照（#147 合併後）

以下是本次掃描當下的 GitHub 狀態。**PR 尚未合併前，不算 `main` 完成；進入 `main` 也不代表已部署到 staging。**
本次 staging release 使用的 `main` exact SHA 是 `93d341c3fd7818783bd6779b1466162baf86548b`；當時沒有 open PR。
Staging Release plan `34912834525` 與 Go-Live `34912921064` 已使用同一個 exact SHA 完成，且通過 staging environment
人工核准。Go-Live 的 migration apply 回報 `Remote database is up to date.`，部署 revision 已健康；HTTPS smoke 與 hosted
member acceptance 均通過。`/api/health` 回報 `status=ok`、`revision=93d341c3fd78`、`configuration=true`、
`database=true`、`issues=[]`、`warnings=[]`。因此 #124、#126、#127、#130、#132、#135、#139 已隨本次 Go-Live 發布；
production 沒有修改。

- `[>]` PR #107 Rich Menu：已合併，merge `1164f763`；已部署 staging，待各社 OA 外部設定與真人驗收。
- `[>]` PR #108 社費／收款／核銷與報表：已合併，merge `a52bfe7`；已部署 staging，待 hosted／角色邊界驗收。
- `[>]` PR #109 手機 Web App：已合併，merge `694c961`；已部署 staging，待真實 iOS／Android 手機驗收。
- `[>]` PR #110 生日設定 UX：已合併，merge `493c5a1`；已部署 staging，待 hosted／真人驗收。
- `[x]` PR #111 社務資訊／年度服務計劃：已合併至 `main`，merge `2d7839d`；已部署 staging，仍待 hosted／角色邊界驗收。
- `[>]` PR #113 活動地址查座標：已合併，merge `0989a2b`；migration 順序已由 #118 修正並隨目前 staging 發布，待地址查詢真人驗收。
- `[x]` PR #115 staging migration 順序處理：已合併，merge `6260191`；`include_all` 預設關閉，只有明確指定才允許 out-of-order migration。
- `[x]` PR #118 migration collision repair：已合併，merge `244ac25`；地點 migration 已從 `20260914000400` 改為 `20260914000900`，完整 migration reset、database、Quality、Browser Smoke 均通過。
- `[x]` PR #117 同頁模式導覽修正：已合併，merge `8a424b2`；CI、Quality、Database 與 Browser Smoke 均通過。
- `[x]` PR #119 migration collision guard：已合併，merge `a61b333`；加入全樹同號檢查與單元測試，CI、Quality、Database 與 Browser Smoke 均通過。
- `[x]` PR #120 活動封面統一裁切比例：已合併，merge `b57034d`；CI、Quality、Database 與 Browser Smoke 均通過，並已隨目前 staging 發布。
- `[x]` PR #121 進度文件同步：已合併，merge `5bf0866`；本次再依最新 main／staging 狀態修正三份文件。
- `[x]` PR #122 UI design system：已合併，merge `585a0a1`；目前 staging 已部署同一個 exact SHA。
- `[x]` PR #123 UI 層次與 header gutter：已合併，merge `dddf1a5`；PR 自身的 CI、Quality、Database、Browser Smoke 均通過，並已隨 Staging Go-Live `34856216706` 部署 staging。實際 diff 不包含完整社員／社務管理模式邊界；合併後 main 的 Browser Smoke 另有 1 個 LINE OA audience 失敗。
- `[x]` PR #126 已發佈活動編輯：已合併，merge `5f50c31`；CI、Quality、Database、Browser Smoke 均通過，已隨 Go-Live `34912921064` 部署 staging。
- `[x]` PR #124 結構化年度服務計劃 V2：已合併，merge `691beb6`；CI、Quality、Database、Browser Smoke 全部通過，已隨 Go-Live `34912921064` 部署 staging，仍待 hosted 角色與草稿隔離驗收。
- `[x]` PR #127 手機／桌機共用設計系統第二輪：已合併，merge `44456f8`；CI、Quality 與 Browser Smoke `34862992487` 均通過，包含 320px 橫向溢出修正與 rollback，已部署 staging。
- `[x]` PR #130 社員／社務管理模式邊界修正：已合併，merge `6759934`；application、database、validate 與 Browser Smoke `34871617599` 均通過，沒有新增 migration，已部署 staging。
- `[x]` PR #132 活動推播版本契約修正：已合併，merge `4387ee5`；application、database、validate 與 Browser Smoke `34876325765` 均通過。新增 `20260915000100_event_push_version_contract.sql`，已部署 staging。
- `[x]` PR #135 活動切換社團的公開網址修正：已合併，merge `d2106bc8`；application、database、validate 與 member-browser-smoke 均通過，沒有新增 migration，已部署 staging。
- `[x]` PR #136 進度文件同步：已合併，merge `6e895101`；純文件變更，完整資料庫／member-browser jobs 依變更範圍規則跳過。
- `[x]` PR #137 staging plan 文件同步：已合併，merge `8b970dc9`；純文件變更，完整資料庫／member-browser jobs 依變更範圍規則跳過。
- `[x]` PR #138 進度文件同步：已合併，merge `e5313907`；純文件變更，記錄 #137 合併後的主線狀態。
- `[x]` PR #139 社務頁年度預設值修正：已合併，merge `37b297f9`；修正 `date` 直接指定給 `integer` 造成的社務頁載入錯誤，新增 forward-only migration 與資料庫驗證。
- `[x]` PR #140 進度文件同步：已合併；純文件變更，更新 #139 合併後的主線／staging 落差與待辦證據。
- `[x]` PR #141 LINE OA rollout 決策同步：已合併，merge `feebd590`；純文件變更，記錄本次只使用 `PANCHIAO-ELITE`，HAPPY 不納入 rollout。
- `[x]` PR #145 UI 首頁卡片對齊修正：已合併，merge `450a42d`；已包含在本次 staging Go-Live。
- `[x]` PR #143／#144／#146／#147 staging 受控 logical backup workflow：已合併；最後一版 merge `93d341c3`，不新增資料庫結構，
  只建立受保護的備份工作流程。

目前有 open PR #188、#189；#123、#124、#126、#127、#130、#132、#135、#139 均已隨 Go-Live `34912921064` 發布；
`20260914001100_club_service_plan_v2.sql`、`20260915000100_event_push_version_contract.sql` 與
`20260915000200_club_service_plan_year_cast.sql` 的 migration apply 步驟均通過，該次執行回報遠端資料庫已是最新。
後續若只有文件變更，不需要重新部署 staging。

## 2026-09-15 受控備份與 staging Go-Live 證據

- 使用者已授權受控 logical export；備份只保留在本機加密檔，不把明文資料放進 repo 或長期留在 GitHub。
- workflow `.github/workflows/staging-logical-backup.yml` 只接受 `main` 的 exact SHA，固定 staging Supabase project／Render host，
  並要求 staging environment 核准；先匯出 `public` schema 與 data-only dump，再以本機提供的 X.509 recipient certificate 加密後才上傳。
- 最終 backup run `34912448897` 成功。加密 artifact `10374966439` 已下載到本機、checksum 驗證成功，並在本機解密確認 archive
  同時包含 schema 與資料（含 `club_events`、`line_push_logs`）；明文驗證檔與 GitHub artifact 已刪除並確認不存在。
- 本機現在只保留加密 payload、checksum，以及分開保存且權限為 `600` 的解密 private key／recipient certificate；實際位置是
  `~/Documents/Rotary-Staging-Backups/2026-09-15/`。不要刪除解密材料，否則日後無法還原這份備份。
- Go-Live run `34912921064` 使用 `backup_confirmation=BACKUP-READY`、`plan_run_id=34912834525`、同一個 exact SHA，
  migration、部署、health、HTTPS smoke 與 hosted member acceptance 全部成功。這不代表 production 已發布；production 仍未修改。

## 2026-09-15 本輪主線交付

本輪多個功能已進入 GitHub `main`，並隨 Go-Live `34912921064` 部署到 staging；因此下面的 `[>]` 只代表
仍待 hosted／真人／外部設定驗收，不把「已部署」誤寫成「已完成所有驗收」。

### 新功能

- **公開加入連結** `[>]`（PR #100、#102）。幹部產生一條連結，任何人用 LINE 登入即可成為該社正式社友，
  姓名帶入 LINE 顯示名稱。產品決定：加入者**立即成為正式社友**，連結**不設到期也不設次數上限**，
  唯一控制是手動關閉。因此連結等同社內資料的鑰匙——幹部卡片與落地頁都明講這件事，
  且**每社同時只能有一條有效連結**，重新建立會讓舊的立即失效。
  只存 token 的 SHA-256、redeem 僅 service_role、公開預覽把所有失敗收斂成同一個 `unavailable`。
  PR #102 修掉一個讓整條流程無法完成的缺口：回呼的 `parseFlow` 自己維護一份 flow 白名單而漏了
  `join_link`，任何瀏覽器都會失敗。型別現已從該清單推導，兩者不可能再各走各的。
- **封存社員頁** `[>]`（PR #103）。停用社友移出主名單，依封存時間新到舊排序。
  新增 `club_memberships.archived_at`，停用時寫入、復原時清空；既有資料由 `audit_logs` 精準回填，
  查無紀錄者顯示「時間不明」而不是誤導的日期。
- **社務頁與年度服務計劃** `[>]`（PR #111、#124、#139）。V2 加入社員服務、職業服務、社區服務、國際服務四個固定分類、
  年度目標、執行成果、下一步與社員參與方式，以及管理模式的草稿／發布工作台。實測 staging 舊版社務頁在未指定年度時會因
  `date`／`integer` 型別錯誤顯示載入失敗；#139 的 forward-only 修正已隨本次 Go-Live 發布，仍待草稿隔離真人驗收。
- **用地址查活動座標** `[>]`（PR #113、#118）。移植自 `ask-how-i-charge` 的 geocoding server function；migration 同號問題已修正為 `20260914000900` 並已進 staging，待地址查詢真人驗收。
  保留語言區域鎖台灣、同一地址多種寫法輪流試、偏好台灣範圍內的結果；
  改為金鑰只在 `server-only` 模組讀取、十秒逾時、未設定金鑰時明確回報而非看似故障。
  查詢閘門用新增的 `current_can_manage_club_events`——每次查詢都是計費請求，
  沒有閘門任何登入社員都能拿社團金鑰當免費服務。
- **編輯已發佈的活動** `[>]`（PR #126）。發佈後只能取消重開的限制解除了。
  編輯沿用建立表單的驗證，所以編輯不可能產生一個當初建立時會被擋下的活動；
  表單帶著開啟時的 `version` 送出，兩位幹部同時編輯不會互相覆蓋。
  已取消或已結束的活動是歷史，直接拒絕；`p_ends_at <= now()` 也拒絕，
  否則「編輯」會變成另一種取消。名額不能改到低於目前報名人數——
  這裡沒有任何資訊可以決定誰該失去位子，所以它拒絕，而不是替你挑一個。
  **只有時間或地點變動才推播**，那是社員必須據以行動的兩件事；改錯字不會吵到任何人。
  因為同一個活動現在可能合法地被推播多次，推播去重的鍵從「每個活動一次」
  改成「每個活動版本一次」。推播失敗不會讓編輯失敗——走到推播時資料已經存好了。
- **LINE Rich Menu** `[>]`（PR #107）。每社獨立設定與旗標已部署到 staging，仍待各社 OA 設定與真人驗收。
- **社費、收款、核銷與財務報表** `[>]`（PR #108）。核心程式與資料庫已部署到 staging，仍待 hosted／角色邊界驗收。
- **生日設定 UX** `[>]`（PR #110）。生日頁沿用全域社別、每社預設公開且保留既有缺列私密語意，並補上徵集重複時的可理解錯誤提示；程式已部署到 staging。
  `a4fd0d6` 另修正生日設定被通用隱私開關誤藏的問題，已由登入 staging 的 LEO 帳號確認 `/me` 顯示 PANCHIAO-ELITE／HAPPY 各自設定入口；仍待另一帳號、關閉後牆面消失與完整儲存回歸。

### 修正

- **社員／社務管理模式邊界** `[x]`（PR #130）。管理路由、出席管理操作與回跳會保留
  `mode=management`；社員模式仍維持社員可見範圍，管理頁不會因導覽或表單提交掉回錯誤模式。
  PR 已合併至 `main`，Browser Smoke `34871617599` 全部通過；沒有新增 migration，已隨 Go-Live `34912921064` 部署 staging。

- **活動推播版本契約** `[x]`（PR #132）。活動編輯現在會把剛儲存的 `event.version` 傳給推播 RPC，並移除會繞回舊規則的 7 參數 overload；推播函式權限重新受 `line_oa_event_push_v1` 控制。PR 已合併至 `main`，新增 migration `20260915000100_event_push_version_contract.sql`，已隨 Go-Live `34912921064` 部署 staging。

- **活動切換社團的公開網址** `[x]`（PR #135）。實測發現 staging 反向代理下，社員切換社團的 redirect 會帶出內部 `0.0.0.0:10000`，導致畫面連不上；修正後統一使用受信任的公開站台網址，仍保留原有登入、社別與後端權限檢查。PR 已合併至 `main`，沒有新增 migration，已隨 Go-Live `34912921064` 部署 staging。

- **社務頁目前年度預設值** `[x]`（PR #139）。`current_rotary_year_start()` 回傳日期，但社務 RPC 的 `target_year` 是整數；頁面沒有傳年度時會在資料庫執行期失敗。新增 migration 從 PostgreSQL 現有函式定義只替換這個宣告，改用 `extract(year ...)::integer`，保留原有權限與投影；資料庫 verification 也會阻止錯誤宣告回來。PR 已合併至 `main`，已隨 Go-Live `34912921064` 部署 staging。

- **全站時間顯示改台北** `[x]`（PR #105）。頁面在伺服器渲染，`Intl.DateTimeFormat` 未指定時區即用
  伺服器時區（Render 為 UTC），**21 處**因此把 UTC 當成本地時間顯示，差 8 小時。
  現由單一常數統一，並有測試掃描原始碼擋下任何未指定時區的格式化。
- **活動列表四項** `[x]`（PR #104）。排序改為新到舊；已取消活動對社員隱藏（幹部仍可見）；
  活動說明保留 organiser 的換行分段；標題列按鈕不再折行。
  **後果**：已報名社員不會再從活動頁看到「這場取消了」，該通知走訊息中心與 LINE 推播。
- **首頁與導覽** `[x]`（PR #106、#117）。底部導覽從四項擴為五項（新增「互動」），
  本輪再加「社務」成為六項。首頁移除重複第三次的社名徽章、空狀態收斂成一行。
  **這反轉了本文件 §2 記錄的「社員第一層固定為四項」**；`role-shells.ts` 註解已寫明改動日期與理由。

### 過程中值得記錄的事

- 「四項導覽」這個決定被寫在**五個地方**（註解、單元測試、兩處 E2E `toHaveCount`、一處「互動不存在」
  的反向斷言），花了三輪 CI 才清完，因為每輪只浮現下一個。
- geocode 的 migration 編號與社費 migration 撞號；staging dry run 先攔到遠端順序落差，後續 clean reset 也證實同號。
  PR #118 已把尚未套用的地點 migration 移到 `20260914000900`，並加上 path-exact 的一次性修復白名單。

### 本輪交付後待真人驗收

以下每一項都需要有人看畫面或動手，我無法代為確認；程式已部署 staging，但「已部署」不等於真人驗收完成：

- `[>]` **公開加入連結的關閉行為**。已有四位真人成功加入，但**按「關閉連結」後再點同一條是否失效**
  還沒驗過。那個開關是這個功能唯一的控制，必須確定它真的有效。
- `[>]` **封存社員頁**。停用社友是否已移出主名單、封存時間是否正確（既有資料是回填的）、
  以及**復原一位社友後封存時間是否被清空**。
- `[x]` **年度服務計劃 V2 的草稿隔離**（Staging Management Acceptance `35456938712`）。
  使用獨立一般社員帳號驗證：PR #124 已部署；社員看不到幹部草稿，
  只看到「本年度的服務計劃尚未發布」。2026-09-16 以 staging 的 LEO 秘書帳號抽查：社員頁確實只看到未發布提示；
  `/clubs/{clubId}/service-plan` 與 `?mode=member` 會被導向無法存取，只有 `?mode=management` 顯示管理工作台。
  同日已在管理工作台儲存四大分類的明確 staging 驗收草稿；切回社員模式後草稿標題沒有出現，仍只顯示未發布提示。
  隨後短暫發布該草稿，社員頁成功顯示四類內容，再儲存回草稿後恢復未發布提示；staging 現在維持未發布狀態。
  這已證明模式邊界、「未發布不外洩」與發布／撤回流程；staging 現在維持未發布狀態。
- `[>]` **首頁活動封面**。需要該活動已上傳封面才看得到。
- `[>]` **用地址查座標**。`GOOGLE_MAPS_API_KEY` 已於 2026-09-14 設入 Render staging，migration 與目前 release 已部署；
  尚待在活動表單輸入地址，確認台灣地址能正確填入座標，並確認一般社員不能觸發計費查詢。
- `[x]` **編輯已發佈活動的通知邊界**（2026-09-15 真人驗收通過）。只改說明 → 沒有推播；
  改時間 → 有推播；原本有座標的活動編輯後座標仍在。三項都由社長實機確認。

  **驗收前先修掉兩個缺陷**，兩個都是 #126 留下的，是按下「編輯」才發現的：

  1. **編輯頁從上線第一天就是 404**。`list_club_events` 回傳的鍵是 `id`，頁面找的是
     `event_id`，`find()` 永遠找不到，於是每個活動都走 `notFound()`。沒有任何東西會失敗——
     `notFound()` 本來就是合法回應——所以它通過了 CI、合併、部署，而沒有人能打開它。
  2. **如果不是 404 擋著，編輯會清掉活動座標**。`list_club_events` 只回傳
     `venue_location_set` 布林值（社員不該讀到場地經緯度），但編輯頁讀的
     `venue_latitude` / `venue_longitude` 任何 function 都沒有輸出，所以表單永遠空白、
     儲存時會把座標寫成 null——那正是地址查座標要存的東西。已改成只回傳給有管理權限者。

  **教訓**：隨 #126 上線的測試是字串比對 migration 與表單原始碼，那兩個檔案都沒提到編輯頁。
  新增的 `edit-page-contract.test.ts` 改成比對兩邊——頁面查找用的欄位、型別宣告的每個欄位，
  對上函式實際輸出的鍵。而**那條守則的第一版自己也是空的**（只讀 `target.<field>`，沒覆蓋到
  `find()` 的查找條件，而缺陷正在那裡），把 bug 放回去測試仍然是綠的，重寫後才真的會紅。
- `[>]` **E-03 的另一半**，見上。
- `[>]` **PR #135 的 staging 回歸**。已部署；仍要重新切換兩個社團，確認瀏覽器留在公開 HTTPS 網址且資料只切換到所選社團。

## 外部處理待辦（唯一清單）

以下項目不能只用本機測試或 GitHub CI 宣稱完成，必須有 LINE、Render、手機、真人或產品決策的證據。
後續更新請先改這一節，再同步開發地圖與交接文件。

### E-01 Flex 卡片 staging 發布與真人收訊 `[x]`

- **目前證據**：程式、migration、旗標、權限邊界與本機 E2E 已完成；PR #98 已合併至 `main` merge commit
  `55047dd1f2d936a5147458fd16faa5038b068c3d`。Staging Release Plan `34686603765` 與 Go-Live
  `34686702234` 已以同一個 `main` exact SHA `fbdc061dd702f453ab340bd595279223487d0838` 成功完成；staging
  `/api/health` 為 `revision=fbdc061dd702`、`status=ok`、`issues=[]`、`warnings=[]`，最新 migration 已是
  `20260912000200_line_oa_flex_templates_flag.sql`。
- **旗標已開啟（2026-09-12）**：平台管理帳號在本機 checkout 執行
  `npm run flags:enable:staging -- line_oa_flex_templates_v1`，CLI 回報
  `1 flag(s) enabled for staging: line_oa_flex_templates_v1`。執行前 `inspectBootstrapTarget`
  已確認 `target=staging`、`errors=(none)`，連線的是 staging 專案 `vmmzdautcsgknhyqrsto`，
  不是 production 的 `xglsrxfnxsmiwtfhbdqg`。密碼由終端機隱藏輸入，沒有進 `.env.staging`、
  shell history 或 process list。
- **真人收訊已通過（2026-09-12）**：旗標開啟後管理頁出現卡片格式選擇與卡片預覽；以 AudiencePicker
  指定單一測試社員、用 `multicast` 傳送，**三種模板（社務公告、活動提醒、生日祝福）各送出一次，
  真人手機三張 Flex 卡片全部實際收到**。管理頁推播紀錄顯示 12:31–12:35 之間的測試列狀態全為 `sent`。
- **本輪確有一筆全社 broadcast**：推播紀錄 12:32 有一列 `broadcast`、`recipient_count=3`、狀態 `sent`，
  不是指定對象。安全界線寫的是「不用全社廣播做第一次測試」，這筆與該界線不符；staging 該社只有
  3 個測試 follower，影響有限，但不應在 production 重複，紀錄於此以免日後誤以為從未發生。
- **provider request id 已核對（2026-09-12）**：以 Supabase SQL editor 直接查 `line_push_logs`，
  三筆 Flex 測試列都是 `delivery_status=sent` 且帶 LINE 回應的 request id：
  `12:34:21` → `fa3d57e5-fa59-4b1e-9842-2f569162f07a`、
  `12:34:29` → `4c9fefab-b79a-481d-8b91-beb19baaf07a`、
  `12:35:18` → `bd1d5962-5f7b-47cc-afaa-9ae41024ad17`。
  這證明 LINE 端確實受理了這三則訊息，不只是本地寫了一列紀錄。
- **已知限制（不是本項的 blocker）**：request id 與 `failure_code` 只存在資料庫，
  `get_line_oa_admin` 只投影 `id／kind／recipient_count／status／created_at`，所以管理頁查不到。
  幹部遇到推播異常時，畫面只有 `sent`／`failed`，要對照 LINE 端得另外查資料庫。
  要補進畫面需要新的 migration 擴充投影，尚未決定是否要做。
- **旗標開啟前的核對（2026-09-12）**：已登入的 staging 管理頁可正確切到 `PANCHIAO-ELITE`，可看到
  3 筆仍在追蹤且已配對的 follower 與既有推播紀錄；當時旗標關閉，管理頁不顯示 Flex 模板操作區，
  這是「旗標關閉時不會送出 LINE 請求」的畫面層證據。
- **權限說明**：瀏覽器裡登入的社務管理員帳號開啟 `/platform/clubs` 仍會被後端拒絕並導向
  `/access-denied`；平台旗標只能由具 `platform_admin` 或 `superadmin` 的帳號，在有 `.env.staging`
  的本機 checkout 用上方 CLI 設定。這條限制沒有放寬。
- **完成證據**：staging `/api/health` 的 revision 與 Go-Live exact SHA 相符、`issues=[]`；管理頁可預覽並指定測試 follower
  發送；`line_push_logs` 為 `sent` 且有 provider request id；旗標關閉時沒有 LINE API 請求。
- **安全界線**：不開 production、不把 token 放進 repo、不用全社廣播做第一次測試。

### E-02 生日邀請 LINE 實際送達 `[x]`

- **先前無收件人的紀錄（歷史）**：scheduler protected route 的 run `34673612440` 曾回報成功，但
  `generated_count=1`、`notified_count=1`、`line_push.jobCount=0`、`sentCount=0`；那次只證明排程路徑，不能取代後來的真人送達驗收。
- **`jobCount=0` 的根因已查明（2026-09-12）——不是 bug**：該次 run log 顯示
  `line_push.status="sent"`，代表 `line_oa_event_push_v1` 是開著的，是
  `list_birthday_collection_line_push_jobs` 真的回傳 0 列。以 staging 資料庫逐環比對
  （`20260911000200_birthday_collection_line_push.sql:27-51` 的 inner join 鏈）：

  - 整張 `birthday_wish_collection_notifications` 只有一列，建立於 **2026-09-01**，
    `notification_status='sent'`；9/12 那次的 `notified_count=1` 是冪等沿用這筆舊通知，沒有新建。
  - 這筆通知屬於 **`HAPPY`** 社（`4ae968fc-80c2-49b4-ae5c-49ea4721e012`），訊息 `status=active`，
    收件人 3 位（`birthday_participant_id` 非空），**沒有**既有 push log。
  - 斷點在 follower 那一環：HAPPY 的 `line_oa_followers` 只有一列，`person_id` 為 `null`、
    狀態 `unpaired`，所以該社已配對且仍追蹤的 follower 數是 **0**。
  - 三位已配對的 follower 全部屬於 **`PANCHIAO-ELITE`**（`3df4b471-40e1-494e-a3ce-9f7285500eb0`），
    與這筆生日通知不是同一個社。

  收件人在該社沒有配對的 LINE 身分，投影取不到人，`jobCount=0` 是正確行為。**不要為了讓數字變好看
  而放寬這條 join**——那會把訊息送給沒有配對關係的 OA 使用者。
- **還有第二層阻擋**：即使 HAPPY 有配對 follower，`loadClubOaDispatchContext` 仍會失敗，因為依 E-04
  HAPPY 必須有自己的 `LINE_OA_HAPPY_*` 憑證而目前沒有。流程在第六環就斷了，還走不到這一層。
- **殘留資料**：`U888f7e17b71176bbec3c662ab24d4e33` 同時出現在兩社——在 HAPPY 是 `unpaired`、
  在 PANCHIAO-ELITE 是 `following`。研判是先前 OA 設錯社留下的，與本項驗收無關，但不應誤認為
  HAPPY 已有可用 follower。
- **外部動作（已依根因修正）**：本項要在 **PANCHIAO-ELITE** 做，不是 HAPPY。排程挑選條件是：該社有
  active `club_manager`，且有社員的生日落在**下一個日曆月**（以社的時區計算），且該社員
  `birthday_visibility_preferences` 為 `is_listed=true` 且 `allow_wishes=true`。
  權威來源是 `20260901000200_birthday_collection_dispatch_lead_month.sql:131-132`
  （`birthday_date >= date_trunc('month', local_today) + 1 month` 且
  `< + 2 months`），**不是**已被它取代的 `20260824000900` 的
  `local_today + 7`；`dispatch-lead-month-boundary.test.ts:19` 明文斷言新 migration
  不得再出現那個 7 天窗口。因此在 2026-09 執行排程時，要準備的是一位**生日在 2026 年 10 月**、
  且已配對並仍追蹤 PANCHIAO-ELITE OA 的測試社員，再執行一次 scheduler，確認手機收到邀請；
  然後重跑一次確認不重送。
- **這也解釋了既有的 HAPPY 通知**：它建立於 2026-09-01，對應的是 10 月生日批次；9/12 那次
  `generated_count=1`、`notified_count=1` 是對同一個批次冪等重算，沒有新建通知。
- **已完成（2026-09-12）**：卡關的兩個成因都排除後完成驗收。

  1. 生日徵集任務原本只存在於 `HAPPY`，該社沒有已配對 follower。改在 `PANCHIAO-ELITE` 測試。
  2. 壽星 `LEO` 雖同時具兩社社籍且生日在 10 月，但在 `PANCHIAO-ELITE` **沒有**
     `birthday_visibility_preferences` 列，而排程對該表是 inner join，缺列即整個排除。
     由該社員自己在 `/birthdays`（社別切到板橋群英扶輪社）勾選「在同社生日名單顯示我的月、日」
     與「允許同社社員寫生日祝福」後，排程才看得到他。

  驗收證據：

  - Scheduler run `34695450977`：`generated_count=2`、`notified_count=2`、
    `line_push.status="sent"`、`jobCount=1`、`sentCount=1`、`failedCount=0`。
  - `line_push_logs` 對應列：`recipient_count=2`、`delivery_status=sent`、
    `provider_request_id=08cd7796-f03d-4e33-83cc-8c1c2ec77de5`。
  - 收件人是 `TEST`（`U9e384ed2…`）與 `Michael`（`Ud0f5fa44…`）；**壽星 `LEO` 不在收件人內**，
    符合「不會被指派替自己寫祝福」。
  - **真人收訊**：`Michael` 的 LINE 實際收到「本月生日祝福任務／您有一則生日祝福任務，
    請打開生日祝福徵集完成它。」
  - **重跑不重送**：run `34695655038` 的 `generated_count`／`notified_count` 維持 2，但
    `jobCount=0`、`sentCount=0`。冪等閘門（`push.id is null` 加
    `line_push_logs.source_message_id` 的 partial unique index）正確擋下第二次推播。
- **新文案與可點連結已驗收（2026-09-13）**：PR #99（`20260912000300`）把邀請改寫為
  「有位社友的生日快到了／這個月輪到您為他寫一段生日祝福。題目我們已經準備好了，點開挑一題、
  寫上幾句話就完成。」，並在 LINE 文字末端附上由 `action_path` 組出的絕對網址。
  Staging Go-Live `34707246035` 部署（`/api/health` revision `4d4ba285d967`、`issues=[]`），
  scheduler run `34708351703` 回報 `jobCount=1`、`sentCount=1`、`failedCount=0`，
  `Michael` 的 LINE **實際收到新文案，連結可點且正確導向生日徵集頁**。
- **驗收過程中確認的兩條產品規則**（都不是缺陷，不要為了測試方便繞過）：
  1. `birthday_campaign_recipient_year_unique`：每位社員每社每年只有一個生日徵集。
     要在同一年替同一位壽星再建一次會違反約束；本次改用生日年份 2027 才通過。
  2. 邀請的收件人是被指派寫祝福的其他社員，壽星本人不會收到替自己寫祝福的邀請。
- **完成證據**：第一次有實際 LINE 收件、推播紀錄為 `sent` 且有 provider request id；未配對、取消追蹤、關閉通知者不收件；第二次不重送。
- **未逐項驗證的部分**：「取消追蹤」與「關閉通知」兩種情形沒有另做對照測試。僅間接觀察到 `HAPPY`
  那列 `person_id` 為 null、狀態 `unpaired` 的 follower 全程沒有收到任何訊息。要正式主張這兩條規則，
  需要各自建一個對照案例；本項以「實際送達與不重送」結案，不宣稱已涵蓋全部負向情境。
- **目前不需再做**：GitHub `birthday-scheduler` 與正確 Render staging service 的 secret 已同步，不能再把「secret 不一致」當成目前原因。

### E-03 LINE Login 身份的 follow 自動配對真人驗收 `[>]`（暫緩解除）

- **2026-09-16 hosted 正向補充**：同一個 staging 會員帳號的 `/me/line-oa` 顯示「已完成好友與社員身份確認」；
  社務管理頁的 follower 清單也把已配對的 `U888f7e17b…` 投影為 `LEO`。這支持目前帳號的正向身份投影，
  但仍沒有足夠證據證明最近一次 follow 事件就是這個本人操作，也未涵蓋多社／外社／停權／退社負向情境。
- **2026-09-16 稽核時間線補充**：同一社的 Audit Log 顯示 `line_oa.auto_paired`（10:00:12），
  但之後又有兩筆 `line_oa.bulk_paired`（10:18:26、10:18:49），以及 LEO 的
  `line_identity.unbound` 與 `membership.status_changed`（11:53）。因此目前 LEO follower 雖然仍顯示已配對，
  不能把它當成「該次 follow 自動配對到 LEO」的乾淨證據；需要重新準備未被人工批次配對／解除綁定污染的測試帳號與事件窗口。
- **2026-09-14：暫緩解除，因為證據自己出現了。** 公開加入連結上線後，`PANCHIAO-ELITE` 的 audit log
  出現四筆 `club_join_link.redeemed`（Ethan T.、Maggie佳佑、Green Chen陳冠青、承希✨Olivia），
  中間夾著兩筆 `line_oa.auto_paired`。真人透過 LINE 加入本社，自動配對路徑實際被觸發。
- **這證明了什麼、沒證明什麼**：證明 webhook 的 follow 事件走到了自動配對，不是死路。
  **沒有**證明 `person_id` 指向的是正確的那個人——audit log 只記錄配對發生，
  不記錄配對對不對。要主張這一條，仍然需要有人核對後台顯示的姓名與實際加入者相符。
  多社、外社、停權與已過 `ended_on` 的誤配情境同樣仍未驗證。
- **原先決策（2026-09-13）**：產品曾決定暫緩本項驗收。程式與旗標當時維持現狀，不因暫緩而關閉。
- **暫緩期間的已知狀態與殘留風險**：`line_oa_auto_pairing_v1` 在 staging 是開著的，webhook follow
  事件會自動配對 follower。程式、migration、日期窗口防護與單元測試都已完成並部署，但
  **「LINE Login identity 精確對上正確社員」這件事沒有真人證據**。也就是說，自動配對目前是
  「已上線但未經真人驗證」的狀態，不是「已驗證正確」。多社、外社、停權與已過 `ended_on`
  的誤配情境同樣未驗證。
- **重啟時機**：production 上線前必須完成；或在 staging 出現配對錯誤（後台顯示的姓名與實際加入者
  不符）時立即重啟。
- **重啟後的外部動作**：找一位已用同一個 staging LINE Login channel 登入過的社員，切到該社員所屬社，加入同一社 OA；記錄加入前後 follower 狀態，不手動下拉配對。
- **完成證據**：follow webhook 成功、`person_id` 自動指向正確社員；再驗證多社、外社、停權與已過 `ended_on` 的社員不會誤配。
- **必要條件**：LINE Developers Console webhook／Use webhook 維持開啟，測試者必須使用真實 LINE 帳號與正確社別 OA。

### E-04 每社 LINE OA 與 channel 設定 `[x]`（本次 rollout；staging 殘留資料待處理）

- **產品決定已確認**：本次 rollout **不使用 HAPPY**，目前只啟用 `PANCHIAO-ELITE`；因此本階段不建立
  `HAPPY` 的 OA、channel、webhook 或 `LINE_OA_HAPPY_*` secrets。
- **已完成**：`PANCHIAO-ELITE` 使用 `LINE_OA_PANCHIAO_ELITE_*`，staging 的管理頁身份驗證已成功。
- **2026-09-16 staging 實際核對發現矛盾**：登入管理頁切到 `HAPPY` 時，仍看得到該社的 OA metadata、
  `LINE_OA_HAPPY_*` namespace、4 位 follower 與既有推播紀錄。這不能當成 production rollout 證據，
  但也不能再寫成「staging 沒有 HAPPY 設定」；目前先視為舊的 staging／mock 測試殘留，未執行停用或刪除。
  在產品明確決定前，不對 HAPPY 發送訊息、不發布 Rich Menu，也不把 HAPPY 的資料當成驗收證據。
- **安全保留**：未來若要啟用 HAPPY，必須建立 HAPPY 自己的 OA／Messaging API channel、自己的 webhook 與
  `LINE_OA_HAPPY_*` server secrets；不能把 PANCHIAO 的 key 改名或跨社 fallback。
- **完成證據**：本次啟用的社通過 LINE `/v2/bot/info` Basic ID 核對、webhook Verify、follow 與指定對象推播驗收。

### E-05 LINE 推播額度與超額政策 `[x]`

- **產品決策已確認**：超額／429 時停止後續批次並提示社務管理幹部；不把剩餘批次繼續送出。既有一次同 retry key 的安全重試保留給可恢復的 provider 回應，重試後仍是 429 就停止。
- **程式已完成**：429 分類、部分送達紀錄、停止批次、手動送出頁提示，以及管理頁最新額度提醒均已具備；提醒只給 `oa.read` 管理者，不進一般社員的訊息中心。
- **完成證據**：本機單元測試已驗證 500 人分批、429、重試與部分送達；資料庫 verification 檔已新增，完整 `npm run verify:db`、fixture bootstrap、migration guard、verification manifest 均已通過。Staging Go-Live `35445662577` 與額度專項 `35445780317` 使用同一個 exact SHA；合成 rate-limited UI 驗收確認管理幹部可見、一般社員不可見，且 cleanup 成功。沒有用真實社員做壓力測試，也沒有消耗正式額度。

### E-06 登入後管理頁效能量測 `[>]`

- **2026-09-16 已建立登入後基線**：同一個已登入 Chrome session、PANCHIAO-ELITE、viewport `1365×813`、DPR `1`、CPU `1x`、未限速；量測當時 staging runtime `1ef38bb50407`，目前已部署 runtime 為 `36f32f8a44e1`。
  管理頁 LCP `1,777 ms`、FCP `760 ms`、LCP TTFB `637 ms`、CLS `0.00`；社員首頁 LCP `1,929 ms`、FCP `562 ms`、
  LCP TTFB `452 ms`、CLS `0.01`。兩頁 INP 均為「未量測」。
- **目前真正找到的改善方向**：社員首頁的 LCP 圖片 `/hero-mountains.webp` 藏在 CSS background，資源發現延遲
  `1,319 ms`；管理頁另有文件請求延遲洞察估算 `532 ms`。`bd8a8e9` 先把 hero 改成社員首頁限定的 `<img>`，但 hosted
  DOM 曾有兩個相同 preload；`36f32f8` 改用 `next/image` 單一元件管理 preload，最新 staging 已核對為單一提示。管理頁後續仍要拆出
  文件等待與 render pipeline。
- **staging 最新 DOM 驗收**：社員頁圖片 DOM `1` 張、preload `1` 個（body 1、head 0）。本機完整檢查與 `member-home-1440` `3 passed`；
  這只證明圖片提示修正已部署，不代表整體 CWV 前後比較完成。
- **2026-09-16 修改後補測**：真實 LEO 社員頁在同一個 Chrome session、PANCHIAO-ELITE、viewport `1365×813`、DPR `1`、CPU `1x`、
  未限速下，DevTools 顯示 LCP `1.30 s`、CLS `0.01`，LCP 元素為 `img.member-portal-module__wpzd3a__backdropImage`；FCP、TTFB、INP 未量測。
  DevTools「停用網路快取」未勾選，且測量 runtime `bd8a8e9d0205` 不同於修改前基線 `1ef38bb50407`，所以不能宣稱因果改善。
- **尚未結案原因**：單一 preload 修正已部署且 hosted DOM 已驗證；還缺同一 runtime／快取條件下的 FCP、TTFB、LCP 前後比較，並需再測管理頁，
  所以不能把 DOM 修正直接當成整體效能完成。
- **完成證據**：同一帳號、同一社、同一網路條件，取得修改前後 TTFB、LCP、FCP；紀錄測試時間與快取狀態，沒有數字就標「未量測」。完整條件與限制見 [`PERFORMANCE_IMPROVEMENT_LOG.md`](./PERFORMANCE_IMPROVEMENT_LOG.md)。

### E-07 iOS／Android 實機與 M1 使用者測試 `[ ]`

- **外部動作**：用 iOS Safari、真實 Android Chrome，以及至少五位社員／幹部測試登入、導覽、簽到、生日祝福、LINE OA 導引與管理流程。
- **完成證據**：逐項記錄裝置、瀏覽器、網路、結果與問題；自動化 Chromium 不能取代實機與訪談。

### E-08 production 上線準備 `[!]`

- **待產品／平台決定**：production 是否開啟各功能旗標、production LINE OA／Login channel、生日 scheduler、額度與維運責任。
- **必要動作**：確認 production 備份／還原點、HTTPS 網域、server secrets、migration plan、人工核准閘門與回復步驟。
- **安全界線**：本清單更新前 production 沒有修改；任何 production 操作要另開明確 release 任務。

### E-12 staging 受控 logical backup `[x]`

- **限制仍在**：staging Supabase Free 方案沒有內建 project backup／PITR；因此採用受控匯出，不把它誤稱為 Supabase 原生備份。
- **已完成**：`.github/workflows/staging-logical-backup.yml` 固定 staging project／Render host，只接受 `main` exact SHA，
  並要求 staging environment 核准。workflow 匯出 `public` schema 與 data-only dump，使用 X.509 recipient certificate 加密後才產生 artifact。
- **最終證據**：backup run `34912448897` 成功；artifact `10374966439` 已下載本機並完成 checksum 與本機解密驗證，
  archive 內含 schema／資料及 `club_events`、`line_push_logs`。驗證後已刪除明文檔與 GitHub artifact，並確認 artifact 不存在。
- **保存規則**：目前只保留本機加密 payload、checksum，以及權限為 `600` 的 private key／recipient certificate，位置為
  `~/Documents/Rotary-Staging-Backups/2026-09-15/`；不提交 repo、不把明文資料留在 GitHub。不要刪除解密材料，否則無法還原。
- **與 Go-Live 的關係**：Go-Live `34912921064` 以 `BACKUP-READY`、plan `34912834525` 與同一個 exact SHA 完成；
  migration apply、部署、health、HTTPS smoke 與 hosted member acceptance 全部成功。production 仍未修改。
- **後續規則**：之後若 migration 會刪除／改型別／搬資料，仍要在 Go-Live 前重新做一次受控匯出並驗證；production 不得直接沿用 staging 的權宜方案。

### E-09 Recovery email 與 custom SMTP `[!]`（暫緩）

- **目前決策**：登入以 LINE 為主，recovery email 暫不重啟，不列為目前 release blocker。
- **重啟條件**：production 上線前，或密碼登入比例上升／社員回報重設失敗。
- **重啟後驗收**：設定 custom SMTP，完成「收到新信 → 點信 → 確認 → 更新密碼 → 重新登入」真人流程；不可用 Mailpit 代替。

### E-10 雙重社籍／跨社執行秘書真人驗收 `[>]`

- **目前證據**：程式與資料庫規則已在 `main`／staging；同一個人可有多社有效社籍，也可同時擔任執行秘書，且社籍本身不會自動變成管理權限。
- **2026-09-16 正向 staging 驗收**：同一個已登入帳號在社員模式切換 `PANCHIAO-ELITE` 與 `HAPPY`，
  首頁活動、社團訊息連結與 `clubId` 都跟著目前社別切換；再進管理模式，兩社都只顯示各自的管理網址與資料。
  這證明「多社切換＋社員／社務模式」的正向路徑；沒有把它誤列為完整結案。
- **2026-09-16 模式邊界補充**：同一個 staging LEO 帳號在 `/dashboard?mode=member` 只看到社員導覽，沒有「社員管理」入口；直接開啟
  `/clubs/{clubId}/members?mode=member` 會被導向 `/access-denied`。這補強社員模式的後端拒絕證據，仍未取代多社／停權／退社帳號驗收。
- **2026-09-16 本機負向補強**：新增退社社員 fixture，`role-shells-1440` 測試確認撤銷管理者、停權社員與退社社員都被導向
  `/access-denied` 且沒有主要導覽。這只證明本機 fixture 下的行為，staging 仍需真實多社／停權／退社帳號。
- **2026-09-20 深連結同步修正已發布**：`425a166e` 讓 `/clubs/<clubId>/...` 的 route 社別成為經本人社團 projection
  驗證後的顯示偏好，避免內容是 A 社、側欄卻是 B 社。staging 直接開 HAPPY 與 PANCHIAO 的管理活動網址均已唯讀核對一致；
  這是正向深連結證據，不取代下面的負向角色矩陣。
- **外部動作**：準備一個同時具兩社有效社籍、其中一社另有執行秘書權限的 staging 測試帳號，實際切換社別與模式；再測外社執行秘書、停權／退社帳號。
- **完成證據**：每個社只看到自己的資料；社員模式與管理模式能正確切換；沒有管理權的有效社員不能進管理頁；停權／退社不能取得原有權限。

### E-11 LINE Rich Menu／完整 OA 整合 `[>]`

- **目前證據**：Rich Menu 程式已在 PR #107 合併至 `main`（merge `1164f763`），並隨 Go-Live `34912921064` 部署 staging；
  外部 OA 設定與真人驗收仍未完成，不是本輪 staging blocker。
- **2026-09-16 實際核對**：以已登入的 PANCHIAO-ELITE 社務管理頁檢查，畫面沒有 Rich Menu 發布區；
  這與 `line_rich_menu_v1` 尚未開啟相符，也表示目前沒有可宣稱的圖片上傳、LINE 發布或手機驗收結果。
- **素材準備（2026-09-16）**：已將使用者提供的 2×2 設計另存為 `2500×1686` JPEG、
  `486,768 bytes`；原始檔未覆蓋。這只完成圖片格式／尺寸門檻，尚未上傳平台、發布到 LINE，
  也尚未把「社團首頁／活動報名」改成較短的介面文案。
- **外部動作**：產品先決定各社 Rich Menu 的入口與文案；開發完成後，由各社在自己的 LINE OA／Messaging API channel 設定並驗證 menu、URI 與權限邊界，不共用其他社的 OA。
- **完成證據**：每個啟用的社都能在自己的 OA 看到正確 Rich Menu；登入／社別切換不會把 A 社入口導到 B 社；停用旗標或未設定 OA 時不會送出錯誤連結。

## 非外部開發待辦

這些是需要另外開發與驗證的產品功能，不應誤寫成「等外部設定」：

- `[>]` 社費、收款與核銷（應收、部分收款、代墊、核銷）已在 PR #108 合併並包含在目前 staging，待 hosted／角色邊界驗收。
  2026-09-18 已開啟 staging `dues_finance_v1`；下一步是用具 `finance.read` 的社務帳號驗收管理頁、社員個人查詢、報表、空資料與跨社拒絕。
- `[>]` 報表與匯出（社員、活動、出席、財務 Excel／PDF）已在 PR #108 合併並包含在目前 staging，待 hosted／權限與空資料驗收。
- `[>]` LINE Rich Menu 與完整 OA 整合已在 PR #107 合併並包含在目前 staging，待各社 OA 外部設定（見 E-11）。
- `[>]` 手機 Web App（安裝、離線提示與推播準備）已在 PR #109 合併，待真實手機驗收。
- `[x]` 社務資訊與年度服務計劃已合併至 `main`（PR #111、#124）並包含在目前 staging；hosted 與角色邊界由 `35456938712` 驗收完成。
- `[ ]` 社務 AI 助理（摘要、公告草稿、會議紀錄與授權查詢）；目前沒有可執行企劃或已授權的 AI 服務規格，不能直接開發。

### 生日設定 UX 調整（產品決定 2026-09-12；PR #110 已合併並部署 staging，待 hosted／真人驗收）

實際操作 `/birthdays` 時提出，四項都已在 PR #110 實作並進入目前 staging；尚待 hosted／真人驗收：

- `[>]` **`/birthdays` 不應該可以切換扶輪社**。PR #110 已移除頁面內重複選擇器，改用全域已選社別。
- `[>]` **生日隱私改為預設全部打開**。PR #110 已讓新社籍預設公開，並保留既有缺列資料的私密語意，
  新社籍由 migration 建立明確的公開列；既有缺列不回填，仍維持私密，補生日也不會偷偷公開。
- `[>]` **把生日開關整合進 `/me`**。PR #110 已加入每社獨立的生日設定投影與入口，
  偏好仍以 `membership_id + club_id` 分開識別，雙重社籍可以分社設定。
- `[>]` **生日徵集產生失敗時的錯誤訊息無效**（2026-09-13 實測發現）。PR #110 已加入
  已把「同一社員同一扶輪年已有徵集」轉成可理解的提示，保留每年唯一約束，不放寬資料庫規則。

## 歷史結論（2026-09-16；`1ef38bb` staging Go-Live 後）

截至 2026-09-16，能在 repo 內完成的功能已合併，並以 exact SHA 完成 staging Go-Live；仍要把 hosted、
真人、實機與產品決策分開記錄。GPS 精度政策已決定（不設 accuracy 門檻），密碼 recovery 依產品決定暫緩；
自動化檢查也不能取代 E-03／E-06／E-07／E-10／E-11 的真人、效能與 OA 驗收。

本次 staging release source 是 `main=1ef38bb504075d7a197e99c2364db8b087cea22e`；目前 staging revision 是
`1ef38bb50407`，`/api/health` 為 `status=ok`、`configuration=true`、`database=true`、`issues=[]`、`warnings=[]`。
#107、#108、#109、#110、#111、#113、#115、#117、#118、#119、#120、#121、#122、#123、#124、#125、#126、#127、#130、#132、#135、#136、#137、#138、#139、#145
已進入 main；#124、#126、#127、#130、#132、#135、#139 與 #145 已隨 Go-Live `34912921064` 發布；production 沒有修改。

本輪已補上的 repo 內缺口包括：生日設定 UX／預設公開且保留既有缺列私密語意、財務 PDF 繁中字型、
社務資訊與年度服務計劃、Rich Menu、手機 Web App、社費／報表的獨立 PR、同頁模式導覽修正，以及 migration
同號修復與全樹 collision guard。#107、#108、#109、#110、#113、#115、#117、#118、#119 已進入 `main`；
程式進入 `main` 不代表每項都已完成 staging／真人／實機驗收。#123 已完成 GitHub 檢查、合併，
並已隨 Staging Go-Live `34912921064` 發布；#143／#144／#146／#147 另外完成受控 logical backup workflow，#125、#136–#141 為文件同步。

前一輪產品修補的完整 `CI` `34584379642`、`Browser Smoke` `34584379653` 均成功；Staging Release Plan `34586642034`、
Staging Go-Live `34594381922` 也成功完成，Go-Live 的 migration、HTTPS smoke 與 hosted member acceptance 均通過。
之後 docs-only 文件同步的 `CI` `34583431760`、`Browser Smoke` `34583431873` 僅執行變更範圍分類器，完整 jobs 依 gate 跳過。
產品 release 的 Staging Release Plan `34576631319`、Staging Go-Live `34576829556` 與 Staging Management Acceptance
 `34577046356` 亦已成功完成；執行秘書管理驗收也通過。

PR #98 合併後的 `CI` `34685398379` 已成功；#139 的 PR checks 與合併後 main 的 CI、Browser Smoke 均成功；本輪文件同步前後的 `CI` `34686598214` 與
`Browser Smoke` `34686598210` 均成功，文件變更的完整 database／member-browser jobs 依規則跳過。

先前新增的「管理模式 → LINE OA → 驗證 LINE OA」：伺服器會先檢查 `oa.manage`，再依路由上的該社 `clubId`
讀取該社 server environment
的 access token，呼叫 LINE `/v2/bot/info`，核對 Basic ID 後寫入既有 service-only verification RPC；不把 token
或 LINE 回應交給瀏覽器。Staging Go-Live `34604266568`、CI `34604026419`、Browser Smoke `34604026408` 均成功。
實際按鈕已在 staging 由具有 `PANCHIAO-ELITE` 社 `oa.manage` 的帳號驗證成功；伺服器讀取正確的
`LINE_OA_PANCHIAO_ELITE_*`，LINE Basic ID 核對成功，Webhook 卡片顯示最近簽章有效。社員端切換到
板橋群英扶輪社後，`/me/line-oa` 已顯示加入連結；`HAPPY` 必須另用自己的 `LINE_OA_HAPPY_*`，不應改名或
fallback 給 HAPPY。剩下的是 follow 事件自動配對真人驗收，不是環境變數名稱問題。
之後的 scheduler environment 隔離修正已推到 `main` commit
`6de28163e40bddd812bfc2c43a30fd43e04d006c`；CI `34573685666` 與 Browser Smoke `34573685718`
均成功。管理驗收第一次 run `34575792573` 是驗收腳本誤找不存在的活動卡片；修正為點第一層「活動」導覽後重跑成功。

`68b12a5` 的自動 `CI` `34584379642` 與對應 `Browser Smoke` `34584379653` 均已成功，並已由 `34594381922` 部署到 staging；沒有待核准的同一輪 Go-Live。

生日旗標與正確 Render staging service 的 scheduler secret 已同步；既有排程證據與本次 PR 狀態分開記錄，
不能用舊的 `34673612440` 取代新的 hosted 驗收。production 沒有修改；#188、#189、#190 已合併，#124 與 #125 均已合併，
詳見本文件開頭的最新快照。

## 逐項狀態

### 0. 掃描與工作邊界 `[x]`

- 已以權威 `main`、實際 migration、RPC、verification、TypeScript、測試和瀏覽器流程交叉確認。
- 已保留 PR #61 的 canonical Attendance；沒有採用已關閉 PR #37 的重複 authority。
- 所有新增資料庫 RPC／投影都有對應 verification SQL，並已登錄 manifest。
- PR #40 已關閉，因 base 過時且公告功能已在 `main`，保留的舊分支不能直接合併；目前的 open PR 以文件開頭快照為準。
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

### 生日祝福徵集（核心與排程營運 `[x]`）

生日 V2 核心已完成（新設定預設公開、年齡依出生年份同意顯示、同一作者同一壽星每日最多 10 則、
作者匿名投影與幹部可見）。徵集程式已完成：

- 每月批次與前置一個日曆月排程；
- 每位社員每月最多一則自動邀約的公平分配與冪等鍵；
- 100 題平台題庫、社團題庫 CRUD、題目快照、同批次題目文字不重複與題庫不足時整批停止；
- 徵集任務、參與者、發布／隱藏／重新送出狀態、匿名公開牆與幹部管理介面；
- service-role-only scheduler、訊息通知冪等、feature flag EXECUTE 邊界與 verification。

已完成 staging 外部啟用、排程真人送達與核心驗收：平台管理員透過受保護 CLI 開啟
`birthday_wishes_v2`、`birthday_wishes_collection_v1`；正確 Render staging service 的
`BIRTHDAY_COLLECTION_SCHEDULER_SECRET` 已同步至 GitHub `birthday-scheduler` environment。
歷史 scheduler `34673612440` 因沒有符合條件的收件人而 `jobCount=0`；後續已由
`34695450977` 完成真人送達、`34695655038` 完成冪等重跑驗收，不能用前一筆歷史紀錄覆蓋後來的完成證據。
不能移除 staging 保護。
歷史失敗 run `33121570908`／`33121704322` 保留作為啟用前的追蹤證據；M1 真人使用者測試仍是另一個待辦。

規格請看 [`BIRTHDAY_WISHES_V2_PLAN.md`](../mvp/BIRTHDAY_WISHES_V2_PLAN.md)。

### LINE OA 訊息推播（真實 Messaging API）`[>]`

產品決定（2026-09-02）：本輪先把**真實 Messaging API 接通**。現在 channel access token／secret 已設入
staging，真實 Messaging API、訊息中心公告、活動發布與 webhook 基礎均已完成 staging 真人驗收；生日邀請的
實際送達、follow identity pairing、Flex staging 發布、production 準備、額度政策與 Rich Menu 外部設定仍列在上方 E-01–E-12。

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

#### 外部條件摘要（完整清單以 E-01–E-12 為準）

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
- `[x]` 生日邀請的實際 LINE 送達與重跑不重送已於 2026-09-12 完成，見 E-02；follow identity pairing 的真人驗收已於 2026-09-13 暫緩，見 E-03。
- `[x]` 每月推播額度與超額行為，見 E-05：政策與程式已完成，採停止並提示；受保護 staging UI 專項 `35445780317` 已用合成資料驗收管理幹部可見、一般社員不可見並完成 cleanup；E-04 的本次 rollout 社別決定已完成。
- `[!]` production 憑證、scheduler、旗標、備份與回復流程，見 E-08；`deployment-env.mjs` 已要求
  production 使用 `LINE_OA_MODE=line`。

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

- `[x]` 事件驅動自動推播的**最後一個來源**：生日祝福徵集邀請。程式已完成
  `20260911000200_birthday_collection_line_push.sql`、scheduler route 串接、service-role-only
  收件人投影／推播紀錄、既有 `line_oa_event_push_v1` 明確啟用閘門與單元測試；PANCHIAO-ELITE 的
  scheduler run `34695450977` 實際送達 `Michael`，重跑 `34695655038` 的 `jobCount=0`、`sentCount=0`，
  已完成 LINE 真人送達與冪等驗收。通知目前由 `ensure_birthday_wish_collection_notification`
  （service-role scheduler）建立，沒有登入使用者，所以特別使用 service-role 版本，不擴大前兩條
  `member.manage`／`event.manage` 的權限。
- `[x]` Flex 圖文訊息與訊息模板：`messaging.ts` 原本已支援 Flex payload；本輪新增三種固定卡片模板（社務公告、活動提醒、生日祝福）、管理頁即時預覽、伺服器端旗標與權限重驗證。PR #98 已合併至 `main`，migration 已部署到 staging；staging 旗標已於 2026-09-12 開啟，三種卡片模板均已對指定對象實際送達真人手機，推播紀錄為 `sent` 且帶 provider request id，E-01 已結案。
- `[>]` webhook `follow` 事件自動配對 follower 的 migration、route、verification、flag、日期窗口防護與 staging 部署已完成；
  共用旗標判斷的 fail-closed 修補也已隨 Go-Live `34594381922` 部署；仍待用「曾以 LINE Login 登入的社員加入同一社 OA」驗證精確 identity pairing，以及多社／外社／停權／退社實例。

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

唯一的外部待辦清單是本文件前面的 E-01–E-12；執行順序如下：

1. **E-01：Flex staging 發布與真人收訊** `[x]`：Plan、Go-Live、staging 旗標啟用、三種卡片模板真人收訊與 `line_push_logs` 的 `sent`／provider request id 均已完成，2026-09-12 結案。
2. **E-02：生日邀請 LINE 實際送達** `[x]`：2026-09-12 完成。`PANCHIAO-ELITE` 的邀請實際送達 `Michael` 的 LINE，重跑 `jobCount=0` 不重送；負向情境（取消追蹤、關閉通知）未另做對照測試。
3. **E-03：follow 自動配對真人驗收** `[>]`：2026-09-14 暫緩解除——公開加入連結帶來真實流量，audit log 已有 `line_oa.auto_paired`。仍缺的是「配對到的是正確的人」這一半，需要人核對姓名；負向情境（多社／外社／停權）也未驗。
4. **E-10：雙重社籍與跨社執行秘書驗收** `[>]`：確認社別資料隔離、模式切換與管理權限不越權。
5. **E-06：登入後管理頁效能量測** `[>]`：社員首頁 `36f32f8` 已用 `next/image` 修正 hosted 重複 preload，staging DOM 已確認圖片 1 張／preload 1 個；
   仍要在相同 runtime／快取條件下補齊社員首頁與管理頁的 LCP、FCP、TTFB、INP，再拆管理頁文件等待與 render pipeline。
6. **E-07：iOS／Android 實機與 M1 測試** `[ ]`：至少五位社員／幹部，記錄裝置、網路、結果與問題。
7. **E-05：LINE 推播額度與超額政策** `[x]`：政策為「停止並提示」；staging 專項 `35445780317` 已用 exact SHA 驗收管理幹部提示、社員隔離與 cleanup，未呼叫 LINE API。
8. **E-08：production 準備** `[!]`：另立正式環境 release 任務，不與 staging 驗收混在一起。
9. **E-09：Recovery email 維持暫緩** `[!]`：只有符合重啟條件才做 custom SMTP 與真人信件驗收。
10. **E-11：LINE Rich Menu／完整 OA 整合** `[>]`：程式已合併 PR #107 並隨 `34912921064` 部署 staging，待各社 OA 設定與真人驗收。
11. **E-12：staging 受控 logical backup** `[x]`：`34912448897` 已成功匯出、加密、下載、checksum／本機解密驗證，GitHub artifact 與明文均已清除；
    未來有破壞性 migration 時要重做同樣的受控備份流程。

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

## 前次掃描證據（2026-09-15；#132 合併後）

- `origin/main` exact SHA 為 `4387ee578bef8273a6a59079965f4c3ab2ea6aa9`；#107、#108、#109、#110、#111、#113、#115、#117、#118、#119、#120、#121、#122、#123、#124、#125、#126、#127、#130、#132 已合併，
  目前沒有 open PR。完整狀態與 merge commit 見本文件開頭。
- staging runtime revision 為 `dddf1a51ab67`，2026-09-15 01:55 核對 `/api/health` 為 `status=ok` 且 `issues=[]`、`warnings=[]`；
  Staging Release `34856107965` 與 Go-Live `34856216706` 均以 exact SHA `dddf1a51ab67127bc4fed34876b696346eb0b29d` 完成。
  #123 已包含在這次 Go-Live；#124、#132 已合併但尚未部署，migration `20260914001100_club_service_plan_v2.sql` 與 `20260915000100_event_push_version_contract.sql` 尚未部署。
- #123 合併後主線 Browser Smoke `34855905727` 使用同一個 exact SHA，但結果為失敗：184 passed、38 skipped、1 failed；
  唯一失敗是既有 `line-oa-audience.e2e.mjs` 的「無人完成 OA 配對時拒絕推播」測試，伺服器已回傳
  `audience_unreachable` 的 server-action redirect，但瀏覽器未看到預期錯誤提示。#127 的後續修正版已針對 320px 狀態標籤溢出補強，Browser Smoke `34862992487` 已通過並已合併為 `44456f8`；但尚未部署 staging。
- #130 的 application、database、validate 與 Browser Smoke `34871617599` 均通過；合併 commit 為
  `675993430747bcaead27b60a4811651aab04f81d`，沒有新增 migration，尚未部署 staging。
- #132 的 application、database、validate 與 Browser Smoke `34876325765` 均通過；合併 commit 為
  `4387ee578bef8273a6a59079965f4c3ab2ea6aa9`，新增 migration `20260915000100_event_push_version_contract.sql`，尚未部署 staging。它修正活動編輯實際仍呼叫舊 7 參數推播 overload 的缺口。
- 先前的 Staging Release plan `34874620524` 是針對舊 SHA `a0f3c3f69b5cd5facc718904a7ccca80a8d4eb66`；#132 合併後已失效，新的 Go-Live 必須重新 plan。由於 `20260914001000_update_club_event.sql` 會回填既有 `line_push_logs` 列，且 staging Free 方案沒有備份／PITR，目前仍不能輸入 `BACKUP-READY` 或直接 Go-Live。

## 前次掃描證據（2026-09-15；#135 合併後）

- GitHub `origin/main` exact SHA 為 `d2106bc8ceee5731b3954610cd2ef2fb5d42857e`；PR #135 已合併，merge commit 為此 SHA。PR #135 的 application、database、validate 與 member-browser-smoke 均通過；目前沒有 open PR。
- #135 修正 `src/app/api/preferences/active-club/route.ts` 的反向代理網址問題：社員切換社團時，伺服器不再以內部 `0.0.0.0:10000` 組 redirect，而是使用受信任的公開站台網址；沒有新增 migration，也沒有放寬登入、社別隔離或後端授權。
- staging `/api/health` 於 2026-09-15 02:28（Asia/Taipei）仍回報 `status=ok`、`revision=dddf1a51ab67`、`configuration=true`、`database=true`、`issues=[]`、`warnings=[]`。這個 revision 尚未包含 #135，因此修正尚未在 staging 生效。
- 已登入 staging 的社員模式實測切換社團時曾取得 `https://0.0.0.0:10000/dashboard?mode=member`，手動改回公開 staging 網址後頁面正常；這確認問題是 redirect host，不是登入失效或社團資料越界。部署 #135 後仍須重新做一次切換回歸。
- 合併後 `CI` run `34880910821` 與 `Browser Smoke` run `34880910900` 已針對同一個 merge commit 成功完成；本次沒有手動重新觸發 CI 或 Browser Smoke。
- 主線 CI `34855905908` 的 database job 在設定 Supabase CLI 時連續收到下載端 HTTP 504；validate job 通過。這是外部工具下載失敗，未把它誤判成程式測試通過，也不再無限重跑。
- Flex Staging Release Plan `34686603765` 與 Go-Live `34686702234` 均成功，核對同一個 exact SHA `fbdc061`。
- staging `/api/health`：`status=ok`、`configuration=true`、`database=true`、`issues=[]`、`warnings=[]`。
- staging Go-Live `34686702234` 以 exact SHA `fbdc061…` 成功；這是歷史基準，最新已部署 migration 是
  `20260912000200_line_oa_flex_templates_flag.sql`。
- 本輪文件同步後的 `CI`／`Browser Smoke` 依變更範圍 gate 執行輕量檢查；#117／#119 的完整 CI、Database、Quality 與 Browser Smoke 均成功。
- 生日 Collection Scheduler 真人送達與重跑不重送已由 `34695450977`／`34695655038` 完成；follow identity pairing 仍依 E-03 待精確身份核對。
- #118 已修正 `20260914000400` 的 migration collision，改為 `20260914000900`；CI database、Quality、Browser Smoke 與完整 migration reset 均通過。
- production 沒有修改；所有需要外部平台、真人或產品決定的項目均已集中列在 E-01–E-12。

## 歷史掃描證據（2026-09-15；#137 合併後與舊 staging plan）

- PR #137 已合併至 `main`，merge commit 為 `8b970dc9dbefed10a8ba63a6ec9916261ac1454c`；它只有文件變更，沒有新增或修改 migration，也沒有部署 staging。
- `Staging Release` run `34881790463` 是在 PR #137 合併前，以前一個 `main` exact SHA `6e895101b3bffa9a8c9fd8e39314297de3243a34` 完成；`include_all=false`，migration dry-run 成功，沒有套用資料庫變更，也沒有部署應用程式。因 Go-Live 要求 plan 與目標 SHA 完全一致，這個 plan 不能直接套用到目前的 `8b970dc9`。
- dry-run 顯示下一次 Go-Live 會處理 `20260914001000_update_club_event.sql`、`20260914001100_club_service_plan_v2.sql` 與 `20260915000100_event_push_version_contract.sql`。
- `20260914001000_update_club_event.sql` 會更新既有 `line_push_logs` 資料；staging Supabase Free 方案沒有備份／PITR。因此在取得可驗證的 logical backup／rollback point 前，仍不能誠實輸入 `BACKUP-READY`，也不執行 Go-Live。
- 目前應先由產品／平台管理員決定 staging 的 rollback 方案（升級備份能力或核准受控匯出），再進行 migration apply、部署與 hosted acceptance；不能用 `include_all` 繞過這個安全門檻。

## 歷史掃描證據（2026-09-15；#139 合併後）

- GitHub `origin/main` exact SHA 為 `37b297f9dbaaa73d8781d7510a04d80ca31f7e2b`；PR #139 已用一般 merge 合併，merge commit 為此 SHA；目前沒有 open PR。
- PR #139 的 application、database、validate 與 Browser Smoke 均通過；合併後 main 的 CI `34886934834` 與 Browser Smoke `34886934913` 也均通過。Browser Smoke 包含完整 migration reset、資料庫旗標回復與社員／角色殼層流程。
- #139 的根因是 `get_club_affairs_page` 在 `p_start_year` 為 null 時，把 `date` 型別的 `current_rotary_year_start()` 直接指定給 `integer`；staging 舊版因此在 `/club-affairs` 顯示通用載入錯誤。新增 `20260915000200_club_service_plan_year_cast.sql` 只從 PostgreSQL 現有函式定義做精準 forward-fix，沒有修改歷史 migration、資料表、RLS 或權限。
- 新增的 `supabase/verification/club_service_plan_year_cast_security.sql` 已註冊進 verification manifest；本機 typecheck、lint、test、build、migration guard、verification manifest 與 `git diff --check` 均通過。`npm run verify:db` 本機曾因 Docker／Supabase 無回應中止，沒有把它當成本機通過；GitHub database job 已成功。
- Staging Release plan `34888099085` 曾對 `main@37b297f9` 建立，但後續 main 又有文件合併，該 plan 已取消，不可沿用；staging health 當時仍是 `status=ok`、`configuration=true`、`database=true`、`issues=[]`、`warnings=[]`、revision `dddf1a51ab67`。
- 在 plan 完成並取得 rollback／forward-fix 依據前，不執行 Staging Go-Live；production 沒有修改。

## 最新掃描證據（2026-09-15；#141 合併後）

- GitHub `origin/main` exact SHA 為 `feebd5902e59d71d073433b7f64557d23a853f00`；PR #140、#141 已合併，兩者都是文件變更；目前沒有 open PR。
- PR #139 的 application、database、validate 與 Browser Smoke，以及合併後 main 的 CI `34886934834`、Browser Smoke `34886934913` 均成功；文件同步依變更範圍規則不重跑完整 database／member-browser jobs。
- PR #141 已把 E-04 的 rollout 決策寫清楚：目前只啟用 `PANCHIAO-ELITE`；不使用 HAPPY，也沒有 `HAPPY` 的 OA/channel secret。未來若啟用 HAPPY，必須另設自己的 `LINE_OA_HAPPY_*` 憑證與驗收。
- staging `/api/health` 於 2026-09-15 03:52（Asia/Taipei）仍回報 `status=ok`、`revision=dddf1a51ab67`、`configuration=true`、`database=true`、`issues=[]`、`warnings=[]`；這個 runtime 仍只到 #123，main 後續的程式與 migration 尚未部署。
- 針對 `37b297f9`、`79fd63d0` 與 `feebd590` 的舊 Staging Release plan 已因 main 後續前進而取消；本文件快照合併後，下一步只建立一個對應最新 main exact SHA 的 plan，並等待 `staging` environment 人工核准。
- `20260914001000_update_club_event.sql` 仍包含既有 `line_push_logs` 資料回填；staging Supabase Free 方案仍沒有 backup／PITR。因此在取得可驗證 rollback point 或核准受控匯出方案前，不輸入 `BACKUP-READY`，也不執行 Go-Live；production 沒有修改。
