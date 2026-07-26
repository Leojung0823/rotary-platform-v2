# V0.3 Frontend / Auth / LINE Dependency Inventory

## Counts and missing artifacts

- 32 repository files directly depend on Supabase (`createClient`, `.rpc`, `.from`, or `.auth`): 30 under `src/` and 2 scripts.
- 34 distinct literal V0.3 RPC names are called by app/scripts.
- Direct table access exists in two scripts/routes groups: bootstrap, LINE Login start/callback, LINE OA webhook, plus one server action query. All use trusted/service clients and bypass RLS.
- Edge Functions：**0**；repository 沒有 `supabase/functions/`。
- Generated TypeScript Database Types：**0**；Supabase clients are unparameterized (`src/lib/supabase/client.ts:3-8`, `server.ts:4-19`, `admin.ts:3-25`), RPC results use manual casts.
- Existing API compatibility surface：`src/app/api/v1/[...path]/route.ts:12-59` maps HTTP paths to V0.3 RPC names.

## Shared infrastructure

| File | Current dependency | V1.2 change / blocker |
|---|---|---|
| `src/lib/supabase/client.ts:3-8` | Browser client from public URL/key | Add generated V1.2 `Database` generic; select isolated environment via server-provided config, never ship service key. |
| `src/lib/supabase/server.ts:4-19` | SSR client + cookie session rotation | Preserve SSR cookie contract; add typed client and explicit V0.3/V1.2 adapter. |
| `src/lib/supabase/admin.ts:3-25` | Service role clients; trusted client can be non-local only with `APP_ENV`/`TRUSTED_ADMIN_ENVIRONMENT` guard | Split bootstrap/local admin from Edge/production backend. Default fail closed; no generic admin client in UI modules. |
| `src/proxy.ts:4-22` | Refreshes Auth with `getUser()` | Preserve session refresh; V1.2 must additionally route locked/suspended users to recovery without trusting stale JWT role claims. |
| `src/lib/auth.ts:13-29` | `getUser`, `resolve_current_app_account`, manual `Identity` type and role-key UI gate | Replace with typed V1.2 auth context. `hasPlatformAccess` remains UI hint only; RLS/API enforce access. |
| `src/app/(authenticated)/layout.tsx:2-9` | `requireIdentity` gates all authenticated pages | Change after V1.2 auth context is stable; include locked/suspended/reconciliation states. |
| `src/app/auth/confirm/route.ts:10-18` | Supabase email OTP verify | Decide whether operator/email flow remains; keep safe `next` validation and typed auth errors. |

## Page dependency matrix

| File | RPC / auth contract | Data displayed or mutated | V1.2 owner PR |
|---|---|---|---|
| `src/app/(authenticated)/dashboard/page.tsx:9-15` | `requireIdentity`, `list_manageable_clubs` | display name, roles, manageable Clubs | PR-04 + PR-11 |
| `src/app/(authenticated)/platform/clubs/page.tsx:10-13` | platform UI gate, `list_manageable_clubs` | platform Club list | PR-04 + PR-11 |
| `src/app/(authenticated)/platform/clubs/new/page.tsx:9-10` | platform UI gate; form calls action | Club + first operator input | PR-03/04 + PR-11 |
| `src/app/(authenticated)/platform/clubs/[clubId]/page.tsx:10` | `get_club_provisioning_status` | Club/operator/invite status | PR-02/04 + PR-11 |
| `src/app/(authenticated)/clubs/[clubId]/operators/page.tsx:14-17` | provisioning + operator/invite list RPC | operator grants, invitations | replace with role assignments; PR-02/04/11 |
| `src/app/(authenticated)/club/[clubId]/page.tsx:6-7` | `get_my_club_home` | club/member welcome/home | PR-03/04/11; do not add deferred activity/announcement data |
| `src/app/(authenticated)/clubs/[clubId]/members/page.tsx:10-11` | `list_club_members` | name/email/phone/birthday/status/LINE state | PR-03/04/11; PII policy critical |
| `src/app/(authenticated)/clubs/[clubId]/members/[membershipId]/page.tsx:16-20` | members + permissions | profile edit, status, role, identity unbind | split typed calls across PR-03/04/05/11 |
| `src/app/(authenticated)/clubs/[clubId]/members/new/page.tsx` | form → `createMemberInvitationAction` | known member details | PR-02/03/11; run person match before create |
| `src/app/(authenticated)/clubs/[clubId]/invitations/page.tsx:15-16` | `list_member_invitations` | state, expiry, one-time link result | PR-02/11; token must not enter query string/log |
| `src/app/join/page.tsx:13-16` | anonymous preview RPC + auth helper | invitation token, known person fields | PR-02 authenticated validate/preflight；PR-03 final onboarding；PR-06/11 controlled UI |
| `src/app/invite/accept/page.tsx:10-11` | authenticated operator acceptance | email-invite password flow | merge/remove after role invitation decision; PR-02/04/11 |
| `src/app/(authenticated)/clubs/[clubId]/identity/page.tsx:9-10` | provisioning + identity dashboard | login/OA/member statistics | PR-05/07/11 |
| `src/app/(authenticated)/clubs/[clubId]/line/page.tsx:7-10` | `list_club_members` | LINE Login bind status | PR-05/06/11; keep OA separate |
| `src/app/(authenticated)/clubs/[clubId]/line-oa/page.tsx:11-15` | OA admin + members | channel config, webhook, follower links, push log | PR-07/11; push UI is outside minimum OA pairing scope unless product retains it |
| `src/app/(authenticated)/clubs/[clubId]/audit/page.tsx:7` | `list_club_audit` | actor, subject, metadata | PR-08/11; skeleton/payload access must differ |
| `src/app/(authenticated)/me/page.tsx:7` | `get_my_identity_center` | profile, identity, login, devices, notification/privacy | PR-05/11; preference storage decision required |

## Server actions and API routes

| File | RPC/table/Auth dependencies | Security / cutover finding |
|---|---|---|
| `src/app/actions.ts:15-257` | 20 mutation/read RPCs, Auth update, Supabase invite, OA messaging; direct `line_oa_followers` query near `:245-252` | Central V0.3 mutation surface. `create_member_invitation` and resend place plaintext token in redirect query (`:133-146`), which must be removed. Replace action-by-action only after typed V1.2 API exists. |
| `src/app/api/v1/[...path]/route.ts:12-59` | 6 GET + 13 POST RPC paths; auth check; same-origin check; OA provider call | This is the best compatibility seam. Keep V0.3 routes stable, implement separate V1.2 client/route namespace or feature-gated backend, then cut atomically. |
| `src/app/api/v1/clubs/[clubId]/members/import/route.ts:14-25` | one `create_member_invitation` per spreadsheet row | Needs request-level authorization, bounded rows, per-row idempotency/person match, and no token in workbook output. |
| `src/app/api/v1/clubs/[clubId]/members/export/route.ts:6-12` | `list_club_members` | Export contains PII; V1.2 permission and audit required. |
| `src/app/api/v1/clubs/[clubId]/members/template/route.ts:6-11` | `list_my_permissions` | Permission check should use controlled API enforcement, not UI-only list semantics. |
| `src/app/api/auth/line/start/route.ts:12-27` | trusted admin direct insert into `line_oauth_states`; cookie state/nonce | Move to `line-login-callback` Edge/controlled flow; state material must be short-lived, single-use, environment/channel scoped. |
| `src/app/api/auth/line/callback/route.ts:20-94` | direct service CRUD on `line_oauth_states`, `member_invitations`, `app_accounts`, `people`, `line_identities`; Auth admin create/link; bind/login RPC | Highest cutover risk: multi-table writes are not one DB transaction, service role bypasses RLS, and legacy token hashing differs. Replace as PR-06 after PR-02/05. |
| `src/app/api/line-oa/webhook/[clubId]/route.ts:9-29` | signature check; service reads `line_oa_accounts`, inserts/updates `line_webhooks`, upserts `line_oa_followers` | Move to `line-oa-webhook` Edge + controlled transaction. Channel/environment must derive Club; do not trust URL clubId alone. |

## LINE support files

| File | Contract | V1.2 action |
|---|---|---|
| `src/lib/line/provider.ts:10-72` | Mock/LINE OAuth URL, code exchange, ID token verify/profile; env secrets | Preserve mock provider, but bind `provider_subject` to `line_channel_configs` + environment. Add negative tests for channel mismatch/replay. |
| `src/lib/line/provider.test.ts:5-22` | mock signature, nonce, localhost restriction | Extend in PR-06; current tests are unit-only. |
| `src/app/line/mock/page.tsx:9` + `actions.ts:13-15` | local-only mock authorization UI | Keep strictly localhost/non-LINE mode; never deploy as alternate production identity provider. |
| `src/lib/line/messaging.ts:6-31` | OA send/reply and raw-body HMAC verification | PR-07 controlled backend only; load secret by reference, not DB plaintext. |
| `src/lib/line/messaging.test.ts:5-18` | HMAC tamper and local-only mock tests | Extend webhook dedupe/retry/channel tests. |
| `src/app/login/page.tsx:10` | authenticated redirect + LINE start link in UI | PR-06 updates entry URL/error states; retain Traditional Chinese UX. |

## Script dependencies

| File | Dependencies | V1.2 plan |
|---|---|---|
| `scripts/bootstrap-superadmin.mjs:16-46` | Auth admin + direct `app_accounts`, `people`, `platform_roles` CRUD | Must not be reused for V1.2. PR-01 bootstrap SQL creates system actor only; first human platform admin needs a separately approved, idempotent controlled procedure. |
| `scripts/verify-local-auth-flow.mjs:20-62` | Auth password/invite + 4 provisioning RPCs | Keep as V0.3 regression. Add independent V1.2 Edge/transaction integration suites; do not rewrite this into the only test. |

## RPC literal set (34)

`accept_operator_invitation`, `assign_club_role`, `bind_line_identity_from_invitation`, `cancel_member_invitation`, `complete_member_invitation`, `configure_line_oa`, `create_club_with_initial_operator_invitation`, `create_member_invitation`, `get_club_provisioning_status`, `get_identity_dashboard`, `get_line_oa_admin`, `get_member_invitation_preview`, `get_my_club_home`, `get_my_identity_center`, `invite_additional_operator`, `list_club_audit`, `list_club_members`, `list_club_operators_and_invitations`, `list_manageable_clubs`, `list_member_invitations`, `list_my_permissions`, `mark_operator_invitation_sent`, `pair_line_oa_follower`, `record_line_push`, `record_login_and_device`, `resend_member_invitation`, `resolve_current_app_account`, `revoke_my_device`, `revoke_operator`, `set_membership_status`, `unbind_line_identity`, `unpair_line_oa_follower`, `update_member_profile`, `update_my_settings`.

## Cutover order

1. Generate V1.2 Database Types after PR-04 schema/RLS settles; check generated file into repository and validate drift in CI.
2. Add typed domain/API client with explicit error union; do not change page callers yet.
3. Replace LINE invitation/login callback and OA webhook through Edge/controlled backend (PR-06/07).
4. Replace self identity/session, membership/invitation/RBAC/audit read models behind a V1.2-only environment flag.
5. Run V0.3 and V1.2 E2E against separate databases; no dual-write.
6. PR-11 switches routes/pages in one reviewed cutover and keeps V0.3 read-only rollback path.

## Required UI states

Every changed page must render Traditional Chinese Loading、Empty、Error、Permission denied、Membership unavailable/locked states. Manual casts such as `data as Preview` (`src/app/join/page.tsx:14`) and broad `result.error ? 403` mapping (`src/app/api/v1/[...path]/route.ts:21,59`) must be replaced by generated types and stable error mapping before Gate 8.
