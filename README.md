# Rotary Platform V2

扶輪社多租戶管理平台的本機開發版本。V0.3 完成 invitation-first 身份核心：LINE Login、社員確認加入、資料驅動 RBAC、秘書後台、LINE OA 獨立管理、裝置與登入紀錄、RLS、audit log 及版本化 API。它只應連接 Supabase local stack；不包含 staging、Lovable 正式環境或正式資料。

## 需求

- Node.js 24+
- Docker Desktop
- Supabase CLI（專案可透過 `npx supabase` 使用）
- PostgreSQL `psql`（可選；若未安裝，整合驗證會使用 Supabase Docker container 內的 `psql`）

## 第一次啟動

```bash
npm install
npx supabase start
npx supabase db reset --local
npx supabase status -o env
cp .env.example .env.local
```

從 `supabase status -o env` 將本機 `API_URL`、`ANON_KEY`、`SERVICE_ROLE_KEY` 分別填入：

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

建立第一位 superadmin（可重複執行）：

```bash
npm run bootstrap:superadmin
npm run dev
```

- 應用程式：[http://localhost:3000](http://localhost:3000)
- Mailpit：[http://localhost:54324](http://localhost:54324)
- Supabase Studio：[http://localhost:54323](http://localhost:54323)

Bootstrap 預設只接受 `localhost`、`127.0.0.1` 或 `::1` 的 Supabase URL，遇到非本機 URL 會 fail closed。日常開發與本 Issue 驗證不得使用非本機 override。

## V0.3 本機垂直流程

1. 以 bootstrap 建立的帳號登入 `/login`。
2. 在「平台管理」建立扶輪社與第一位執行秘書邀請。
3. 在 Mailpit 開啟邀請信，以受邀者設定密碼並完成 Auth 登入。
4. `/invite/accept` 會依目前 Auth 使用者的已驗證信箱接受邀請；瀏覽器不會取得邀請 token 或 service-role key。
5. 在社員後台預建姓名、手機、Email、生日，取得只顯示一次的 LINE／Email／QR 邀請連結。
6. 社員以 local LINE mock（或已設定的 LINE Login）驗證身份，只確認或補齊已知資料，完成後直接進入扶輪社首頁。
7. 社長可指派社長、秘書、財務、一般社員角色；秘書可管理社員、邀請、LINE Login 解綁與 OA，財務只有讀取範圍。
8. LINE Login 解綁會保留 Person、社籍、登入與稽核歷史，撤銷全部 Supabase session 並旋轉一個重新綁定邀請；OA 解綁不影響登入。

LINE Login 與 LINE Official Account 的設定、mock 限制、API 路徑及上線檢查表請見 [V0.3 身份與 LINE 架構](docs/architecture/v03-identity-and-line.md)。

## 驗證

```bash
npm run lint
npm run typecheck
npm test
npm run build
npx supabase db reset --local
npx supabase db lint --local
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/verification/core_identity_baseline.sql
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/verification/provisioning_security.sql
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/verification/v03_identity_admin.sql
npm run bootstrap:superadmin
npm run verify:auth
```

`npm run verify:db` 會依序 reset、lint 並執行全部 verification SQL；若主機沒有 `psql`，會自動使用 local database container。SQL 使用 transaction 並在結尾 rollback，不保留測試資料。V0.3 SQL 另驗證 token hashing、跨社隔離、RBAC、LINE bind/unbind、OA 分離、裝置、偏好與 audit log。`npm run verify:auth` 會建立一個隨機本機社與受邀者，實際驗證 Mailpit template、Supabase Auth、設定密碼、邀請冪等接受及登入後單一社可見性；請在 reset 後執行。

## 安全模型

- `people` 是跨社共用的真人身份；`app_accounts` 是個人登入帳號。
- `club_memberships` 只包含真正社友；執行秘書只存在於 `club_operator_permissions`。
- 有效社籍與有效執行秘書權限在全平台互斥，資料庫 trigger 雙向阻擋。
- 所有資料表啟用 RLS，`anon` / `authenticated` 沒有直接 table CRUD；應用只使用最小授權 RPC。
- privileged RPC 具有固定 `search_path`，從 `auth.uid()` 推導 caller，並在每個社級操作驗證 `club_id`。
- 所有 privileged mutations 寫入 append-only `audit_logs`；撤銷只改狀態並保留歷史。
- 啟用中的社，普通社級管理員不能撤銷最後一位有效執行秘書。
- 社員邀請只儲存 SHA-256 token hash；原始 token 僅在建立或旋轉當次回傳。
- LINE OAuth 使用 state、nonce、一次性資料庫交易與 ID token 驗證；LINE access/refresh token 不寫入資料庫。
- LINE OA webhook 在解析／處理前驗證 raw body HMAC；OA follower 與 Login identity 使用不同資料表與解除流程。
- Service role 只存在 server-only trusted boundary；非本機環境必須同時明確設定兩個 production guard 才能建立 admin client。

詳細設計請見 [docs/architecture/security-and-provisioning.md](docs/architecture/security-and-provisioning.md)。
