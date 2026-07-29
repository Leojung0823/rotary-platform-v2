# 活動簽到 QR 顯示與掃描 MVP 範圍

## 目標

在 V0.5 已合併的短效 token、本人簽到與人工補登安全基線上，補齊現場實際操作需要的 QR 顯示與手機相機掃描體驗；不改變 token 的資料庫保存方式，也不新增定位資料。

## 本 PR 交付

- 管理者開啟或旋轉簽到 token 後，在同一個 client action state 中產生 QR 圖片。
- QR 內容只包含 64 字元隨機 token，不包含社員、社別、活動名稱、URL 或其他個資。
- 旋轉 token 後立即移除舊 QR 與舊明文，只保留最新 token。
- 社員在 `/events/checkin` 可啟動後鏡頭掃描 QR。
- 相機掃描採 progressive enhancement；不支援 `BarcodeDetector`、拒絕相機權限或非安全來源時，仍保留手動輸入 token。
- 掃描到合法 token 後停止相機、停止偵測迴圈，並透過既有 server action 提交。
- 相機串流只存在瀏覽器記憶體，不上傳、不截圖、不保存。
- Traditional Chinese、mobile-first、清楚的相機權限與隱私提示。
- unit tests、lint、TypeScript 與 production build。

## 安全邊界

- token 不得進入 pathname、query string、fragment、analytics、console、audit metadata 或持久化 browser storage。
- QR 使用 data URL／canvas 類型的本地呈現，不建立可分享的伺服器圖片網址。
- 相機只在使用者明確點擊後啟動，並優先要求 `facingMode: environment`。
- 元件 unmount、停止、掃描成功或提交前都必須停止全部 media tracks。
- 只接受 QR code 格式與 `^[0-9a-f]{64}$` token；其他內容不提交。
- 不新增資料庫 migration、RPC 或直接資料表存取。

## 明確不在本 PR

- GPS、地理圍欄、位置證明或定位資料保存。
- 由 LINE 直接開啟相機的 LIFF 整合。
- QR 圖片下載、永久分享網址、列印版型或公開投影頁。
- 出席率統計、請假、公假、補出席與趨勢報表。
- hosted／staging／production 部署與正式裝置 smoke test。

## 合併 gate

- migration history 不得變更。
- lint、TypeScript、unit tests、production build 全部通過。
- 既有 database clean reset 與 13 份安全 SQL 必須維持通過。
- 最終 code review 必須確認 token 不進 URL／storage／console，並確認相機 tracks 在所有退出路徑停止。
