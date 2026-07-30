# Hosted staging 瀏覽器驗收

此流程用於已建立完成的 HTTPS staging 測試站。它不建立 Hosted Supabase、不部署網站、不套用 migration，也不建立測試帳號。

## 安全邊界

- Workflow 只能由 `workflow_dispatch` 手動執行。
- Job 使用 GitHub `staging` environment，必須先通過該 environment 的保護規則。
- 僅允許從 `main` 執行，並要求輸入與 `github.sha` 完全相同的 40 字元 commit SHA。
- 確認文字固定為 `TEST-STAGING`。
- 測試帳號只能是 staging 專用社員，不得使用正式社員或 production credentials。
- Workflow 不取得 Supabase service role、access token 或資料庫密碼。
- Hosted 驗收模式關閉 Playwright trace、screenshot、video 與 HTML report，失敗時不會上傳 artifact。
- 測試不修改社員基本資料、隱私設定、社籍、角色或其他持久資料；只進行登入、讀取與登出。

## GitHub `staging` environment 設定

Environment variables：

- `STAGING_BASE_URL`：不含路徑的 HTTPS staging origin，例如 `https://staging.example.com`。
- `STAGING_EXPECTED_CLUB_NAME`：測試社員可查看的測試扶輪社完整名稱。

Environment secrets：

- `STAGING_TEST_MEMBER_EMAIL`：staging 專用測試社員 Email。
- `STAGING_TEST_MEMBER_PASSWORD`：staging 專用測試社員平台密碼，至少 12 字元。

不要把實際值寫入 Git、PR、Issue、截圖、聊天或 workflow summary。

## 測試帳號前置條件

測試社員必須：

- 帳號狀態為 active。
- 至少有一筆 active 社籍。
- 所屬扶輪社為 active。
- 可以使用平台密碼登入。
- 可以查看 `STAGING_EXPECTED_CLUB_NAME` 指定的社員名冊。
- 會員中心至少有姓名，以及手機或 Email 其中一項聯絡資料。

## 執行步驟

1. 確認目標 commit 已合併至 `main`，Quality、CI 與 Browser Smoke 均通過。
2. 確認部署平台已完成該 commit 的 staging 部署。
3. 開啟 `/api/health`，確認 `status=ok`、`environment=staging`，且 `revision` 為目標 commit 的前 12 字元。
4. 進入 Actions → `Staging Browser Acceptance` → Run workflow。
5. Branch 選擇 `main`。
6. `expected_sha` 輸入完整 40 字元 commit SHA。
7. `confirmation` 輸入 `TEST-STAGING`。
8. 核准 `staging` environment 後執行。

## 自動驗收內容

- `/api/health` 必須回傳 200。
- 健康狀態必須為 `ok`，環境必須為 `staging`。
- `revision` 必須等於輸入 commit SHA 的前 12 字元，避免驗收到舊部署。
- 使用 staging 專用社員帳號完成平台密碼登入。
- 開啟社員名冊，確認指定扶輪社存在且名冊可讀取。
- 開啟會員中心，確認基本資料可讀取、姓名與至少一項聯絡資料存在。
- 驗證頁面無明顯水平溢出。
- 完成登出並回到登入頁。

## 不在此自動驗收範圍

下列項目仍需另外驗證：

- Email 邀請寄送、信箱收件與一次性邀請接受。
- 忘記密碼 Email 與 recovery link。
- 真實 LINE Login callback、LINE 綁定、解除與重新綁定。
- 真實 iPhone Safari 與 Android Chrome 裝置操作。
- 社員資料修改、隱私設定修改、停權與跨裝置 session 撤銷。

這些流程不得因本 workflow 通過而視為已完成。
