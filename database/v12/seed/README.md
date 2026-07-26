# V1.2 seed framework

Seed 檔使用 `<NNN>_<scope>.sql`，依檔名順序執行，必須 deterministic、idempotent、synthetic，且不得包含真人、Auth user、password、token 或 provider secret。

每份 seed 在成功 transaction 內向 `v12_meta.seed_versions` 登記與檔名一致的 stable version。`npm run db:v12:seed:verify` 會連續重跑並驗證版本、固定 system actor、RBAC catalog 與 grants 沒有重複或漂移。
