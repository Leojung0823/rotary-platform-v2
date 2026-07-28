# V0.3 身份與 LINE 架構

## 範圍

V0.3 建立 invitation-first 身份與管理底座，不實作活動、公告、歡喜、IOU、AI 或正式排程推播。社員資料先由扶輪社建立；陌生 LINE 使用者不能自行註冊，只有持有有效社員邀請，或已經綁定且帳號啟用中的使用者，才能完成 LINE Login。

LINE Login 是身份提供者；LINE Official Account（OA）是通訊提供者。兩者不共用 user id、access token、資料表或解除流程。

## 身份與多租戶邊界

- `people` 保存跨社共用的真人資料；`app_accounts` 對應 Supabase Auth 使用者；`club_memberships` 保存各社社籍。
- 社級角色只有在帳號啟用且該社社籍為 `active` 時才生效；停權／停用社籍不會保留角色權限。
- V0.2 執行秘書權限只有在 assignment 狀態有效、開始時間已到且尚未自然到期時才生效。
- 角色只能指派給同社啟用中的社員；不能把其他社或無社籍帳號直接變成社級角色。
- 一個真人若同時存在於多個社，普通社級管理員不能修改其全域 `people` 資料，也不能解除其全域 LINE Login；這類跨社身份操作只允許平台管理員執行。
- 建立新社邀請時可以辨識既有真人並新增社籍，但不能藉此覆寫其他社共用的姓名、聯絡方式或生日。
- 所有 browser role 均無 table CRUD；資料經固定 `search_path` 的 `SECURITY DEFINER` RPC 存取，RPC 從 `auth.uid()` 推導 actor 並檢查社別與 permission。

## 社員邀請與隱私

`member_invitations` 只保存 token 的 SHA-256 hash、8 字元辨識前綴、到期時間與狀態。原始 token 僅在建立、重送或重新綁定當次回傳一次。

匿名或尚未完成受邀身份綁定的登入者，只能從邀請預覽看到扶輪社名稱與受邀姓名；手機、Email 與生日維持遮蔽。只有目前啟用帳號確實對應受邀真人，且已具有有效 LINE identity 時，才會顯示預填私人資料。

## LINE Login

`GET /api/auth/line/start?invite=<token>&returnTo=/...` 只接受 64 字元十六進位邀請 token。Server 建立 state 與 nonce，並將其 hash、邀請 token hash與安全 return path 寫入 10 分鐘的一次性 `line_oauth_states`；瀏覽器只持有 HttpOnly、SameSite cookie。

Callback 依序完成：

1. 驗證 cookie state、資料庫 state、nonce、邀請 hash、return path、到期時間及一次性消耗。
2. 以 authorization code 交換並驗證 LINE ID token。
3. 確認有效邀請，或找到既有 active LINE identity 與 active app account。
4. 由 service-role-only RPC 綁定已驗證的 LINE subject；瀏覽器 `authenticated` role 無法自行提交或偽造 provider subject。
5. 身份綁定成功後才產生一次性 Supabase magic-link 並建立 session。
6. 裝置與登入記錄屬輔助 telemetry；記錄失敗不會把已成功建立的 session 誤判成登入失敗。

若建立新 Auth user 後、身份綁定前發生錯誤，callback 會盡力清理孤立 Auth user。LINE access token 與 refresh token不寫入資料庫。

本機設定：

```dotenv
APP_ENV=local
NEXT_PUBLIC_SITE_URL=http://localhost:3000
LINE_LOGIN_MODE=mock
LINE_MOCK_SIGNING_SECRET=<local-only random secret, at least 32 characters>
```

真實 provider 需另設 `LINE_LOGIN_CHANNEL_ID`、`LINE_LOGIN_CHANNEL_SECRET`，並將 LINE Console callback URL 設為 `<site>/api/auth/line/callback`。Mock 在非 localhost 網址會 fail closed。

## LINE Official Account

Webhook URL 為 `/api/line-oa/webhook/<clubId>`。每個扶輪社使用獨立的 server environment namespace：

```dotenv
# 社代碼 TAIPEI-NORTH 會轉成 TAIPEI_NORTH
LINE_OA_TAIPEI_NORTH_CHANNEL_SECRET=
LINE_OA_TAIPEI_NORTH_CHANNEL_ACCESS_TOKEN=
```

資料表只保存 environment key 名稱，不保存 secret 或 access token。若兩個社代碼正規化後會產生相同 namespace，資料庫會拒絕同時啟用，避免跨社共用憑證。

Webhook server 先依 `clubId` 取得該社 secret，再對未解析的 raw body 驗證 `x-line-signature`。無效簽章與無效 JSON 只保存 payload hash及失敗狀態，不執行 follow／unfollow。只有簽章有效事件會占用 provider event id；偽造事件不能預先阻擋正式事件。

訊息 UI 與 `/api/v1` 只允許 broadcast，或對本社資料庫中 `following` 的 follower 執行 multicast。Client 不能提交任意收件者、reply token 或其他社的 access token。OA follower 只能配對同社 active社員；OA 解除配對不修改 LINE Login identity 或 Supabase session。

本機使用 `LINE_OA_MODE=mock`；真實 provider 需 `LINE_OA_MODE=line` 與各社專屬的 server-only secret/token。

## RBAC

權限由 `permissions`、`role_definitions`、`role_permissions`、`club_role_assignments` 決定。社長可管理角色；秘書可管理社員、邀請、身份、OA 與稽核；財務只有讀取範圍；一般社員只能讀首頁並管理自己的資料。

V0.2 legacy club manager 會套用 secretary 權限矩陣，但仍必須是尚未到期的有效 operator assignment。角色切換會撤銷同帳號在該社原有 active role，所有變更寫入 audit log。

## API 與檔案匯入

所有 mutation 需要 Supabase session、有效 RPC permission 與明確 same-origin `Origin`。RPC 仍是最終授權邊界。

Excel 匯入會先完成 session 與 `invitation.manage` 權限檢查，之後才讀取 multipart body 或解析 workbook；檔案限制為 `.xlsx`、5 MB、最多 500 筆資料，避免未授權請求消耗大量解析資源。

主要路徑：

- `GET /api/v1/me`
- `GET|POST /api/v1/clubs/<clubId>/members`
- `POST /api/v1/clubs/<clubId>/members/<membershipId>/profile|status|role`
- `GET /api/v1/clubs/<clubId>/members/template|export`
- `POST /api/v1/clubs/<clubId>/members/import`
- `GET /api/v1/clubs/<clubId>/invitations|dashboard|audit|line-oa`
- `POST /api/v1/invitations/<invitationId>/resend|cancel`
- `POST /api/v1/clubs/<clubId>/identities/<accountId>/unbind`
- `POST /api/v1/me/settings`
- `POST /api/v1/devices/<deviceId>/revoke`
- `POST /api/v1/clubs/<clubId>/line-oa/configure|pair|unpair|push`

## 驗證範圍

`npm run verify:db` 會 reset local database、執行 schema lint，並依序執行：

- `core_identity_baseline.sql`
- `provisioning_security.sql`
- `operator_expiry_consistency.sql`
- `invitation_selection.sql`
- `v03_identity_admin_security.sql`
- `v03_tenant_mutation_security.sql`

V0.3 驗證涵蓋 invitation-first、瀏覽器無法偽造 LINE subject、邀請 PII 遮蔽、過期 operator、停權社員角色、角色目標社籍、跨社真人資料、跨社 LINE 解綁、每社 OA 憑證、有效 webhook 去重與 active-member follower 配對。

## 上線檢查表

1. 先在隔離部署環境執行 migration、db lint、verification SQL 與 smoke test，不可將本機 fixture 指向正式資料。
2. 將 service role、LINE Login secret 與各社 OA secret/token 放在 server secret store；確認 client bundle 與 logs 沒有 secret。
3. 設定精確 HTTPS `NEXT_PUBLIC_SITE_URL`、LINE callback、各社 OA webhook，並確認 proxy 保留 raw request body。
4. 非本機 trusted admin 必須同時設定 `APP_ENV=production` 與 `TRUSTED_ADMIN_ENVIRONMENT=production`；設定錯誤時保持 fail closed。
5. 正式上線前完成外部安全審查、rate limit、audit retention、登入異常告警、provider error monitoring 與 key rotation runbook。

## 明確未完成

- 不含活動、公告內容、生日卡、例會資料來源、AI、IOU 或正式排程推播。
- Email 邀請提供一次性連結，但尚未綁定特定交易郵件供應商。
- OA Rich Menu 保存擴充欄位，但未包含圖片製作／上傳工作流。
