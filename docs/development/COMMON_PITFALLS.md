# 這個 repo 反覆踩到的坑

更新日期：2026-09-16（Asia/Taipei）

每一條都真的發生過，而且**當下所有本機檢查都是綠的**。會列在這裡，是因為
它們共用同一個形狀：出錯的東西沒有任何測試在問它，或者問它的那個測試本身
是壞的。

---

## 1. 重述一支資料庫函式時，「目前的定義」不一定在你以為的檔案裡

`create or replace` 是最常見的寫法，但不是唯一的。同一支函式可能：

1. 用 `create or replace function` 重新宣告，
2. 先 `drop function` 再 `create function`（簽章改變時必須這樣），
3. 或者**完全不出現在任何宣告裡**——由一支修補 migration 讀出 Postgres 自己
   持有的定義、做字串替換、再 `execute` 回去
   （例：`20260915000200_club_service_plan_year_cast.sql`）。

只比對第 1 種，會把第 2、3 種的修正**靜靜倒回去**，而且所有測試都是綠的——
它們讀的是同一份過時的檔案文字，那份文字照樣說得出它們問的每一件事。

**怎麼做**

- 用 `src/lib/attendance/latest-definition.ts` 解析，不要用眼睛挑檔案。
  它兩種宣告寫法都認。
- 修補型 migration 它看不到。重述前先搜一次：
  ```
  grep -rln "pg_get_functiondef" supabase/migrations/
  ```
  有修補的函式，要把修正一起帶進重述。
- 重述完做逐字比對：把你新增的那一段拿掉之後，必須**字元不差**地等於你所
  依據的定義。任何其他飄移都會在那裡現形。
  （例：`src/lib/club-affairs/officers-and-tags.test.ts`）

---

## 2. 守則要攻擊主張，不是確認你做過的事

一條守則寫完之後，**把缺陷放回去，看它變紅，再還原**。沒做這一步就不算數。

這個 repo 裡出現過的空洞形狀：

- **只問某個字串在不在檔案裡。** 共用的格式化函式被用在兩個地方，把其中一個
  換回手寫拼接，「這個函式有出現」仍然成立。
- **手寫清單漏掉一個案例。** 一份列出「所有簽到閘門」的清單漏了
  `check_in_to_event`，於是那一支身上的舊閘門活了下來——一份漏掉某個案例的
  清單，不可能在那個案例上失敗。**能用查詢的就不要用清單**；真的需要清單時，
  另外加一條「清單必須涵蓋全部」的守則。
- **拿整個檔案比對「這一頁不渲染 X」。** 一句解釋 X 為何被移除的註解就足以
  讓測試失敗——那是在教人不要寫註解。先去掉註解再斷言。
  （例：`src/lib/events/member-event-page.test.ts` 的 `rendered()`）
- **豁免清單沒有理由。** 有豁免名單時，要求每個項目都有**機器看得到的**理由
  （鎖定單一資源、有自己的權限檢查、是 trigger…），否則它就是一扇逃生門。
  （例：`src/lib/events/audience-rule.test.ts`）

**證偽腳本本身也會錯。** 用 `replace(old, new, 1)` 時，如果同一段文字在別的
函式裡也有一份，你改到的可能是別人。看到「改了還是綠」，先確認缺陷真的被
放回去了，再懷疑守則。

---

## 3. SQL 在被 Postgres 解析之前只是一個字串

`column item.ends_at does not exist` 這種錯誤，typecheck、lint、build、單元
測試**全都看不到**。而且第一個錯誤會蓋住第二個——同樣的遺漏在兩個 CTE 裡，
CI 要跑兩輪才會兩個都露出來。

**怎麼做**

- 動到 RPC 的改動，配一個 `supabase/verification/*.sql`，並加進
  `scripts/database-verification-files.txt`。那是唯一會真的跑起來的地方。
- 可以靜態檢查的就靜態檢查：例如「函式裡每一個 `alias.column` 引用，都必須
  由它讀取的那個 CTE 選出來」
  （`src/lib/member-home/projection-columns.test.ts`）。

---

## 4. 可見性規則要在**每一條**路徑上重複套用

分眾活動（`club_event_audiences`）曾經同時漏在四個地方：社員首頁 projection、
報名 RPC、GPS 簽到清單、三條自助簽到路徑。活動列表頁是對的，所以「有一個地方
擋住了」讀起來像安全。

**怎麼做**

- 每一個讀 `club_events` 的函式都必須被分類：社員可見（要套規則，直接或透過
  委派）、或有機器看得到的豁免理由。新增函式時強制做這個決定。
  （`src/lib/events/audience-rule.test.ts`）
- 寫入路徑是比較嚴重的那一半。清單不提供，不等於 RPC 會拒絕。
- 拒絕的答案要和「不存在」一樣，否則拒絕本身就洩漏了那個東西存在。

---

## 5. `gh pr checks` 會聚合整個分支上的所有 run

舊的一次成功會讓新的一次失敗看起來像通過。曾經因此合併了一個 Browser Smoke
是紅的 PR，部署了兩個回歸。

**怎麼做**：只讀 PR HEAD 那一次 run 的 `conclusion`。

```bash
head=$(gh pr view "$pr" --json headRefOid -q .headRefOid)
gh run list --branch "$branch" --limit 15 --json headSha,name,status,conclusion \
  -q ".[] | select(.headSha==\"$head\")"
```

---

## 6. migration 編號亂序

同時開多個分支時，先建立的編號可能比先合併的小。Supabase 會拒絕——**那是對的**，
它就是用來讓亂序被注意到。

**怎麼做**

- 開分支前先看 `origin/main` 的最後一個編號。
- 已經發生時，用 `--include-all`（Staging Release／Go-Live 都有這個輸入）。
  **不要改檔名**，歷史守則會擋。
- 多個 PR 互相重述同一支函式時，後面的要**建在前面的分支之上**再寫，否則會
  把對方倒回去。

---

## 7. 版面：`.page-stack` 是 grid，`.table-wrap` 是它能放下寬表格的唯一原因

grid item 的自動最小尺寸是它的內容，但 `overflow-x: auto` 的 item 是 0。
在 `.page-stack` 和 `.table-wrap` 之間插入任何元素（例如把表格包進 `<form>`），
就把表格的 min-content 還給了頁面。

症狀不在表格上：頁面可以橫向滑動之後，`position: fixed` 的浮層（帳號選單、
底部導覽）會浮在已經滑走的內容上，點不到——錯誤訊息會指著一個無辜的元素說
「intercepts pointer events」。

**怎麼做**：包在外面的元素加 `min-width: 0`。e2e 失敗訊息出現
「X intercepts pointer events」時，**先看失敗截圖**：內容整片偏移就是橫向溢出。

---

## 8. CSS module 的類名被當成死碼刪掉

少一個類名只是一個合法的空 `className`——typecheck、lint、build 全綠。

而且「這張表有沒有提到這個類名」是不夠的檢查：只在 `@media` 裡出現的規則也算
提到，但元素在它真正顯示的寬度下沒有任何樣式。

**怎麼做**：`src/lib/css-module-usage.test.ts` 要求每個 `styles.*` 在對應的
module.css 有一條**頂層**規則。刻意只在 media query 裡定義的，列入具名豁免。

---

## 9. 把兩個狀態折成同一句話

「已婉拒」和「報名截止」曾經共用「報名截止」這一句，於是一位回答不參加的社員
看到的是活動已經截止——在它還開著的時候。

**怎麼做**：狀態對應到文案時，加一條「除了刻意同義的那一組之外，沒有兩個狀態
可以共用標籤」的守則。
（`src/lib/member-portal/registration-label.test.ts`）

---

## 10. 測試釘在 migration 檔名上會過期

`readFileSync("supabase/migrations/2026...sql")` 寫下的那一刻是對的，之後那支
函式每被取代一次，它就離資料庫實際在跑的東西遠一步——而且**不會失敗**。

**怎麼做**：用 `latestDefinition("函式名")`。反過來，斷言「最新定義就是某個
檔名」也是脆弱的：下一個碰到它的 PR 就會讓它紅。要守的是「讀的比函式出生的
那個檔案新」。

---

## 11. 同一條規則被抄在多個地方

「還能不能報名」曾經以 `now() <= registration_deadline and now() < starts_at`
的形式抄在五個地方。要讓欄位可為空，就得改五份拷貝——那正是四份會一致、
一份不會的做法。

**怎麼做**：先把規則收進一支函式，再改那支函式。並加一條守則，禁止手寫的
拷貝再長出來。

**收斂時不要順手「簡化」語意。** `now() <= deadline and now() < starts_at`
寫成 `now() < least(deadline, starts_at)` 看起來更漂亮，但會讓每一場已設截止
的活動都提早一瞬關閉。要保留的就逐字保留，並把原因寫在旁邊。
