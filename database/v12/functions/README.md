# V1.2 Invitation function boundary

Canonical SQL 只存在 `supabase/migrations/0002_v12_invitation_core.sql`。PR-02 建立四個 public functions：

- `create_membership_invitation`
- `resend_membership_invitation`
- `validate_membership_invitation`
- `revoke_membership_invitation`

它們固定空 `search_path`、採 `SECURITY DEFINER`、只 grant `service_role`。Create／Resend／Revoke 由 trusted Auth UUID 反查 Account 與 `invitation.manage`；Validate 的 Auth UUID 也只能由 JWT/Auth context 取得，request body 不接受 Auth／Account／Person ID。

Edge 先以 request JWT 呼叫 Supabase Auth `/auth/v1/user` 取得可信 Auth UUID，再以 server-only `service_role` 呼叫 Public RPC。一般 `anon`／`authenticated` client 沒有 RPC `EXECUTE`，也沒有 Invitation table 權限，因此不能繞過 Edge HMAC。Validate RPC 只接收 HMAC-derived storage hash、token/key version、issued/expiry metadata、request idempotency資料與可信 actor UUID；不接收 plaintext token、signature、nonce、secret、Authorization、Account ID 或 Person ID。

`v12_invitation.validate_token_snapshot` 是 owner-only、fixed-path、read-only private primitive。它不 lock、不 reservation、不修改 Invitation，也不建立 onboarding data。未來 PR-03 caller 必須在同一 transaction 依 Invitation → Membership → Account 重新 lock 與驗證，再原子完成 onboarding、accepted/consumed、event、audit 和 idempotency。

Edge source 位於 `supabase/functions/`。Create/Resend 只用 current key 發出 canonical HMAC token；Validate 只按 token header 解析 allowlisted key version並驗證 HMAC。Supabase Secret 沒有預設值，也不寫入 DB、migration、seed、event 或 log。DB delivery boundary 只接受 `manual_link` 與 null destination。

Validation success is not acceptance and does not reserve the Invitation。Final acceptance、Person/Account/Identity binding、Membership onboarding、automated delivery 與 distributed rate limit 不在 PR-02。

Validate idempotency只避免重複業務 side effect；每次 retry 都重新讀取目前 Invitation token metadata、terminal state 與 Database Time。Invitation 維持不變時，同 key 可回原 `validated_at`；revoke、resend、expiry 或其他 terminal transition 後，同 key 會 fail closed，不回舊 positive eligibility。`is_idempotent_retry` refers only to request idempotency and does not indicate invitation consumption or final acceptance replay.

Create／Resend 成功時 plaintext token 只在 Edge memory 與成功 response 出現一次。`delivery_handoff` Audit event只代表 token 已交回授權管理者供 Manual Out-of-Band Delivery，不代表 Invitee 已收到或接受；event/audit/idempotency/log/telemetry/error/destination 都不得保存 token。
