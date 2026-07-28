# 活動報名 MVP 範圍

## 目標

在既有 invitation-first 身份與多租戶安全基線上，交付第一個活動管理垂直流程：同社活動建立、發布、社員查看、報名／不參加、名額與截止時間控制，以及稽核紀錄。

## 本 PR 交付

- active 扶輪社的社員可以查看同社已發布活動。
- 具 `event.manage` 權限的社長、秘書、平台管理員可建立、發布與取消活動。
- 社員可在截止時間前選擇參加、不參加或待確認，並填寫攜伴人數與備註。
- 名額以社員本人加攜伴人數計算，資料庫交易內鎖定活動並防止超額。
- 所有資料以不可變 `club_id` 隔離。
- browser roles 不取得活動與報名資料表直接 CRUD；只透過固定 `search_path` 的 SECURITY DEFINER RPC。
- 重要管理與報名動作寫入 append-only `audit_logs`。
- Traditional Chinese、mobile-first 的 `/events` 頁面與導覽入口。

## 明確不在本 PR

- QR token、GPS、人工補登與撤銷簽到。
- 出席率分母、請假、公假、補出席與趨勢報表。
- 指定社員／職務／群組受眾。
- 候補名單、活動複製、CSV／PDF 匯出。
- LINE 主動提醒與正式 provider smoke test。

上述項目會在活動報名基線合併後，另開可獨立審查的簽到與出席統計 PR。

## 安全 gate

- 跨社讀取、建立、發布、取消與報名必須失敗。
- suspended／disabled account、membership 或 club 不得使用活動功能。
- 活動開始或報名截止後，不得新增或修改報名。
- 非管理者不能建立、發布或取消活動。
- 非本人不能修改他人報名。
- 名額競爭必須在資料庫交易中 fail closed。
- API／UI 不暴露 Auth UUID、LINE subject、token 或原始 Supabase 錯誤。
