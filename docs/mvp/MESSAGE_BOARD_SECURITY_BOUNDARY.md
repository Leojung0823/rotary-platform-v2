# Message Board MVP Security Boundary

本文件描述 MVP 的安全邊界與殘餘風險，不代表正式 security approval、production readiness 或 merge approval。

## Product scope

留言板是**社內留言板**，不是全平台交流區。每則 `board_posts` 都必須有不可變的 `club_id`。使用者只有在 app account、club membership 與 club 本身都為 active 時，才能查看、建立、編輯或刪除該社留言。

平台管理員或執行秘書權限不會自動取得社員留言板存取權；沒有 active membership 就不能讀取社員交流內容。

## Auth and tenant authority

Supabase Auth session 是唯一登入權威。Server 先以 `auth.getUser()` 驗證 session；database RPC 再以 `auth.uid()` 解析 app account，並核對：

```sql
app_accounts.account_status = 'active'
AND club_memberships.club_id = p_club_id
AND club_memberships.membership_status = 'active'
AND clubs.club_status = 'active'
```

Client state、request body、URL 中的 `club_id` 與 capability flags 都只是請求資料，不是授權來源。RPC 必須重新驗證帳號、社籍與扶輪社生命週期。

## No browser author or tenant authority

Create RPC 接受 `club_id` 與 content；Update/Delete 接受 `club_id` 與 post UUID。Browser 不得提交 author account、Auth UUID、person ID、LINE subject、email、role、status、timestamp、deleted flag 或 ownership flag。

`club_id` 與 `author_app_account_id` 都由資料庫約束及 trigger 保護，建立後不可修改。

## No broad table CRUD

`board_posts` 啟用 RLS，並撤銷 anon/authenticated 的所有 table privileges。Browser 不直接 SELECT/INSERT/UPDATE/DELETE，只能執行明確授權的 RPC。

## RPC search_path and grants

所有 privileged RPC 都是 `SECURITY DEFINER` 並固定：

```sql
set search_path = pg_catalog, public, auth
```

PUBLIC 與 anon 的 execute 被撤銷。authenticated 只取得：

- `list_my_board_clubs()`
- `list_board_posts(uuid, timestamptz, uuid, integer)`
- `create_board_post(uuid, text)`
- `update_own_board_post(uuid, uuid, text)`
- `delete_own_board_post(uuid, uuid)`

Trigger 與 membership helper functions 不授權 browser roles。

## Tenant isolation

List query 固定包含 `post.club_id = p_club_id`。Cursor row-pair 驗證也必須在相同 `club_id` 下成立，因此不能拿乙社的 cursor 存取甲社。

Mutation predicate 同時要求：

```sql
club_id = p_club_id
AND author_app_account_id = actor_id
AND status = 'active'
```

RPC 在 predicate 前仍會確認呼叫者是該社 active member，且 app account 與 club 都為 active。這同時阻擋跨社讀取、跨社建立、跨社更新、跨社刪除，以及停權帳號／停權社籍／停權扶輪社的存取。

## Cross-user generic denial

同社他人 post、不存在 post、deleted post 與重複 delete 均使用相同 `board_post_not_available` classification。API 只轉為 generic `request_failed`，不回 raw error、SQL、row count 或存在性差異。

## Soft deletion

Delete 只更新 status/deleted_at/updated_at，資料列保留。List 只選 active。Trigger 禁止 deleted → active，並以 hard-delete trigger 阻止一般 DELETE。

## Cursor boundary

Client cursor 是 bounded、versioned base64url JSON，只包含 version、created_at 與 post ID。RPC 進一步驗證 `(club_id, created_at, id)` 必須對應現存 active row。Cursor 不承載或取代 tenant authority。

## Sensitive-field projection

RPC 與 API 白名單只回：post ID、content、created/updated time、author display name、optional avatar URL、can_edit、can_delete、next cursor。

不回 `club_id`、Auth UUID、app account ID、person ID、LINE subject、email、invitation/session、status、deleted_at 或 audit metadata。

## Plain-text rendering

Database 儲存 normalized plain text；API 回 JSON string；React 以 text node escaping 顯示並以 `white-space: pre-wrap` 保留換行。未使用 `dangerouslySetInnerHTML`、Markdown HTML passthrough 或不完整 sanitizer。

Avatar URL 只在通過 HTTP(S) protocol check 後用於 `<img src>`，並設 `referrerPolicy="no-referrer"`；無效或載入失敗時顯示 fallback。

## Same-origin mutation protection

POST/PATCH/DELETE 在 authentication/RPC 前檢查 Origin 與 Fetch Metadata。POST/PATCH 只接受 JSON、最多 4 KB、exact body keys；DELETE 必須無 body。所有 board API 都要求合法的 `club_id` query parameter。

Production 邊界採 fail closed：

- 必須設定沒有 path、query、credentials 或 fragment 的 trusted `NEXT_PUBLIC_SITE_URL`。
- trusted origin 必須使用 HTTPS。
- `Origin` 必須與 trusted origin 完全一致。
- `Sec-Fetch-Site` 缺省或為 `same-origin`；`none`、`same-site` 與 `cross-site` 都拒絕。
- Production 不以 request Host／`request.nextUrl.origin` 作為授權來源，也不接受缺少 Origin 的 mutation。

Local／test 在沒有 configured site URL 時，可以使用 request origin，但仍要求精確 Origin 與 same-origin Fetch Metadata。

## Error and cache boundary

所有 API success/error 都使用 `Cache-Control: no-store`。錯誤 body 固定為 `request_failed`，不轉送 Supabase error message、SQL detail、hint、constraint name 或敏感身份語意。

留言板社別 RPC 失敗或回傳 malformed projection 時，頁面顯示明確錯誤，不會將權限／資料庫錯誤誤顯示成「沒有可用社別」。

## Automated verification

GitHub CI 在乾淨 Supabase reset 與 database lint 後執行：

- `supabase/verification/message_board_security.sql`
- `supabase/verification/message_board_access_hardening.sql`

測試覆蓋 direct table denial、RPC grants、fixed search path、跨社 list/create/update/delete/cursor denial、ownership、pagination、projection、soft/hard delete，以及 suspended account、membership、club denial。所有 fixture 皆 rollback。

## Residual MVP risks

- 尚未執行已部署瀏覽器／手機的雙社 smoke test；GitHub CI 與 local Supabase SQL 不能取代真實瀏覽器操作。
- MVP 沒有 rate limiting、spam moderation、abuse reporting、retention policy 或社級 moderation。
- Avatar 會對外部 HTTP(S) host 發出瀏覽器請求；正式環境應搭配 CSP、image proxy／allowlist 與 HTTPS-only policy。
- Cursor 要求 cursor row 維持 active；游標所指留言若在載入下一頁前被刪除，Client 需重新整理取得新 cursor。
- Hard-delete trigger 保護一般 SQL path；database owner 仍可停用 trigger，屬 trusted operational boundary。
- 正式上線或匯入真實社員資料前仍需外部安全審查，以及 Edge rate limit／abuse control 設計。
