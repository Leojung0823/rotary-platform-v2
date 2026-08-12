# 舊專案(ask-how-i-charge / Rotary-LINE-Connect)可參考項目

**建立日期：2026-08-12**
**狀態：Reference — 尚未實作，決策未鎖定**

## 背景

`ask-how-i-charge` 是這個專案（`rotary-platform-v2`）的前一次嘗試，實際產品是「Rotary-LINE-Connect」（扶輪社 LINE 整合系統）。使用者本人的說法：早期架構沒設計好，後來改一個地方會連帶壞好幾個地方，最後放棄重寫，就是現在的 `rotary-platform-v2`。

使用者要求盤點舊專案裡有沒有值得快速搬過來的功能/介面。以下是盤點結論（透過背景 agent 深入比對兩個 repo 產生，過程沒有修改任一個 repo）。

**重要限制**：舊 repo 只是本機暫時 clone 在 scratchpad 目錄，不是這個 repo 的一部分，之後可能會被清掉。這份文件是那次調查的存檔，不依賴舊 repo 是否還在。

## 相容性判斷原則

舊專案在 **2026-07-08 左右**做過一次身份模型重構，改成跟現在 `rotary-platform-v2` 一樣的 `people` / `app_accounts` / `club_memberships` 分離模型。

- **重構之後**寫的功能：概念上跟現在的身份模型相容，可以參考。
- **重構之前**寫的功能：用的是舊的 `profiles(id)` 外鍵，正是使用者說的「改一個地方壞好幾個」的重災區來源 — 這類只能參考 UI/互動想法，資料庫 schema 要重新設計，不能照搬 SQL。

## 盤點結果（依風險由低到高排序）

### 1. 自訂標籤功能（社友標籤）
- 舊 repo：`tags(id,name)` + `member_tags(user_id,tag_id)` 多對多、admin-only RLS、點擊切換的標籤 pill UI（`member-tags-dialog.tsx`，129 行）
- 現況：`rotary-platform-v2` 目前完全沒有標籤功能
- 時間點：2026-06-17，**在身份重構之前** → `user_id` 需要改成 `club_membership_id` 綁定
- 判斷：**UI 互動模式可直接抄，schema 要重新設計**

### 2. 社友名錄介面
- 舊 repo：`src/routes/_authenticated/directory.tsx`（290 行）+ `member-detail-dialog.tsx`。卡片式排版（頭像、英文名、扶輪頭銜、職業分類）、即時前端搜尋、置頂「本月壽星」區塊
- 現況：`rotary-platform-v2` 的 `src/app/(authenticated)/directory/page.tsx`（95 行）是純伺服器渲染表格，社團切換下拉選單，表單送出才搜尋，沒有頭像卡片、沒有生日功能
- 判斷：**渲染模式不同（Client SPA vs Server Component），不能照搬檔案，但卡片排版、生日置頂、即時篩選這幾個 UX 想法值得重做**，可以包成 Client Component，套用現有的 `list_club_member_directory` RPC

### 3. 訊息中心 / 公告發送
- 舊 repo：沒有完全同名的東西。最接近的是後台「公告中心」，在 `admin.tsx`（**4214 行的巨石檔案，本身就是「改一個地方壞多個地方」的高風險示範，不要照抄檔案結構**）裡，實際發送邏輯在獨立的 `announcements-tab.tsx`（174 行，乾淨）：`AudiencePicker` 選對象（全體/分組/職位/個人）+ 發送前預覽
- 現況：`rotary-platform-v2` 的「留言板」(`board/page.tsx`) 是社員互動討論區，性質不同，不是廣播工具
- 判斷：**對象選擇 + 發送前預覽這個互動流程值得搬，不要照抄檔案結構或耦合方式**

### 4. 首頁瘦身（目前正在做）
- 舊 repo 6/29 版本（commit `69f1964`）：475 行，6 個乾淨區塊 — 歡迎橫幅、近期活動、歷史活動、名錄卡片、生日卡片
- 舊 repo 目前 HEAD：膨脹到 1233 行，多塞了捷徑提醒、社團回顧、社團調查卡片 — 驗證了「越改越不人性化」
- `rotary-platform-v2` 現況：`src/app/(authenticated)/dashboard/page.tsx`，190 行
- 判斷：**參考 6/29 那版的精簡結構重新設計現在的 dashboard，避免繼續往上疊小工具**

### 5. 公開網站 + 活動自動顯示
- 舊 repo 確實有一個真正在用的公開網站（首頁/新聞/相簿/幹部/社史/服務計畫/聯絡我們），後台用 draft/published/archived 狀態管理內容（`public-website-tab.tsx`，1522 行）
- **但「活動」從頭到尾沒有被納入這個公開網站系統** — 後台 CMS 檔案完全沒有 event 相關程式碼，資料庫也沒有任何「活動要不要公開」的欄位，連舊專案自己的規劃文件（`docs/CLUB_WEBSITE_CMS.md`）都只列了新聞/相簿/幹部/社史/服務計畫，活動從來不在範圍內
- 判斷：**這是構想，0% 實作，沒有東西可以直接搬**，只有 draft/published/archived 這個 CMS 狀態模式可以參考
- **重要提醒**：`rotary-platform-v2` 目前所有頁面都在登入驗證後面（`src/proxy.ts` 的 `AUTH_SESSION_PATHS` 只有 board/club/clubs/dashboard/directory/events/features/me/platform/invite/join/reset-password，沒有任何真正對外公開、匿名可讀的頁面/RLS）。要做「活動可以被沒登入的人看到」，是這個系統第一次要開放匿名可讀的資料路徑，需要獨立設計 RLS（只開放 `is_public=true AND status='published'` 的活動），是架構決定，不是小改動。（**待確認**：使用者曾表示「rotary-platform-v2 有公開頁面」，與這裡的判斷不同，尚未釐清具體是指哪個頁面 — 下次討論這塊時應該先確認清楚，不要直接假設此文件的結論仍然成立。）

### 為什麼舊版「感覺比較快」
技術棧不同：舊 repo 是 TanStack Start/Router/Query（前端 SPA，查詢結果有快取，切頁不需要整頁等伺服器回應）；`rotary-platform-v2` 是 Next.js App Router，每次切頁都是 Server Component 重新打一次 Supabase。這是主要原因，不是效能調校問題。

### 明確不要碰的地方
- 舊 repo 的「會員管理 RPC」— git log 有一長串「修 member management RPC 診斷」的 commit，是持續在壞的地方，是反面教材不是參考範例
- 獻詞/致敬活動功能 — 舊團隊自己文件標記 No-Go，跳過
