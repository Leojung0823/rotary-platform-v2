# Rotary Platform V2 效能改善紀錄

更新日期：2026-09-11（Asia/Taipei）

這是效能改善的共同紀錄。每次要修改載入速度、快取、Server Component
或資料查詢前，先讀本文件；完成後把量測條件、數字與未量測項目補回來。

## 目前基準

| 項目 | 結果 |
|---|---|
| 測試站 | `https://rotary-platform-v2-mrha.onrender.com` |
| 目前 staging runtime | `a8c1e55e7f88` |
| 量測頁面 | `/login`（未登入） |
| 工具 | Chrome DevTools Performance trace + `PerformanceNavigationTiming` |
| CPU／網路 | CPU 1x；未設定網路限速 |
| LCP | 586 ms |
| LCP 的 TTFB | 449 ms |
| LCP render delay | 136 ms |
| FCP | 588 ms |
| CLS | 0.00 |
| CrUX | 無資料 |

本次瀏覽器回報的 navigation timing：`responseStart=449.4 ms`、
`responseEnd=552.4 ms`、`DOMContentLoaded=580.2 ms`、`load=584.0 ms`。

這次沒有登入狀態，因此**管理模式、社員首頁與其他登入後頁面的 TTFB／LCP
仍是未量測**，不能用上面的 `/login` 數字代替。

## 目前判斷

- `/login` 的主要等待在伺服器回應前：LCP 586 ms 中有 449 ms 是 TTFB。
- Chrome DevTools 沒有發現有明顯可節省的 render-blocking 資源。
- Trace 提示約 14.4 kB 的 legacy JavaScript 可再檢討，但目前不是已證明的主要瓶頸。
- 登入頁回應是 `private, no-cache, no-store, max-age=0, must-revalidate`，且
  `cf-cache-status: DYNAMIC`；這是安全的登入頁設定，不應為了速度改成公開快取。

## 快取與查詢規則

1. 只快取公開資料、圖片與靜態檔案。
2. 不快取登入狀態、角色、權限、社員名單，也不把整個登入後首頁設成公開快取。
3. 個人資料若真的需要快取，key 必須同時包含 `user_id` 與 `club_id`；缺少任一項就不做。
4. 快取與導覽 cookie 只能改善體驗，不能取代 server-side authorization、RPC 或 RLS。
5. 沒有相依關係的讀取要並行發動；需要先清單後內容時，優先使用組合型 RPC，並沿用既有授權函式。
6. 完成 mutation 後要失效相同使用者、相同社團的相關快取，不可讓另一位社員讀到舊資料。
7. 不把 token、cookie、權限判斷或秘密放進公開快取、URL 或瀏覽器可讀資料。

## 下一次量測方法

要補管理頁效能時，必須使用已登入的專用 staging
測試帳號，在相同 staging revision 下量測，至少記錄：

- URL、runtime revision、日期時間、viewport、CPU／網路設定。
- LCP、FCP、CLS、TTFB，以及 LCP breakdown。
- 是否有重複請求、循序資料庫往返、render-blocking 資源或過大的前端套件。
- 修改前與修改後各至少一次；若條件不同，要明確標示不可直接比較。

若沒有登入瀏覽器 session 或 Chrome DevTools，請寫「未量測」，不要猜數字。

## 變更紀錄

### 2026-09-11

- 重新量測 staging `/login`：LCP 586 ms、FCP 588 ms、TTFB 449 ms、CLS 0.00。
- 管理模式與登入後首頁仍未量測。
- 確認登入頁不使用公開快取；本次沒有為了速度放寬身份或權限邊界。
