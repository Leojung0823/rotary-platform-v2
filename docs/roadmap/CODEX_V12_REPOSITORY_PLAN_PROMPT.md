# Codex 任務：建立 Rotary Platform V1.2 Repository 工程執行藍圖

## 執行設定

- 模型：GPT-5.3-Codex
- 推理強度：xhigh
- 本輪模式：分析、盤點、規劃
- 本輪禁止：大規模修改、push、線上 Supabase 操作

## 專案位置

`/Users/leoj/Documents/Codex/2026-07-22/leojung0823-rotary-platform-v2-feat-supabase-2`

## 母版藍圖

請先讀取並遵守：

`docs/roadmap/V12_PRODUCT_ARCHITECTURE_ROADMAP.md`

若該檔案尚未放入 Repository，請要求使用者先提供或放入，不要自行猜測母版內容。

## 任務目標

根據實際 Repository，建立：

`docs/roadmap/V12_REPOSITORY_IMPLEMENTATION_PLAN.md`

這份文件要回答：

- 實際要改哪些檔案
- 哪些現有檔案必須保持不變
- 42 個 RPC 如何分類
- 25 張 Legacy Table 如何映射
- 前端哪些查詢與型別會受影響
- V1.2 應如何隔離建置
- PR 如何拆分
- 各 PR 的依賴、測試、風險與回滾方式

## 第一步：讀取規範

先檢查：

- 所有 `AGENTS.md`
- `README*`
- `package.json`
- Supabase config
- 現有 migrations
- SQL tests
- Edge Functions
- TypeScript database types
- Supabase client wrappers
- 前端所有 `from(...)`、`rpc(...)`、Auth、LINE Login、LINE OA 呼叫
- CI／GitHub Actions
- Draft PR 或相關分支資訊（只讀，不修改）

## 第二步：Git 安全檢查

執行：

```bash
git status --short
git branch --show-current
git log -10 --oneline
```

若工作區不乾淨：

- 不覆蓋既有修改
- 不 reset
- 不 stash
- 先在報告中列出衝突與風險

本輪不要建立 commit，不要 push。

## 第三步：建立現況盤點

至少產出：

### A. Migration Inventory

每份 migration：

- 檔名
- 建立／修改的 Table
- Function／RPC
- Trigger
- RLS Policy
- Seed
- 相依關係
- 是否 Legacy Immutable

### B. Table Inventory

每張現有 Table：

- 主用途
- 主要欄位
- FK
- RLS
- 被哪些 RPC 使用
- 被哪些前端檔案使用
- V1.2 對應目標
- 建議：保留／轉換／移除／人工審核

### C. RPC Inventory

全部 PostgreSQL Functions／RPC 必須逐支分類：

- 保留
- 重寫
- 合併
- 移除
- 延後

並列出：

- 呼叫者
- 使用資料表
- SECURITY DEFINER
- search_path
- 權限
- 新版替代 Function
- API 契約影響

### D. RLS Inventory

逐表列出：

- 是否啟用 RLS
- SELECT／INSERT／UPDATE／DELETE Policy
- Helper Function
- 可能的 Policy 遞迴
- 是否依賴 JWT Claims
- V1.2 是否可沿用

### E. Frontend Dependency Inventory

搜尋並整理：

- `.from(`
- `.rpc(`
- `supabase.auth`
- LINE Login
- LINE OA
- Database Types
- Table／Column 字串
- RPC 名稱
- Error Code

逐檔列出 V1.2 影響。

## 第四步：V1.2 隔離方案

提出至少兩種可行方案，並推薦一種：

- 獨立 Supabase 工作目錄
- 獨立 config／migration root
- 專用 Docker／PostgreSQL 測試流程
- 其他可重現方案

推薦方案必須符合：

- 不修改 4 份 Legacy Migration
- V1.2 可從空資料庫建立
- 單一重建命令
- 單一測試命令
- CI 可執行
- 不操作線上 Supabase

## 第五步：PR 計畫

依母版至少規劃：

1. `v12-database-foundation`
2. `v12-invitation-core`
3. `v12-membership-onboarding`
4. `v12-rls-rbac`
5. `v12-identity-session`
6. `v12-line-login`
7. `v12-line-oa`
8. `v12-audit-security`
9. `v12-legacy-mapping`
10. `v12-shadow-migration`
11. `v12-frontend-cutover`
12. `v12-release-candidate`

每個 PR 必須列出：

- 目的
- 前置依賴
- 實際檔案
- Migration
- Function
- RLS
- Edge Function
- 前端
- 測試
- 驗收條件
- 回滾方式
- 不包含項目

## 第六步：風險與人工決策

列出所有需要人工決定的項目，尤其：

- Bootstrap 第一位真人管理員
- V1.2 隔離方式
- Legacy 資料是否存在正式使用者資料
- Auth User 轉換
- Identity 衝突
- LINE Provider／Channel 對應
- Role Mapping
- Audit 歷史保存
- Cutover 停機窗口
- Account Merge 是否進 MVP
- Draft PR #7 的處理方式

不得自行替產品負責人決定。

## 第七步：文件輸出

建立：

`docs/roadmap/V12_REPOSITORY_IMPLEMENTATION_PLAN.md`

另外可建立：

- `docs/roadmap/V12_RPC_INVENTORY.md`
- `docs/roadmap/V12_LEGACY_TABLE_MAPPING.md`
- `docs/roadmap/V12_FRONTEND_DEPENDENCIES.md`
- `docs/roadmap/V12_RLS_INVENTORY.md`

文件必須引用實際檔案路徑及行號，不得只寫一般性建議。

## 驗證

本輪至少執行：

- Git 狀態檢查
- Repository 搜尋
- Migration／RPC／RLS 數量驗證
- 前端依賴搜尋
- 文件連結與路徑確認

本輪不要求執行 V1.2 Migration，除非 Repository 已有完全隔離且安全的現成流程。

## 最終回報

完成後回報：

1. 現況摘要
2. 文件清單
3. 實際確認的 Table／RPC／RLS 數量
4. 推薦隔離方案
5. PR 拆分摘要
6. 前五項阻斷問題
7. 需人工決策清單
8. 未能驗證項目
9. `git status --short`
10. `git diff --stat`

禁止：

- Push
- 操作線上 Supabase
- 修改 Legacy Migration
- 修改 Production 設定
- 第一輪直接重構全部後端
- 未經核准開始資料遷移
