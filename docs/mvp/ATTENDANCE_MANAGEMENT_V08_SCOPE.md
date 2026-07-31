# V0.8 出席管理、請假與出席統計

## 資料模型

`event_attendances` 繼續保存 QR 與現場人工簽到的原始歷史。V0.8 新增 `attendance_adjustments`，保存請假、公假、補出席與免計；調整只能撤銷，不能 hard delete，且同一活動與社員同時最多一筆有效調整。原始簽到與人工調整各自保留原因、操作者與時間，所有 mutation 都寫入 `audit_logs`。

Browser roles 沒有相關 table CRUD。讀寫只透過固定 `search_path` 的 `SECURITY DEFINER` RPC，操作者由 `auth.uid()` 推導，並逐次檢查 active account、active club、club membership、`attendance.manage` 與 composite tenant foreign key。

## 最終狀態與出席率

活動必須已發布或完成、已開始、未取消且 `counts_for_attendance = true`。社員社籍必須在活動當日已開始且尚未結束；非 active 社籍不會進入未來活動。執行秘書與沒有該社 membership 的平台 operator 不會進入社員分母。多社真人依每一筆 `club_membership` 分開計算。

最終狀態依序為：有效原始簽到 `present`、補出席 `makeup`、公假 `official_leave`、請假 `leave`、免計 `exempt`，最後才是 `absent`。`present` 與 `makeup` 計入出席；V0.8 的明確政策是公假與免計不計分母，請假與缺席計入分母。UI 不自行重算安全關鍵結果。

本人及社內統計都要求明確 club ID 與最長 366 天日期範圍；單一活動名冊與 CSV 最多 1,000 位符合活動日資格的社員。

## 頁面與匯出

- `/attendance`：本人出席率、狀態分布、按月趨勢、日期範圍及多社切換。
- `/attendance/manage`：活動篩選、社員搜尋、原始簽到、有效調整、建立／撤銷原因及歷史。
- Dashboard：最近 90 天平均出席率、待處理缺席、尚未確認紀錄與趨勢。
- CSV：只有 `attendance.manage` 可匯出；只含活動日期、活動名稱、社員姓名、最終狀態、原始簽到方式／時間、調整類型／原因。所有儲存格在輸出前中和 spreadsheet formula prefix。

## 發布邊界

本版本只允許 local Supabase 驗證。未接觸 Hosted Supabase、staging 或 production，也不修改 hosted staging workflow。Issue #25 完成真實 staging 驗收前，不得將 V0.8 合併到 `main`。
