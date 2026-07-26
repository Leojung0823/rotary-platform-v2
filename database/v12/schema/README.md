# V1.2 canonical schema entry

`manifest.txt` 是 V1.2 schema 的單一有序入口。每一行都指向 `database/v12/` 內一份 canonical migration；目前來源依序是：

```text
supabase/migrations/0001_v12_foundation.sql
supabase/migrations/0002_v12_invitation_core.sql
```

Schema SQL 不在本目錄複製。Supabase reset、migration verification、pgTAP、catalog verification 與 generated types 都從 `database/v12/supabase/migrations/` 建立同一份 schema。

Foundation 固定包含 31 張 `public` tables，以及非公開的 `v12_meta.seed_versions` seed version registry。PR-02 只在第二份 migration 加入 Invitation state/security metadata、private helpers 與 service-role-only transactions；RLS policies、Legacy data、Membership lifecycle 與 frontend contract 仍不存在。
