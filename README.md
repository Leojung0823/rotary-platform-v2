# Rotary Platform V2

扶輪社多租戶管理平台的本機開發版本。此垂直切片完成登入、平台 superadmin、扶輪社建置、執行秘書邀請與接受、多管理員及跨社隔離。它只應連接 Supabase local stack；不包含 staging、Lovable 正式環境或正式資料。

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

## 本機垂直流程

1. 以 bootstrap 建立的帳號登入 `/login`。
2. 在「平台管理」建立扶輪社與第一位執行秘書邀請。
3. 在 Mailpit 開啟邀請信，以受邀者設定密碼並完成 Auth 登入。
4. `/invite/accept` 會依目前 Auth 使用者的已驗證信箱接受邀請；瀏覽器不會取得邀請 token 或 service-role key。
5. 扶輪社啟用後，執行秘書可邀請其他獨立帳號，並只能查看自己管理的社。

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
npm run bootstrap:superadmin
npm run verify:auth
```

`npm run verify:db` 會依序 reset、lint 並執行兩份 verification SQL；若主機沒有 `psql`，會自動使用 local database container。SQL 使用 transaction 並在結尾 rollback，不保留測試資料。`npm run verify:auth` 會建立一個隨機本機社與受邀者，實際驗證 Mailpit template、Supabase Auth、設定密碼、邀請冪等接受及登入後單一社可見性；請在 reset 後執行。

## 安全模型

- `people` 是跨社共用的真人身份；`app_accounts` 是個人登入帳號。
- `club_memberships` 只包含真正社友；執行秘書只存在於 `club_operator_permissions`。
- 有效社籍與有效執行秘書權限在全平台互斥，資料庫 trigger 雙向阻擋。
- 所有資料表啟用 RLS，`anon` / `authenticated` 沒有直接 table CRUD；應用只使用最小授權 RPC。
- privileged RPC 具有固定 `search_path`，從 `auth.uid()` 推導 caller，並在每個社級操作驗證 `club_id`。
- 所有 privileged mutations 寫入 append-only `audit_logs`；撤銷只改狀態並保留歷史。
- 啟用中的社，普通社級管理員不能撤銷最後一位有效執行秘書。

詳細設計請見 [docs/architecture/security-and-provisioning.md](docs/architecture/security-and-provisioning.md)。
