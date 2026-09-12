# Rotary Platform V2 開發地圖

更新日期：2026-09-12（Asia/Taipei）

本文件是 Rotary Platform V2 接下來的產品開發順序與依賴關係。它補充 Epic #55「社員體驗與簽到 V2」，並把已完成的基礎工作、下一階段主線，以及新發現的產品與 UX 缺口放在同一張地圖上。

## 目前基線

目前 `main` 已包含：

- PR #59：Feature Flag、Rollback、Privacy-safe Telemetry 基礎。
- PR #61：Canonical Attendance Domain Core。
- PR #60：Server-authoritative ExperienceContext、角色脈絡與路由解析。
- PR #62 / PR-01b：Member / Management / Platform 三套 Role-aware Shell、合法 mode switching、active-club preference、responsive 與 accessibility 基礎。

自上次更新後，主線已推進到「權限與資料底座 → 角色脈絡 → Shell → 社員首頁 → Dynamic QR 簽到 → GPS 簽到 → 出席 UI」全部完成。權威來源是 GitHub `main`；扶輪社名稱編輯、祝福 IOU、生日祝福 V2、文件中心與年度交接、社內留言板、活動封面圖片、首頁通知摘要、帳號安全分層與登入 recovery hardening 都已進入主線。

截至 2026-09-12 的實際掃描基準：

- 本輪 staging release 採用的 `main` exact SHA 為 `fbdc061dd702f453ab340bd595279223487d0838`；staging 產品 runtime 已部署到 `fbdc061dd702`。其後只同步文件，沒有改產品程式或資料庫。`68b12a5` 的 `line_oa_auto_pairing_v1` fail-closed 修補已包含在 staging release，不再是「尚未部署」。
- staging `/api/health` 回報 `status=ok`、`revision=fbdc061dd702`、`configuration=true`、`database=true`，`issues=[]`、`warnings=[]`。
- 最新 staging Go-Live 是 `34686702234`，以 exact SHA `fbdc061dd702f453ab340bd595279223487d0838` 成功完成 migration、部署、HTTPS smoke 與 hosted member acceptance；最新 migration 是 `20260912000200_line_oa_flex_templates_flag.sql`。
- 本輪 Flex 的 Staging Release Plan `34686603765` 與 Go-Live `34686702234` 均以同一個 `main` exact SHA `fbdc061dd702f453ab340bd595279223487d0838` 成功完成；migration 已套用到 staging，但 `line_oa_flex_templates_v1` 尚未開啟，真人收訊仍待驗收。
- 管理驗收第一次 run `34575792573` 失敗的原因是驗收腳本誤找不存在的 `management-card-events`；依產品既有設計改點管理模式第一層「活動」導覽後，`34577046356` 已成功通過，沒有放寬產品權限或新增活動卡片。
- 後續 scheduler workflow 環境隔離修正已在 `main` commit `6de28163e40bddd812bfc2c43a30fd43e04d006c`；CI `34573685666` 與 Browser Smoke `34573685718` 均成功。這是排程設定修正，沒有重新部署 staging 應用程式，staging runtime 仍是上列產品 release。
- `68b12a5` push 後的自動 `CI` `34584379642` 與對應 `Browser Smoke` `34584379653` 均已成功（含完整流程與 rollback 檢查），並已由 Go-Live `34594381922` 部署到 staging。
- 本輪文件同步前後的自動 `CI` `34686598214` 與 `Browser Smoke` `34686598210` 均成功；變更範圍分類器判定為文件變更，完整 database／member-browser jobs 依規則跳過。

本輪另完成生日祝福徵集領域的程式切片：每月批次與排程、每位社員每月最多一則自動派發、壽星排除、100 題平台題庫、社團題庫管理、題目快照與同批次文字去重、幹部發布／隱藏／重送、匿名公開牆、站內通知與安全驗證。PR #77 已合併至 `main`；生日旗標與 Render staging 的 scheduler secret 已同步，hosted acceptance 已通過。最新 scheduler run `34673612440` 成功，但 `line_push.jobCount=0`、`sentCount=0`，所以生日邀請實際 LINE 送達仍未證明，列為外部驗收待辦。

近期主線也已完成 LINE OA follow 配對、LINE OA onboarding 入口、社員優先與 senior-friendly UX、社團切換隔離，以及「生日任務完成後從首頁通知消失、歷史仍留在訊息中心」的修正。

本輪已補上並部署三個 LINE 缺口：webhook redelivery 只忽略 `deliveryContext.isRedelivery` 的穩定雜湊、
OA 管理頁顯示每社環境變數名稱（不顯示秘密值），以及由 protected birthday scheduler 發送生日徵集邀請到
已配對且開啟通知的 LINE 社員。資料庫 RPC 僅授予 service role；缺少或未開啟
 `line_oa_event_push_v1` 時不送出。程式與 migration 已在 staging，仍待下一次排程的實際 LINE 送達驗收。

另補上 `line_oa_auto_pairing_v1` 在共用應用程式旗標判斷器中的明確開啟要求；沒有旗標資料列時維持關閉，修補 commit 為 `68b12a5`，已隨 `34594381922` 部署到 staging。

2026-09-12 新增 LINE OA Flex 卡片模板第一版，PR #98 已合併至 `main` merge commit `55047dd1f2d936a5147458fd16faa5038b068c3d`：管理頁提供社務公告、活動提醒、生日祝福三種固定版型與預覽；伺服器端重新檢查社別、`oa.manage`、旗標與 OA 憑證，沿用既有對象解析與批次推播。新增 migration `20260912000200_line_oa_flex_templates_flag.sql`，預設關閉；本機資料庫驗證、828 個測試與 LINE OA E2E 4/4 均通過。Staging Release Plan `34686603765` 與 Go-Live `34686702234` 已成功；目前只剩 staging 旗標開啟與 LINE 真人收訊，外部步驟集中記在 `TO-DO-LIST.md` 的 E-01。

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
統一記在 [`TO-DO-LIST.md`](./TO-DO-LIST.md) 的 E-01–E-11；本文件只保留路線與依賴，不另維護第二份外部待辦。

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
- [x] **生日祝福徵集核心**已完成程式與 staging 驗證：`20260824000600`–`20260824001700`、每月每人一則自動派發、100 題平台題庫／社團題庫 CRUD、幹部發布與隱藏重送、匿名投影及 verification；PR #77 已合併。旗標已由受保護 CLI 開啟，Render staging scheduler secret 已同步；GitHub workflow 使用只允許 `main` 的 `birthday-scheduler` environment。最新 scheduler `34673612440` 成功，但 `line_push.jobCount=0`、`sentCount=0`，因此生日邀請實際送達與 M1 真人使用者測試仍另列外部待辦。
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
- staging 目前 runtime 是 `fbdc061dd702`，`/api/health` 的 `issues` 與 `warnings` 都是空的；本輪 staging release 採用的 `main` exact SHA 是 `fbdc061dd702f453ab340bd595279223487d0838`，Flex migration 已部署但旗標尚未開啟。閱讀本文件時仍應以 GitHub `main` 的最新 commit 為權威，並把後續純文件 commit 與產品部署 SHA 分開看。
- Auth 同步 workflow 已修復並通過（run `33400262734`），staging redirect 已同步並驗證。recovery email 範本與 custom SMTP 已由產品決定**暫時擱置**（LINE login 是主要登入方式），詳見 `TO-DO-LIST.md` 第 4 節；擱置期間不要拿 recovery 信件當驗收證據。iOS／Android 實機驗收與 M1 使用者測試仍未完成。
- 生日祝福徵集的排程、題庫、每月公平派發與幹部工作台已完成程式與本機資料庫驗證，且已包含在 staging `fbdc061dd702`；生日旗標、Render scheduler secret、migration、HTTPS smoke 與 hosted acceptance 均已完成。最新 scheduler `34673612440` 成功，但沒有符合條件的 LINE 收件人（`jobCount=0`、`sentCount=0`），每日實際送達仍需外部驗收。
- 生日 scheduler 的環境隔離問題已修正：workflow 使用只允許 `main` 的 `birthday-scheduler` environment，並保留 staging 部署保護；secret 已同步。不可移除 staging 保護或把部署用 secrets 暴露給無審核 job。
- 本輪已完成並部署 webhook redelivery 雜湊修補、LINE OA 管理頁安全環境變數名稱投影與生日徵集 LINE 推播程式；前兩項的本機 verification、後一項的 service-role boundary 均已通過。舊 webhook row 只保存舊版 raw hash，無法安全回算，因此舊事件的失敗重送不自動放寬檢查。
- **多數新功能的 flag 預設關閉**，包含 `attendance_ui_v2`。「已完成」不等於「社員看得到」；要對使用者開啟需另行設定 flag。
- PR #37（出席統計）與 PR #10 已關閉：前者的 migration 會與 PR #61 的 canonical attendance domain 形成第二套 authority，功能改以投影層重新實作；後者是已上線功能的決策紀錄。PR #40 也已關閉，公告通知已在 `main` 實作；保留的舊分支不能直接合併。
- `src/lib/product/features.ts` 目前列出 13 個 `available`、6 個 `developing` 功能。仍標示開發中的六項是：社費／收款／核銷、報表與匯出、正式部署完成度、LINE Rich Menu、手機 Web App、社務 AI 助理；LINE OA 推播與 onboarding 已有部分實作，不等於 Rich Menu 或所有正式環境工作已完成。

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
[外部待辦 E-01] Flex staging 發布／旗標／真人收訊
[外部待辦 E-02] 生日邀請實際送達／冪等重跑
[外部待辦 E-03] LINE Login identity follow 自動配對真人驗收
[外部待辦 E-04／E-05] 各社 OA 設定／推播額度政策
[外部待辦 E-06／E-07／E-10] 效能量測／實機與 M1／雙重社籍驗收
[產品決策 E-08／E-09] production 準備／Recovery email（若重啟）
[後續開發／外部待辦 E-11] LINE Rich Menu／完整 OA 整合
```

## Current Next Actions

唯一的外部待辦清單是 [`TO-DO-LIST.md`](./TO-DO-LIST.md) 的 E-01–E-11；執行順序如下：

1. **E-01：Flex staging 發布與真人收訊** `[>]`：Plan `34686603765` 與 Go-Live `34686702234` 已通過；下一步是開啟 staging 旗標並用指定測試 follower 完成真人收訊。
2. **E-02：生日邀請 LINE 實際送達** `[>]`：準備有配對且開啟通知的測試社員，確認第一次收件與第二次不重送。
3. **E-03：follow 自動配對真人驗收** `[>]`：確認曾以 LINE Login 登入的社員對到正確 person，再測多社／外社／停權／退社。
4. **E-10：雙重社籍與跨社執行秘書驗收** `[>]`：確認社別資料隔離、模式切換與管理權限不越權。
5. **E-06：登入後管理頁效能量測** `[>]`：使用已登入 staging 帳號量測 TTFB、LCP、FCP；沒有數字就寫未量測。
6. **E-07：iOS／Android 實機與 M1 測試** `[ ]`：至少五位社員／幹部，記錄裝置、網路、結果與問題。
7. **E-04／E-05：各社 OA 設定與額度政策** `[!]`：逐社確認 channel 與憑證；產品決定超額行為。
8. **E-08：production 準備** `[!]`：另立正式環境 release 任務，不與 staging 驗收混在一起。
9. **E-09：Recovery email 維持暫緩** `[!]`：只有符合重啟條件才做 custom SMTP 與真人信件驗收。
10. **E-11：LINE Rich Menu／完整 OA 整合** `[ ]`：先完成產品入口設計，再另立開發與各社 OA 設定驗收。

目前採本地開發、完整驗證、清楚 commit 後同步 `main` 的節奏；production 永遠不在本輪範圍。staging 只能依受保護的 release／Go-Live workflow 操作，不得直接修改 hosted database，也不得使用真實社員資料驗證。
