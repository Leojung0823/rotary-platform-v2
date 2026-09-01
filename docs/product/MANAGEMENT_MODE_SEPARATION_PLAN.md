# 改版企劃：幹部功能收斂到管理模式

建立日期：2026-09-01（Asia/Taipei）
狀態：`[!]` 待產品確認未決問題後開工
權威來源：GitHub `Leojung0823/rotary-platform-v2` 的 `main`

> 先讀根目錄 `AGENTS.md`，特別是第 5 節「安全邊界」。本企劃**只動呈現層**，
> 不動權限模型，也不新增 migration。

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

## 3. 目標與非目標

**目標**

- 社員頁面不再出現只有幹部能用的控制項。
- 幹部功能有一致的入口：管理模式。
- 執行秘書能碰到他該管的社務功能。

**非目標**

- 不改權限模型、不改 RPC、不改 RLS、不新增 migration。
- 不改任何功能的行為與規則（配額、匿名、題庫、IOU 規則等一律不動）。
- 不重新設計管理模式的視覺；沿用現有 `clubs/[clubId]/*` 形狀。

## 4. 現況盤點（2026-09-01 掃描 `main`）

### 4.1 既有機制已經存在

`src/components/role-aware-app-shell.tsx` 已有完整模式切換：`availableModes`、
「進入社務管理」、「返回社員模式」，管理入口固定為
`/clubs/{clubId}/members?mode=management`。`src/lib/experience-context` 提供 `defaultMode`。

**所以本企劃不是新建一套架構，是把三個漏網頁面收編。**

### 4.2 已符合目標，不用動

社員頁只放一顆通往管理頁的連結，這就是要複製的形狀：

| 社員頁 | 連往 |
|---|---|
| `attendance/page.tsx` | `/attendance/manage` |
| `blessings/page.tsx` | `/clubs/{id}/blessing-iou?mode=management` |
| `events/page.tsx`（管理簽到那一顆） | `/events/{id}/checkin?clubId=...` |

### 4.3 需要搬遷（本企劃的工作範圍）

| 社員頁 | 內嵌的幹部 server action |
|---|---|
| `events/page.tsx` | `publishEventAction`、`cancelEventAction`、`EventCreateForm`、`EventCoverUpload` |
| `archives/page.tsx` | `createRotaryYearAction`、`updateRotaryYearAction`、`createArchiveItemAction`、`updateArchiveItemAction`、`archiveArchiveItemAction`、`updateHandoverChecklistAction`、`confirmArchiveHandoverAction` |
| `birthday-collection/page.tsx` | `runBirthdayCollectionMonthAction`、`publishBirthdayCollectionSubmissionAction`、`hideBirthdayCollectionSubmissionAction`、`createBirthdayCollectionQuestionAction`、`updateBirthdayCollectionQuestionAction` |

### 4.4 誤報，不在範圍

掃描時若只數 `canManage` 出現次數會多抓兩個檔案，實際上它們沒有幹部控制項：

- `dashboard/page.tsx`——`canManage` 只用來換文案（「可管理 N 個社」對「加入 N 個社」）。
- `events/[eventId]/page.tsx`——只有 `registerEventAction`，那是社員報名。

## 5. 目標架構

沿用 `clubs/[clubId]/*` 慣例，`clubs/[clubId]/blessing-iou` 是現成範本。

| 新增管理頁 | 收容 |
|---|---|
| `clubs/[clubId]/events` | 建立、發布、取消、封面上傳 |
| `clubs/[clubId]/archives` | 扶輪年度、封存項目、交接清單與確認 |
| `clubs/[clubId]/birthday-collection` | 批次重跑、投稿審核、題庫 CRUD |

社員頁各留一顆連結，形狀與 `attendance` 一致。

## 6. 執行內容

三頁彼此獨立，可以拆成三個 PR 分別合併，降低一次改動的風險。

### 6.1 生日祝福徵集（建議先做）

理由：它是觸發本企劃的案例，而且是唯一有「整類角色進不去」問題的。

1. 新增 `src/app/(authenticated)/clubs/[clubId]/birthday-collection/page.tsx`。
2. 搬入題庫 CRUD、投稿發布／隱藏、`runBirthdayCollectionMonthAction` 表單。
3. `birthday-collection/page.tsx` 只留社員自己的事：
   `saveBirthdayCollectionSubmissionAction`、`deleteBirthdayCollectionSubmissionAction`、
   `declineBirthdayCollectionAssignmentAction`，以及已發布祝福的瀏覽。
4. 社員頁在 `canManage` 時顯示一顆「前往徵集管理」連結。
5. 在社務管理導覽加入該頁入口，確認**執行秘書身分可達**。

### 6.2 活動

1. 新增 `clubs/[clubId]/events`。
2. 搬入 `EventCreateForm`、`publishEventAction`、`cancelEventAction`、`EventCoverUpload`。
3. `events/page.tsx` 留下瀏覽、`registerEventAction`、「本人簽到」與既有的「管理簽到」連結。

### 6.3 封存與交接

1. 新增 `clubs/[clubId]/archives`。
2. 搬入第 4.3 節列出的全部七個 action。
3. **注意**：`archives/page.tsx` 目前除了瀏覽以外幾乎全部在 `canManage` 之內，搬完之後社員頁會
   變成純唯讀。這一頁的去留見第 9 節未決問題。

## 7. 不可違反的邊界

**這是資訊架構改動，不是安全修補。** 依 `AGENTS.md` 第 5 節，mode、active-club cookie 與導覽
visibility **只能作 UX**，protected route、RPC 與 RLS 仍要各自授權。

因此本企劃執行時：

- **不可以**把任何權限判斷從 RPC 移到前端。
- **不可以**因為「入口只在管理頁」就放寬後端檢查。
- **不可以**把 `?mode=management` 當成權限；它是偏好。
- 每一支被搬動的 action，其 RPC 端的授權必須原封不動；搬遷 PR 不應出現 `.sql` 變更。

換句話說：**搬完之後，一位一般社員手動輸入管理頁網址仍然要被擋下來**，而且是被後端擋，
不是因為找不到連結。

## 8. 測試策略

不需要新 migration，所以 `verify:db` 的內容不變，但仍要跑完整流程。

- **邊界測試**（新增）：掃描社員頁原始碼，斷言幹部 action 不再被匯入。例如
  `expect(memberPage).not.toContain("runBirthdayCollectionMonthAction")`。
  這類測試放在 `src/lib/**/*security-boundary.test.ts`，與既有慣例一致。
- **邊界測試**（新增）：斷言新管理頁確實掛在 `clubs/[clubId]` 之下，且沿用既有權限檢查。
- **既有測試**：`src/lib/birthdays/collection-security-boundary.test.ts` 等檔案有斷言頁面內容，
  搬動後需要同步更新，**但不可以為了讓測試通過而放寬斷言**。
- **瀏覽器測試**：每頁至少一條幹部路徑與一條社員路徑。依 `AGENTS.md` 第 6 節，會改資料的測試
  只在單一 viewport 執行。
- **執行秘書專項**：新增一條 e2e，以執秘帳號進入生日徵集管理頁並成功重跑批次。這是本企劃
  最重要的驗收，因為那正是目前做不到的事。

## 9. 未決問題（開工前要決定）

1. **`archives` 社員頁是否保留？** 搬完之後它只剩唯讀瀏覽。要保留為社員可查閱的社史，
   還是整頁併入管理模式、社員不再看得到？
2. **執行秘書的落點。** 他不是社員，卻要管理社務。管理模式導覽需要容得下這個身分——
   要沿用現有 `/clubs/[clubId]/operators` 的權限形狀，還是另立導覽群組？
3. **搬遷期間的舊網址。** 社員若已收藏 `/birthday-collection?clubId=...`，搬走管理區塊後
   該頁仍存在（社員功能還在），所以不需要 redirect；但活動與封存若整併，要決定是否保留舊路徑。

## 10. 驗收條件

1. 一般社員在 `events`、`archives`、`birthday-collection` 三頁看不到任何幹部控制項。
2. 社長、秘書可從管理模式完成搬移後的全部幹部操作。
3. **執行秘書可以進入生日徵集管理頁並成功重跑當月批次**——這是目前做不到、修好才算數的一項。
4. 財務與一般社員即使手動輸入管理頁網址仍被拒絕，且拒絕來自後端。
5. 搬遷 PR 不包含任何 `supabase/migrations/*.sql` 變更。
6. `npm run typecheck && npm run lint && npm test`、`npm run verify:db`、
   `npm run check:migrations` 全數通過，Browser Smoke 通過。

## 11. 相關文件

- `AGENTS.md` 第 5 節：安全邊界
- `docs/product/EXPERIENCE_CONTEXT.md`：模式與 active club 的既有語意
- `docs/product/TO-DO-LIST.md` 第 3 項：本企劃的待辦入口
- `docs/mvp/BIRTHDAY_WISHES_V2_PLAN.md`：生日徵集的產品規則，本企劃不得更動
