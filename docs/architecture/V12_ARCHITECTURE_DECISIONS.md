# Rotary Platform V1.2 Architecture Decisions

- 文件狀態：Accepted / Normative
- 適用範圍：Rotary Platform V1.2 Identity & Admin
- 適用對象：Codex、其他 AI Agent、人類工程師與 Reviewer
- 最後更新：2026-07-22

本文件記錄 V1.2 已定案且不得在單一 PR 中自行推翻的架構決策。產品範圍與 Gate 仍以 [`V12_PRODUCT_ARCHITECTURE_ROADMAP.md`](../roadmap/V12_PRODUCT_ARCHITECTURE_ROADMAP.md) 為準；檔案配置、SQL 寫法與協作流程分別由 [`V12_PROJECT_STRUCTURE.md`](../development/V12_PROJECT_STRUCTURE.md)、[`DATABASE_STYLE_GUIDE.md`](../development/DATABASE_STYLE_GUIDE.md) 與 [`CONTRIBUTING.md`](../../CONTRIBUTING.md) 規範。

若新需求與本文件衝突，實作者必須停止相關實作，新增或更新明確的架構決策並取得人工核准；不得用程式碼、migration 或「暫時例外」繞過。

## 決策狀態與變更方式

- `Accepted`：現行強制規範。
- `Superseded`：只能由另一筆具編號、理由、遷移與回滾影響的決策取代。
- `Pending human decision`：尚未授權實作；依 fail-closed 預設處理。
- 修改決策時必須記錄 owner、日期、理由、資料／安全影響、相容與回滾策略，並同步受影響的 roadmap、implementation plan 與測試。
- PR 不得同時偷偷改變決策與依賴該決策完成大量實作。決策變更應先成為可獨立審查的治理變更。

## AD-V12-001 — V1.2 採平行重建，Legacy 永久不可改寫

**Status：Accepted**

V1.2 是新的核心資料模型，不是 V0.3 migration history 的增量修補。

- `supabase/migrations/` 內既有四份 V0.3 migration 是 Legacy Immutable Baseline，必須保持 byte-for-byte 不變。
- V1.2 只能在 `database/v12/` 的隔離路徑建立、測試與演進。
- 不得將 V1.2 schema 疊加到 Legacy migration root，不得重命名舊表冒充資料遷移。
- V1.2 尚未通過完整 Gate、shadow migration、reconciliation 與人工 cutover 核准前，V0.3 保持可運作基線。
- Legacy 行為若需修正，必須另提明確的 Legacy 維護決策，不得順手修改已執行 migration。

隔離的精確 full-stack 形式仍由 `V12_DECISIONS_REQUIRED.md` 的 D01 決定；未決期間不得把現行 PostgreSQL-only 隔離測試描述成 Auth／RLS／Edge 的完整驗證。

## AD-V12-002 — 身份領域必須分離，不支援 Person Merge

**Status：Accepted**

- `people` 代表真人；`accounts` 代表平台帳號；`identities` 代表外部登入身份；`memberships` 代表 Person 與 Club 的社員關係。
- 同一 Person 可以有多筆跨 Club Membership，但同時間最多一筆有效 human Account。
- Person Merge 不在 V1.2 支援範圍，schema、function、UI 與 migration 都不得加入靜默合併路徑。
- 疑似重複只能選擇沿用既有 Person、建立新 Person、拒絕，或送入受控人工案件；跨 Club 回應不得洩漏候選 Person ID 或個資。
- Account Merge 是獨立生命週期。資料模型可保留事件，但 function 與管理 UI 預設延後，除非人工決策明確納入。

## AD-V12-003 — 多租戶範圍由資料庫中的組織關係決定

**Status：Accepted**

- 組織層級為 Platform → District → Club；Membership 與 Club-scoped business record 必須具有可追溯的 Club scope。
- District／Club／Self 存取範圍從資料庫當下狀態與 assignment 推導，不信任前端傳入的 Account、District、Club 或 role claim。
- URL、畫面選擇器、JWT 中的陳舊 role、`last_active_club_id` 等只能作 UX context，不能成為授權根據。
- 所有跨租戶 read、write、export、import、audit 與 provider callback 都必須有負向隔離測試。

## AD-V12-004 — Auth 是外部系統，Account 是平台可信主體

**Status：Accepted**

- `accounts.account_auth_user_id` 與 session provider ID 是可 reconciliation 的 weak reference，不以 FK 假設外部 Auth 永遠同步存在。
- human Account 的 live 狀態、Person 與 Auth reference 必須符合資料庫 invariant；terminal／anonymized Account 不得保留可登入關係。
- system Account 是非登入 actor，不得擁有 Person、Auth user、Identity、Device relation 或 Session。
- Seed 只建立 deterministic system actor 與系統 RBAC catalog，不建立真人、密碼或 token。
- 第一位真人 Platform Admin 必須使用已存在且已驗證的 Auth user，經受控 bootstrap 與 audit attribution 建立；不得開放為 client RPC 或公開註冊捷徑。

## AD-V12-005 — 權責分層必須維持 server-authoritative

**Status：Accepted**

| 邊界 | 責任 | 禁止事項 |
|---|---|---|
| PostgreSQL schema | 結構、constraint、index、不可變歷史、基礎 trigger | 外部 API、secret、建立 Auth user、寄信或呼叫 LINE |
| Transaction functions | 跨表原子性、lock、狀態驗證、idempotency、audit、穩定錯誤 | 信任 caller 傳入 actor、保存明文 token、呼叫外部 provider |
| RLS / authorization helpers | 即時決定誰可對哪些 row 執行哪些操作 | 一般畫面篩選、以 UI role 取代資料庫判斷 |
| Edge Function／受控後端 | Secret Manager、HMAC、OAuth、Auth Admin、Email／LINE、rate limit、request validation | 把 service role／secret 傳入 browser、在多個 table 做非原子拼接 |
| Frontend | Traditional Chinese UX、表單、導覽、typed API client、狀態呈現 | 直接執行跨表交易、決定 actor ID、繞過 API／RLS |

任何層級若需要越界，必須先提出架構決策與 threat model，不能以「比較方便」作為理由。

## AD-V12-006 — 授權採 default deny、即時 RBAC 與最小能力

**Status：Accepted**

- V1.2 的 31 張 public tables 必須逐表、逐操作決定 `SELECT`／`INSERT`／`UPDATE`／`DELETE`；沒有明確 allow 就是 deny。
- RLS 啟用本身不等於完成授權；必須以角色、租戶、self 與負向情境驗證實際行為。
- 角色來源收斂為 Platform、District 與 Membership scoped assignments，撤銷後同一 session 的下一次請求立即失效。
- `SECURITY DEFINER` function 是高風險 RLS bypass boundary：必須固定空 `search_path`、schema-qualify objects、從 `auth.uid()` 推導 caller，並採 execute grant allowlist。
- `anon`／`authenticated` 不取得一般 table CRUD。匿名入口只能是受控且最小輸出的 invitation/auth endpoint。
- 前端 permission 只控制顯示，不構成安全保證。

## AD-V12-007 — 跨表狀態改變只能經單一交易契約

**Status：Accepted**

- Membership、Invitation、Account、Identity、Session、Role Assignment、OA link 與 Audit 的跨表變更必須由單一 transaction function 完成。
- Function 必須在 mutation 前驗證 caller、scope、目前狀態與目標狀態，並在同一 transaction 寫入 snapshot、history/event、audit 與 idempotency outcome。
- Invitation 的狀態 mutation 與 PR-03 final onboarding 固定鎖定順序為 Invitation → Membership → Account；PR-02 Validate 是不鎖定、不保留 reservation 的 snapshot preflight，不能取代同交易重新 lock 與驗證。
- 可重試操作必須定義：相同 key＋相同 payload 回原結果，相同 key＋不同 payload 回 conflict；不得依賴「先查再寫」避重。
- 公開契約必須使用穩定、可測試的 application error code；受控 API 負責轉為安全 HTTP／UI 錯誤，不回傳 raw PostgreSQL 或 provider error。
- 所有 failure path 都必須證明完整 rollback，不得留下半完成 onboarding、role、session 或 audit 狀態。

## AD-V12-008 — Invitation token 與 secret 永不進入資料庫可信邊界

**Status：Accepted**

- Token 由受控後端以 32-byte CSPRNG 產生，對外使用具版本的 Base64url envelope。
- PostgreSQL 只保存 HMAC-SHA-256 digest、key version 與必要 metadata；HMAC secret 只存在 Secret Manager／受控後端。
- 明文 token 不得進入 database、audit、idempotency payload hash、URL query、log、analytics、error、screenshot 或匯出檔。
- 原始 token 只可在建立／rotation 當次的受控記憶體與交付邊界短暫存在。
- D04 已定案：Legacy SHA-256 pending token 不遷移、不接受、不建立 compatibility verifier；cutover 必須撤銷／失效並由授權管理者重新發出全新的 V1.2 HMAC token。

## AD-V12-009 — Current snapshot 與不可變歷史分離

**Status：Accepted**

- Membership 等高頻讀取可保留 current snapshot，但每次生命週期變更必須同步寫入 append-only history/event。
- Event／ledger table 不使用一般 `updated_at`。錯誤事件以 void／supersede／redaction 流程處理，不直接改寫或刪除歷史。
- Audit 分成 immutable skeleton 與權限更窄、可受控遮蔽的 payload。遮蔽本身必須新增 audit event。
- Actor、role snapshot、scope、request/correlation ID 與 occurred/effective/recorded time 的語意必須可區分。
- Audit、event 與 log metadata 採 allowlist；不得用任意 JSONB 當作秘密或個資傾倒區。

## AD-V12-010 — LINE Login 與 LINE Official Account 是兩個獨立 domain

**Status：Accepted**

- Login identity 由 provider subject、channel 與 environment 共同定義；OA contact/link 使用獨立資料表與生命週期。
- 解綁 Login identity 不得解除 OA；解除 OA link 不得改變 Login identity 或 Supabase session。
- Channel secret、access token 只保存 secret reference，不保存實值。
- Webhook 必須先對 raw body 驗簽、再解析與處理；Club scope 從受控 channel config 推導，不能只信任 URL `clubId`。
- Provider callback、webhook 與重試流程必須有 replay、dedupe、channel/environment mismatch 及跨 Club 負向測試。

## AD-V12-011 — Device、Account Device 與 Session Ledger 分離

**Status：Accepted**

- Device 是裝置實體，Account Device 是帳號與裝置關聯，Account Session 是外部 session 的平台 ledger。
- 同一 Device 可以連結多個 Account；Account Merge 不搬移 Device ownership。
- Fingerprint 只保存帶 scope 與 version 的 digest，不保存可重建原始裝置資料的秘密。
- Session revoke 必須可安全重試；外部 Auth session 已消失時仍保留本地歷史與 reconciliation 結果。

## AD-V12-012 — Legacy 遷移採只讀來源、可重跑 Shadow Migration

**Status：Accepted**

- 禁止 dual-write。V0.3 與 V1.2 在切換前各自維持單一寫入來源。
- Extract 只讀 Legacy；Transform 產出 deterministic mapping／conflict；Load 只寫隔離 V1.2 target。
- 不直接 rename legacy table、不靜默補 District／role／Identity、不靜默合併 Person。
- 任何不確定資料都進 conflict／reconciliation report，由明確 owner 裁決。
- 每次執行必須具 run ID、idempotency、count reconciliation、orphan detection 與中斷恢復；至少兩次完整成功才可進 frontend cutover。
- Production extract、load、cutover 與 rollback 都需要獨立人工授權。

## AD-V12-013 — Local-first、證據導向 Gate 與 fail-closed release

**Status：Accepted**

- 日常開發與自動驗證只使用固定且可辨識的 local／CI isolated environment；wrapper 必須拒絕 linked project、任意 DB URL 與 access token。
- 每個 PR 的測試是累加契約：共通 gate 加上該 domain 的 schema、transaction、RLS、Edge、migration 或 E2E tests。
- Build、lint 或 happy-path success 不能替代 tenant isolation、concurrency、rollback、secret scan 與 negative authorization tests。
- 任一新 commit 都使舊 CI、舊 review 與舊驗證證據過期；核准必須對應 exact PR head。
- Staging、Production、Ready、merge、deploy、cutover 與 destructive remote operation 都不由綠燈自動授權。

## AD-V12-014 — 開發管理層級固定為 Stage → Milestone → PR

**Status：Accepted**

- **Stage** 是最高層的交付區段，描述一組產品／架構成果與進入下一區段的條件。
- **Milestone** 是 Stage 內可驗收的結果，必須有 owner、涵蓋的 Gate、依賴與完成證據。
- **PR** 是最小可審查實作單位，只服務一個 Milestone 與一個可驗收主題。
- 現有 roadmap 的 `Phase 0–9` 是技術工作包標籤，用來說明內容與 Gate，不另形成管理層級。
- PR 完成不等於 Milestone 完成；Milestone 完成不等於 Stage 自動放行。每一層均需自己的 Gate 與人工核准。
- 12 個既定 PR 的核心範圍與順序不得因治理命名而改變；正式 mapping 見 product roadmap 與 repository implementation plan。

## AD-V12-015 — 未決事項一律 fail closed

**Status：Accepted**

`V12_DECISIONS_REQUIRED.md` 中尚未 accepted 的 D01–D20，不得由實作者自行選定產品、安全、資料或營運答案。

- 可繼續不依賴該答案的文件、測試、盤點與隔離本機工作。
- 不得建立假資料冒充正式決策，不得用寬鬆 RLS／暫時 service-role route 先行上線。
- 若未決事項阻擋某個 PR，該 PR 保持未開始或 Draft，不把阻擋轉嫁到後續 PR。
- 決策核准後，必須同步本文件（若涉及架構）、`V12_DECISIONS_REQUIRED.md`、implementation plan、測試與 runbook。

## AD-V12-016 — Invitation preflight 與 final acceptance 分離

**Status：Accepted**

- `accepted` means the complete onboarding transaction has committed；token/HMAC/expiry 驗證、按鈕、登入或 preflight 成功都不構成 acceptance。
- PR-02 is validate-only：Create、Resend、Revoke 與 authenticated Validate 可以驗證並記錄最小 audit，但不得寫 `accepted`、`consumed_at`、final binding 或 onboarding domain object。
- Validation success is not acceptance and does not reserve the Invitation。PR-03 必須在單一 transaction 內依 Invitation → Membership → Account 鎖序，重新驗證狀態、expiry、storage hash 與可信 Auth User，再完成核准 onboarding、accepted/consumed/event/audit/idempotency；任一步失敗全部 rollback。
- MVP ownership proof 是有效 bearer Invitation token 加上經 Supabase JWT 驗證的 Auth User。PR-02 authentication 只證明 validation requester，不持久化 ownership；PR-03 才建立 final binding，遇到不相容 Account／Person 必須 fail closed，不 merge、不重綁、不建立第二個有效 Human Account。
- D03 已定案為 Manual Out-of-Band Delivery；automated Email／SMS／LINE Login／LINE OA delivery deferred。D04 已定案為 Legacy pending token revoke/invalidate and reissue，沒有 compatibility verifier。
- Distributed rate limit 與 abuse control 是 validate／accept 對 staging 或 production 公開前的 Release Gate，現為 Deferred；禁止以單一 worker memory counter 冒充完成。PR-02 仍強制 POST/JSON/body/token limits、JWT、safe errors、no-store、no wildcard CORS 與固定 outbound fetch timeout。
- `INVITATION_REPLAY` 是 PR-03 final onboarding reserved contract；PR-02 repeated validation 不消耗 token，也不回 final replay error。
- Validate idempotency只抑制重複 audit/business side effect，不凍結 eligibility snapshot。每次 retry 都以目前資料庫狀態、token metadata 與 Database Time 重新驗證；revoke、resend、expiry 或 terminal state 變更後，同 key 必須 fail closed，不能回傳舊 positive result。`is_idempotent_retry` 只描述 request retry，不代表 token consumption 或 final acceptance replay。
- Manual delivery 只記 `delivery_handoff`：表示 plaintext token 已在成功 Create／Resend 回應中一次性交回授權管理者，供人工帶外傳遞；不表示已送達或已由 Invitee 接收。Token 不進入 database、audit、log、telemetry、persisted idempotency result、error payload 或 destination。
- Public Validate 將 not found、malformed、signature/storage mismatch、expired、revoked、accepted fixture、unknown version/key 與 Resend 舊 token 全部折疊為同一 404 `INVITATION_INVALID_OR_UNAVAILABLE` 外部契約；Authentication failure 保持獨立。
- Validate event 的 actor 是 authenticated Auth User。只有資料庫存在可信 Account mapping 時才可同時記錄 actor Account；Auth UUID 不得寫入 Account 欄位，且這項 actor attribution 不代表 ownership、Account/Person binding 或 onboarding。

## 架構審查清單

任何 V1.2 PR 在進入 review 前至少回答：

1. 是否維持 Legacy migration 不變與 V1.2 隔離？
2. 是否維持 Person／Account／Identity／Membership、Login／OA、Device／Session 邊界？
3. Actor 與 tenant scope 是否由 server/database 推導？
4. 是否有 default-deny、最小 grant 與跨租戶負向測試？
5. 跨表 mutation 是否單一交易、固定鎖序、可重試、可 rollback？
6. Token、secret、PII 與 audit payload 是否遵守最小揭露？
7. 是否保留不可變 history／audit 與 reconciliation 能力？
8. 是否只屬於一個 Milestone／PR 主題，且沒有擴張未核准功能？
9. 驗證證據是否對應目前 exact head？
10. 是否有任何 D01–D20 未決事項被暗中假設？
