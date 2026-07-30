# Staging 部署與社員系統驗收手冊

此文件只適用於測試站。不得在 staging 放入正式社員資料、正式財務資料或 production LINE 憑證。

## 1. 環境隔離

- 使用獨立的 Hosted Supabase staging project。
- 使用獨立的 HTTPS staging 網址。
- `APP_ENV=staging`。
- `TRUSTED_ADMIN_ENVIRONMENT=staging`。
- staging 與 production 不得共用 Supabase project、service role key、LINE Login channel secret 或 Email provider credentials。
- staging 只建立測試扶輪社與測試社員。

## 2. 必要環境變數

部署平台需設定：

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<staging-project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<staging publishable key>
SUPABASE_SERVICE_ROLE_KEY=<staging service role key>

NEXT_PUBLIC_SITE_URL=https://<staging-domain>
APP_ENV=staging
TRUSTED_ADMIN_ENVIRONMENT=staging

LINE_LOGIN_MODE=line
LINE_LOGIN_CHANNEL_ID=<staging LINE Login channel id>
LINE_LOGIN_CHANNEL_SECRET=<staging LINE Login channel secret>
LINE_LOGIN_CALLBACK_URL=https://<staging-domain>/api/auth/line/callback

LINE_OA_MODE=mock
```

`LINE_OA_MODE=mock` 在 staging 只會產生提醒；production 不允許使用 mock。

不要把任何實際值寫入 Git、PR、Issue、截圖或聊天訊息。

## 3. 部署前檢查

在部署平台的 staging 環境執行：

```bash
npm ci
npm run verify:deployment
npm run build
```

`verify:deployment` 只輸出變數名稱與一般化錯誤，不輸出 credential values。

## 4. Migration

1. 先確認 staging project reference 正確。
2. 先備份 staging database。
3. 核對 migration history，禁止修改已合併的舊 migration。
4. 對 staging project 執行 migration。
5. 不在 production 執行本階段 migration。

## 5. 建立 staging superadmin

Bootstrap 僅允許 local 或經明確 hostname 確認的 staging；production 永遠拒絕。

暫時設定：

```dotenv
BOOTSTRAP_SUPERADMIN_EMAIL=<staging admin email>
BOOTSTRAP_SUPERADMIN_PASSWORD=<one-time strong password>
BOOTSTRAP_SUPERADMIN_NAME=<display name>
BOOTSTRAP_CONFIRM_SUPABASE_HOST=<exact staging Supabase hostname>
```

執行：

```bash
npm run bootstrap:superadmin
```

完成後立即移除：

- `BOOTSTRAP_SUPERADMIN_PASSWORD`
- `BOOTSTRAP_CONFIRM_SUPABASE_HOST`
- 不再需要時一併移除其他 bootstrap variables

## 6. 自動 smoke test

部署完成後，在可信任的管理環境執行：

```bash
STAGING_BASE_URL=https://<staging-domain> npm run smoke:staging
```

檢查項目：

- `/api/health` 回傳 200、環境為 staging、資料庫正常。
- `/login`、`/forgot-password`、`/status`、`/robots.txt` 可讀取。
- HTTPS security headers 存在。
- staging 有 `noindex` 防護。
- 未登入進入 `/dashboard` 只會導回同源 `/login`。

## 7. 手機人工驗收

至少以一台 iPhone Safari 與一台 Android Chrome 驗證：

- 登入頁不橫向溢出，鍵盤彈出後仍可操作。
- LINE Login 可回到正確 staging callback。
- Email 邀請可建立平台密碼並接受邀請。
- 忘記密碼與重設密碼流程完整。
- 社員名冊搜尋、社員詳細頁與隱私欄位正確。
- 會員中心可修改姓名、手機、Email、生日與隱私設定。
- LINE 綁定、解除、重新綁定流程完整。
- 暫停社籍後，舊頁面重新整理即失去該社權限。
- 暫停帳號後，所有裝置無法繼續進入受保護頁面。
- 登出按鈕不與瀏覽器或開發工具浮動元件重疊。

## 8. 上線前阻擋條件

任一項成立都不得進 production：

- 健康檢查不是 `ok`。
- CI、database verification 或 migration-history guard 未通過。
- staging 仍使用 local Supabase URL 或 HTTP 網址。
- LINE callback 與 `NEXT_PUBLIC_SITE_URL` 不完全一致。
- staging 使用了正式社員資料或 production credentials。
- 尚未完成手機實機驗收。
- 尚未完成 rollback、備份與責任人確認。
