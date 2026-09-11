# 每社專屬 LINE OA 登入後引導與社員配對企劃書

狀態：PR-1、PR-2 已完成並部署 staging；PR-3 真實驗收尚未執行

建立日期：2026-09-03（Asia/Taipei）　　更新日期：2026-09-11（Asia/Taipei）

本文件原為開發前企劃。實作已落地，逐條對照與差異見 §16、§17。

依據：

- `docs/mvp/LINE_OA_FOLLOW_PAIRING_PLAN.md`
- `src/app/login/page.tsx`
- `src/app/api/auth/line/start/route.ts`
- `src/app/api/auth/line/callback/route.ts`
- `supabase/migrations/20260902000200_line_oa_follow_event_pairing.sql`

## 1. 決策摘要

本案採用「**每個扶輪社使用自己的 LINE OA，平台共用一套 LINE Login，社員登入後顯示目前社別的加入連結**」的方式。

這代表：

1. 不為每個扶輪社建立一套 LINE Login channel。
2. 不使用 LINE Login 的 add friend option 來選擇不同社別的 OA。
3. 登入後由伺服器判斷社員目前的社別，再顯示該社的官方 LINE 加入連結。
4. 加好友與平台帳號綁定是兩件事；兩者完成後，系統才把 OA follower 配對到社員。
5. 使用者可以稍後再加入，不因為拒絕加入而被鎖在平台外。

## 2. 為什麼要這樣做

社員目前必須自己記得搜尋或掃描各社的 LINE OA，實際上很多人不會主動去做，導致：

- 社員收不到會議、生日、公告等通知；
- 幹部看得到未配對的 follower，卻不知道該社員是誰；
- 只靠登入後再提醒，若沒有清楚的入口，轉換率仍會很低；
- 若每個 OA 都搭配不同 LINE Login channel，平台要管理大量 channel、Secret、回呼網址與測試設定。

因此要把加入 OA 放在「登入完成後、進入首頁前」的明確引導中。

## 3. 名詞與邊界

### 3.1 平台帳號

社員在 Rotary 平台上的 `app_accounts`，可以使用 Email／密碼或 LINE Login 登入。

### 3.2 LINE Login 身份

`line_identities` 記錄 LINE Login 的身份。它證明某個 LINE 身份已經綁定哪一個平台帳號，不能用來代替社籍權限判斷。

### 3.3 LINE OA 好友

`line_oa_followers` 記錄某個扶輪社 OA 收到的 follow 事件。加好友本身不代表平台帳號已經完成綁定。

### 3.4 自動配對

目前的 `auto_pair_line_oa_follower` 使用同一個 Provider 下的精確 `provider_subject` 比對，不能使用姓名、頭像、電話或其他猜測。

## 4. 目標

### 4.1 使用者目標

- 社員登入後馬上知道「為什麼要加入本社 LINE OA」。
- 社員只看到目前社別的 OA，不會誤加其他社的 OA。
- 社員按一次主要按鈕，就能開始加入流程。
- 已經加入的人不再重複被打擾。
- 不想加入的人可以略過，之後仍可從首頁或「我的」重新加入。

### 4.2 系統目標

- 依目前登入帳號與有效社籍，由伺服器決定顯示哪一個 OA。
- 加好友後自動配對到正確的 `person_id` 與 `app_account_id`。
- 無論 follow 事件先到或 LINE Login 綁定先完成，都能最後完成配對。
- 多社帳號維持社別隔離。
- OA 未設定、被停用、配對失敗時，不洩漏身份資料，也不影響一般登入。

## 5. 不做的事

- 不為每個扶輪社複製一套平台登入頁。
- 不在沒有使用者同意的情況下偷偷加入 LINE OA。
- 不把 cookie 當成 LINE 身份或好友證明。
- 不用姓名、電話、頭像、Email 做模糊配對。
- 不讓瀏覽器直接寫 `line_oa_followers` 或 `line_identities`。
- 不改既有 follow／unfollow webhook 的安全驗證邏輯。
- 不改推播內容與推播派送架構。
- 不因使用者拒絕加入 OA 而阻止登入或限制社務功能。
- 不在本案建立每社一個 LINE Login channel 的複雜部署方案。

## 6. 架構決定

### 6.1 LINE Login channel

平台維持一套 LINE Login channel，負責：

- LINE Login 身份驗證；
- 綁定既有平台帳號；
- 取得穩定的 `provider_subject`。

### 6.2 每社 LINE OA

每個扶輪社可以有自己的 `line_oa_accounts`：

- `club_id` 決定它屬於哪個社；
- `basic_id` 用來產生或顯示該社的官方加入連結；
- `account_status` 必須是可用狀態才可顯示；
- OA 的 channel token、secret 仍只放在伺服器環境，不送到瀏覽器。

LINE 官方的 add friend option 一個 LINE Login channel 只能連結一個 LINE OA，因此本案使用每社專屬的普通加入連結，而不是把各社 OA 綁進同一個 add friend prompt。[LINE 官方說明](https://developers.line.biz/en/docs/line-login/link-a-bot/)

### 6.3 Provider 要求

若要使用目前的精確自動配對，該社的 Messaging API channel 與平台 LINE Login channel 必須在同一個 Provider 底下，讓兩邊的使用者 subject 可以相等。

如果某社 OA 在不同 Provider：

- follow 事件仍可建立 follower；
- 但不得猜測身份，也不得強行配對；
- 必須維持未配對，交由明確的綁定或幹部手動處理。

## 7. 使用者流程

### 7.1 已經綁定 LINE Login 的社員

1. 社員使用 Email／密碼或 LINE Login 登入。
2. 伺服器取得目前有效社籍與目前選定的社別。
3. 若該社有啟用中的 OA，且目前帳號尚未有有效配對，顯示加入卡片。
4. 社員點擊「加入本社 LINE OA」。
5. 開啟該社專屬 LINE 加入連結。
6. LINE 將 follow 事件送到該社 webhook。
7. webhook 建立或更新 follower，並用現有自動配對 RPC 精確配對。
8. 社員回到平台後，平台重新查詢狀態；確認成功才顯示「已加入」。

### 7.2 尚未綁定 LINE Login 的社員

不能只開啟 OA 加入連結，因為平台會收到 OA userId，卻沒有可用的 LINE Login identity 可以安全比對。

流程應為：

1. 社員登入平台後看到「綁定 LINE 並加入本社 OA」。
2. 平台啟動既有 `flow=bind`。
3. LINE Login 成功後，回到原本的社別與引導頁。
4. 顯示該社專屬 OA 加入連結。
5. 社員點擊加入，收到 follow 事件。
6. 系統以相同 `provider_subject` 完成自動配對。

畫面可以把它包裝成一個任務，但要清楚說明是兩個動作：

> 第一步：綁定你的 LINE 身份
>
> 第二步：加入本社官方 LINE

### 7.3 使用者已經先加好友，再完成綁定

這個順序也要支援：

1. 使用者先從別處加入本社 OA。
2. webhook 建立未配對 follower。
3. 使用者之後在平台完成 LINE Login 綁定。
4. 綁定完成後，系統重新嘗試配對。

### 7.4 使用者已經綁定，但尚未加好友

只顯示「加入本社 LINE OA」，不要求重新綁定 LINE。

### 7.5 使用者已經配對

不顯示強制引導，可在「我的」或通知設定中顯示目前狀態：

> 本社 LINE：已連接

### 7.6 使用者略過

「稍後再說」只代表暫時不加入：

- 不修改社籍、權限或登入狀態；
- 不建立假配對；
- 下一次登入可以再次提醒；
- 同一裝置可用本機狀態降低重複打擾，但本機狀態不是安全依據。

## 8. 多社行為

### 8.1 一個帳號只有一個目前社別

登入後使用目前的 active club，顯示該社 OA。

### 8.2 一個帳號有多個有效社籍

只顯示目前選定的社別。社員切換社別後，若新社尚未配對，才顯示新社的 OA 加入引導。

不可因為社員屬於 A 社，就把 A 社的 OA 加入連結顯示在 B 社頁面。

### 8.3 平台管理員沒有社籍

平台管理員不應看到「加入某社 OA」的社員引導，除非目前有一個經伺服器確認的有效社籍情境。管理權限不能代替社籍。

## 9. UI 設計

### 9.1 顯示位置

登入成功後，在首頁主要內容前或首頁最上方顯示一張可關閉的引導卡。手機版優先，主要按鈕必須容易點擊。

### 9.2 建議文案

標題：

> 加入「○○扶輪社」LINE 官方帳號

說明：

> 接收會議提醒、生日祝福與重要社務通知，不錯過社內消息。

按鈕：

- 已綁定：`加入本社 LINE`
- 未綁定：`綁定 LINE 並加入`
- 次要操作：`稍後再說`

### 9.3 成功與等待狀態

加入連結會開啟 LINE App 或瀏覽器，follow webhook 是非同步的，因此返回平台時可能尚未完成：

- 先顯示「正在確認加入狀態」；
- 重新查詢目前帳號與目前社別的狀態；
- 短時間內可有限次數重新整理；
- 查不到時顯示「尚未偵測到，請稍候再試」，不可假裝成功。

## 10. 技術實作範圍

### 10.1 Feature flag

新增獨立旗標，例如：

```text
line_oa_onboarding_v1
```

規則：

- 預設關閉；
- 缺少 flag 時 fail closed；
- 與 `line_oa_auto_pairing_v1` 分開；
- 可以只關閉登入引導，不影響既有 webhook 配對；
- 新增 flag 必須同步更新本專案規定的所有 flag 約束、allow-list、telemetry 白名單、TypeScript union 與測試指向。

### 10.2 成員狀態讀取

需要一個只回傳目前登入者、目前社別的窄投影，至少包含：

- `club_id`；
- `club_name`；
- OA 是否存在且可用；
- OA 加入連結或由 `basic_id` 產生的安全連結；
- LINE Login 是否已綁定；
- OA follower 是否已配對；
- 是否仍為有效社籍。

若目前沒有合適的社員讀取 RPC，新增 caller-only RPC；不要讓瀏覽器直接讀 `line_oa_accounts`、`line_oa_followers` 或 `line_identities`。

### 10.3 OA 加入連結

- 連結由伺服器根據已驗證的社別 OA 設定產生；
- 不接受瀏覽器自行傳入另一個 `club_id` 或 `line_oa_account_id` 來換取連結；
- `basic_id` 必須先通過格式驗證；
- 不把 channel secret、access token 或 webhook secret 放進連結或 HTML；
- 若 LINE 官方提供的短連結由幹部設定，應以已驗證且屬於該社的值為準。

### 10.4 LINE 綁定回跳

沿用現有 `/api/auth/line/start?flow=bind`，但要把原本的社別情境放進伺服器保存的 OAuth state：

- 回跳路徑必須是同源且經過 allow-list；
- `club_id` 必須由伺服器驗證使用者當下有有效社籍；
- 不信任回跳網址中的任意社別；
- 綁定完成後回到原本社別的引導頁。

### 10.5 配對順序補強

目前 follow webhook 會在 follow 事件收到時嘗試配對。為了支援第一次登入，LINE 綁定完成後也要再嘗試一次。

必須覆蓋兩個順序：

```text
follow -> LINE identity 綁定 -> 配對
LINE identity 綁定 -> follow -> 配對
```

優先使用既有精確配對 RPC 的冪等行為；不要重新實作一套模糊配對。若要查詢多個有效社別，必須由伺服器依有效社籍逐一處理，不接受瀏覽器提供的 OA ID 清單。

### 10.6 配對失敗

- 無 active OA：不顯示引導；
- 沒有 LINE identity：先引導 bind；
- Provider 不一致：維持未配對；
- 沒有有效社籍：維持未配對；
- 已有其他 follower 使用同一社員：回報 conflict，不覆蓋、不刪除；
- webhook 已建立但自動配對失敗：保留 follower，記錄不含 LINE userId 的一般錯誤碼；
- 任何配對失敗不得讓一般登入失敗。

## 11. 權限與隱私邊界

1. 登入狀態仍由 Supabase Auth 與伺服器 session 決定，不由 cookie 自行宣稱。
2. OA 加入連結可以公開，但「這個人是否已加入」只能回傳給該登入者本人，或符合權限的幹部管理頁。
3. 一般社員不能讀其他社員的 `oa_user_id`、LINE subject 或配對內部欄位。
4. 社別判斷必須同時驗證登入帳號、有效社籍與目前社別。
5. `security definer` RPC 必須設定固定 `search_path`，並只開放必要的執行權限。
6. Audit 不記錄 LINE userId、LINE subject、token 或完整加入連結中的敏感資訊。
7. unfriend／unfollow 後維持既有生命週期規則，不因再次登入而自動恢復已取消的關係。

## 12. 測試計畫

### 12.1 單元與邊界測試

- 已綁定且未加好友：顯示目前社別加入連結；
- 未綁定：顯示 bind 再加入的流程；
- 已配對：不顯示重複引導；
- OA 停用或不存在：不顯示連結；
- 使用者不能用 URL 參數把引導切換到沒有權限的社；
- 不輸出 channel secret、access token、LINE userId；
- `returnTo` 只能回到允許的同源路徑；
- callback 後會再次觸發精確配對；
- 配對 RPC 回傳 conflict、no_match、disabled 時，登入仍成功。

### 12.2 資料庫 verification

若新增 RPC 或資料庫投影，新增對應 verification 並測試：

- 一般社員只能讀自己的狀態；
- 外社社員不能讀取或操作本社狀態；
- 停權／退社社員不能取得有效加入狀態；
- 平台管理員沒有社籍時不能被當成社員；
- 不會把 A 社的 OA 連結回傳給 B 社社員；
- 配對前後不會洩漏 LINE identifiers；
- 綁定先完成與 follow 先完成的兩種順序都能成功；
- 重複 callback、重複 follow 不會產生第二次配對或第二筆 audit。

### 12.3 Browser Smoke / 真實驗收

需在 staging 設定實際社別 OA 加入連結後驗收：

1. Email／密碼登入社員完成 bind。
2. 看到正確社別的加入卡片。
3. 點擊後開啟正確 OA。
4. 回到平台，看到加入狀態更新。
5. 幹部後台看到正確社員已配對。
6. 切換另一社後不會看到前一社的加入狀態。
7. 一般社員直接輸入管理網址仍受後端權限阻擋。

真實 LINE follow 事件需要使用者在 LINE Developers Console 設定 webhook URL，不在本地企劃階段假造成功結果。

## 13. 驗收條件

（2026-09-11 對照目前 `main`／staging 實作結果；證據見 §16）

- [x] 每社可保存並使用自己的 OA 加入連結。
- [x] 平台只使用一套 LINE Login channel，不需要每社複製登入系統。
- [x] 登入後只顯示目前有效社別的 OA。
- [x] 未綁定社員會先完成 LINE 綁定，再進入加入 OA 流程。
- [x] 已綁定社員可直接加入 OA，不必重複綁定。
- [x] follow 先到與 bind 先到都能完成精確配對。
- [ ] 已配對、外社、停權、退社、Provider 不一致的情況不會錯配。
  - 已有專屬 verification 案例：已配對、外社（`line_oa_pair_after_bind_security.sql`）、停權（`line_oa_member_onboarding_security.sql`）。
  - 退社（`ended_on` 已過期）已有專屬 verification（`line_oa_follow_event_pairing_security.sql`），會拒絕自動配對；Provider 不一致仍靠精確 `provider_subject` 比對與部署前同一 Provider 前提，尚無可由資料庫自行推導的獨立 Provider ID 斷言。
- [x] 使用者拒絕加入時仍可正常使用平台。
- [x] OA 未設定或停用時不顯示無效連結。
- [x] 不洩漏 LINE userId、subject、token 或其他敏感設定。
- [ ] 單元、資料庫與必要的瀏覽器驗收全部通過。
  - 已通過：單元測試（`src/lib/line` + `club-switcher-ux` 共 114 項）、CI 的資料庫 verification（`ci.yml` 於 `f7dc631` 綠燈）、本機 e2e（`member-home.e2e.mjs` 驗到引導卡與 `https://line.me/R/ti/p/%40e2e-rotary`）。
  - 未執行：staging 真實 LINE follow 驗收（§12.3），即 PR-3。

## 14. 建議開發順序

### PR-1：登入後 OA 引導讀取與 UI　✅ 已完成（`f4051db`）

- 新增 feature flag；
- 建立 caller-only 狀態投影；
- 登入後顯示目前社別的加入卡片；
- 加入、稍後再說、已完成等狀態；
- 不改 webhook 與推播。

### PR-2：LINE bind 回跳與順序補強　✅ 已完成（`5ccf4de`）

- 將目前社別安全地帶過 OAuth state；
- 未綁定社員先完成 bind；
- bind 完成後重試精確配對；
- 覆蓋 follow／bind 先後順序測試。

### PR-3：Staging 真實驗收　⬜ 尚未執行

- 各社填入並驗證自己的 OA 加入連結；
- 設定 webhook URL；
- 由測試社員實際加入與取消好友；
- 驗證多社隔離、後台顯示與通知流程；
- 確認後才逐步開啟 feature flag。

## 15. 目前結論

這個方案不需要每個扶輪社建立自己的 LINE Login channel，也能保留每社自己的 OA。

真正的關鍵不是「把連結放上去」而已，而是：

1. 登入後要在正確時機主動提醒；
2. 尚未綁定 LINE 的社員要先完成身份綁定；
3. follow 與 bind 的先後順序都要能補配；
4. 每次都由伺服器依有效社籍決定 OA，不能由瀏覽器自行指定。

## 16. 實作對照（2026-09-11，對照目前 `main`／staging）

| 企劃段落 | 實作位置 |
| --- | --- |
| §10.1 feature flag `line_oa_onboarding_v1` | `src/lib/product/feature-flags.ts`、`scripts/set-feature-flags.mjs`；預設關閉、fail closed，另有緊急停用開關 `DISABLE_LINE_OA_ONBOARDING` |
| §10.2 caller-only 狀態投影 | `get_my_line_oa_onboarding_status(uuid)`（`supabase/migrations/20260902000500_line_oa_member_onboarding.sql`），`security definer` + 固定 `search_path`，只授權 `authenticated`；瀏覽器端解析在 `src/lib/line/oa-onboarding.ts` |
| §10.3 OA 加入連結 | 連結由 RPC 以 `verified_basic_id` 組出，瀏覽器不能指定 `club_id` 換連結；前端另以 `isSafeJoinUrl` 限定 `https://line.me/R/ti/p/` |
| §10.4 bind 回跳 | `src/app/api/auth/line/callback/route.ts` 的 `withSuccess(returnTo, "line_bound")`，沿用既有 `safeLineRedirectPath` allow-list |
| §10.5 配對順序補強 | `pair_line_oa_followers_for_subject(text)`（`20260907000100_line_oa_pair_after_bind.sql`），service_role only，內部仍呼叫既有 `auto_pair_line_oa_follower` |
| §10.6 配對失敗 | 重試失敗只記錄 `[LINE_BIND_PAIRING_RETRY_FAILED]`，不影響綁定成功；`pair_status = conflict` 時卡片改為請幹部協助，不覆蓋既有社員 |
| §7 / §9 UI | `src/components/line-oa-onboarding.tsx`、`member-line-oa-onboarding.tsx`、`src/app/(authenticated)/me/line-oa/page.tsx` |
| §8 多社行為 | 首頁引導卡只吃 `activeClub.clubId`（`src/components/member-home.tsx`） |
| §12.1 單元測試 | `oa-onboarding.test.ts`、`oa-onboarding-security-boundary.test.ts`、`oa-onboarding-bind-boundary.test.ts` |
| §12.2 資料庫 verification | `line_oa_member_onboarding_security.sql`、`line_oa_pair_after_bind_security.sql`（列在 `scripts/database-verification-files.txt`，CI 每次執行） |

部署狀態：PR-1 隨 Go-Live `33704642718` 上 staging，`line_oa_onboarding_v1` 已對 staging 開啟；PR-2 與日期窗口防護已在 `main`，最新 staging runtime 為 `e6ff5b9854ef`，Go-Live `34594381922` 成功。詳見 `docs/product/CURRENT_SESSION_HANDOFF.md`。

## 17. 實作與企劃書的差異

以下是實作刻意偏離或超出本企劃書的部分，不是缺口：

1. **加入連結要求「已驗證」而非只驗格式**。企劃 §10.3 只要求 `basic_id` 格式驗證，實作額外要求 `verified_basic_id`、`verified_bot_user_id`、`identity_verified_at` 都齊備（來自真實 bot-info 確認）才視為 `oa_available`。未完成驗證的社不會拿到連結。
2. **「稍後再說」是伺服器狀態，不是本機狀態**。企劃 §7.6 建議用本機狀態降低打擾，實作改為 `line_oa_onboarding_preferences` 的 `dismissal_count`（上限 3）與 `next_prompt_after`，因此跨裝置一致；提示強度依序為 full → banner → quiet → hidden。
3. **社別一律跟隨左側的社別切換器**。企劃 §8.2 的「只顯示目前社別」原本只落實在首頁引導卡；`/me/line-oa` 曾經列出所有有效社籍的社，2026-09-07 已改為只顯示目前所在社，與訊息中心、社員名冊一致。要看另一個社，用切換器切換，頁面不再自備第二個社別選擇器。
4. **多了「我已經是好友」次要動作**，用來讓已經加過好友但尚未配對的人觸發重新確認。
5. **回跳確認採有限次輪詢**：開啟連結後每 3 秒重試、最多 6 次，另外在 `pageshow` 與分頁重新可見時各查一次；查不到就顯示求助文案，不假裝成功。

## 18. 尚未完成

1. **PR-3 staging 真實驗收**（§12.3）尚未執行：需要真實社別 OA 設定 webhook、由測試社員實際加好友與取消好友，並驗證多社隔離與幹部後台顯示。一般 Go-Live `34594381922` 通過的是部署與 hosted member acceptance，不等於真實 LINE follow identity 驗收。
2. **入口已確認、真實加入流程仍未完成**：已用登入 staging 會員開啟 `/me/line-oa`，確認入口可見；目前社別 `HAPPY` 因 OA 尚未完成安全驗證而沒有加入連結，尚未完成真實 follow／自動配對驗收。`DISABLE_LINE_OA_ONBOARDING` 若在 Render staging 有設定，旗標開啟後功能仍為關閉，仍需由有 Render 權限的人確認。
3. **退社日期窗口已補強**：`20260911000300_line_oa_pairing_membership_window.sql` 與 pairing verification 現在會拒絕「狀態仍為 active、但 `ended_on` 已過期」的社員；這項程式與資料庫驗證已完成。Provider 不一致仍缺專屬資料欄位與真人驗收，現行設計只能把「LINE Login channel 與各社 OA 在同一 Provider」當成部署前提，不能由目前資料庫自行推導。
