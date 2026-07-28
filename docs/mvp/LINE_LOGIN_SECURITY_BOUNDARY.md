# LINE Login MVP 安全邊界

## 保留的身份模型

本功能沿用既有：

`people → app_accounts → line_identities → Supabase Auth user/session`

瀏覽器不能指定 Person、App Account、Auth UUID 或 trusted LINE subject。正式 subject 只能來自 LINE 驗證成功的 ID token；mock subject 只能來自 localhost 上以獨立 secret 簽署的測試 payload。

## Callback 不變條件

1. state、nonce、邀請 digest、return path、有效期限與 `consumed_at` 必須全部一致。
2. 有效 state 會以 compare-and-set 原子消耗；provider 取消、錯誤與缺少 code 也會終結該 state。
3. 沒有邀請時，必須已有 active LINE identity 與 active App Account，不能自行註冊。
4. 只有有效且未過期的邀請可以建立新的 Supabase Auth user。
5. `bind_line_identity_from_invitation_trusted` 必須成功後，才可建立 Supabase session。
6. 綁定前失敗時，會 best-effort 刪除本次建立的孤兒 Auth user。
7. session 建立後的 device telemetry 是非關鍵紀錄；失敗不會破壞已建立的登入。
8. public failure 一律使用通用錯誤，不包含 provider、token、邀請或資料庫細節。

## Provider 邊界

- production 僅允許 `LINE_LOGIN_MODE=line` 與 HTTPS site／callback。
- token 與 verify request 有 8 秒 timeout。
- 驗證 issuer、audience、expiry、issued-at、nonce、subject、名稱、圖片 URL 與 Email 邊界。
- access token、refresh token 與 ID token 不寫入資料庫或 log。
- local mock 僅允許 localhost、非 production 與 32 字元以上獨立 signing secret。

## Session 與登出

- session 使用既有 Supabase Auth magic-link token hash verification，不建立第二套 session。
- session status API 只回傳 `authenticated` 布林值並設定 `cache-control: no-store`。
- logout 僅接受 same-origin POST，採 local scope sign-out，並清除 LINE OAuth 與 device cookies。

## 殘餘風險

- LINE provider 網路交換與本地身份／session mutation 無法組成單一 ACID transaction。
- trusted binding 成功後若 session 建立失敗，已建立的身份會保留，需由後續登入重試；這比刪除已綁定身份安全。
- Auth user 建立與 trusted binding 之間仍是 best-effort compensation；正式營運需監控罕見孤兒 Auth user。
- 正式 LINE Console callback、部署 secrets、HTTPS origin、Edge rate limit 與真實 provider smoke test 仍需人工設定與外部審查。

本文件僅描述 local／GitHub 程式邊界，不代表正式上線或安全核准。
