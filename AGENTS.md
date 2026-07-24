# AGENTS.md

本文件是所有 AI 開發代理（ChatGPT、Codex 或其他自動化代理）在本 Repository 工作時的共同操作規範。

## 1. 開始工作前必讀

依序閱讀：

1. `README.md`
2. `AGENTS.md`
3. `docs/PROJECT_REHYDRATION.md`
4. `docs/PROJECT_STATE.md`
5. `docs/architecture/core-decisions.md`
6. 與本次任務相關的程式碼、Issue、Pull Request 與最近 commits

不得只依賴聊天摘要或前一個代理的完成宣告。Repository 內容、Git 歷史與 CI 結果才是專案事實來源。

## 2. 專案邊界

- 現有 Lovable 系統繼續作為正式環境運作。
- V2 必須使用獨立的 staging 環境與 staging Supabase 專案。
- 未經明確授權，不得連線、修改或遷移正式 Lovable 資料庫。
- 不得提交 `.env`、密碼、API 金鑰、Supabase service-role key 或其他秘密資訊。
- 不得直接在 `main` 開發；使用獨立分支並透過 Pull Request 交付。

## 3. 核心資料與權限規則

- 單一資料庫服務多個扶輪社，所有社級業務資料必須以 `club_id` 隔離。
- `people` 表示真實人物。
- `app_accounts` 表示登入帳號。
- `club_memberships` 只保存現任或歷史扶輪社友社籍。
- `club_operator_permissions` 保存執行秘書等社級管理權限。
- 執行秘書不得因管理權限而自動成為社員，也不得出現在社員名冊或出席率分母。
- 每位操作者必須使用自己的帳號；禁止共用登入憑證。
- 同一人在同一扶輪社的社員身分與 operator 權限，最終產品規則不得重疊。

任何涉及資料模型、RLS、跨社查詢、認證或權限的修改，都必須明確說明如何維持以上規則。

## 4. 開發方式

- 優先交付小型、可驗證的垂直功能，避免一次重寫整個系統。
- 修改前先確認現有實作；不得假設檔案、資料表、API 或環境已存在。
- 保持 TypeScript strict，不使用無理由的 `any`、忽略錯誤或關閉型別檢查。
- 新增環境變數時，同步更新 `.env.example` 與相關文件，但不得填入真實秘密值。
- 資料庫變更應使用可追蹤的 migration，並同時考慮 RLS、索引、唯一性與回滾影響。
- UI、API 與資料庫命名應與既有 domain model 一致，不自行創造互相衝突的身分類別。

## 5. 完成前驗證

程式碼變更至少執行：

```bash
npm install
npm run lint
npm run typecheck
npm run build
```

若任務新增測試工具或專案已有相關測試，亦必須執行對應測試。

若因環境、憑證或外部服務無法完成某項驗證，必須清楚列出：

- 未執行的檢查
- 無法執行的原因
- 已完成的替代驗證
- 後續需要人工確認的事項

不得在檢查失敗時宣稱任務已完整完成。

## 6. 文件與交接

每個會改變專案狀態的 Pull Request，都應視需要更新 `docs/PROJECT_STATE.md`，至少包含：

- 完成項目
- 目前進行中項目
- 重要技術決策
- 已知問題或阻塞
- 下一個建議任務
- 驗證結果

重大且長期有效的架構決策應更新 `docs/architecture/core-decisions.md` 或新增 ADR，而不是只留在聊天或 PR 留言中。

## 7. 任務完成回報格式

代理完成工作時應提供：

1. 實際修改的檔案
2. 行為或架構上的改變
3. 執行過的驗證與結果
4. 尚未完成或需人工確認的事項
5. `docs/PROJECT_STATE.md` 是否已更新
6. 建議的下一步

完成宣告必須與 Repository 中的實際程式碼及 Git 紀錄一致。