# Rotary Platform V1.2 Database Style Guide

- 文件狀態：Normative
- 適用範圍：`database/v12/` 的 PostgreSQL／Supabase artifacts
- 不適用：`supabase/migrations/` 內四份 Legacy Migration；它們只能保持不變
- 最後更新：2026-07-22

本指南把 V1.2 database foundation 已採用的模式定為後續 schema、transaction function、RLS、seed、test 與 verification 的共同規範。任何例外必須在 PR 中說明風險、測試與架構核准，不能只以 lint 通過為理由。

## 1. Migration lifecycle

### 1.1 Canonical root

- 現行 canonical root 是 `database/v12/migrations/`。
- D01 若核准獨立 Supabase workdir，canonical root 可在 PR-01 受控搬至 `database/v12/supabase/migrations/`；不得同時維護兩份。
- V1.2 migration 絕不放進 Legacy `supabase/migrations/`。

### 1.2 Filename 與順序

- 格式：`<NNNN>_v12_<scope>.sql`，四位數、單調遞增、lowercase snake_case。
- 現有起點：`0001_v12_foundation.sql`。
- 一個 migration 只服務一個 PR/domain 主題；不要把 foundation、RLS、Edge contract、frontend 相容與 legacy transform 混成一檔。
- 已 merge、已部署至共享環境或已被後續 migration 依賴的檔案視為 append-only；修正以新 migration 完成。
- Legacy 四檔在任何情況下都不可重寫、排序、格式化或更新註解。

### 1.3 Migration envelope

每份一般 migration 應：

```sql
BEGIN;
SET TIME ZONE 'UTC';
SET search_path = public, extensions, pg_catalog;

-- reviewed changes

COMMIT;
```

- 使用明確 schema qualification，即使 migration 已設定 `search_path`。
- 讓語法、constraint 與 catalog 失敗中止整個 migration，不用 catch-and-ignore 隱藏錯誤。
- 不加入 remote project ref、connection URL、credential、psql shell command 或環境判斷。
- 不以 `DROP ... CASCADE`、全表無條件 destructive update 或不可界定目標的 dynamic SQL 解決依賴。
- Down migration 不是預設策略；本機以隔離 DB 重建，staging／production rollback 依已核准 snapshot、forward fix 與 runbook。

## 2. SQL formatting

- SQL keyword 使用 uppercase；schema、table、column、function 與 variable 使用 lowercase snake_case。
- 每層縮排兩個 spaces；一行只表達一個主要 clause，長 column／constraint list 分行。
- `INSERT`、`UPDATE`、`SELECT` 明列 column，不使用 `SELECT *` 作為持久 API／migration mapping contract。
- `JOIN` 必須寫清楚 join condition；不以逗號 join 隱藏 cross join。
- Boolean 使用 `true`／`false`，不使用 `1`／`0` 代替。
- 比較 nullable 值時使用正確的 `IS NULL`、`IS NOT NULL`、`IS DISTINCT FROM` 語意。
- Comment 解釋 invariant、原因與資料語意，不逐字重述 SQL。

## 3. Naming rules

### 3.1 Tables 與 columns

- Table 使用 plural domain noun：`people`、`memberships`、`account_sessions`。
- Column 以 table 的 singular domain prefix 開頭：`membership_status`、`account_session_revoked_at`。
- PK 為 `<entity>_id`；FK 為 `<entity>_<target>_id`，讓 attribution 與 scope 清楚可搜尋。
- Timestamp 使用語意 suffix：`_created_at`、`_updated_at`、`_occurred_at`、`_effective_at`、`_recorded_at`、`_revoked_at`、`_expires_at`。
- Date-only business value 使用 `_on` 或明確名詞，例如 `membership_joined_on`。
- Boolean 使用 `is_`／`has_` 語意，避免 nullable boolean；確有 tri-state 才允許 null 並必須註解。
- Digest、hash、version、scope、provider reference 必須在欄名中明示，不能把 token digest 命名為 `token`。

### 3.2 Database identifiers

所有 public relation、column、function、constraint、index、sequence 與 trigger 名稱不得超過 **55 UTF-8 bytes**。

| Object | Prefix / pattern | Example |
|---|---|---|
| Primary key | `pk_` | `pk_membership` |
| Foreign key | `fk_<source>__<target>` | `fk_memberships__clubs` |
| Unique constraint/index | `uq_` | `uq_memberships__person_club_live` |
| Check constraint | `ck_` | `ck_accounts__status` |
| Exclusion constraint | `ex_` | `ex_club_terms__no_overlap` |
| Non-unique index | `ix_` | `ix_memberships__club` |
| Sequence | `seq_` | `seq_msh__sequence` |
| Trigger | `trg_<table>__<purpose>` | `trg_memberships__updated_at` |
| Trigger function | `set_<entity>_updated_at` 或明確 guard verb | `set_membership_updated_at` |

縮寫只能使用 `database/v12/docs/identifier-naming.md` 已登錄的 domain abbreviation，或在同一 PR 更新該文件、identifier tests 與可讀性理由。不得臨時截字造成不可辨識名稱。

## 4. Types、defaults 與時間

- 業務主鍵預設 `uuid DEFAULT gen_random_uuid()`；只有需要 deterministic global order 的 event／ledger 才使用顯式命名 identity sequence。
- 時間點使用 `timestamptz` 並以 UTC 儲存；顯示時才依 District／Club timezone 轉換。
- 純商業日期使用 `date`，不要用午夜 timestamp 模擬。
- `created_at` 預設 `now()`；mutable table 的 `updated_at` 預設 `now()` 並由 typed trigger 使用 `clock_timestamp()` 更新。
- Event／history／ledger table 不使用一般 `updated_at`；修正以新事件、void、supersede 或專用 redaction 流程記錄。
- 狀態與有限集合預設使用 `text` + named `CHECK`，便於 migration 演進；新增 PostgreSQL enum 必須另有架構理由與 upgrade／rollback 設計。
- 金額若未來出現，使用明確 precision 的 `numeric` 與 currency／unit column，禁止 float。
- `jsonb` 只保存經 allowlist 的 extensible metadata，不承載正式關聯、授權、狀態機、secret 或可獨立正規化的核心欄位。

## 5. Tables、constraints 與 comments

- 每張 table 必須有顯式 named PK。
- 所有業務 invariant 優先以 `NOT NULL`、FK、UNIQUE、CHECK、EXCLUDE 或 partial unique index 表達；不要只依賴 frontend validation。
- FK 預設 `ON DELETE RESTRICT ON UPDATE RESTRICT`。`CASCADE`、`SET NULL` 或 hard delete 需個別資料生命週期理由與行為測試。
- Supabase Auth／外部 provider reference 若屬 weak reference，不建立假 FK；必須有 reconciliation issue／job 與 invariant tests。
- 同一時間只能有一筆 live record 時，使用 partial unique index，明列 live status。
- Snapshot 與 history 必須有一致性 transaction；不得讓 UI 分兩次寫入。
- 每張 table 與每個 column 都要 `COMMENT ON`，說明 domain 意義、資料敏感度或弱參照語意；comment 不包含 secret、真實 ID 或環境資訊。
- Constraint name 與錯誤測試必須可定位 domain；不接受 PostgreSQL 自動產生的冗長、易截斷名稱。

## 6. Index policy

- 每個 FK 都必須進 FK Index Matrix，結果只能是：已有可用 left-prefix index、新增 index、或具理由的 no-index。
- 不因「FK 應該都有 index」盲目建立單欄索引；依 parent lookup、delete policy、RLS helper、query order 與實際 workload 決定。
- Partial index predicate 必須和 live／open／active 的業務定義一致，並有測試防止狀態集合漂移。
- Composite index 的 column order 依 scope、filter、sort 與 selectivity 設計；PR 要列出對應 query／policy。
- 新增、移除或改變 FK／index 時，同步更新 `database/v12/docs/fk-index-matrix.md`、executable verification manifest 與 test。
- Index 與 constraint 名稱同樣受 55-byte limit。

## 7. Functions 與 triggers

### 7.1 Default security

- 一般 function 預設 `SECURITY INVOKER`。
- `SECURITY DEFINER` 只有在需要受控跨 RLS transaction／authorization helper 時使用，且每一支都必須接受安全審查。
- 所有 function 明確設定 fixed `search_path`；privileged function 使用 `SET search_path = ''` 並 schema-qualify 所有 object。
- 建立 function 後先 `REVOKE ALL ... FROM PUBLIC`，再以 allowlist 授予最小角色；helper 不直接 grant 給 client。
- Definer owner、execute grants、volatility、parallel safety 與輸出敏感度必須在 PR inventory 中可見。

### 7.2 Actor 與 scope

- Client-callable function 從 `auth.uid()` 解析目前 Account，不接受 caller 提供 `account_id` 作授權主體。
- 傳入 `club_id`／`district_id` 只是資源定位，function 仍必須依即時 assignment 驗證 scope。
- Suspended／locked／terminal Account 的限制在 server/database enforcement，不依賴 UI。
- Provider callback 若沒有一般 user session，使用明確的 controlled service boundary、最小 function 與可追蹤 actor，不偽造使用者 JWT。

### 7.3 Transaction contract

- Function 名稱使用清楚動詞＋domain，例如 `validate_membership_invitation`、`complete_membership_onboarding`、`revoke_account_session`。
- Input parameter 使用 `p_` prefix；避免模糊 `data jsonb`。必要 JSON input 必須 schema-validate、normalize 並 version。
- 回傳優先使用 typed scalar、composite 或 `RETURNS TABLE`。使用 JSONB contract 時必須有 version／generated type／shape tests，不允許 frontend 自行 cast 猜測。
- Mutation 順序：解析 actor → 驗證 account/scope → 取得 deterministic locks → 驗證 current state → 寫 snapshot/history/audit/idempotency → 回傳安全結果。
- Invitation 固定 lock order：Invitation → Membership → Account。新增流程必須文件化自己的 lock order 並以 concurrency test 證明無漂移／deadlock。
- Function 不呼叫外部 HTTP、LINE、Email、Auth Admin 或 Secret Manager；外部結果由受控 backend 協調並以明確 reconciliation 狀態回寫。

### 7.4 Errors

- 公開 transaction 必須定義穩定 application error code registry；code 以 domain + condition 命名，不能讓 UI 依賴自然語言 message。
- SQLSTATE 應表達資料庫類型；application code 透過受控欄位／detail 傳遞並由 API allowlist mapping。
- Error 不回傳 row existence、其他 tenant ID、PII、digest、provider payload、secret 或 raw SQL context。
- Same-state retry 要明確是 idempotent success、stable conflict 或 stable invalid-state，不能依偶然 constraint message 決定。

### 7.5 Triggers

- Trigger 只處理無法由單一 row constraint 表達、且所有寫入路徑都必須遵守的 invariant。
- `updated_at` 使用每張 table 的 typed trigger function，避免 dynamic SQL 泛用 trigger。
- 跨表業務流程、外部副作用與 audit orchestration 不藏在不可見 trigger chain；使用 transaction function。
- Trigger 名稱、function、觸發時機與測試必須一一對應。

## 8. RLS、roles 與 grants

- 所有 V1.2 public tables 在 PR-04 必須逐表啟用 RLS 並記錄 S/I/U/D 決策；沒有 policy 就是 deny，不以 service role 補洞。
- Policy 使用 server-derived current Account／Person／Membership 與即時 Platform／District／Club assignment。
- Policy helper 避免遞迴讀取同一受保護 relation；以 `EXPLAIN`、timeout 與交叉角色 pgTAP 驗證。
- Catalog read、self read、admin PII read、audit skeleton read、audit payload read 必須是不同能力，不能用一個 `admin` boolean 包辦。
- RLS policy name 必須描述 role/scope/action；`USING` 與 `WITH CHECK` 分別測試。
- `anon`、`authenticated`、service boundary 與 migration owner 的 table/function grants 必須有 catalog inventory 和 CI drift check。
- RLS 放寬屬人工核准事項；修復拒絕問題時不得先新增寬鬆 policy 再補測試。

## 9. Invitation、secrets 與 sensitive data

- Plaintext invitation token 與 HMAC secret 不進 PostgreSQL。
- Database 只接收固定演算法的 digest、key version、expiry、status、scope 與安全 metadata。
- Idempotency request digest 不得包含 plaintext token、password、provider token 或不必要 PII。
- Email、phone、IP、user agent、provider subject、device fingerprint 與 audit payload 都視為敏感資料，依最小必要原則讀寫與測試。
- Log／exception／test output 只能使用 synthetic value，且不得印出 service key、raw webhook body、Auth dump 或真實 remote identifier。
- Secret column 只能存 secret reference 的識別資訊，命名必須包含 `_secret_reference` 或同等明確語意，不得以 `config` 模糊處理。

## 10. Seed、bootstrap 與 data repair

- Seed 必須 deterministic、idempotent、可重跑；使用 `ON CONFLICT` 時仍要驗證既有 row 與預期 invariant 相容。
- Seed 只包含 system actor、system role／permission catalog 與非敏感固定資料，不建立真實 Person、Auth user、Membership、Invitation 或 provider config。
- Bootstrap／repair script 使用 `\set ON_ERROR_STOP on`、明確 psql variables、precondition、transaction 與 fail-closed validation。
- Bootstrap 不建立 Auth user、不接收 password/token、不暴露 client-callable function，且每次授權都要有 actor attribution。
- Data repair 不以關閉 constraint／RLS、刪除 audit 或直接更新不可變 history 作捷徑。

## 11. Tests 與 verification

### 11.1 每個 migration 的最低測試

- 空 database 依序 apply 全部 V1.2 migrations 並 `COMMIT`。
- Seed 連續重跑且結果不重複、不漂移。
- 正向 schema／transaction behavior。
- Constraint、invalid state、cross-tenant、unauthorized 與 terminal-state 負向測試。
- Mutation rollback、retry、same-key conflict 與 concurrency；高風險流程需兩個實際 connection/session。
- RLS 以真實 `anon`／`authenticated` context 與多角色、多 tenant 驗證，不以 owner/service role 結果代替。
- Identifier length、FK index matrix、function grants、policy completeness、secret/token scan 與 orphan detection。

### 11.2 Test style

- pgTAP test 檔使用 `BEGIN`、`SET LOCAL search_path = extensions, public, pg_catalog`、精確 `plan(...)`、`finish()`、`ROLLBACK`。
- Fixture ID 與資料 deterministic、synthetic、易辨識；不依賴執行順序留下的資料。
- `throws_ok` 優先驗證 SQLSTATE／stable application code 與安全結果，不鎖定會變動或洩漏內容的完整 raw message。
- Verification SQL 使用 `\set ON_ERROR_STOP on` 或等價 fail-closed envelope；不只印報表，發現 invariant drift 必須 non-zero fail。
- 每個 test name 描述業務 invariant，不只描述 SQL 操作。

## 12. PR database checklist

每個 database PR 必須在描述中逐項回答：

1. Canonical migration root、檔名、順序與 legacy checksum 是否維持？
2. 新增／修改哪些 table、column、constraint、index、function、trigger、policy、grant、seed？
3. Tenant、actor、PII、secret、Auth weak reference 與 audit 邊界有何影響？
4. Lock order、idempotency、retry、rollback 與 error code 是什麼？
5. FK Index Matrix 與 identifier 55-byte 驗證是否同步？
6. Schema／transaction／RLS／concurrency／negative tests 實際結果為何？
7. 是否有 D01–D20 未決事項；若有，如何 fail closed？
8. Rollback 是 isolated reset、snapshot restore、forward fix 或 traffic disable；為何安全？
9. 是否完全沒有 remote Supabase、真實資料、secret、token 或 destructive production 操作？
