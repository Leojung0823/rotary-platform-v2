# Project Rehydration Protocol

本文件定義 ChatGPT、Codex 或其他 AI 開發代理在新對話、新工作階段或長時間中斷後，如何根據 GitHub 可驗證證據重新建立專案上下文。

目標不是恢復聊天記憶，而是重建 `main`、open PR、stacked branch、測試與 CI 的實際狀態。

## Quick Start Prompt

```text
請存取 GitHub Repository Leojung0823/rotary-platform-v2，依照 docs/PROJECT_REHYDRATION.md 完成專案重載。先不要修改程式碼。請分別回報 Merged on main、In progress in open PRs、Not confirmed，並列出 open PR 的 base/head 依賴鏈、最新 commit、CI／測試、主要風險與下一個建議工作。所有判斷必須以 Repository 實際檔案、Git 歷史與 GitHub Actions 證據為準。
```

若已知任務，可在提示詞後補充，但代理仍應先確認是否與 open PR 重疊。

## Instruction precedence

本流程是專案預設值，不得覆蓋執行環境的上位指令、使用者在目前任務中的明確限制或工具安全邊界。若不能完整執行，需列出受限項目與替代證據。

## Rehydration Sequence

### Step 1 — Identify repository state

確認：

- Repository、預設分支、目前分支與目標分支
- `main` 最新 commit SHA、訊息與日期
- 所有 open Pull Requests
- 相關 PR 的 base、head、Draft／Ready、mergeability 與依賴關係
- 相關 Issue、review comments 與 unresolved review threads
- 對應 head SHA 的 GitHub Actions workflow runs、jobs 與 step conclusions
- required checks；若 Repository 另有 legacy commit statuses，也一併查詢

不得把舊聊天中的 branch、commit、PR 或 CI 狀態視為最新狀態。

### GitHub access failure fallback

無法存取 private Repository、PR branch、Actions 或 review threads 時：

1. 列出無法取得的資料與限制。
2. 不得用 README、舊聊天或 PR 摘要猜測最新狀態。
3. 缺少足以避免重複開發或安全錯誤的證據時，不提出程式碼修改任務。
4. 只回報目前證據可支持的部分結果與待補資料。

### Step 2 — Read canonical documents

依序閱讀：

1. `README.md`
2. `AGENTS.md`
3. `docs/PROJECT_STATE.md`
4. `docs/architecture/core-decisions.md`
5. 與任務直接相關的其他文件

若文件不存在、矛盾或過時，必須明確標記。`PROJECT_STATE.md` 是導航快照，不可取代 open PR branch 的實際程式碼。

### Step 3 — Inspect implementation evidence

對 `main`、目標 branch 與相關 open PR branch 檢查：

- `package.json` scripts、lockfile 與依賴
- `.github/workflows/` 設定
- `src/` 中的頁面、API、auth 與 domain code
- database migrations、RLS、RPC、bootstrap 與 verification SQL
- `.env.example` 的變數名稱
- unit、integration、auth 與 database tests
- 文件引用的 PR、branch、commit 與檔案是否存在

文件、Issue 與 PR body 只能作為導航，不能代替 branch 中的實際檔案。

### Step 4 — Inspect delivery history

至少查看：

- 最近 5 至 10 個 commits，或 Repository 可取得的完整較短歷史
- 所有 open PR
- 相關 stacked PR 的完整 base/head 鏈
- 相關 merged PR
- unresolved reviews 與 requested changes
- 每個相關 head SHA 的 workflows、jobs、steps 與 conclusion

Repository 即使處於初始化階段，也不可省略 open PR；大量工作可能只存在於未合併分支。

### Step 5 — Reconcile conflicts

資訊衝突時使用以下優先順序：

1. 目標 branch 與相關 open PR branch 的實際程式碼、migration、設定與測試
2. 對應 head SHA 的 CI／Quality／本機驗證證據
3. `main` 已合併程式碼、merged PR 與 commit 歷史
4. `docs/PROJECT_STATE.md`
5. 架構決策文件與 ADR
6. README
7. PR body、Issue 與聊天摘要

open PR 的實際檔案屬於第一級證據；PR 描述仍是低優先級證據。

若文件過時，應在適當的既有 PR、stacked branch 或文件同步 PR 中修正，不得因此重做已存在的功能。

## Required Rehydration Report

在修改任何檔案前，輸出：

### 1. Repository snapshot

- Repository 與 default／target branch
- `main` latest commit
- open PR 與 base/head dependency chain
- Draft／Ready、mergeability 與 review 狀態
- workflow runs、jobs、steps 與 required checks

### 2. Product and architecture

- 產品目標
- 核心 domain model
- 多租戶與權限邊界
- local、hosted staging 與正式環境的隔離原則

### 3. Delivery state

使用三類：

- **Merged on main**：已存在於 `main`，有程式碼／migration／commit 證據
- **In progress in open PRs**：存在於未合併 branch；列出 PR、base、head、head SHA、CI 與依賴
- **Not confirmed**：找不到足夠 Repository 或環境證據

不得把「尚未合併到 main」寫成「尚未開始實作」。

### 4. Risks and inconsistencies

至少檢查：

- 文件與程式碼不一致
- stacked PR 順序、重疊、retarget 或整合風險
- 缺少人工 review、測試或 CI 證據
- migration history、RLS、RPC、跨社隔離與憑證邊界
- hosted staging 或外部 provider 的未知依賴
- 可能造成重複開發的未合併工作

### 5. Recommended next job scope

內容包含：

- 目標
- 使用既有 branch／PR 或新分支的理由
- stacked dependency
- 範圍內與範圍外項目
- 預計修改區域
- 驗收條件與必跑檢查
- 需要人工提供的決策或環境條件

下一步應優先審查、修正、retarget 或整合現有 stacked PR，不得從 `main` 重做已有功能。

## Local and hosted environment boundary

migration、RLS、RPC、auth、local database reset／lint、verification SQL、local mail／provider mock、unit tests、lint、typecheck 與 build，可以在隔離的本機環境開發及驗證。

任何遠端環境變更、hosted staging 驗證、真實 provider 設定、正式系統存取或資料匯入，都必須先確認目標、權限、環境隔離與明確授權。

缺少 hosted staging 資訊不應阻塞安全的 local-first 工作，但必須阻止未經確認的遠端操作。

## Before Starting a Coding Job

確認：

- 任務是否與 open／stacked PR 重疊
- 使用者是否指定既有 branch 或 PR
- 是否會改變身份、權限或 tenant model
- 是否需要 migration／RLS／auth verification
- 是否只需本機環境
- 是否有明確 Definition of Done
- 執行環境是否允許 branch／PR 寫入

分支規則：

- 使用者指定既有 branch／PR，或工作屬於 stacked PR 時，繼續使用該分支。
- 唯讀審查不建立 branch 或 PR。
- 新工作應遵循 Repository 現有 `feat/*`、`fix/*` 或其他慣例；沒有更適合慣例時才使用 `agent/<description>`。
- 需要交付程式碼且可寫入時，通常透過 Draft PR；上位指令或使用者要求另有規定時從其規定。

## Validation discovery

先讀目標 branch 的 `package.json`、lockfile、scripts、Supabase 設定與 workflows。

- 有 lockfile且不是更新依賴時，優先使用 `npm ci`。
- 有 `npm test` 時必跑。
- migration／RLS 變更應執行 migration history、local reset、lint 與 verification SQL。
- auth／invitation／identity 變更應執行對應 auth verification。
- CI 判定應查詢 workflow runs、jobs 與 steps，不得只依 legacy combined status。

實際命令依 `AGENTS.md` 與目標 branch scripts 為準。

## End-of-Job Writeback

只有 delivery state、核心架構、主要風險、外部環境或後續順序改變時，才視需要更新 `docs/PROJECT_STATE.md`。

同時：

1. 長期架構決策更新核心決策文件或 ADR。
2. PR body 記錄 base/head dependency、修改、驗證、風險與未完成事項。
3. 確認文件與實際程式碼一致。
4. 不得把未合併工作寫成已完成。

純樣式、小修正或不影響 delivery state 的重構通常不更新 `PROJECT_STATE.md`。Stacked PR 各自只記錄相對於 base 的新增狀態；堆疊完成後再統一整理 `main` snapshot。

## Minimal Rehydration Checklist

- [ ] 已確認 GitHub 存取範圍與缺失資料
- [ ] 已確認 Repository、default／target branch 與最新 commit
- [ ] 已讀 README、AGENTS、PROJECT_STATE 與核心決策
- [ ] 已檢查所有 open PR 與 stacked base/head 鏈
- [ ] 已抽查 open PR branch 的實際檔案與 migration
- [ ] 已確認 workflows、jobs、steps 與 required checks
- [ ] 已標記文件與程式碼的不一致
- [ ] 已區分 Merged on main、In progress 與 Not confirmed
- [ ] 已避免提出重複開發任務
- [ ] 已產生範圍明確的下一步工作建議
- [ ] 尚未在重載完成前修改程式碼

## Maintenance Rule

若本流程不再符合實際開發方式，應透過 Pull Request 更新。可靠性取決於文件、open PR branch、Git 歷史與 CI 持續同步，而不是單一聊天 thread 的記憶。
