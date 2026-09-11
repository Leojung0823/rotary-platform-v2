# LINE OA 管理頁身份驗證

2026-09-11：補齊社員加入引導所需的管理員驗證入口。

## 使用方法

1. 管理模式 → LINE OA，填寫並儲存本社 Basic ID 與 Channel ID。
2. 依頁面顯示的環境變數名稱，在 staging 伺服器設定同一 OA 的 Channel access token。
3. 按「驗證 LINE OA」。伺服器向 LINE `GET /v2/bot/info` 取得身份，核對已儲存 Basic ID 後，以既有 service-only RPC 記錄驗證結果。
4. 成功後，社員加入引導仍受 `line_oa_onboarding_v1` 與既有權限控制。

這個按鈕不設定 Webhook、不發送訊息，也不完成社員本人配對。Webhook 與真人 follow 配對仍需另行驗收。

## 安全邊界

- 每次 action 先透過登入者的 `list_my_permissions` 確認目標社 `oa.manage`。
- 表單只使用 clubId；帳號與憑證名稱從伺服器按社別取得，不接受瀏覽器提供的憑證或驗證結果。
- 憑證只放在固定 LINE HTTPS 端點的 Authorization header，禁止 HTTP 轉址、不快取，請求最多等待 10 秒。
- Basic ID 不符、LINE 回應錯誤、資料格式錯誤或資料庫拒絕時，不宣告成功；錯誤回報不含原始憑證、LINE 回應或資料庫訊息。
- 使用既有 `record_line_oa_account_identity_verification` 與 schema；本次沒有 migration。
- 本機 mock 模式不會被記錄成真實驗證成功。

## 驗證

- action 測試涵蓋成功、越權、偽造輸入、OA 不符、缺少憑證、LINE 錯誤、逾時與寫入失敗。
- LINE OA 瀏覽器測試涵蓋按鈕可操作與 mock 模式安全拒絕。
- 真實憑證驗收須在部署後由管理頁執行，不能以單元測試或 mock 成功代替。

LINE 官方 API 文件：https://developers.line.biz/en/reference/messaging-api/#get-bot-info
