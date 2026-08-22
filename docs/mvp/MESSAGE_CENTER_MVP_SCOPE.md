# 訊息中心 MVP 範圍（PR #40 Announcements / In-app Notifications）

> 實作日期：2026-08-22
> Feature flag：`announcements_v09`（**預設關閉，必須明確開啟**）
> Migration：`20260822000900_club_message_center.sql`
> 驗證：`supabase/verification/club_message_center_security.sql`

## 這個 PR 完成什麼

- 幹部（`member.manage`）可在 `/messages` 發布社內訊息：標題、內容、發送對象。
- 發送對象沿用既有的受眾挑選器：全社／依標籤／指定社員，與活動、留言板、LINE OA 同一份定義（`resolve_club_audience`）。
- 每位收件社員有自己的一列投遞紀錄與已讀時間，因此「未讀」是事實而不是猜測。
- 社員在 `/messages` 讀訊息，展開內容時才標記已讀；重複開啟不會移動第一次已讀的時間。
- 導覽列出現未讀數量徽章（社員模式與社務管理模式都有），數字同時以 `sr-only` 文字播報。
- 幹部可以看「已讀 N／M」與**還沒讀的人的名字**，也可以收回訊息。
- 收回是軟刪除：訊息從收件匣消失，投遞紀錄保留，已讀過的事實不會被抹掉。

## 明確不在這個 PR

- **不做 LINE 推播整合。** 訊息中心存在的理由正是不依賴 LINE 配對；要推播的幹部仍走 `/clubs/[clubId]/line-oa`。
- **不做排程或自動發送。** 系統目前沒有任何排程機制（見 `BIRTHDAY_WISHES_V2_PLAN.md` §5.1），那是祝福徵集的前置條件，不是這一版的。
- **不做催繳與重複提醒。** 未讀就是未讀，不會反覆推播。
- 不做回覆、附件、圖片、置頂、草稿、排程發布。
- 不接上 `notification_settings`：那張表目前只有偏好、沒有投遞管道對應，這一版不假裝它有作用。

## 為什麼投遞是快照

收件人在送出的當下就寫進 `club_message_recipients`，不是每次讀取時重新計算受眾。

- 明天才入社的人不會回頭收到昨天的訊息。
- 幹部事後改標籤成員，不會改變當初「發給了誰」。
- 收件匣是**寄出了什麼**的紀錄，不是一個每次重新求值的查詢。

## 權限與邊界

| 動作 | 需要 |
|---|---|
| 發布訊息、收回訊息、看已讀名單、看已送出清單 | 該社 `member.manage` |
| 讀自己的收件匣、標記已讀 | 該社有效社籍 + 有效帳號 |

- 三張資料表都 `enable row level security` 並對 `anon` / `authenticated` 全部 revoke；所有存取走固定 `search_path` 的 `security definer` RPC。
- `my_unread_club_message_count` 與 `current_club_membership_id` 是內部積木，**沒有**授權給 `authenticated`。
- 訊息無法硬刪除（trigger 擋），投遞紀錄除了已讀狀態之外不可變更。
- 跨社：外社社員呼叫本社的收件匣或發送都會拿到 `42501`；指定外社的 membership 會被拒絕而不是被靜靜忽略。

## Feature flag 的行為改變

平台在 2026-08-22 起把「沒有設定紀錄」視為啟用（`default_enabled`）。那對已經在社員手上的功能是對的，對一個沒有人看過的新功能是錯的——那等於「部署即上線」，flag 就沒有意義了。

因此新增 `flagsRequiringExplicitEnable`（`src/lib/product/feature-flags.ts`），列在裡面的 key 在**沒有紀錄時視為關閉**（`missing_configuration`）。目前只有 `announcements_v09`。

要對社員開啟：

```bash
npm run flags:enable announcements_v09
```

> 沒有改資料庫的 flag 觸發器來「在 migration 裡插入停用列」：那需要同時放寬 `platform_feature_flags` 與 append-only 稽核表的 actor 要求，代價是削弱 rollout 控制本身的安全模型。改在應用層要求明確啟用，得到同樣的 fail-closed 行為而不動那條邊界。

## 讀走 API、寫走 server action

| 方式 | 位置 | 用途 |
|---|---|---|
| `GET` | `/api/v1/messages?club_id=` | 收件匣的下一頁（首頁由伺服器元件直接渲染） |
| `GET` | `/api/v1/messages/[messageId]/deliveries?club_id=` | 已讀名單（幹部） |
| server action | `sendClubMessageAction` | 發布訊息 |
| server action | `markClubMessageReadAction` | 標記已讀 |
| server action | `withdrawClubMessageAction` | 收回訊息 |

寫的部分刻意用 server action 而不是 API route，理由有二：受眾挑選器本來就會輸出隱藏欄位供一般表單使用，而這個 app 的其他發送流程（LINE OA 推播、活動表單）也都是 server action；以及 `isSameOriginMutation` 在 `NODE_ENV=production` 下要求 https，所以本機 production build（`next start` + http://localhost:3000）會把自家 API route 的 mutation 一律擋成 403——留言板的瀏覽器測試因此從來沒有真的送出過一則留言。改用 server action 之後，**送出 → 收到 → 已讀** 這條主要流程可以在 CI 的瀏覽器測試裡真的跑一遍（`e2e/tests/message-center.e2e.mjs`）。

兩個 GET 端點只讀不寫，錯誤一律回 `{ error: "request_failed" }`，不透出資料庫訊息。**端點本身不看 feature flag**（與祝福 IOU 一致）：flag 控制的是介面的推出，真正的授權邊界在 RPC。

## 共用出來的東西

`src/lib/api/json-request.ts`（同源判斷、有上限的 JSON 讀取）與 `src/lib/api/cursor.ts`（keyset 游標編解碼）是從留言板抽出來的，留言板改為呼叫同一份實作，行為由它原本的測試保住。訊息中心用的是游標那一份；請求防護留在共用模組裡，下一個需要 API mutation 的功能不必再抄一次。

`/messages` 也加進 `src/proxy.ts` 的 `PROTECTED_SESSION_PATHS`，所以匿名訪客會在串流開始前就被導向 `/login`，而不是先拿到一個 200 的空殼。
