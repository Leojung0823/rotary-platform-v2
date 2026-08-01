# V0.9 公告、站內通知與排程送達範圍

V0.9 在 V0.8 出席管理之上提供同社公告、站內通知與僅限本機的排程送達流程。本切片是 stacked work，依賴 Draft PR #37；Issue #25 真實 staging 驗收完成前，兩者都不得合併。

## 已納入

- 公告草稿、排程、立即發布、取消、封存與不可刪除的版本歷史。
- `all_active_members`、`role`、`membership` 三種受眾；發布 transaction 當下解析有效社籍並以 account 去重。
- 僅本人可讀的站內通知與 receipt，支援單筆及全部標記已讀。
- Email／LINE external delivery queue、lease、bounded retry、最大三次嘗試，以及 service-role-only worker RPC。
- deterministic mock provider 與 disabled provider；兩者都不發出網路請求。
- `/announcements`、`/notifications`、管理頁、AppShell 未讀 badge 與 Dashboard 摘要。

## 權限與資料邊界

- Browser 角色沒有公告、receipt、通知或 delivery table 的 direct CRUD 權限。
- 所有 browser RPC 由 `auth.uid()` 推導目前帳號；不接受 account、membership 或 recipient identity。
- 社員只會讀到同社、active account／club／membership、符合 audience、已發布且未到期的公告。
- 管理 mutation 需要同社 `announcement.manage`；停權扶輪社永久拒絕 mutation。
- worker RPC 不授權 `anon` 或 `authenticated`；claim payload 不包含 Email、LINE subject、公告 body 或 provider response。
- audit 僅保存一般化 count、狀態或 error code，不保存公告內容、recipient identity、Auth UUID 或 provider body。

## 明確不納入

- SMTP、Resend、SendGrid、正式 LINE Messaging API 或任何真實外部發送。
- Hosted Supabase、remote migration／reset／seed、Staging Release、Staging Go-Live 與 production。
- 文件中心、附件、社費、財務、IOU、AI 與外部同步。

## 驗收範圍

Local database verification 覆蓋 cross-club 隔離、audience、receipt、lifecycle、hard-delete protection、queue deduplication、lease、retry、max attempts、provider redaction 與 worker grants。Browser Smoke 必須在 owner 準備不提交的 local `.env.local` 後，以 synthetic `.test` fixture 在 desktop 與 Android Chromium 執行；它不是 Hosted staging 驗收。
