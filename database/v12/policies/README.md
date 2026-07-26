# V1.2 policies boundary

PR-02 不建立或啟用 RLS policy。Invitation transaction function 只 grant `service_role`，`anon` 與 `authenticated` 不可直接執行或存取 Invitation tables。`verification/schema_verification.sql` 仍會在出現任何 `public` policy 時 fail closed，避免越界開始後續 RLS PR。
