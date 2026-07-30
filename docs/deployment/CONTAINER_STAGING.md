# Container staging deployment

此 repository 沒有既有 Vercel、Render、Railway、Fly.io 或 Cloudflare deployment 設定，因此 staging 使用可移植的 Next.js standalone container。不要另外建立 production deployment，也不要把 production 網域、Supabase project、LINE channel 或資料帶入此流程。

## Image contract

- Base image：Node.js 24 Alpine，多階段 build。
- Runtime：非 root `nextjs` user。
- Listen：`HOSTNAME=0.0.0.0`，`PORT` 預設 `3000`。
- Health：container host 應檢查 `GET /api/health`；只有 HTTP 200 才是 healthy。
- Revision：runtime 必須設定 `APP_REVISION` 為部署的完整 40 字元 Git SHA，`/api/health` 對外只回傳前 12 字元。
- Final image 只含 standalone server、static assets 與 public assets，不含 Git metadata、`.env`、tests、reports 或 Supabase local state。

公開的 `NEXT_PUBLIC_*` 值會在 Next.js build 時固定。建立 staging image 時使用 staging 公開值作為 build args；密碼、token、service-role key、LINE secret 與 deployment hook 絕對不可放入 build args：

```bash
docker build \
  --build-arg APP_ENV=staging \
  --build-arg NEXT_PUBLIC_SITE_URL=https://<staging-host> \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://<staging-project>.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<staging-public-key> \
  -t rotary-platform-v2:staging .
```

Repository 的通用驗證仍可使用不含外部值的要求指令：

```bash
docker build -t rotary-platform-v2:staging .
```

## Runtime configuration

Container host 必須把 staging-only runtime variables 與 secrets 注入執行環境，不得寫入 image、Git 或 deployment hook：

- Variables：`APP_ENV=staging`、`TRUSTED_ADMIN_ENVIRONMENT=staging`、`NEXT_PUBLIC_SITE_URL`、`NEXT_PUBLIC_SUPABASE_URL`、`LINE_LOGIN_MODE=line`、`LINE_OA_MODE`、`APP_REVISION`、`PORT`。
- Public configuration：`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`LINE_LOGIN_CHANNEL_ID`、`LINE_LOGIN_CALLBACK_URL`。
- Secrets：`SUPABASE_SERVICE_ROLE_KEY`、`LINE_LOGIN_CHANNEL_SECRET`；若啟用 LINE OA，另需各測試社專用的 OA secret/token。

`APP_REVISION` 必須來自 container host 的 immutable deployment revision，不可手動填成其他 commit。Start command 是 image 內建的 `node server.js`，不需覆寫。平台的 staging branch 必須是 `main`，deployment hook 也必須只觸發該 staging service。

## Go-live integration

GitHub `staging` environment 的 `STAGING_DEPLOY_HOOK` secret 以 POST 觸發部署。Hook 接受請求只代表排程成功；workflow 仍會等待 `/api/health` 回報相同 SHA、`environment=staging`、configuration/database checks 均通過且 `issues=[]`，之後才執行 smoke 與 Hosted browser acceptance。

若平台不能把 immutable SHA 放入 `APP_REVISION`、不能提供公開 HTTPS health endpoint，或 hook 可能觸發 production，該平台設定不得用於 Go-Live。
