# 交接筆記（2026-08-21）

> 這份文件取代 2026-08-13 版本。它的用途是讓另一個在別處工作的代理（Codex 或任何新開的 session）能在動手前對齊現況。
>
> **先讀根目錄的 `AGENTS.md`。** 那份是工作約定，記錄的是這個 repo 實際出過事的地方；本文件只補上「現在做到哪裡」。兩者不重複。

## 先確認你在看哪一份程式碼

權威來源是 GitHub `Leojung0823/rotary-platform-v2` 的 `main`。本文件描述的狀態對應 `fd9201e`。

本機若有 `/Users/leoj/Documents/Codex/2026-08-15/rotary/` 這類獨立快照，那是 8/15 的複本、不在 git 裡，內容已落後。動手前請：

```bash
git fetch && git checkout main && git pull
```

## 目前狀態

主線已完成「權限與資料底座 → 角色脈絡 → Shell → 社員首頁 → Dynamic QR 簽到 → GPS 簽到 → 出席 UI」全部階段。

Phase 2 標記為完成，Phase 3 只剩公告通知未實作。細節見 `DEVELOPMENT_ROADMAP.md`，該文件已於 8/21 與實際程式碼對齊過。

### 8/15 之後合併的 migration

| 功能 | 檔案 |
|---|---|
| 扶輪社名稱編輯 | `20260819000100_club_profile_rename_hardening.sql` |
| GPS 定位簽到 | `20260819000200_gps_checkin_v2.sql` |
| 邀請預覽身份比對修正 | `20260819000300_invitation_preview_viewer_match.sql` |
| 單次往返頁面查詢 | `20260819000400_single_round_trip_list_pages.sql` |
| 活動封面圖片 | `20260820000100_event_cover_images.sql` |
| 祝福 IOU（core / collections / reporting） | `20260820000200` · `000300` · `000400` |
| 生日祝福 | `20260820001000_birthday_wishes.sql` |
| 文件中心與年度交接 | `20260820002000_archive_handover.sql` |
| 出席 UI 投影層 | `20260821000100_attendance_page_projections.sql` |
| 幹部的社員模式 | `20260821000200_event_member_view.sql` |

**下一個可用編號是 `20260821000300`。** 撞號在這個 repo 已發生四次，開檔前先 `ls supabase/migrations/ | tail`。

### 不在原路線圖但已完成的工程工作

- 各頁查詢改為組合型 RPC，單頁循序往返由 2.7–4.1 次降到約 1.8 次。
- Render 機房由 Virginia 遷至新加坡，`/api/health` p50 由 520ms 降至 269ms。

## 三件最容易寫錯的事

### 1. 出席領域只有一套

canonical 是 `20260811000100_attendance_domain_core.sql`（PR #61），共 14 個函式。

PR #37 已關閉，它的 `20260731000100_v08_attendance_management.sql` 宣告了**同名的同樣 14 個函式**且時間戳較早。採用它會讓出席率的分母規則、公假與補出席折抵改由另一套定義生效，且不會有任何錯誤訊息。**不要使用該檔案。**

出席 UI 已於 8/21 完成，做法是在既有 RPC 之上加投影層：`get_my_attendance_page`、`get_club_attendance_page`、`list_club_attendance_events`。

### 2. 兩個函式簽章已變更

```
list_club_events(uuid)     ->  list_club_events(uuid, boolean)
list_my_event_page(uuid)   ->  list_my_event_page(uuid, boolean)
```

新增的 `p_as_member` 讓具管理權的人以一般社員身分提問，供社務幹部在社員模式下使用。舊的單參數呼叫已不存在。

### 3. 改寫既有函式不要憑記憶重打

用程式化方式從原始 migration 擷取，只改要改的那一行。這裡發生過重寫 `complete_member_invitation` 時漏掉「授予 member 角色」、重寫 `list_club_events` 時用錯欄位名。

## 提交前的閘門

```bash
npm run typecheck && npm run lint && npm test   # 目前 507 tests
npm run verify:db          # 完整 db reset + 33 個驗證 SQL
npm run check:migrations
```

改到 UI 或流程要另跑 `e2e/`。**不要標 `[skip ci]`**——這個 repo 曾因此累積上萬行未經 CI 驗證的程式碼。

新增資料表或 RPC 一律要有對應的 `supabase/verification/*.sql`，註冊進 `scripts/database-verification-files.txt`，且要測「誰**不能**做什麼」，涵蓋一般社員、外社社員、停權帳號。

## Feature flag：「已完成」不等於「看得到」

多數新功能的 flag 預設關閉，包含 `attendance_ui_v2`。

允許的 key 定義在 `20260820000400` 的 check constraint。新增 key 必須同時修改三個地方：`platform_feature_flags` 的約束、`platform_feature_flag_audit` 的約束，以及 `set_platform_feature_flag` 內的白名單。

導覽項目要與它開啟的頁面綁**同一個** flag，否則會出現點了顯示 404 的按鈕。

## 待辦

1. **PR #40 公告 / 站內通知**——唯一仍未實作的產品切片。該分支落後 113 個 commit 且與現行 dashboard／layout／多個 E2E 衝突，當設計參考即可，不要合併。
2. 補上生日祝福、文件交接、留言板的 feature flag。這三項目前沒有 flag，違反本專案自己的 rollback 原則；因導覽未連結、僅能以網址進入，風險有限但落差存在。
3. PR-07a 帳號安全與登入協助、PR-07b legacy cleanup，之後進入 M1 五位使用者形成性測試。

## 已關閉的 PR

- **#8** — 由根目錄的 `AGENTS.md` 取代。
- **#10** — PR-03 的決策紀錄，該功能早已上線。
- **#37** — 出席統計，功能已以投影層重新實作（見上）。
