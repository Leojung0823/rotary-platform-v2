# Staging 執行秘書驗收

這份流程補上管理模式企劃書要求的最後一個真實驗收：**沒有社員身分的執行秘書**，能從社務總覽找到生日徵集與文件中心，並完成可回收的測試操作。

它不是部署流程，也不套用 migration。它只會登入已部署的 staging，透過網頁操作驗證路徑與權限邊界。

## 驗收帳號

GitHub repository 的 `staging` environment 必須有以下兩個 secrets：

- `STAGING_TEST_OPERATOR_EMAIL`
- `STAGING_TEST_OPERATOR_PASSWORD`

帳號必須符合全部條件：

- 只存在於 staging，不得是正式環境帳號。
- Email 使用保留測試網域（例如 `example.test`），且帳號名稱含 `staging` 或 `test`。
- 帳號是 active。
- 在 `STAGING_EXPECTED_CLUB_NAME` 指定的測試社，具有 active 的 `club_operator_permissions`，權限為 `club_manager`。
- **沒有** `club_memberships`，不能同時是社員。
- 不是 platform admin，也不與 `STAGING_TEST_MEMBER_EMAIL` 共用。

請用既有的「執行秘書管理」畫面建立或設定帳號，不要直接改資料庫。密碼只輸入 GitHub Secret，不要寫進 Git、文件、Issue、PR、截圖或聊天。

## 執行前提

1. 目標 commit 已在 `main`，且已用 `Staging Go-Live` 部署到 staging。
2. `/api/health` 的 `status` 是 `ok`、`environment` 是 `staging`，`issues` 是空陣列。
3. staging 已開啟 `birthday_wishes_collection_v1` 與 `archive_handover_v1`。
4. 測試社已有可供生日批次重跑的有效生日／題庫資料；否則生日 action 可能正確地回報資料不足，驗收會失敗。
5. `STAGING_TEST_OPERATOR_EMAIL` 與 `STAGING_TEST_OPERATOR_PASSWORD` 已設定，且不會在 shell history、workflow summary 或 log 出現。

## 執行方式

到 GitHub Actions 執行 **Staging Management Acceptance**：

1. Branch 選 `main`。
2. `expected_sha` 填入已部署 commit 的完整 40 字元 SHA。
3. `confirmation` 填入 `TEST-STAGING-MANAGEMENT`。
4. 核准 GitHub `staging` environment 的保護閘門。

Workflow 會先確認是手動執行、來自 `main`、SHA 完全一致、staging origin 為公開 HTTPS，並確認 operator Email 是保留測試身份。瀏覽器步驟只拿 operator 的登入帳密，不拿 Supabase access token、資料庫密碼或 service-role key。

## 自動驗收內容

- 檢查 `/api/health` 與 exact deployed revision。
- 使用無社籍執行秘書登入。
- 從 `/dashboard?mode=management` 找到目前測試社。
- 確認沒有錯誤的「返回社員模式」入口。
- 進入生日祝福徵集，成功建立／重跑本月任務。
- 進入文件中心，建立未使用的扶輪年度。
- 建立可回收文件項目、上傳 `handover-acceptance.txt`、修改文件標題。
- 不執行不可逆的「交接確認」，不碰正式社團資料。

建立的年度、文件與版本會留在 staging，標記為可回收測試資料；若要清理，須另行設計並經確認，不能由驗收流程偷偷刪除資料。

## 完成判定

只有 workflow 成功，且 summary 顯示 operator path、生日重跑與文件建立／上傳／編輯都通過，才可把管理模式企劃書第 5.2 與第 12.3 標成完成。只有社員驗收通過，不能代替這項執行秘書驗收。
