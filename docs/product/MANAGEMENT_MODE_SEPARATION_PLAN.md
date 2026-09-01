# 改版企劃：幹部功能收斂到管理模式（v2.1）

建立日期：2026-09-01（Asia/Taipei）
修訂：v2.1，2026-09-01
狀態：`[>]` 程式搬遷已完成；待本機資料庫、Browser Smoke 與 staging 驗收
程式權威來源：GitHub `Leojung0823/rotary-platform-v2` 的 `main`
本次掃描基準：`origin/main@b137e516cb91b72c7252eb384924843b7874f93b`

> 本版已同步為 repository 內的唯一權威企劃；下載資料夾的原檔僅作為本次規格輸入。
> 程式搬遷在隔離分支完成，外部驗收尚未宣稱通過；不得把未執行的資料庫或瀏覽器驗收寫成完成。
>
> 本次實作分支：`codex/management-mode-separation`；目前尚未 push、開 PR 或部署。

> 先讀根目錄 `AGENTS.md`，特別是第 5 節「安全邊界」。本企劃**只動呈現層**，
> 不動權限模型，也不新增 migration。若第 0 階段發現必須新增 migration，
> 代表這不是呈現層問題，企劃需退回重寫，不得夾帶 `.sql` 硬做。

## 0. v2.1 的變更摘要

v1 的方向正確，v2.1 依 2026-09-01 的 `origin/main` 與 staging 證據，補上可直接實作與驗收的契約：

| 變更 | 原因 |
|---|---|
| 修正真正缺入口的領域 | 不只生日徵集；文件封存也不在目前管理導覽。活動則已可由執行秘書進入與建立草稿 |
| 將前置驗證改成「已知證據＋剩餘驗證」 | 權限 helper、staging migration、排程均已有證據，不再把已確認項目寫成未知 |
| 定案第一層管理導覽 | 固定上限 5 項：總覽、活動、出席、社員、訊息；低頻工具收進總覽卡片 |
| 管理卡片改用實際 permission key 過濾 | 一次呼叫 `list_my_permissions(clubId)`，不可只靠功能旗標或前端角色名稱 |
| 修正讀取與寫入的驗收契約 | 共用讀取 RPC 可回 `can_manage=false`；只有未授權的管理寫入 RPC 必須回 42501 |
| 修正封存上傳授權模型 | 封存由 API route 經 trusted admin 上傳，重點是 route、begin/complete/fail RPC 與失敗清理，不是使用者 Storage policy |
| 「加 → 驗 → 減」改為共用管理元件 | 新舊頁暫時共用同一管理 panel，避免複製兩套 JSX 與 action wiring |
| 重排搬遷順序 | 生日、封存先修可達性，活動最後做資訊架構整理；共享外殼檔案不得平行修改 |

## 1. 產品決定

社員頁面只放社員自己的事。幹部的建立、審核、發布、隱藏、重跑等操作，一律移到管理模式
（`/clubs/[clubId]/...?mode=management`）。

## 2. 觸發這件事的實際問題

生日祝福徵集。幹部要管題庫、發布投稿或重跑當月批次，目前必須：

```
以社員身分登入 → 首頁 → 社內互動 → 生日祝福 → 生日祝福任務
```

管理後台沒有任何入口。而且**執行秘書不是社員**——`club_operator_permissions` 與
`club_memberships` 由 `active_member_cannot_be_operator` 互斥——所以執秘帳號根本走不到這條路徑，
只有社長、秘書這種本身也是社員的角色進得去。

這不是畫面整齊的問題，是**有一整類幹部碰不到自己該管的功能**。

文件封存也有相同的**正常導覽不可達**問題：目前 role-aware 管理導覽只有總覽、活動、社員、
邀請、社務資料，以及依旗標加入的出席、祝福 IOU、訊息，沒有生日徵集或文件封存；
role-aware 管理總覽也沒有 `/features` 入口。因此非社員的執行秘書無法從正常管理流程找到封存。

活動不同：它已在管理模式第一層導覽，既有 `officer-mode.e2e.mjs` 也已驗證無社籍的 operator
可開啟活動頁並看到「建立活動草稿」。所以生日與封存先修可達性，活動最後才做資訊架構整理。

## 3. 目標與非目標

**目標**

- 執行秘書能從正常管理導覽進入並完成生日徵集與文件封存管理操作。
- 社員頁面不再出現只有幹部能用的控制項。
- 幹部功能有一致的入口：管理模式。
- 手機第一層管理導覽維持最多 5 項，且每張管理卡片依資料庫權限過濾。

**非目標**

- 不改權限模型、不改 RPC、不改 RLS、不新增 migration。
- 不改任何功能的行為與規則（配額、匿名、題庫、IOU 規則等一律不動）。
- 不重新設計管理模式的視覺系統；沿用現有 `clubs/[clubId]/*` 形狀，只重新分配第一層導覽與社務總覽卡片。
- 不把平台管理員自動當成任何社的執行幹部，也不改變平台模式與社務模式的分界。

## 4. 現況盤點（2026-09-01 掃描 `main`）

### 4.1 既有機制已經存在

`src/components/role-aware-app-shell.tsx` 已有完整模式切換：`availableModes`、
「進入社務管理」、「返回社員模式」，管理入口固定為
`/clubs/{clubId}/members?mode=management`。`src/lib/experience-context` 提供 `defaultMode`。

`src/lib/role-shells.ts` 的管理導覽目前固定有總覽、活動、社員、邀請、社務資料，並依旗標
加入出席、祝福 IOU、訊息；全部開啟時可達 8 項。生日徵集與文件封存都不在其中。
`src/components/role-aware-dashboard.tsx` 的管理總覽目前只有「前往社員管理」，沒有工具卡片。

**所以本企劃不是新建一套架構，而是把兩個不可達領域收編，並整理已可達的活動管理。**

### 4.2 已符合目標，不用動

社員頁只放一顆通往管理頁的連結，這就是要複製的形狀：

| 社員頁 | 連往 |
|---|---|
| `attendance/page.tsx` | `/attendance/manage` |
| `blessings/page.tsx` | `/clubs/{id}/blessing-iou?mode=management` |
| `events/page.tsx`（管理簽到那一顆） | `/events/{id}/checkin?clubId=...` |

### 4.3 管理頁最終承接的完整清單

**後端流程（server action、API route、Storage 操作）與前端元件分開列。**
實作者必須同時搬兩欄，只搬左欄會留下沒有後端的表單，只搬右欄會留下沒有入口的 action。

#### 生日祝福徵集

| 管理頁承接的後端流程 | 相關元件 |
|---|---|
| `runBirthdayCollectionMonthAction` | 批次重跑表單 |
| `publishBirthdayCollectionSubmissionAction` | 投稿審核清單 |
| `hideBirthdayCollectionSubmissionAction` | 投稿審核清單 |
| `createBirthdayCollectionQuestionAction` | 題庫 CRUD 表單 |
| `updateBirthdayCollectionQuestionAction` | 題庫 CRUD 表單 |

留在社員頁：`saveBirthdayCollectionSubmissionAction`、
`deleteBirthdayCollectionSubmissionAction`、`declineBirthdayCollectionAssignmentAction`，
以及已發布祝福的瀏覽。

#### 活動

| 管理頁承接的後端流程 | 相關元件 |
|---|---|
| `createEventAction` | `EventCreateForm` |
| `publishEventAction` | 活動清單的發布控制項 |
| `cancelEventAction` | 活動清單的取消控制項 |
| `recordEventCoverAction` | `EventCoverUpload` |
| Storage 封面上傳（bucket 直傳） | `EventCoverUpload` |

留在社員頁：瀏覽、`registerEventAction`、「本人簽到」、既有的「管理簽到」連結。

#### 封存與交接

| 管理頁承接的後端流程 | 相關元件 |
|---|---|
| `createRotaryYearAction` | 年度管理表單 |
| `updateRotaryYearAction` | 年度管理表單 |
| `createArchiveItemAction` | 項目建立表單 |
| `updateArchiveItemAction` | 項目編輯表單 |
| `archiveArchiveItemAction` | 項目清單控制項 |
| `updateHandoverChecklistAction` | 交接清單 |
| `confirmArchiveHandoverAction` | 交接確認 |
| `POST /api/v1/archive/uploads` | `ArchiveUploadForm` |
| Storage 文件上傳 + 上傳完成導向 | `ArchiveUploadForm` |

留在社員頁：唯讀瀏覽（資料庫已隱藏 `officers_only`，社員僅見 `club_internal`）。

### 4.4 誤報，不在範圍

掃描時若只數 `canManage` 出現次數會多抓兩個檔案，實際上它們沒有幹部控制項：

- `dashboard/page.tsx`——`canManage` 只用來換文案（「可管理 N 個社」對「加入 N 個社」）。
- `events/[eventId]/page.tsx`——只有 `registerEventAction`，那是社員報名。

### 4.5 已確認可達，不是權限修補

活動已在管理模式第一層導覽。既有 `e2e/tests/officer-mode.e2e.mjs` 已涵蓋：沒有社員身分的
operator 進入活動頁後可看到「建立活動草稿」。因此活動搬頁是資訊架構一致性工作，
不是為執行秘書新增權限；若第 0 階段的精準 club 與寫入驗證失敗，應先修獨立缺陷。

## 5. 前置驗證（開工前必須完成）

> 已確認的證據不再標成「待確認」。剩餘工作是以隔離 fixture 做精準讀寫驗證；任一關鍵流程
> 不通過，都不得開始對應領域的搬頁 PR，也不得用前端放寬或新增 `.sql` 偷渡修正。

### 5.1 已確認的權限基礎

- `public.list_my_permissions(p_club_id)` 會透過 `current_has_club_permission` 回傳目前使用者在指定社的
  permission key；管理總覽應只呼叫一次，再用結果過濾所有功能卡片。
- `current_has_club_permission` 接受平台管理員、有效 `club_role_assignments`，以及有效且
  `permission_level='club_manager'` 的 `club_operator_permissions`；執行秘書沿用 `secretary` 的 permission set。
- `secretary` 具備 `member.manage` 與 `event.manage`，所以依目前程式，執行秘書可管理生日、活動與封存。
- `current_can_manage_birthday_collection` 與 `current_can_manage_archive` 都以 `member.manage` 判定；
  活動與活動封面則以 `event.manage` 判定。
- `current_can_access_archive` 允許有效社員或 archive manager 讀取；因此不能只用是否有社籍來推論可見性。

讀取 RPC 是社員與幹部共用投影。名稱含 `my` 不代表只接受 `club_memberships`；驗收應看回傳的
club ID 與 `can_manage`，不能僅依函式名稱推測。

### 5.2 剩餘的隔離讀寫驗證

在本機 fixture／測試資料庫逐格驗證，最後才用 staging 專用測試社做 hosted acceptance。
不得修改正式社團資料；`confirmArchiveHandoverAction` 等不可逆或追加式操作只能用可丟棄 fixture。

| 流程 | 實際授權層 | 目前程式判定 | 驗證狀態與關卡 |
|---|---|---|---|
| 生日五支管理 action | RPC：`member.manage` | 執秘可管理 | `[x]` DB 驗證與 staging 排程；`[ ]` PR 2a 後做 hosted acceptance，通過才進 2b |
| 活動建立／發布／取消 | RPC：`event.manage` | 執秘可管理 | `[x]` 既有 operator E2E 可建立草稿；`[ ]` 階段 0：發布／取消 fixture |
| 活動封面上傳 | Storage policy → `event.manage`，再記錄 action | 執秘可管理 | `[ ]` 階段 0：上傳與跨社拒絕 fixture |
| 封存七支 action | RPC：`member.manage` | 執秘可管理 | `[ ]` 階段 0：每支 mutation 的成功、42501 與跨社 fixture |
| `POST /api/v1/archive/uploads` | same-origin + auth → begin/complete/fail RPC | 執秘可管理 | `[ ]` 階段 0：成功、失敗清理與跨社 fixture |
| 封存檔案寫入 | API route 使用 trusted admin Storage client | 不走終端使用者 Storage policy | `[ ]` 階段 0：確認 route 不繞過 begin/complete/fail 授權 |

活動封面的 Storage policy 已存在 migration SQL；封存上傳則是 API route 的 trusted admin 流程。
兩者不得用同一種「檢查 Storage policy」方法驗收。

### 5.3 staging 版本與執行證據（已完成）

- `[x]` `20260901000100_birthday_collection_manager_permissions.sql` 已套用 staging。
- `[x]` staging health：`status=ok`、`environment=staging`、revision `2b0f68242f7c`；
  `issues=[]`，另有一項 `DEPLOYMENT_WARNING`，不得誤報為零警告。
- `[x]` birthday scheduler run `33467004279` 成功：`generated_count=1`、`notified_count=1`、
  `failed=0`、`skipped=1`；被略過的另一社沒有有效管理者。

### 5.4 文件一致性

- `[x]` `docs/product/CURRENT_SESSION_HANDOFF.md` 已更新到 2026-09-01，並保留 2026-09-01 的生日修正紀錄。
- `[x]` 本版已取代 repository 內的 v1；`CURRENT_SESSION_HANDOFF.md` 與 `TO-DO-LIST.md` 已指向這一份
  canonical 文件。後續只更新本文件，不再新增第二份管理模式企劃。

## 6. 角色與 permission key 矩陣（實作與測試的共同依據）

「幹部」不是授權條件。UI 必須以 `list_my_permissions(clubId)` 的結果判斷；
**若與實際 RPC 授權不符，以 RPC 為準並回頭修正本表**，不得修改 RPC 遷就企劃。

| 角色 | 生日徵集 `member.manage` | 活動 `event.manage` | 封存 `member.manage` | 預期畫面 |
|---|---|---|---|---|
| 社長 | 管理 | 管理 | 管理 | 顯示三個管理入口 |
| 秘書 | 管理 | 管理 | 管理 | 顯示三個管理入口 |
| 執行秘書 | 管理 | 管理 | 管理 | 非社員，仍顯示三個管理入口 |
| 財務 | 無 | 無 | 無 | 只用社員頁；不顯示三張管理卡片 |
| 一般社員 | 無 | 無 | 無 | 只用社員頁；直開管理頁被拒絕 |
| 外社社員 | 無 | 無 | 無 | 指定社團的管理讀取與寫入均拒絕 |

「管理」＝可進入管理頁並執行該領域操作。
「一般社員」＝可用社員頁功能，直開管理頁網址須被後端拒絕。

平台管理員是獨立的 platform mode 身分，不自動列為社務導覽受眾。底層 helper 即使允許平台管理員
人工處理資料，也不得因此把任何社設成其作用社別，或讓平台模式自動出現社務卡片。
`permission_level='read_only'` 的執行秘書不具備上述管理權限，也不得看到管理卡片。

## 7. 目標架構

沿用 `clubs/[clubId]/*` 慣例，`clubs/[clubId]/blessing-iou` 是現成範本。

| 新增管理頁 | 收容 |
|---|---|
| `clubs/[clubId]/birthday-collection` | 批次重跑、投稿審核、題庫 CRUD |
| `clubs/[clubId]/events` | 建立、發布、取消、封面上傳 |
| `clubs/[clubId]/archives` | 扶輪年度、封存項目、交接清單與確認、文件上傳 |

社員頁各留一顆連結，形狀與 `attendance` 一致。舊網址全部保留為社員頁：

- `/events`：社員瀏覽與報名
- `/archives`：社員唯讀社史
- `/birthday-collection`：社員任務與祝福牆

舊的 `?mode=management` 收藏網址保留一個版本的相容導向，送往新的管理頁。

## 8. 路由與導覽契約

### 8.1 管理頁的拒絕條件

三支讀取 RPC 是社員與幹部共用投影，一般社員呼叫時**不一定**得到 42501，
可能只是拿到 `can_manage = false`。因此每個新管理頁必須在伺服器端依序執行：

1. 以網址中的 `clubId` 查詢。
2. 確認資料庫回傳的社團就是網址中的社團。
3. 確認 `canManage / can_manage === true`。
4. 任一項未通過，立即導向 `/access-denied`，**在此之前不得渲染任何管理資料**。

**活動頁特別注意**：`list_my_event_page` 在找不到指定社團時可能回退到第一個合法社團。
新管理頁必須拒絕 club ID 不一致，不得在 A 社網址下顯示 B 社資料。

此契約不需要新 migration，但必須寫進驗收條件並有對應測試。

### 8.2 action 的回程網址

目前這些 action 的成功／失敗網址寫死在舊社員頁：

- 生日：`/birthday-collection?clubId=...`
- 活動：`/events?clubId=...`
- 封存：`/archives?clubId=...`
- 文件上傳完成後亦寫死回 `/archives`

若只搬表單不改回程，幹部按下「發布／重跑／儲存」後會被送回社員頁，看起來像功能消失。
搬遷 PR 必須同時處理：

| action 類型 | 回程 |
|---|---|
| 生日管理 | `/clubs/[clubId]/birthday-collection?mode=management` |
| 活動管理 | `/clubs/[clubId]/events?mode=management` |
| 封存管理、上傳完成 | `/clubs/[clubId]/archives?mode=management` |
| 社員 action | 維持原社員頁 |

規則：**不接受瀏覽器傳入的 `returnUrl`**，由伺服器依 action 類型組合安全路徑。
`revalidatePath()` 必須同時涵蓋新的管理頁。

### 8.3 導覽層級

手機底部導覽使用：

```css
grid-template-columns: repeat(var(--nav-count), minmax(0, 1fr));
```

管理模式全開時已可能約 8 項。再加三項會變成 11 欄，每顆按鈕過窄，
不符合高齡使用者與 48px 點擊目標。

第一層管理導覽定案如下，順序固定：

1. 總覽
2. 活動
3. 出席（`attendance_ui_v2` 開啟時）
4. 社員
5. 訊息（`announcements_v09` 開啟時）

旗標關閉時就少一項，**不得拿其他低頻工具動態補位**。因此任何組合都不超過 5 項，且使用者不會
因旗標狀態不同而看到按鈕順序跳動。進入生日、封存等二級管理頁時，「總覽」應維持目前位置狀態。
`resolveCurrentNavigationItemId` 應以明確的二級工具路由對照到 `overview`，不可把整個 `/clubs/*`
都視為總覽，否則社員管理會失去自己的亮起狀態。階段 4 若建立 club-specific 活動管理頁，
管理模式的活動導覽 href 必須同步改到該頁，仍亮起「活動」。

社務總覽新增「社務工具」卡片區，收容：

| 卡片 | 顯示條件 |
|---|---|
| 邀請管理 | `invitation.manage` |
| 社務資料 | 沿用現有 identity 頁的讀取／操作權限 |
| 祝福 IOU | 旗標開啟，並沿用既有 blessing IOU management projection |
| 生日徵集 | `member.manage` 且 `birthday_wishes_collection_v1` 開啟 |
| 文件封存與交接 | `member.manage` 且 `archive_handover_v1` 開啟 |
| 執行秘書管理 | 沿用該功能既有的精準 permission 判斷 |

總覽只對作用社別呼叫一次 `list_my_permissions(clubId)`，把 permission set 傳給所有卡片；
不得每張卡片各查一次，也不得只看角色名稱。功能旗標查詢與其他互不相依的查詢用 `Promise.all`
並行。這會新增至多一次權限查詢往返，實作 PR 必須記錄是否增加 TTFB；若已有同請求的 permission
結果，應直接重用，不重複查詢。本企劃不為此新增 RPC 或 migration。

階段 1 只移動**已存在且可用**的目的地。生日與封存的新卡片，必須等各自的「加」PR 已建立新路由
才顯示，避免總覽先出現死連結。這一階段會刻意改變導覽入口位置，但不改領域規則、權限或 mutation 行為。

### 8.4 跨模式導覽

社員頁切到管理頁屬於跨模式導覽，應使用完整導覽的 `<a href>` 並帶 `?mode=management`。
使用 Next.js `Link` 時共享 layout 可能保留舊的社員模式外殼，不可直接照抄現有範例。

### 8.5 新管理頁的共用元件

「加」PR 不得複製舊頁整段管理 JSX。每個領域先抽出一個共用管理元件，例如：

- `BirthdayCollectionManagementPanel`
- `ArchiveManagementPanel`
- `EventManagementPanel`

「加」期間由舊社員頁與新管理頁暫時共用；staging 驗收後，「減」PR 只移除舊頁的引用。
如此 action、錯誤顯示與欄位不會分裂成兩套。共用的是呈現與 wiring，不得把 route/RPC 授權搬進元件。

## 9. 執行階段

### 階段 0：前置驗證

保留第 5.3 已完成的 staging 證據；用本機 fixture 補完第 5.2 標為「階段 0」的讀寫、跨社與失敗清理測試。
輸出：測試名稱、角色、club ID 來源、預期與實際結果。**此階段不修改正式資料，也不寫產品程式碼。**

### 階段 1：管理入口與導覽基礎（PR 1）

依 8.3 調整第一層導覽與社務總覽卡片區，但尚未新增生日或封存卡片。至少會碰：

- `src/lib/role-shells.ts`
- `src/lib/role-shells.test.ts`
- `src/components/role-aware-dashboard.tsx`
- `src/components/role-aware-app-shell.tsx`
- 對應 dashboard／shell 測試

只有 props 確實需要上提時才碰 authenticated layout。此 PR 會改變入口位置，但不改權限、資料內容、
action 或 RPC；邀請、社務資料、祝福 IOU 等既有目的地移入總覽後仍須可達。

### 階段 2：生日徵集（PR 2a、2b）

**PR 2a「加」**：抽出 `BirthdayCollectionManagementPanel`，新增
`clubs/[clubId]/birthday-collection` 管理頁，實作 8.1 拒絕條件與 8.2 回程網址，再加入總覽卡片。
**社員頁仍引用同一個 panel**，不是複製一套。部署 staging 後，以執秘帳號實測重跑批次。

**PR 2b「減」**：確認 2a 在 staging 可用後，移除社員頁對管理 panel 的引用，加上「前往徵集管理」連結，
更新既有邊界測試。

拆兩步的理由：任何時刻都沒有壞掉的頁面；回滾成本只有 2b；執秘能否使用是在真環境驗證，
不是靠 code review 推測。

### 階段 3：封存與交接（PR 3a、3b）

**PR 3a「加」**：抽出 `ArchiveManagementPanel`，新增 `clubs/[clubId]/archives` 管理頁，
實作精準 club／`can_manage` 拒絕、管理 action 回程、API 上傳完成導向與總覽卡片。舊頁暫時共用 panel。

**PR 3b「減」**：staging 驗證建立、編輯、上傳、失敗清理與交接權限後，從社員頁移除管理 panel，
保留唯讀社史與「前往文件管理」連結。不可逆的交接確認只用專用測試資料。

### 階段 4：活動（PR 4a、4b）—— 條件式 IA 整理

活動已可由執秘管理，只有在階段 2、3 穩定，且確定社員頁／管理頁分離能降低混亂時才執行。
同樣先抽 `EventManagementPanel`、新增精準 club 管理頁並驗證，再從社員頁移除管理控制項。
封面直傳的 Storage policy 與 `recordEventCoverAction` 必須一起驗收。

### 階段順序不可平行

雖然三個領域彼此獨立，但都會碰到：`role-shells.ts`、管理導覽測試、
`RoleAwareAppShellBoundary`、功能旗標傳遞、管理頁目前位置判斷。
多人／多 AI 平行開發會在這些檔案衝突。**必須依序**。

若階段 2 或 3 的實際成本顯著高於預期，後續階段應另開企劃重新評估，
不得因為「已經寫在同一份文件裡」而硬做。

## 10. 不可違反的邊界

**這是資訊架構改動，不是安全修補。** 依 `AGENTS.md` 第 5 節，mode、active-club cookie 與導覽
visibility **只能作 UX**，protected route、RPC 與 RLS 仍要各自授權。

- **不可以**把任何權限判斷從 RPC 移到前端。
- **不可以**因為「入口只在管理頁」就放寬後端檢查。
- **不可以**把 `?mode=management` 當成權限；它是偏好。
- 每一支被搬動的 action，其 RPC 端授權必須原封不動；搬遷 PR 不應出現 `.sql` 變更。

換句話說：**搬完之後，一位一般社員手動輸入管理頁網址仍然要在伺服器端被擋下來**；
未授權的管理 mutation 也必須由 RPC 擋下。共用讀取 RPC 可以安全回傳 `can_manage=false` 與
不含管理內容的投影，不能為了追求 42501 而破壞社員頁既有讀取。

## 11. 測試策略

### 11.1 五類測試分開，不可混稱

v1 的這個斷言：

```ts
expect(memberPage).not.toContain("runBirthdayCollectionMonthAction")
```

只證明社員頁沒有匯入 action，**不能**證明一般社員沒有權限。兩者要分開：

| 類型 | 內容 |
|---|---|
| 資訊架構測試 | 「減」PR 後社員頁不渲染管理 panel，DOM 不含管理控制項；「加」期間驗證新舊頁共用同一 panel |
| 路由測試 | 一般社員直開管理網址被導向 `/access-denied`，且不曾渲染管理資料 |
| 權限測試 | 共用讀取 RPC 可回 `can_manage=false`；一般社員、財務、外社社員呼叫管理 mutation RPC 得到 42501 |
| 正向測試 | 社長、秘書、執行秘書皆能完成該領域操作 |
| 租戶測試 | A 社管理者不能操作 B 社資料；A 社網址不得顯示 B 社資料 |

邊界測試放在 `src/lib/**/*security-boundary.test.ts`，與既有慣例一致。
既有的 `src/lib/birthdays/collection-security-boundary.test.ts` 等檔案有斷言頁面內容，
搬動後需同步更新，**但不可為了讓測試通過而放寬斷言**。

### 11.2 執行秘書專項 E2E

以執秘帳號從管理總覽進入生日徵集管理頁並成功重跑當月批次；再從總覽進入文件封存，
完成一個可回收測試項目的建立、上傳與編輯。**這是本企劃最重要的驗收**，因為它證明
非社員 operator 不只後端有權限，也有找得到、走得完的操作路徑。

### 11.3 CI 節奏

文件修改與小型純重構不手動跑 CI 或 Browser Smoke；每個小 PR 先跑本機針對性測試。
階段 2、3 的整合 PR 會新增管理路由並改變真實操作路徑，屬於大型行為修改，各跑一次完整
Browser Smoke；階段 4 若執行也同樣跑一次。會改資料的瀏覽器測試依 `AGENTS.md` 第 6 節只在
單一 viewport、專用 staging 測試社執行。

**不要使用 `[skip ci]`**，讓現有的變更範圍 gate 自行決定跑輕量或完整流程。
（文件提交 `2311445` 使用了 `[skip ci]`，與 `AGENTS.md` 規則不一致，後續不沿用。）

## 12. 驗收條件

每一項都必須是可判定的。

1. **資訊架構**：完成對應領域的「減」PR 後，`events`、`archives`、`birthday-collection` 社員頁
   不渲染管理 panel；且以一般社員身分渲染時，DOM 不含管理控制項的指定 test id。
2. **正向路徑**：社長、秘書可從管理模式完成搬移後的全部幹部操作。
3. **核心修復**：執行秘書可從管理總覽進入生日徵集並成功重跑當月批次，也可進入文件封存完成
   可回收測試資料的建立、編輯與上傳。
4. **拒絕路徑**：財務、一般社員手動輸入管理頁網址，被導向 `/access-denied`，
   且回應中不含任何管理資料；共用讀取 RPC 回 `can_manage=false`，管理 mutation RPC 得到 42501。
5. **租戶邊界**：A 社管理者以 B 社 clubId 開啟管理頁被拒絕；活動頁不得回退顯示其他社團。
6. **回程正確**：每一個搬移後的管理 action，成功與失敗都回到對應的管理頁，不落到社員頁。
7. **導覽**：第一層管理導覽依序為總覽、活動、出席、社員、訊息，旗標關閉時只減少、不補位，
   項目數永遠 ≤ 5；進入二級管理頁時「總覽」亮起；功能旗標關閉或 permission 缺少時卡片不顯示。
8. **無 migration**：搬遷 PR 不包含任何 `supabase/migrations/*.sql` 變更。
9. **驗證**：各 PR 的針對性測試通過；每個領域整合完成時
   `npm run typecheck && npm run lint && npm test`、`npm run verify:db`、
   `npm run check:migrations` 全數通過，且該階段 Browser Smoke 通過。不得把未執行寫成通過。
10. **效能**：管理總覽每個請求最多取得一次 permission set，功能旗標與獨立資料並行；
    PR 記錄查詢數與 TTFB 是否退步，沒有量測就明寫「未量測」。

## 13. 使用者告知

幹部熟悉的操作路徑會改變。搬遷後：

- 社員頁的「前往管理」連結旁加一行短說明，指出功能已移至社務管理。
- 該說明至少保留一個版本週期。
- 舊的 `?mode=management` 收藏網址保留相容導向一個版本。

對本產品的使用族群而言，這不是可省略的細節。

## 14. 相關文件

- `AGENTS.md` 第 5 節：安全邊界
- `AGENTS.md` 第 6 節：瀏覽器測試規則
- `docs/product/EXPERIENCE_CONTEXT.md`：模式與 active club 的既有語意
- `docs/product/TO-DO-LIST.md` 第 3 項：本企劃的待辦入口
- `docs/product/CURRENT_SESSION_HANDOFF.md`：本輪實作狀態、驗證結果與未完成外部條件
- `docs/mvp/BIRTHDAY_WISHES_V2_PLAN.md`：生日徵集的產品規則，本企劃不得更動
- `supabase/migrations/20260901000100_birthday_collection_manager_permissions.sql`：階段 2 的前提
- `supabase/migrations/20260901000200_birthday_collection_dispatch_lead_month.sql`：目前 scheduler 行為依據
