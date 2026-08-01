# V0.9 通知送達架構

## 發布 transaction

`publish_club_announcement` 鎖定同社公告，確認 active club、合法狀態與 active audience，然後解析 active account 與 active membership。受眾交集以 account 去重；operator-only、停權、結束社籍與無 active account 的 identity 都不會建立通知。

每個 recipient 建立一筆 `account_notifications`，同一 account 的 announcement deduplication key 唯一。外部 channel 僅在 preference、帳號、社籍、社別與可信任 recipient 條件同時成立時建立 `notification_deliveries`；`(notification_id, channel)` 唯一，避免重複 queue。

## Worker queue

Worker 以 service role 呼叫 bounded RPC：

1. `claim_due_scheduled_announcements` 以 `FOR UPDATE SKIP LOCKED` 取得到期的 scheduled 公告與短 lease。
2. `complete_scheduled_announcement_claim` 在同一可信任邊界發布公告；暫時失敗用 bounded backoff，達 retry ceiling 的 lease 會終態取消並保留 version/audit。
3. `claim_notification_deliveries` 只回傳 delivery id、channel、claim token、idempotency key 與 attempt metadata，不回傳 recipient 或內容。
4. completion 只保存 provider reference 的 SHA-256 hash；failure 只接受 allowlist 的一般化 error code。

有效 lease 不會被第二個 worker claim。過期 lease 可恢復；已耗盡最後一次 lease 的 row 會標記 `failed`，不會永久卡在 processing。`sent` 是 terminal，永不重送。

## Provider boundary

`MockNotificationProvider` 只以 idempotency key 的 hash 產生 deterministic reference，並可指定 deterministic temporary 或 permanent failure。`DisabledNotificationProvider` 永遠不送出，回傳 non-retryable `disabled` 結果。V0.9 沒有 network provider，也不保存 Email、LINE subject、token、recipient identifier 或 provider response body。

## Security properties

- 所有 privileged function 固定 `search_path`，table reference 使用 `public.`。
- Public helper、browser API 與 worker API 的 execute grants 分開列出；worker API 只授權 `service_role`。
- 公告、audience、receipt、notification 與 delivery identity 受到 trigger 保護；歷史資料拒絕 hard delete。
- Audit metadata 僅限一般化 count、狀態與 error code。
