# Staging 部署與社員系統驗收手冊

此文件只適用於測試站。不得在 staging 放入正式社員資料、正式財務資料或 production LINE 憑證。

## 1. 環境隔離

- 使用獨立的 Hosted Supabase staging project。
- 使用獨立的 HTTPS staging 網址。
- `APP_ENV=staging`。
- `TRUSTED_ADMIN_ENVIRONMENT=staging`。
- Runtime `APP_REVISION` 必須是部署中的完整 40 字元 Git SHA。
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
這個提醒就是 `/api/health` 長期顯示的 `DEPLOYMENT_WARNING` 來源（`src/lib/deployment-env.mjs` 的 `STAGING_LINE_OA_IS_MOCK`），屬於預期行為。

區域搬遷（Render 換機房）另見 `RENDER_REGION_MIGRATION.md`。

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
- `STAGING_EXPECTED_CLUB_NAME`：Hosted acceptance 測試社員可查看的測試扶輪社名稱。

Environment secrets：

- `SUPABASE_ACCESS_TOKEN`：只供 Supabase CLI 使用的管理 token。
- `SUPABASE_DB_PASSWORD`：staging project 的資料庫密碼。
- `STAGING_DEPLOY_HOOK`：只觸發 staging service 的 HTTPS POST deployment hook。
- `STAGING_TEST_MEMBER_EMAIL`：staging 專用測試社員帳號。
- `STAGING_TEST_MEMBER_PASSWORD`：staging 專用測試社員密碼。
- `SUPABASE_SERVICE_ROLE_KEY`：只供明確啟用的第一次 staging test-data provisioning steps 使用；後續一般 Go-Live 不會取得此 secret。

必須設定 production inventory：
`PRODUCTION_SUPABASE_PROJECT_REF(S)` 或 `PRODUCTION_SUPABASE_URL(S)` 至少一種。
Go-Live project identity 驗證會拒絕缺少 inventory、格式錯誤或任何相符的 project；值可用逗號或空白分隔。

不要把上述 secret 改成 repository variable，也不要把任何 secret 值放入 `.env.example`。

## 4. 部署平台啟動前檢查

在部署平台的 staging 環境執行：

```bash
npm ci
npm run verify:deployment
npm run build
```

`verify:deployment` 只輸出變數名稱與一般化錯誤，不輸出 credential values。

此 repository 沒有既有 hosting provider 設定。Container host 的 build、start、health、revision 與環境變數 contract 見 [Container staging deployment](./CONTAINER_STAGING.md)。不得為此流程建立或修改 production service。

## 5. GitHub Actions migration release

Workflow：`Staging Release`

此 workflow 只能手動從 `main` 執行，而且只允許 `plan`。所有 job 都引用 GitHub `staging` environment；保護規則通過前，job 不得取得 environment secrets。Migration apply 已移至 `Staging Go-Live`，不能由 plan workflow 繞過 backup、revision、deployment 與 acceptance gates。

### 5.1 先執行 plan

1. 確認 PR 已合併至 `main`。
2. 確認該 `main` commit 的 Quality 與 CI 全部通過。
3. 進入 Actions → Staging Release → Run workflow。
4. Branch 選擇 `main`。
5. `operation` 選擇 `plan`。
6. 通過 `staging` environment 核准後執行。
7. 檢查 workflow summary 中的完整 commit SHA、project suffix 與 migration dry-run 結果，並記錄 workflow run id。

Plan 只執行：

```bash
supabase db push --linked --dry-run
```

Plan 不會套用 migration、不會 reset remote database，也不會載入 seed。

### 5.2 確認備份並執行 Staging Go-Live

只有 plan 結果正確、staging backup/rollback point 已由操作者確認，而且 deployment hook 明確只指向 staging service 時才能執行：

1. 進入 Actions → Staging Go-Live → Run workflow；Branch 必須是 `main`。
2. `expected_sha` 輸入 plan 的完整 40 字元 commit SHA。
3. `plan_run_id` 輸入剛完成的 Staging Release plan run id。
4. `confirmation` 輸入 `LAUNCH-STAGING`。
5. `backup_confirmation` 只有在可用 staging 備份或 rollback point 已確認後才能輸入 `BACKUP-READY`。
6. 核對等待核准的是 GitHub `staging` environment、Hosted Supabase staging project 與 staging deployment service。
7. 核准後，workflow 先驗證 plan API metadata、repository checks 與 Supabase Management API project identity，再依序 link、dry-run、單次 apply、可選的第一次純測試資料 provisioning、POST deployment hook、等待 exact revision、smoke、Hosted browser acceptance。

Management API 回傳的 project ref 與 database hostname 必須符合 `SUPABASE_PROJECT_REF`，project name
必須含 `staging`（不分大小寫），且狀態必須允許連線。API network、401、403、404、格式錯誤、
production identifier 命中或不健康狀態一律 fail closed，response 與 token 不會輸出。

#### 第一次全新 staging

全新 project 尚無 schema，因此測試社團與社員只能在 migration apply 後建立。完成下列順序：

1. 建立名稱含 `staging`、與 production 完全分離的 Hosted Supabase project。
2. 建立並私密保存可用的 backup／logical dump；沒有可用 rollback point 不得繼續。
3. 設定 GitHub `staging` environment variables 與 secrets，包括 `SUPABASE_SERVICE_ROLE_KEY` 與必填的 production inventory。
4. 對合併後的 exact `main` SHA 執行成功的 `Staging Release` plan。
5. 執行 `Staging Go-Live`，除了既有四個 inputs 外設定：
   - `provision_test_data=true`
   - `provisioning_confirmation=PROVISION-STAGING-TEST-DATA`
6. Migration apply。
7. 建立或確認純測試社團與測試社員。
8. 觸發 staging deployment 並等待 exact revision。
9. HTTPS smoke。
10. Hosted member acceptance。

Provisioning 只建立固定名稱 `Staging Test Member` 的純測試身份、active club、active account 與
active membership；不建立 superadmin、operator 或管理角色。Email 必須明確使用 reserved test domain，
不得使用真實姓名、手機或生日。重複執行只確認既有正確資料；identity、tenant、membership 或權限
衝突不會被覆寫或刪除。

#### 後續一般部署

- `provision_test_data=false`
- `provisioning_confirmation` 留空。
- 不建立或修改測試資料。
- Provisioning credential preflight 與 execution steps 都會 skip，`SUPABASE_SERVICE_ROLE_KEY` 不會提供給任何 workflow step。

Plan run 必須來自本 repository 的 `Staging Release` workflow、`operation=plan`、`main`、相同 SHA、結論 success，且建立時間在最近 24 小時內。Fork、PR branch、其他 workflow/repository/SHA 或 apply job 都會被拒絕。只要 `main` 在 plan 後出現新 commit，就必須重新執行 plan。

### 5.3 發布 workflow 的禁止事項

Workflow 的 CI regression guard 會阻擋下列變更：

- remote `db reset`
- `--include-seed`
- Staging Release plan workflow 直接 apply
- Go-Live 未先 dry-run 就 apply
- 取消 staging environment
- 移除 exact SHA、plan run、launch 或 backup confirmation
- 移除 staging Management API project identity verification
- 在未提供 `PROVISION-STAGING-TEST-DATA` 時執行 initial provisioning
- 把 service-role key 放到 job-level env，或提供給 migration、deployment、smoke、Playwright／summary steps
- 把 deployment hook 放進 variable、跟隨 redirect，或把 hook acceptance 當成 deployment success
- 移除 exact revision wait、HTTPS smoke 或 Hosted acceptance

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

## 6b. 對 staging 開啟功能

部署完成不等於社員看得到。多數 flag 預設關閉，而列在 `flagsRequiringExplicitEnable`
（`src/lib/product/feature-flags.ts`）的 key **沒有紀錄時一律視為關閉**，必須明確開啟才會出現。
目前這類 key 是 `announcements_v09`（訊息中心）。

把 `.env.staging.example` 複製成 `.env.staging`（已被 git 忽略），填入三個**非機密**值：

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<staging-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<staging publishable / anon key>
PLATFORM_ADMIN_EMAIL=<staging 平台管理員帳號>
BOOTSTRAP_CONFIRM_SUPABASE_HOST=<staging-project-ref>.supabase.co
```

URL 與 publishable key 是瀏覽器本來就會收到的值，可以從 Supabase 專案的 API 設定或部署平台的
環境變數取得。**不要**把 `PLATFORM_ADMIN_PASSWORD` 寫進這個檔案——留空，腳本會在終端機以隱藏
輸入詢問，密碼因此不會進入檔案、shell 歷史或 process list。

```bash
npm run flags:enable:staging announcements_v09
# 關閉：
npm run flags:disable:staging announcements_v09
```

腳本走的是與其他 rollout 變更同一支受保護 RPC，因此會留下稽核紀錄；它也拒絕把 flag 指向
production 目標。

## 7. 自動 smoke test

Go-Live 等待 exact revision 成功後會自動執行 smoke test。也可以在可信任的管理環境單獨執行：

```bash
STAGING_BASE_URL=https://<staging-domain> \
STAGING_EXPECTED_SHA=<full-40-character-sha> \
npm run smoke:staging
```

檢查項目：

- `/api/health` 回傳 200、環境為 staging、revision 相同、configuration/database 為 true 且 `issues=[]`。
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
