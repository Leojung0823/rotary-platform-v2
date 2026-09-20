# LINE Rich Menu 每社社員入口企劃

更新日期：2026-09-21（Asia/Taipei）

狀態：程式底座已進入 `main` 並部署 staging；目前產品範圍只使用 `PANCHIAO-ELITE`，HAPPY 不使用。
staging runtime `7253ea009e57` 健康；仍待 PANCHIAO-ELITE 的 OA 外部設定、旗標狀態確認與手機真人驗收。
2026-09-21 現場核對 staging `/api/health` 為 `status=ok`、`issues=[]`、`warnings=[]`；本輪沒有對 LINE 發布選單，也沒有把 HAPPY 納入範圍。
2026-09-16 已登入管理頁實際核對，尚未看到 Rich Menu 發布區，與旗標尚未開啟相符；目前沒有圖片上傳、
LINE 發布或手機驗收證據。
2026-09-16 已把使用者提供的 2×2 設計另存為 `2500×1686`、`486,768 bytes` 的 JPEG；原始檔未覆蓋，
仍未上傳平台或發布到 LINE。圖片內文案仍是「社團首頁／活動報名／生日祝福／我的資料」，較短文案是否替換尚未定案。
2026-09-16 管理頁實際核對仍看得到 HAPPY 的 OA metadata、`LINE_OA_HAPPY_*` namespace、4 位 follower
與既有推播紀錄；這是 staging／mock 殘留的待釐清資料，不代表 HAPPY 已納入 rollout。未經產品明確決定前，
不得對 HAPPY 發布或發送 Rich Menu。

## 1. 目的

讓社員在 LINE 官方帳號裡可以直接進入 Rotary 平台，不必先記住網址。每個扶輪社使用自己的 LINE OA；選單只提供社員功能，幹部功能仍只能從平台的社務管理模式進入。

## 2. 已確認的產品規則

1. **每社一個 OA 範圍**：Rich Menu 綁在該社的 LINE Messaging API channel。A 社只能使用 A 社的 channel access token 與選單，不能 fallback 到其他社。
2. **社員固定四格**：社團首頁、活動報名、生日祝福、我的資料。
3. **固定連結，不接受任意網址**：每格都是平台同源 HTTPS 網址，並帶入該社 `clubId` 與 `mode=member`。不產生 `/clubs/...` 管理網址、不接受瀏覽器傳入的網址或任意 JSON。
4. **全 OA 好友共用**：第一版使用 LINE 的 default rich menu，因此同一個 OA 的好友看到同一份選單；不做每位社員一份選單。
5. **停用可回復且不誤傷其他選單**：停用前先讀取 LINE 目前的 default rich menu ID；只有確認它等於平台保存的 `richMenuId` 才清除。沒有預設選單、ID 已被替換，或由 LINE Official Account Manager 接管時，不清除現有選單。已建立的 provider object 保留，日後可重新發布新圖片。LINE 的選單圖片不能直接替換，換圖要建立新的選單。
6. **功能旗標預設關閉**：`line_rich_menu_v1` 必須明確啟用；`DISABLE_LINE_RICH_MENU=true` 可緊急關閉。旗標關閉時管理頁不顯示發布區，也不呼叫 LINE。
7. **目前社團範圍**：只對 `PANCHIAO-ELITE` 進行 staging 發布與手機驗收；`HAPPY` 目前不使用。
   若 staging 仍留有舊的 HAPPY metadata／follower，視為殘留資料，不得發布、推播或拿來當 rollout 證據；
   是否停用或清理要另取得明確決定。

## 3. 使用流程

### 幹部發布

1. 幹部進入「社務管理模式 → LINE OA」。
2. 伺服器先用登入 session 查詢該社的 `oa.manage` 權限。
3. 旗標開啟後，頁面才顯示 Rich Menu 發布區。
4. 幹部上傳 2500×1686 的 PNG／JPEG 圖片，大小不超過 1 MB。
5. 伺服器依 URL 內的 `clubId` 讀取同一社的 OA 設定與 server secret。
6. 伺服器依序呼叫 LINE：建立選單 → 上傳圖片 → 設為該 OA 的 default rich menu。
7. 最後才透過受保護 RPC 保存 LINE 回傳的 `richMenuId`。瀏覽器不會取得 access token。

### 幹部停用

1. 伺服器先驗證登入者的 `oa.manage` 權限與 `line_rich_menu_v1` 旗標。
2. 若資料庫有平台保存的 `richMenuId`，伺服器先向 LINE 讀取目前 default ID。
3. 只有 ID 相同時才呼叫清除 default；不同或不存在時保留 LINE 現有選單。
4. 受保護 RPC 清除平台保存的 ID；不刪除 LINE provider object。

### 社員使用

1. 社員在該社 LINE OA 聊天室看到 Rich Menu。
2. 點擊後開啟平台的社員路由。
3. 平台仍用登入 session、作用社別與後端 RPC 做身份、權限及資料隔離；URL 中的 `clubId` 只是入口偏好，不是授權。

## 4. 實作範圍

| 區域 | 實作內容 |
|---|---|
| 旗標 | `line_rich_menu_v1`、explicit enable、`DISABLE_LINE_RICH_MENU` |
| 圖片與選單 | `src/lib/line/rich-menu.ts`：固定四格、同源連結、圖片格式／尺寸／大小驗證 |
| 管理 action | `src/app/line-rich-menu-actions.ts`：權限、旗標、每社 secret、LINE API、受保護 RPC |
| 管理頁 | `src/app/(authenticated)/clubs/[clubId]/line-oa/page.tsx`：發布與停用操作 |
| 資料庫 | `20260914000300_line_rich_menu_v1.sql`：feature key 約束、telemetry 白名單、每社 `rich_menu_id` 保存 RPC |
| 驗證 | `supabase/verification/line_rich_menu_security.sql`、Rich Menu 單元／security-boundary tests 21/21；2026-09-14 以目前分支 production build 執行 `npm --prefix e2e run test:line-rich-menu`，本機管理者發布／確認／停用流程 1/1 |

本輪刻意不修改 `src/lib/line/messaging.ts`、`src/lib/line/oa-dispatch.ts`，也不新增資料表、不改 Supabase RLS 權限模型。

## 5. 安全邊界

- 所有操作先驗證登入者對目標 `clubId` 的 `oa.manage` 權限；一般社員直接輸入管理網址仍會被後端拒絕。
- access token 只由 server environment key 讀取；secret 不進 FormData、URL、HTML、audit metadata、log 或錯誤訊息。
- OA 查詢用精確的 `clubId` 且只取該社 active account；不同社不共用 token。
- 瀏覽器只能呼叫 server action；資料庫狀態只能由 `set_line_oa_rich_menu(uuid,text)` RPC 寫入。
- RPC 使用 `security definer`、固定 `search_path`、明確的 `oa.manage` 檢查，並撤銷 public／anon 直接執行權限。
- `clubId` 帶在社員連結中不代表已授權；dashboard、生日、活動與其他頁面仍由 session 與後端 tenant boundary 決定是否可看。
- 發布失敗時不把 LINE 回應 body 傳回瀏覽器；建立但尚未設為 default 的 provider object 不自動刪除，避免誤刪其他用途的物件。
- 停用不能直接呼叫全體 default 清除 API；必須先比對平台保存的 `richMenuId`，且旗標關閉時直接送出的停用請求也必須 fail closed。

## 6. LINE API 預期限制

LINE Rich Menu 的標準流程是建立 rich menu、上傳圖片，再指定為 default；圖片為 JPEG／PNG，官方上限為 1 MB，且選單只能在 LINE 行動版顯示，LINE PC 不顯示。平台第一版額外要求固定 2500×1686，確保四格座標永遠一致。

參考官方文件：

- [Use rich menus](https://developers.line.biz/en/docs/messaging-api/using-rich-menus/)
- [Rich menus overview](https://developers.line.biz/en/docs/messaging-api/rich-menus-overview/)
- [Messaging API reference](https://developers.line.biz/en/reference/messaging-api/nojs/)

## 7. 尚未完成的外部工作

以下不是本機程式缺口，不能用單元測試宣稱完成：

1. 確認 staging 的 `line_rich_menu_v1` 已由受保護流程開啟；若未開啟，不能把「程式已部署」當成社員已可用。
2. 確認該社自己的 `LINE_OA_PANCHIAO_ELITE_ACCESS_TOKEN` 可用，並由管理員上傳正式圖片。
3. 用手機確認自己的 OA 真的看到選單，四格都落到正確社別的社員頁。
4. 驗證一般社員直接輸入管理網址、未設定 OA、錯誤 token、旗標關閉、停用後重新發布等負向情境。
5. HAPPY 目前不在上線範圍；若未來重新啟用，才建立 HAPPY 自己的 OA／Messaging API channel、webhook 與 `LINE_OA_HAPPY_*` secrets，不可沿用 PANCHIAO。

## 8. 不在本輪範圍

- 不做每位社員個人化 Rich Menu。
- 不在 Rich Menu 裡放管理功能、平台管理功能或任意外部網址。
- 不把登入狀態、角色、權限、社員資料放入 cookie 或 Rich Menu 快取。
- 不修改 production、不直接替各社建立 LINE channel、不替使用者在 LINE Developers Console 設定 webhook。
