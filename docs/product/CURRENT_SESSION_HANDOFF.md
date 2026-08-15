# 交接筆記（2026-08-13）

> 這份文件取代先前留在本機 scratchpad、尚未執行的舊交接提示（內容是接續做「首頁瘦身」，但實際這次對話走向不同，先處理了更急迫的權限與部署問題）。以下是目前真實的狀態。

## 目前基線

`main` 最新 commit：`0178f93`，已完整部署到 staging（Render + Hosted Supabase），health check 正常：

```
revision: 0178f93
status: ok
checks: { configuration: true, database: true }
```

## 這次對話完成的工作

### 1. 執行秘書權限補齊
- 執行秘書（club_operator_permissions，`permission_level = 'club_manager'`）現在擁有社內完整權限，與平台管理員唯一差異是沒有跨社管理權。補了 `finance.read`、`profile.self`、`event.manage`（原本 DB 層就有，但 UI 導覽沒有入口）。
- 社務管理模式的主導覽新增「活動」項目，純執行秘書（沒有社員身份）現在點得到建立活動的頁面。

### 2. Browser Smoke CI 修復（三個獨立問題疊加）
- **真的 bug**：「社團管理」連結用 Next.js client-side navigation 跨模式（member → management），但模式判斷邏輯在共用 layout 裡，client router 不會重新執行——網址變了畫面沒變。改用一般 `<a>` 強制整頁刷新，比照既有 ModeSwitcher 的作法。
- **切換扶輪社顯示邏輯**：漏掉「平台管理員一律顯示」的例外，只看是否管理超過 1 個社。已加回。
- **過時測試**：`operator-invitation.e2e.mjs` 還在測已經被 `d13a15d`（改成管理員直接設密碼，不寄邀請信）拿掉的舊流程。已重寫。

### 3. 社員簽到相機無法開啟（已修復）
- 根因：`checkin-camera-scanner.tsx`（社員自助簽到）要求瀏覽器要有 `window.BarcodeDetector` 才會啟動相機，但 **Safari（含 iPhone）完全不支援這個 API**，所以連相機權限都不會詢問，直接顯示「不支援」。
- 管理端的動態 QR 掃描器（`dynamic-checkin-camera-scanner.tsx`）早就用 `jsQR` 套件做了 canvas 備援，社員這邊沒跟上。已補上相同邏輯。

## 這次發現、值得記住的維運知識

- **GitHub 的 `staging` Environment 設了 required reviewer**（只有帳號owner可核准）。Plan / Go-Live workflow 卡在 `waiting` 狀態，**不是帳單問題**，是在等這個手動核准。核准方式：
  ```
  echo '{"environment_ids":[19012774915],"state":"approved","comment":"..."}' \
    | gh api repos/Leojung0823/rotary-platform-v2/actions/runs/<run_id>/pending_deployments -X POST --input -
  ```
- Go-Live 最後一關「hosted member acceptance」會用真實 staging 帳號登入驗收；如果 staging 上的測試社團（Rotary Platform Staging Test Club）被封存過，這關會失敗（登入成功但首頁抓不到，因為封存社的舊社員會看到錯誤頁）。記得測完封存/解封功能後要把測試資料復原。

## 尚未處理、留意事項

- Health check 一直帶著 `"warnings":["DEPLOYMENT_WARNING"]`，這是既有狀態、不是這次新出現的，還沒查過代表什麼，不影響目前功能。
- `docs/product/LEGACY_PORT_CANDIDATES.md` 原本規劃的「首頁瘦身」（比照舊專案 6 區塊結構重做 dashboard）**這次沒有做**，優先度被權限/CI/相機這幾個緊急問題蓋過去了，仍然是待辦。
- 本機開發時常需要重跑 `node --env-file=.env.local scripts/bootstrap-superadmin.mjs`，因為本機 Supabase 資料在多次 `db reset --local` 之後會被清空。
