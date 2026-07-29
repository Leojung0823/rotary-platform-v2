# V0.7 社員名冊與個人資料維護範圍

## 目標

在既有 invitation-first 身份、社籍、角色與隱私設定基礎上，補齊一般社員可使用的同社名冊，以及本人可維護的基本資料；不把秘書後台的完整社員資料直接暴露給一般社員。

## 本切片交付

- `/directory` 顯示目前登入者具有 active membership 的 active 扶輪社。
- 同社名冊只列出 active 社員。
- 可依社員姓名搜尋；Email 與手機不能作為隱私欄位搜尋 oracle。
- 社員姓名與社級角色可見。
- Email、手機與出生年份依本人 privacy settings 個別公開。
- 本人永遠能在名冊投影中看到自己的資料。
- `/directory/[membershipId]` 提供同一隱私投影的社員資料頁。
- `/me` 新增姓名、手機、Email、生日的本人編輯表單。
- 本人更新姓名時，同步 `people.canonical_name` 與 `app_accounts.account_display_name`。
- 本人資料更新寫入 append-only audit log。
- 功能總覽將社員名冊及社員資料維護標示為可測試。

## 安全與隱私邊界

- 名冊 RPC 必須由 active account、active membership 與 active club 三層 gate 授權。
- 一般社員不能讀取其他扶輪社名冊。
- suspended／disabled／ended 社籍不能查看名冊。
- 名冊不回傳 person ID、app account ID、Auth UUID、LINE identity ID、LINE subject、登入紀錄或完整生日。
- 未公開 Email、手機與出生年份以 `null` 回傳，不在前端取得後再隱藏。
- 搜尋只比對姓名，避免利用隱私欄位推測社員資料。
- 本人更新 RPC 不接受目標 person、account 或 membership ID；目標只能由 `auth.uid()` 推導。
- browser roles 仍不取得 `people`、`app_accounts`、`privacy_settings` 或 `club_memberships` 直接 CRUD。

## 自動驗證

- 匿名呼叫拒絕。
- active 同社社員可查看名冊。
- 未公開欄位保持遮蔽。
- 隱私 opt-in 後只公開指定欄位。
- hidden Email 不能作為搜尋條件。
- 跨社讀取拒絕。
- suspended 社籍立即失去名冊權限。
- 本人資料更新不影響其他真人資料。
- 顯示名稱同步並產生 audit record。
- TypeScript parser 不投影額外識別欄位。

## 明確不在本切片

- 正式 LINE Login provider 設定與忘記密碼。
- Hosted Supabase、staging 或 production migration。
- 真實社員資料匯入。
- 頭像上傳與媒體儲存。
- 地址、公司、職業分類或完整社員履歷。
- 出席率、請假、公假與補出席。
- 公開網路名冊或跨社搜尋。
