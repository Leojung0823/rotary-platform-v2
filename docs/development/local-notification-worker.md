# 本機通知 worker

V0.9 worker 僅可使用 local Supabase。runner 只接受 `localhost`、`127.0.0.1` 或 `::1`，而且 `APP_ENV=production` 永久拒絕。它不是 daemon，也不會無限 loop。

## 準備

依 `.env.example` 在本機建立已忽略的 `.env.local`。不要把任何值貼到聊天、Issue、PR、terminal log 或 commit。只使用 local Supabase URL 與本機 service-role key；不要填入 Hosted Supabase 資訊。

設定以下 local-only 變數名稱：

```dotenv
APP_ENV=local
NOTIFICATION_PROVIDER_MODE=mock
NOTIFICATION_MOCK_BEHAVIOR=success
NOTIFICATION_WORKER_BATCH_SIZE=20
```

`NOTIFICATION_PROVIDER_MODE` 只允許 `mock` 或 `disabled`。`NOTIFICATION_MOCK_BEHAVIOR` 只允許 `success`、`temporary_failure` 或 `permanent_failure`。

## 執行一次 bounded batch

```bash
npm run jobs:announcements
npm run jobs:notifications
npm run jobs:run-once
```

runner 的輸出只有一般化 count。它不輸出公告內容、recipient identity、cookie、環境變數、claim token 或 provider response。

## 本機驗證

先建立 local fixture 的 scheduled announcement，再以 `mock` 跑一次。temporary failure 應進入 retry wait 並使用 bounded backoff；改為 success 後第二次完成。disabled provider 必須保留 non-sent 結果。所有資料庫層 queue／lease／deduplication 測試由 `npm run verify:db` 執行。

Hosted staging、真實 Email、正式 LINE 發送與 production 均不在本文件範圍。
