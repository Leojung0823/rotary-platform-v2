# Rotary Platform V2 開發地圖

更新日期：2026-08-28

本文件是 Rotary Platform V2 接下來的產品開發順序與依賴關係。它補充 Epic #55「社員體驗與簽到 V2」，並把已完成的基礎工作、下一階段主線，以及新發現的產品與 UX 缺口放在同一張地圖上。

## 目前基線

目前 `main` 已包含：

- PR #59：Feature Flag、Rollback、Privacy-safe Telemetry 基礎。
- PR #61：Canonical Attendance Domain Core。
- PR #60：Server-authoritative ExperienceContext、角色脈絡與路由解析。
- PR #62 / PR-01b：Member / Management / Platform 三套 Role-aware Shell、合法 mode switching、active-club preference、responsive 與 accessibility 基礎。

自上次更新後，主線已推進到「權限與資料底座 → 角色脈絡 → Shell → 社員首頁 → Dynamic QR 簽到 → GPS 簽到 → 出席 UI」全部完成。權威 `main` 最新為 `c8c5284ec9210970766bb4f36e1f580584137a2c`，並包含 PR #86 的出席頁社團時區日期修正。以下功能也已合併：扶輪社名稱編輯、祝福 IOU（含募集、本人扶輪年度篩選與年度報表）、生日祝福 V2 核心、文件中心與年度交接、社內留言板、活動封面圖片、首頁通知摘要、帳號安全分層與登入 recovery hardening。

本輪另完成生日祝福徵集領域的程式切片：每月批次與排程、每位社員每月最多一則自動派發、壽星排除、100 題平台題庫、社團題庫管理、題目快照與同批次文字去重、幹部發布／隱藏／重送、匿名公開牆、站內通知與安全驗證。PR #77 已合併至 `main`，current-main 已以 `33121275958` 完成 staging Go-Live；但生日專項 hosted acceptance `33121570908` 證實 `birthday_wishes_v2` 尚未開啟，排程重試 `33121704322` 仍回傳 `401 unauthorized`。接下來只需完成兩個生日旗標與 Render scheduler secret 的外部設定，再重跑專項驗收；不需重複發布目前的程式版本。

另有兩項不在原路線圖、但已完成的工程工作：頁面查詢改為單次往返的組合型 RPC，以及 Render 機房由 Virginia 遷至新加坡（p50 由 520ms 降至 269ms）。

出席 UI 整合已完成，並且如原本要求的那樣繼續使用 PR #61 的 canonical Attendance RPC，未另建 authority。

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
- [>] **生日祝福徵集**已完成程式實作：`20260824000600`–`20260824001700`、每日 staging 排程、每月每人一則自動邀約、100 題平台題庫／社團題庫 CRUD、幹部發布與隱藏重送、匿名投影及 verification；PR #77 已合併，main 已完成 staging Go-Live，但仍待確認 staging flag、修正 scheduler secret mismatch、以 current main 重新發布 staging、重跑徵集專項 hosted smoke 與真人驗收。run `33117785366` 回傳 `401 unauthorized`。
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
3. ~~**PR-07a — 我的／帳號安全／登入協助**~~ — 核心頁面與 recovery confirmation 已完成；真實 staging email flow 尚待驗收。
4. ~~**PR-07b — Legacy UI Cleanup / Accessibility Hardening**~~ — 本輪完成 member IA、固定導覽 clearance、巢狀 current state 與名錄 48px／200% 版面；更大範圍 legacy 清理仍可另立切片。
5. **M1 — 五位目標使用者形成性測試** — 尚未安排。

## 已知落差

以下是實作與本文件原則之間目前存在的落差，記錄於此以免被誤認為已處理：

- `birthday_wishes_v1`、`message_board_v1`、`archive_handover_v1` 已由 `20260823000100_existing_domain_feature_flags.sql` 納入 direct-route gate 與 rollback allow-list；`birthday_wishes_v2` 已由 `20260824000400_birthday_wishes_v2_core.sql` 納入明確啟用清單。這些 key 能 rollback，但多數仍預設關閉或需要明確 row，**已完成不等於社員現在看得到**。
- GPS 仍缺產品指定的 accuracy／定位 age 契約；本文件不替產品猜門檻。
- 真實 staging recovery email、iOS／Android 實機驗收與 M1 使用者測試尚未完成。
- 生日祝福徵集的排程、題庫、每月公平派發與幹部工作台已完成程式與本機資料庫驗證，PR #77 已合併且 current-main 已部署到 staging；仍須由 staging 平台管理員開啟 `birthday_wishes_v2` 與 `birthday_wishes_collection_v1`，並在 Render 同步 scheduler secret，再執行 hosted workflow 與社員／幹部真人驗收。專項 acceptance `33121570908` 與 scheduler `33121704322` 均已留下失敗證據，不能標記完成。
- **多數新功能的 flag 預設關閉**，包含 `attendance_ui_v2`。「已完成」不等於「社員看得到」；要對使用者開啟需另行設定 flag。
- PR #37（出席統計）與 PR #10 已關閉：前者的 migration 會與 PR #61 的 canonical attendance domain 形成第二套 authority，功能改以投影層重新實作；後者是已上線功能的決策紀錄。PR #40（公告通知）已於 2026-08-22 實作，未沿用該分支的程式碼。

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
[外部驗收] recovery email · GPS policy · 實機 Browser Smoke
[完成程式／待 staging 設定與驗收] 生日祝福徵集（排程／題庫／每月一則派發／幹部工作台） ─> M1 使用者測試
```

## Current Next Actions

1. 決定 GPS accuracy／定位 age 政策，才能關閉 GPS hardening blocker。
2. 以專用 staging 身份完成 recovery 真實 email flow，並做 iOS／Android 實機驗收。
3. 決定何時對社員開啟訊息中心與其他旗標：`npm run flags:enable announcements_v09`（預設關閉）。
4. 在 staging 開啟 `birthday_wishes_v2`、`birthday_wishes_collection_v1`，同步 Render scheduler secret，重跑排程與 hosted smoke；通過後再進入 M1 使用者測試。

目前採本地開發、完整驗證、清楚 commit 後同步 `main` 的節奏；production 永遠不在本輪範圍。staging 只能依受保護的 release／Go-Live workflow 操作，不得直接修改 hosted database，也不得使用真實社員資料驗證。
