# 「我是扶輪人」iOS App 開發企劃書

**狀態：擱置。** 目前優先改善 LINE 入口與長輩使用體驗，請見 [長輩友善入口企劃](../product/ELDER_FRIENDLY_ACCESS_PLAN.md)。以下保留原本的 iOS 規劃供未來參考。

更新日期：2026-11-03

狀態：企劃，尚未開發、簽署或發布

## 一、產品目標

讓社員在 iPhone 下載、安裝「我是扶輪人」App，從手機桌面開啟，使用原有帳號查看所屬社團、活動與社內互動。第一階段**不在 App Store 公開上架**，先讓受邀社員可安裝、試用並提供意見。

重點不是把現有帳號重新註冊一次，也不是再建立另一份社員資料：App 應連到同一套經核准的後端，沿用既有身份、社籍、權限與社團資料隔離。第一版先使用 staging 測試資料，不能接觸正式會員資料，正式環境另行核准。

### 目前已知現況

- 專案已有 Next.js 網站、手機適配畫面、`/install` 安裝教學與 PWA；iPhone 現在可以透過支援的瀏覽器操作「加入主畫面」。這是網站捷徑／網頁 App，不是可用 TestFlight 安裝的原生 iOS App。
- 原有 PWA 規劃與注意事項見 [手機 Web App 企劃](MOBILE_WEB_APP_V1_PLAN.md)。既有文件曾將 iOS 實機驗收列為未完成；本企劃未重新驗證線上狀態，不應視為已通過。
- 目前網站登入後的頁面依賴 Next.js 伺服器運行及 Cookie，例如首頁、活動、議題頁都有伺服器端資料讀取。不能直接把整個網站輸出成靜態檔，就認定 iOS 安裝檔會完整運作。
- 現有網站及 PWA 繼續保留。iOS App 是新增入口，不取代網站，也不代表 Android 版本已完成。

## 二、第一階段怎麼讓社員安裝？

**建議：TestFlight 邀請測試。** 開發完成後，將測試版上傳 Apple 的 App Store Connect，邀請社員安裝 Apple 的 TestFlight，再由 TestFlight 安裝本 App。它不是 App Store 公開上架；但使用 Apple 的測試發布服務，外部測試版可能需要 Apple 測試審查，不能保證送出後立刻可安裝。測試版每個 build 最多可用 90 天，到期需要新的版本。詳見 [Apple TestFlight 說明](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)。

| 方式 | 社員怎麼安裝 | 適合情境／限制 |
| --- | --- | --- |
| TestFlight（建議） | 接受邀請 → 安裝 TestFlight → 安裝本 App | 適合多位社員試用與更新；需 Apple Developer Program，外部測試可能須審查，測試版會到期。 |
| Ad Hoc IPA | 先登記每台 iPhone 的裝置識別，再用合規方式安裝已簽署的 `.ipa` | 適合少量固定設備；不是把檔案傳到 LINE 就能讓所有 iPhone 任意安裝，設備和憑證受 Apple 限制。 |
| Xcode 直裝 | 用 Mac 和 Xcode 將開發版裝到指定 iPhone | 適合開發者自測，不適合發給多數社員。 |
| 網站加入主畫面 | 由瀏覽器操作加入桌面 | 立即可用的替代入口，但不是本企劃要求的 iOS 安裝檔。 |

TestFlight 或 Ad Hoc 需要 Apple Developer Program，Apple 目前公布費用為每年 **US$99**，實際以所在地幣別及 Apple 頁面為準；符合條件的非營利組織可向 Apple 查詢是否能申請費用減免。免費 Apple 開發帳號可用於自行透過 Xcode 測試，但不能替代上述正常發布資格。[Apple 會員說明](https://developer.apple.com/programs/)／[加入條件](https://developer.apple.com/programs/enroll/)

## 三、第一版功能範圍

### 社員端必備

1. 開啟 App、載入提示、網路中斷與重試提示。
2. LINE 登入與安全登出；重開 App 後依有效 Session 維持登入，過期則提示重新登入。
3. 首頁：近期活動、待辦與最新通知；待辦可跳至正確內容。
4. 活動：清單、單一活動、我要參加／不克參加／取消回覆；時間未定清楚顯示。
5. 社內互動：議題清單、詳情、留言與投票，遵守該議題原本的可見範圍與匿名規則。
6. 我的：顯示個人資料與既有社費資訊入口，以實際權限及功能狀態為準。
7. 支援外部分享連結：未登入時先登入，再安全回到指定頁面；無權限則顯示無法存取，不洩漏內容。
8. 可辨識 staging 測試版，避免社員誤認為正式資料。

### 管理功能

第一階段不新做完整管理後台。若技術驗證採用既有網頁畫面，社務管理入口是否一併開放，應先確認在 App 中的登入、模式切換與權限行為；未通過驗證的管理功能，清楚提示改用現有網站。不得因隱藏按鈕而取代後端權限檢查。

### 本期不承諾

- App Store 公開上架、Android App、離線操作、系統推播、背景定位、Apple Watch、社費繳款或任何新的金流。
- 既有 QR／GPS 簽到若未通過 App 實機驗證，不得宣稱可用；先顯示明確說明及導向網站方案，且不得改變出席或缺席規則。
- 不因 App 專案自動啟用原本關閉的其他功能；本企劃本身不要求社員手動開啟新功能旗標。

## 四、技術方案與決策

### 推薦執行路線：先做實機技術驗證，再決定正式架構

先以小型 iOS 原生容器與現有 staging 網站驗證登入、分享連結、Cookie 和相機／定位；這只是可行性測試，不預設能直接成為 App Store 成品，也不保證網頁容器能通過 Apple 4.2 審查。測試通過且風險可控時，第一階段可採原生 App 容器加既有服務；若登入或關鍵功能不可用，改採原生畫面／後端 API 的方式，逐步承接首頁、活動及議題。

| 路線 | 優點 | 限制與判斷 |
| --- | --- | --- |
| 原生容器 + 既有網站 | 初期可重用較多現有畫面 | 必須有線上 Next.js 服務；登入回跳、外部連結、相機、定位與網頁存取均須逐項驗證。僅包裝網站有 Apple 4.2 審查風險。 |
| 原生 iOS 畫面 + 沿用後端/API | 可針對 iPhone 打造更完整體驗 | 工作量較高，需確認現有 API 能支援權限及資料一致性；未有的能力不能假定現成。 |
| Capacitor 等混合式方案 | 可重用部分前端並整合原生能力 | 本專案使用伺服器端 Next.js，不能假定能靜態打包；開發用的遠端載入設定不得直接當成正式架構，需要另行設計和驗證。 |

架構定案前輸出比較紀錄，明列哪一部分放在 App、哪一部分留在伺服器、授權如何傳遞、離線與更新行為及測試結果。優先重用現有成熟業務邏輯，不重做資料庫；必要的 API 變動必須保留既有權限，並另提安全測試。

## 五、登入與分享連結：最優先風險

目前網站 LINE 登入、Safari、iOS App 內 WebView 的登入儲存可能不同，**不能假設在 Safari 登入後 App 就自動登入**。登入過程不得把密碼、access token 或 refresh token 放入網址、App 記錄或聊天訊息。

第一個技術驗證必須在真實 iPhone 確認：

1. App → LINE／系統登入畫面 → App；使用者允許及取消各一次，不能陷入循環。
2. 登入完成後身份正確；App 關閉重開、逾期、登出、切換另一個帳號均正常。
3. 社員從 LINE 開啟活動或議題連結：已安裝／未安裝、已登入／未登入、無權限與連結失效均有正確結果。
4. 優先評估系統瀏覽器授權及 Universal Links；若需 LINE iOS SDK、callback、網域或 channel 設定變更，先提出方案及影響，經授權再做。LINE 指出 iOS 的 App／瀏覽器回跳會因容器和系統環境不同而改變，必須真機測試。[LINE 官方說明](https://developers.line.biz/en/tips/2026/05/07/line-launch-issue/)
5. 不從外部收到的網址盲目跳轉；只接受核准網域與站內路徑，仍由伺服器逐次驗證社籍和內容權限。

## 六、相機、定位與隱私

- 只在社員主動使用 QR 簽到或 GPS 簽到時詢問對應權限，並用白話說明用途；拒絕時不影響閱讀其他功能。
- 定位資訊只用於既有簽到流程，不新增背景追蹤，不擅自上傳或長期保存定位歷史。
- 不把社員名單、個人資料、登入狀態、投票內容或社費資料放入共用快取。離線只顯示不含個資的提示。
- Keychain、Cookie、安全傳輸、憑證及日誌須依選定架構設計；App 內不得存放 Supabase service-role key、LINE secret 或其他伺服器憑證。
- 不改動既有 RLS、RPC 授權與多社隔離以遷就 App。若後續有新 API，必須測試一般社員、幹部、外社、停權及跨社切換。

## 七、開發階段與交付

| 階段 | 工作 | 交付與通過條件 |
| --- | --- | --- |
| 0. 準備 | 確認 Apple 開發者資格、開發 Mac/Xcode、測試 iPhone、staging 帳號與 Bundle ID 所有權；盤點原有登入與公開 API | 前置檢查表；不存取正式資料。 |
| 1. 技術驗證 | 試作 App 開啟 staging、登入與回跳、受限連結、基本權限及網路異常 | 實機錄製結果與架構決策；任一核心登入／隔離失敗，不進入量產。 |
| 2. 第一版實作 | 依第三節完成社員核心路徑；規劃網頁與原生版本相容 | 可由 Xcode 在測試 iPhone 安裝的開發版與自動化測試結果。 |
| 3. 安全與實機驗收 | 社員／幹部／外社帳號測試，回歸現有網站與 LINE Login；檢查可及性、失敗復原 | 驗收紀錄列裝置、系統版本、版本號、操作及結果；不能只用模擬器代替。 |
| 4. TestFlight 內測 | 建立 App 記錄、簽署及上傳，先邀請內部測試者；需要時申請外部測試 | 受邀者能安裝與更新，記錄 build 編號、有效期限與測試回報。 |
| 5. 試用決策 | 根據社員意見修正；決定是否擴大測試或再規劃上架 | 可用／需修正清單；不等同 App Store 上架或正式發布。 |

粗估：技術驗證約 **1–2 週**，第一版與回歸約 **2–5 週**，TestFlight 與真人驗收約 **1–2 週**；總計約 **4–9 週**。這是尚未實測的工作量區間，不含 Apple 審查、帳號申請或外部協作等待；登入與架構若需重做，時程須重新估算。

## 八、驗收清單

- [ ] 受邀社員可以從 TestFlight 安裝、更新及打開 App；不是只收到 `.ipa` 檔。
- [ ] 測試版明確標示測試環境；沒有誤連 production。
- [ ] 社員 A、社員 B、幹部及外社帳號各自看到正確範圍；停權與撤銷社籍立即依後端規則生效。
- [ ] LINE 登入、取消登入、過期、登出、重開 App 均正常。
- [ ] 外部活動／議題連結在登入後回到正確內容；無權限不洩漏。
- [ ] 報名、取消回覆、留言、匿名／具名投票結果與網站一致，避免重複送出。
- [ ] 權限被拒、網路中斷、伺服器不可用時有可理解的提示，恢復後能重試。
- [ ] 若提供 QR／GPS，完成真機權限拒絕、授權、時間未定與跨社負向測試；未通過則不開放該功能。
- [ ] 完成字體放大、安全區域、VoiceOver 基本操作與 iPhone 小螢幕檢查。
- [ ] 記錄測試版本、裝置／iOS、每項結果與未解問題；沒有證據的項目標「未驗收」。

## 九、後續 App Store 準備（非第一階段）

若未來決定公開或特定對象發行，需再確認應用程式名稱及品牌授權、開發者法人、隱私權政策、資料蒐集揭露、帳號刪除規則、留言／使用者產生內容治理、審查帳號及登入方式（含適用的第三方登入規定），並由 Apple 依當時規則審查。Apple 明定 App 應有超出單純重包網站的功能與體驗，TestFlight 能安裝不代表一定能通過正式上架。[Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

## 十、開始開發前需確認

1. 是否已有 Apple Developer Program？要使用個人或組織帳號？本企劃不要求提供密碼或憑證到聊天。
2. 第一批邀請多少位測試社員？是否接受先安裝 TestFlight？
3. App 顯示名稱與圖示是否沿用「我是扶輪人」？需確認品牌與扶輪相關標識使用授權。
4. 第一階段只連 staging 的測試帳號與測試資料；要接正式環境時，另行決定及授權。
5. QR／GPS 和社務管理若在原生容器不能安全運作，是否接受第一版先使用網站完成？

## 參考資料

- [Apple：使用 Xcode 發布測試版與正式版](https://developer.apple.com/documentation/Xcode/distributing-your-app-for-beta-testing-and-releases)
- [Apple：TestFlight 測試版](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)
- [Apple：Ad Hoc 簽署與裝置註冊](https://developer.apple.com/help/account/provisioning-profiles/create-an-ad-hoc-provisioning-profile/)
- [Apple：App 審查規範](https://developer.apple.com/app-store/review/guidelines/)
- [LINE：iOS SDK 登入整合](https://developers.line.biz/en/docs/line-login-sdks/ios-sdk/swift/integrate-line-login/)
- [Capacitor：iOS 技術說明](https://capacitorjs.com/docs/ios)
