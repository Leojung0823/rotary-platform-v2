# 交接筆記（2026-08-27）

> 先讀根目錄 `AGENTS.md`。權威來源是 GitHub `Leojung0823/rotary-platform-v2` 的 `main`。
> `/Users/leoj/Documents/Codex/2026-08-15/rotary/` 是舊快照，不在 git 裡，不能當基準。

## 本次同步結果

目前權威 `main` 已合併 PR #77，HEAD 為 `90210420a4adbc3c64e7e434f63aeaaa71da0105`。
生日祝福 V2 與生日祝福徵集的程式、資料庫 migration、權限驗證、測試與文件已進入 main；
本輪尚未把這個 SHA 發布到 staging，也沒有修改 production。

PR #77 的最新 head `ecdd095a56c41be9d972003461a0913cbd925dcc` 已通過 application、validate、database
與 Browser Smoke，並以一般 merge 合併。合併後的 staging 發布仍必須重新以 `main` 的 exact SHA
執行受保護的 Staging Release plan 與 Staging Go-Live。

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

## 最近 migration

生日徵集的 forward-only migration 為 `20260824000700` 至 `20260824001700`；最後一個檔案是
`20260824001700_birthday_collection_question_prompt_uniqueness.sql`。下次新增 migration 前仍須先
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

- 以合併後的 exact `main` SHA 執行 staging plan、Go-Live、migration apply、部署 revision wait、HTTPS smoke
  與 hosted member acceptance。
- staging 需確認 `BIRTHDAY_COLLECTION_SCHEDULER_SECRET` 已設定；徵集 flag 要由 staging 管理者透過受保護
  的 flag 腳本明確開啟後，才能做徵集入口與排程驗收。
- GPS accuracy／定位 age 政策要由產品選定後才能 harden。
- recovery 需要專用 staging 帳號的真實新信件流程。
- iOS Safari／真實 Android 裝置驗收尚未做。
- M1 五位目標使用者形成性測試尚未安排。

## 驗證結果

本輪本機結果：

```text
npm test                         100 files / 631 tests passed
npm run typecheck                passed
npm run lint                     passed
npm run build                    passed
npm run verify:db                45 verification SQL passed
npm run check:migrations         passed
npm run check:db-verifications   45 files covered
git diff --check                 passed
PR Browser Smoke                 passed (10m31s)
```

`verify:db` 的 schema lint 仍有 3 個既有 warning：兩個 STABLE/VOLATILE 標記不一致，以及一個未使用
的 PL/pgSQL 變數；本輪沒有新增 warning。瀏覽器本機若沒有 Supabase 不得宣稱已完成；本輪 PR 的隔離
Browser Smoke 已通過。production 不在本輪範圍。
