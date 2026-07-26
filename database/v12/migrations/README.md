# V1.2 migration framework

V1.2 唯一 canonical migration root 是相鄰 workdir 的 `../supabase/migrations/`。本目錄只保存 migration framework 說明，不保存 SQL；Legacy `supabase/migrations/` 永久分離且不可修改。

## Naming and ordering

- 檔名：`<NNNN>_v12_<scope>.sql`。
- `NNNN` 為四位數、不可重複、嚴格遞增。
- 每份 migration 使用 `BEGIN;`、`SET TIME ZONE 'UTC';` 與 `COMMIT;` envelope。
- 已進入 review 或被後續 migration 依賴後，只能追加 migration，不回寫歷史。
- `database/v12/schema/manifest.txt` 必須同步列出完整順序。

建立下一份 migration：

```bash
npm run db:v12:migration:new -- <scope>
```

檢查命名、順序、manifest、envelope 與 Legacy checksums：

```bash
npm run db:v12:migrations:verify
```

目前順序為 `0001_v12_foundation.sql` 後接 `0002_v12_invitation_core.sql`。Invitation migration 只增量修改 V1.2 canonical schema；不回寫 Foundation，也不讀取 Legacy migration history。
