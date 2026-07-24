# Project Rehydration Protocol

本文件定義 ChatGPT、Codex 或其他 AI 開發代理在新對話、新工作階段或長時間中斷後，如何從 GitHub 重新建立可靠的專案上下文。

目標不是恢復聊天記憶，而是根據 Repository 中可驗證的事實重建專案狀態。

## Quick Start Prompt

在新的 ChatGPT 或 Codex 工作階段，可直接使用：

```text
請存取 GitHub Repository Leojung0823/rotary-platform-v2，依照 docs/PROJECT_REHYDRATION.md 完成專案重載。先不要修改程式碼。請回報目前目標、已完成項目、進行中工作、最新 commits/PR、主要風險、驗證狀態，以及下一個最適合執行的工作範圍。所有判斷必須以 Repository、Git 歷史與 CI 證據為準。
```

若已知要執行的任務，可在最後補充任務內容，但代理仍應先完成重載。

## Rehydration Sequence

### Step 1 — Identify repository state

確認：

- Repository：`Leojung0823/rotary-platform-v2`
- 預設分支與目前工作分支
- 最新 commit SHA、訊息與日期
- 是否存在未合併 Pull Request
- 是否存在與本次任務相關的 Issue、review comments 或失敗 CI

不得把舊聊天中的 branch、commit 或 PR 狀態視為最新狀態。

### Step 2 — Read canonical documents

依序閱讀：

1. `README.md`
2. `AGENTS.md`
3. `docs/PROJECT_STATE.md`
4. `docs/architecture/core-decisions.md`
5. 與目前任務直接相關的其他文件

若上述文件不存在、互相矛盾或明顯過時，必須在回報中標記，不得自行掩蓋。

### Step 3 — Inspect implementation evidence

根據文件聲稱的完成項目，抽查實際證據，例如：

- `package.json` scripts 與依賴
- `.github/workflows/` CI 設定
- `src/` 中的頁面、API、auth、domain 與 Supabase client
- database migrations、RLS policies 與 seed files
- `.env.example` 中必要但不含秘密值的環境變數
- 測試檔案與測試設定

文件只能作為導航，不能代替程式碼與 migration 證據。

### Step 4 — Inspect recent delivery history

至少查看：

- 最近 5 至 10 個 commits
- 所有 open Pull Requests
- 與最新功能有關的 merged Pull Requests
- 未解決 review threads
- 最新 CI／GitHub Actions 結果

若 Repository 仍處於初始化階段，可縮小範圍，但必須說明實際看到多少歷史紀錄。

### Step 5 — Reconcile conflicts

資訊衝突時使用以下優先順序：

1. 目前分支的實際程式碼、migration 與設定
2. GitHub Actions／測試結果
3. 已合併 PR 與 commit 歷史
4. `docs/PROJECT_STATE.md`
5. 架構決策文件
6. README
7. Issue、PR 描述與聊天摘要

若高優先級證據顯示文件已過時，代理應指出差異，並建議在同一個 PR 更新文件。

## Required Rehydration Report

重載完成後，在修改任何檔案前，必須輸出以下內容：

### 1. Repository snapshot

- Repository
- branch
- latest commit
- open PR／Issue 摘要
- CI 狀態

### 2. Product and architecture

- 目前產品目標
- 核心 domain model
- 多租戶與權限邊界
- 不可違反的正式／staging 隔離規則

### 3. Delivery state

使用三類呈現：

- **Confirmed complete**：有程式碼、migration、測試或已合併紀錄支持
- **In progress**：存在分支、PR 或部分實作
- **Not confirmed**：文件可能提到，但找不到足夠實作證據

### 4. Risks and inconsistencies

列出：

- 文件與程式碼不一致
- 缺少測試或 CI 證據
- 安全、RLS、跨社隔離風險
- 未知環境或外部服務依賴
- 可能造成重複開發的未合併工作

### 5. Recommended next job scope

提出一個範圍明確、可由 Codex 執行並可驗收的下一步，包含：

- 目標
- 範圍內項目
- 不在範圍內項目
- 預計修改區域
- 驗收條件
- 必跑檢查
- 需要人工提供的憑證或決策

不得在沒有確認現有實作的情況下直接產生大規模重寫任務。

## Before Starting a Coding Job

完成重載後，代理仍應針對本次工作執行以下確認：

- 本次任務是否與 open PR 重疊
- 是否會改變核心身份、權限或 tenant model
- 是否需要 migration 或 RLS
- 是否需要 staging 憑證或外部服務
- 是否有明確 Definition of Done
- 是否能在獨立分支完成

若範圍合理，建立 `agent/<description>` 分支並透過 draft Pull Request 交付。

## End-of-Job Writeback

每次完成會改變專案狀態的工作後：

1. 更新 `docs/PROJECT_STATE.md`。
2. 若新增長期架構決策，更新核心決策文件或新增 ADR。
3. 在 PR body 記錄修改內容、原因、驗證、風險與未完成事項。
4. 確認文件描述與實際程式碼一致。
5. 提供下一個建議工作範圍，但不要假裝未完成工作已完成。

## Minimal Rehydration Checklist

- [ ] 已確認 Repository、branch 與最新 commit
- [ ] 已讀 README、AGENTS、PROJECT_STATE 與核心決策
- [ ] 已檢查最近 commits 與 open PR
- [ ] 已抽查文件所聲稱的實作證據
- [ ] 已確認 CI／測試狀態
- [ ] 已標記文件與程式碼的不一致
- [ ] 已區分完成、進行中與未確認項目
- [ ] 已產生範圍明確的下一步工作建議
- [ ] 尚未在重載完成前修改程式碼

## Maintenance Rule

若本流程本身不再符合實際開發方式，應透過 Pull Request 更新本文件。Project Rehydration 的可靠性取決於 Repository 文件、程式碼、PR 與 CI 是否持續同步，而不是依賴單一聊天 thread 的記憶。