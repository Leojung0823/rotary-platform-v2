# 交接筆記（2026-08-24）

> 先讀根目錄 `AGENTS.md`。權威來源是 GitHub `Leojung0823/rotary-platform-v2` 的 `main`。
> `/Users/leoj/Documents/Codex/2026-08-15/rotary/` 是舊快照，不在 git 裡，不能當基準。

## 本次同步結果

本次工作以 `main` 的 `58db2a4` 為程式基準，已完成待辦清單中可在本機完成的程式修改，並更新
[`TO-DO-LIST.md`](./TO-DO-LIST.md)。目前未 push、未開 PR、未 merge、未 deploy。

已完成的主要切片：

- 出席統計只計 `regular_meeting`。
- 社員名錄 profile 補回 `occupation`。
- 我的祝福 IOU 支援扶輪年度／總計篩選。
- 首頁 bounded notification projection 與訊息入口。
- `/me/security` 帳號安全分層與 recovery confirmation flow。
- 生日祝福 V2 核心：預設公開、年齡同意、每日多則上限、作者匿名投影。
- 社員固定四項導覽、首頁互動入口、幹部管理往返、巢狀路由 current state、名錄 responsive header。

## 最近 migration

目前最後一個 migration 是 `20260824000500_member_home_notifications.sql`；下一個新增檔名必須先
確認 `ls supabase/migrations/ | tail`，使用 `20260824000600` 或當時實際可用的下一號，不能憑記憶。

最近的 forward-only migration：

| Migration | 內容 |
|---|---|
| `20260824000100` | directory profile occupation projection |
| `20260824000200` | canonical attendance 只計例會 |
| `20260824000300` | 本人祝福 IOU 扶輪年度 projection |
| `20260824000400` | birthday wishes V2 core 與 flag key |
| `20260824000500` | member home bounded notifications |

新增資料表或 RPC 必須有 `supabase/verification/*.sql`，並寫入
`scripts/database-verification-files.txt`；verification 要測誰不能做什麼。

## 不可違反的資料與權限規則

1. 出席只使用 `20260811000100_attendance_domain_core.sql` 的 canonical authority；不要採用已關閉 PR #37 的
   `20260731000100_v08_attendance_management.sql`。
2. `list_club_events` 與 `list_my_event_page` 都需要第二個 boolean `p_as_member` 參數，舊單參數呼叫不存在。
3. mode、active-club cookie、導覽 visibility 只能作 UX；protected route、RPC、RLS 仍要自己授權。
4. GPS 不保存 raw coordinate 或 exact distance；accuracy 門檻尚未由產品決定，不可自行猜測。
5. 不要把登入狀態、角色、權限、社員名單或整個登入後首頁做公開快取。
6. `birthday_wishes_v2` 缺少明確 flag row 時必須維持關閉；生日 V1、留言板、文件中心有既有 rollback key，仍須通過同一個 server gate。

## 仍未完成／需外部條件

- GPS accuracy／定位 age 政策要由產品選定後才能 harden。
- recovery 需要專用 staging 帳號的真實新信件流程。
- iOS Safari／真實 Android 裝置驗收尚未做。
- M1 五位目標使用者形成性測試尚未安排。
- 生日祝福徵集的排程、每月一則自動派發、題庫與幹部管理介面尚未開發；V2 核心不等於徵集完成。

## 驗證結果

最近一次本機結果：

```text
npm test                         88 files / 587 tests passed
npm run typecheck                passed
npm run lint                     passed
npm run build                    passed
npm run verify:db                40 verification SQL passed
npm run check:migrations         passed
npm run check:db-verifications   40 files covered
git diff --check                 passed
role shell E2E                   18 passed
production role/interaction/msg  29 passed, 1 skipped by design
```

`verify:db` 的 schema lint 仍有 3 個既有 warning：兩個 STABLE/VOLATILE 標記不一致，以及一個未使用
的 PL/pgSQL 變數；本輪沒有新增 warning。
