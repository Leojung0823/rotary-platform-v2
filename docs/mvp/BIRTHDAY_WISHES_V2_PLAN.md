# 生日祝福 V2 與祝福徵集：企劃書

> 更新日期：2026-08-27
> 狀態：**生日 V2 核心與祝福徵集第一至三階段已完成程式實作；PR #77 已合併，main 已完成一般 staging Go-Live，徵集 flag／專項 hosted 驗收與真人驗收待完成**
> 程式現況基準：生日徵集程式 release SHA `7b3db9794e8c272774c1a3a0edfa8edf34d8c079`（已部署 staging）；本次 release 的後續文件 follow-up 僅同步文件，未改動這些程式、migration、UI、排程 route、workflow 或 verification
> 前一版：[`BIRTHDAY_WISHES_V1_SCOPE.md`](./BIRTHDAY_WISHES_V1_SCOPE.md)（已實作並部署）

這份文件記錄目前產品討論的結論。它取代先前那份「生日祝福與壽星關懷 V2」草稿中
被推翻的部分，並補上該草稿沒有處理的相依性、資料隱私與資料遷移規則。

**要拿這份文件去跟別的 AI 或工程師討論的話，第 6 節「目前程式碼的事實」很重要**
——那些是查證過的現況，不是假設。有幾項會直接推翻常見的提案。

---

## 1. 這一版要做什麼

兩件事，有先後關係：

1. **生日 V2 核心**：新設定預設公開、依隱私同意顯示年齡、同一人可以送多則祝福。**已實作**於
   `20260824000400_birthday_wishes_v2_core.sql` 與 `/birthdays`。
2. **祝福徵集**：系統在壽星生日前自動建立徵集並派發給社員，題庫主動詢問，
   祝福先保密，由幹部按下發佈才揭曉，且揭曉後壽星看不到作者是誰。

本文件第 2–7 節是徵集領域的完整目標規格；目前已完成資料底座、手動月批派發、
幹部發布、匿名公開牆、排程、訊息邀約、題庫 CRUD、隱藏後重送、逐筆完成狀態和處理紀錄的本機實作。

徵集依賴 V2 核心、已存在但預設關閉的**站內訊息中心**，以及 staging-only 的 GitHub Actions 排程入口；程式與本機資料庫驗證已完成，一般 staging Go-Live 已完成，仍待開啟徵集 flag、執行專項 workflow 與真人驗收。

---

## 2. 已決定的事項

### 2.1 生日 V2 核心

| 項目 | 決定 |
|---|---|
| 生日公開預設 | V2 新建立的偏好預設公開。**已明確關閉者維持關閉；既有未設定者不在沒有通知的情況下突然公開。** |
| 年齡顯示 | 顯示整數年齡，**只有該社員同意顯示出生年份時才顯示**；年齡不是無條件公開。 |
| 2/29 | 非閏年的顯示與排序都用 **2/28** |
| `allow_wishes` 預設 | 跟著 `is_listed` 一起預設開，仍可獨立關閉 |
| 祝福則數 | **不限年度數量**；同一社團、同一作者、同一壽星每天最多 10 則，依社團時區由資料庫限制 |
| Feature flag | 新增 `birthday_wishes_v2`，migration 明確插入停用列，並同步所有程式與資料庫白名單 |

#### 既有資料的相容規則

V1 的「沒有 `birthday_visibility_preferences` 列」目前實際效果是**不公開**，不能在 V2
直接解讀成公開。為避免社員沒有同意就被公開，V2 上線時採以下規則：

- 既有 `is_listed = false`：維持不公開。
- 既有 `is_listed = true`：維持公開。
- 既有沒有偏好列：維持 V1 的不公開狀態，等社員自行確認後才依新預設公開。
- V2 新建立的偏好列：預設 `is_listed = true`，`allow_wishes` 跟著公開狀態開啟。

若產品最後決定要把既有「沒有偏好列」的人也改成公開，必須另做有通知、可撤回的資料遷移，
不能把它藏在一般功能 migration 裡。

#### 年齡為什麼要綁出生年份設定

這是本次討論推翻先前草稿的一點，理由要記清楚：

**顯示年齡等於公開出生年份。** 生日名單已經顯示月、日，有了月日就知道今年生日過了沒有：

```
生日 3/15、年齡 45 → 出生年份唯一解，不是估算
```

先前草稿同時要求「顯示年齡」與「不公開出生年份」，這兩件事不能並存。

平台**已經有**社員自己控制的設定「向同社社員顯示出生年份」（`privacy_settings.show_birthday_year`）。
年齡就是出生年份，所以顯示年齡的正確條件是「這個人已經同意公開出生年份」。這個設定目前是
帳號層級，會套用到該帳號加入的所有社團；V2 不可以偷偷把它改成社團層級。

規則：

```
顯示年齡   ⇔  is_listed = true  且  show_birthday_year = true
只顯示月日 ⇔  is_listed = true  且  show_birthday_year = false
```

兩個設定仍然各自獨立、誰也不能代替誰（符合先前草稿 §6 的原則），
但沒有任何一條路能繞過社員已經表達的意願。否則在名冊關掉出生年份的人，
別人改看生日頁就好，那個設定形同虛設。

### 2.2 祝福徵集

| 項目 | 決定 |
|---|---|
| 建立 | **系統自動**在壽星生日前建立 |
| 派發 | **自動**依月份批次分配，每位社員當月最多一則 |
| 派發對象 | 以有效社員為候選池；需要縮小範圍時沿用既有受眾挑選器（全社／標籤／指定社員） |
| 壽星候選 | 只納入符合生日公開、允許收祝福和社籍有效條件的社員 |
| 壽星本人 | **自動排除**，必須在資料庫層擋 |
| 題庫 | 問句而非代寫句；平台提供預設，**幹部可以新增、停用和排序社團題目**；預設題庫見 [`BIRTHDAY_WISHES_QUESTION_BANK_V1.md`](./BIRTHDAY_WISHES_QUESTION_BANK_V1.md) |
| 揭曉前可見範圍 | **只有幹部**看得到全部；作者看得到自己那則（否則無法修改） |
| 揭曉方式 | **幹部按下發佈**，不用排程時間 |
| 揭曉後作者 | **壽星看不到每則是誰寫的**；**幹部看得到** |
| 徵集狀態 | `draft`、`collecting`、`published`、`closed`、`hidden` |
| 重複徵集 | 同一社團、同一壽星、同一生日年度只能有一個有效徵集任務；排程重跑不得重複建立 |
| 壽星看見的內容 | 發佈後可以看見祝福內容，但不能看見作者；這個限制必須由資料庫 RPC 保證 |
| 自動邀約上限 | 同一社團、同一生日年度與月份、每位社員最多一則自動邀約；下一個生日月份重新計算 |
| 手動祝福 | 社員可以自行選其他壽星送出更多祝福；手動祝福不佔用自動邀約上限，但仍受每日防濫用上限限制 |
| 手動祝福作者 | 壽星和一般社員都看不到作者；只有幹部可以看到作者 |

#### 多壽星時的自動邀約分配

本版把「每個人只收到一則」定義為：**每社團每個生日月份，每位符合資格的社員最多收到一則
自動邀約**。這樣一個月有十多位壽星時，社員不會被連續派十多個待辦，但仍可主動幫更多人慶生。

自動分配規則：

- 候選派發對象只包含當下仍有效的社團社員，壽星本人不能被分配給自己。
- 正常以全社有效社員為候選池時，壽星人數不會超過社員人數；若幹部縮小受眾、社員停權或拒絕，導致個別壽星沒有可分配對象，幹部介面要明確顯示待補祝福。
- 如果候選派發對象足夠，先讓每位壽星至少分配一位社員；剩餘社員再分配給本批次自動邀約數較少的壽星。
- 系統先為每位壽星建立徵集，再以本批次的自動邀約數做平衡；不把即時手動祝福數算進分配，避免排程重跑時結果改變。
- 同一社員在同一生日月份只建立一筆自動邀約；排程重跑、訊息重送都不能增加第二筆。
- 分配平手時，以生日日期和上次被分配的壽星作輪替依據，不能永遠只分配給月初壽星。
- 社員從生日頁自行選擇其他壽星送祝福時，走手動流程，不受上述配額限制。

如果未來要改成「每個扶輪年度只派一則」，必須另改本節的配額定義；本版不是年度一則。

#### 匿名的例外必須保留

對壽星匿名，不是對系統匿名。**幹部必須看得到作者**，否則出現不當內容時沒有任何處理方式。
寫的人知道幹部看得到，匿名就不會變成掩護。

#### 題庫的設計原則

題目要是**問句**，不是可以直接送出的句子：

- 好：「你最想謝謝他哪一件事？」
- 壞：「祝你生日快樂，事事順心」

前者逼人想自己的事；後者一鍵送出就變成罐頭訊息，比沒有題庫更糟。
社員可以忽略題目直接自由寫，但 V2 第一版不允許換成另一個題目，避免破壞同批次題目唯一性。

每筆自動邀約只配一個題目，且同一社團、同一月份的派發批次內，**每位社員拿到的題目必須不同**。
題目文字要在派發時快照，之後幹部修改題庫不能改寫已送出的邀約。題庫數量不足時不得偷偷重複題目，
應在派發前先停止整個批次，通知幹部補充題庫後再以同一批次重試；不要讓同一批次只派一部分而造成不公平。
只有 `birthday_question_bank_exhausted` 這個可恢復原因能重試；已完成批次與其他失敗原因仍不可改，避免重跑改寫歷史結果。

---

## 3. 已定案的產品邊界

以下規則一併定案，避免進入開發後再由不同人各自解讀：

1. **派發時間**：以社團時區計算，在該生日月份第一位壽星前 7 天建立一次月份批次，
   不為每位壽星各自派發一輪。
2. **催繳**：不自動反覆提醒；只發一次邀約，訊息中心保留未完成狀態，幹部看得到完成統計。
3. **這次不參加**：社員可以拒絕；拒絕仍算使用本生日月份的自動邀約配額，不再補派第二則。
4. **通知失敗**：只重送原本的邀約，不建立新任務；排程重跑也遵守同一冪等鍵。
5. **發布後編輯**：發布後不可由作者修改；需要更正時由幹部隱藏原文，作者重新送出，保留處理紀錄。
6. **作者可見性**：手動和自動祝福的作者，壽星與一般社員都看不到；只有幹部可以看到。
7. **多壽星呈現**：社員只看到一張「本月生日祝福」任務卡，裡面只有被分配的那一位壽星；其他壽星仍可從生日頁手動祝福。
8. **播放頁**：不納入本版，另立需求。

---

## 4. 相依順序

```
站內訊息中心（`announcements_v09`，預設關閉）✅ 已完成 2026-08-22
    ↓ 徵集要靠它「主動詢問」
生日 V2 核心（新設定預設公開、同意後顯示年齡、多則祝福）
    ↓ 支援同一作者對同一壽星的多則祝福
祝福徵集（自動建立、每個生日月份每人一則自動邀約、手動可多位、幹部發佈）
    ↑ 需要一個目前不存在的排程機制
```

---

## 5. 基礎缺口與現況

### 5.1 自動排程（程式已完成，staging 已部署、待啟用與專項驗收）

目前已補上 GitHub Actions 每日排程、受保護的 internal POST route，以及 service-role-only 的資料庫 scheduler RPC。它仍只接受 staging／production runtime，workflow 目前只設定 staging，沒有直接接觸 service role key。

「自動建立、自動派發」需要有人每天檢查今天有誰快生日了。三個選項：

| 做法 | 優點 | 缺點 |
|---|---|---|
| **GitHub Actions 排程**（已採用） | 部署管線已在那裡，不增加新東西維護 | 尖峰時段可能延遲數十分鐘（對生日無所謂） |
| Render Cron Job | 準時 | 免費方案沒有，要付費 |
| 懶惰觸發（有人開 app 時檢查） | 不需要任何新基礎設施 | 整天沒人登入就不會發生 |

排程程式不能直接由瀏覽器觸發。GitHub Actions 只帶 staging environment secret 呼叫
`/api/internal/birthday-collection/scheduler`；route 先檢查 collection flag，再使用 trusted admin client
呼叫 service-role-only RPC。它符合以下條件：

- 以社團時區計算「生日前 7–14 天」與 2/29 的 2/28 規則。
- 以「社團、壽星、生日年度」作冪等鍵，重跑不得建立第二個徵集。
- 另外以「社團、生日年度、生日月份、派發社員」作自動邀約冪等鍵，確保每人每個生日月份最多一則。
- 多位壽星要使用同一個月份派發批次計算分配，不可每個壽星各自把全社派一次。
- 失敗可重試，成功後才標記派發完成；不能用「呼叫過」當成功。
- 社員生日、社籍或公開設定在排程執行前改變時，依最新權限重新判斷。
- 排程只負責建立徵集和訊息，不直接替社員寫入祝福內容。

本機資料庫驗證：同一批次重跑只保留一筆通知；訊息中心旗標關閉時保留 `skipped` retry marker，重新開啟後補送原批次，不建立第二個任務或第二則訊息；每位收件社員的訊息會顯示 `pending`、`completed`、`declined` 或 `needs_resubmission`。一般 staging Go-Live 已完成，但尚未在 staging 開啟徵集 flag 並執行 workflow。

### 5.2 站內訊息中心現況

訊息中心已經實作，文件是 `docs/mvp/MESSAGE_CENTER_MVP_SCOPE.md`，
使用 `announcements_v09`，目前預設關閉。它提供收件匣、未讀狀態和社團隔離，
可以作為祝福徵集的主動詢問入口；但它本身不包含生日徵集的狀態和收件規則。

生日徵集沿用現有訊息中心的收件人快照模式，以一則訊息搭配每位參與者自己的投遞列，並加入只允許站內路徑的深連結；不要把生日徵集的權限判斷塞進一般訊息頁面。現在已補上：

1. 將邀約的完成／拒絕／需重送狀態同步顯示在訊息中心，而不是只顯示未讀狀態。
2. 從訊息進入徵集頁時，再由資料庫重新檢查社員資格與可見範圍。

### 5.3 祝福徵集的資料與權限缺口

生日 V1 的 `birthday_wishes` 是一般祝福資料，不能直接當成徵集任務使用。V2 保留 V1
資料，另建徵集領域；第一階段已完成下列資料模型：

- `birthday_wish_campaigns`：社團、壽星、生日年度、狀態、開始／結束時間、發布時間。
- `birthday_wish_assignment_batches`：社團、生日年度、生日月份、派發執行狀態和冪等鍵；同一生日月份不能重複派發。
- `birthday_wish_campaign_participants`：建立時快照受眾，記錄邀請、完成、拒絕、停用、派發批次和題目。
- `birthday_wish_question_bank_items`：平台預設題目和社團自訂題目，支援啟用、停用與排序。
- `birthday_wish_campaign_submissions`：徵集中的祝福內容、作者、修改時間和刪除／隱藏狀態；隱藏後以 revision 產生新的送出版本。
- `birthday_wish_submission_events`：只可追加的送出、修改、發布、隱藏、婉拒與重新送出處理紀錄。
- 唯一約束：同一社團、壽星、生日年度只能有一個有效徵集；同一社團、生日年度、生日月份、派發社員只能有一筆自動邀約。
- 題目約束：同一派發批次內，同一題目只能分配給一位社員；題目不足時不產生重複分配。

幹部管理頁已支援新增、修改、停用與排序社團自訂題目；平台題庫仍然唯讀，已派發任務保留題目快照。

手動祝福不要寫入自動邀約配額。它可以直接建立一般祝福，或在徵集頁標記為 `manual`，但必須仍經過
壽星公開、允許收祝福、社籍有效和跨社團隔離檢查。手動祝福的內容可以公開，但作者姓名只投影給幹部
和幹部；壽星與一般社員都不得看到作者。

資料庫 RPC 必須依觀看者分別投影：

- 壽星：看得到已發布內容，看不到作者。
- 一般社員：看得到已發布內容，看不到作者。
- 幹部：看得到內容和作者，才能處理不當內容。
- 一般社員作者：看得到自己的內容，但看不到作者欄位；發布後不可自行修改，只能由幹部隱藏後重新送出新內容。

壽星匿名規則不能只在 UI 隱藏姓名，必須由 RPC 和 verification SQL 一起保證。

### 5.4 Feature flag 必須完整註冊

`birthday_wishes_v2` 除了新增停用列，還要同步更新：

- `src/lib/product/feature-flags.ts` 的 key 清單。
- `flagsRequiringExplicitEnable`，使缺少資料列時維持關閉。
- `platform_feature_flags`、`platform_feature_flag_audit` 的 constraint。
- `set_platform_feature_flag` 的白名單。
- telemetry／kill switch 的允許清單與舊版 fallback。

徵集另使用 `birthday_wishes_collection_v1`，也必須同步上述 flag 清單；目前已完成程式註冊，
缺少明確資料列時維持關閉。main 已部署至 staging，但這個 flag 在 Go-Live 時仍保持關閉，
需由 staging 管理員走受保護流程明確開啟後才可驗收。

另外，`20260824001600_birthday_feature_flag_execution_privileges.sql` 已把兩個生日旗標的
`enabled` 狀態同步到 browser-facing RPC 的 `authenticated` EXECUTE 權限：旗標缺列或關閉時
直接呼叫會被資料庫拒絕，受保護的旗標設定變更後才恢復。這個邊界不改 RPC 參數、不改 RLS，
也不撤掉 service-role scheduler 權限。資料庫沒有可信的 runtime environment／rollout context，
所以 `enabled_environments` 與 rollout percentage 仍必須由 server evaluator 判斷；staging 尚未開啟。

只改 migration 不足以達成「預設關閉」。

---

## 6. 目前程式碼的事實（查證過，不是假設）

拿這份文件去討論時，這一節可以避免提出跟現況衝突的方案。

### 6.1 V1 已經實作的部分

- Migration：`20260820001000_birthday_wishes.sql`（544 行）
- 資料表：`birthday_visibility_preferences`、`birthday_wishes`
- 函式 12 個，含 `get_my_birthday_page`、`set_my_birthday_preference`、
  `create_birthday_wish`、`update_own_birthday_wish`、`delete_own_birthday_wish`、
  `hide_birthday_wish`
- 驗證檔：`birthday_wishes_security.sql`（178 行，涵蓋 12 種拒絕情境，
  包含跨社讀寫、投影只給月日、預設隱私、非社員幹部寫入、隱藏後保留紀錄）
- 頁面：`/birthdays`，可從「互動」總覽頁進入

### 6.2 祝福徵集第一階段已實作的部分

- `20260824000600_birthday_wish_collection_core.sql` 已在 `main`：徵集、派發批次、參與者、提交、平台 100 題題庫與核心 RPC。
- `20260824000700_birthday_wish_assignment_runner.sql` 已隨 PR #77 進入 main 並部署至 staging：每位社員每月最多一則、壽星排除、冪等、同批次題目不重複，題庫不足時整批停止。
- `20260824000800_birthday_wish_collection_publication.sql` 已隨 PR #77 進入 main 並部署至 staging：只有幹部能發布；壽星與一般社員看不到作者，只有幹部可以辨識作者。
- `20260824000900_birthday_wish_collection_scheduler.sql` 已隨 PR #77 進入 main 並部署至 staging：每日批次、service-role-only scheduler、通知冪等、訊息深連結與訊息中心關閉時的重試標記。
- `20260824001000_birthday_wish_collection_review.sql` 已隨 PR #77 進入 main 並部署至 staging：社團題庫 CRUD、婉拒、發布後隱藏、revision 重新送出、append-only 處理紀錄，以及訊息中心逐位收件狀態。
- `20260824001100_birthday_wish_author_anonymity.sql` 已隨 PR #77 進入 main 並部署至 staging：作者本人也視為一般社員，公開牆只有幹部可以辨識作者。
- `20260824001200_birthday_wish_author_anonymity_core.sql` 已隨 PR #77 進入 main 並部署至 staging：作者本人保留編輯／刪除權，但生日 V2 一般社員投影不回傳作者姓名。
- `20260824001300_birthday_wishes_v2_allow_wishes_projection.sql` 已隨 PR #77 進入 main 並部署至 staging：社員關閉接收祝福後，既有祝福也不再出現在 V2 核心牆。
- `20260824001400_birthday_wishes_v1_rollback_isolation.sql` 已隨 PR #77 進入 main 並部署至 staging：V1 fallback 不再讀／改／刪 V2 row，V2 own-delete 使用專用 RPC。
- `20260824001500_birthday_assignment_failed_retry.sql` 已隨 PR #77 進入 main 並部署至 staging：題庫不足的 failed batch 補題後可重試同一批次；completed 與其他 failed 終態維持不可變。
- 生日月份建立後的通知結果由應用層嚴格解析：`sent`／`no_recipients` 顯示完成、`skipped` 顯示訊息中心未開啟、`failed` 或未知格式維持錯誤。
- 生日徵集 action 對資料庫的關閉／未開放／批次未完成狀態使用 bounded 的「尚未可操作」提示，不把資料庫細節直接顯示給社員。
- 生日月份產生的 action 只接受 `completed`／`failed` 的終結批次狀態；`planned`、`assigning` 或未知回傳會 fail closed，避免在任務尚未完成時發通知。
- `20260824001600_birthday_feature_flag_execution_privileges.sql` 已隨 PR #77 進入 main 並部署至 staging，是旗標權限修正：生日 V2／徵集 browser-facing RPC 的 `authenticated` EXECUTE 隨 `enabled` 狀態同步，缺列或關閉時 fail closed；environment／rollout 仍由 server evaluator 控制。
- `20260824001700_birthday_collection_question_prompt_uniqueness.sql` 已隨 PR #77 進入 main 並部署至 staging，透過 normalized prompt unique index 保證同一派發批次不會把相同題目分配給兩位社員。
- verification 也會確認生日核心與徵集兩個旗標的 grant 彼此隔離；只關閉其中一個時，另一個功能仍可保留自己的 browser-facing EXECUTE。
- `/birthday-collection` 已隨 PR #77 進入 main 並部署至 staging，是社員／幹部頁面；`birthday_wishes_collection_v1` 是明確啟用、預設關閉的功能旗標，幹部頁已接上題庫管理、隱藏、重送和歷史紀錄。
- `e2e/tests/birthday-v2.e2e.mjs` 已補 local targeted browser acceptance：同一作者同一天送出兩則、生日年齡顯示、作者匿名與 412px 無水平溢位；結果為 2 passed、2 個刻意 skip。測試 fixture 明確設定 `show_birthday_year=true`，這只代表測試同意，不代表替社員預設公開年齡。V2 使用獨立測試社與每次 bootstrap 的新壽星，避免 append-only 歷史污染重跑，也不繞過每日 10 則上限。
- `.github/workflows/birthday-collection-scheduler.yml` 與 `/api/internal/birthday-collection/scheduler` 已推送並只接 staging；Go-Live 已成功，但因徵集 flag 尚未開啟，尚未執行有效的 staging 徵集 workflow。
- `get_my_birthday_wish_collection_page` 與 `list_published_birthday_wish_submissions` 在頁面端並行查詢；資料庫仍是權限與匿名規則的最後守門。
- `e2e/tests/birthday-collection.e2e.mjs` 已在 local Chromium 覆蓋桌面題庫新增／修改／停用、社員婉拒與幹部婉拒紀錄、建立／送出／發布／匿名公開牆、幹部隱藏／社員重送／再次發布／處理紀錄，以及 412px 任務入口與水平溢位；不代表 staging 或真人驗收。

第一至三階段的程式開發與本機安全驗證已完成；PR #77 已完成 main 整合與一般 staging 發布，尚未完成的是開啟 staging flag、徵集專項 hosted workflow、真人社員／幹部驗收與 M1 使用者測試。

### 6.3 會影響 V2 實作的具體事實

**V1 的缺列實際效果是不公開，不是公開。**
`birthday_visibility_preferences` 沒有列時，V1 的 migration 註解與
`get_my_birthday_page` 都把它當成私人資料。因此 V2 不能直接把「沒有列」改解讀成公開；
本版採用 §2.1 的相容規則，既有缺列者先維持不公開，新建立的偏好才預設公開。

> 對照：名冊的 `privacy_settings` **每個帳號都有列**，無法分辨「刻意關掉」與「從沒動過」。
> 生日 V2 不可照搬名冊的全部改成公開做法，除非另行通知並取得產品核准。

**每年一則的限制在一個 partial unique index：**

```sql
create unique index birthday_wishes_one_active_per_author_year
  on public.birthday_wishes (club_id, recipient_membership_id, author_app_account_id, birthday_year)
  where status = 'active';
```

拿掉它是 V2 的必要動作，`20260820001000` 已部署不可修改，要用新的 forward-only migration。
新的每日上限要按社團時區計算，並在資料庫交易中限制同一
`club_id + author_app_account_id + recipient_membership_id + local_date`，避免並行請求繞過限制。

目前 `create_birthday_wish` 會把 unique violation 轉成「今年已送過」錯誤。V2 移除年度唯一限制後，
必須改成只處理預期的每日上限錯誤，不能把其他資料庫唯一衝突也誤報成祝福重複。

**Feature flag 現在預設是「開」。**
2026-08-22 起，`evaluateFeatureFlag` 對「沒有設定記錄」回傳 enabled。
失敗（讀取錯誤、格式錯誤、環境無法辨識、kill switch）仍然是 disabled。

> 這推翻了先前草稿 §8 的假設。**新增 flag 不會自動給你分階段推出**——
> migration 要插入 `enabled = false` 的列，程式也要把它列入 `flagsRequiringExplicitEnable`，
> 否則缺少資料列時仍會對所有人開啟。

**受眾機制已經存在，不要重做。**
`club_member_tags` / `club_membership_tags` / `resolve_club_audience`
已經在用，活動、留言板、LINE OA 三處共用同一份定義。徵集的對象挑選直接用它。

**站內訊息中心已存在，但不等於生日徵集已完成。**
`announcements_v09` 目前預設關閉；訊息中心有收件人快照、未讀狀態和社團隔離，
可以沿用其快照模式，但生日徵集仍需要自己的任務、參與者、內容和匿名投影。

**V1 的祝福投影會回傳作者姓名；V2 已改成資料庫投影遮罩。**
既有 V1 RPC 仍提供 `author_name`，不能拿它當 V2 的權限依據。生日 V2 的 `get_my_birthday_page_v2` 已由
`20260824001200` 改為只有幹部收到作者姓名；一般社員（包含作者本人）仍可看到內容與自己的編輯／刪除能力，但看不到作者欄位。
這個規則在資料庫 RPC 與 verification SQL 保證，不能只在前端刪掉姓名。

**生日年度目前使用資料庫的 `current_date`。**
V2 要明確指定生日年度採公曆年、以社團時區判斷日期，不能讓伺服器時區默默決定跨年結果。

**限定對象的活動不計入出席。**
這條規則對徵集沒有直接影響，但同一個受眾機制上已經有這個不變條件，
由兩個 trigger 從兩邊擋住。新功能沿用受眾時要知道它存在。

---

## 7. 實作時的注意事項

- `20260820001000_birthday_wishes.sql` **已部署，不可修改**。所有 V2 變更走新的 forward-only migration。
- 新 migration 必須先確認 `supabase/migrations/` 最後編號，避免撞號；年度唯一索引要以新的 migration 移除或替換。
- `20260824000600` 至 `20260824001700` 已在目前 `main`；PR #77 已完成 main 整合，且 `Staging Go-Live` run `33028548354` 已完成 staging migration apply。production 不在本輪範圍。
- 新的資料表與 RPC 都要有對應的 `supabase/verification/*.sql`，
  並註冊進 `scripts/database-verification-files.txt`。
- 驗證要測「誰不能做什麼」：外社社員、停權帳號、停權社籍、
  以及**壽星本人不能收到自己的徵集**、**壽星不能看到作者**、**幹部可以看到作者**。
- 要測既有偏好列、既有缺列、新偏好預設公開，以及生日年度多則祝福和每日上限。
- 已測月批重跑冪等、題庫不足時整批暫停且補題後同批次重試、同批次題目 ID／文字不重複、跨社團隔離、發布權限、feature flag server gate 與 DB `authenticated` EXECUTE gate、排程重跑、訊息重複派發冪等、題庫管理權限、婉拒、隱藏重送、append-only 處理紀錄、逐位訊息狀態，以及 `allow_wishes=false` 的核心投影；一般 staging Go-Live 已通過，但徵集 flag 尚未開啟，因此專項 hosted workflow 與真人社員驗收仍未完成。
- 要測壽星與一般社員（包含作者本人）看不到手動祝福作者，只有幹部可以看到作者。
- 幹部的隱藏、刪除權限與作者可見性都要在資料庫重新驗證，不能只靠 UI。
- 其餘工程約定見專案根目錄的 `AGENTS.md`。
