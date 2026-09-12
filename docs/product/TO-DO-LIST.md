# Rotary Platform 待辦執行清單

更新日期：2026-09-12（Asia/Taipei）

權威來源：GitHub `Leojung0823/rotary-platform-v2` 的 `main`。本文件取代
`/Users/leoj/Documents/Codex/2026-08-23/rotary-platform-to-do-list/TO-DO-LIST.md`
的舊掃描結果；那份檔案屬於獨立 worktree，不是權威 repo 的版本。

狀態：`[x]` 已完成　`[>]` 程式完成、等待外部驗收　`[!]` 需要產品決定　`[ ]` 尚未開發

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

- **目前證據**：scheduler protected route 已成功執行；最新 run `34673612440` 回報成功，但
  `generated_count=1`、`notified_count=1`、`line_push.jobCount=0`、`sentCount=0`，所以只證明排程路徑，不證明社員收到 LINE。
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

### E-03 LINE Login 身份的 follow 自動配對真人驗收 `[!]`（暫緩）

- **目前決策（2026-09-13）**：產品決定**暫緩**本項驗收，不列為目前的進行中工作。程式與旗標維持現狀，
  不因為暫緩而關閉或改動。
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

### E-04 每社 LINE OA 與 channel 設定 `[!]`

- **已完成**：`PANCHIAO-ELITE` 使用 `LINE_OA_PANCHIAO_ELITE_*`，staging 的管理頁身份驗證已成功。
- **待產品決定**：若 `HAPPY` 也要使用 OA，必須建立 HAPPY 自己的 OA／Messaging API channel、自己的 webhook 與
  `LINE_OA_HAPPY_*` server secrets；不能把 PANCHIAO 的 key 改名或跨社 fallback。
- **完成證據**：每個要上線的社都通過 LINE `/v2/bot/info` Basic ID 核對、webhook Verify、follow 與指定對象推播驗收。

### E-05 LINE 推播額度與超額政策 `[!]`

- **外部動作**：由產品／平台管理員確認目前 LINE 方案、每月額度與 429 行為，決定超額時「停止並提示」或「照送並記錄」。
- **完成證據**：決策寫入產品文件；必要時用受控測試驗證 500 人分批、429、重試與部分送達紀錄，不拿真實社員做壓力測試。

### E-06 登入後管理頁效能量測 `[>]`

- **外部條件**：需要已登入的 staging 管理帳號與 Chrome DevTools 效能工具；目前只有未登入 `/login` 的 lab 數字，管理頁 TTFB／LCP／FCP 尚未量測。
- **最新工具狀態（2026-09-12）**：Chrome DevTools MCP 目前只連到未登入的 `/login`；已登入管理頁在另一個瀏覽器 session，尚未取得同一 session 的 trace，因此管理頁數字維持「未量測」。
- **完成證據**：同一帳號、同一社、同一網路條件，取得改版前後 TTFB、LCP、FCP；紀錄測試時間與快取狀態，沒有數字就標「未量測」。

### E-07 iOS／Android 實機與 M1 使用者測試 `[ ]`

- **外部動作**：用 iOS Safari、真實 Android Chrome，以及至少五位社員／幹部測試登入、導覽、簽到、生日祝福、LINE OA 導引與管理流程。
- **完成證據**：逐項記錄裝置、瀏覽器、網路、結果與問題；自動化 Chromium 不能取代實機與訪談。

### E-08 production 上線準備 `[!]`

- **待產品／平台決定**：production 是否開啟各功能旗標、production LINE OA／Login channel、生日 scheduler、額度與維運責任。
- **必要動作**：確認 production 備份／還原點、HTTPS 網域、server secrets、migration plan、人工核准閘門與回復步驟。
- **安全界線**：本清單更新前 production 沒有修改；任何 production 操作要另開明確 release 任務。

### E-12 staging 沒有資料庫備份 `[!]`

- **事實（2026-09-12 核對）**：staging 專案 `rotary-platform-v2-staging` 在 Supabase **Free 方案**，
  Dashboard → Database → Backups 顯示「Free Plan does not include project backups」，
  也沒有 point-in-time recovery。**這個專案目前沒有任何可還原的備份。**
- **影響**：Go-Live 表單的 `backup_confirmation=BACKUP-READY` 在此專案上**不可能**以「有備份」為依據。
  在此之前的每一次 Go-Live 都輸入過這個值，所以這是既存落差，不是本次才出現的。
- **目前做法**：改以 `STAGING_RUNBOOK.md` 第 9 節的 **forward-fix** 為依據，並在該節寫明可用 forward-fix
  主張的條件（只改 schema 物件定義、不刪表/欄位、不改寫資料、無不可逆轉換）。
  2026-09-12 的 Go-Live `34707246035` 即依此進行——該版本只做函式 `create or replace`
  與一次投影 drop/recreate，不觸及任何資料列。
- **待產品決定**：是否升級 Supabase 方案以取得排程備份，或改為定期自行匯出 staging 資料。
  在此之前，**任何具破壞性的 migration（drop column、型別轉換、資料遷移）都不得部署到 staging**，
  因為出錯將無法還原。
- **與 E-08 的關係**：production 不得沿用此權宜做法；E-08 已列明 production 上線前必須確認備份／還原點。

### E-09 Recovery email 與 custom SMTP `[!]`（暫緩）

- **目前決策**：登入以 LINE 為主，recovery email 暫不重啟，不列為目前 release blocker。
- **重啟條件**：production 上線前，或密碼登入比例上升／社員回報重設失敗。
- **重啟後驗收**：設定 custom SMTP，完成「收到新信 → 點信 → 確認 → 更新密碼 → 重新登入」真人流程；不可用 Mailpit 代替。

### E-10 雙重社籍／跨社執行秘書真人驗收 `[>]`

- **目前證據**：程式與資料庫規則已在 `main`／staging；同一個人可有多社有效社籍，也可同時擔任執行秘書，且社籍本身不會自動變成管理權限。
- **外部動作**：準備一個同時具兩社有效社籍、其中一社另有執行秘書權限的 staging 測試帳號，實際切換社別與模式；再測外社執行秘書、停權／退社帳號。
- **完成證據**：每個社只看到自己的資料；社員模式與管理模式能正確切換；沒有管理權的有效社員不能進管理頁；停權／退社不能取得原有權限。

### E-11 LINE Rich Menu／完整 OA 整合 `[ ]`

- **目前證據**：目前只有 LINE OA 設定、follow、手動推播、事件推播與 Flex 第一版；Rich Menu 尚未開發，不是本輪 staging blocker。
- **外部動作**：產品先決定各社 Rich Menu 的入口與文案；開發完成後，由各社在自己的 LINE OA／Messaging API channel 設定並驗證 menu、URI 與權限邊界，不共用其他社的 OA。
- **完成證據**：每個啟用的社都能在自己的 OA 看到正確 Rich Menu；登入／社別切換不會把 A 社入口導到 B 社；停用旗標或未設定 OA 時不會送出錯誤連結。

## 非外部開發待辦

這些是需要另外開發與驗證的產品功能，不應誤寫成「等外部設定」：

- `[ ]` 社費、收款與核銷（應收、部分收款、代墊、核銷）。
- `[ ]` 報表與匯出（社員、活動、出席、財務 Excel／PDF）。
- `[ ]` LINE Rich Menu 與完整 OA 整合（開發與外部設定見 E-11）。
- `[ ]` 手機 Web App（安裝、離線提示與推播準備）。
- `[ ]` 社務 AI 助理（摘要、公告草稿、會議紀錄與授權查詢）。

### 生日設定 UX 調整（產品決定 2026-09-12）

實際操作 `/birthdays` 時提出，三項都要開發，不是外部設定：

- `[ ]` **`/birthdays` 不應該可以切換扶輪社**。該頁目前有「扶輪社」下拉與「切換扶輪社」按鈕，
  但社別切換已經有全域 `ClubSwitcher`。重複的入口容易把設定存到錯的社——表單送出的是當前
  `clubId`（`src/app/(authenticated)/birthdays/page.tsx:129`），切錯社就寫到別社的社籍上。
  移除這個區塊，沿用全域已選社別。
- `[ ]` **生日隱私改為預設全部打開**。目前尚未設定的社籍沒有 `birthday_visibility_preferences` 列，
  投影以 `coalesce(preference.is_listed, false)` 視為關閉
  （`20260901000100_birthday_collection_manager_permissions.sql:837-838`），排程的 inner join
  也因此完全排除該社員。**這是隱私模型的變更，要一併決定兩件事**：既有「尚未設定」的社籍要不要回填，
  以及排程端「缺列」的語意是否跟著改成預設納入。只改畫面預設值而不改這兩處，會出現「畫面說預設公開、
  排程卻仍然看不到這個人」的不一致——2026-09-12 的 E-02 卡關正是這個成因。
- `[ ]` **把生日開關整合進 `/me`**。`/me` 已有「通知與名冊隱私」卡片，生日公開設定另外放在
  `/birthdays`，個人隱私變成兩處管理。整合時要保留**每社獨立**的語意（偏好的 key 是 membership + club），
  不能整併成跨社共用一組設定；雙重社籍的成員必須還能分社設定。
- `[ ]` **生日徵集產生失敗時的錯誤訊息無效**（2026-09-13 實測發現）。幹部在生日徵集管理頁用
  「建立／重跑本月任務」產生一個該社員當年度已存在徵集的批次時，畫面只顯示
  「操作沒有完成，請稍後再試。」——但**再試永遠不會成功**，因為真正原因是
  `birthday_campaign_recipient_year_unique unique (club_id, recipient_membership_id, birthday_year)`：
  每位社員每社每年只能有一個生日徵集。唯一約束的錯誤訊息沒有對照到
  `src/lib/birthday-collection/rpc-error.ts`，就掉進 `unexpected` 這個 fallback
  （`rpc-error.test.ts:20` 正是斷言未知訊息一律回 `unexpected`）。

  實測經過：PANCHIAO-ELITE 的 LEO 已有 2026 年徵集（10 月批次建立），把生日改到 11/20 後產生
  2026/11，RPC 拋例外、交易回滾，`birthday_wish_assignment_batches` 連一列都沒留下，
  幹部完全看不出原因。改用年份 2027 即可通過。

  要修的是給這個情境一個講得清楚的訊息（例如「這位社員今年已經有一個生日徵集」）。
  **不要放寬那條唯一約束**——一個人一年只有一個生日，約束是對的，錯的是訊息。
  順帶檢查 `rpc-error.ts` 還有哪些會落入 `unexpected` 的既有錯誤，那個 fallback 對使用者等於沒有資訊。

## 本輪結論

原待辦清單的 0、2–3、6–11 項，能在程式與本機環境完成的部分已完成；
GPS 精度政策已決定（不設 accuracy 門檻），密碼 recovery 已依產品決定擱置；自動化檢查不取代
E-06／E-07 的登入後效能量測與實機驗收。生日 V2 核心、生日祝福徵集、LINE OA 真實推播基礎與管理模式核心都已進入 `main`。
生日首頁通知修復與本輪 LINE／生日推播修補也已部署到 staging；最新 staging runtime 為 `fbdc061dd702`，Flex Go-Live run 是 `34686702234`。

本輪又補上三個可在 repo 內完成的 LINE 缺口：webhook redelivery 雜湊穩定化、OA 後台安全顯示
環境變數名稱，以及生日徵集邀請的 LINE 推播路徑。這些修改已合併並部署到 staging；仍要做一次
生日邀請的實際送達驗收。

另補上 `line_oa_auto_pairing_v1` 共用旗標判斷的明確開啟要求（`68b12a5`）；已隨 Go-Live `34594381922` 部署 staging。

LINE OA 的 staging 真實 Messaging API、訊息中心公告推播、活動發布推播與 webhook 基礎已完成真人送達驗收；
follow 自動配對的程式與 flag 已完成，但「LINE Login identity 精確對上社員」仍需專門真人驗收。

截至 2026-09-12 的權威基準：本輪 staging release 採用的 `main` exact SHA 為 `fbdc061dd702f453ab340bd595279223487d0838`，
staging 最新產品 runtime 為 `fbdc061dd702`；staging `/api/health` 回報
`revision=fbdc061dd702`、`status=ok`、`issues=[]`、`warnings=[]`。Flex 第一版已進入 main，Plan `34686603765` 與 Go-Live `34686702234` 均成功，已部署 staging，但旗標尚未開啟。
最新已部署 migration 是
`20260912000200_line_oa_flex_templates_flag.sql`；Flex 旗標尚未開啟。

前一輪產品修補的完整 `CI` `34584379642`、`Browser Smoke` `34584379653` 均成功；Staging Release Plan `34586642034`、
Staging Go-Live `34594381922` 也成功完成，Go-Live 的 migration、HTTPS smoke 與 hosted member acceptance 均通過。
之後 docs-only 文件同步的 `CI` `34583431760`、`Browser Smoke` `34583431873` 僅執行變更範圍分類器，完整 jobs 依 gate 跳過。
產品 release 的 Staging Release Plan `34576631319`、Staging Go-Live `34576829556` 與 Staging Management Acceptance
 `34577046356` 亦已成功完成；執行秘書管理驗收也通過。

PR #98 合併後的 `CI` `34685398379` 已成功；本輪文件同步前後的 `CI` `34686598214` 與
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

生日旗標與正確 Render staging service 的 scheduler secret 已同步；最新排程 `34673612440` 成功，
但 `line_push.jobCount=0`、`sentCount=0`，所以 LINE 邀請實際送達仍尚未證明；這不是目前的 secret 不一致問題。
production 沒有修改；目前沒有 open PR，PR #98 已合併至 `main`。

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
`birthday_wishes_v2`、`birthday_wishes_collection_v1`；正確 Render staging service 的
`BIRTHDAY_COLLECTION_SCHEDULER_SECRET` 已同步至 GitHub `birthday-scheduler` environment。
最新 scheduler `34673612440` 已成功呼叫 protected staging route，但因本輪沒有符合條件的收件人，
`line_push.jobCount=0`、`sentCount=0`；仍要依 E-02 做有收件人的真人送達與冪等重跑驗收。不能移除 staging 保護。
歷史失敗 run `33121570908`／`33121704322` 保留作為啟用前的追蹤證據；M1 真人使用者測試仍是另一個待辦。

規格請看 [`BIRTHDAY_WISHES_V2_PLAN.md`](../mvp/BIRTHDAY_WISHES_V2_PLAN.md)。

### LINE OA 訊息推播（真實 Messaging API）`[>]`

產品決定（2026-09-02）：本輪先把**真實 Messaging API 接通**。現在 channel access token／secret 已設入
staging，真實 Messaging API、訊息中心公告、活動發布與 webhook 基礎均已完成 staging 真人驗收；生日邀請的
實際送達、follow identity pairing、Flex staging 發布、production 準備、額度政策與 Rich Menu 外部設定仍列在上方 E-01–E-11。

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

#### 外部條件摘要（完整清單以 E-01–E-11 為準）

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
- `[!]` 每月推播額度與超額行為，見 E-05；各社各自的 OA／channel／webhook，見 E-04。
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

- `[>]` 事件驅動自動推播的**最後一個來源**：生日祝福徵集邀請。程式已完成
  `20260911000200_birthday_collection_line_push.sql`、scheduler route 串接、service-role-only
  收件人投影／推播紀錄、既有 `line_oa_event_push_v1` 明確啟用閘門與單元測試；migration
  已部署到 staging；最新 scheduler `34673612440` 成功但 `jobCount=0`、`sentCount=0`，仍待有收件人的實際邀請 LINE 送達驗收。通知目前由
  `ensure_birthday_wish_collection_notification`（service-role scheduler）建立，沒有登入使用者，
  所以特別使用 service-role 版本，不擴大前兩條 `member.manage`／`event.manage` 的權限。
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

唯一的外部待辦清單是本文件前面的 E-01–E-11；執行順序如下：

1. **E-01：Flex staging 發布與真人收訊** `[x]`：Plan、Go-Live、staging 旗標啟用、三種卡片模板真人收訊與 `line_push_logs` 的 `sent`／provider request id 均已完成，2026-09-12 結案。
2. **E-02：生日邀請 LINE 實際送達** `[x]`：2026-09-12 完成。`PANCHIAO-ELITE` 的邀請實際送達 `Michael` 的 LINE，重跑 `jobCount=0` 不重送；負向情境（取消追蹤、關閉通知）未另做對照測試。
3. **E-03：follow 自動配對真人驗收** `[!]`：2026-09-13 產品決定暫緩。旗標仍開著、程式已上線，但 identity 配對正確性沒有真人證據；production 上線前必須補做。
4. **E-10：雙重社籍與跨社執行秘書驗收** `[>]`：確認社別資料隔離、模式切換與管理權限不越權。
5. **E-06：登入後管理頁效能量測** `[>]`：使用已登入 staging 帳號量測 TTFB、LCP、FCP；沒有數字就寫未量測。
6. **E-07：iOS／Android 實機與 M1 測試** `[ ]`：至少五位社員／幹部，記錄裝置、網路、結果與問題。
7. **E-04／E-05：各社 OA 設定與額度政策** `[!]`：逐社確認 channel 與憑證；產品決定超額行為。
8. **E-08：production 準備** `[!]`：另立正式環境 release 任務，不與 staging 驗收混在一起。
9. **E-09：Recovery email 維持暫緩** `[!]`：只有符合重啟條件才做 custom SMTP 與真人信件驗收。
10. **E-11：LINE Rich Menu／完整 OA 整合** `[ ]`：先完成產品入口設計，再另立開發與各社 OA 設定驗收。
11. **E-12：staging 備份能力** `[!]`：決定升級方案或自行匯出；在此之前不部署破壞性 migration 到 staging。

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

## 最新掃描證據（2026-09-12；本輪部署後基準）

- 本輪 staging release 採用的 `main` exact SHA 為 `fbdc061dd702f453ab340bd595279223487d0838`；PR #98 merge commit 為
  `55047dd1f2d936a5147458fd16faa5038b068c3d`；目前沒有 open PR，後續 `main` 文件同步 commit 不改產品部署內容。
- staging runtime revision 為 `fbdc061dd702`，已包含 Flex migration，但 `line_oa_flex_templates_v1` 尚未開啟。
- Flex Staging Release Plan `34686603765` 與 Go-Live `34686702234` 均成功，核對同一個 exact SHA `fbdc061`。
- staging `/api/health`：`status=ok`、`configuration=true`、`database=true`、`issues=[]`、`warnings=[]`。
- staging Go-Live `34686702234` 以 exact SHA `fbdc061…` 成功；最新已部署 migration 是
  `20260912000200_line_oa_flex_templates_flag.sql`。
- 本輪文件同步後的 `CI` `34686598214` 與 `Browser Smoke` `34686598210` 均成功；完整 database／member-browser jobs 依變更範圍 gate 跳過。
- 最新 Birthday Collection Scheduler `34673612440` 成功，但 `line_push.jobCount=0`、`sentCount=0`；生日邀請實際送達仍是 E-02。
- production 沒有修改；所有需要外部平台、真人或產品決定的項目均已集中列在 E-01–E-11。
