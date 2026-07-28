# LINE Login MVP 部署檢查表

## 部署前

- [ ] 部署站點使用 HTTPS。
- [ ] `NEXT_PUBLIC_SITE_URL` 是受信任的完整 HTTPS origin，不含 path、query 或 fragment。
- [ ] `LINE_LOGIN_CALLBACK_URL` 與 LINE Developers Console 登錄值完全相同，且結尾為 `/api/auth/line/callback`。
- [ ] `LINE_LOGIN_CHANNEL_ID` 與 `LINE_LOGIN_CHANNEL_SECRET` 屬於正確的 LINE Login channel。
- [ ] channel secret 僅存在 server secret store，沒有使用 `NEXT_PUBLIC_` 前綴。
- [ ] production 設定 `APP_ENV=production` 與 `LINE_LOGIN_MODE=line`。
- [ ] production 不使用 `LINE_MOCK_SIGNING_SECRET` 作為正式 provider credential。
- [ ] OAuth cookies 實際具有 HttpOnly、Secure、SameSite=Lax、Path=/ 與 600 秒 Max-Age。
- [ ] Edge／reverse proxy 已限制異常流量與 callback abuse。
- [ ] log 不包含 authorization code、state、nonce、邀請 token、cookie header、ID/access/refresh token、service-role key 或 channel secret。

## 非正式環境 smoke test

- [ ] 從部署後的 HTTPS origin 啟動 LINE Login。
- [ ] 使用非正式測試身份完成真實 LINE provider 登入。
- [ ] 沒有邀請且沒有既有 active LINE identity 的帳號會被拒絕。
- [ ] 有效邀請完成 trusted binding 後才建立 Supabase session。
- [ ] provider 取消、錯誤、過期與重播 callback 都只回傳通用失敗。
- [ ] `GET /api/auth/line/session` 只回傳 `authenticated` 布林值。
- [ ] same-origin `POST /api/auth/line/logout` 成功，跨站請求被拒絕。
- [ ] 登出後 session status 為 unauthenticated，OAuth 與 device cookies 已清除。

## 回復程序

1. 停止將流量導向有問題的部署版本。
2. 回復前一個應用版本；本 PR 沒有新增資料庫 migration。
3. 若懷疑憑證曝光，旋轉部署端 LINE credentials。
4. 確認 LINE Console callback 只指向核准的部署。
5. 僅使用去識別化事件與 LINE request ID 進行事故分析，不複製 token body。

此文件不代表已部署，也不代表 hosted Supabase、LINE Console、Lovable 或正式資料已被修改。
