# Message Board MVP Runbook

## 1. MVP 範圍

本功能提供**社內留言板**：選擇目前具備 active 社籍且扶輪社本身為 active 的社別、查看該社最新留言、stable cursor pagination、純文字發布、編輯自己的留言與軟刪除自己的留言。UI 路徑為 `/board`。

不包含跨社交流區、回覆串、按讚、附件、Markdown/HTML、搜尋、通知、審核後台、硬刪除、正式監控或正式環境部署。

## 2. 身份與社別授權

權威身份鏈為：

`Supabase Auth user → active app_accounts → people → active club_memberships → active clubs`

所有 RPC 從 `auth.uid()` 推導目前 app account，並對傳入的 `club_id` 重新確認 active account、active membership 與 active club。Browser 不得提供 author、Auth UUID、person ID、email、LINE subject、role 或 ownership flag。

平台角色或執行秘書權限不會自動授予社員留言板存取權。

## 3. board_posts schema

Migrations：

- `supabase/migrations/20260727000100_message_board_mvp.sql`
- `supabase/migrations/20260728235900_message_board_access_hardening.sql`

主要欄位：

- `id uuid`：database generated primary key
- `club_id uuid`：不可變 tenant key，references `clubs(id)`
- `author_app_account_id uuid`：不可變，references `app_accounts(id)`
- `content text`：trim 後 1–1000 Unicode code points
- `status text`：僅 `active`／`deleted`
- `created_at timestamptz`：不可變
- `updated_at timestamptz`：trigger 使用 database time
- `deleted_at timestamptz`：與 status 一致

索引以 `(club_id, created_at DESC, id DESC)` 支援 active pagination，另有 club/author/status lookup index。

## 4. RPC 與 privilege boundary

- `list_my_board_clubs()`
- `list_board_posts(uuid, timestamptz, uuid, integer)`
- `create_board_post(uuid, text)`
- `update_own_board_post(uuid, uuid, text)`
- `delete_own_board_post(uuid, uuid)`

`board_posts` 啟用 RLS，anon/authenticated 沒有直接 table CRUD。RPC 為固定 `search_path` 的 `SECURITY DEFINER`，PUBLIC/anon execute 被撤銷，只授權 authenticated。內部 membership helper 不授權 browser role。

## 5. API routes

所有路由都必須帶 `club_id`：

- `GET /api/v1/board/posts?club_id=<uuid>&cursor=<opaque>&limit=<1..50>`
- `POST /api/v1/board/posts?club_id=<uuid>`，body 只允許 `{ "content": string }`
- `PATCH /api/v1/board/posts/{postId}?club_id=<uuid>`，body 只允許 `{ "content": string }`
- `DELETE /api/v1/board/posts/{postId}?club_id=<uuid>`，不得有 body

所有回應使用 `Cache-Control: no-store`。錯誤只回 `{ "error": "request_failed" }`，不回 raw Supabase/SQL error。

Production mutation 必須同時符合：

- `NEXT_PUBLIC_SITE_URL` 是精確的 trusted HTTPS origin，且沒有 path、query、credentials 或 fragment。
- `Origin` 與 trusted origin 完全一致。
- `Sec-Fetch-Site` 缺省或為 `same-origin`。

Production 不會以 request Host 作為授權 origin，也不接受缺少 Origin 或 `Sec-Fetch-Site: none` 的 mutation。

## 6. Tenant-scoped cursor contract

API cursor 是 version 1 的 base64url JSON，綁定 `created_at` 與 post UUID。RPC 會確認 cursor 的 `(club_id, created_at, id)` 必須對應該社現存 active row。乙社 cursor 無法套用到甲社。

排序為：

```sql
ORDER BY created_at DESC, id DESC
```

RPC 取 `limit + 1` 判斷是否有下一頁。

## 7. 內容與純文字限制

Server 與 database 會正規化換行、trim 外圍空白、拒絕空白內容，並限制最多 1000 個 Unicode code points。React 以 text node escaping 顯示；未使用 `dangerouslySetInnerHTML` 或 HTML passthrough。

頭像只接受 HTTP(S) URL；無效或載入失敗時顯示姓名首字 fallback。正式環境仍應搭配 CSP、image proxy／allowlist 與 HTTPS-only policy。

## 8. 本機啟動與驗證

```bash
npm ci
npx supabase start
npx supabase db reset --local
npx supabase db lint --local
cp .env.example .env.local
npm run dev
```

執行公告板 verification：

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -v ON_ERROR_STOP=1 \
  -f supabase/verification/message_board_security.sql

psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -v ON_ERROR_STOP=1 \
  -f supabase/verification/message_board_access_hardening.sql
```

Verification 皆 rollback fixture，並驗證：

- `club_id` tenant key、RLS、不可變性與 hard-delete denial
- anonymous denial、direct table denial 與 exact RPC grants
- active account、active membership、active club 三層 requirement
- 跨社 list/create/update/delete/cursor denial
- 同社 ownership enforcement
- pagination、projection、constraints 與 soft delete
- suspended account、suspended membership 與 suspended club denial

GitHub CI 會在乾淨 Supabase reset 與 database lint 後依序執行這兩份公告板 SQL，以及既有 identity、provisioning、V0.3 與 LINE webhook security suites。

## 9. Application checks

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Vitest 覆蓋 content normalization/limit、unknown fields、UUID、limit、cursor、trusted production origin、content-type、純文字 rendering、頭像 URL policy、no-store 與 raw-error redaction。資料庫租戶隔離由 verification SQL 驗證。

## 10. UI smoke test

1. 以有 active account、active membership 且社別 active 的帳號登入並開啟 `/board`。
2. 多社社員切換社別，確認每個社的留言完全不同。
3. 以僅屬甲社的帳號嘗試請求乙社 API，確認回 403 generic error。
4. 發布含換行與 `<script>` 字樣的留言，確認只顯示文字。
5. 編輯、刪除自己的留言；確認同社他人無法修改。
6. 建立超過 20 筆資料，確認載入更多無重複或漏資料。
7. 驗證手機寬度排版與 session-expired 狀態。
8. 暫停帳號、社籍或扶輪社後，確認 selector 與 API 都立即拒絕。
9. 模擬 `list_my_board_clubs` 失敗，確認 UI 顯示錯誤，而不是「沒有社別」。

## 11. Integration and exclusions

PR #12 已同步至包含 PR #13 webhook ingress hardening 與 PR #11 LINE Login readiness 的 `feat/mvp-line-board-integration`。`src/components/app-shell.tsx` 是 integration-sensitive file；留言板沒有修改 LINE Login、logout 或 session runtime。

本實作沒有連線或修改 hosted/production Supabase、Lovable、LINE Console、LINE OA、Rich Menu 或 secrets。Browser smoke test、Edge rate limit／abuse controls 與正式上線前外部安全審查仍需人工完成。
