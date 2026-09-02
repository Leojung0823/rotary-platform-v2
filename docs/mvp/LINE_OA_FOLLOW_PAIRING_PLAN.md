# LINE OA follow 事件自動配對社員 企劃書

狀態：`[ ]` 尚未開發　　建立日期：2026-09-02（Asia/Taipei）
預定執行者：**Codex（獨立分支）**　　平行分支：Claude 負責事件驅動自動推播，兩者不共用檔案。

先讀根目錄 `AGENTS.md`。權威來源是 GitHub `Leojung0823/rotary-platform-v2` 的 `main`。

## 1. 現況（已經有的，不要重做）

**follow／unfollow 事件已經有人處理了。** `src/app/api/line-oa/webhook/[clubId]/route.ts` 已經：

- 驗 HMAC-SHA256 簽章、限制 256KB／100 events／120 requests-per-minute；
- 用 `claim_line_webhook_event` 做冪等宣告，重送的同一事件不會重複處理；
- 收到 `follow` 時 upsert `line_oa_followers`（`follower_status='following'`）；
- 收到 `unfollow` 時把 `follower_status` 改成 `'unpaired'` 並寫 `unpaired_at`，**不刪資料列**。

所以本案**不是**「建立 follower 資料列」，那已經在做了。

## 2. 真正的缺口

follow 事件建出來的資料列，`person_id` 與 `app_account_id` 是 **null**。畫面上顯示「未配對」，
幹部必須到 `/clubs/{clubId}/line-oa` 手動輸入 `U...` 開頭的 OA userId 才能對上社員。

這件事很煩而且容易錯：幹部拿不到社員的 OA userId，社員自己也看不到。
結果就是 follower 一直是未配對狀態，**推播對象鎖定（標籤／指定社員）等於失效**——
`resolve_club_audience` 只回傳有配對的 `oa_user_ids`，沒配對的人再怎麼指定都收不到。

## 3. 目標

follow 事件進來時，**在有可信對應的前提下**自動把 follower 對到社員；沒有可信對應就維持未配對，
讓幹部手動處理。

### 可信對應是什麼

LINE 對**同一個 provider 底下的所有 channel 回傳相同的 userId**。本專案的 LINE Login 已經把
登入者的 subject 存在 `line_identities.provider_subject`（`identity_status = 'active'` 唯一）。

所以當 Messaging API channel 與 LINE Login channel 屬於同一個 provider 時：

```
line_oa_followers.oa_user_id  ==  line_identities.provider_subject
```

這是**精確的等值比對，不是猜測**。兩個 channel 不同 provider 時比不中，就自動維持未配對——
天然 fail closed，不需要額外開關去描述 provider 關係。

**不可以**用顯示名稱、頭像、電話或任何模糊比對。比不中就是不配對。

## 4. 明確不做

- 不改推播送出路徑。`src/lib/line/messaging.ts` 與 `src/lib/line/oa-dispatch.ts` **完全不要碰**，
  那是平行分支的工作區。
- 不做事件驅動自動推播。
- 不做 Flex 圖文訊息。
- 不改 `record_line_push`、`resolve_club_audience`、`pair_line_oa_follower`、`unpair_line_oa_follower`
  的簽章與行為。手動配對必須維持現狀可用。
- 不動 LINE Developers Console 或任何 hosted 環境。

## 5. 資料與權限設計

### 新 RPC

```sql
public.auto_pair_line_oa_follower(
  p_line_oa_account_id uuid,
  p_club_id uuid,
  p_oa_user_id text
) returns text     -- 'paired' | 'no_match' | 'already_paired' | 'conflict' | 'disabled'
```

- `security definer`、`set search_path = pg_catalog, public, auth`。
- **只 grant 給 `service_role`**，從 `public, anon, authenticated` 撤銷。
  webhook 是未認證入口，授權完全由這個函式自己負責，參考
  `20260824000900_birthday_wish_collection_scheduler.sql` 的 service-role-only 模式。
- 回傳字串狀態而不是丟例外，讓 webhook 能記錄結果又不中斷其他事件。

### 必須成立的條件（缺一不可，否則回 `no_match`）

1. `line_oa_accounts` 該列存在且 `account_status <> 'disabled'`，且 `club_id` 相符。
2. 存在 `line_identities` 且 `provider_subject = p_oa_user_id` 且 `identity_status = 'active'`。
3. 該 identity 的 `app_account_id` 對應到一個 `people` 列。
4. 該 person 在 **這個社** 有有效社籍（`club_memberships`），停權／退社不算。
5. 目標 follower 列目前 `person_id is null`。**已經配對過的絕對不覆寫**，回 `already_paired`。
6. 唯一索引 `line_oa_followers_one_active_person`（同一個 OA 帳號、同一個 person 只能有一列
   `following`）沒有被違反。撞到就回 `conflict`，不要刪對方的列，留給幹部判斷。

### 冪等

同一個 follow 事件重送時，第 5 條會讓它回 `already_paired`，不會重複寫 audit。
`claim_line_webhook_event` 也已經在外層擋一層。

### Audit

配對成功寫 `audit_logs`，`action_key = 'line_oa.auto_paired'`，`actor_app_account_id` 為 **null**
（系統發起，沒有幹部 actor）。**不要把 OA userId、LINE subject 或任何 token 寫進 metadata**
（`DEVELOPMENT_ROADMAP.md`：audit 不放 LINE subject）。

## 6. Feature flag

`line_oa_auto_pairing_v1`，**預設關閉、缺列時 fail closed**。

> **這個 key 由 Claude 的 `20260902000100_line_oa_push_feature_flags.sql` 宣告，已經在 `main` 上。**
> 一個 flag key 實際上綁死在**六個**地方，Codex **一個都不要碰**：
>
> 1. `platform_feature_flags_feature_key_check` 約束
> 2. `platform_feature_flag_audit_feature_key_check` 約束
> 3. `set_platform_feature_flag` 函式內的 allow-list
> 4. `platform_product_telemetry_payload_is_valid` 裡 `feature_flag_evaluation_failure` 的 key 白名單
> 5. `src/lib/product/feature-flags.ts` 的 `featureFlagKeys`
> 6. 兩個掃描 migration 的測試指向：`product-rollout-db-contract.test.ts` 與
>    `existing-domain-feature-flags-security-boundary.test.ts`
>
> 這六個全部指向「最新宣告 flag 約束的那一份 migration」。兩條分支各自重新宣告的話，
> 後 merge 的一方會靜靜地把對方的 key 從約束裡砍掉，而且它自己的測試只讀自己指到的那份
> migration，不會失敗。**已經由 `20260902000100` 一次處理完，Codex 直接用 key 就好。**

關閉時的行為：webhook 照常建立未配對的 follower 列，就是現在的行為。

## 7. Migration 與 verification

- Migration 檔名：**`20260902000200_line_oa_follow_event_pairing.sql`**（號碼已保留給本案）。
  動手前仍要 `ls supabase/migrations/ | tail` 確認沒有人插隊。
- 新增 `supabase/verification/line_oa_follow_event_pairing_security.sql`，
  並登記進 `scripts/database-verification-files.txt`。

verification 要測「誰不能做什麼」，不只是成功路徑：

- `authenticated` 角色**不能** execute 這個函式（只有 service_role 可以）。
- 外社社員的 identity 不會被配到這一社。
- 停權／退社的 person 不會被配對。
- 已經手動配對的 follower 不會被覆寫。
- `identity_status` 不是 `active` 的 identity 不會被採用。
- flag 關閉時不配對。
- 同一事件重跑不會產生第二筆 audit。

## 8. TypeScript 與測試

- webhook route 在 `follow` 分支、follower upsert **成功之後**呼叫新 RPC。
  RPC 失敗**不可以**讓整個 webhook 回 5xx——follower 列已經建好了，配對失敗只記在
  `line_webhooks.failure_code`，讓 LINE 不要一直重送。
- 單元測試放 `src/app/api/line-oa/webhook/[clubId]/route.test.ts`（已存在同名慣例的檔案可參考
  `src/app/api/auth/line/callback/route.test.ts`）。
- 邊界測試：確保 route 不會把 OA userId 寫進 log 或錯誤回應。

## 9. 驗收條件

1. flag 關閉時，follow 事件的行為與現在完全一樣（建未配對列）。
2. flag 開啟且該社員已用 LINE Login 綁定過：follow 之後後台直接顯示已配對，幹部不用做事。
3. flag 開啟但該社員從未用 LINE Login 登入過：維持未配對，手動配對仍可用。
4. 已配對的 follower 不會因為重新 follow 而被改指到別人。
5. `npm run verify:db` 全過，manifest 覆蓋新檔。
6. **真實 webhook 驗收要等使用者在 LINE Developers Console 設好 webhook URL**，
   這一步不在 Codex 的工作範圍，也不要嘗試去改 Console 設定。

## 10. 與平行分支的邊界

| | Codex（本案） | Claude（事件驅動推播） |
|---|---|---|
| migration | `20260902000200` | `20260902000300` 起 |
| 主要檔案 | `api/line-oa/webhook/[clubId]/route.ts` | `lib/line/oa-dispatch.ts`、公告／活動／生日 server code |
| 共用檔 | `scripts/database-verification-files.txt`（各 append 一行）、`docs/product/TO-DO-LIST.md`（各寫自己的段落） |

`AGENTS.md` §2：**不要對別人的分支 force push，用 merge 不要 rebase。**
