# Rotary Platform V1.2 Project Structure

- 文件狀態：Normative
- 適用範圍：Rotary Platform V1.2 Identity & Admin
- 適用對象：Codex、其他 AI Agent、人類工程師與 Reviewer
- 最後更新：2026-07-22

本文件定義 V1.2 檔案應放在哪裡、各目錄的責任與依賴方向。它不授權搬移現有程式，也不取代產品 roadmap；目錄調整必須在所屬 PR 中獨立說明、驗證並更新本文件。

## 1. 結構原則

1. Legacy 與 V1.2 的 database history 必須實體分離。
2. 一個 artifact 只能有一個 canonical source，不保留會漂移的 SQL、type、schema 或 contract 副本。
3. UI、request boundary、domain transaction、provider integration 與 database authorization 分層，不跨層偷渡責任。
4. Test、verification、mapping 與 runbook 放在它所驗證的版本／domain 旁，讓 PR scope 可辨識。
5. Generated、cache、secret、local state 與真實資料不得成為 source tree 的一部分。
6. 未經核准不新增產品功能，也不為「未來可能使用」建立空目錄、空 abstraction 或 TODO skeleton。

## 2. Repository 根目錄

```text
.
├── .github/workflows/          # CI gates；不得存環境 secret 實值
├── database/v12/               # V1.2 isolated database source and verification
├── docs/
│   ├── architecture/           # 已接受的架構決策與跨域設計
│   ├── development/            # 永久工程規範
│   └── roadmap/                # 產品藍圖、執行計畫、盤點與未決事項
├── scripts/                    # Repository-level local tooling；現有 V0.3 scripts 保持邊界
├── src/                        # Next.js application and controlled server boundaries
├── supabase/                   # V0.3 Legacy Supabase root；migration immutable
├── CONTRIBUTING.md             # 全體貢獻流程與 Gate
├── README.md                   # 現行可執行入口與本機使用說明
└── package.json                # 唯一 npm command registry
```

沒有對應責任時，不應新增新的 top-level directory。若確有必要，PR 必須說明 owner、artifact lifecycle、CI、secret/data boundary 與移除／回滾方式。

## 3. `supabase/`：V0.3 Legacy boundary

```text
supabase/
├── config.toml
├── migrations/                 # 四份 Legacy migration，永久不可改寫
├── seed.sql
├── templates/
└── verification/
```

- `supabase/migrations/` 不接收 V1.2 schema、RLS、function、seed 或資料轉換。
- Legacy migration checksum 必須由 CI／local gate 保護。
- V0.3 verification 與 V1.2 verification 不混跑成一個不可辨識結果。
- 若 Legacy 需要維護，必須另有明確核准範圍；V1.2 PR 不得順手修改。

## 4. `database/v12/`：V1.2 database boundary

目前 canonical 結構：

```text
database/v12/
├── README.md
├── bootstrap/                  # 受控、非公開、一次性 operator procedures
├── docs/                       # DB-local naming、index matrix、schema notes
├── functions/                  # DB/Edge Invitation boundary notes
├── generated/                  # checked-in public Database Types
├── migrations/                 # framework docs；不保存 SQL 副本
├── policies/                   # staged RLS boundary notes
├── schema/                     # canonical ordered manifest
├── scripts/                    # 固定 local target 的 reset/test/lint/verify wrappers
├── seed/                       # 可重跑的 system catalog / system actor seed
├── shared/                     # pgTAP helpers and fixtures
├── supabase/                   # independent config, canonical migrations, Edge
├── tests/                      # pgTAP / behavioral SQL tests
└── verification/               # catalog-wide fail-closed verification SQL
```

### 4.1 已實作的獨立 Supabase workdir

PR-01 已將 canonical runtime 固定為：

```text
database/v12/supabase/
├── config.toml
├── migrations/
└── functions/
```

- `database/v12/supabase/migrations/` 是唯一 SQL source；`database/v12/migrations/` 只保存 framework README。
- `schema/manifest.txt` 是唯一有序入口；reset、tests、verification 與 type generation 都由同一 migration root 建立。
- wrapper 固定 project id／workdir／ports，拒絕 linked state、access token、任意 DB URL、target 或 passthrough argument。
- V1.2 與 Legacy 的 migration history、containers、network、volume、Auth、REST、Storage、Edge Runtime 與 ports 全部隔離。

### 4.2 V1.2 database artifact placement

| Artifact | Canonical location | 規則 |
|---|---|---|
| Schema／RLS／transaction migration | `database/v12/supabase/migrations/` | 只追加有序 migration；不得放入 Legacy root或 framework docs path |
| Seed | `database/v12/seed/` | deterministic、idempotent、無真人／secret／token |
| Bootstrap | `database/v12/bootstrap/` | fail closed、需真實既有 Auth user、不可由 browser 執行 |
| pgTAP／behavioral SQL | `database/v12/tests/` | transaction + rollback；檔名順序對應 domain |
| Catalog verification | `database/v12/verification/` | 全域 invariant、identifier、FK/index matrix、grant/RLS completeness |
| DB-local design record | `database/v12/docs/` | 只記 database 實作細節；跨域決策放 `docs/architecture/` |
| Edge Functions | 僅於 D01 核准後的 `database/v12/supabase/functions/` | provider/secret boundary；不得放進 frontend |
| Shadow migration | PR-09/10 核准後的 `database/v12/mapping/`、`database/v12/shadow/` | 不得提早建立空骨架；來源只讀、輸出可對帳 |

## 5. `docs/`：文件權責

### `docs/architecture/`

存放已接受且跨多個 PR 的架構 invariant。單一 PR 的實作筆記、測試輸出或臨時研究不得放在此處。

- `V12_ARCHITECTURE_DECISIONS.md`：V1.2 規範性決策。
- 既有 V0.3 文件保留為現況／Legacy 行為參考，不自動成為 V1.2 規格。

### `docs/development/`

存放所有貢獻者都必須遵守的工程規範。

- `V12_PROJECT_STRUCTURE.md`：檔案位置與依賴邊界。
- `DATABASE_STYLE_GUIDE.md`：V1.2 PostgreSQL／Supabase SQL 規範。

### `docs/roadmap/`

存放 scope、順序、inventory、mapping、未決事項與執行計畫。

- Product roadmap 決定做什麼與 Gate。
- Repository implementation plan 決定 12 個 PR 的實際拆分與依賴。
- Inventory／mapping 是盤點證據，不可自行擴張產品範圍。
- `V12_DECISIONS_REQUIRED.md` 中未 accepted 的項目維持 fail closed。

Roadmap 不是日誌。執行結果應進 PR description／review evidence；只有長期有效的事實才回寫文件。

## 6. `src/`：應用程式依賴方向

現有 Next.js App Router 結構保持可運作；V1.2 只能依既定 PR 漸進加入 typed seam，不進行無關的大規模搬家。

```text
src/
├── app/
│   ├── (authenticated)/        # Authenticated pages and layouts
│   ├── api/                    # HTTP/request boundary, validation, safe error mapping
│   ├── auth/                   # Supabase auth confirmation boundary
│   └── line/                   # Local-only mock UI, guarded from production
├── components/                 # Shared presentation and interaction components
├── lib/
│   ├── supabase/               # Client construction only; browser/server/admin split
│   └── line/                   # Provider adapters; no UI authorization decisions
└── proxy.ts                    # Session refresh and request routing boundary
```

### 6.1 Allowed dependency direction

```text
Page / Component
    ↓
Typed domain/API client
    ↓
Next.js route or controlled Edge boundary
    ↓
Authorized transaction/read model
    ↓
PostgreSQL constraints + RLS
```

- UI 可以依賴 typed client，不直接依賴 service-role client、table name 或 provider secret。
- Route／Edge 可以依賴 request validation、provider adapter 與 typed DB contract，不把授權交給 UI。
- Provider adapter 不直接決定 Club／Account scope；scope 由受控 config 與 database authorization 決定。
- Multi-table mutation 不在 route 中以多次 `.from(...)` 拼接，必須呼叫單一 transaction contract。
- V0.3 與 V1.2 client path 必須可辨識且不可在同一 request dual-write。

### 6.2 Supabase client placement

- `src/lib/supabase/client.ts`：browser publishable client；不得讀 server secret。
- `src/lib/supabase/server.ts`：SSR session／cookie client；不得變成 generic privileged client。
- `src/lib/supabase/admin.ts`：受信任 server-only boundary；預設拒絕非核准環境，禁止被 Client Component import。
- V1.2 generated Database Types 的 canonical path 由 D20 決定；決定前不得新增多份手寫 `Database` shape 或大量 result cast。

## 7. Tests 與 verification 的位置

| 類型 | 位置 | 最低責任 |
|---|---|---|
| TypeScript unit | 與 module 同目錄的 `*.test.ts` | provider、validation、error mapping 的純函式行為 |
| V1.2 schema／transaction／RLS | `database/v12/tests/` | pgTAP、角色矩陣、negative path、rollback |
| V1.2 catalog-wide verification | `database/v12/verification/` | 數量、名稱、grants、RLS、orphan、index matrix |
| V0.3 regression | 現有 `supabase/verification/`、`scripts/verify-*` | 保護 Legacy 可運作基線，不混稱 V1.2 驗證 |
| Edge integration | D01 後在 V1.2 workdir／function test boundary | secret、HMAC、provider、retry、safe errors |
| E2E | PR-11 核准的 canonical test root | 完整 invitation-first、tenant、responsive、rollback route |

Fixture 只能是 synthetic。不得提交 `.env.local`、Auth dump、真實社員資料、原始 invite、LINE token、service key 或 production response。

## 8. File naming

- Markdown 規範／roadmap 使用清楚的 uppercase domain prefix，例如 `V12_*`；既有 canonical filename 不任意改名。
- TypeScript／React 檔案沿用 repository 的 lowercase kebab-case；React component export 使用 PascalCase。
- Test 使用 `<module>.test.ts`；SQL test 使用四位數排序 `<NNNN>_<domain>.test.sql`。
- V1.2 migration 使用四位數遞增序號 `<NNNN>_v12_<scope>.sql`；現有 `0001_v12_foundation.sql` 是起點。
- Seed 使用 `<NNN>_<scope>.sql`；verification filename 以被驗證的 invariant 命名。
- SQL object naming 由 `DATABASE_STYLE_GUIDE.md` 規範，識別碼不得超過 55 UTF-8 bytes。

## 9. 禁止的結構

- 在 `supabase/migrations/` 新增 V1.2 migration。
- 同時保留兩份 canonical schema／migration／generated types。
- 在 page、component 或 client bundle 建立 service-role／HMAC／LINE secret client。
- 在 `src/app/api` 直接串接多表寫入並把它稱為 transaction。
- 把 secrets、token、PII、Auth dump、production extract 或 raw webhook payload 放進 fixtures／docs／logs。
- 以 `utils.ts`、`helpers.ts`、任意 JSONB 或 shared folder 隱藏不清楚的 domain ownership。
- 在未對應既定 PR／Milestone 前建立 `mapping/`、`shadow/`、Edge、preference、push 或 webhook 新功能骨架。
- 提交 `.next/`、coverage、local Supabase state、Docker volume 或其他 generated cache。

## 10. 新增／搬移檔案檢查清單

1. 這個 artifact 的唯一 owner 與 canonical location 是哪裡？
2. 它屬於哪個 Stage、Milestone 與 PR？
3. 是否越過 Legacy／V1.2、browser／server、Login／OA 或 database／provider 邊界？
4. 是否產生第二份 schema、contract、type 或 configuration truth？
5. 是否需要同步 README、package command、CI、architecture decision 或 runbook？
6. 是否含 secret、token、PII、真實資料或 remote identifier？
7. 搬移後舊路徑如何移除，驗證如何證明沒有 drift？
8. 若未決 D01–D20 影響此位置，是否已保持 fail closed？
