# LINE 登入與留言板 MVP 平行開發契約

## 目的

本整合線以 `feat/v0.3-identity-admin` 的既有 LINE OAuth、Supabase session 與身份資料模型為基礎，平行推進兩個 Draft PR：

1. LINE Login MVP readiness／hardening，由 Codex 負責。
2. Message Board MVP，由一般 GPT 負責。

兩個 PR 都以 `feat/mvp-line-board-integration` 為 base，不直接修改 `main`，也不碰 PR #10 的 PR-03 Revision 規格線。

## 共用邊界

- MVP 使用既有 Supabase Auth session 與 `app_accounts`／`people`／`line_identities` 身份鏈。
- 不建立第二套 MVP user/session table。
- 不依賴尚未定稿的 PR-03 Invitation Acceptance runtime contract。
- 不修改或宣告 PR-03 Revision 10.x／11 已完成。
- Hosted staging、production、Lovable 與正式 LINE Console 不得被自動修改。
- 真實 LINE credentials 只由部署環境提供；repository 只保存變數名稱。
- LINE local mock 僅限 localhost／test，production 必須 fail closed。

## PR-A：Codex LINE Login MVP readiness

允許修改：

- `src/app/api/auth/line/**`
- `src/lib/line/**`
- LINE login 專用測試
- `.env.example` 中只新增 LINE 變數名稱與註解
- LINE login MVP 操作文件

不得修改：

- Message Board migration、API、頁面與元件
- `src/components/app-shell.tsx`
- PR-03 Revision 文件
- hosted／production 設定

完成條件：

- start、callback、cancel/error、logout、session persistence 的 MVP 路徑可驗證。
- state／nonce 一次性、redirect allowlist、server-only secrets、token redaction 與 production fail-closed 有測試。
- 不重寫既有 identity／membership／invitation 架構。

## PR-B：GPT Message Board MVP

允許修改：

- 新增 Message Board migration／RPC／verification
- `src/app/(authenticated)/board/**`
- `src/app/api/v1/board/**` 或既有 versioned API dispatcher 中的 board route
- `src/components/message-board/**`
- 必要的 authenticated navigation entry
- Message Board 測試與文件

不得修改：

- `src/app/api/auth/line/**`
- `src/lib/line/**`
- LINE provider／callback 實作
- PR-03 Revision 文件

完成條件：

- 已登入者可讀取、新增、編輯、軟刪除自己的留言。
- 未登入者與跨使用者修改均 fail closed。
- Browser 不取得直接 table CRUD 權限；寫入由受控 RPC 或 server boundary 完成。
- 內容有長度限制、純文字輸出、分頁、空狀態、錯誤狀態與基本行動版介面。

## Message Board 最小資料契約

`board_posts` 至少包含：

- `id`
- `author_app_account_id`
- `content`
- `status`
- `created_at`
- `updated_at`
- `deleted_at`

公開回應不得暴露 Auth UUID、LINE subject、email、token、session ID 或內部稽核欄位。

## 路由契約

- `GET /api/v1/board/posts?cursor=<opaque>&limit=<n>`
- `POST /api/v1/board/posts`
- `PATCH /api/v1/board/posts/{postId}`
- `DELETE /api/v1/board/posts/{postId}`
- UI：`/board`

Exact response bytes 與正式 PR-03 header contract 不在本 MVP 範圍，但所有錯誤必須是 generic、不可洩漏跨使用者或 Invitation 語意。

## 合併與衝突規則

- 兩個 PR 可同時開發與測試。
- 各 PR 只能修改自己的 ownership 範圍。
- 兩者都先 merge 到 `feat/mvp-line-board-integration`。
- 整合後再建立單一 roll-up PR；本輪不直接 merge 到 `main`。
- 若發現必須修改對方 ownership 檔案，先停止並在 PR body 記錄 integration dependency，不可自行跨界重寫。
