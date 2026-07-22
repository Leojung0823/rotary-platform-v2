# V0.3 身份與 LINE 架構

## 範圍

V0.3 只建立身份與管理底座，不實作活動、公告、歡喜、IOU、AI 或正式推播排程。社員資料由扶輪社預建；社員接受邀請時只確認或補齊缺少欄位。LINE Login 是身份提供者，LINE Official Account 是通訊提供者，兩者沒有共用 user id、token 或解除操作。

## 身份與資料邊界

- `people` 保存真人資料；`app_accounts` 對應 Supabase Auth 使用者；`club_memberships` 保存每社社籍。
- `member_invitations` 保存 token 的 SHA-256 hash、8 字元辨識前綴、到期時間與狀態，原始 token 只在建立／重送／重新綁定時回傳一次。
- `line_identities` 只保存經驗證的 LINE subject 與公開 profile，不保存 LINE access token 或 refresh token。
- `line_oa_accounts`、`line_oa_followers`、`line_push_logs`、`line_webhooks` 是獨立 OA 邊界。解除 follower 配對不會修改 `line_identities` 或 Supabase session。
- 所有 browser role 均無 table CRUD；資料經固定 `search_path` 的 SECURITY DEFINER RPC 存取，RPC 從 `auth.uid()` 推導 actor 並檢查社別與 permission。

## LINE Login

`GET /api/auth/line/start?invite=<token>&returnTo=/...` 建立 state 與 nonce，並將其 hash、邀請 token hash、return path 寫入 10 分鐘的一次性 `line_oauth_states`。callback 同時驗證 HttpOnly SameSite cookie、資料庫交易未到期／未使用、nonce 與邀請一致，再以 authorization code 交換 token並驗證 ID token 的 issuer、audience、signature、expiry 與 nonce。交易以條件更新消耗，因此重播會失敗。

成功後，server 建立或找到 Supabase Auth 使用者，以 server 產生的一次性 magic-link hash 建立 Supabase session。`@supabase/ssr` middleware 負責 session cookie 與 refresh；裝置 fingerprint 只保存 SHA-256 hash。管理員解除 LINE Login 時，identity 改為 `unbound`，刪除該 Auth user 的所有 `auth.sessions`，Person、Membership、Login History 與 Audit Log 均保留，並可建立新的 hash-only rebind invitation。

本機使用：

```dotenv
APP_ENV=local
NEXT_PUBLIC_SITE_URL=http://localhost:3000
LINE_LOGIN_MODE=mock
LINE_MOCK_SIGNING_SECRET=<local-only random secret, at least 32 characters>
```

真實 provider 需另設 `LINE_LOGIN_CHANNEL_ID`、`LINE_LOGIN_CHANNEL_SECRET`，並將 LINE Console callback URL 設為 `<site>/api/auth/line/callback`。`LINE_LOGIN_MODE=line` 會呼叫 LINE OAuth v2.1；mock 會在非 localhost 網址 fail closed。

## LINE Official Account

Webhook URL 是 `/api/line-oa/webhook/<clubId>`。Server 使用 `LINE_OA_CHANNEL_SECRET` 對未解析的 raw body 驗證 `x-line-signature`；無效事件只保存 payload hash 與失敗狀態，不執行 follow/unfollow。訊息 client 支援 broadcast、multicast、push、reply，以及 text/Flex payload；UI 提供 broadcast/multicast 文字入口。每次請求寫入不含內容全文的摘要與 provider request id。

本機使用 `LINE_OA_MODE=mock`；真實 provider 需 `LINE_OA_MODE=line` 與 server-only `LINE_OA_CHANNEL_ACCESS_TOKEN`、`LINE_OA_CHANNEL_SECRET`。Channel secret、access token 不寫入資料表或 client bundle。

## RBAC

權限由 `permissions`、`role_definitions`、`role_permissions`、`club_role_assignments` 決定。社長可管理角色；秘書可管理社員、邀請、身份、OA 與稽核；財務只能讀社員／dashboard 與財務身份範圍；一般社員只能讀首頁並管理自己的資料。角色切換會撤銷同帳號在該社原有 active role，所有變更寫入 audit log。V0.2 的 legacy club manager 由 secretary 角色矩陣轉譯，不維護另一份硬編碼權限清單。

## API

所有 mutation 需要 Supabase session 並檢查 same-origin；RPC 仍是最終授權邊界。

- `GET /api/v1/me`
- `GET|POST /api/v1/clubs/<clubId>/members`
- `POST /api/v1/clubs/<clubId>/members/<membershipId>/profile`
- `POST /api/v1/clubs/<clubId>/members/<membershipId>/status`
- `POST /api/v1/clubs/<clubId>/members/<membershipId>/role`
- `GET /api/v1/clubs/<clubId>/members/template|export`
- `POST /api/v1/clubs/<clubId>/members/import`
- `GET /api/v1/clubs/<clubId>/invitations`
- `POST /api/v1/invitations/<invitationId>/resend|cancel`
- `POST /api/v1/clubs/<clubId>/identities/<accountId>/unbind`
- `POST /api/v1/me/settings`、`POST /api/v1/devices/<deviceId>/revoke`
- `GET /api/v1/clubs/<clubId>/dashboard|audit|line-oa`
- `POST /api/v1/clubs/<clubId>/line-oa/configure|pair|unpair|push`

登入從 `/api/auth/line/start` 開始；登出由 server action 呼叫 Supabase `signOut()`；session refresh 由 SSR middleware 執行。

## 上線檢查表

1. 先在隔離的部署環境執行 migration、db lint、verification SQL 與 smoke test，不可指向正式資料執行本機 fixture。
2. 將 service role、LINE secret/token 放在 server secret store；確認 client bundle 與 logs 沒有 secret。
3. 設定精確的 HTTPS `NEXT_PUBLIC_SITE_URL`、LINE callback、OA webhook，並驗證 CSP／proxy 保留 raw request body。
4. 非本機 trusted admin 必須同時設定 `APP_ENV=production` 與 `TRUSTED_ADMIN_ENVIRONMENT=production`；部署設定錯誤時應保持 fail closed。
5. 設定 audit retention、登入異常告警、LINE provider error monitoring 與 key rotation runbook。

## 明確未完成

- 不含活動、公告內容、生日卡、例會資料來源、AI、IOU 或正式排程推播。
- Email 邀請在 V0.3 以一次性連結交付（UI 可複製、LINE 分享、QR 或交給郵件系統）；未綁定特定交易郵件供應商。
- OA Rich Menu 保存設定欄位並保留 API 擴充點，但未包含 Rich Menu 圖片製作／上傳工作流。
