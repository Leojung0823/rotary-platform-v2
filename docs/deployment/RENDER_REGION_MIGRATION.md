# Render 區域搬遷檢查清單（維吉尼亞 → 新加坡）

## 為什麼要搬

實測（2026-08-19，staging）：

| 端點 | 內容 | TTFB |
| --- | --- | --- |
| `/health` | 完全不碰資料庫 | 約 235ms |
| `/api/health` | 只做一次 `select id from clubs limit 1` | 約 500ms |

相減後，**單次 Supabase 往返約 265ms**。原因是三方分離：

| 元件 | 位置 |
| --- | --- |
| 社員 | 台灣 |
| Render 應用程式 | 美東維吉尼亞 |
| Supabase 資料庫 | 首爾（ap-northeast-2） |

Render 沒有首爾或東京機房，亞洲只有新加坡。搬到新加坡會同時縮短兩段距離：使用者到應用程式（約 200ms → 約 50ms），應用程式到資料庫（約 265ms → 約 80ms）。

社員首頁目前是 2 次循序資料庫往返（`b03b8ef` 已把 4 次降為 2 次），估計可從約 1 秒降到 0.3–0.4 秒。

不要反過來把 Supabase 搬到美東：社員在台灣，那樣使用者到應用程式那段依然很慢。

## 動手前先確認

- [ ] 手邊有一段不受打擾的完整時間。**搬遷過程中 LINE 登入會短暫失效**，不要在社員可能使用的時段做。
- [ ] 目前 staging 是綠的：`curl -s https://<現行網域>/api/health` 回傳 `"status":"ok"`、`"issues":[]`。
- [ ] 記下現行服務的 Service ID（Render 服務頁面上有），出問題時要用來退回。

## 為什麼不能直接改區域

Render 服務的區域建立後不可變更，只能新建服務再切換。這代表搬遷過程中會**同時存在兩個服務**，必須確保新舊兩邊的設定一致，否則會出現「部署到 A、驗收打到 B」的錯亂。

---

## 步驟一：建立新服務

- [ ] Render → New → Web Service，指向同一個 GitHub repo（`Leojung0823/rotary-platform-v2`）
- [ ] **Region 選 Singapore**
- [ ] Branch 選 `main`，環境選 Docker（與現行服務一致）
- [ ] 方案先選 Free（與現行一致；正式上線前再評估升級）
- [ ] 先**不要**開啟 Auto-Deploy，避免設定還沒填完就先跑一次失敗的部署
- [ ] 記下新服務的網址，例如 `https://rotary-platform-v2-sg.onrender.com`

## 步驟二：環境變數

把現行服務的環境變數整份複製過去（Render 服務頁 → Environment）。完整清單見 `STAGING_RUNBOOK.md` 第 2 節。

**其中兩個必須換成新網域**：

- [ ] `NEXT_PUBLIC_SITE_URL` = 新網址（不含尾斜線）
- [ ] `LINE_LOGIN_CALLBACK_URL` = 新網址 + `/api/auth/line/callback`

這兩者的關係是被程式碼強制檢查的。`src/lib/deployment-env.mjs` 會驗證：

```
LINE_LOGIN_CALLBACK_URL === new URL("/api/auth/line/callback", NEXT_PUBLIC_SITE_URL)
```

不一致會產生 `LINE_LOGIN_CALLBACK_URL_MISMATCH`，並且**會出現在 `/api/health` 的 `issues` 裡**——所以填錯不會默默壞掉，一驗健康檢查就看得到。

其餘照抄不要改：

- [ ] `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_SERVICE_ROLE_KEY`（仍指向同一個首爾專案）
- [ ] `APP_ENV=staging`、`TRUSTED_ADMIN_ENVIRONMENT=staging`（兩者必須相同，否則 `TRUSTED_ADMIN_ENVIRONMENT_MISMATCH`）
- [ ] `LINE_LOGIN_MODE=line`（hosted 環境不接受 `mock`）
- [ ] `LINE_LOGIN_CHANNEL_ID`、`LINE_LOGIN_CHANNEL_SECRET`
- [ ] `LINE_OA_MODE=mock`（staging 可接受，只會產生提醒）

> 註：`/api/health` 長期顯示的 `DEPLOYMENT_WARNING`，來源就是 `LINE_OA_MODE=mock` 在 staging 觸發的 `STAGING_LINE_OA_IS_MOCK`。這是預期行為，不是搬遷造成的問題，搬完之後仍會存在。

## 步驟三：LINE Developers 設定

- [ ] LINE Developers Console → 對應的 Login channel → Callback URL
- [ ] **新增**新網域的 callback（`https://<新網址>/api/auth/line/callback`），**先不要刪掉舊的**

保留舊的，是為了讓新舊兩個服務在切換期間都能登入，萬一要退回不必再改一次 LINE 設定。

## 步驟四：先驗證新服務（此時還沒有人使用它）

- [ ] 在 Render 手動觸發一次部署（Manual Deploy）
- [ ] 部署完成後檢查健康狀態：

```
curl -s https://<新網址>/api/health
```

必須是：

- `"status":"ok"`
- `"checks":{"configuration":true,"database":true}`
- `"issues":[]` ← **這裡若有東西，先解決再往下**
- `"warnings":["DEPLOYMENT_WARNING"]` ← 這個是預期的

- [ ] 用手機實際跑一次 LINE 登入，確認能進到首頁
- [ ] 順手量一下改善幅度：

```
for i in 1 2 3 4 5; do curl -s -o /dev/null -w "%{time_starttransfer}\n" https://<新網址>/api/health; done
```

預期從約 500ms 降到約 150–200ms。**如果沒有明顯改善，先停下來查原因**，不要繼續切換。

## 步驟五：切換發布管線

新服務確認正常後，才改這些設定。

- [ ] Render 新服務 → Settings → Deploy Hook，複製新的 hook URL
- [ ] GitHub repo → Settings → Secrets and variables → Actions
  - [ ] **Secrets** → 更新 `STAGING_DEPLOY_HOOK` 為新的 hook URL
  - [ ] **Variables** → 更新 `STAGING_BASE_URL` 為新網址

這兩個各自的用途（若填錯會如何）：

| 設定 | 用途 | 填錯的後果 |
| --- | --- | --- |
| `STAGING_DEPLOY_HOOK` | Go-Live 用它觸發部署 | 部署到舊服務，新服務永遠不更新 |
| `STAGING_BASE_URL` | 部署後的煙霧測試與真實帳號驗收打這個網址 | 驗收打到舊服務，等於沒驗到新版本 |

兩者必須**同時**指向新服務，否則 Go-Live 會出現「部署 A、驗收 B」的錯亂，而且可能誤判成功。

- [ ] 新服務開啟 Auto-Deploy（與舊服務原本的設定一致）
- [ ] 舊服務**關閉** Auto-Deploy，避免兩邊同時被推送

## 步驟六：端到端驗證

- [ ] 跑一次完整的 Plan → Go-Live（照 `STAGING_RUNBOOK.md` 第 5 節）
- [ ] 確認 Go-Live 的「Wait for the exact deployed revision」與「Run protected hosted member acceptance」都通過——這代表部署與驗收確實打在同一個新服務上
- [ ] 確認 `/api/health` 的 `revision` 等於剛部署的 commit

## 步驟七：收尾

- [ ] **保活監控改指向新網址**（`https://<新網址>/health`）

  忘了改的話，新服務會照樣進入休眠、冷啟動 50 秒的問題會回來，而且舊服務被你一直叫醒卻沒人用。

- [ ] 觀察一段時間（建議至少一天，含社員實際使用）
- [ ] 確認穩定後才刪除舊服務
- [ ] 舊服務刪除後，才從 LINE Developers 移除舊的 callback URL
- [ ] 若想沿用原本的 `rotary-platform-v2.onrender.com` 名稱，必須先刪掉舊服務再重新命名新服務（Render 的子網域全域唯一）。這會再造成一次網址變更，上面所有綁網址的設定都要再改一輪——**除非有必要，建議直接接受新網址**。

---

## 退回方式

切換後若發現問題，退回只需要三步（舊服務還在，資料庫從未變動）：

1. `STAGING_DEPLOY_HOOK` 與 `STAGING_BASE_URL` 改回舊值
2. 舊服務重新開啟 Auto-Deploy、觸發一次部署
3. 保活監控改回舊網址

因為整個搬遷**完全沒有動到資料庫**，退回不會有任何資料風險。

## 這次搬遷不會改變的事

- Supabase 專案、資料、migration 狀態
- 所有 GitHub Actions workflow 的內容（只改 secret 與 variable 的值）
- LINE channel 本身（只是多一個 callback URL）
- 應用程式的任何程式碼

## 之後還可以再做的

- 把 Supabase 專案也搬到新加坡，讓應用程式與資料庫同區（往返 80ms → 約 10ms，首頁估計再降到 0.15–0.2 秒）。但這需要遷移資料、有停機時間，效益相對有限，建議先感受過本次搬遷的效果再決定。
- `/events` 與 `/directory` 各自還有一次多餘的往返：兩者都先問「我屬於哪些社」再問「這個社的資料」，而前者的答案其實已經在同一次請求已取得的角色脈絡裡。屬於純程式碼改動，風險低。
