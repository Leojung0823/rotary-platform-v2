# Staging 部署與社員系統驗收手冊

此文件只適用於測試站。不得在 staging 放入正式社員資料、正式財務資料或 production LINE 憑證。

## 1. 環境隔離

- 使用獨立的 Hosted Supabase staging project。
- 使用獨立的 HTTPS staging 網址。
- `APP_ENV=staging`。
- `TRUSTED_ADMIN_ENVIRONMENT=staging`。
- staging 與 production 不得共用 Supabase project、service role key、LINE Login channel secret、資料庫密碼或 Email provider credentials。
- staging 只建立測試扶輪社與測試社員。
- GitHub release workflow 不會建立 Supabase project、部署網站、設定 DNS 或建立 LINE channel；這些資源必須先由管理者建立。

## 2. 部署平台必要環境變數

部署網站的平台需設定：

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

## 3. 建立 GitHub `staging` environment

在 repository 的 Settings → Environments 建立名稱完全相同的 `staging` environment。

建議保護規則：

- Deployment branches 只允許 `main`。
- 設定 required reviewer。
- 有第二位管理者時啟用 Prevent self-review。
- 不允許未經核准的 workflow 取得 staging secrets。

Environment variables：

- `SUPABASE_PROJECT_REF`：Hosted Supabase staging project reference。
- `STAGING_BASE_URL`：不含路徑的 HTTPS staging origin，例如 `https://staging.example.com`。

Environment secrets：

- `SUPABASE_ACCESS_TOKEN`：只供 Supabase CLI 使用的管理 token。
- `SUPABASE_DB_PASSWORD`：staging project 的資料庫密碼。

不要把上述 secret 改成 repository variable，也不要放入 `.env.example`。

## 4. 部署平台啟動前檢查

在部署平台的 staging 環境執行：

```bash
npm ci
npm run verify:deployment
npm run build
```

`verify:deployment` 只輸出變數名稱與一般化錯誤，不輸出 credential values。

## 5. GitHub Actions migration release

Workflow：`Staging Release`

此 workflow 只能手動執行，而且每次只能選擇 `plan` 或 `apply` 其中一種操作。所有 job 都引用 GitHub `staging` environment；保護規則通過前，job 不得取得 environment secrets。

### 5.1 先執行 plan

1. 確認 PR 已合併至 `main`。
2. 確認該 `main` commit 的 Quality 與 CI 全部通過。
3. 進入 Actions → Staging Release → Run workflow。
4. Branch 選擇 `main`。
5. `operation` 選擇 `plan`。
6. `expected_sha` 與 `confirmation` 留空。
7. 通過 `staging` environment 核准後執行。
8. 檢查 workflow summary 中的完整 commit SHA、project suffix 與 migration dry-run 結果。

Plan 只執行：

```bash
supabase db push --linked --dry-run
```

Plan 不會套用 migration、不會 reset remote database，也不會載入 seed。

### 5.2 再執行 apply

只有 plan 結果正確時才能執行：

1. 再次進入 Actions → Staging Release → Run workflow。
2. Branch 必須仍為 `main`。
3. `operation` 選擇 `apply`。
4. `expected_sha` 貼上 plan 顯示的完整 40 字元 commit SHA。
5. `confirmation` 輸入 `DEPLOY-STAGING`。
6. 核對等待核准的 environment、commit 與操作者。
7. 核准後，workflow 會重新 dry-run；只有 dry-run 成功才會執行 `supabase db push --linked`。
8. Migration 完成後，自動重試 HTTPS staging smoke test，最長約三分鐘。

只要 `main` 在 plan 後出現新 commit，`expected_sha` 就會不一致，apply 會被阻擋，必須重新執行 plan。

### 5.3 發布 workflow 的禁止事項

Workflow 的 CI regression guard 會阻擋下列變更：

- remote `db reset`
- `--include-seed`
- 未先 dry-run 就 apply
- 取消 staging environment
- 移除 exact SHA confirmation
- 移除 apply 後的 HTTPS smoke test

Apply 失敗時不要直接重跑。先確認 Supabase migration history、失敗的 migration 是否已部分執行、staging 備份及 rollback 方式。

## 6. 建立 staging superadmin

Bootstrap 僅允許 local 或經明確 hostname 確認的 staging；production 永遠拒絕。

暫時在可信任的管理環境設定：

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

不得透過 GitHub Actions log、Issue、PR 或聊天傳送 bootstrap 密碼。

## 7. 自動 smoke test

Release workflow 的 apply 成功後會自動執行 smoke test。也可以在可信任的管理環境單獨執行：

```bash
STAGING_BASE_URL=https://<staging-domain> npm run smoke:staging
```

檢查項目：

- `/api/health` 回傳 200、環境為 staging、資料庫正常。
- `/login`、`/forgot-password`、`/status`、`/robots.txt` 可讀取。
- HTTPS security headers 存在。
- staging 有 `noindex` 防護。
- 未登入進入 `/dashboard` 只會導回同源 `/login`。

## 8. 手機人工驗收

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

## 9. 備份與 rollback

在 apply 前記錄：

- staging project reference
- 目前 commit SHA
- 待套用 migration 清單
- 最近一次可用備份時間
- 執行人與核准人

Migration 失敗時：

1. 停止重試及任何資料寫入測試。
2. 保存 workflow run 與 Supabase database log。
3. 確認 remote migration history。
4. 依 migration 的 forward-fix 或 staging backup restore 計畫處理。
5. 不得把 staging 修復指令直接改用在 production。

## 10. 上線前阻擋條件

任一項成立都不得進 production：

- 健康檢查不是 `ok`。
- CI、database verification 或 migration-history guard 未通過。
- staging 仍使用 local Supabase URL 或 HTTP 網址。
- LINE callback 與 `NEXT_PUBLIC_SITE_URL` 不完全一致。
- staging 使用了正式社員資料或 production credentials。
- plan 與 apply 的 commit SHA 不一致。
- 尚未完成手機實機驗收。
- 尚未完成 rollback、備份與責任人確認。
