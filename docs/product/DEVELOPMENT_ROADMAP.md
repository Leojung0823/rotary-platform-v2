# Rotary Platform V2 開發地圖

更新日期：2026-09-20（Asia/Taipei；最新主線 SHA 請以 `git rev-parse origin/main` 現場核對）

## 2026-09-20 最新終態核對（`4292e6f`；自動回歸已完成）

- `main`／`origin/main` exact SHA 為 `4292e6f3a42ca510b4cc7fd91d1ce296ee23296f`；沒有 open PR。既有未追蹤的 `docs/product/EXTERNAL_PLATFORM_PUBLISHING_PLAN_V1.md` 未讀寫、未提交。
- `0c8eda1` 的自動 CI `35469854563`、Browser Smoke `35469854515`，以及文件同步提交 `4292e6f` 的 CI `35469901220`、Browser Smoke `35469901225` 均成功；沒有手動觸發或重跑。
- staging `/api/health` 仍為 `status=ok`、`issues=[]`、`revision=07002d81be23`，所以這些回歸結果不能被誤寫成最新主線已部署。GitHub staging `SUPABASE_ACCESS_TOKEN` 仍未取得 `vmmzdautcsgknhyqrsto` 授權。
- 目前地圖上的未結案項目維持：E-03 follow 真人身份核對、E-06 同條件效能量測、E-07 實機／M1、E-08 production 決策、E-10 負向角色矩陣、E-11 各社 OA／Rich Menu，以及社費 hosted 收款／核銷驗收；E-09 依產品決定暫緩。E-05 額度超過停止並提示已完成。

## 2026-09-20 最新補充（`0c8eda1`：E-10 負向角色 hosted acceptance 已可執行）

- 受保護的 `Staging Management Acceptance` 新增手動 `expect_negative_roles` 開關；只有明確開啟且三組保留 staging 測試身份都通過前置檢查時，才會跑停權、退社與外社執行秘書的負向案例。
- 案例驗證的是後端結果：停權／退社帳號登入導向 `/access-denied` 且沒有主要導覽；外社執行秘書登入後直接開啟目標社管理社員頁也導向 `/access-denied`。一般社員的既有拒絕案例仍保留。
- 本機完整檢查已通過：typecheck、lint（既有 warning）、Vitest `197` 檔／`1468` tests、build、`verify:db`、migration guard、verification manifest、diff check。
- 目前沒有 hosted 結果；staging 仍是 `07002d81be23`，所以 E-10 仍是「程式與驗收工具完成、等待外部身份／部署／執行」而非 `[x]`。不會因 workflow 開關存在就把權限驗收標成完成。
- 不要把測試帳號或密碼寫入文件／repo；只使用 GitHub staging environment secrets，名稱見 workflow。

## 2026-09-20 最新核對（`351e88a`）

- `git fetch origin --prune` 後，`main`／`origin/main` exact SHA 都是
  `351e88a62227a2a3c6ad2d82796a7c43ce367edb`；目前沒有 open PR。
- 文件同步的自動 CI `35468519910`、Browser Smoke `35468519907` 均成功；程式提交 `0ddb8a0` 的 CI
  `35468492760` 與 Browser Smoke `35468492778` 也均成功。
- staging health 仍是 `revision=07002d81be23`、`status=ok`、`issues=[]`。最新主線未部署，因 GitHub staging
  `SUPABASE_ACCESS_TOKEN` 尚未取得 `vmmzdautcsgknhyqrsto` 的授權；production 沒有修改。
- 因此下一個可執行順序仍是：先修復 staging 授權後，部署最新 exact SHA，再跑社費／生日設定／一般社員拒絕的受保護 hosted acceptance；
  另外 E-03、E-06、E-07、E-08、E-10、E-11 仍分別需要真人、登入效能 session、實機、產品決策或外部 LINE OA 設定。

## 2026-09-20 最新核對（main 自動檢查已完成）

- `origin/main` 與本機 `main` 都是 `4d2da7a12a6c290a77a6f7a5f3460076166353a8`；自動 CI `35466606215`、Browser Smoke `35466606217` 均成功，沒有手動觸發。
- 這是主線回歸證據，不是 staging 發布證據。staging 仍為 `revision=07002d81be23`，待 `SUPABASE_ACCESS_TOKEN` 修復後，才可部署最新社費匯出與活動取消 timeout boundary。

## 2026-09-20 最新補充（生日設定 hosted 驗收工具已補上）

- `05a456e` 將生日公開設定加入受保護 staging member acceptance 的獨立開關；它會驗證社員在 `/me` 看得到生日設定、儲存入口，且通用隱私卡片仍隱藏。
- 目前只有本機語法／契約證據，沒有 hosted 結果；部署最新主線後，需在生日旗標已開啟的前提下，以 `expect_birthday_settings=true` 執行，成功後才能結案這一項。

## 2026-09-20 最新補充（一般社員 hosted 越權拒絕驗收已補上）

- `0ddb8a0` 將一般社員直接開管理社員名錄 URL 的後端拒絕加入 management acceptance；本機契約測試 `11/11` 通過。
- 這只補強一般社員負向邊界，不把 E-10 的停權、退社、外社執行秘書與雙重社籍矩陣標為完成；需部署後再取得 hosted 結果。

本文件是 Rotary Platform V2 接下來的產品開發順序與依賴關係。它補充 Epic #55「社員體驗與簽到 V2」，並把已完成的基礎工作、下一階段主線，以及新發現的產品與 UX 缺口放在同一張地圖上。

## 2026-09-20 最新補充（社費報表 hosted 驗收範圍已補強）

- `c655d50` 把社費報表的受保護 hosted acceptance 補完整：空資料與部分收款資料都會下載並檢查 CSV、Excel、PDF 的內容型別、附件標頭、`no-store` 與檔案簽名；社員直接請求管理匯出 API 必須回 `403`。
- 這是驗收能力的完成，不是 staging 結果的完成。最新主線尚未重新部署，因 GitHub staging `SUPABASE_ACCESS_TOKEN` 仍授權失敗；憑證修復後要以 exact SHA 重新 Go-Live，再執行 management acceptance。
- 本機 typecheck、lint（既有 warning）、197 檔／1464 tests、build、`verify:db`、migration guard、verification manifest 與 diff check 均通過；沒有手動跑 CI／Browser Smoke。

## 2026-09-20 最新補充（社費 hosted 驗收流程已補上，尚未執行）

- 最新主線目前為 `a0340310157a48c825019b104ea67689cbc08220`（驗收工具 commit 為 `0d529b0ddcecf5d3bab993b205e24158cc57465b`）。新增的是 staging acceptance 覆蓋，不是產品 schema 或 hosted 資料：獨立測試年度、部分收款、代墊、核銷、社員投影與可逆回收都由受保護 browser flow 驗證。
- 本機 typecheck、lint、197 檔／1464 tests、build 與驗收契約測試通過；沒有手動觸發 CI／Browser Smoke。社費仍不能標 `[x]`，因為 hosted run 尚未在最新 runtime 執行。
- push 後自動 CI `35465974482` 與 Browser Smoke `35465974546` 均成功。
- 現場 staging 仍為 `07002d81be23`，Go-Live 的 Supabase link 仍被舊 `SUPABASE_ACCESS_TOKEN` 阻擋。憑證修復後的順序是：以 exact SHA 部署，再跑受保護 management acceptance；成功後才把社費 hosted 收款／核銷項目結案。

## 2026-09-20 最新補充（活動取消安全邊界已推送；staging 尚未發布）

- 主線為 `163a3e512b7623baddb8150feb74616cc50bb47c`；新的 `20260920000200_event_cancellation_timeout_boundary.sql` 已加入活動取消的
  lock／statement timeout 與可重試錯誤提示，保留既有 RPC 權限、資料隔離與交易回滾邊界。
- 本機完整資料庫／程式驗證、CI `35463925758`、Browser Smoke `35463925775` 均成功。Staging Release plan `35464563367` 也成功。
- Go-Live `35464656975` 未通過 Supabase project link：GitHub staging 的 `SUPABASE_ACCESS_TOKEN` 授權失敗；因此這個修正尚未進入 staging，
  staging 仍是 `07002d81be23`。待 secret 更新後，才能進行新的 Go-Live 與乾淨 hosted acceptance。
- 外部主線仍是 E-03 真人 follow 身份核對、E-06 同條件效能量測、E-10 負向角色矩陣；E-07、E-08、E-11 仍受實機／產品／LINE 外部條件限制，
  E-09 維持暫緩。

## 2026-09-20 最新補充（活動取消 hosted flake 與 QR 撤銷查詢）

- 最新主線是文件同步後的 `c4e0305c17202f76b54f3b95984b3e40c701d70c`；staging runtime 仍是
  `07002d81be23140b581ce5b92d0b55046b249b15`；Staging Release `35462618738`、Go-Live `35462672034` 成功，health 為
  `status=ok`、`revision=07002d81be23`、`issues=[]`、`warnings=[]`；production 未修改，沒有 open PR。
- 為活動取消觸發器補上 `20260920000100_event_cancellation_qr_index.sql`，只改善依活動撤銷有效動態 QR credential 的查詢路徑，不碰權限模型與資料規則。
- 本機 `verify:db`、migration guard、verification manifest、diff check 通過。自動 CI `35462613423` 與 Browser Smoke `35463068436` 均已成功，沒有手動重跑。
- 活動建立／發布／取消的 hosted 驗收出現間歇性問題：診斷版 `35462472207` 三項成功並看到取消 POST `303`，乾淨版 `35462819114` 又遇到取消 redirect 30 秒逾時，另有一次 4px 橫向溢出。這條應列為「需要可觀測性與穩定性修正」，不應靠放寬 timeout 宣稱完成。

因此地圖的下一個工程子任務是：補取消 action 的 server-side timing／錯誤可見性與可安全重試邊界，完成一次乾淨 staging acceptance 後，才把活動管理 hosted acceptance 從 `[>]` 移到 `[x]`。外部主線仍依 E-03（LINE 真人配對）、E-06（登入後效能）、E-10（負向角色矩陣）排序；E-07、E-08、E-11 受實機／產品／LINE 外部條件限制，E-09 暫緩。

## 2026-09-20 最新補充（Browser Smoke 逾時保護與社費唯讀驗收）

- `c48f7f0` 為 Browser Smoke 的本機 Supabase 啟動與 reset 加上單步逾時與失敗日誌，避免驗收工作流長時間卡住；不改產品 runtime、資料庫或 hosted 環境。
- staging 唯讀檢查已確認社務管理模式可開啟社費頁與三種匯出，社員模式只看到自己的財務投影與代墊申請；因測試年度是空資料，實際收款／核銷與完整角色矩陣仍待受控 hosted acceptance。
- 舊 Browser Smoke `35459724643` 仍在執行，不能當成通過證據；本輪未手動重跑，也沒有重新部署 staging。

## 2026-09-20 最新補充（生日設定可見性回歸測試已推上 main）

- `e2e/tests/birthday-v2.e2e.mjs` 已加入非變更型回歸案例，保護社員模式 `/me?mode=member` 的「生日公開設定」可見性，以及通用「隱私設定」不應重新曝光的邊界。
- 測試提交 `ab666c120798ca45c44e3c238d59e976b08c8ad6` 已推上 `main`；它不改產品 runtime、不新增 migration，因此 staging 仍維持 `a4fd0d6f47b3`，沒有重新部署。
- 自動 CI `35459724663` 已成功；Browser Smoke `35459724643` 在本次文件更新時仍在執行，不能先當成通過。最新主線 SHA 請現場核對。
- 未結案的外部條件仍不變：E-03 真人 follow 身份核對、E-06 同條件效能量測、E-07 實機／M1、E-08 production 決策、E-10 負向角色矩陣、E-11 OA／Rich Menu 外部設定，以及社費 hosted 角色驗收。

## 2026-09-20 最新核對（生日設定獨立顯示已發布）

- 本節的產品與 staging 證據對應產品 commit／staging runtime `a4fd0d6f47b38d78922d5bdc3316b4949d191ab6`；後續文件同步 commit
  只更新紀錄、不重新部署，最新 `origin/main` 請以現場 `git rev-parse origin/main` 核對。沒有 open PR；工作樹既有的未追蹤外部企劃書未納入本輪。
- 這次修正 `src/app/(authenticated)/me/page.tsx`：生日公開設定不再被關閉中的通用隱私卡片連帶隱藏；通用通知／名冊隱私仍保持關閉。
  `src/lib/privacy-in-one-place.test.ts` 已補上顯示邊界回歸，沒有新增 migration 或改權限。
- 本機完整 Vitest `196` 檔／`1459` tests、typecheck、lint（既有 warning）、build 通過；自動 CI `35459107612` 成功。
  Browser Smoke `35459107627` 仍在執行，沒有手動重跑或把它當成完成證據。
- Staging Release `35459226960`、Staging Go-Live `35459318377` 均以同一 exact SHA 成功；health `revision=a4fd0d6f47b3`、`status=ok`、`issues=[]`。
  已登入 staging 的社員模式實際看到「生日公開設定」，且 PANCHIAO-ELITE／HAPPY 分開列出；完整儲存／關閉後牆面／另一帳號矩陣仍待真人驗收。
- 因此生日設定從「程式已部署但畫面被誤藏」前進為「程式與顯示已驗證、完整真人驗收待做」，不提前標成 `[x]`。

## 2026-09-20 待辦掃描補充

- `origin/main` 為 `3e9d8056c4ff25f41e1ce93a4b4b26027f1c2c82`，目前沒有 open PR；staging health 的 deployed revision 為
  `425a166e2469`，`issues=[]`。文件同步不需要重新部署產品程式。
- 自動 Browser Smoke `35458088029` 的 member job 仍在執行，沒有被採用為通過證據，也沒有手動重跑。這不改變已成功的 CI、Staging
  Release 與 Staging Go-Live 結果。
- staging 社費頁已做唯讀核對：年度、財務匯出與社員代墊入口可用；因該 staging 年度目前沒有應收／收款／代墊資料，財務的實際
  收款、沖銷、核銷與負向角色矩陣仍列為 hosted acceptance，不把「頁面能開」當成完整驗收。
- 原始碼沒有發現待登錄的 TODO／FIXME；下一步仍依外部證據排序：E-03 正確身份配對、E-10 負向角色矩陣、E-06 同條件效能量測，
  再處理 E-07 實機／M1、E-11 各社 OA／Rich Menu；E-08 production 需另立決策，E-09 維持暫緩。

## 2026-09-20 最新核對（跨社管理深連結已修正並發布）

- `425a166e2469db49ff8e6b995e04b066f011c926` 已進入 `main`；Staging Release `35458106373` 與 Go-Live
  `35458190522` 使用同一個 exact SHA 成功完成，staging `/api/health` 為 `revision=425a166e2469`、`status=ok`、
  `configuration=true`、`database=true`、`issues=[]`、`warnings=[]`；production 沒有修改。
- 修正跨社管理深連結的 active-club 不同步：代理層只提供格式正確的 route／query club ID 作為 UX 偏好，shell 與模式解析仍以
  `resolve_my_experience_context` 的本人社團 projection 驗證；網址、cookie 與自訂 header 都不是權限來源。
- 本機 196 檔／1459 tests、typecheck、lint（既有 warning）、build、verify:db、migration guard、verification manifest、diff check 通過；
  沒有手動觸發 CI／Browser Smoke。staging 唯讀驗收已確認 HAPPY／PANCHIAO 的管理深連結內容與側欄社別一致。
- 這項修正屬 E-10 正向 UX／資料隔離補強，不把 E-10 標為完成；停權、退社、外社執行秘書的 staging 負向矩陣仍待真人帳號。
- E-06 仍維持未量測：登入後 LCP、FCP、TTFB、INP 需要同 runtime／快取條件的 Chrome DevTools trace；本次沒有新增效能數字。

## 2026-09-20 最新核對（服務計劃 hosted 雙帳號驗收完成）

- 產品與驗收使用的 exact SHA `f72aa2db440ae8278cbe791411b17e9f1d0197b4` 已由 Staging Go-Live `35456273015` 部署；staging `/api/health` 回報 `revision=f72aa2db440a`、`status=ok`、`configuration=true`、`database=true`、`issues=[]`、`warnings=[]`。production 沒有修改。
- Staging Management Acceptance `35456938712` 的兩個測試全部成功：獨立管理者建立服務計劃草稿時，一般社員看不到；發布後看到標題與社員服務、職業服務、社區服務、國際服務；再存成草稿後重新隱藏。生日重跑、文件建立／上傳／編輯、活動建立／封面／發布／取消也通過。
- 前一次 acceptance `35456431449` 唯一失敗是 staging 活動取消 redirect 在 30 秒內未完成；本機 3001 fixture 重現成功，使用同一 exact SHA 重跑 hosted acceptance 後全綠，沒有改活動 runtime。
- 本機 typecheck、lint（既有 `readdirSync` 未使用 warning）、Vitest `196` 檔／`1458` tests、build、verify:db、migration guard、verification manifest、diff check 均通過；自動 CI `35456012202` 與 Browser Smoke `35456012210` 均成功，沒有手動重跑。
- 服務計劃的 hosted 角色／發布邊界已結案；E-03、E-06、E-07、E-10、E-11 及產品決策項目仍依外部條件管理。文件同步提交不需重新部署 staging。

## 2026-09-19 最新核對（E-05 已結案；推播受眾隔離已修正）

- 程式提交 `d9468bdc291926eab80e1034c4846efc175460f0` 已推上 `main`，並由 Staging Go-Live `35446974648` 以 exact SHA 完成；文件後續提交會讓 `main` 再前進，精確 SHA 請以 `git rev-parse origin/main` 現場核對。staging health 回報 `revision=d9468bdc2919`、`status=ok`、`issues=[]`，production 沒有修改。
- LINE 額度專項 `35445780317` 已成功：只使用 staging 合成 `rate_limited` push log，不呼叫 LINE API；管理幹部看到停止提示與部分送達數字，一般社員不可見，cleanup 成功。
- E-05 現在標記為 `[x]`。第一次 run `35445453225` 的依賴安裝缺口已在 `e7a38b5` 修正，並由 workflow 順序測試鎖定。
- 下一個可執行順序是 E-03 真人身份核對、E-10 負向角色矩陣與 E-06 可比效能量測；E-07、E-08、E-11 仍需要實機、產品決策或外部 OA 設定，E-09 維持暫緩。

## 2026-09-19 LINE OA 推播受眾隔離修正

- 實際掃描發現共同推播 loader 原本只看 follower 的 `following` 狀態，沒有再確認 follower 對應社員目前仍是該社的 active membership；退社／停權／外社或尚未配對的舊 follower row 可能被納入全社推播。
- 已修正 `src/lib/line/oa-dispatch.ts`：同時查詢該社 active memberships，只保留 active person 的 following follower，並對 OA user id 去重；手動廣播與既有 API 推播因此共用同一個受眾邊界。
- 新增 `src/lib/line/oa-dispatch.test.ts` 回歸測試；沒有修改登入、RLS、權限、社團隔離規則，也沒有新增 migration。
- 本機 typecheck、lint、完整 Vitest `196` 檔／`1456` tests、build、verify:db、migration guard、verification manifest、diff check 均通過；staging Go-Live `35446974648` 已成功。

## 2026-09-19 E-05 決策與實作進度（本節優先）

- LINE 推播遇到 429／方案額度上限時，產品決定採「停止並提示」：同一批沿用 retry key 安全重試一次，仍是 `rate_limited` 就停止後續批次，不盲目繼續送。
- 手動推播會在管理頁立即顯示錯誤；排程、活動與訊息中心推播會把部分送達寫入既有 `line_push_logs`，並由新的 `get_line_oa_quota_notice` 在社務管理 → LINE OA 頁面提醒有 `oa.read` 的管理幹部。一般社員不會在訊息中心看到這個維運提醒。
- 本輪新增受保護的 `Staging LINE Quota Notice Acceptance` workflow：只允許 `workflow_dispatch`、`main`、exact SHA、staging environment 與測試社團；以合成資料驗證管理員看到提示，不呼叫 LINE API，完成後只清除自身 marker 資料。若測試社團已有啟用中的 OA，會 fail closed，不會覆蓋既有設定。workflow 另固定先安裝根目錄依賴，避免 fixture 載入失敗。
- 本輪已完成程式、migration、verification 檔與單元測試；2026-09-19 本機 Docker 恢復後，`npm run verify:db`、superadmin／role-shell fixture bootstrap、`check:migrations`、`check:db-verifications` 均已通過。Staging Go-Live `35446974648` 的 runtime 為 `d9468bdc2919`，`/api/health` 回報 `status=ok`、`issues=[]`。額度專項 `35445780317` 已成功完成管理員／社員 UI 驗收與 cleanup；未用真實社員做額度壓力測試，也不為測試消耗正式額度。

## 2026-09-19 最新現場核對（本節優先）

- 2026-09-19 最新 staging runtime exact SHA 為 `d9468bdc291926eab80e1034c4846efc175460f0`；Staging Go-Live `35446974648` 成功，`/api/health` 回報 `revision=d9468bdc2919`、`status=ok`、`issues=[]`，production 沒有修改。自動 CI／Browser Smoke 由 push 產生，本輪沒有手動觸發或重跑。
- Staging Management Acceptance `35440318825` 成功：無社籍執行秘書完成生日重跑、文件建立／上傳／編輯，以及活動建立／封面／發布／取消。這完成管理模式的 hosted 正向流程，但不等於社費、服務計劃的完整角色矩陣或 E-10 負向矩陣完成。
- 本機針對性瀏覽器驗收補充通過：`officer-mode-1440` 9 passed／1 intentional skip，涵蓋模式邊界、跨社管理路徑拒絕、社費與 CSV／Excel／PDF 匯出及無社籍執行秘書；`interact-hub-1440`／`375` 共 4 passed；`line-oa-rich-menu-1440` 1 passed；`line-oa-audience-1440` 5 passed，涵蓋額度停止提示只給管理幹部、一般社員被拒絕。這些只作本機回歸證據，不取代 staging 真人與各社 OA 驗收。
- 已登入 staging 的唯讀抽查確認：LINE OA 管理頁最新推播為 `sent`、目前沒有額度提醒；社費管理頁可讀取 2026–27 年度與 CSV／Excel／PDF 匯出入口；社員「我的」頁有社費入口與代墊申請；服務計劃管理草稿不會出現在社員頁。未為測試硬打真實 429。
- Chrome DevTools MCP 目前沒有 staging 登入 session，導向管理頁會回 `/login`；因此 E-06 登入後 LCP／FCP／TTFB／INP 仍是**未量測**。桌面 Chrome 只作畫面唯讀驗收，不把非 DevTools trace 的數字當效能證據。
- 路線圖下一步是補 E-03 真人身份核對、E-06 可比效能數據與 E-10 負向矩陣；E-05 已完成產品決策、程式、staging 發布、管理員／社員隔離驗收與 cleanup。E-07、E-08、E-11 需要實機、產品決策或外部 LINE OA 設定，E-09 維持暫緩。

## 2026-09-18 最新現場基線（本節優先）

- Staging runtime 基線仍是 `211b363526ca1398f2cba49708d9c7a0dfca1422`；本輪程式／測試修正為 `16fcc25`、`5f794e1`。PR #202 已合併，另加入 LINE OA 待辦整合；Staging Release `35308584458` 成功，第一次 Go-Live `35308757890` 因 Render 切換超時失敗，重跑 Go-Live `35309848544` 後 migration、部署、exact revision、HTTPS smoke 與 hosted acceptance 全部成功。staging health 為 `status=ok`、`revision=211b363526ca`、`issues=[]`、`warnings=[]`；production 沒有修改。`main` head 請用 `git rev-parse origin/main` 現場核對。
- `16fcc25`、`5f794e1` 只修正 `member-home` E2E 對舊版 LINE 首頁卡片的過時斷言，沒有改 runtime、資料庫或權限。前一輪 `35310867689` 有 6 個舊斷言失敗；更新一次後 `35312050315` 剩 1 個漏網舊斷言失敗，另有 1 個標籤測試 retry 後通過的 flaky。最新自動 CI `35313186838` 與 Browser Smoke `35313186884` 均成功，Browser Smoke 的 member-browser-smoke 與 rollback checks 也都成功。
- 目前沒有 open PR。最近主線的 #199、#200、#201、#202 已完成合併與 staging 發布；文件同步後不需要重新部署。
- LINE OA 待辦已完成並部署：資料庫的五種既有待辦不變，首頁以 caller-only onboarding projection 追加一項，顯示未綁定、未加入、待配對或衝突狀態，完成配對後消失；入口為 `/me/line-oa`。下一步仍是用未配對真人帳號驗收「出現 → 完成配對 → 消失」，不能只用 Go-Live 的一般 hosted acceptance 取代這條功能專項證據。
- 本輪補上本機瀏覽器 fixture：以「LINE Login 已綁定、但沒有 OA follower」社員驗證首頁待辦會顯示「加入本社 LINE OA」並連到 `/me/line-oa`。這是回歸測試覆蓋，不等於 staging 真人配對驗收。
- 2026-09-18 已由平台管理員透過受保護 CLI 開啟 staging `dues_finance_v1`；本次以已登入的社務管理帳號做唯讀 hosted 驗收，管理頁可開啟 2026–27 年度、空資料摘要與 CSV／Excel／PDF 匯出入口，社員模式也可從「我的」查看社費並看到代墊申請入口。仍缺有實際應收資料的收款／核銷結果，以及一般社員、外社與無 `finance.read` 帳號的負向矩陣。
- 年度服務計劃也完成唯讀 hosted 抽查：管理模式可看到四大分類的 staging 草稿，社員模式只看到「本年度的服務計劃尚未發布」，草稿沒有外洩；仍缺另一個一般社員帳號的正式角色矩陣與發布後內容驗收。
- 本輪本機驗證：typecheck、lint、Vitest `193` 檔／`1445` tests、build、完整 `verify:db`、migration guard、verification manifest 通過；沒有手動觸發 CI／Browser Smoke。
- 下一步仍分兩類：E-03、E-10、E-06 可在條件具備時繼續驗收；E-05 已完成產品決策、程式與 staging 發布，仍缺不消耗正式額度的 rate-limited UI 專項證據；E-07、E-08、E-11 需要真人、實機或外部 LINE OA 設定；E-09 維持暫緩。沒有外部證據的項目不改標成完成。

## 2026-09-17 最新基線（簽到可用性說明修正已發布；本節優先）

本節以 GitHub `origin/main`、PR 狀態、Staging Release、Staging Go-Live 與 staging `/api/health` 現場核對；下面較早的 2026-09-17 段落是歷史紀錄。

- 最新主線與 staging 都已核對為 `eaafe00eed1afab4314f0d5ccc0a875571d832a5`；PR #198 已合併，簽到頁現在會逐場說明定位簽到為何不可用，且不計入出席的活動仍能開啟簽到。本次沒有新增 migration。
- Staging Release plan `35185140008` 與 Go-Live `35185217321` 使用同一個 exact SHA，migration dry-run、部署、exact revision wait、HTTPS smoke 與 hosted acceptance 全部成功。
- staging health 為 `status=ok`、revision `eaafe00eed1a`、`configuration=true`、`database=true`、`issues=[]`、`warnings=[]`；production 沒有修改。
- PR #198 的 CI／Browser Smoke 是 push 後自動產生，沒有手動 dispatch／重跑；文件後續只做進度同步時不需重新部署。
- 下一批仍是 E-03、E-10、E-06，再處理 E-07、E-05、E-11；E-08 production 與 E-09 recovery email 仍須另外決策。E-10 雖已有執行秘書 hosted 正向驗收，停權／退社／外社負向矩陣仍未完成。

## 2026-09-17 文件同步基線（歷史；已被上方最新基線取代）

- 本次程式修正已在 staging Go-Live 以 exact SHA `3e955553d7ee62dc02d33ea584006b9424704dad` 發布；本文件提交後請以
  `git rev-parse origin/main` 現場核對，本節固定記錄產品與 staging 版本，避免把兩者混為一談。
- staging 產品程式目前為已部署版本 `3e955553d7ee`；`/api/health` 為 `status=ok`、`configuration=true`、`database=true`、
  `issues=[]`、`warnings=[]`；production 沒有修改。
- 主線已包含 9/16 的首頁待辦清除、社費提醒連到正確扶輪年度、個人資料提醒、活動截止日留空、
  生日徵集日期／關閉、follower 批次配對、手機表格卡片寬度修正與測試 fixture race 修正。
  另外新增 `20260916001500_dues_reminder_lands_on_the_year_owed.sql`，已在前一個 Staging Go-Live `35083792540` 套用，
  目前 staging 仍包含它；本輪新增 `20260917000100_club_affairs_member_read_access.sql` 也已由 Go-Live `35130278609` 套用。
- `15bfd0a` 的社務頁 active-club cookie 與一般社員公開投影修正已部署；下一次文件同步仍應以現場的
  `git rev-parse origin/main` 核對，避免文件提交後再次過期。
  舊的 Staging Release `35084851997` 已取消，但它使用的是舊 head，沒有回滾或改變目前 staging runtime。
- PR #188、#189、#190 都已正常合併；本輪 Staging Release `35130111743` 與 Go-Live `35130278609` 使用同一個 exact SHA
  並成功發布產品程式與 migration。程式 push 的自動 CI／Browser Smoke 已依規則取消；文件 push 後的自動 CI `35129653090`
  與 Browser Smoke `35129653326` 最後成功，沒有手動 dispatch／重跑。
- 最新主線已包含 Next Image preload 修正；下一個開發順序仍是處理 E-03、E-10、E-06、E-07、E-05、E-11；
  E-08 production 與 E-09 recovery email 仍是另行決策，不混入一般 staging 開發。
- 9/16 已完成登入後頁面效能基線：同一個已登入 Chrome session 下，管理頁 LCP `1,777 ms`／FCP `760 ms`／
  LCP TTFB `637 ms`／CLS `0.00`；社員首頁 LCP `1,929 ms`／FCP `562 ms`／LCP TTFB `452 ms`／CLS `0.01`。
  先前 `bd8a8e9` 已把社員首頁 LCP 圖片改成首頁限定的 eager `<img>`，但 hosted React／Next 曾有 `2` 個普通 preload 提示；
  `36f32f8` 改用 `next/image` 單一元件管理 preload，真實 LEO 社員頁重新載入後確認圖片 `1` 張、preload `1` 個（body 1、head 0）。
  本輪沒有取得可比條件的新的 LCP／FCP／TTFB／INP，不能宣稱整體因果改善；未登入 `/login` 的 trace
  仍為 LCP `167 ms`、FCP `168 ms`、TTFB `104 ms`。完整條件見
  [`PERFORMANCE_IMPROVEMENT_LOG.md`](./PERFORMANCE_IMPROVEMENT_LOG.md)。Rich Menu 圖片已在本機準備成
  `2500×1686`、小於 1 MB 的 JPEG，但尚未開旗標、上傳或發布。
- E-03 目前不能用 LEO 的既有配對當作乾淨真人證據：Audit Log 同時出現 `line_oa.auto_paired`、後續
  `line_oa.bulk_paired`，以及 LEO 的 `line_identity.unbound`／社籍狀態變更。下一次必須使用未經人工批次配對或解除綁定污染的測試帳號，並由真人核對後台姓名與實際 LINE Login 身份一致。
- Go-Live 後已用同一個 staging 社員帳號完成 hosted 正向回歸：切換 `PANCHIAO-ELITE` → `HAPPY` 後開啟
  `/club-affairs?mode=member`，顯示 `HAPPY／虛擬扶輪社` 的社務與年度服務計劃；切回後資料也回到 PANCHIAO。這完成 active-club
  cookie 修正的正向證據，但 E-10 的停權／退社／外社執行秘書負向矩陣仍未完成。

## 2026-09-17 本輪開發修正（歷史；已被上方最新基線取代）

- 本輪程式提交為 `15bfd0af2919bc8f45f401266e1855569f106ecb`，已隨 Go-Live `35130278609` 發布在 staging；文件更新後 main
  會再前進，請以 `git rev-parse origin/main` 現場核對。production 沒有修改。
- 本輪修正一個跨社資料顯示缺口：多社社員切換 active club 後，社務頁原本忽略 `rotary_active_club_v1`，會把內容落回第一個候選社團。
  社務頁現在沿用 shell 的已驗證 active-club preference；回歸測試確認切換後只顯示所選社團。
- 本輪同時修正一般 active 社員無法閱讀社務公開投影的權限缺口：新增 `20260917000100_club_affairs_member_read_access.sql`，
  只在 `get_club_affairs_page` 內確認本人 active membership，不把廣義 `member.read` 發給一般社員；outsider／suspended 仍拒絕。
- 本機完整驗證均通過：typecheck、lint、Vitest `181` 檔／`1347` tests、build、完整 verify:db、migration guard、verification manifest、
  `git diff --check`，以及 production-build `member-home-1440` `3 passed`。
- Push 後的自動 CI `35129357577`／Browser Smoke `35129357651` 已要求取消；這不是手動 dispatch／重跑，且不把它們當作本輪驗收證據。
- 路線圖下一步：在已發布的 staging 上重新驗收「多社切換 → 社務」的 hosted 行為；E-03、E-05、E-06、E-07、E-08、E-10、E-11
  等外部待辦仍照原狀管理。多社切換 → 社務的 hosted 正向路徑已驗收。

## 歷史產品基線（2026-09-15；非目前 `main`）

本次 staging release 所依據的 `main` exact SHA 是 `93d341c3fd7818783bd6779b1466162baf86548b`；當時沒有 open PR。
此 SHA 已包含：

- PR #59：Feature Flag、Rollback、Privacy-safe Telemetry 基礎。
- PR #61：Canonical Attendance Domain Core。
- PR #60：Server-authoritative ExperienceContext、角色脈絡與路由解析。
- PR #62 / PR-01b：Member / Management / Platform 三套 Role-aware Shell、合法 mode switching、active-club preference、responsive 與 accessibility 基礎。
- PR #107：每社 LINE Rich Menu 程式與旗標。
- PR #108：社費、收款、核銷與財務報表核心。
- PR #110：生日設定預設值與錯誤提示修正。
- PR #111：社務資訊與年度服務計劃；migration `20260914000800_club_service_plan.sql` 已進入主線。
- PR #113：活動地址查座標；已進入主線，merge commit `0989a2b`。
- PR #115：staging 對遠端較新 migration 的明確 `include_all` 發布開關。
- PR #118：修復活動地址 migration 與社費 migration 的同號問題，地點 migration 已改為 `20260914000900`。
- PR #109：手機 Web App／PWA 基礎已進入主線。
- PR #117：修復手機同頁 `?mode=member` 導覽提交問題。
- PR #119：migration collision guard 與對應單元測試。
- PR #120：活動封面統一裁切比例。
- PR #122：UI typography、weight 與 spacing design system。
- PR #123：社員／管理模式的視覺層次與 header gutter 修正。
- PR #126：已發佈活動編輯，只有時間／地點異動才推播。
- PR #127：手機／桌機共用設計系統第二輪；已合併，320px 動態 QR 頁面的橫向溢出已修正，已隨本次 Go-Live 發布。
- PR #124：結構化年度服務計畫 V2；已合併，migration `20260914001100_club_service_plan_v2.sql` 已進入主線並隨本次 Go-Live 發布。
- PR #130：社員／社務管理模式邊界修正；已合併，管理路由與出席管理操作會保留 `mode=management`，沒有新增 migration，已隨本次 Go-Live 發布。
- PR #132：活動推播版本契約修正；已合併，活動編輯傳遞剛儲存的版本號，移除舊推播 overload，新增 migration `20260915000100_event_push_version_contract.sql`，已隨本次 Go-Live 發布。
- PR #135：活動切換社團的公開網址修正；已合併，修正反向代理下 redirect 使用內部 `0.0.0.0:10000` 的問題，沒有新增 migration，已隨本次 Go-Live 發布。
- PR #136：進度文件同步；已合併，記錄 #135 的實測根因與 staging 尚未部署狀態，沒有新增 migration。
- PR #137：staging plan 文件同步；已合併，記錄 plan 與目前 `main` exact SHA 的差異及 rollback blocker，沒有新增 migration。
- PR #138：進度文件同步；已合併，記錄 #137 合併後的主線狀態。
- PR #139：修復社務頁年度預設值型別錯誤；已合併，新增 `20260915000200_club_service_plan_year_cast.sql` 與對應 verification，沒有修改歷史 migration 或權限。
- PR #140：進度文件同步；已合併，純文件變更。
- PR #141：LINE OA rollout 決策同步；已合併，純文件變更，記錄本次只使用 `PANCHIAO-ELITE`，HAPPY 不納入 rollout。
- PR #143／#144／#146／#147：staging 受控 logical backup workflow；已合併，最後一版將加密檔保留至 upload 完成後才清理，不新增資料庫結構。
- PR #145：首頁卡片對齊修正；已合併，已隨本次 Go-Live 發布。

自上次更新後，主線已推進到「權限與資料底座 → 角色脈絡 → Shell → 社員首頁 → Dynamic QR 簽到 → GPS 簽到 → 出席 UI」全部完成。權威來源是 GitHub `main`；扶輪社名稱編輯、祝福 IOU、生日祝福 V2、文件中心與年度交接、社內留言板、活動封面圖片、首頁通知摘要、帳號安全分層與登入 recovery hardening 都已進入主線。

## 2026-09-15 開發佇列（最新狀態）

下列項目已開發並開 PR；狀態以 GitHub 即時核對為準。**進入 `main` 不等於已部署 staging**：

- PR #107：已合併，merge commit `1164f763`；Rich Menu 已部署 staging，尚待各社 OA 實際設定與真人驗收。
- PR #108：已合併，merge commit `a52bfe7`；社費與報表已部署 staging，尚待 hosted／角色邊界驗收。
- PR #109 `codex/pwa-v1`：已合併，merge commit `694c961`；已部署 staging，仍要做 iOS／Android 實機驗收。
- PR #110：已合併，merge commit `493c5a1`；生日設定修正已部署 staging，尚待 hosted／真人驗收。
- PR #111：已合併，merge commit `2d7839d`；社務資訊／年度服務計劃已部署 staging，尚待 hosted／角色邊界驗收。
- PR #113：已合併，merge commit `0989a2b`；程式已進主線，migration 順序已由 #118 修正。
- PR #115：已合併，merge commit `6260191`；`include_all` 預設關閉，只有明確指定時才允許處理 out-of-order migration。
- PR #117 `codex/fix-mobile-nav-contrast`：已合併，merge commit `8a424b2`；GitHub CI、Quality、Database 與 Browser Smoke 均通過，修正同頁 `?mode=member` 導覽在手機點擊後查詢參數未提交的問題。
- PR #118：已合併，merge commit `244ac25`；完整 migration reset、database、Quality 與 Browser Smoke 均通過。
- PR #119：已合併，merge commit `a61b333`；加入全樹同號 migration 防護與測試，CI、Quality、Database 與 Browser Smoke 均通過。
- PR #120 `codex/event-cover-one-ratio`：已合併，merge `b57034d`；統一首頁與活動列表的活動封面裁切比例，檢查全綠。
- PR #121：已合併，merge `5bf0866`；同步進度文件。
- PR #122 `codex/ui-design-system`：已合併，merge `585a0a1`；design system 已進入目前 staging。
- PR #123 `codex/ui-apple-pass`：已合併，merge `dddf1a5`；PR 自身的 CI、Quality、Database、Browser Smoke 均通過。實際 diff 是 UI/CSS 與設計系統測試，不包含完整社員／社務管理模式邊界；合併後 main 的 Browser Smoke 另有 1 個 LINE OA audience 失敗。
- PR #124 `codex/service-plan-v2`：已合併，merge `691beb6`；CI、Quality、Database、Browser Smoke 均通過，已部署 staging，仍待 hosted 角色與草稿隔離驗收。
- PR #125 `codex/sync-progress-20260914-current`：已合併，merge `9a77d7b`；進度文件已同步 #126／#127，本次文件更新再補正 #124 的合併狀態。
- PR #127 `codex/ui-desktop-system`：已合併，merge `44456f8`；CI、Quality、Browser Smoke `34862992487` 均通過，前一輪 320px 橫向溢出已修正，已部署 staging。
- PR #130 `codex/management-mode-boundary-20260915`：已合併，merge `6759934`；application、database、validate 與 Browser Smoke `34871617599` 均通過，沒有新增 migration，已部署 staging。
- PR #132 `codex/event-push-version-contract-20260915`：已合併，merge `4387ee5`；application、database、validate 與 Browser Smoke `34876325765` 均通過，新增 migration `20260915000100_event_push_version_contract.sql`，已部署 staging。
- PR #135 `codex/fix-active-club-host-redirect-20260915`：已合併，merge `d2106bc8`；application、database、validate 與 member-browser-smoke 均通過，沒有新增 migration，已部署 staging。
- PR #136 `codex/sync-post-135-docs-20260915`：已合併，merge `6e895101`；純文件同步，完整 database／member-browser jobs 依變更範圍規則跳過。
- PR #137 `codex/sync-staging-plan-20260915`：已合併，merge `8b970dc9`；純文件同步，完整 database／member-browser jobs 依變更範圍規則跳過。
- PR #138 `codex/sync-main-docs-20260915`：已合併，merge `e5313907`；純文件同步，完整 database／member-browser jobs 依變更範圍規則跳過。
- PR #139 `codex/fix-service-plan-year-cast-20260915`：已合併，merge `37b297f9`；application、database、validate 與 Browser Smoke 均通過，已部署 staging。
- PR #140：已合併；純文件同步，完整 database／member-browser jobs 依變更範圍規則跳過。
- PR #141：已合併，merge `feebd590`；純文件同步，記錄 E-04 的 PANCHIAO-ELITE rollout 決策，完整 database／member-browser jobs 依變更範圍規則跳過。

目前沒有尚未合併的 PR；#188、#189、#190 已進入 `main`。合併後 CI 與 Browser Smoke 均已成功，
Staging Go-Live `35083792540` 已發布產品程式 `1ef38bb`。後續主線只有文件同步，尚未重新部署。
社務 AI 助理仍沒有可執行企劃，暫不擅自開發。

## 歷史：2026-09-17 已部署 staging 基準（產品程式 `36f32f8`）

- Staging Release plan `35121647301` 與 Go-Live `35121777337` 使用同一個 `main` exact SHA
  `36f32f8a44e121689d7a01836d75dcbd99e4a5ee`，均通過 staging environment 人工核准並成功完成。
- 本次沒有新增 migration；Go-Live 已確認 migration apply、部署、health 與 HTTPS smoke 成功，production 沒有修改。
- staging `/api/health` 回報 `status=ok`、`revision=36f32f8a44e1`、`configuration=true`、`database=true`、
  `issues=[]`、`warnings=[]`。
- 真實登入 LEO 社員頁 `/dashboard?mode=member` 的 DOM 驗收確認 `/hero-mountains.webp` 圖片 1 張、preload 1 個；
  這次只改載入提示與靜態圖片元件，沒有改登入、權限、社團隔離或公開快取。
- 本機完整 typecheck、lint、Vitest `181` 檔／`1346` 測試、build、verify:db、verification、migration guard、manifest、
  `git diff --check` 均通過；`member-home-1440` 為 `3 passed`。自動 CI `35121629076` 成功；Browser Smoke
  `35121629061` 為 `189 passed`、`57 skipped`、`1 failed`，失敗是 role-shell 負向登入測試的串流重繪逾時。

## 歷史：目前已部署 staging 基準（2026-09-16；已被 9/17 取代）

- Staging Release plan `35083682035` 與 Go-Live `35083792540` 使用同一個 `main` exact SHA
  `1ef38bb504075d7a197e99c2364db8b087cea22e`，均通過 staging environment 人工核准並成功完成。
- Go-Live 的 migration apply 回報 `Remote database is up to date.`；部署 hook、exact revision wait、HTTPS smoke 與 hosted
  member acceptance 均成功。這表示本次沒有新的 migration 需要套用，不是跳過資料庫檢查。
- staging `/api/health` 回報 `status=ok`、`revision=1ef38bb50407`、`configuration=true`、`database=true`、
  `issues=[]`、`warnings=[]`；production 沒有修改。
- 因此目前 `main` 的程式與 migration 已包含在 staging release；Rich Menu、社費／報表、生日設定、
  社務服務計劃、活動編輯、活動推播版本與 active-club redirect 的「已部署」狀態已更新，但各自的 hosted／真人／OA 驗收仍依 E-01–E-11 管理。
- 主線已加入 staging 受控 logical backup workflow；最後一次 backup run `34912448897` 成功，細節與本機保存規則見
  `TO-DO-LIST.md` 的 E-12。
- 主線 CI `34855905908` 的 database job 在設定 Supabase CLI 時遇到外部 HTTP 504；validate job 通過，不能把這次工具下載失敗當成程式檢查通過。
- Staging Release `34842549154` 的 dry-run 曾明確拒絕地點 migration，原因是遠端已有 `20260914000800`。#115 已把 `include_all` 做成預設關閉的明確 workflow input；#118 進一步把未套用的地點 migration 改為 `20260914000900`，消除 clean reset 的同號錯誤。
- 目前 `main` 的 migration 版本已無重複；下一次 staging 發布應使用最新 `main` 的 exact SHA，並先確認 plan／Go-Live 的 migration 與 health 結果。
- 本輪 Flex 的 Staging Release Plan `34686603765` 與 Go-Live `34686702234` 均以同一個 `main` exact SHA `fbdc061dd702f453ab340bd595279223487d0838` 成功完成；這是前一個 staging 基準，後續旗標開啟與真人收訊已依 E-01 結案。
- 管理驗收第一次 run `34575792573` 失敗的原因是驗收腳本誤找不存在的 `management-card-events`；依產品既有設計改點管理模式第一層「活動」導覽後，`34577046356` 已成功通過，沒有放寬產品權限或新增活動卡片。
- 後續 scheduler workflow 環境隔離修正已在 `main` commit `6de28163e40bddd812bfc2c43a30fd43e04d006c`；CI `34573685666` 與 Browser Smoke `34573685718` 均成功。這是排程設定修正，沒有重新部署 staging 應用程式，staging runtime 仍是上列產品 release。
- `68b12a5` push 後的自動 `CI` `34584379642` 與對應 `Browser Smoke` `34584379653` 均已成功（含完整流程與 rollback 檢查），並已由 Go-Live `34594381922` 部署到 staging。
- 本輪文件同步前後的自動 `CI` `34686598214` 與 `Browser Smoke` `34686598210` 均成功；變更範圍分類器判定為文件變更，完整 database／member-browser jobs 依規則跳過。

本輪另完成生日祝福徵集領域的程式切片：每月批次與排程、每位社員每月最多一則自動派發、壽星排除、100 題平台題庫、社團題庫管理、題目快照與同批次文字去重、幹部發布／隱藏／重送、匿名公開牆、站內通知與安全驗證。PR #77 已合併至 `main`；生日旗標與 Render staging 的 scheduler secret 已同步，hosted acceptance 已通過。生日邀請真人送達與冪等重跑已由 scheduler `34695450977`／`34695655038` 驗收；follow identity pairing 仍依 E-03 暫緩。

近期主線也已完成 LINE OA follow 配對程式與防護、LINE OA onboarding 入口、社員優先與 senior-friendly UX、社團切換隔離，以及「生日任務完成後從首頁通知消失、歷史仍留在訊息中心」的修正；follow 真人驗收仍依 E-03 狀態管理。

本輪已補上並部署三個 LINE 缺口：webhook redelivery 只忽略 `deliveryContext.isRedelivery` 的穩定雜湊、
OA 管理頁顯示每社環境變數名稱（不顯示秘密值），以及由 protected birthday scheduler 發送生日徵集邀請到
已配對且開啟通知的 LINE 社員。資料庫 RPC 僅授予 service role；缺少或未開啟
 `line_oa_event_push_v1` 時不送出。程式與 migration 已在 staging；生日邀請的真人送達另見 E-02，follow identity pairing 仍見 E-03。

另補上 `line_oa_auto_pairing_v1` 在共用應用程式旗標判斷器中的明確開啟要求；沒有旗標資料列時維持關閉，修補 commit 為 `68b12a5`，已隨 `34594381922` 部署到 staging。

2026-09-12 新增 LINE OA Flex 卡片模板第一版，PR #98 已合併至 `main` merge commit `55047dd1f2d936a5147458fd16faa5038b068c3d`：管理頁提供社務公告、活動提醒、生日祝福三種固定版型與預覽；伺服器端重新檢查社別、`oa.manage`、旗標與 OA 憑證，沿用既有對象解析與批次推播。新增 migration `20260912000200_line_oa_flex_templates_flag.sql`，預設關閉；本機資料庫驗證、828 個測試與 LINE OA E2E 4/4 均通過。Staging Release Plan `34686603765` 與 Go-Live `34686702234` 已成功，旗標與真人收訊也已結案；後續 Rich Menu 改由 PR #107 處理。

2026-09-12 登入 staging 管理頁核對 `PANCHIAO-ELITE`：3 筆 follower 仍在追蹤且已配對，既有推播紀錄可見；
當時 Flex 操作區尚未開啟。這是旗標開啟前的 OA 基礎狀態證據；後續 Flex 真人收訊已依 E-01 結案。
同日 Chrome DevTools MCP 只有未登入 `/login` 頁面，尚未取得已登入管理頁的 trace；管理頁 TTFB／LCP／FCP 維持未量測。
目前登入帳號開啟 `/platform/clubs` 會被 staging 後端導向 `/access-denied`，確認它不是平台管理員；旗標必須由 `platform_admin` 或 `superadmin` 帳號透過受保護 CLI 設定。

2026-09-12 新增管理模式的「驗證 LINE OA」按鈕。伺服器會重新檢查 `oa.manage`，從該社環境變數讀取
channel access token，呼叫 LINE `/v2/bot/info` 並核對 Basic ID，再透過既有 service-only RPC 記錄結果。
這版已由 Staging Go-Live `34604266568` 部署，CI `34604026419` 與 Browser Smoke `34604026408` 均通過。
線上按鈕已由具有 `PANCHIAO-ELITE` 社 `oa.manage` 的帳號在正確社別路由完成驗證；伺服器讀取
`LINE_OA_PANCHIAO_ELITE_*`，LINE `/v2/bot/info` 回傳的 Basic ID 與資料庫設定相符，頁面顯示身份驗證成功。
Webhook 卡片也顯示最近簽章有效；切回社員模式並選擇板橋群英扶輪社後，`/me/line-oa` 已顯示該社加入連結。
`HAPPY` 仍須使用自己的 `LINE_OA_HAPPY_*`，不能改名給 HAPPY，也不能讓 HAPPY fallback 到 PANCHIAO。
社員頁與管理頁都依目前的 `clubId` 讀取對應社的 OA；下一個待辦是使用曾以 LINE Login 登入的社員完成
follow 事件自動配對真人驗收。

另有兩項不在原路線圖、但已完成的工程工作：頁面查詢改為單次往返的組合型 RPC，以及 Render 機房由 Virginia 遷至新加坡（p50 由 520ms 降至 269ms）。

出席 UI 整合已完成，並且如原本要求的那樣繼續使用 PR #61 的 canonical Attendance RPC，未另建 authority。

所有需要 LINE Developers Console、Render／GitHub secret、staging 發布、Chrome DevTools、實機／真人驗收或產品決策的項目，
統一記在 [`TO-DO-LIST.md`](./TO-DO-LIST.md) 的 E-01–E-12；本文件只保留路線與依賴，不另維護第二份外部待辦。

## 開發原則

- 資料層與 UI 層分離；安全資料核心不等待大型 UX 改版。
- Feature Flag 與 kill switch 必須保留完整 legacy rollback path。
- ExperienceContext、mode、active club、navigation visibility 都只屬於 UX / routing，不是 authorization。
- 所有 mutation 與敏感讀取都由 server action、route handler、RPC 或 RLS 再驗證。
- Migration 一律 forward-only；不要靠 schema introspection 或 runtime DB error 判斷功能版本。
- 時間使用 `timestamptz` / UTC 儲存，介面依 club timezone 顯示；台灣預設 `Asia/Taipei`。
- QR 不暴露長效秘密；GPS 不保存社員原始座標或精確距離。
- 所有高頻 mobile flow 都必須考慮 320px、200% text zoom、keyboard、weak network 與 safe retry。
- **Recoverable form error 不得造成使用者已輸入資料遺失；成功才清空。**
- 小型文件修改只經過 CI／Browser Smoke 的輕量範圍 gate；涉及程式、資料庫、建置、部署或 workflow 的高風險修改仍跑完整檢查，分類失敗時採 fail-open。詳見 `docs/development/CI_EXECUTION_POLICY.md`。
- 效能量測、快取安全界線與後續量測方法集中記錄在 [`PERFORMANCE_IMPROVEMENT_LOG.md`](./PERFORMANCE_IMPROVEMENT_LOG.md)；效能修改前必須先讀取。

## 路線圖

### Phase 1 — Foundation：完成

- [x] PR-00 / #56 — Feature Flag、Rollback、Telemetry 基礎（PR #59）
- [x] PR-37A / #58 — Attendance Domain Core（PR #61）
- [x] PR-01a / #57 — ExperienceContext / server routing（PR #60）
- [x] PR-01b — Role-aware Member / Management / Platform Shells（PR #62）

### Phase 2 — Member Experience：完成

- [x] **P1 Hotfix — Event Create Form State Preservation / 活動建立失敗保留輸入內容**（PR #67）
  - 建立活動失敗保留所有欄位，提供可行動的欄位級錯誤；成功才清空。
- [x] **PR-02 — Member Home V2 / 社員任務型首頁**（PR #64）
- [x] **PR-03 — 完整簽到政策、Dynamic QR、Manual Check-in**
- [x] **PR-04 — GPS Check-in**（`20260819000200_gps_checkin_v2.sql`）
  - 200 公尺半徑、haversine 判定；不保存社員原始座標。
  - 受 `checkin_gps_v2` flag 控管。
  - 修正過程中發現應用程式自身的 `Permissions-Policy: geolocation=()` 會讓定位簽到永遠無法運作，已改為 `geolocation=(self)`。

平行小切片：

- [x] **PR-01c — Club Profile Editing / 扶輪社基本資料編輯**（`20260819000100_club_profile_rename_hardening.sql`）
  - `/clubs/[clubId]/identity`；`club_code` 政策與稽核依本文件後段規格實作。

Phase 2 之後追加並完成的社務功能：

- [x] **祝福 IOU**（core / collections / rotary-year reporting 三個 migration）
  - `/blessings`、`/clubs/[clubId]/blessing-iou`（含 collections、reports）。
  - 受 `blessing_iou_v1`、`blessing_iou_collections_v1`、`blessing_iou_reporting_v1` 控管。
- [x] **生日祝福 V1／V2 核心**（`20260820001000_birthday_wishes.sql`、`20260824000400_birthday_wishes_v2_core.sql`）— `/birthdays`
  - V2 已完成新設定預設公開、年齡同意顯示、同一作者同一壽星每日最多 10 則、作者匿名投影。
- [x] **生日祝福徵集核心**已完成程式與 staging 驗證：`20260824000600`–`20260824001700`、每月每人一則自動派發、100 題平台題庫／社團題庫 CRUD、幹部發布與隱藏重送、匿名投影及 verification；PR #77 已合併。旗標已由受保護 CLI 開啟，Render staging scheduler secret 已同步；GitHub workflow 使用只允許 `main` 的 `birthday-scheduler` environment。生日邀請真人送達與冪等重跑已由 scheduler `34695450977`／`34695655038` 驗收；M1 真人使用者測試仍另列外部待辦。
- [x] **文件中心與年度交接**（`20260820002000_archive_handover.sql`）— `/archives`
- [x] **社內留言板** — `/board`
- [x] **活動封面圖片**（`20260820000100_event_cover_images.sql`）
  - 瀏覽器端壓縮後直傳私有 bucket，位元組不經過應用伺服器；Storage row policy 即授權邊界。
- [x] **社務幹部的社員模式**（`20260821000200_event_member_view.sql`）
  - 社長等幹部在社員模式下看到與一般社員相同的活動頁並可本人簽到；管理模式提供返回社員模式的入口。

### Phase 3 — Integration & Hardening

1. ~~**PR-37B — Attendance UI / Statistics Integration**~~ — 已完成（2026-08-21）。
   `/attendance` 與 `/attendance/manage` 建在 PR #61 既有的 canonical attendance RPC 之上，
   未新增第二套 attendance authority；PR #37 的 migration 因此不採用。
   受 `attendance_ui_v2` flag 控管，預設關閉。
2. ~~**PR #40 更新 — Announcements / In-app Notifications Integration**~~ — 已完成（2026-08-22）。
   `/messages` 訊息中心：幹部依受眾發布、每位收件人各自的已讀狀態、導覽未讀徽章、
   幹部可見的已讀名單與收回。受 `announcements_v09` flag 控管，**預設關閉且必須明確開啟**
   （見 `docs/mvp/MESSAGE_CENTER_MVP_SCOPE.md`）。
3. ~~**PR-07a — 我的／帳號安全／登入協助**~~ — 核心頁面、recovery confirmation、staging redirect 同步已完成；真實 recovery email 仍受 custom SMTP 與產品決定限制，暫不列為 release blocker。
4. ~~**PR-07b — Legacy UI Cleanup / Accessibility Hardening**~~ — 本輪完成 member IA、固定導覽 clearance、巢狀 current state 與名錄 48px／200% 版面；更大範圍 legacy 清理仍可另立切片。
5. **M1 — 五位目標使用者形成性測試** — 尚未安排。

## 已知落差

以下是實作與本文件原則之間目前存在的落差，記錄於此以免被誤認為已處理：

- `birthday_wishes_v1`、`message_board_v1`、`archive_handover_v1` 已由 `20260823000100_existing_domain_feature_flags.sql` 納入 direct-route gate 與 rollback allow-list；`birthday_wishes_v2` 已由 `20260824000400_birthday_wishes_v2_core.sql` 納入明確啟用清單。這些 key 能 rollback，但多數仍預設關閉或需要明確 row，**已完成不等於社員現在看得到**。
- GPS accuracy 政策已於 2026-08-31 決定：**不設 accuracy 門檻**，只以 200 公尺距離判定；`maximumAge: 0` 已涵蓋定位新鮮度。理由與「不要自行補門檻」的提醒見 `TO-DO-LIST.md` 第 1 節。
- staging 目前 runtime 是 `1ef38bb50407`，`/api/health` 的 `issues` 與 `warnings` 都是空的；Go-Live 使用 exact SHA
  `1ef38bb504075d7a197e99c2364db8b087cea22e`。GitHub `main` 後續若只有文件同步而前進，不能因此宣稱 staging runtime 也前進；
  閱讀本文件時仍應把 release source SHA 與 staging runtime 分開看。
- PR #135 前的 staging 實測曾在社員切換社團時回傳內部 `0.0.0.0:10000` redirect；PR #135 已在 `main` 改用受信任的公開站台網址，
  並已隨本次 Go-Live 發布；仍要完成一次 hosted 社團切換回歸，才能把使用者行為標為完成。
- Auth 同步 workflow 已修復並通過（run `33400262734`），staging redirect 已同步並驗證。recovery email 範本與 custom SMTP 已由產品決定**暫時擱置**（LINE login 是主要登入方式），詳見 `TO-DO-LIST.md` 第 4 節；擱置期間不要拿 recovery 信件當驗收證據。iOS／Android 實機驗收與 M1 使用者測試仍未完成。
- 生日祝福徵集的排程、題庫、每月公平派發與幹部工作台已完成程式與本機資料庫驗證，且已包含在 staging `1ef38bb50407`；生日旗標、Render scheduler secret、migration、HTTPS smoke 與 hosted acceptance 均已完成。生日邀請真人送達與冪等重跑已由 scheduler `34695450977`／`34695655038` 驗收；follow identity pairing 仍依 E-03 待精確身份核對。
- 生日 scheduler 的環境隔離問題已修正：workflow 使用只允許 `main` 的 `birthday-scheduler` environment，並保留 staging 部署保護；secret 已同步。不可移除 staging 保護或把部署用 secrets 暴露給無審核 job。
- 本輪已完成並部署 webhook redelivery 雜湊修補、LINE OA 管理頁安全環境變數名稱投影與生日徵集 LINE 推播程式；前兩項的本機 verification、後一項的 service-role boundary 均已通過。舊 webhook row 只保存舊版 raw hash，無法安全回算，因此舊事件的失敗重送不自動放寬檢查。
- **多數新功能的 flag 預設關閉**，包含 `attendance_ui_v2`。「已完成」不等於「社員看得到」；要對使用者開啟需另行設定 flag。
- PR #37（出席統計）與 PR #10 已關閉：前者的 migration 會與 PR #61 的 canonical attendance domain 形成第二套 authority，功能改以投影層重新實作；後者是已上線功能的決策紀錄。PR #40 也已關閉，公告通知已在 `main` 實作；保留的舊分支不能直接合併。
- `src/lib/product/features.ts` 的 `developing` 清單仍包含社費／收款／核銷、報表與匯出、正式部署完成度、LINE Rich Menu、手機 Web App 與社務 AI 助理。社費與 Rich Menu 的 hosted／OA 驗收、PWA 的 iOS／Android 實機驗收仍未完成；社務 AI 助理仍沒有可執行企劃，不能擅自開工。

---

# P1 Hotfix — Event Create Form State Preservation

## 原問題（已修正）

目前建立活動流程在 server-side validation 或 RPC 建立失敗時會 redirect 回活動頁。重新 render 後，使用者剛輸入的活動資料不會被帶回，造成整張表單清空。

這會讓使用者在建立活動失敗時失去：

- 活動類型。
- 活動名稱。
- 開始時間。
- 結束時間。
- 報名截止時間。
- 名額。
- 地點。
- 是否計入出席。
- 活動說明。

同時，現有多種不同 validation / business-rule error 可能被壓成 generic「輸入內容不完整或格式不正確」，使用者無法知道應修改哪一個欄位。

## 完成記錄

PR #67 已改為 structured Server Action state：可恢復的 validation、RPC/business-rule 與暫時性失敗都不 redirect，並保留全部 submitted values；成功建立活動才 revalidate / redirect。另已覆蓋欄位級錯誤、ARIA/focus、checkbox 與 empty capacity，以及真實瀏覽器的多欄位失敗保留情境。沒有 migration，也沒有 hosted database mutation。

## 產品原則

**失敗保留，成功才清空。**

任何可恢復的建立失敗都不得讓使用者重新輸入整張表單。

## V1 目標

- client / server validation 失敗時保留所有已輸入值。
- RPC / business-rule error 時保留所有已輸入值。
- 暫時性 server error 時保留所有已輸入值，並提供安全重試。
- 顯示可行動的欄位級錯誤訊息；需要時另提供頁面級錯誤摘要。
- 第一個錯誤欄位可被 focus，並提供 `aria-invalid` / 對應錯誤說明。
- 只有成功建立活動後才清空表單，並允許既有 revalidate / redirect 成功流程繼續運作。

## 建議架構

優先採 structured Server Action state（例如 React / Next 的 `useActionState` 或等價模式）：

1. Client submit 保留目前表單 DOM / controlled or uncontrolled values。
2. Server Action 解析與驗證輸入。
3. Recoverable error 回傳 bounded structured state，不 redirect。
4. UI 依 state 顯示欄位級與頁面級錯誤，同時保留原值。
5. RPC 成功後才 `revalidatePath` / redirect 到成功狀態。

不得為了保存草稿把活動名稱、說明或其他表單內容塞進 URL query string。

不應依賴一般 cookie 保存整份活動表單內容；如果未來要做真正跨頁草稿，應另行設計 draft domain，而不是把本 Hotfix 擴張成草稿系統。

## Validation / Error UX

至少應把下列可預期錯誤轉成可理解訊息：

- 活動名稱必填或超長。
- 日期／時間格式錯誤。
- 結束時間必須晚於開始時間。
- 報名截止時間不得晚於活動開始時間。
- 名額不是合法範圍。
- 權限不足。
- RPC / database business-rule rejection。
- 暫時性 server error。

對非欄位型錯誤可顯示例如：「建立失敗，您填寫的內容已保留，請稍後再試。」

## Security / Data Boundaries

- server 仍需重新驗證所有欄位；保留表單內容不代表信任 client state。
- `clubId`、角色、mode、active club 或 browser state 不得成為 authorization authority。
- 不把敏感表單內容寫入 telemetry、URL 或不必要的持久化儲存。
- 此 Hotfix 預期不需要 DB schema migration；若實作時發現需要 migration，必須先停下並重新審查 scope。

## Acceptance

至少驗證：

- 故意輸入錯誤時間後提交，顯示明確錯誤且所有其他欄位值仍存在。
- 活動名稱、日期、地點、名額、checkbox、說明在 validation failure 後全部保留。
- RPC failure 後所有欄位值仍存在。
- 暫時性 server error 後可安全重試，不需重新填表。
- 權限錯誤不洩漏敏感資訊，也不誤導為成功。
- 成功建立後才清空／離開建立表單。
- 第一個錯誤欄位可 keyboard focus，錯誤訊息有可及性關聯。
- 320px / 375px / 412px 無水平頁面 overflow。
- 200% text zoom 下表單、錯誤訊息與 submit button 都可操作。
- deterministic unit / integration regression 覆蓋 validation failure 與 RPC failure。
- CI、Quality、Browser Smoke 維持全綠；若無 DB 變更，不新增 migration。

## Non-goals

此 Hotfix 不做：

- 真正的跨裝置／跨登入活動草稿。
- Auto-save 到 database。
- Event schema redesign。
- QR / GPS Check-in。
- Attendance UI / statistics。
- Member Home redesign。
- Announcements / notifications 擴張。

---

# PR-01c — Club Profile Editing

## 問題

目前扶輪社建立流程會在建立時寫入 `club_name`，之後的 Platform Club 頁面與 Management / Identity 頁面只會顯示名稱，沒有正式的編輯入口、server action 或 protected rename/update flow。

結果是：

- 建立時輸入錯字後無法自行修正。
- 扶輪社正式更名後，平台顯示名稱無法同步更新。
- 後續 Member Home、活動、簽到與通知會持續顯示舊名稱。

這是產品管理能力缺口，不應要求使用者直接修改資料庫。

## V1 目標

建立一條 server-authoritative 的「扶輪社基本資料」編輯流程，第一版至少支援：

- 修改扶輪社顯示名稱 / 正式名稱（目前 `club_name`）。

以下欄位可以在未來 domain 明確後擴充，但不應為了本 PR 強行新增：

- 英文名稱。
- 地區 / 分區。
- 例會地點。
- 例會時間。
- 官方聯絡資訊。

## `club_code` 政策

`club_code` 在 V1 **不允許一般社務流程修改**。

原因：

- 它已被當作穩定的系統識別資訊使用。
- LINE OA environment namespace 會依 club code 正規化。
- 變更 code 可能影響 URL、整合設定、audit 與未來外部對接。

若未來需要更改 `club_code`，應另外設計 platform-only migration / rename workflow，而不是和顯示名稱共用一個普通表單。

## Authority

不得因為使用者目前在 Management Shell 或 Platform Shell 就直接允許修改。

實作時必須重用既有 server-authoritative RBAC / platform authority：

- Club-level 修改必須由現有 canonical club-management permission / predicate 驗證。
- Platform-level 修改必須重用既有 platform authority predicate。
- 不接受 browser 提交 role、permission、account ID 或 mode 作為 authority。
- 不直接開放 browser 對 `clubs` table 的 `UPDATE`。

具體 permission key / predicate 名稱應在 PR-01c targeted audit 時依 main 的既有 RBAC 決定，不要新建第二套角色模型。

## 建議架構

優先採用：

1. Management / Platform UI 提交 bounded form。
2. Server action 做格式驗證。
3. Protected RPC 在 DB 內重新驗證 caller 與 club authority。
4. 更新 `club_name`。
5. 寫入 append-only audit log。
6. redirect 回同一扶輪社的「社務資料」或 Platform club detail。

若 main 已有可安全重用的 club-update RPC，直接使用；若沒有，再用 forward-only migration 新增最小、readable、fixed-search-path 的 protected RPC。

## Validation

`club_name` 至少需要：

- trim 前後空白。
- 拒絕空字串。
- bounded length。
- 不接受 control characters / 不合理 payload。
- 不因改名修改 club ID、club code、membership、operator assignment 或 active-club preference。

名稱是否允許不同扶輪社相同，應沿用現有資料模型；不要在 UI 層自行新增不存在的 global uniqueness 規則。

## Audit

每次成功更名必須留下 append-only audit record，至少包含：

- actor。
- target club。
- action type。
- before / after 的 bounded club name metadata（若既有 audit schema 支援）。
- timestamp。

不要在 audit 中放 session、token、LINE subject、Email 或其他不必要的個資。

## UI

Management Shell：

- 在「社務資料」脈絡中提供清楚的編輯入口。
- 顯示目前名稱與不可編輯的 club code。
- 成功後下一個 request 應立即顯示新名稱。

Platform Shell：

- Platform club detail 應能進入同一個安全編輯流程或等價的 platform-authorized入口。

不要建立兩套不同的資料更新 authority。

## Non-goals

PR-01c 不做：

- 任意修改 club code。
- 刪除扶輪社。
- 合併扶輪社。
- 批次改名。
- LINE OA secret / token 管理。
- Member Home、QR、GPS、Attendance UI。
- 新 RBAC 模型。

## Acceptance

至少驗證：

- 合法 club manager 可以依既有權限修改自己的扶輪社名稱。
- 無權限社員不能修改。
- 其他社管理者不能跨社修改。
- Platform authority 可以依既有 platform policy 修改。
- browser 直接 table update 仍被拒絕。
- 空名稱、超長名稱、非法 payload 被拒絕。
- club code、club ID、membership 與 operator assignment 不因改名改變。
- 多社使用者改 A 社名稱後不影響 B 社。
- Shell、active-club selector、Platform club detail 在下一個 request 顯示新名稱。
- mutation 有 audit record。
- 320px、200% text zoom、keyboard 操作可用。
- CI、Database、Quality、Browser Smoke 全綠。

---

## Dependency Map

```text
[完成] P1 Event Form Hotfix ─> PR-02 Member Home ─┐
[完成] PR #59 / #60 / #61 / #62 基礎 ─────────────┴─> PR-03 Dynamic QR ─> PR-04 GPS ─> PR-37B Attendance UI
[完成] PR-01c Club Profile Editing
[完成] 祝福 IOU · 生日 V2 核心 · 文件交接 · 留言板 · 活動封面 · 幹部社員模式
[完成] PR #40 Announcements/Notifications · 首頁通知 projection
[完成] PR-07a 帳號安全核心 · PR-07b 行動版 IA／accessibility 核心
[已部署程式] PR #107 Rich Menu · PR #108 社費／收款／核銷 · PR #109 手機 Web App · PR #110 生日設定 · PR #111 社務服務計劃 · PR #113 地點查座標 · PR #124 結構化年度服務計劃 V2 · PR #126 已發佈活動編輯 · PR #127 手機／桌機共用設計系統第二輪 · PR #130 管理模式邊界 · PR #132 活動推播版本契約 · PR #135 活動切換社團公開網址 · PR #145 首頁卡片修正
[已合併／工具] PR #117 同頁模式導覽修正 · PR #118 migration collision repair · PR #119 migration collision guard · PR #120 活動封面 · PR #122 UI design system · PR #123 UI 層次與 header gutter · PR #125、#136–#141 進度與 rollout 文件同步 · PR #143／#144／#146／#147 staging 受控 logical backup workflow
[已完成 E-01] Flex staging 發布／旗標／真人收訊
[已完成 E-02] 生日邀請實際送達／冪等重跑
[外部待辦 E-03] LINE Login identity follow 自動配對真人驗收
[已決定 E-04] 本次 rollout 只啟用 PANCHIAO-ELITE，HAPPY 不使用；[已完成 E-05] 推播額度採停止並提示
[外部待辦 E-06／E-07／E-10] 效能量測／實機與 M1／雙重社籍驗收
[產品決策 E-08／E-09] production 準備／Recovery email（若重啟）
[後續開發／外部待辦 E-11] LINE Rich Menu／完整 OA 整合
[已完成 E-12] staging 受控 logical backup；Free 方案沒有原生 backup／PITR，採加密匯出
```

## Current Next Actions

目前仍未結案的項目，完整清單與證據以 [`TO-DO-LIST.md`](./TO-DO-LIST.md) 的 E-01–E-12 為準；E-01、E-02、E-04、E-05、E-12 已完成，E-09 依產品決定暫緩。下一步不是重新開發 E-05，而是依照外部條件依序補驗收：

1. **E-03：follow 自動配對真人驗收** `[>]`：用乾淨真人帳號確認 LINE Login 身份自動對到正確 person，再測多社／外社／停權／退社；目前程式與日期窗口防護已完成，缺的是人核對的證據。
2. **E-10：雙重社籍與跨社執行秘書驗收** `[>]`：本機已有撤銷管理者、停權、退社的 role-shell 負向測試；仍需 staging 真人確認雙重社籍、跨社執行秘書、資料隔離與管理權限不越權。
3. **E-06：登入後管理頁效能量測** `[>]`：社員首頁單一 hero preload 修正已部署並完成 DOM 核對；仍缺同一帳號、同一社別、同一 runtime／快取條件下的 FCP／TTFB／LCP 前後比較，以及 INP。Chrome DevTools 沒有已登入 staging session 前，數字一律記為「未量測」，不得用 `/login` 或不同 runtime 的數字代替。
4. **E-07：iOS／Android 實機與 M1 測試** `[ ]`：至少五位社員／幹部，記錄裝置、網路、結果與問題；自動化 Chromium 不取代真人實機與訪談。
5. **E-11：LINE Rich Menu／完整 OA 整合** `[>]`：程式已合併並部署 staging；仍待各社 OA 外部設定、旗標決策與真人手機驗收，不得把本機 mock 測試當成 LINE 發布證據。
6. **E-08：production 準備** `[!]`：另立正式環境 release 任務，不與 staging 驗收混在一起；在取得明確產品決策前不修改 production。
7. **E-09：Recovery email 維持暫緩** `[!]`：只有符合重啟條件才做 custom SMTP 與真人信件驗收。
8. **非外部驗收項目**：社費／收款／核銷、財務報表與生日設定 UX 已有程式與 staging 基礎，但仍要依 `TO-DO-LIST.md` 的角色、空資料、儲存／關閉與跨社矩陣逐項驗收；服務計劃 hosted 草稿／發布邊界已結案。社務 AI 助理沒有已批准的可執行規格，不擅自開工。

目前採本地開發、完整驗證、清楚 commit 後同步 `main` 的節奏；production 永遠不在本輪範圍。staging 只能依受保護的 release／Go-Live workflow 操作，不得直接修改 hosted database，也不得使用真實社員資料驗證。#124、#126、#127、#130、#132、#135、#139 與 #145 已隨 Go-Live `34912921064` 發布；#136–#141 與 #143／#144／#146／#147 是文件／發布工具變更。後續若只有文件同步，不需要重新部署 staging。
