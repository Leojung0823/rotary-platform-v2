# CI 與 Browser Smoke 執行規則

更新日期：2026-08-31（Asia/Taipei）

## 規則

每次 Pull Request 或推送到 `main` 時，workflow 先做一次變更範圍判斷：

- 只有文件、README、CHANGELOG、LICENSE 或 Dependabot 設定的變更：跳過完整 CI 與 Browser Smoke。
- `src/`、`supabase/`、`scripts/`、`e2e/`、`public/`、`tests/`、套件鎖檔、建置設定、部署設定、GitHub workflow 或 `AGENTS.md`：視為高風險變更，執行完整 CI 與 Browser Smoke。
- 無法辨識的新路徑：視為高風險，完整執行，避免新類型修改繞過檢查。

這裡的「大版本修改」不是看 commit 標題，而是看實際變更檔案。這樣不會因為有人把小改動寫成
「v2」就浪費時間，也不會因為把高風險程式改動寫成「文件更新」就跳過保護。

## 安全邊界

- workflow 本身仍會啟動一個輕量的 scope gate；被跳過的是完整工作，不是把變更藏掉。
- 分類器失敗時採 fail-open，改跑完整 CI 與 Browser Smoke。
- Staging Browser Acceptance、Staging Release、Staging Go-Live 與排程工作流是另外的受保護流程，不受本規則自動略過。
- 不使用 `[skip ci]`，避免 GitHub required check 留在不明確狀態。
- 文件變更若同時碰到程式、資料庫或 workflow，仍以高風險變更處理。
