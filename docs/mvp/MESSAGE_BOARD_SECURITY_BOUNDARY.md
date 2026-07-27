# Message Board MVP Security Boundary

本文件描述 MVP 的安全邊界與殘餘風險，不代表正式 security approval、production readiness 或 merge approval。

## Auth UID authority

Supabase Auth session 是唯一登入權威。Server 先以 `auth.getUser()` 驗證 session；database RPC 再以 `auth.uid()` 做最終授權。Client state、request body、URL query 與 capability flags 都不是授權來源。

## app_account derivation

RPC 使用既有 `current_app_account_id()`，只解析 `app_accounts.auth_user_id = auth.uid()` 且 `account_status = 'active'` 的帳號。suspended、disabled、缺少 app account 或無效 Auth user 都無法 list/create/update/delete。

## No browser author authority

Create RPC 只接受 `content`。Update 只接受 post UUID 與 content。Delete 只接受 post UUID。Browser 不得提交 author account、Auth UUID、person ID、LINE subject、email、role、status、timestamp、deleted flag 或 ownership flag。

## No broad table CRUD

`board_posts` 啟用 RLS，並撤銷 anon/authenticated 的所有 table privileges。Browser 不直接 SELECT/INSERT/UPDATE/DELETE；只能執行明確授權的四個 RPC。

## RPC search_path

所有 privileged RPC 都是 `SECURITY DEFINER`，並固定：

```sql
set search_path = pg_catalog, public, auth
```

所有資料表與 helper 呼叫均 schema-qualified，避免 attacker-controlled schema/object resolution。

## Exact grants

PUBLIC 與 anon 的 execute 被撤銷。authenticated 只取得：

- `list_board_posts(timestamptz, uuid, integer)`
- `create_board_post(text)`
- `update_own_board_post(uuid, text)`
- `delete_own_board_post(uuid)`

Trigger/helper functions不授權 browser roles。

## Ownership enforcement

Mutation 每次都重新推導 actor。Update/delete 的 database predicate 同時要求：

```sql
author_app_account_id = actor_id
AND status = 'active'
```

UI 的 `can_edit`/`can_delete` 由 RPC 計算，只控制顯示；即使修改前端或直接呼叫 API，RPC 仍重新驗證 ownership。

## Cross-user generic denial

他人 post、不存在 post、deleted post 與重複 delete 均使用相同 `board_post_not_available` database classification。API 只轉為 generic `request_failed`，不回 raw error、SQL、row count 或存在性差異。

## Soft deletion

Delete 只更新 status/deleted_at/updated_at，資料列保留。List 只選 active。Trigger 禁止 deleted → active，並以 hard-delete trigger 阻止一般 DELETE，避免 browser/API 形成永久刪除路徑。

## Cursor opacity

Client cursor 是 bounded、versioned base64url JSON，只包含 version、created_at、post ID，不含身份資料。Decode 拒絕 invalid base64url、oversize、unknown fields/version、invalid timestamp/UUID。RPC 進一步驗證 `(created_at, id)` 必須對應現存 active row，且排序欄位固定，client 無法指定 SQL fragment、sort column、author 或 status。

## Sensitive-field projection

RPC 與 API 白名單只回：post ID、content、created/updated time、author display name、optional avatar URL、can_edit、can_delete、next cursor。

不回 Auth UUID、app account ID、person ID、LINE subject、email、invitation/session、status、deleted_at 或 audit metadata。

## Plain-text rendering

Database 儲存 normalized plain text；API 回 JSON string；React 以 text node escaping 顯示並以 `white-space: pre-wrap` 保留換行。未使用 `dangerouslySetInnerHTML`、Markdown HTML passthrough 或不完整 sanitizer。`<script>`、event handler、SVG/HTML payload 只會顯示為文字。

Avatar URL 只在通過 HTTP(S) protocol check 後用於 `<img src>`，並設 referrer policy；無效或載入失敗時顯示 fallback。

## Same-origin mutation protection

POST/PATCH/DELETE 在 authentication/RPC 前檢查 Origin 與 Fetch Metadata。明確 cross-site/cross-origin 或缺少可驗證來源的 request fail closed。POST/PATCH 只接受 JSON、最多 4 KB、exact body keys；DELETE 必須無 body。

## Error and cache boundary

所有 API success/error 都使用 `Cache-Control: no-store`。錯誤 body 固定為 `request_failed`，不轉送 Supabase error message、SQL detail、hint、constraint name 或敏感身份語意。

## Residual MVP risks

- 尚未在本次一般 GPT connector 工作階段實際執行 Node、Supabase CLI、PostgreSQL verification 或 browser smoke test。
- Cursor 是 opaque/strictly validated，但不是使用獨立 rotating secret 簽章；database row-pair integrity check 限制可接受值。未來若 cursor 承載更多 filter/tenant authority，應改為 server-signed token。
- Avatar 會對外部 HTTP(S) host 發出瀏覽器請求；正式環境應搭配 CSP/image proxy/allowlist 與 HTTPS-only policy。
- MVP 沒有 rate limiting、spam moderation、abuse reporting、retention policy 或 admin moderation。
- Hard-delete trigger 保護一般 SQL path；database owner 仍可停用 trigger，屬 trusted operational boundary。
- 最終整合仍需 PR #11 navigation conflict resolution、local reset/lint、CI、獨立 code/security review。
