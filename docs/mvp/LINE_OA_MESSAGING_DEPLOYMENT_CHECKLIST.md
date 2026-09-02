# LINE OA 訊息推播（Messaging API）部署檢查表

這份檢查表只涵蓋 **LINE Official Account 的訊息推播**。LINE Login 是另一個 channel、另一組憑證，
見 [`LINE_LOGIN_DEPLOYMENT_CHECKLIST.md`](./LINE_LOGIN_DEPLOYMENT_CHECKLIST.md)。兩者不共用 secret。

目前狀態：程式已可接上真實 Messaging API，但**尚未取得 channel access token 與 channel secret**，
staging 仍是 `LINE_OA_MODE=mock`。本文件描述的是憑證到位後要走的步驟，不代表已經完成。

## 憑證與環境變數

每個扶輪社讀自己的環境變數，key 由 club code 正規化而來：

```text
LINE_OA_<CLUB_CODE>_CHANNEL_ACCESS_TOKEN
LINE_OA_<CLUB_CODE>_CHANNEL_SECRET
```

`<CLUB_CODE>` 是 `club_code` 轉大寫、非英數字換成底線。實際值以資料庫
`line_oa_accounts.access_token_env_key` 與 `webhook_secret_env_key` 為準，不要憑印象拼。

- [ ] channel access token 與 channel secret 取自**同一個 Messaging API channel**。
- [ ] 兩者都只放在 server 的 secret store，**沒有** `NEXT_PUBLIC_` 前綴。
- [ ] 沒有寫進 repo、build args、PR 說明或訊息紀錄。
- [ ] `LINE_OA_MODE=line`。設為 `line` 時 `inspectDeploymentEnvironment` 會要求上述兩個變數成對存在
      且長度合理，缺一個就會讓 `/api/health` 的 `checks.configuration` 變成 false。
- [ ] `NEXT_PUBLIC_SITE_URL` 是公開的 HTTPS origin。真實模式**拒絕**從 `localhost`／`127.0.0.1` 送出，
      避免開發機把真實訊息送給真實社員。

## LINE Developers Console

依 `AGENTS.md` 第 2 節，**更動 LINE channel 設定需要事先取得使用者同意**，代理不可自行操作。

- [ ] Webhook URL 設為 `<NEXT_PUBLIC_SITE_URL>/api/line-oa/webhook/<clubId>`（`clubId` 是該社的 UUID）。
- [ ] Use webhook 開啟。
- [ ] 「自動回覆訊息」與「加入好友的歡迎訊息」依產品決定開關；平台本身不依賴它們。
- [ ] Console 上的 webhook verify 通過（server 會用該社 secret 對原始 request body 驗 HMAC-SHA256）。

## 上線前的行為確認

- [ ] `/clubs/<clubId>/line-oa` 的模式徽章顯示「LINE Messaging API」而不是「Local Mock」。
- [ ] `/api/health` 的 `issues` 為空，且 `warnings` 不再包含由 `STAGING_LINE_OA_IS_MOCK` 產生的
      `DEPLOYMENT_WARNING`（staging 用 mock 時它是預期警告）。
- [ ] 用測試 follower 送一則訊息：實際收到、推播紀錄狀態為 `sent`、有 provider request id。
- [ ] 指定標籤或社員送出時，只有該對象中**已加入官方帳號**的人收到；對象中沒有人配對時
      畫面回報「指定的對象中沒有人加入官方帳號」，不會誤記成送出 0 人。
- [ ] 故意用錯誤的 access token 送一次：畫面顯示憑證被拒絕，推播紀錄的 `failure_code` 是
      `credentials_rejected`，而不是籠統的 `provider_error`。

## 已知的限制與行為

- **multicast 每批最多 500 個 userId。** 超過會自動分批；其中一批失敗時整體狀態記為 `failed`，
  但 `payload_summary` 會保留 `batch_count`／`sent_batch_count`／`delivered_recipient_count`，
  所以「部分送達」讀得出來。`line_push_logs.delivery_status` 只允許
  `queued`／`sent`／`failed`／`mocked`，沒有為此新增狀態。
- **憑證被拒絕或達到額度上限時會停止後續批次**，不會把剩下的批次也打完。
- **可恢復的失敗（429／5xx／逾時）會重試一次**，並沿用同一個 `x-line-retry-key`，
  所以重試不會造成重複發送。
- **對 provider 的請求有 10 秒逾時**，逾時記為 `provider_timeout`；此時訊息可能已送達，
  重送前要先看推播紀錄。
- **每月推播額度依方案而定。** 達到上限時 LINE 回 429，平台記為 `rate_limited`。
  平台目前不會預先擋下超額的送出，這需要產品決定。

## 回復程序

1. 把 `LINE_OA_MODE` 改回 `mock` 並重新部署；推播會停止對外送出，其餘功能不受影響。
2. 懷疑憑證外洩時，在 LINE Developers Console 重新發行 channel access token，並更新部署端環境變數。
3. 事故分析只用去識別化事件與 provider request id，不要複製訊息內容或 token。

本文件不代表已部署、也不代表 LINE Console 或 production 已被修改。
