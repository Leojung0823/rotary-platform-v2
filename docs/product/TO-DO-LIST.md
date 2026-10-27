# Rotary Platform 待辦執行清單

更新日期：2026-10-27（Asia/Taipei）

> 本文件是目前**唯一現行待辦清單**。過往快照已移至 [`TO-DO-LIST-HISTORY-2026-10-27.md`](./TO-DO-LIST-HISTORY-2026-10-27.md) 封存；封存內容只供追溯，不是待辦，也不可覆蓋本清單狀態。每個仍未結案的項目只在本文件列一次。

## 2026-10-27 最新狀態基準

- GitHub `main` 已含 Browser Smoke 修正與封存結案 commit `3543b58bf8bd27b663a09b191b3cf65e0990ee44`。Staging Release plan `40448096523` dry-run 成功，遠端資料庫沒有待套用 migration；Staging Go-Live `40448288080` 已部署並通過 HTTPS smoke 與 hosted member acceptance。
- Staging 目前 revision 為 `3543b58bf8bd`；`/api/health` 回傳 `status=ok`、`issues=[]`、HTTP 200。production 本輪沒有修改。
- E-12 本機加密 public-only logical export 與隔離還原演練已完成；它不包含 Auth、Storage 物件或 Supabase 專案設定，不等於完整災難復原。備份與解密私鑰留在 repo 外本機私密目錄；一次性 staging-only token 已撤銷。
- E-06 已結案，見封存檔 [`TO-DO-LIST-HISTORY-2026-10-27.md`](./TO-DO-LIST-HISTORY-2026-10-27.md)。

## 1. 現行待辦（唯一清單）

**GPS 簽到規則（已完成，不是待辦）**：以與活動地點相距 200 公尺內判定，不設 GPS accuracy 門檻；定位請求使用 `maximumAge: 0`。不要自行補上 accuracy 限制。

目前沒有尚待執行的工程待辦。2026-10-27 Browser Smoke failure triage 已完成兩次連續成功執行；根因、修正、本機 E2E 與 run／attempt 證據記於封存檔。封存不代表外部真人驗收已完成。

## 2. 需要產品決定或目前暫緩（不是可自行執行的開發）

### E-08 Production 上線準備 `[!]`

- 需另有明確 production 發布範圍與授權，並確認 production 備份／還原、網域、憑證、LINE OA、migration 與回復流程。
- 實機測試（E-07）、Rich Menu 手機驗收（E-11）、Recovery email 真人驗收（PR #204）已封存未驗收；production 發布前需重新評估是否補做。
- 在獲得明確授權前，不連線或修改 production、不發佈 production。

### E-09 Recovery email／custom SMTP `[!]`（依產品決定暫緩）

- 目前維持暫緩；只有產品決定恢復此項時才建立 custom SMTP 與真人信件驗收工作。暫緩期間不列為進行中工程。
- PR #204 與 E-09 一併視為暫緩：真人驗收依產品決定封存；PR 維持 draft／open、不合併，E-09 不重啟。

## 3. 共用執行邊界

- 新功能依產品決定：成功部署後自動可用，不要求人工開旗標；緊急停用仍使用受保護的既有控制。排程、LINE 發送等外部營運動作仍需驗收及明確啟動。
- staging 與 production 分開管理。不得把 staging 驗收寫成 production 已準備或已發布。
- Message Center scheduler 維持不啟動，不建立任何排程；排程設定已依產品決定封存。
- LINE OA 僅使用 `PANCHIAO-ELITE`；HAPPY 不使用，不得套用 PANCHIAO 設定或憑證。
- 任何需要真人、手機、LINE Developers／OA 後台、Render 或產品決定的事項，必須保留負責人與實際證據；不得以程式存在、CI 通過或口頭推測代替。
- 後續新增待辦先更新本文件今天的清單；不要再把同一項複製到新的「今日／前次最新進度」段落。歷史證據放在相應專題紀錄或封存檔。
