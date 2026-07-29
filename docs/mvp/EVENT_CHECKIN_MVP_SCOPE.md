# 活動簽到 MVP 範圍

## 目標

在已合併的活動與報名基線上，交付可獨立審查的簽到流程：管理者開啟與關閉簽到、短效一次性 QR token、社員本人簽到、管理者人工補登與撤銷，以及完整稽核紀錄。

## 本 PR 交付

- 具 `event.manage` 權限的管理者可為已發布且計入出席的活動開啟簽到場次。
- 每個簽到場次使用短效隨機 token；資料庫只保存 SHA-256 hash，不保存原始 token。
- 同一活動同一時間只允許一個 active 簽到場次；旋轉 token 會撤銷舊 token。
- active 社員可在有效時間窗內以 token 完成本人簽到。
- 具 `event.manage` 權限的管理者可為同社 active 社員人工補登，並填寫原因。
- 管理者可撤銷簽到；撤銷不 hard delete，保留原始紀錄與撤銷原因。
- 同一社員同一活動只有一筆 active attendance；重複掃描採冪等回傳。
- 所有資料以不可變 `club_id` 隔離，並以 composite foreign key 綁定活動、場次與社員社籍。
- browser roles 不取得簽到資料表直接 CRUD，只能呼叫最小授權 SECURITY DEFINER RPC。
- Traditional Chinese、mobile-first 的 `/events` 簽到操作介面。
- 所有開啟、旋轉、關閉、本人簽到、人工補登與撤銷動作寫入 append-only `audit_logs`。

## 明確不在本 PR

- GPS、地理圍欄、背景定位或裝置風險評分。
- 出席率分母、請假、公假、補出席與趨勢報表。
- 非社員來賓簽到、攜伴逐人名冊與現場付款。
- 相機 QR 掃描元件；本 PR 先提供可貼入／由外部掃描器帶入 token 的安全流程。
- LINE 主動推播與正式 provider smoke test。

## 安全 gate

- anonymous、跨社、停權帳號、停權社籍與停權扶輪社不得建立、查看或使用簽到場次。
- 只有已發布、計入出席且尚未取消的活動可開啟簽到。
- token 必須隨機、短效、只存 hash、可旋轉且舊 token 立即失效。
- token 驗證與 attendance 寫入必須在同一資料庫交易完成。
- 社員只能為自己簽到；人工補登必須驗證同社 active membership。
- 撤銷必須保留歷史，不得 hard delete 或覆寫原始簽到時間／方式。
- 重複掃描不得建立第二筆 active attendance。
- API／UI 不暴露 Auth UUID、LINE subject、token hash、原始 Supabase 錯誤或其他社員 PII。
