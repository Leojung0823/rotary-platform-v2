# V0.7 社員系統與可上線前端骨架

## 產品目標

先把社員使用會直接接觸的身份、登入、社員資料與前端資訊架構做完整，再往出席率、財務與進階通知擴充。平台必須先能在 HTTPS 測試站安全操作，才能開始使用真實社員資料。

## 第一階段：前端功能地圖

- 在工作台與主要導覽加入「功能總覽」。
- 已完成的功能直接連到實際頁面。
- 尚未完成的模組全部明確標示「開發中」。
- 開發中頁面不得提供假的可操作按鈕、假資料或誤導性的成功狀態。
- 修正桌面／窄版側欄底部操作空間與 safe area。

## 第二階段：社員系統完善

- 社員名冊與搜尋。
- 社員個人資料檢視及權限化編輯。
- 社籍、職務、狀態與公開欄位管理。
- 邀請接受、重新寄送、取消與到期狀態。
- Email／密碼登入錯誤、忘記密碼與重設密碼流程。
- LINE 綁定、解除綁定、重新綁定與正式登入狀態提示。
- 行動版會員中心與登入流程實機測試。

## 第三階段：測試站部署準備

- Hosted Supabase staging 專案與隔離資料。
- HTTPS 測試站與正式環境變數驗證。
- migration 套用、rollback／recovery 說明與部署紀錄。
- LINE Developers Console 測試 channel callback 設定。
- Email、密碼、LINE、登出、邀請及跨社權限 smoke test。
- iPhone／Android 與主要瀏覽器測試。

## 後續版本

- V0.8：出席率、請假、公假、補出席與趨勢。
- V0.9：公告排程、文件中心、社費與 IOU。
- V1.0：生日關懷、報表匯出、Rich Menu 與手機 Web App。
- 後續：社務 AI 助理。

## 安全與上線 gate

- 不把 production secret、service-role key、LINE secret 或真實社員資料提交至 GitHub。
- local、staging、production 必須使用不同 Supabase 與 LINE credentials。
- 未經 repository owner 明確授權，不合併 PR、不執行 production migration、不修改正式 LINE Console。
- staging smoke test、資料保護檢查與外部安全審查完成前，不匯入正式社員資料。

## 本切片不包含

- Hosted Supabase 建立或 migration。
- Vercel／其他 hosting 實際部署。
- 正式 LINE Login channel 設定。
- 出席率資料模型與統計。
- 財務、文件、通知或 AI 功能實作。
