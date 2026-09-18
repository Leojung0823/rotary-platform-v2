# Rotary Platform V2 效能改善紀錄

更新日期：2026-09-18（Asia/Taipei）

這是效能改善的共同紀錄。每次要修改載入速度、快取、Server Component
或資料查詢前，先讀本文件；完成後把量測條件、數字與未量測項目補回來。

## 2026-09-18 主線／staging 核對

- `main` 與 staging 已發布至 exact SHA `5ba1e273c8e88344b47b92120fc1a4431be820a8`；Staging Release `35234886243`、Go-Live `35235024918` 均成功，health `issues=[]`、`warnings=[]`。
- #202 是平台管理員路由修正，沒有改變登入後社員／社務頁的效能程式、快取策略或資料查詢；因此不能把這次發布當成 E-06 的效能改善證據。
- E-06 仍缺同一身份、同一 runtime／快取條件下的社員首頁與社務管理頁 FCP、TTFB、LCP、INP 前後比較；沒有新數字就維持「未量測／未結案」。
- 2026-09-18 重試結果：Chrome DevTools MCP 只有未登入頁，導向管理頁後回到 `/login`；桌面 Chrome 雖有登入頁，但身份是平台管理員，不符合社員／社務管理的可比條件。因此本輪沒有新增效能數字。

## 2026-09-17 最新 staging 發布（簽到功能修正）

- `main` 與 staging 已發布至 exact SHA `eaafe00eed1afab4314f0d5ccc0a875571d832a5`；Staging Release
  plan `35185140008`、Go-Live `35185217321` 均成功，`/api/health` 為 `status=ok`、`configuration=true`、
  `database=true`、`issues=[]`。
- 本次只加入簽到頁逐場原因說明與不計入出席活動的簽到入口修正，沒有改變效能程式、快取或查詢；E-06 的
  登入後社員／管理頁前後效能比較仍是未量測，不能把本次部署當成效能改善證據。

## 2026-09-17 staging 發布紀錄

- Staging Release plan `35180166234` 與 Go-Live `35180295020` 使用同一個 exact SHA
  `878c36cab966360ad2e289cdea27362bfbe2a87d`；migration、部署、exact revision wait、HTTPS smoke
  與 hosted member acceptance 全部成功。
- 這次只發布效能紀錄與進度文件，沒有新增 migration 或產品程式；staging `/api/health` 為
  `status=ok`、revision `878c36cab966`、`configuration=true`、`database=true`、`issues=[]`，production 沒有修改。
- 因為這次沒有改變效能程式，既有社員／管理頁的前後測量限制仍然有效；E-06 仍不能標成完成。

## 目前基準

| 項目 | 結果 |
|---|---|
| 測試站 | `https://rotary-platform-v2-mrha.onrender.com` |
| 本次 staging 發布 exact SHA | `878c36cab966360ad2e289cdea27362bfbe2a87d`（文件同步版本） |
| 目前 staging runtime | `878c36cab966` |
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

### 2026-09-17 Next Image 修正後 staging DOM 驗收（歷史 runtime `36f32f8`）

這次部署的是 `main` exact SHA `36f32f8a44e121689d7a01836d75dcbd99e4a5ee`；Staging Release
`35121647301` 與 Staging Go-Live `35121777337` 均成功。相鄰 staging `/api/health` 核對為
`status=ok`、`revision=36f32f8a44e1`、`configuration=true`、`database=true`、`issues=[]`、
`warnings=[]`；production 沒有修改。

用已登入的 LEO 社員 session 重新載入 `/dashboard?mode=member` 後，實際 DOM 核對結果如下：

| 項目 | 結果 |
|---|---:|
| hero `<img src="/hero-mountains.webp">` | 1 張 |
| hero preload | 1 個 |
| preload 所在位置 | body 1 個；head 0 個 |
| 圖片請求形式 | 直接 `/hero-mountains.webp`，沒有 `/_next/image` 轉換請求 |

這次把社員首頁的 hero 改由 `next/image` 單一元件管理 preload，並使用 `unoptimized` 保留小型靜態檔案
直出；沒有修改登入狀態、角色、權限、社團隔離、資料庫結構或登入後頁面的公開快取設定。這個結果已
證明先前 hosted head／body 重複 preload 的問題在目前 staging revision 消失，但不等於整體 LCP 已完成
前後因果量測。

本機同一輪已通過 typecheck、lint、Vitest `181` 檔／`1346` 測試、build、verify:db、全部 73 份
verification、migration guard、verification manifest、`git diff --check`；`member-home-1440`
目標 E2E 為 `3 passed`。自動 CI `35121629076` 已成功；自動 Browser Smoke `35121629061`
最後為 `189 passed`、`57 skipped`、`1 failed`。唯一失敗是 `role-shells.e2e.mjs:245` 的負向登入測試，
在 `role-shells.e2e.mjs:253` 填密碼時輸入框被串流重繪卸載，兩次都在 30 秒逾時；它不是 hero 圖片測試，
也不改變本輪 `member-home-1440` 的本機與 hosted DOM 證據。本輪沒有手動重跑 Browser Smoke。

後續只針對上述測試競態提交 `965abc82868fe585bc3779da5c33d05c0c44ed09`：每個撤銷／停權／退社帳號都使用
全新的瀏覽器 context，避免前一個登入 session 的 `LoginSessionRedirect` 讓密碼輸入框在串流期間卸載。
本機六個 role-shell 尺寸共 `18 passed`；自動 CI `35123956529` 與 Browser Smoke `35123956508` 均成功。
這是測試檔修正，沒有新增 migration，因此沒有重新部署 staging；目前 staging 產品 runtime 仍是 `36f32f8a44e1`。

### 2026-09-17 平台扶輪社清單預載入修正後量測

這次量測使用的 staging runtime 是 `122396f46994`（完整 main SHA
`122396f469940af1c5f6199df268dbfa320a447b`）；Staging Release plan
`35177558140` 成功，實際 Go-Live `35177534747` 成功。之後 `main` 又前進到
`49d4193`，並由 Go-Live `35177857319` 成功部署；因此下面的數字仍只代表
`122396f` 的量測條件，不是 `49d4193` 的新 CWV。

用已登入的**平台管理員** Chrome session，在
`/platform/clubs?mode=platform` 以 Chrome DevTools Performance trace 重新載入；CPU `1x`、未設定網路限速。
這不是社員首頁或社務管理頁的 E-06 正確身份量測，因此不拿來結案 E-06。

| 項目 | 修正後觀測值 |
|---|---:|
| LCP | 1,019 ms |
| LCP TTFB | 319 ms |
| LCP render delay | 700 ms |
| CLS | 0.00 |
| FCP | 未量測 |
| INP | 未量測 |
| 網路請求數 | 16 |

本次把「建立扶輪社」與每一列「查看」的 Next `Link` 設為 `prefetch={false}`。部署後網路清單中沒有再看到
每個社團詳細頁／建立頁的背景 RSC 預載請求；先前相同頁面的觀察為 23 個請求且包含多個 RSC 預載。這證明
不必要的背景請求已消失，但前後 runtime、快取與頁面狀態不完全相同，LCP 從先前觀察的 1,107 ms 降到
1,019 ms 只能記為方向性觀察，不能宣稱這 88 ms 全部由本修正造成。

### 2026-09-17 量測身份與工具限制補充

- Chrome DevTools MCP 目前可見的兩個 staging 頁面，雖然 URL 分別帶有 `mode=member` 與 `mode=management`，
  但頁面實際都顯示「平台管理模式」與平台管理員導覽；因此本輪不採用這兩頁的 LCP／FCP／TTFB 數字作為社員或社務管理基準。
- 另一個已登入社員的 Chrome session 已用來確認社員／管理模式、草稿隔離與旗標關閉狀態；該瀏覽器介面無法提供有效的
  `PerformanceNavigationTiming`／Paint 資料。故本輪沒有新增可比的登入後 CWV，E-06 仍維持「未量測／待正確 DevTools 身份」。

### 2026-09-16 已登入 staging 基線（歷史）

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

### 2026-09-16 修改後社員首頁補測

這次改用同一個已登入 Chrome session 的 LEO 社員帳號，畫面確認為「社員模式」、目前社為 PANCHIAO-ELITE；URL 為
`/dashboard?mode=member`。viewport `1365×813`、DPR `1`、CPU `1x`、未設定網路限速；DevTools 的「停用網路快取」沒有勾選，
因此這不是清空快取的新訪客測試。相鄰 `/api/health` 在 `2026-09-16T15:08:00Z` 核對為 staging runtime `bd8a8e9d0205`。

Chrome DevTools Performance 的「記錄並重新載入」完成後，回到即時指標頁面顯示：

| 項目 | 修改後觀測值 |
|---|---:|
| LCP | 1.30 s |
| LCP 元素 | `img.member-portal-module__wpzd3a__backdropImage` |
| CLS | 0.01 |
| INP | 未量測（沒有可用互動事件） |
| FCP | 未量測（本次 DevTools 結果頁沒有可靠數值） |
| TTFB | 未量測（本次 DevTools 結果頁沒有可靠數值） |

LCP 觀測值比前一個 runtime 的基線 `1.929 s` 低約 `629 ms`，但 runtime 不同且快取未停用，這只能記為方向性觀察，
不能當成修正造成的因果改善。要結案仍須在相同 runtime、相同快取條件下補齊 FCP 與 TTFB，並至少重測一次管理頁。

### 2026-09-16 本機重現與修正驗證（歷史；React preload 方案已被取代）

在本機 production build 重現了 hosted 的重複提示：社員首頁的單一 hero `<img>` 仍會出現兩個相同的
`link[rel="preload"][as="image"]`。原因不是圖片 DOM 重複，也不是登入後整頁公開快取；是串流中的 literal
`<link>` 可能在 head／body 各產生一次。

當時工作樹先改用 React DOM 的 `preload()` resource hint API，並保留社員首頁自己的普通 `<img>`；本機
production-build 測試可得到單一提示，但部署到 staging 後仍看到 hosted head／body 兩個提示，因此這個方案
沒有作為最終修法。之後改用 `next/image`，才在目前 staging 以 DOM 驗證單一提示；管理頁仍不會載入
`/hero-mountains.webp`。本機會員首頁 Playwright production-build 測試結果為：
`member-home-1440`、`1024`、`768`、`412`、`375`、`320` 共 `8 passed`、`10 skipped`（後 10 項是測試設計只在桌面執行的互動案例）。
桌面測試實際確認圖片 DOM `1` 張、preload `1` 個；這段是歷史本機證據，不能取代上方最新 staging 驗收。

本輪完整本機檢查：typecheck、lint、Vitest `181` 檔／`1346` 測試、build、`npm run verify:db`、73 份 verification、migration
guard、verification manifest 與 `git diff --check` 均通過。瀏覽器的 `PRODUCT_TELEMETRY_SINK_FAILURE` 是本機測試環境既有的
遙測 sink 警告，未影響測試結果。

## 目前判斷

- 未登入 `/login` 的主要等待是 TTFB：LCP 167 ms 中有 104 ms 是 TTFB；它和歷史
  `e1ea85c3e941` 條件與 runtime 不完全相同，不當成改版前後因果比較。
- 登入後社員首頁目前最明確、風險最低的改善點是 `hero-mountains.webp` 的發現時間：圖片本身只有
  10.6 kB，卻在 LCP 前延遲 1,319 ms。上一個 staging runtime `bd8a8e9d0205` 已把它改成社員首頁限定的 `<img>`，
  但 hosted React／Next 仍產生 2 個相同的普通 preload 提示；先前 React `preload()` 方案在本機看似單一，
  部署後仍未解決 hosted 重複。最新 `36f32f8` 改用 `next/image` 單一元件管理 preload，staging DOM 已核對為
  1 個提示。
- 修改後登入社員頁已取得有效的 Chrome DevTools LCP `1.30 s` 與 CLS `0.01`，且 LCP 元素是首頁的 hero `<img>`；
  但 FCP／TTFB 仍未量測，不能只用這次 LCP 宣稱整體效能已改善。
- 管理頁的 637 ms TTFB 與 1,140 ms render delay 是基線訊號，不足以直接判定是資料庫慢；要先做同一
  revision 的修改後 trace，並用 server timing／請求瀑布拆分文件等待與前端繪製。
- 平台扶輪社清單已在 `f4cddb6` 加上兩個 `prefetch={false}`：部署後同一頁的背景 RSC 預載請求由觀察到的
  多筆降為 0，總請求由 23 降為 16。這是已證明的請求量改善；LCP 只作方向性觀察，不能替代社員／社務管理
  頁的同條件前後量測。
- 2026-09-16 先前渲染成「平台管理工作台」的 trace（LCP `1,490 ms`／`1,523 ms`）仍全部排除，不納入效能基準；
  本輪已重新確認目標是 LEO 的社員首頁並取得有效 LCP，但 FCP／TTFB 尚未補齊。下次量測仍要先確認畫面標題與導覽是目標角色。
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

要比較效能時，必須使用已登入的專用 staging 測試帳號，在相同 staging revision、同一個 viewport、CPU、網路與快取條件下，
修改前後各至少量一次。2026-09-17 已完成 hosted DOM 修正驗收，但本輪沒有用可比條件取得新的 CWV；
社員首頁與管理頁的最新前後 FCP／TTFB／LCP 因果比較仍是未量測。每次至少記錄：

- URL、runtime revision、日期時間、viewport、CPU／網路設定。
- LCP、FCP、CLS、TTFB，以及 LCP breakdown。
- 是否有重複請求、循序資料庫往返、render-blocking 資源或過大的前端套件。
- 修改前與修改後各至少一次；若條件不同，要明確標示不可直接比較。

若沒有登入瀏覽器 session 或 Chrome DevTools，請寫「未量測」，不要猜數字；單次基線只能說明現況，
不能宣稱改善幅度。

## 變更紀錄

### 2026-09-17

- `36f32f8a44e121689d7a01836d75dcbd99e4a5ee` 已由 Staging Release `35121647301`／Staging Go-Live
  `35121777337` 部署；`/api/health` 為 `status=ok`、`issues=[]`、`warnings=[]`，revision `36f32f8a44e1`。
- 真實登入 LEO 社員頁重新載入後，hero 圖片 DOM 為 `1` 張、preload 為 `1` 個（body 1、head 0）；使用
  `next/image` 的 `preload` 與 `unoptimized`，直接載入 `/hero-mountains.webp`。先前 React preload 方案的 hosted
  重複已被這次部署的 DOM 證據取代。
- 本機完整品質與資料庫驗證均通過，`member-home-1440` 為 `3 passed`；CI `35121629076` 成功。Browser Smoke
  `35121629061` 最後為 `189 passed`、`57 skipped`、`1 failed`，失敗是 role-shell 負向登入測試的密碼輸入框
  被串流重繪卸載而逾時；這次沒有手動觸發或重跑 CI／Browser Smoke。之後的測試隔離修正已在
  `965abc8` 通過本機六尺寸 `18 passed`，自動 CI `35123956529` 與 Browser Smoke `35123956508` 也成功；
  因為只改測試檔，沒有重新部署 staging。
- 最新社員首頁／管理頁 CWV 前後比較：未量測；保留 2026-09-16 數字作為不同條件的歷史基線，不宣稱因果改善。
- 平台扶輪社清單的 `prefetch={false}` 修正由 `f4cddb6` 提交，已隨 `122396f` 部署並包含在目前 `49d4193` staging runtime；Chrome DevTools 觀察到背景 RSC 預載消失，
  但 E-06 的社員首頁／社務管理同條件 FCP／TTFB／LCP 前後比較仍未完成。

### 2026-09-16

- 本輪尚未部署的工作樹修正：以 React DOM `preload()` resource hint API 取代可能在串流 head／body 重複的 literal `<link>`；
  hero 圖仍只在社員首頁出現，管理頁不載入。重新跑本機 production-build Playwright 六種尺寸，共 `8 passed`、`10 skipped`，
  桌面實際確認 hero 圖片 `1` 張／preload `1` 個。完整本機檢查與 DB verification 均通過；staging 尚未重測。
- `bd8a8e9d0205` 已部署社員首頁效能修正：將 CSS background 改成首頁限定的 eager `<img>`，移除手動 React `preload()` 與
  `fetchPriority="high"`，保留管理頁不載入 hero 圖片的邊界；本輪沒有新增 migration，也沒有修改快取／登入／權限。
- staging 真實登入社員頁（網址加驗證 query、重新抓取頁面）確認 `/hero-mountains.webp` 的圖片 DOM 為 `1` 張，但 hosted
  React／Next DOM 仍有 `2` 個相同的普通 preload 提示，分別位於 head 與 body；這與本機 production build 的 `1` 個提示不同，
  因此仍需把 hosted streaming 行為視為後續調查項目。
- 本機社員首頁 E2E：`3 passed`（`member-home-1440`，含圖片 1 張／preload 1 個與管理模式不載入圖片）。
- 以 Chrome DevTools 在 staging 的真實 LEO 社員頁重新載入：LCP `1.30 s`、CLS `0.01`，LCP 元素為
  `img.member-portal-module__wpzd3a__backdropImage`；INP、FCP、TTFB 分別為未量測、未量測、未量測。因 runtime 與快取條件
  和修改前基線不同，不能宣稱前後因果改善；E-06 仍未結案。
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
