# 交接筆記（2026-08-31）

> 先讀根目錄 `AGENTS.md`。權威來源是 GitHub `Leojung0823/rotary-platform-v2` 的 `main`。
> `/Users/leoj/Documents/Codex/2026-08-15/rotary/` 是舊快照，不在 git 裡，不能當基準。

## 本次同步結果

目前權威 `main` 已合併 PR #77、PR #86、文件 PR #87／#88／#89、PR #91、PR #92 與 PR #93；閱讀時以 GitHub
`main` 的最新 commit 為準。PR #91 加入 staging Auth 設定同步流程，PR #92
同步功能目錄，PR #93 加入 CI／Browser Smoke 的變更範圍 gate。PR #86 修正台灣社團時區跨日造成的出席頁日期預設錯誤；
production 沒有修改。生日祝福 V2 與生日祝福徵集的程式、資料庫 migration、權限驗證、測試與文件均已進入 main。
staging `/api/health` 健康檢查通過，但 runtime 仍是 revision `26520424b415`，沒有追上目前 `main`；後續文件合併
也不代表 runtime 已部署。並保留原本的 Staging Release plan `33121197083`／Go-Live `33121275958` 證據。

PR #86 的 application、validate、database 與 Browser Smoke 均通過後以一般 merge 合併。生日專項 hosted acceptance
`33345182984` 已以程式 SHA `26520424b415` 通過，包含生日 V2 說明與祝福徵集入口。staging 平台管理員已透過受保護 CLI
開啟 `birthday_wishes_v2` 與 `birthday_wishes_collection_v1`；Render staging 與 GitHub staging secret 已同步。
排程 workflow `33361427466` 已成功通過，表示 protected scheduler route 的認證與執行均正常。

最新 Auth 設定同步 workflow `33348350584` 在 Supabase Management API 第一次請求失敗；在重新確認 GitHub
`staging` environment 的 `SUPABASE_ACCESS_TOKEN` 前，不寄新的 recovery 信件，也不把舊信件當成驗收證據。

## 已完成的主要切片

- 出席統計只計 `regular_meeting`。
- 社員名錄 profile 補回 `occupation`。
- 我的祝福 IOU 支援扶輪年度／總計篩選。
- 首頁 bounded notification projection 與訊息入口。
- `/me/security` 帳號安全分層與 recovery confirmation flow。
- 生日祝福 V2：新設定預設公開、年齡依同意顯示、同一作者同一壽星每日最多 10 則、作者匿名投影。
- 生日祝福徵集：每月批次、生日前 7 天排程、每位社員每月最多一則自動任務、100 題平台題庫、
  社團題庫 CRUD、題目快照、同批次題目不重複、題庫不足整批停止與可重試、發布／隱藏／重送、
  幹部管理、通知冪等、匿名公開牆與權限驗證。
- 社員固定四項導覽、首頁互動入口、幹部管理往返、巢狀路由 current state、名錄 responsive header。
- 非大版本文件修改的 CI／Browser Smoke 規則已進入 `main`：文件類變更只跑輕量 scope gate，程式／資料庫／部署等高風險變更仍完整檢查，分類失敗時 fail-open。

## 最近 migration

生日徵集的 forward-only migration 為 `20260824000700` 至 `20260824001700`；出席日期修正新增
`20260828000100_attendance_local_date_defaults.sql`。下次新增 migration 前仍須先
執行 `ls supabase/migrations/ | tail` 確認可用編號，不能憑記憶或修改已部署 migration。

新增資料表或 RPC 必須有 `supabase/verification/*.sql`，並登錄
`scripts/database-verification-files.txt`；verification 要測誰不能做什麼。

## 不可違反的資料與權限規則

1. 出席只使用 `20260811000100_attendance_domain_core.sql` 的 canonical authority；不要採用已關閉 PR #37 的
   `20260731000100_v08_attendance_management.sql`。
2. `list_club_events` 與 `list_my_event_page` 都需要第二個 boolean `p_as_member` 參數，舊單參數呼叫不存在。
3. mode、active-club cookie、導覽 visibility 只能作 UX；protected route、RPC、RLS 仍要自己授權。
4. GPS 不保存 raw coordinate 或 exact distance；accuracy 門檻尚未由產品決定，不可自行猜測。
5. 不要把登入狀態、角色、權限、社員名單或整個登入後首頁做公開快取。
6. `birthday_wishes_v2` 與 `birthday_wishes_collection_v1` 缺少明確 flag row 時必須維持關閉；
   scheduler 只接受 staging 的受保護呼叫，不能用 service role key 暴露給前端或一般 job。

## 仍未完成／需外部條件

- 生日祝福 V2 與徵集的程式、旗標、secret、staging 部署、hosted acceptance 與排程均已完成；不再有本輪
  birthday release blocker。歷史失敗 run `33121570908`／`33121704322` 保留作為設定前的追蹤證據。
- GPS accuracy／定位 age 政策要由產品選定後才能 harden。
- recovery 需要先修復 staging Management API token，再用專用 staging 帳號完成一封新的信件流程。
- iOS Safari／真實 Android 裝置驗收尚未做。
- M1 五位目標使用者形成性測試尚未安排。

## 驗證結果

本輪本機結果：

```text
npm test                         100 files / 631 tests passed
npm run typecheck                passed
npm run lint                     passed
npm run build                    passed
npm run verify:db                not completed locally (Docker/Supabase unresponsive)
npm run check:migrations         passed
npm run check:db-verifications   46 files covered
git diff --check                 passed
PR #86 Browser Smoke             passed (run 33120346924, 11m03s)
PR #86 CI database                passed (run 33120346988; 46 verification SQL)
PR #93 CI／Quality／Browser Smoke passed (runs 33347745255／33347745250／33347745221)
current main push CI              passed (run 33348357979)
current main Browser Smoke        in progress at scan (run 33348357995)
staging plan                      passed (run 33121197083)
staging Go-Live                   passed (run 33121275958)
staging birthday acceptance       passed (run 33345182984; V2 + collection enabled)
staging birthday scheduler        passed (run 33361427466; protected staging route)
staging Auth config sync           failed (run 33348350584; first Management API request)
```

`verify:db` 的 schema lint 仍有 3 個既有 warning：兩個 STABLE/VOLATILE 標記不一致，以及一個未使用
的 PL/pgSQL 變數；本輪沒有新增 warning。瀏覽器本機若沒有 Supabase 不得宣稱已完成；本輪 PR 與 main
的隔離 Browser Smoke 均已通過。production 不在本輪範圍。
