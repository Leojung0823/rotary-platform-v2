# Rotary Platform V1.2 Database and Invitation Core

`database/v12/` 是 V1.2 的完整獨立 Supabase workdir。它不讀取或執行 Legacy `supabase/migrations/`，不接受 linked project、access token、任意 project id、任意 database URL 或任意 port。

## 快速開始

```bash
npm run db:v12:start
npm run db:v12:verify
npm run db:v12:stop
```

`db:v12:verify` 會驗證 migration framework 與 Legacy checksums，從空資料庫 reset，連續重跑 seed，執行全部 pgTAP、concurrent same-key Create、RPC role/bypass boundary、non-consuming Validate、Invitation Edge HMAC/timeout 測試、schema／constraint／seed／migration／Invitation／identifier／FK verification、DB lint、generated types drift 與 security/decision scan。

## Canonical schema 與 migration

- Schema 唯一入口：`schema/manifest.txt`。
- 唯一 SQL source：`supabase/migrations/*.sql`。
- Foundation migration：`supabase/migrations/0001_v12_foundation.sql`。
- Invitation Core migration：`supabase/migrations/0002_v12_invitation_core.sql`。
- 命名：`<NNNN>_v12_<scope>.sql`，四位數嚴格遞增。
- Migration README：`migrations/README.md`。
- 新 migration helper：`npm run db:v12:migration:new -- <scope>`。
- Framework verification：`npm run db:v12:migrations:verify`。

`database/v12/migrations/` 舊路徑不再保存 SQL，避免與 Supabase workdir 產生第二份 schema truth。

## Workdir 隔離

| Boundary | Legacy | V1.2 |
|---|---|---|
| Config root | `supabase/config.toml` | `database/v12/supabase/config.toml` |
| Project id | `rotary-platform-v2` | `rotary-platform-v12` |
| Migration history | Legacy four-file root | V1.2 canonical migration root |
| API / DB / shadow | 54321 / 54322 / 54320 | 55321 / 55322 / 55320 |
| Studio / Inbucket | 54323 / 54324–54326 | 55323 / 55324–55326 |
| Analytics / Edge inspector | Legacy/default | 55327 / 8183 |
| Auth site URL | `localhost:3000` | `127.0.0.1:3100` |

Supabase CLI 以不同 `project_id` 建立 V1.2 專用 Docker containers、network、database volume、Auth、REST、Realtime、Storage、Edge Runtime 與 migration history。Start/stop/reset wrappers 固定 `--workdir database/v12`；所有 runtime wrapper 會再次驗證 config、project id、ports、linked state、access token 與實際 DB container port。

## 目錄責任

- `supabase/`：獨立 config 與唯一 canonical migration root。
- `migrations/`：migration naming、ordering、helper 與 verification 說明；不保存第二份 SQL。
- `schema/`：machine-readable canonical schema manifest 與 schema specification entry。
- `functions/`：Invitation transaction function 與 trusted Edge boundary 說明。
- `policies/`：RLS boundary；PR-02 仍明確要求 zero policy。
- `seed/`：有版本、可重跑的 system actor／RBAC seed。
- `shared/`：pgTAP shared assertions 與 deterministic synthetic fixtures。
- `tests/`：bootstrap 加 transaction／rollback pgTAP tests，包含 Invitation rotation、non-consuming validation 與 idempotency 行為。
- `verification/`：會 fail closed 的 schema、constraint、seed、migration、Invitation、identifier 與 FK checks。
- `generated/`：只由 CLI 生成、CI 比對 drift 的 `database.types.ts`。
- `scripts/`：固定 local target 的 start/stop/reset/seed/test/lint/types/verify wrappers。
- `bootstrap/`：受控且非 client-callable 的第一位真人管理員程序。

## Seed framework

一般 reset 會依 `seed/*.sql` 的檔名順序執行 seed；每份 seed 在成功 transaction 內登記 `v12_meta.seed_versions`。Seed 只建立 deterministic non-login system actor、roles、permissions 與 grants，不建立 Person、human Account、Auth user、Membership、Invitation 或任何 token/secret。

```bash
npm run db:v12:reset        # 空資料庫重建並執行 seed
npm run db:v12:seed         # 對目前 V1.2 DB 安全重跑 seed
npm run db:v12:seed:verify  # 連續重跑並驗證 catalog/version 無漂移
```

## Generated types

Canonical output 是 `generated/database.types.ts`，只包含 V1.2 `public` schema：

```bash
npm run db:v12:types
npm run db:v12:types:check
```

Generated file 禁止人工修改。`types:check` 會從正在執行的獨立 V1.2 stack 重新產生至 temporary file，再進行 byte-for-byte 比對。

## Bootstrap actor 與首位真人管理員

一般 seed 的固定 system actor 沒有 Person、Auth user、Identity 或 Session。第一位真人 Platform Admin 不由 seed 偽造；受控操作者必須先在同一 V1.2 local Supabase Auth 建立並驗證使用者，再執行：

```bash
docker exec -i supabase_db_rotary-platform-v12 \
  psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -v auth_user_id='REPLACE_WITH_EXISTING_AUTH_USER_UUID' \
  -v chinese_name='REPLACE_WITH_VERIFIED_NAME' \
  -v english_name='' \
  < database/v12/bootstrap/first_platform_admin.sql
```

Bootstrap 不建立 Auth user、不接收 password/token，也不暴露 database function 或 client RPC。

## Invitation Architecture

Trusted Edge Function 是唯一接觸 plaintext token 與 Supabase Secret 的邊界。Runtime 必須設定 `INVITATION_HMAC_CURRENT_KEY_VERSION`、逗號分隔的 `INVITATION_HMAC_ACCEPTED_KEY_VERSIONS`，以及每個 allowlisted version 對應的 `INVITATION_HMAC_SECRET_V<version>`。Secret 必須是 canonical Base64url、解碼後至少 32 bytes；current version 必須位於 accepted set，accepted set 最多四版。任一設定遺漏、重複、不合法或 secret 過短時 worker fail closed，程式沒有 fallback。Edge 用 32-byte CSPRNG nonce 建立固定欄位順序的 canonical versioned payload，對完整 envelope 做 HMAC-SHA-256 簽章，再以不同 domain separator 對完整 token 做 HMAC-SHA-256 storage hash。PostgreSQL 只接收 32-byte `token_hash`、key/token version、nonce、issued/expiry metadata；不接收 token 或 secret。

公開 transaction functions 全部是 `SECURITY DEFINER SET search_path = ''`，且只有 `service_role` 可以執行。Create、Resend、Revoke 從經 Supabase Auth 驗證的 UUID 反查 Account 與當下 `invitation.manage` 權限。Validate 要求 JWT 驗證後的 Auth UUID，但不接受 body 傳入 `auth_user_id`／`account_id`／`person_id`，也不建立 Account、Identity 或永久 binding。`idempotency_actor_auth_user_id` 只作有期限的 retry scope，不是 ownership 或 binding 證據。PR-02 authentication 只證明誰提出 validation request；final invitation ownership 只能由 PR-03 onboarding transaction 建立。

## Invitation Flow and Sequence

```text
Create -> Manual Out-of-Band Delivery -> Authenticated Validate / Preflight
       -> PR-03 Atomic Onboarding + Final Accept

Create/Resend: verified Auth JWT -> Edge issues current-version HMAC token
               -> service_role transaction stores hash/metadata -> token returned once

Validate: verified Auth JWT + bearer token + idempotency key
          -> Edge verifies canonical HMAC payload and calls validate_membership_invitation
          -> private helper compares a read-only snapshot and returns minimal context
          -> status stays pending; accepted/consumed/Auth binding remain unchanged
```

Validation success is not acceptance and does not reserve the Invitation。Validate 不消耗 token、不寫 `accepted`／`consumed_at`、不保留跨 request lock；PR-03 final transaction 必須重新 lock Invitation → Membership → Account，重新驗證 token、expiry 與 Auth 相容性，再將完整 onboarding、accepted/consumed、event、audit、idempotency 一次 commit。任何 failure 全部 rollback，Invitation 保持 retryable pending。

PR-02 只寫 Created、Delivery Handoff、Validated、Expired、Revoked 與 allowlisted validation failure audit skeleton；不產生 Accepted、final consumed 或 onboarding completed event。`delivery_handoff` 只表示 plaintext token 已在成功 Create／Resend 回應中一次性交回授權管理者供人工帶外傳遞，不代表 provider delivery、Invitee receipt 或 acceptance。`INVITATION_REPLAY` 僅是 PR-03 reserved error，重複 Validate 不回 final replay。Audit 不含 token、hash、nonce、HMAC key、secret 或 destination。D03 已定案為 `manual_link` Manual Out-of-Band Delivery；Email、SMS、LINE Login、LINE OA automated delivery 全部 Deferred。Create/Resend 的同 key retry 回原 result，但 `token_available=false`、`token=null`、`expires_at=null`；首次回應遺失時須以新 Resend key rotation，舊 token hash 立即失效。Token 最長七天，允許 issued-at 最多五分鐘 future skew。

Validate idempotency不保存 positive eligibility snapshot。Request fingerprint包含 operation、Invitation ID、可信 Auth UUID、HMAC storage hash、token/key version及 issued/expiry metadata；不包含 plaintext token、signature、nonce、secret、Authorization 或 destination。Invitation state/version不凍結進 fingerprint，而是在每次 retry 直接讀取 live row並以 Database Time檢查：未變時回相同 `validated_at`，revoke／resend／expiry／terminal state變更後同 key fail closed。API 欄位 `is_idempotent_retry` 只表示 request idempotency retry，不表示 Invitation 已消耗或 final acceptance replay。

Validate 對 effective expiry 只以 Database Time判定，不持久化 `pending → expired`，因此 repeated Validate沒有 lazy-transition side effect。Resend與Revoke是明確 mutation流程；遇到 effective expired Invitation時拒絕原操作並 materialize `expired`／`marked_expired_at`及對應 event。

### HMAC key rotation runbook

1. 在 secret manager 先建立下一版 `INVITATION_HMAC_SECRET_V<n>`，不得把 secret 寫入 repository、migration、log 或指令輸出。
2. 將 accepted set 設為舊版與新版、current 設為新版，讓所有 issuing worker 只簽新版而 verifier 精準按 token header 取一把 allowlisted key；部署前以 Edge tests 驗證設定。
3. 保留舊版至少最長 token TTL 七天、五分鐘 clock skew 與部署重疊時間；期間不得從 accepted set 移除。
4. 確認舊 token window 結束後，先從 accepted set 移除舊版並部署，再由 secret manager 移除舊 secret。需要 rollback 時，僅在舊 secret 尚受控保存且仍在安全 window 內，才可暫時把舊版放回 accepted set/current。

PR-02 Edge 未配置瀏覽器 CORS，也未宣告 provider delivery；這是刻意 fail-closed 的 server-only 狀態。`POST`／JSON／16 KiB body／4096-character token／JWT／no-store／safe error 與 5-second internal fetch timeout 已實作。Distributed rate limit and abuse control: **Deferred**；它是 validate／accept 對 staging 或 production 公開前的 Release Gate，不以單一 worker memory counter 冒充完成。因本輪不部署，Deferred 不阻擋 PR-02 human review。

### Token response-loss recovery

正式恢復契約固定為：Lost Create Response → Retry does not reveal token → Authorized Resend with new idempotency key → Old token invalid → New token delivered manually。相同 Create idempotency key 的 retry 只回原 Invitation reference，`token=null`、`token_available=false`、`expires_at=null`，不產生第二筆 Invitation，也不重新揭露第一次 plaintext token。授權管理者必須使用新的 Resend idempotency key 旋轉全新的 nonce、storage hash、issued/expiry 與 token metadata；相同 Resend key 的 retry 同樣不重新揭露 token。Database、Audit、Invitation Event 與 log 永遠不得保存 plaintext token。

### Distributed Rate Limit release gate

- Status: **Deferred — Release Gate**。
- Distributed Rate Limit 尚未實作；PR-02 不得宣稱 Rate Limit 已完成，也不得用單一 Edge Worker memory counter 冒充完成。
- Validate 與未來 Accept 在 Gate 完成前不得公開部署至 Public Staging 或 Production。
- Local development 與 CI verification 不算 Public Exposure；此 Deferred gate 不阻擋 local tests、CI tests 或 PR-02 Human Review。
- Rate Limit 技術選型尚未決定；本輪不指定 Redis、Upstash、PostgreSQL 或 Gateway。
- Automated Delivery 仍為 Deferred，沒有標示為 Complete。

D04 已定案：Legacy SHA-256 pending token 不遷移、不接受，compatibility verifier 不存在，也沒有雙格式 fallback。Cutover 必須撤銷／失效 Legacy pending token，再由授權管理者 reissue 全新的 V1.2 HMAC token。

## PR-02 scope boundary

目前完成 Database Foundation 與 Invitation Core：create/resend/validate/revoke、HMAC token、expiry validation、rotation、idempotency、safe errors、audit skeleton、pgTAP、verification 與 CI。PR-02 沒有 final acceptance、consumption、replay enforcement、onboarding、RLS、frontend、LINE、Identity/Auth Binding、Person Match、資料搬移或 remote deployment。

PR-03 才會實作 Membership lifecycle 與完整 atomic onboarding/final acceptance。既有 pending Membership 在 PR-02 只作為 Invitation target；final accept、double accept、accept replay、accept-vs-accept/resend/revoke、onboarding rollback 與 accepted Auth binding 測試必須在 PR-03 移植，不得由 PR-02 CI 模擬。
