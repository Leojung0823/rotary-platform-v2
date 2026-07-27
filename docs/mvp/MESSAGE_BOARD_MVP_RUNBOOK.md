# Message Board MVP Runbook

## 1. MVP 範圍

本功能提供登入後留言板：最新留言、stable cursor pagination、純文字發布、編輯自己的留言與軟刪除自己的留言。UI 路徑為 `/board`。

不包含回覆串、按讚、附件、Markdown/HTML、搜尋、通知、審核後台、硬刪除、正式監控或正式環境部署。

## 2. 身份與授權來源

權威身份鏈為：

`Supabase Auth user → app_accounts → people`

所有 RPC 都從 `auth.uid()` 經既有 `current_app_account_id()` 推導目前 `app_account`。帳號必須為 `active`。Browser 不得提供 author、Auth UUID、person ID、email、LINE subject、role 或 ownership flag。

## 3. board_posts schema

Migration：`supabase/migrations/20260727000100_message_board_mvp.sql`

欄位：

- `id uuid`，database generated primary key
- `author_app_account_id uuid`，不可變，references `app_accounts(id)`
- `content text`，trim 後 1–1000 Unicode characters
- `status text`，僅 `active`／`deleted`
- `created_at timestamptz`，不可變
- `updated_at timestamptz`，trigger 使用 database time
- `deleted_at timestamptz`，與 status 一致

索引使用 `(created_at DESC, id DESC)` 的 active partial index，以及 author/status lookup index。

## 4. RPC 與 privilege boundary

- `list_board_posts(timestamptz, uuid, integer)`
- `create_board_post(text)`
- `update_own_board_post(uuid, text)`
- `delete_own_board_post(uuid)`

`board_posts` 啟用 RLS，anon/authenticated 沒有直接 table CRUD。RPC 為固定 `search_path` 的 `SECURITY DEFINER`，PUBLIC/anon execute 被撤銷，只授權 authenticated。

## 5. API routes

- `GET /api/v1/board/posts?cursor=<opaque>&limit=<1..50>`
- `POST /api/v1/board/posts`，body 只允許 `{ "content": string }`
- `PATCH /api/v1/board/posts/{postId}`，body 只允許 `{ "content": string }`
- `DELETE /api/v1/board/posts/{postId}`，不得有 body

所有回應使用 `Cache-Control: no-store`。錯誤只回 `{ "error": "request_failed" }`，不回 raw Supabase/SQL error。

## 6. Cursor contract

API cursor 是 version 1 的 base64url JSON，綁定 `created_at` 與 post UUID。Decode 有長度、base64url、shape、unknown fields、version、timestamp 與 UUID 驗證。

RPC 會再確認 cursor 的 `(created_at, id)` 必須對應現存 active row。排序為：

```sql
ORDER BY created_at DESC, id DESC
```

下一頁條件為：

```sql
created_at < cursor.created_at
OR (created_at = cursor.created_at AND id < cursor.id)
```

RPC 取 `limit + 1` 判斷是否有下一頁。

## 7. 內容限制

Server 與 database 會：

1. 將 CRLF/CR 正規化為 LF。
2. trim 外圍空白。
3. 拒絕空白內容。
4. 以 Unicode code points / PostgreSQL `char_length` 限制最多 1000 字。
5. 拒絕非 string、array、object、null 與 unknown fields。

## 8. Pure-text / XSS boundary

內容以 JSON 純文字傳輸，React text node 顯示，CSS 使用 `white-space: pre-wrap`。未使用 `dangerouslySetInnerHTML`、HTML sanitizer、Markdown HTML passthrough 或 user content href/src。

頭像只接受 HTTP(S) URL 作為 `<img src>`；無效 URL 或載入失敗顯示姓名首字 fallback。

## 9. 本機啟動

```bash
npm ci
npx supabase start
npx supabase db reset --local
cp .env.example .env.local
npm run dev
```

依 README 填入 local Supabase URL、publishable key 與 service role key。不得連到 hosted/production 執行 fixture。

## 10. Local Supabase reset

```bash
npx supabase db reset --local
npx supabase db lint --local
```

Migration 為 forward-only；不得修改既有 migration。

## 11. Verification SQL

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -v ON_ERROR_STOP=1 \
  -f supabase/verification/message_board_mvp.sql
```

SQL 使用 transaction 並 rollback，驗證 table privileges、RPC grants、身份推導、ownership、pagination、projection、constraints、soft delete、hard-delete denial 與 disabled account。

## 12. Tests

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

新增的 Vitest 覆蓋 content normalization/limit、unknown fields、post UUID、limit、cursor、same-origin、content-type、純文字 rendering regression、頭像 URL policy、no-store 與 raw-error redaction。

## 13. UI smoke test

1. 以 active app account 登入並開啟 `/board`。
2. 驗證 empty/loading 狀態。
3. 發布含換行與 `<script>` 字樣的留言，確認只顯示文字。
4. 編輯自己的留言，確認顯示「已編輯」。
5. 刪除自己的留言，確認需二次確認且成功後從 active list 移除。
6. 建立超過 20 筆資料，確認「載入更多」無重複或漏資料。
7. 以另一帳號確認不顯示編輯／刪除按鈕。
8. 驗證手機寬度排版。

## 14. 未登入行為

`/board` 經 authenticated layout/`requireIdentity()` 導向登入流程。四個 board API 在沒有有效 Supabase user 時回 generic 401，不執行 RPC。

## 15. Ownership 測試

UI 的 `can_edit`/`can_delete` 只改善體驗，不是安全邊界。每個 mutation RPC 都重新從 `auth.uid()` 推導 actor，並以 `author_app_account_id = actor_id AND status = 'active'` 更新。非 owner、不存在與 deleted post 都使用同一種 not-available 分類。

## 16. Soft-delete 行為

Delete 將 `status` 設為 `deleted`，並以 database time 設定 `deleted_at`/`updated_at`。資料列保留；list 只回 active。重複刪除採 generic not-available。trigger 禁止 deleted row 恢復為 active，並禁止 hard delete。

## 17. 不包含哪些功能

不含 LINE Login/OA 修改、PR-03 runtime、Invitation Acceptance、第二套身份/session table、service-role browser path、附件、富文字、留言審核、正式資料遷移與 production 操作。

## 18. 與 PR #11 的整合方式

本 PR 與 PR #11 共同 base 為 `feat/mvp-line-board-integration`。唯一 integration-sensitive file 是 `src/components/app-shell.tsx`，只新增 `/board` 導覽連結，未修改 login/logout/session UI。整合時可獨立 cherry-pick 或解決單一導覽衝突。

## 19. 不依賴 PR-03 runtime

API 使用既有 Supabase Auth session、`current_app_account_id()` 與專用 RPC，不讀取或修改 `docs/roadmap/V12_PR03_*`、`database/v12/**` 或 Invitation Acceptance runtime。

## 20. Hosted/production 未修改

本實作只修改 repository 內容。未連線、未 migration、未寫入 hosted/production Supabase、Lovable、LINE Console、LINE OA、Rich Menu 或 secrets。
