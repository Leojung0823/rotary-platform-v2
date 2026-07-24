# AGENTS.md

本文件是所有 AI 開發代理（ChatGPT、Codex 或其他自動化代理）在本 Repository 工作時的共同操作規範。

## 1. 指令優先順序

本文件提供專案預設規範，但不得覆蓋：

1. 執行環境的 system 或 developer 指令
2. 使用者在目前任務中的明確要求與限制
3. 工具權限、安全邊界與平台政策

遇到衝突時，遵循較高優先級指令，並在工作回報中說明偏離本文件的原因。

## 2. 開始工作前必讀

依序閱讀：

1. `README.md`
2. `AGENTS.md`
3. `docs/PROJECT_REHYDRATION.md`
4. `docs/PROJECT_STATE.md`
5. `docs/architecture/core-decisions.md`
6. 與本次任務相關的程式碼、Issue、Pull Request、分支與最近 commits

不得只依賴聊天摘要、PR body 或前一個代理的完成宣告。Repository 實際檔案、Git 歷史與 CI／測試結果才是專案事實來源。

開始修改前，必須確認所有 open PR，尤其是 stacked PR 的 base/head 關係，避免從 `main` 重複建立已在其他分支進行的 schema、migration、auth 或功能。

## 3. 專案與環境邊界

- 現有 Lovable 系統繼續作為正式環境運作。
- V2 的 hosted 測試與部署必須使用獨立 staging 環境與 staging Supabase 專案。
- migration、RLS、auth 與 provisioning 可以先在隔離的本機 Supabase 開發與驗證。
- 在執行 Supabase link、push、遠端 migration、hosted staging 測試或部署前，必須確認專案 ownership、目標環境、秘密值與操作權限。
- 未經明確授權，不得連線、修改或遷移正式 Lovable 或 production database。
- 不得提交 `.env`、密碼、API 金鑰、Supabase service-role key、LINE secret/token 或其他秘密資訊。
- 不得直接在 `main` 開發；程式碼變更通常透過獨立分支與 Pull Request 交付。

## 4. 核心資料與權限規則

- 單一資料庫服務多個扶輪社，所有社級業務資料必須以 `club_id` 隔離。
- `people` 表示真實人物。
- `app_accounts` 表示登入帳號。
- `club_memberships` 只保存現任或歷史扶輪社友社籍。
- `club_operator_permissions` 保存執行秘書等社級管理權限。
- 執行秘書不得因管理權限而自動成為社員，也不得出現在社員名冊或出席率分母。
- 每位操作者必須使用自己的帳號；禁止共用登入憑證。
- 同一人在同一扶輪社的社員身分與 operator 權限，最終產品規則不得重疊。

任何涉及資料模型、RLS、跨社查詢、認證或權限的修改，都必須明確說明如何維持以上規則。

## 5. 分支與交付方式

- 優先交付小型、可驗證的垂直功能，避免一次重寫整個系統。
- 修改前先確認現有實作；不得假設檔案、資料表、API 或環境已存在。
- 使用者指定既有 branch／PR、任務屬於 stacked PR，或現有工作已在特定分支進行時，應繼續使用該分支，不得另開重複分支。
- 唯讀審查、分析、說明文件閱讀或無寫入權限的工作，不需要建立 branch 或 PR。
- 新工作從預設分支開始且沒有既有命名慣例時，可使用 `agent/<description>`；若 Repository 已採用 `feat/*`、`fix/*` 或其他慣例，應保持一致。
- 新 PR 預設可先建立為 Draft；是否標記 Ready、合併或部署，依使用者要求、review 與 CI 結果決定。
- 保持 TypeScript strict，不使用無理由的 `any`、忽略錯誤或關閉型別檢查。
- 新增環境變數時，同步更新 `.env.example` 與相關文件，但不得填入真實秘密值。
- 資料庫變更應使用 forward-only、可追蹤的 migration，並同時考慮 RLS、索引、唯一性、歷史 migration 不可變性與回滾／修復策略。
- UI、API 與資料庫命名應與既有 domain model 一致，不自行創造互相衝突的身分類別。

## 6. 完成前驗證

先讀取目標 branch 的 `package.json`、scripts、Supabase 設定與 workflows，再決定完整檢查清單。不得只套用 `main` 的基礎命令。

### Node.js／應用程式變更

有 lockfile 且不是更新依賴時，乾淨安裝優先使用：

```bash
npm ci
```

只有在新增、移除或更新依賴時才使用 `npm install`，並確認 lockfile 變更合理。

目標 branch 有對應 scripts 時，至少執行：

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

若尚未提供 `npm test`，需明確標記測試套件不存在，不得假裝已執行。

### Migration／RLS／資料庫安全變更

目標 branch 有對應 scripts 時，至少執行：

```bash
npm run check:migrations
npm run verify:db
```

`verify:db` 應包含或等效覆蓋：

- `supabase db reset --local`
- `supabase db lint --local`
- 核心 schema／RLS／provisioning verification SQL

不得修改已被下游 stacked PR 依賴的歷史 migration；需要修正時新增 forward-only migration。

### Auth／invitation／identity 變更

目標 branch 有對應 scripts 時，執行：

```bash
npm run bootstrap:superadmin
npm run verify:auth
```

並確認 local-only guard、租戶可見性、邀請接受冪等性與秘密值邊界。

### 無法執行時

若因環境、憑證、Docker、Supabase CLI 或外部服務無法完成某項驗證，必須清楚列出：

- 未執行的檢查
- 無法執行的原因
- 已完成的替代驗證
- 後續需要人工確認的事項

不得在檢查失敗或關鍵驗證缺失時宣稱任務已完整完成。

## 7. 文件與交接

只有會改變 delivery state、核心架構、主要風險、外部環境或後續工作順序的 Pull Request，才需要更新 `docs/PROJECT_STATE.md`。純樣式、小型修正或不影響交付狀態的重構通常不必更新。

處理 stacked PR 時：

- 各 PR 只記錄相對於其 base branch 的新增狀態與依賴。
- 不得把 open PR 中的功能寫成已合併到 `main`。
- 不得把已在下游 PR 進行的工作寫成「尚未開始」。
- 堆疊合併完成後，由最上層 PR、最後合併的 PR 或專門同步 PR 統一整理 `main` 的狀態快照。

重大且長期有效的架構決策應更新 `docs/architecture/core-decisions.md` 或新增 ADR，而不是只留在聊天或 PR 留言中。

## 8. 任務完成回報格式

代理完成工作時應提供：

1. 實際修改的檔案
2. 行為或架構上的改變
3. 使用的 branch／PR 與 stacked dependency
4. 執行過的驗證與結果
5. 尚未完成或需人工確認的事項
6. `docs/PROJECT_STATE.md` 是否需要／已經更新
7. 建議的下一步

完成宣告必須與 Repository 中的實際程式碼、migration、Git 紀錄與 CI 結果一致。
