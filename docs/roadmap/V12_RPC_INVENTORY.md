# V0.3 PostgreSQL Function / RPC Inventory

## Catalog facts

- 實際 public functions：42。Migration 001 定義 4 支、002 定義 12 支、004 定義 26 次；004 的 `list_manageable_clubs` 取代 002 同名版本，因此淨數為 42。
- 38 支 `SECURITY DEFINER`、4 支 trigger function 為 invoker；全部固定 `search_path`。
- 對 client 暴露：`get_member_invitation_preview` 可由 `anon`/`authenticated` execute；其餘外部 RPC 僅 `authenticated`；內部 helper/trigger function 無 client grant（`supabase/migrations/20260722000200_secure_provisioning_workflow.sql:531-552`、`...00400_v03_identity_admin_api.sql:844-895`）。
- 前端／script 有 34 個 literal RPC 名稱依賴；其餘為內部 helper/trigger。
- V1.2 schema 不相容，沒有任何 function 可 byte-for-byte 保留。下表的「保留」只可能指暫時保留 V0.3 compatibility contract，不代表在 V1.2 DB 重用 SQL。

縮寫：`A` = authenticated、`N` = anon、`I` = internal only；`L` = `FOR UPDATE`；`Au` = 寫 audit；`Id` = 明確 idempotency/unique retry handling。表內來源為節省寬度使用可唯一解析的縮寫：`...00100...sql` = `supabase/migrations/20260722000100_core_identity_and_club_access.sql`、`...00200...sql` = `supabase/migrations/20260722000200_secure_provisioning_workflow.sql`、`...00400...sql` = `supabase/migrations/20260722000400_v03_identity_admin_api.sql`；冒號後為實際行號。

## 42/42 inventory

| # | Function（來源） | 用途／輸出 | Auth／授權 | Tx、安全、錯誤 | V1.2 去留與 PR |
|---:|---|---|---|---|---|
| 1 | `accept_operator_invitation` (`20260722000200...sql:335`) | 依已驗證 email 接受 operator invite，回 JSON | A；matching invite | L/Au；auth、email、expired、claimed、identity conflict 錯誤；再次呼叫回已接受結果 | **合併**至 membership invitation acceptance + role assignment；PR-02/03/04 |
| 2 | `assign_club_role` (`20260722000400...sql:489`) | 新增 active club role，回 assignment UUID | A；`role.manage` | Au；unique conflict 由 index | **重寫**為 membership scoped role grant/revoke；PR-04 |
| 3 | `bind_line_identity_from_invitation` (`...00400...sql:277`) | 將 Auth/LINE subject 綁 Person/Account/Invitation，回 JSON | A；有效 invite | L/Au；account/person/subject conflict；token 以 DB SHA-256 | **合併**為 Edge callback + `bind_identity` + acceptance；PR-02/05/06 |
| 4 | `cancel_member_invitation` (`...00400...sql:227`) | 取消 pending/sent invite，void | A；`invitation.manage` | L/Au；無效 scope 拒絕 | **重寫**為 `revoke_membership_invitation`；PR-02 |
| 5 | `complete_member_invitation` (`...00400...sql:335`) | 補 profile、啟用 membership、接受 invite，回 JSON | A；bound account | L/Au；必填欄位、狀態錯誤 | **合併**至 acceptance + `complete_membership_onboarding`；PR-02/03 |
| 6 | `configure_line_oa` (`...00400...sql:659`) | upsert Club OA config，回 UUID | A；`oa.manage` | Au；無 row lock | **重寫**至 scoped `line_channel_configs` controlled API；PR-07 |
| 7 | `create_club_with_initial_operator_invitation` (`20260722000200...sql:127`) | 建 Club + 首位 operator invite，回 JSON | A；`superadmin` | Au/Id；input、member/operator conflict、unique errors | **重寫**為 Club provisioning + invitation + RBAC transaction；PR-03/04（UI PR-11） |
| 8 | `create_member_invitation` (`...00400...sql:97`) | find/create Person、Membership、Invite，回 token/IDs | A；`invitation.manage` | L/Au/Id；person/membership conflict；**回傳 plaintext token** | **重寫**；HMAC/token 只在 Edge，DB 收 digest；PR-02/03 |
| 9 | `current_app_account_id` (`20260722000200...sql:7`) | `auth.uid()` → app account UUID | I helper | definer；無 mutation | **重寫**為 `get_current_account_id()`；PR-04 |
| 10 | `current_can_manage_club` (`...00200...sql:39`) | platform role 或 active operator 判斷 boolean | I helper | definer；即時 DB lookup | **合併**至 `has_club_permission(...)`；PR-04 |
| 11 | `current_has_club_permission` (`...00400...sql:3`) | platform/club operator/RBAC permission boolean | I helper | definer；即時 DB lookup | **重寫**為 V1.2 scoped helper；PR-04 |
| 12 | `current_has_platform_role` (`...00200...sql:20`) | current account 是否有指定 platform role | I helper | definer；以 role key array | **合併**至 `has_platform_permission(...)`；PR-04 |
| 13 | `get_club_provisioning_status` (`...00200...sql:498`) | Club + operator/invite status JSON | A；club access | read；not found/access errors | **延後重寫**成 typed read model；PR-11，底層 role/invite 在 PR-02/04 |
| 14 | `get_identity_dashboard` (`...00400...sql:729`) | member/LINE/OA/invite/login counters JSON | A；`dashboard.read` | read aggregate | **延後重寫**成 V1.2 dashboard read model；PR-11 |
| 15 | `get_line_oa_admin` (`...00400...sql:768`) | OA config/follower/push status JSON | A；`oa.read` | read aggregate；遮蔽 secrets | **重寫**至 OA read API；PR-07/11 |
| 16 | `get_member_invitation_preview` (`...00400...sql:251`) | token → invitation public preview JSON | N/A；valid token | definer；DB SHA-256；只回有限欄位 | **合併**至 controlled acceptance Edge endpoint；PR-02 |
| 17 | `get_my_club_home` (`...00400...sql:77`) | active member Club home JSON | A；active membership | read；`active_membership_required` | **延後重寫**；PR-11（公告/活動仍不在 V1.2 MVP） |
| 18 | `get_my_identity_center` (`...00400...sql:539`) | Person、LINE identity、devices、settings JSON | A；self | read；集合多種敏感資料 | **拆分/重寫**為 self profile/identity/session/preferences clients；PR-05/11，preferences 待決策 |
| 19 | `invite_additional_operator` (`...00200...sql:275`) | 建額外 operator invite，回 JSON | A；club manager | Au/Id；scope mismatch/member conflict/unique errors | **合併**至 invitation + membership role grant；PR-02/04 |
| 20 | `list_club_audit` (`...00400...sql:830`) | scoped audit rows table | A；`audit.read` | read；回 metadata 可能含敏感值 | **重寫**為 skeleton/payload 分權 read model；PR-08/11 |
| 21 | `list_club_members` (`...00400...sql:387`) | 搜尋/篩選 member table | A；`member.read` | read；回 email/phone/birth date | **重寫**為 RLS-safe typed read model；PR-03/04/11 |
| 22 | `list_club_operators_and_invitations` (`...00200...sql:229`) | operators + invites JSON | A；club manager | read；含 invite metadata | **合併**為 scoped role assignment/invitation views；PR-02/04/11 |
| 23 | `list_manageable_clubs` (`...00400...sql:49`) | current account 可管理/所屬 Clubs table | A；current account | read；004 取代 002 版本 | **重寫**為 Platform/District/Club scoped read model；PR-04/11 |
| 24 | `list_member_invitations` (`...00400...sql:451`) | Club invitation table | A；`invitation.manage` | read | **重寫**為 typed invitation list；PR-02/11 |
| 25 | `list_my_permissions` (`...00400...sql:36`) | current Club permission keys table | A；current account | read；呼叫 permission helper | **重寫**；可供 UI hint，但 DB/RLS 才是 enforcement；PR-04 |
| 26 | `mark_operator_invitation_sent` (`...00200...sql:204`) | pending operator invite → sent | A；club manager | L/Au；重複 sent 為 no-op | **合併**至 resend/send event transaction；PR-02 |
| 27 | `pair_line_oa_follower` (`...00400...sql:682`) | OA user ↔ Person/Account 配對，回 UUID | A；`oa.manage` | Au；OA/member not found | **重寫**為 `link_line_oa_contact`；PR-07 |
| 28 | `prevent_app_account_identity_relink` (`20260722000100...sql:232`) | trigger：阻擋既有 account 改 Person/Auth | I trigger | invoker；raises integrity error | **移除**；以 V1.2 constraint + `bind_identity` transaction/guard 取代；PR-01/05 |
| 29 | `prevent_member_operator_overlap` (`...00100...sql:253`) | trigger：member 不可成 operator | I trigger | invoker；cross-table check | **移除**；V1.2 Club President/Secretary 本來就是 Membership role；PR-04 |
| 30 | `prevent_operator_member_overlap` (`...00100...sql:288`) | trigger：operator 不可成 member | I trigger | invoker；cross-table check | **移除**；同上；PR-04 |
| 31 | `record_line_push` (`...00400...sql:801`) | append OA push log + audit，回 UUID | A；`oa.manage` | Au；OA must exist | **延後**；V1.2 MVP 只要求 OA 配對，push ledger/schema 需產品決策；PR-07 或後續 |
| 32 | `record_login_and_device` (`...00400...sql:515`) | upsert device、append login history，回 device UUID | A；self | 無顯式 lock；session id 取 auth context | **拆分/重寫**為 login event + device/account-device/session ledger；PR-05/06 |
| 33 | `resend_member_invitation` (`...00400...sql:193`) | rotate token、更新 expiry/status，回 plaintext token | A；`invitation.manage` | L/Au；accepted 拒絕 | **重寫**為 `resend_membership_invitation`，HMAC 在 Edge；PR-02 |
| 34 | `resolve_current_app_account` (`...00200...sql:62`) | current Auth → account/person/roles JSON | A；self | read | **重寫**為 typed auth context/read model；PR-04/11 |
| 35 | `revoke_my_device` (`...00400...sql:599`) | revoke device 並 delete `auth.sessions` | A；self device | Au；device not found；重試目前會 not found | **合併**至 idempotent `revoke_account_session` + account-device revoke；PR-05 |
| 36 | `revoke_operator` (`...00200...sql:444`) | revoke operator；保護最後一位 | A；club manager/platform | L/Au；reason required；last active guard | **合併**至 scoped role assignment revocation；PR-04 |
| 37 | `set_membership_status` (`...00400...sql:467`) | 更新 membership status，void | A；`member.manage` | Au；無 history ledger/lock | **重寫**為 `change_membership_status`，同步 immutable history/onboarding；PR-03 |
| 38 | `set_updated_at` (`...00100...sql:197`) | 泛用 before-update trigger | I trigger | invoker | **移除/已替代**：V1.2 foundation 使用 table-specific typed trigger functions；PR-01 |
| 39 | `unbind_line_identity` (`...00400...sql:616`) | unbind LINE、清 Auth、刪 sessions、可建 rebind invite | A；`identity.unbind` | L/Au；回 rebind plaintext token；Login/OA 分離 | **重寫**為 `unbind_identity` + session revoke + Edge rebind invitation；PR-05/06/02 |
| 40 | `unpair_line_oa_follower` (`...00400...sql:709`) | OA follower unpair，void | A；`oa.manage` | Au；not found | **重寫**為 idempotent `unlink_line_oa_contact`；PR-07 |
| 41 | `update_member_profile` (`...00400...sql:425`) | 更新 membership Person profile，void | A；`member.manage` | Au；membership not found；無 optimistic lock | **合併**至 controlled Person/contact + membership update；PR-03 |
| 42 | `update_my_settings` (`...00400...sql:572`) | upsert notification/privacy settings，void | A；self | Au；JSON → fixed columns | **延後**：V1.2 foundation 無 preference tables；先決定 MVP/policy，再另 PR 或 PR-11 |

## Exact signatures, database objects, and callers

Signatures/results below are from local `pg_proc`; `R`/`W` describes table access in the function body. `auth.*` writes are called out because they cross Supabase Auth ownership. Caller line references are the current direct app/script calls; internal helper calls are already represented in the object list.

| # | Inputs → result | Tables read / written | Direct caller(s) |
|---:|---|---|---|
| 1 | `p_invite_id uuid → jsonb` | R clubs, memberships; W accounts, people, operator_invites, operator_permissions, audit | `src/app/actions.ts:106`; `scripts/verify-local-auth-flow.mjs:55-57` |
| 2 | `p_club_id uuid, p_app_account_id uuid, p_role_key text → uuid` | W club_role_assignments, audit | `src/app/actions.ts:188`; API route `:39-40` |
| 3 | `p_token, p_provider_subject, p_display_name, p_picture_url, p_email text → jsonb` | R invite/person; W accounts, identities, audit | LINE callback `src/app/api/auth/line/callback/route.ts:76-79` |
| 4 | `p_invitation_id uuid, p_reason text → void` | W member_invitations, invitation_logs, audit | actions `:151-154`; API `:34` |
| 5 | `p_token/name/phone/email text, p_birth_date date → jsonb` | R account/identity; W people, memberships, invitations/events, roles, settings, audit | actions `:162-165` |
| 6 | `p_club_id uuid, display/basic/channel/mode text → uuid` | W line_oa_accounts, audit | actions `:221-225`; API `:44` |
| 7 | `club_code/name/operator_email/operator_display_name/idempotency_key text → jsonb` | R accounts/memberships; W clubs, operator_invites, audit | actions `:53-60`; auth-flow script `:25-31` |
| 8 | `club uuid, name/phone/email text, birth date, delivery/idempotency text → jsonb` | W people, memberships, member_invitations, invitation_logs, audit | actions `:133-138`; API `:30-32`; import route `:17-20` |
| 9 | `— → uuid` | R app_accounts | internal only |
| 10 | `target_club_id uuid → boolean` | R accounts, platform_roles, operator_permissions | internal only |
| 11 | `target_club_id uuid, required_permission text → boolean` | R accounts, platform/operator/club roles, role_permissions | internal only |
| 12 | `required_roles text[] → boolean` | R accounts, platform_roles | internal only |
| 13 | `p_club_id uuid → jsonb` | R clubs, operator_permissions, operator_invites | identity/operators/platform pages `:10`, `:16`, `:10` |
| 14 | `p_club_id uuid → jsonb` | R people, accounts, memberships, invitations, identities, OA followers, login history | identity page `:10`; API `:18` |
| 15 | `p_club_id uuid → jsonb` | R OA accounts/followers/push/webhooks, people | OA page `:12`; API `:20` |
| 16 | `p_token text → jsonb` | R member_invitations, people, clubs | `src/app/join/page.tsx:14` |
| 17 | `p_club_id uuid → jsonb` | R accounts, memberships, clubs | Club home `src/app/(authenticated)/club/[clubId]/page.tsx:7` |
| 18 | `— → jsonb` | R people, accounts, identities, login history, devices, notification/privacy | me page `:7`; API `:15` |
| 19 | `p_club_id uuid, email/display/idempotency text → jsonb` | R accounts/memberships; W operator_invites, audit | actions `:80-86` |
| 20 | `p_club_id uuid, p_limit integer → TABLE(audit fields)` | R audit_logs, app_accounts | audit page `:7`; API `:19` |
| 21 | `club uuid, query/status text → TABLE(member/profile/LINE/OA fields)` | R people, accounts, memberships, roles, identities, OA followers | members/LINE/OA/detail pages; API `:16`; export `:6` |
| 22 | `p_club_id uuid → jsonb` | R operator_permissions/invites, accounts | operators page `:17` |
| 23 | `— → TABLE(club_id/code/name/status/permission/created_at)` | R clubs, accounts, memberships, operator + club roles | dashboard/platform pages `:11/:13`; auth-flow `:62` |
| 24 | `p_club_id uuid → TABLE(invitation fields)` | R member_invitations, people | invitations page `:16`; API `:17` |
| 25 | `p_club_id uuid → TABLE(permission_key)` | R permissions + authorization tables | member detail `:19`; actions `:245`; API `:48`; template `:6` |
| 26 | `p_invite_id uuid → void` | W operator_invites, audit | actions `:23-25`; auth-flow `:35` |
| 27 | `p_club_id uuid, p_oa_user_id text, p_person_id uuid → uuid` | R accounts/memberships/OA account; W OA followers, audit | actions `:229-233`; API `:45` |
| 28 | `trigger → trigger` | trigger row on app_accounts | trigger only (`M001:249-251`) |
| 29 | `trigger → trigger` | R accounts/operator_permissions; trigger on memberships | trigger only (`M001:284-286`) |
| 30 | `trigger → trigger` | R accounts/memberships; trigger on operator permissions | trigger only (`M001:330-332`) |
| 31 | `club uuid, kind text, count integer, payload jsonb, status/request/failure text → uuid` | R OA account; W line_push_logs, audit | actions `:252-256`; API `:56-58` |
| 32 | `provider/fingerprint/name/user_agent text, ip inet → uuid` | W user_devices, login_history | LINE callback `:87-89` |
| 33 | `p_invitation_id uuid, p_delivery_method text → jsonb` | W member_invitations, invitation_logs, audit | actions `:144-146`; API `:33` |
| 34 | `— → jsonb` | R accounts, platform_roles | `src/lib/auth.ts:23` |
| 35 | `p_device_id uuid → void` | W user_devices, `auth.sessions`, audit | actions `:215`; API `:43` |
| 36 | `p_club_id uuid, p_operator_permission_id uuid, p_reason text → jsonb` | R clubs; W operator_permissions, audit | actions `:118-124` |
| 37 | `club/membership uuid, status/reason text → void` | W club_memberships, audit | actions `:179-183`; API `:35` |
| 38 | `trigger → trigger` | trigger row only | seven table triggers (`M001:208-228`, `M003:290-303`) |
| 39 | `club/account uuid, reason text, create_rebind boolean → jsonb` | R account/membership; W identities, `auth.sessions`, invitations/events, audit | actions `:198-202`; API `:41` |
| 40 | `club/follower uuid, reason text → void` | W OA followers, audit | actions `:236-240`; API `:46` |
| 41 | `club/membership uuid, name/phone/email text, birth date → void` | R memberships; W people, audit | actions `:171-174`; API `:36-38` |
| 42 | `notifications jsonb, privacy jsonb → void` | W notification_settings, privacy_settings, audit | actions `:207-211`; API `:42` |

`M001` and `M003` in this table use the same exact path mapping declared above, with `M003` resolving to `supabase/migrations/20260722000300_v03_identity_admin_schema.sql`.

## 橫切安全觀察

### Auth 與角色

- 授權的可信根是 `auth.uid()` → `app_accounts`，不是前端傳入 account ID（`...00200_secure_provisioning_workflow.sql:7-17`）。
- V0.3 同時有 `platform_roles`、operator permission、`role_definitions`/`club_role_assignments` 三套授權模型；V1.2 必須收斂為 Platform/District/Membership role assignments。
- `list_my_permissions` 只能供 UI 呈現；實際 mutation/RLS 必須重新查即時 assignment，確保 revoke 立即生效。

### Concurrency 與 idempotency

- 已使用 row lock：#1、#4、#5、#8、#26、#33、#36、#39，及 identity bind 的 account/invite rows。
- V0.3 沒有全域鎖順序或通用 idempotency ledger。V1.2 invitation 必須固定 Invitation → Membership → Account，並以 `idempotency_records` 區分 same-key/same-payload 與 conflict（母版 `docs/roadmap/V12_PRODUCT_ARCHITECTURE_ROADMAP.md:330-349`）。
- #35/#40 等 revoke/unlink 在 V1.2 應安全重試；「already revoked/unlinked」回既有結果，而非暴露是否存在的差異。

### Token 與 audit

- #8、#33、#39 會把一次性 plaintext token 回給 Next.js action；#16/#3/#5 在 DB 以 SHA-256 token hash 驗證。V1.2 必須改為 32-byte CSPRNG、versioned base64url、HMAC-SHA-256 digest，HMAC secret 只在 Edge/受控後端。
- 多數 mutation 有 audit，但 membership status、identity/session、invitation 的 event/audit 邊界不一致。PR-08 必須統一 `write_audit_event`，將 immutable skeleton 與可遮蔽 payload 分離。

## Replacement contract 原則

1. 先在 V1.2 建新 function + SQL tests，不改 legacy function。
2. Edge/client 只使用產生式 Database Types 與明確 error mapping，不再以 `as` 手動猜 JSON shape。
3. PR-09 產出 machine-readable RPC mapping；PR-10 shadow migration 不呼叫 legacy mutation RPC。
4. PR-11 才切前端，compatibility adapter 以 feature flag/isolated environment 選擇 V0.3 或 V1.2；不可同 request 跨兩個 DB 寫入。
5. V0.3 RPC 只在切換完成、reconciliation 綠燈與回滾窗口結束後另案退役。
