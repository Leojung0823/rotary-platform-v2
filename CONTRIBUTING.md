# Contributing to Rotary Platform V1.2

本文件是 Rotary Platform V1.2 的永久協作規範，適用於 Codex、其他 AI Agent、人類工程師與 Reviewer。所有貢獻都必須維持產品範圍、架構 invariant、多租戶隔離、敏感資料邊界與可驗證性。

## 1. 先讀哪些文件

開始工作前，依任務實際範圍完整閱讀：

1. Repository 內所有適用的 `AGENTS.md`（越接近目標檔案者越具體）。
2. `README*`、`package.json` 與現行 branch／worktree 狀態。
3. [`V12_PRODUCT_ARCHITECTURE_ROADMAP.md`](docs/roadmap/V12_PRODUCT_ARCHITECTURE_ROADMAP.md)：產品範圍、技術 Phase 與 Gate。
4. [`V12_ARCHITECTURE_DECISIONS.md`](docs/architecture/V12_ARCHITECTURE_DECISIONS.md)：不可在單一 PR 自行推翻的架構決策。
5. [`V12_PROJECT_STRUCTURE.md`](docs/development/V12_PROJECT_STRUCTURE.md)：檔案位置與依賴方向。
6. Database 變更必讀 [`DATABASE_STYLE_GUIDE.md`](docs/development/DATABASE_STYLE_GUIDE.md)。
7. [`V12_REPOSITORY_IMPLEMENTATION_PLAN.md`](docs/roadmap/V12_REPOSITORY_IMPLEMENTATION_PLAN.md) 與相關 inventory／mapping／`V12_DECISIONS_REQUIRED.md`。

不同文件分別治理 scope、architecture、placement/style 與 execution。若內容衝突，不能自行挑選較方便的版本；應列出衝突、影響與需要的 owner decision，在取得核准前 fail closed。

## 2. 不可突破的邊界

- 不修改、格式化、重排或覆寫 `supabase/migrations/` 內四份 Legacy Migration。
- 不把 V1.2 migration、function、RLS 或 seed 放進 Legacy migration root。
- 不操作 linked／staging／production Supabase，除非任務逐項明確授權目標、命令、backup 與 rollback。
- 不提交或輸出 `.env*` 實值、service key、password、invite token、HMAC secret、LINE token、Auth dump、真實社員 PII 或 production extract。
- 不放寬 RLS、不刪除 Audit、不靜默合併 Person、不自行改變 retention、MVP、cutover 或 rollback 決策。
- 不進行 V0.3／V1.2 dual-write。
- 不以 UI permission、caller-supplied Account ID、URL Club ID 或陳舊 JWT role 當作授權根據。
- 不因 CI 綠燈自行 merge、deploy、切換 Ready、執行 migration 或開放流量。

## 3. 開發管理：Stage → Milestone → PR

所有 V1.2 工作使用固定三層管理：

- **Stage**：最高層交付區段；定義一組成果、風險與進入下一 Stage 的條件。
- **Milestone**：Stage 內可驗收的 outcome；擁有 Gate、依賴、owner 與完成證據。
- **PR**：最小可審查實作單位；只服務一個 Milestone 與一個主題。

現有 roadmap 的 `Phase 0–9` 是技術工作包，不另形成管理層級。12 個 PR 的核心內容與 mapping 以兩份 roadmap 為準。

| Stage | Milestone | Technical Phase | PR |
|---|---|---|---|
| Stage 1 Foundation | A — Database Foundation Ready | Phase 0–1 | PR-01 |
| Stage 2 Identity & Admin Core | B — Invitation & Onboarding Ready | Phase 2–3 | PR-02–03 |
| Stage 2 Identity & Admin Core | C — Security & Access Ready | Phase 4–6 | PR-04–08 |
| Stage 3 Migration Readiness | D — Legacy Shadow Migration Ready | Phase 7 | PR-09–10 |
| Stage 4 Cutover Readiness | E — Frontend Cutover Ready | Phase 8 | PR-11 |
| Stage 5 Release Readiness | F — Release Candidate Ready | Phase 9 | PR-12 |

PR 完成不等於 Milestone 完成；Milestone 完成也不自動放行下一 Stage。所有 Gate 與人工核准仍需獨立成立。

## 4. 開始工作前

### 4.1 Reload repository reality

至少確認：

```bash
git status --short --branch
git branch --show-current
git log -10 --oneline
git remote -v
```

- 確認 repository／remote／base／target branch 與任務一致。
- 確認必要 main commit 是目前 branch 的 ancestor。
- 工作樹不乾淨時，先辨識哪些是既有修改；不得 reset、restore、stash 或覆蓋使用者工作。
- Issue、PR、CI、review 或 remote state 會漂移時，以目前 exact head 重新查證，不依賴舊聊天或舊 SHA。

### 4.2 Bound the change

開始修改前寫清楚：

- 所屬 Stage、Milestone、PR 與產品 Gate。
- In scope／out of scope。
- 必須保持不變的檔案，尤其 Legacy Migration。
- Migration／API／RLS／Edge／frontend／data／secret 影響。
- 需要人工決定的 D01–D20；未決時的 fail-closed 做法。
- 預定驗證、風險與 rollback。

若需求會改變產品範圍、安全模型、資料保存、role mapping 或正式環境，先取得 owner decision，不以實作猜答案。

## 5. Branch 與變更範圍

- 一個 branch／PR 對應一個既定 PR 主題，不混合多個 Milestone。
- 優先從已驗證的 `origin/main` 或 implementation plan 指定 base 建立 branch。
- Branch name 使用 `<type>/v12-<scope>`，例如 `feat/v12-invitation-core`、`docs/v12-governance`。
- 不把 formatting、dependency upgrade、directory relocation 或 generated output 混進無關的 domain PR。
- 不建立未核准功能的 TODO skeleton、dead code、空 Edge Function 或 placeholder table。
- 修改既有 dirty file 時只碰必要區塊，並在 handoff 分辨既有與本輪變更。

## 6. Implementation rules

### 6.1 Database

- 遵守 `DATABASE_STYLE_GUIDE.md`，只在 canonical V1.2 root 追加 migration。
- Constraint／transaction／RLS 是最終資料與授權邊界；frontend validation 只是 UX。
- 跨表 mutation 使用單一 transaction function、server-derived actor/scope、固定 lock order、idempotency、audit 與 stable error code。
- 每個 FK 更新 executable index matrix；每個 public table／function／policy／grant 都有 catalog verification。
- Seed／fixture synthetic、idempotent、無真人與 secret；bootstrap 保持受控、非 client-callable。

### 6.2 Backend、Edge 與 provider

- Secret、HMAC、OAuth、Auth Admin、Email、LINE API、rate limit 與 webhook 驗證只存在受控 server boundary。
- Browser 只持有 publishable key 與自己的 session；service role 永不進入 Client Component、response 或 log。
- Route／Edge 先驗證輸入、origin/signature/replay/scope，再呼叫單一 database contract。
- Provider error 轉為 allowlisted stable error；不得回傳 raw response、token 或 tenant existence。
- LINE Login 與 LINE OA 的資料、channel、unbind 與 tests 完全分離。

### 6.3 Frontend

- 使用 generated types 與 typed API client；不得以大量 `as` cast 猜 database／RPC shape。
- Permission-based UI 只作呈現，實際授權仍由 API／RLS 即時決定。
- Changed page 必須提供繁體中文的 Loading、Empty、Error、Permission denied 與 Membership unavailable／locked 狀態。
- 不顯示 fake business data，不讓錯誤狀態看起來像成功或空資料。
- Responsive 變更需在 implementation plan 要求的代表性 viewport 做 visual／overflow 驗證。

### 6.4 Documentation

- 文件只記可驗證事實、已接受決策或明確標示的 pending decision。
- 更新 path、command、count、PR mapping 或 Gate 時，同步所有 canonical references，避免多份 truth 漂移。
- 不把未執行的命令寫成已通過，不把推薦方案寫成 accepted decision。
- 不在文件放 secret、真實 ID、未遮蔽 PII、可使用 token 或 remote connection string。

## 7. Required verification

每個 PR 的驗證與風險成比例，而且證據必須對應目前 working tree／exact head。

### 7.1 Common local gates

對 code/database 變更，預設執行：

```bash
npm run check:migrations
npm run lint
npm run typecheck
npm test
npm run build
npm run db:v12:verify
```

- PR-specific schema、transaction、concurrency、RLS、Edge、migration 或 E2E suite 另行累加。
- `db:v12:verify` 只在 local target guard 已確認時執行；不得為了通過命令連到 remote。
- 文件-only 變更至少執行 path/link existence、terminology/count consistency、`git diff --check`、scope scan 與 diff review；無關 build 不需要假裝提供價值。
- 任何未執行或因環境限制無法完成的 gate 都要明確列出，不可寫成「應該通過」。

### 7.2 Security/data tests

依變更範圍必須涵蓋：

- anonymous、無 Account、suspended、locked、revoked role。
- Cross-Club、Cross-District、self vs other、general member vs sensitive data。
- Same request retry、different payload conflict、concurrent transactions、rollback。
- Token／secret／PII absence in database、log、audit、error、URL、artifact。
- Provider replay、signature tamper、channel/environment mismatch、duplicate webhook。
- Shadow migration count、orphan、conflict、rerun 與 interrupted recovery。

## 8. Commit 與 PR

只有任務明確授權時才 commit、push 或建立 PR。

### 8.1 Commit

- Commit 應可獨立理解、只含本 PR scope，message 說明 outcome 而非工具名稱。
- Commit 前重新檢查 `git status`、staged diff、Legacy checksum、secret scan 與必要 tests。
- 不 amend、rebase 或 force-push 他人 branch，除非 owner 明確授權且已確認 review impact。

### 8.2 PR description

每個 PR 必須包含：

- Stage／Milestone／PR 編號與目的。
- Scope、out of scope、決策與假設。
- 新增／修改／刻意未修改的檔案。
- Migration、function、API、RLS、Edge、frontend、data／secret 影響。
- 實際執行的命令、結果、時間點與 exact head SHA。
- Negative／security／concurrency／rollback evidence。
- 風險、未決 decision、回滾方式與下一個依賴 PR。
- `git diff --stat` 與必要的 visual evidence。

不得只貼「CI green」或只列程式碼摘要。

### 8.3 Review 與 merge

- Reviewer 依目前 exact head 審查；head 改變後舊 CI、review、screenshot 與 independent verification 都必須視影響重跑。
- Bot success、mergeability、Draft 狀態或單一 reviewer comment 不等於人工產品／安全核准。
- Unresolved actionable thread、required change、Gate failure 或 D01–D20 blocker 未解除前，不得標示完成。
- Merge、Ready、staging、production、cutover 與 rollback 各自需要明確權限；前一步成功不自動授權下一步。

## 9. AI Agent rules

AI Agent 除遵守上述全部規範外，還必須：

1. 先讀 repository reality 與適用文件，再修改；不以舊聊天、記憶或猜測取代現況。
2. 保留既有 dirty worktree；不自行 reset、stash、restore、刪除或覆蓋不屬於本任務的變更。
3. 在授權範圍內主動完成安全的實作與驗證，不把例行工作推回給使用者。
4. 不因可使用工具就擴張權限；外部寫入、remote Supabase、GitHub 狀態改變與 destructive action 仍需任務授權。
5. 清楚區分「已驗證」、「從文件推論」、「尚未驗證」與「需要人工決定」。
6. 不捏造 command output、table／RPC count、CI、review、deployment 或 production state。
7. 只修改 in-scope files；完成後提供 self-contained handoff、實際 diff 與剩餘風險。
8. 遇到安全或產品未決事項時，先完成不依賴該決策的工作並 fail closed，不偷偷選擇寬鬆答案。

## 10. Definition of Done

一個 PR 只有在下列條件全部成立時，才可回報為完成：

- Scope 與 out-of-scope 清楚，未新增未核准產品功能。
- 所屬 Stage／Milestone／PR 與 Gate 明確。
- Architecture、project structure、database style 與 security boundary 均符合。
- Legacy Migration、remote Supabase、secret、PII 與 Audit 邊界未被破壞。
- Required positive、negative、tenant、retry、rollback 與 domain tests 已在目前 head 通過。
- 文件、generated contract、inventory、runbook 與實作一致。
- Diff 已人工可讀地自我審查，沒有 unrelated changes、placeholder 或 dead artifact。
- 所有未能驗證事項、pending decision、風險與 rollback 已如實列出。
- 需要的人工 review／approval 已明確取得；若尚未取得，只能回報實作準備完成，不能宣稱 Stage／Milestone 已放行。
