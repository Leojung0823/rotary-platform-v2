# Rotary Platform V2

扶輪社多租戶管理平台的本機開發版本。身份核心採 invitation-first：LINE Login、社員確認加入、資料驅動 RBAC、秘書後台、每社獨立 LINE OA 管理、裝置與登入紀錄、RLS、audit log 及版本化 API。社員功能目前包含社內留言板，以及 V0.4 活動建立、發布與報名 MVP。

目前驗證邊界是 Supabase local stack；不包含 staging、Lovable 正式環境、正式 LINE Console 或正式資料。

## 需求

- Node.js 24+
- Docker Desktop
- Supabase CLI（專案可透過 `npx supabase` 使用）
- PostgreSQL `psql`（可選；未安裝時會使用 Supabase database container 內的 `psql`）

## 第一次啟動

```bash
npm install
npx supabase start
npx supabase db reset --local
npx supabase status -o env
cp .env.example .env.local
```

將 local stack 資訊填入 `.env.local`：

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<local SERVICE_ROLE_KEY>
BOOTSTRAP_SUPERADMIN_EMAIL=admin@example.test
BOOTSTRAP_SUPERADMIN_PASSWORD=<至少 12 字元的本機密碼>
BOOTSTRAP_SUPERADMIN_NAME=平台管理員
VERIFY_OPERATOR_PASSWORD=<另一組至少 12 字元的本機驗證密碼>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
APP_ENV=local
LINE_LOGIN_MODE=mock
LINE_MOCK_SIGNING_SECRET=<至少 32 字元的本機隨機值>
LINE_OA_MODE=mock
```

`.env.local` 已被 Git 忽略。不要提交任何實際 key、密碼或 token。

建立第一位 superadmin：

```bash
npm run bootstrap:superadmin
npm run dev
```

- 應用程式：`http://localhost:3000`
- Mailpit：`http://localhost:54324`
- Supabase Studio：`http://localhost:54323`

Bootstrap 預設只接受 `localhost`、`127.0.0.1` 或 `::1` 的 Supabase URL。日常開發與本地驗證不得使用非本機 override。

## 身份與 LINE 本機垂直流程

1. 以 bootstrap 建立的帳號登入 `/login`。
2. 建立扶輪社與第一位執行秘書邀請。
3. 受邀秘書在 `/invite/accept` 明確選擇邀請、設定密碼並完成 Auth 登入。
4. 秘書在社員後台預建姓名、手機、Email、生日，取得只顯示一次的 LINE／Email／QR 邀請連結。
5. 社員以 local LINE mock 或真實 LINE Login 驗證身份。
6. 系統先驗證 invitation、LINE subject 與帳號關係，完成 trusted server binding 後才建立 Supabase session。
7. 社員只確認或補齊已知資料，完成後進入扶輪社首頁。
8. 社長可指派社長、秘書、財務、一般社員角色；角色只對同社 active 社員生效。
9. LINE Login 解綁保留 Person、社籍與歷史，但跨社共用身份只能由平台管理員解除；OA 解綁不影響登入。

陌生 LINE 使用者沒有邀請、也沒有既有 active LINE identity 時，不能自行建立平台帳號。

詳細設定與上線檢查表請見 [V0.3 身份與 LINE 架構](docs/architecture/v03-identity-and-line.md)。

## 活動與報名 MVP

1. 具 `event.manage` 權限的社長、秘書或平台管理員進入 `/events` 建立活動草稿。
2. 活動包含類型、名稱、說明、地點、開始／結束時間、報名截止、名額及是否計入出席率。
3. 發布前資料庫再次確認管理權限、active club、未來的活動與截止時間。
4. active 社員可查看同社已發布活動，選擇參加、不參加或待確認，並填寫攜伴與備註。
5. 名額以社員本人加攜伴計算；資料庫會鎖定活動並在同一交易內防止超額。
6. 活動開始或報名截止後，資料庫拒絕新增及修改報名。
7. 建立、發布、取消與報名更新都寫入 append-only `audit_logs`。
8. 報名的 `(event_id, club_id)` 以 composite foreign key 綁定活動，資料庫本身不能產生跨社報名。
9. 停權帳號、停權社籍與停權扶輪社均不能查看、報名或執行活動管理 mutation。

本切片不包含 QR／GPS 簽到、人工補登與出席率統計；詳細範圍見 [活動報名 MVP 範圍](docs/mvp/EVENT_REGISTRATION_MVP_SCOPE.md)。

## 每社 LINE OA 憑證

真實 OA 模式不得共用一組全平台 token。每個社依社代碼設定獨立環境變數；符號會轉成底線，例如 `TAIPEI-NORTH`：

```dotenv
LINE_OA_MODE=line
LINE_OA_TAIPEI_NORTH_CHANNEL_SECRET=
LINE_OA_TAIPEI_NORTH_CHANNEL_ACCESS_TOKEN=
```

資料庫只保存 environment key 名稱，不保存 secret 或 access token。若兩個社代碼正規化後產生相同 namespace，系統會拒絕同時啟用。

## 驗證

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run verify:db
npm run bootstrap:superadmin
npm run verify:auth
```

`npm run verify:db` 會重建 local database、執行 schema lint，並依序執行：

- `core_identity_baseline.sql`
- `provisioning_security.sql`
- `operator_expiry_consistency.sql`
- `invitation_selection.sql`
- `v03_identity_admin_security.sql`
- `v03_tenant_mutation_security.sql`
- `line_webhook_ingress_limits.sql`
- `message_board_security.sql`
- `message_board_access_hardening.sql`
- `event_registration_security.sql`
- `event_registration_tenant_integrity.sql`
- `event_registration_lifecycle_hardening.sql`

所有 SQL fixture 都包在 transaction 中並於結尾 rollback。驗證範圍包含：

- anonymous、普通帳號與跨社讀寫拒絕
- operator 到期與最後有效 operator 保護
- 邀請明確選擇與 PII 遮蔽
- 瀏覽器無法偽造 LINE subject
- invitation-first callback 與 trusted binding
- active membership／角色一致性
- 跨社共用真人資料與 LINE 解綁保護
- 每社 OA 憑證、webhook 簽章、限流與原子事件 claim
- OA follower 只能配對同社 active 社員
- 留言板 direct table denial、本人編輯、跨社 cursor 與生命週期
- 活動管理權限、跨社隔離、本人報名、名額交易與截止時間
- 活動／報名 immutable ID 與 `(event_id, club_id)` relational tenant integrity
- 活動帳號、社籍與扶輪社 lifecycle gate

`npm run verify:auth` 只使用 local Mailpit 與 local Supabase，驗證密碼登入、邀請接受、冪等與 tenant visibility。

## 安全模型

- `people` 是跨社共用真人身份；`app_accounts` 是登入帳號；`club_memberships` 是各社社籍。
- `anon` 與 `authenticated` 沒有敏感資料表直接 CRUD；應用透過最小授權、固定 `search_path` 的 RPC。
- 社級權限需要 active account 與 active membership；V0.2 operator 還必須位於有效時間區間。
- 角色只能指派給同社 active 社員。
- 普通社級管理員不能修改或解除其他社共用的全域身份。
- 社員邀請只儲存 SHA-256 hash；原始 token 只在建立或旋轉當次回傳。
- LINE OAuth 使用 state、nonce、一次性資料庫交易及 ID token 驗證；身份成功綁定後才建立 session。
- Browser role 無法直接呼叫 trusted LINE binding RPC。
- LINE OA webhook 先以該社 secret 驗證 raw body；無效簽章事件不能占用正式 provider event id。
- 留言板與活動都使用不可變 `club_id`，且 browser roles 無法直接操作底層資料表。
- 活動名額在鎖定活動列的交易中計算，避免並行報名超額。
- 活動報名以 composite foreign key 綁定所屬活動與扶輪社，避免任何未來程式路徑寫入不一致 tenant 資料。
- 活動管理 mutation 需要 active club；停權扶輪社即使保留歷史角色也不能建立、發布或取消活動。
- Excel 匯入先驗證 session 與 permission，再解析 multipart body 和 workbook。
- Service role 只存在 server-only trusted boundary；非本機環境需要兩個明確 production guard。
- 所有 privileged mutation 寫入 append-only `audit_logs`。

詳細資料庫與 provisioning 設計請見 [安全與扶輪社建置設計](docs/architecture/security-and-provisioning.md)。
