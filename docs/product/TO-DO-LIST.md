# Rotary Platform 待辦執行清單

更新日期：2026-10-27（Asia/Taipei）

> 本文件是目前**唯一現行待辦清單**。過往快照已移至 [`TO-DO-LIST-HISTORY-2026-10-27.md`](./TO-DO-LIST-HISTORY-2026-10-27.md) 封存；封存內容只供追溯，不是待辦，也不可覆蓋本清單狀態。每個仍未結案的項目只在本文件列一次。

## 2026-10-27 最新狀態基準

- GitHub `main` 已含今天的待辦整理 commit `578ab690b0b17ce9a139eea0037ab5bb6da8523e`；效能診斷工具 revision 為 `59958784efc157c64f4bc87c3c1940b8cb5a5836`；產品 staging revision 仍是 `11e931eb5d2a50d324d4ceb1d683af3c267043e0`。診斷工具沒有修改產品程式，因此沒有重新部署 staging。
- 最近一次 staging health 為 `status=ok`、`issues=[]`；production 本輪沒有修改。
- E-12 本機加密 public-only logical export 與隔離還原演練已完成；它不包含 Auth、Storage 物件或 Supabase 專案設定，不等於完整災難復原。備份與解密私鑰留在 repo 外本機私密目錄；一次性 staging-only token 已撤銷。
- E-06 診斷：run `40430963025`，產品 revision `11e931e`、warm cache、每頁 5 次。社員首頁 LCP／FCP／TTFB／INP 中位數 `832／340／309.6／16 ms`；社務管理首頁 `836／300／268.8／16 ms`。proxy auth 中位數 `1.5／1.6 ms`，CDP 摘要兩頁皆 0 個長任務。結果排除了幾個猜測，但**尚未定位剩餘伺服器等待的確切來源，也不能宣稱整體已加速**。完整量測與限制見 [`PERFORMANCE_IMPROVEMENT_LOG.md`](./PERFORMANCE_IMPROVEMENT_LOG.md)。

## 1. 現行待辦（唯一清單）

**GPS 簽到規則（已完成，不是待辦）**：以與活動地點相距 200 公尺內判定，不設 GPS accuracy 門檻；定位請求使用 `maximumAge: 0`。不要自行補上 accuracy 限制。

### E-06 登入後首頁效能診斷 `[>]`

- **已完成**：為 staging 效能測試加入 proxy auth 計時與 LCP 歸因；查明 proxy auth、主執行緒長任務及首頁 hero 圖都不是目前看到的主要延遲。原始碼盤點確認 dashboard 已並行啟動身份、社團情境與旗標讀取；社員首頁也並行讀取首頁投影與 LINE OA onboarding，已有 request-scoped 去重及 Suspense 骨架。
- **接下來**：補上不含個人資料的伺服器階段耗時證據，優先檢查 identity／context／首頁投影的實際等待，以及遙測寫入端是否可用；再用相同 staging、warm cache、每頁 5 次重測。不能只因同一產品 revision 的不同 run 有較低數字就宣稱改善。
- **工具準備**：Staging Performance Acceptance 已加入只讀的 15 分鐘 staging telemetry 彙總；硬性比對 staging project ref，只輸出事件種類、樣本數、中位數、P95，不查個人識別資料或原始 payload。待此工具同步 main 後，以目前部署 revision 重跑量測；產品 runtime 不變，不需要重新部署。
- **不可做**：不把整個登入首頁設為公開快取；不共用其他使用者的個人資料；不改登入、角色、RLS、RPC 權限或社團隔離。沒有證據前不猜測性改查詢或快取。
- **驗證現況**：訊息中心 Browser Smoke 不穩定問題已另行修正並在最新完整 run 通過；E-06 仍待補伺服器階段耗時證據及同條件複測。本結果不代表 staging 產品部署失敗。

### E-07 iOS／Android 實機與 M1 使用者測試 `[ ]`

- 以真實 iPhone Safari、Android Chrome 及至少五位社員／幹部測試登入、導覽、活動報名、簽到、生日祝福、LINE OA 引導與管理流程。
- 記錄裝置、瀏覽器、網路、測試結果與問題；桌面 Chromium 自動化不能替代實機與使用者測試。

### E-11 LINE OA／Rich Menu 外部設定與手機驗收 `[>]`

- 程式已在 main／staging；待相關扶輪社完成其 LINE OA 後台設定，再以手機逐項點選 Rich Menu，確認導向正確社別與功能。
- 目前產品確認只使用 `PANCHIAO-ELITE`；HAPPY 不使用，不得把 PANCHIAO 設定或憑證套用到 HAPPY。
- 驗收須記錄每個已設定社別、實際 OA、手機結果；未設定的社別不得寫成已完成。

### PR #204 Recovery email hosted 真人驗收 `[>]`

- 使用專用 staging 測試帳號完成「收到 recovery email → 開啟連結 → 設定新密碼 → 重新登入」，記錄 hosted 結果。
- 真人流程完成前不要合併 PR #204；本機測試或 CI 不取代這項驗收。

### Message Center scheduler staging 營運設定 `[ ]`

- 先確認排程實際會送給哪些對象、內容與時間，並完成 staging 收件對象驗收；之後再設定並啟動 scheduler。
- 在收件對象驗收與管理者確認前**不要啟動排程**，避免誤發 LINE 訊息。這是外部營運排程，不等同產品 feature flag。

## 2. 需要產品決定或目前暫緩（不是可自行執行的開發）

### E-08 Production 上線準備 `[!]`

- 需另有明確 production 發布範圍與授權，並確認 production 備份／還原、網域、憑證、LINE OA、migration 與回復流程。
- 在獲得明確授權前，不連線或修改 production、不發佈 production。

### E-09 Recovery email／custom SMTP `[!]`（依產品決定暫緩）

- 目前維持暫緩；只有產品決定恢復此項時才建立 custom SMTP 與真人信件驗收工作。暫緩期間不列為進行中工程。

## 3. 已完成，從現行待辦移除

| 編號 | 結果 |
|---|---|
| E-01 | LINE Flex 卡片 staging 與真人收訊完成。 |
| E-02 | 生日邀請 LINE 實際送達與冪等重跑驗收完成。 |
| E-03 | LINE OA follow 自動配對真人驗收完成；只確認 `PANCHIAO-ELITE`，HAPPY 不使用。 |
| E-04 | 本階段 `PANCHIAO-ELITE` OA/channel 設定驗收完成；HAPPY 不納入本階段。 |
| E-05 | 推播超額「停止並通知管理員」政策、程式與 staging 驗收完成。 |
| E-10 | 雙重社籍／跨社角色負向權限驗收完成。 |
| E-12 | 本機加密 public-only 備份與隔離還原演練完成；範圍限制見上方基準。 |
| Browser Smoke 訊息中心測試穩定性 | 根因是測試在收件對象選擇器 hydration 完成前輸入，送出時標題欄仍空白；測試現在等待載入完成並確認欄位值，不放寬產品驗收。CI `40436731139` 成功，完整 Browser Smoke `40436731002` 於 exact SHA `060e75b03cc14a5db3ffc9930af4018bd21e2f99` 成功（248 passed／123 skipped），兩項 rollback 測試通過。 |

## 4. 共用執行邊界

- 新功能依產品決定：成功部署後自動可用，不要求人工開旗標；緊急停用仍使用受保護的既有控制。排程、LINE 發送等外部營運動作仍需驗收及明確啟動。
- staging 與 production 分開管理。不得把 staging 驗收寫成 production 已準備或已發布。
- 任何需要真人、手機、LINE Developers／OA 後台、Render 或產品決定的事項，必須保留負責人與實際證據；不得以程式存在、CI 通過或口頭推測代替。
- 後續新增待辦先更新本文件今天的清單；不要再把同一項複製到新的「今日／前次最新進度」段落。歷史證據放在相應專題紀錄或封存檔。
