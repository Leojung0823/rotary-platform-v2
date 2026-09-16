# Rotary Platform V2 效能改善紀錄

更新日期：2026-09-16（Asia/Taipei）

這是效能改善的共同紀錄。每次要修改載入速度、快取、Server Component
或資料查詢前，先讀本文件；完成後把量測條件、數字與未量測項目補回來。

## 目前基準

| 項目 | 結果 |
|---|---|
| 測試站 | `https://rotary-platform-v2-mrha.onrender.com` |
| 目前 staging runtime | `bd8a8e9d0205` |
| 本次 `/login` 量測時 runtime | `1ef38bb50407`（由相鄰時間的 `/api/health` 核對；trace 本身未暴露 revision） |
| 量測頁面 | `/login`（未登入） |
| 工具 | Chrome DevTools Performance trace + `PerformanceNavigationTiming` |
| CPU／網路 | CPU 1x；未設定網路限速 |
| LCP | 167 ms |
| LCP 的 TTFB | 104 ms |
| LCP render delay | 63 ms |
| FCP | 168 ms |
| CLS | 0.00 |
| CrUX | 無資料 |

本次瀏覽器回報的 navigation timing（2026-09-16 18:52 Asia/Taipei；相鄰健康檢查為
`1ef38bb50407`）：`responseStart=103.7 ms`、`responseEnd=106.0 ms`、
`DOMContentLoaded=130.1 ms`、`load=151.5 ms`。Performance trace 的 LCP 元素是登入頁的文字
`blockquote`，沒有 LCP 圖片下載；當次只看到 18 個網路請求。

這組數字只代表未登入 `/login`，不能拿來代替登入後頁面。2026-09-16 已再用使用者自己的
Chrome 登入 session 量到社員首頁與社務管理頁（條件與限制見下表）。這次沒有證據支持把登入頁或
登入後首頁改成公開快取。

### 2026-09-16 已登入 staging 基線

同一個已登入 Chrome session、PANCHIAO-ELITE、viewport `1365×813`、DPR `1`、CPU `1x`、未設定網路限速；
staging `/api/health` 在量測後核對為 `1ef38bb50407`。數字來自 Chrome DevTools Performance trace，
FCP／LCP／TTFB 再用 trace 原始事件交叉核對。這是各頁各一次的現況基線，不是修改前後的因果比較。

| 頁面 | LCP | FCP | LCP TTFB | CLS | LCP breakdown／洞察 |
|---|---:|---:|---:|---:|---|
| 社務管理 `/dashboard?mode=management` | 1,777 ms（DevTools 顯示 1.78 s） | 760 ms | 637 ms | 0.00 | render delay 1,140 ms；文件請求延遲洞察估算可省 532 ms |
| 社員首頁 `/dashboard?mode=member` | 1,929 ms（DevTools 顯示 1.93 s） | 562 ms | 452 ms | 0.01 | `/hero-mountains.webp` 資源載入延遲 1,319 ms、載入 106 ms、元素 render delay 52 ms |

兩頁的 INP 都是「未量測」（此次 trace 沒有可用互動事件）。這是修改前基線：社員首頁的 LCP 是
`/hero-mountains.webp`（10.6 kB），當時藏在 CSS pseudo-element 的 background；DevTools 建議讓圖片在初始文件中可發現
並提高優先權。另有 render-blocking CSS 約 121 ms、legacy JavaScript 約 14.4 kB 的工具估算，先記錄，不把估算直接當成
已證明的主因。管理頁的下一步要拆開文件等待與 render pipeline，再決定是否值得動查詢或元件。

> 2026-09-16 補充：本表最上方的 `/login` 數字是在相鄰健康檢查顯示為 `1ef38bb50407` 時量得；
> 先前 `e1ea85c3e941` 的量測仍保留在下方歷史紀錄，不能把任一組 `/login` 數字冒充登入後頁面數字。
> 登入後管理頁、社員首頁已取得同一個已登入 DevTools session 的現況基線；修改前後的改善幅度仍未量測。

## 目前判斷

- 未登入 `/login` 的主要等待是 TTFB：LCP 167 ms 中有 104 ms 是 TTFB；它和歷史
  `e1ea85c3e941` 條件與 runtime 不完全相同，不當成改版前後因果比較。
- 登入後社員首頁目前最明確、風險最低的改善點是 `hero-mountains.webp` 的發現時間：圖片本身只有
  10.6 kB，卻在 LCP 前延遲 1,319 ms。本輪已改成社員首頁限定的 eager `<img>`，並部署至 staging `bd8a8e9d0205`；
  實際 DOM 有 1 張圖片，但 hosted React／Next 仍產生 2 個相同的普通 preload 提示，所以只確認管線已改變，不能宣稱
  已消除所有提示或已改善 LCP。
- 修改後登入社員頁的 LCP／FCP／TTFB **未量測**：目前可用的 Chrome DevTools page 是平台管理員工作階段，不能代表社員頁；
  CUA 頁面可驗證 DOM，但不提供 Performance timing。
- 管理頁的 637 ms TTFB 與 1,140 ms render delay 是基線訊號，不足以直接判定是資料庫慢；要先做同一
  revision 的修改後 trace，並用 server timing／請求瀑布拆分文件等待與前端繪製。
- Trace 的 render-blocking CSS 與約 14.4 kB legacy JavaScript 是後續候選項，不在沒有前後證據時大改。
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

要比較效能時，必須使用已登入的專用 staging 測試帳號，在相同 staging revision、同一個 viewport、CPU
與網路條件下，修改前後各至少量一次。2026-09-16 的已登入基線已建立；下一次應在 `bd8a8e9d0205` 或更新版本量測社員首頁
修改後結果，再測管理頁。每次至少記錄：

- URL、runtime revision、日期時間、viewport、CPU／網路設定。
- LCP、FCP、CLS、TTFB，以及 LCP breakdown。
- 是否有重複請求、循序資料庫往返、render-blocking 資源或過大的前端套件。
- 修改前與修改後各至少一次；若條件不同，要明確標示不可直接比較。

若沒有登入瀏覽器 session 或 Chrome DevTools，請寫「未量測」，不要猜數字；單次基線只能說明現況，
不能宣稱改善幅度。

## 變更紀錄

### 2026-09-16

- `bd8a8e9d0205` 已部署社員首頁效能修正：將 CSS background 改成首頁限定的 eager `<img>`，移除手動 React `preload()` 與
  `fetchPriority="high"`，保留管理頁不載入 hero 圖片的邊界；本輪沒有新增 migration，也沒有修改快取／登入／權限。
- staging 真實登入社員頁（網址加驗證 query、重新抓取頁面）確認 `/hero-mountains.webp` 的圖片 DOM 為 `1` 張，但 hosted
  React／Next DOM 仍有 `2` 個相同的普通 preload 提示，分別位於 head 與 body；這與本機 production build 的 `1` 個提示不同，
  因此仍需把 hosted streaming 行為視為後續調查項目。
- 本機社員首頁 E2E：`3 passed`（`member-home-1440`，含圖片 1 張／preload 1 個與管理模式不載入圖片）；修改後 staging 的
  LCP／FCP／TTFB **未量測**，沒有前後效能數字可報告。
- 自動 CI `35100760020`、Browser Smoke `35100760034`、Staging Release `35102157586`、Staging Go-Live `35102495571` 均成功；
  `/api/health` revision `bd8a8e9d0205`、`issues=[]`。

- 以 Chrome DevTools Performance trace 重新量測 staging `/login`：LCP 167 ms、FCP 168 ms、LCP TTFB 104 ms、
  render delay 63 ms、CLS 0.00；CPU 1x、未設定網路限速。
- 相鄰時間的 `/api/health` 顯示 staging runtime `1ef38bb50407`；同一個已登入 Chrome session 量得管理頁
  LCP 1,777 ms／FCP 760 ms／LCP TTFB 637 ms／CLS 0.00，社員首頁 LCP 1,929 ms／FCP 562 ms／
  LCP TTFB 452 ms／CLS 0.01；兩頁 INP 均未量測。
- 社員首頁 LCP 為 `/hero-mountains.webp`，資源發現／載入延遲 1,319 ms；管理頁文件請求延遲洞察估算
  532 ms，兩者分別列為後續改善方向；這些數字是部署社員首頁修正前的基線，不能當成修正後結果。
- trace 另估算 render-blocking CSS 約 121 ms、legacy JavaScript 約 14.4 kB；先不把工具估算當成已證明主因。

### 2026-09-11

- 重新量測 staging `/login`：LCP 500 ms、FCP 500 ms、TTFB 415 ms、CLS 0.00。
- 管理模式與登入後首頁仍未量測。
- 確認登入頁不使用公開快取；本次沒有為了速度放寬身份或權限邊界。

### 2026-09-11 第二次探測

- 測試站仍為 `https://rotary-platform-v2-mrha.onrender.com`、runtime `e1ea85c3e941`；頁面為未登入的 `/login`。
- Chrome DevTools MCP 的 `PerformanceNavigationTiming` 加上頁面載入前註冊的 LCP observer；CPU 1x、未設定網路限速。
- `responseStart`／TTFB：410.5 ms；FCP：472 ms；LCP：472 ms（元素為登入頁的 `blockquote`）；CLS：0.00。
- `responseEnd`：518.7 ms；DOMContentLoaded：520.6 ms；load：520.7 ms。
- 這仍不是登入後頁面；管理模式、社員首頁與其他受保護頁面的 TTFB／LCP 仍記為**未量測**，不能用這次數字代替。
