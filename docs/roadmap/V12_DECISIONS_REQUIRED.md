# V1.2 Human Decisions Required

下列項目會改變產品、安全邊界或正式資料，不得由實作者自行決定。每項應在指定 PR 開始前留下 owner、decision、date、理由與 rollback 影響。

| ID | 最晚決策點 | 決策 | 選項／需提供資料 | 未決時預設（fail closed） |
|---|---|---|---|---|
| D01 | PR-01 merge 前 | V1.2 本機隔離模式 | 專用 Supabase workdir（推薦）或既有 local DB 內固定專用 database | 不啟動 PR-02 Edge/Auth integration；不改 legacy root |
| D02 | PR-01 merge 前 | 第一位真人 Platform Admin | 受控 Auth User UUID、核准操作者、執行環境與稽核保存方式 | seed 只建 system actor；不建立真人/密碼/token（`database/v12/README.md:34-54`） |
| D03 | PR-02 | **Accepted for MVP / Deferred for automated delivery** — Invitation Channel | MVP 僅支援 Manual Out-of-Band Delivery；Email、SMS、LINE Login、LINE OA delivery 延後 | 不保存未核准 destination；自動渠道需另行核准 |
| D04 | PR-02/10 | **Accepted — revoke and reissue** — Legacy pending invitation | Legacy SHA-256 pending token 不遷移、不建立 compatibility verifier；cutover 撤銷／失效後由授權管理者 reissue V1.2 HMAC token | 不接受任何 Legacy plaintext token、hash 或雙格式 fallback |
| D05 | PR-03/09 | Legacy 是否有真實使用者資料 | 各環境資料量、PII 類型、資料 owner、可否匯出到隔離環境 | 只用合成資料做 mapping；不查遠端 |
| D06 | PR-03/09 | Person duplicate 裁決 | email/phone 正規化、跨社可見摘要、人工 reviewer、拒絕/沿用/新建規則 | 不自動 merge；建立 match case 且不洩漏他社 ID/PII |
| D07 | PR-04/09 | Role mapping | `superadmin`、`platform_admin`、operator、president、secretary、finance → V1.2 roles/scopes | conflict report；不自動授權 |
| D08 | PR-04 | District bootstrap | V0.3 Clubs 對應 district、首批 District Admin | Club 不載入 V1.2，直到有明確 district |
| D09 | PR-05/10 | Auth User migration | 保留 UUID/重建/邀請重新連結；缺失或重複 Auth User 的處置 | 建 `auth_reconciliation_issues`，不自動建/連結正式 Auth User |
| D10 | PR-05/09 | Account Merge 是否進 MVP | 母版預設 UI/function 延後；只有 migration 實測證明必要才提案 | 不實作 merge function/UI；資料模型保留（母版 `V12_PRODUCT_ARCHITECTURE_ROADMAP.md:133-149`） |
| D11 | PR-06/09 | LINE Login channel mapping | environment、channel ID、provider subject scope、secret reference、callback domains | 不綁定；衝突進 reconciliation |
| D12 | PR-07/09 | LINE OA channel mapping | Club/environment/channel、舊 OA account、contact/link 衝突 | 不配對；OA 與 Login identity 絕不互相推斷 |
| D13 | PR-07 | OA push/broadcast 是否在 V1.2 首版 | 母版必做只有 contact pairing/unpair；現有 UI 有 broadcast/push log | 預設延後 push；不新建 push ledger |
| D14 | PR-08/09 | Audit retention/redaction | 保存期限、payload 分級、redaction approver、法規/合約要求 | skeleton 永久保留；敏感 legacy payload 隔離且不向一般角色開放 |
| D15 | PR-11 | Notification/privacy settings | 是否保留在 MVP、schema/預設值/同意版本 | V1.2 UI 暫不提供修改；legacy read-only |
| D16 | PR-11/12 | Feature flag 與 rollback window | 切換單位（環境/Club/全站）、觀察期、V0.3 read-only 期限 | 不切換流量 |
| D17 | PR-12 | Staging 執行授權 | 目標 project ref、backup、secret rotation、資料 owner、核准人 | 不連線、不 deploy、不 reset |
| D18 | PR-12 | Production freeze/cutover | 停機窗口、公告、final extract、smoke owners、rollback trigger | 不上線 |
| D19 | 現在 | Draft PR #7 | 保留/關閉/重新定基底/只取文件或 foundation commits | 不修改 PR #7；本輪也不 commit/push |
| D20 | PR-01/CI | Database Types 存放與 drift policy | checked-in generated types 路徑、CI 比對命令 | PR-11 前不得用 manual casts 接 V1.2 |

## Accepted decision records

## D03 — Invitation Delivery Channel

- Status: Accepted for MVP
- Owner: Architecture Owner
- Decided at: 2026-07-22
- Decision: MVP 只支援 `manual_link` 的 Manual Out-of-Band Delivery。
- PR-02 exclusions: 不實作 Email delivery、SMS delivery、LINE Login delivery 或 LINE OA push；不接受任意 redirect URL 或任意 callback URL；不保存任何未核准 destination。
- Automated Delivery: Deferred。不得標示為 Complete，正式渠道必須另行取得人工核准。
- Delivery semantics: Manual delivery 只表示 token 已交回授權管理者，不代表 provider delivery 成功、Invitee 已收到或 Invitation 已接受。
- Evidence: PR-02 Database 與 Edge boundary 只接受 `manual_link` 與 null destination。
- Security/privacy impact: 避免未核准的收件資料、provider secret 與 delivery status 進入資料庫、Audit 或 log。
- Migration/cutover impact: 未來自動渠道必須另行核准並補齊 provider、rate limit、abuse control 與 delivery reconciliation。
- Rollback: 停止一次性人工交付並 revoke pending Invitation；沒有 provider side effect 需要補償。

## D04 — Legacy Pending Invitation Tokens

- Status: Accepted
- Owner: Architecture Owner
- Decided at: 2026-07-22
- Decision: Legacy SHA-256 pending invitation token 不遷移；不接受 Legacy plaintext token 或 Legacy token hash；不建立 compatibility verifier、dual-format parser、dual-format fallback 或其他 fallback verification；不從 Legacy hash 推導 V1.2 token。
- Cutover: Legacy pending token 必須撤銷或標記不可用，再由授權管理者重新發出 V1.2 HMAC token。每次重新發出都使用全新的 nonce、signature、storage hash 與 expiry。
- Evidence: V1.2 verifier 只接受 versioned HMAC envelope 與 allowlisted key version。
- Security/privacy impact: 不把較弱的 Legacy bearer credential 帶入 V1.2 信任邊界。
- Migration/cutover impact: PR-10/12 runbook 必須將 pending Legacy invitation 列入 revoke/reissue reconciliation。
- Rollback: Cutover 未完成前 Legacy 保持獨立；已撤銷 token 不恢復，必要時發出另一枚新 V1.2 token。

## PR-02 Distributed Rate Limit

- Status: Deferred — Release Gate
- Implementation: Distributed Rate Limit 尚未實作，PR-02 不得宣稱 Rate Limit 已完成，也不得用單一 Edge Worker memory counter 冒充 distributed control。
- Exposure gate: Validate 與未來 Accept 在 Gate 完成前不得公開部署至 Public Staging 或 Production。
- Allowed evidence environments: Local development 與 CI verification 不算 Public Exposure，因此此 Deferred gate 不阻擋 local tests、CI tests 或 PR-02 Human Review。
- Technical selection: 技術選型尚未決定；本決策不自行指定 Redis、Upstash、PostgreSQL 或 Gateway。
- Related deferred scope: Automated Delivery 仍為 Deferred，沒有標示為 Complete。

## Decision record template

```md
### Dxx — title
- Status: proposed | accepted | rejected | superseded
- Owner:
- Decided at:
- Decision:
- Evidence:
- Security/privacy impact:
- Migration/cutover impact:
- Rollback:
```

產品與架構母版明確要求人工核准 production migration、traffic switch、RLS 放寬等事項（`docs/roadmap/V12_PRODUCT_ARCHITECTURE_ROADMAP.md:750-789`）；任何 PR 綠燈都不等於取得這些核准。
