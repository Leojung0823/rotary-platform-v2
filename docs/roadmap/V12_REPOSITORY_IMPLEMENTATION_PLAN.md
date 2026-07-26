# Rotary Platform V1.2 Repository Implementation Plan

## 1. Authority, scope, and repository baseline

Primary product/architecture authority is `docs/roadmap/V12_PRODUCT_ARCHITECTURE_ROADMAP.md`; repository planning details follow `docs/roadmap/CODEX_V12_REPOSITORY_PLAN_PROMPT.md`. This document is a historical planning snapshot: at the time it was drafted, its planning baseline was the same commit as `origin/feat/v0.3-identity-admin`, and the requested legacy baseline branch was reachable at `origin/feat/supabase-core-baseline`. Earlier branch and commit references in this document record that planning context only and are not statements of current repository state.

At the time this plan was drafted, the planning pass did not modify the four legacy migrations, execute remote Supabase operations, commit, push, deploy, or change Draft PR #7; it preserved its then-uncommitted `package.json`, `database/`, and `docs/roadmap/` prototype work.

All implementation work in this plan must also follow the permanent governance set:

- `docs/architecture/V12_ARCHITECTURE_DECISIONS.md` for accepted architecture invariants;
- `docs/development/V12_PROJECT_STRUCTURE.md` for canonical placement and dependency boundaries;
- `docs/development/DATABASE_STYLE_GUIDE.md` for V1.2 SQL, migration, RLS, function and database-test rules;
- `CONTRIBUTING.md` for Stage → Milestone → PR workflow, verification, review and authority boundaries.

The product roadmap remains the authority for scope and Gates. If a permanent rule, this execution plan, or a pending D01–D20 decision conflicts, implementation stops at the affected boundary and remains fail closed until the owner records a decision.

### Verified current inventory

| Item | Count / state | Evidence |
|---|---:|---|
| Legacy migrations | 4 | `supabase/migrations/`; detail in `V12_MIGRATION_INVENTORY.md` |
| Legacy public tables | 25 | 8 in `supabase/migrations/20260722000100_core_identity_and_club_access.sql:6-195`; 17 in `supabase/migrations/20260722000300_v03_identity_admin_schema.sql:14-251` |
| Legacy public functions | 42 | inventory in `V12_RPC_INVENTORY.md` |
| Legacy RLS-enabled tables | 25 | `supabase/migrations/20260722000100_core_identity_and_club_access.sql:335-342`, `supabase/migrations/20260722000300_v03_identity_admin_schema.sql:305-321` |
| Legacy RLS policies | 0 | no `CREATE POLICY`; direct client table grants revoked |
| Edge Functions | 0 | no `supabase/functions/` |
| Generated Database Types | 0 | untyped clients at `src/lib/supabase/client.ts:3-8`, `server.ts:4-19` |
| Direct Supabase dependency files | 32 | 30 runtime `src` + 2 scripts; `V12_FRONTEND_DEPENDENCIES.md` |
| Literal frontend/script RPC names | 34 | `V12_FRONTEND_DEPENDENCIES.md` |
| V1.2 foundation tables | 31 | `database/v12/migrations/0001_v12_foundation.sql:40-2071` |
| V1.2 foundation RLS | intentionally 0 | current scope note at `database/v12/migrations/0001_v12_foundation.sql:2102-2117` |

### Existing CI gap

`.github/workflows/ci.yml:19-22` runs install/lint/typecheck/build; `.github/workflows/quality.yml:12-17` adds legacy migration check and unit tests. Neither starts a local V1.2 Supabase stack nor runs `npm run db:v12:verify`, despite the commands already existing in `package.json:20-23`.

## 2. Architecture boundaries

- PostgreSQL owns constraints, immutable histories, cross-table transactions, idempotency records, current-state authorization helpers, and RLS.
- Edge Functions / controlled backend own OAuth/provider calls, secret lookup, HMAC token generation/verification, rate limiting, request validation, external delivery and safe error mapping (`V12_PRODUCT_ARCHITECTURE_ROADMAP.md:153-218`).
- Frontend owns Traditional Chinese task UX and calls typed APIs. It never receives service role, HMAC secret, raw audit payload beyond authorization, or a caller-supplied account scope.
- LINE Login identity and LINE OA contact/link remain separate domains (`database/v12/README.md:66-68`). Unbinding either must not mutate the other.
- No dual-write. Shadow migration is extract/transform/load into the isolated V1.2 database, followed by reconciliation; V0.3 remains unchanged/read-only during final rollback window.

## 3. Isolation options

### Option A — fixed dedicated PostgreSQL database inside the then-local Supabase DB container

At the time this plan was drafted, historical Option A used fixed database `rotary_platform_v12_test`; its wrappers obtained only local connection data and refused an arbitrary database name (`database/v12/README.md:13-22`). This is retained as design background, not as a description of the current implementation.

**Pros:** already reproducible; fastest schema/pgTAP/lint loop; cannot touch legacy `postgres` migration history; single `npm run db:v12:verify` command.

**Cons:** Supabase Auth, PostgREST, generated types, and Edge Runtime still point at the main local `postgres` database. It cannot prove V1.2 Auth/RLS/API/Edge end-to-end isolation, so it is insufficient after PR-01.

### Option B — independent Supabase workdir under `database/v12/` (**recommended**)

Target structure:

```text
database/v12/
  supabase/config.toml
  supabase/migrations/
  supabase/seed.sql
  supabase/functions/
  tests/
  verification/
  scripts/
```

Use a distinct `project_id`, non-overlapping API/DB/shadow/Studio/Inbucket ports, separate Docker network, and commands with explicit `--workdir database/v12`. The installed CLI supports `--workdir` for `start`, `db reset`, and `functions serve`. Wrappers must validate local host/ports and reject `--linked`, project refs, access tokens, and arbitrary DB URLs.

**Pros:** V1.2 gets its own migration history, Auth, PostgREST, RLS, type generation and Edge Runtime; CI/E2E match production architecture without touching V0.3. Single reset/test/verify wrappers remain possible.

**Cons:** more Docker resources; PR-01 needed to relocate/adapt the then-foundation migration and allocate ports; developers must explicitly stop/select the correct stack.

### Recommendation and transition

Adopt Option B before PR-02. Keep Option A temporarily as a fast PostgreSQL-only verification path until the independent stack reproduces the same 31-table/seed/97+ assertion result, then remove duplicate execution logic. The migration SQL must have one canonical copy only. This is the only option that satisfies later Auth/Edge/RLS gates while preserving the four legacy migrations (`V12_PRODUCT_ARCHITECTURE_ROADMAP.md:242-263`). Human approval D01 is still required.

PR-01 完成 Option B 後的固定入口應為：

```bash
npx supabase start --workdir database/v12
npm run db:v12:reset
npm run db:v12:verify
npx supabase stop --workdir database/v12
```

CI job uses the same workdir: `npm ci` → start isolated stack → `npm run db:v12:verify` → always stop in a cleanup step. The current verification approach uses an isolated Supabase workdir per worktree; this historical plan's Option A wrapper discussion must not be read as a statement of the current implementation or as full Auth/Edge verification.

## 4. Legacy mapping and cutover seams

- Full 25-table mapping: `V12_LEGACY_TABLE_MAPPING.md`.
- Full 25-table column/key/index/sensitivity inventory: `V12_LEGACY_TABLE_INVENTORY.md`.
- Full 42-function classification: `V12_RPC_INVENTORY.md`.
- Existing 25-table RLS behavior and proposed 31-table matrix: `V12_RLS_INVENTORY.md`.
- 32 direct dependency files and cutover order: `V12_FRONTEND_DEPENDENCIES.md`.
- Human decisions: `V12_DECISIONS_REQUIRED.md`.

The preferred frontend seam is `src/app/api/v1/[...path]/route.ts:12-59`: keep V0.3 behavior stable, create typed V1.2 APIs behind an isolated environment/namespace, and switch only in PR-11. Do not retrofit V1.2 table names directly across pages while transactions/RLS are incomplete.

## 5. PR dependency graph

### Development management hierarchy

The management hierarchy is **Stage → Milestone → PR**. Existing roadmap `Phase 0–9` labels remain technical work packages and do not create another management level.

| Stage | Milestone / Gate outcome | Technical Phase | PR |
|---|---|---|---|
| Stage 1 — Foundation | A — Database Foundation Ready | Phase 0–1 / Gate 1 | PR-01 |
| Stage 2 — Identity & Admin Core | B — Invitation & Onboarding Ready | Phase 2–3 / Gate 2–3 | PR-02–03 |
| Stage 2 — Identity & Admin Core | C — Security & Access Ready | Phase 4–6 / Gate 4–6 | PR-04–08 |
| Stage 3 — Migration Readiness | D — Legacy Shadow Migration Ready | Phase 7 / Gate 7 | PR-09–10 |
| Stage 4 — Cutover Readiness | E — Frontend Cutover Ready | Phase 8 / Gate 8 | PR-11 |
| Stage 5 — Release Readiness | F — Release Candidate Ready | Phase 9 / Gate 9 | PR-12 |

Each PR belongs to exactly one Milestone and one reviewable topic. PR completion does not automatically complete its Milestone; Milestone completion does not authorize the next Stage, deployment, traffic change or production operation. Milestones D–F are governance names for existing work only and do not add features or alter the 12 PR scopes below.

```text
PR-01 foundation + isolated stack
  ├─ PR-02 invitation core ─┐
  ├─ PR-03 membership ──────┼─ PR-04 RLS/RBAC
  │                         ├─ PR-05 identity/session ── PR-06 LINE Login
  │                         └─────────────────────────── PR-07 LINE OA
  └──────────────────────────────────────────────────── PR-08 audit/security

PR-01..08 ── PR-09 legacy mapping ── PR-10 shadow migration
PR-02..08 + generated types + PR-10 reconciliation ── PR-11 frontend cutover
PR-01..11 ── PR-12 release candidate (staging only after human approval)
```

PR-02/03 functions stay isolated and not production-exposed before PR-04. Each function performs its own server-derived authorization and execute grants remain minimal; Gate 4 is still mandatory before any user traffic.

## 6. Detailed 12-PR plan

### PR-01 `v12-database-foundation`

- **Purpose:** finish Gate 1 foundation and a fully independent local Supabase workdir without changing V0.3.
- **Dependencies:** D01 isolation approval; reviewer schema decisions; current `database/v12/` foundation.
- **Files:** current `database/v12/migrations/0001_v12_foundation.sql`, seed/bootstrap/tests/verification/docs/scripts; add `database/v12/supabase/config.toml` and canonical migration/seed layout; update `package.json:20-23`; add V1.2 job to `.github/workflows/quality.yml`.
- **Migration:** one foundation migration, 31 tables, constraints, indexes, comments, typed triggers. No legacy migration edits.
- **Functions:** only typed updated-at and integrity guard triggers already listed in `database/v12/migrations/0001_v12_foundation.sql:66-2098`; no business RPC.
- **RLS:** intentionally none; record explicit deny/release gate. No production traffic.
- **Edge / frontend:** none.
- **Tests:** empty reset, 11 pgTAP files, seed rerun, identifier ≤55 bytes, full FK index matrix, verification SQL, db lint; CI starts only the V1.2 workdir.
- **Acceptance:** Gate 1 (`V12_PRODUCT_ARCHITECTURE_ROADMAP.md:296-307`), legacy four-file checksum unchanged, one canonical migration copy, local-only guard tests pass.
- **Rollback:** stop/delete only V1.2 local workdir containers/volumes and revert PR files; V0.3 stack/history untouched.
- **Not included:** RLS, business functions, Edge, frontend, legacy data, remote deployment, first human admin execution.

### PR-02 `v12-invitation-core`

- **Purpose:** safe create/resend/validate-preflight/revoke membership invitation with HMAC, rotation and idempotency; no final acceptance.
- **Dependencies:** PR-01; D03/D04; approved token envelope/error contract.
- **Files:** `database/v12/supabase/migrations/*_v12_invitation_core.sql`, `database/v12/supabase/functions/{create,resend,validate}-membership-invitation/`, shared Edge request/error/HMAC modules, SQL/Edge integration tests.
- **Migration / functions:** `create_membership_invitation`, `resend_membership_invitation`, `validate_membership_invitation`, `revoke_membership_invitation`; mutation lock order Invitation → Membership → Account；private snapshot validator 不鎖定、不 reservation；`idempotency_records` integration。
- **RLS:** no broad policy; execute revoked from public/anon by default. Controlled Edge service invokes narrowly granted functions; PR-04 later adds user-visible policies.
- **Edge:** 32-byte CSPRNG token, versioned base64url, HMAC-SHA-256 with secret reference; plaintext exists only in request/response memory and delivery adapter.
- **Frontend:** no page cutover; document future typed contract.
- **Tests:** concurrent same-key Create, response-loss recovery across Create/Resend/Validate, byte-identical public eligibility failure matrix, accepted/consumed constraint behavioral matrix, Resend old-hash invalidation, repeated non-consuming Validate, same-key unchanged-state retry, revoke/resend/expiry stale-positive invalidation, same-key different-payload conflict, authenticated Auth User actor attribution, direct RPC/private-helper privilege denial, expired/revoked/accepted-fixture rejection, rollback/fault injection, no token/secret in DB/log/audit/idempotency hash.
- **Acceptance:** Gate 2 (`V12_PRODUCT_ARCHITECTURE_ROADMAP.md:342-349`).
- **Rollback:** remove isolated Edge/functions migration; no invitations have left local/synthetic environments.
- **Not included:** final acceptance/consumption/Auth binding, onboarding object creation, person match UI, RLS matrix, automated Email/SMS/LINE delivery, Legacy token compatibility, distributed rate limit implementation.
- **Release exposure:** Distributed Rate Limit is Deferred — Release Gate；完成前不得公開部署 Validate／未來 Accept 至 Public Staging 或 Production。Local／CI 驗證不算 Public Exposure，也不得以單一 Edge Worker memory counter 冒充完成。

### PR-03 `v12-membership-onboarding`

- **Purpose:** Person match, member creation, membership lifecycle and onboarding history.
- **Dependencies:** PR-01; invitation contract from PR-02; D05/D06/D08.
- **Files:** `*_v12_membership_onboarding.sql`, SQL fixtures/tests, controlled API modules; update mapping docs when behavior is proven.
- **Migration / functions:** `check_person_match`, `create_person_and_membership`, `change_membership_status`, `complete_membership_onboarding`, `waive_membership_onboarding`, `cancel_membership_onboarding`。`complete_membership_onboarding` 同交易重新驗證 Invitation/Auth，完成核准 onboarding 後才寫 accepted、consumed、accepted event、audit 與 idempotency；failure 全部 rollback。
- **RLS:** functions derive actor/Club; no cross-club candidate IDs/PII returned. Final policies in PR-04.
- **Edge:** request normalization/rate limit for person match; plaintext comparison only in controlled call, only request digest persists.
- **Frontend:** contract only; current member pages unchanged.
- **Tests:** multi-Club membership, one live human account/person, concurrent status transitions, effective_at uniqueness, termination cancels onboarding, no silent Person merge, cross-Club redaction；並移植 final accept、double accept、accept replay、accept-vs-accept/resend/revoke、onboarding rollback 與 accepted Auth binding 情境。
- **Acceptance:** Gate 3 (`V12_PRODUCT_ARCHITECTURE_ROADMAP.md:379-387`).
- **Rollback:** revert isolated migration/function; synthetic data only. Event/history rows are not down-migrated in an active environment—restore isolated DB snapshot instead.
- **Not included:** role policies, complex match-review UI, Account Merge.

### PR-04 `v12-rls-rbac`

- **Purpose:** enforce Platform/District/Club/Self authorization on all 31 tables.
- **Dependencies:** PR-01-03 schema/functions; D07/D08; approved 31-table matrix in `V12_RLS_INVENTORY.md`.
- **Files:** `*_v12_rls_helpers.sql`, `*_v12_rls_policies.sql`, RBAC seed delta, pgTAP role/tenant matrix, generated type scripts.
- **Migration / functions:** `get_current_account_id`, `get_current_person_id`, `get_current_membership_ids`, `has_platform_permission`, `has_district_permission`, `has_club_permission`, `is_self_person`; fixed `search_path`, non-client helpers.
- **RLS:** enable RLS on all 31 tables; explicit SELECT/INSERT/UPDATE/DELETE decision per table; default deny; append ledgers and sensitive tables narrower than business data.
- **Edge:** no new provider integration; update JWT/service invocation tests.
- **Frontend:** generate/check in V1.2 Database Types and typed permission context; UI permissions remain hints.
- **Tests:** anonymous/no-account/locked/suspended, secretary cross-Club, district cross-District, self vs other PII, member identity/session/audit denial, immediate role revoke, policy recursion/timeouts, execute-grant allowlist.
- **Acceptance:** Gate 4 (`V12_PRODUCT_ARCHITECTURE_ROADMAP.md:418-427`) plus generated type drift CI.
- **Rollback:** disable V1.2 traffic first, restore pre-PR isolated snapshot; never “fix” rollback by widening policy.
- **Not included:** frontend cutover, remote deployment, legacy role mapping execution.

### PR-05 `v12-identity-session`

- **Purpose:** identity binding/unbinding, device/account-device/session ledger, revoke and Auth reconciliation.
- **Dependencies:** PR-01/04; PR-02 rebind invitation contract; D09/D10.
- **Files:** `*_v12_identity_session.sql`, controlled reconciliation function/job, SQL/integration tests, typed API client modules.
- **Migration / functions:** `bind_identity`, `unbind_identity`, `revoke_account_session`; login event/device linking helpers; reconciliation issue create/resolve.
- **RLS:** self can read/revoke own ledger; general member cannot read others; support/admin scope is explicit and audited; system account excluded.
- **Edge:** `auth-reconciliation`; external Auth admin actions occur outside DB then reconcile ledger outcomes.
- **Frontend:** contract only for identity/device/session center; current `get_my_identity_center` remains V0.3.
- **Tests:** active/terminal/system account invariants, idempotent revoke, missing external session, forced logout, rebind generation, Auth missing/conflict, no device move during merge.
- **Acceptance:** identity/session portions of Gate 5 (`V12_PRODUCT_ARCHITECTURE_ROADMAP.md:462-469`).
- **Rollback:** stop Edge job and V1.2 traffic; preserve ledgers/issues, restore snapshot for local tests. Never recreate revoked external sessions.
- **Not included:** LINE OAuth provider, OA contact, Account Merge function/UI.

### PR-06 `v12-line-login`

- **Purpose:** Invitation-first LINE Login using channel/environment-scoped identity.
- **Dependencies:** PR-02/04/05; D11; callback domain/secret reference approved.
- **Files:** `database/v12/supabase/functions/line-login-callback/`, OAuth shared library/tests, typed frontend API; later adapt `src/lib/line/provider.ts` and auth start/callback routes only behind V1.2 flag.
- **Migration / functions:** use `bind_identity`/session/login event transactions; only minimal channel config delta if PR-01 schema requires it.
- **RLS:** no direct identity insert/update from browser; self read and admin unbind follow PR-04.
- **Edge:** state/nonce/replay prevention, server token exchange/verification, channel config lookup, safe account link/create, invitation accept orchestration, rate limit and audit.
- **Frontend:** V1.2 login/join/error/rebind flow in Traditional Chinese behind flag; preserve V0.3 callback.
- **Tests:** mock + LINE-shaped fixtures, state/nonce replay, channel/environment mismatch, duplicate subject/account/person, invitation resume, refresh/session rotation, no provider token persisted/logged.
- **Acceptance:** LINE Login parts of Gate 5 and complete local login E2E.
- **Rollback:** disable V1.2 login flag/callback, leave V0.3 callback active; do not delete identities/ledger history.
- **Not included:** OA messaging/contact, production LINE channel changes.

### PR-07 `v12-line-oa`

- **Purpose:** OA contact ingestion, membership/person link and unlink independent from Login identity.
- **Dependencies:** PR-04/05; D12/D13; channel/environment mapping.
- **Files:** `*_v12_line_oa.sql`, `database/v12/supabase/functions/line-oa-webhook/`, OA client/tests; V1.2 admin page adapters behind flag.
- **Migration / functions:** `link_line_oa_contact`, `unlink_line_oa_contact`; optional webhook receipt ledger only if approved.
- **RLS:** OA admins scoped by Club/channel; self sees limited link status; no Login identity mutation.
- **Edge:** raw-body signature verification, provider event dedupe/retry, derive scope from channel config (not URL Club alone), controlled transaction calls.
- **Frontend:** OA config/contact/link/unlink UI in Traditional Chinese; push/broadcast hidden unless D13 explicitly includes it.
- **Tests:** signature tamper, duplicate webhook, channel mismatch, follow/unfollow, link/unlink retry, cross-Club denial, identity unbind leaves OA intact and vice versa.
- **Acceptance:** OA portions of Gate 5 (`V12_PRODUCT_ARCHITECTURE_ROADMAP.md:451-469`).
- **Rollback:** disable webhook/flag and restore old webhook URL only after approval; preserve contacts/events.
- **Not included:** rich menu/broadcast/push unless separately approved; LINE Login changes.

### PR-08 `v12-audit-security`

- **Purpose:** immutable audit skeleton, controlled payload redaction and consistent security event coverage.
- **Dependencies:** PR-02-07 action taxonomy; PR-04 policies; D14.
- **Files:** `*_v12_audit_security.sql`, audit schema docs/dictionary, SQL security tests, retention/redaction runbook.
- **Migration / functions:** `write_audit_event`, `redact_audit_payload`; append-only grants/triggers; actor role snapshot.
- **RLS:** scoped skeleton read; narrower payload read; no ordinary update/delete; only redaction function can change payload and emits a new event.
- **Edge:** provider/API calls pass sanitized context; never token/secret/raw credentials.
- **Frontend:** typed audit read model only; redaction admin UI remains deferred.
- **Tests:** deny mutation, role snapshot after revoke, redaction provenance/reason/policy version, payload authorization, login/channel attribution, sensitive-field scan.
- **Acceptance:** Gate 6 (`V12_PRODUCT_ARCHITECTURE_ROADMAP.md:493-499`).
- **Rollback:** stop affected writers before function rollback; skeleton stays immutable. Restore snapshot rather than deleting audit rows.
- **Not included:** redaction management UI, final retention execution on real data.

### PR-09 `v12-legacy-mapping`

- **Purpose:** convert planning inventories into executable, reviewed mapping and conflict rules.
- **Dependencies:** PR-01-08 stable target contracts; D05/D07/D09/D11/D12/D14.
- **Files:** `database/v12/mapping/legacy_to_v12_mapping.yaml`, extract/transform validators, schema fixtures, updated inventory docs, reconciliation query specs.
- **Migration / functions:** no production migration; pure transform/read-only extract tools. All 25 tables and 42 functions classified.
- **RLS / Edge / frontend:** no policy/provider/UI changes.
- **Tests:** mapping schema validation, 25/25 + 42/42 completeness, synthetic conflicts, no plaintext token/secret/auth dump, deterministic transform output.
- **Acceptance:** every source column has target/drop/defer/conflict disposition and owner; role/channel/Auth/audit ambiguity cannot silently pass.
- **Rollback:** remove mapping artifacts; no databases changed.
- **Not included:** loading data, remote extract, conflict resolution decisions.

### PR-10 `v12-shadow-migration`

- **Purpose:** idempotent extract/transform/load and reconciliation against isolated synthetic/approved snapshots.
- **Dependencies:** PR-09; all mapping decisions for chosen dataset; explicit data-access authorization.
- **Files:** `database/v12/shadow/{extract,transform,load,reconcile}/`, runbook, fixtures, reports schema, CI-safe synthetic job.
- **Migration / functions:** load procedures use V1.2 constraints/transactions; no legacy rename or mutation.
- **RLS:** loader uses isolated controlled role; post-load tests run as real roles through RLS.
- **Edge / frontend:** none.
- **Tests:** crash/retry, duplicate run, row-count and FK reconciliation, conflicts, Auth/identity/channel mismatch, two full successful shadow runs, log secret/PII scan.
- **Acceptance:** Gate 7 (`V12_PRODUCT_ARCHITECTURE_ROADMAP.md:539-546`); zero unexplained count delta/orphan FK.
- **Rollback:** drop/recreate only isolated V1.2 target; source is read-only. Never run against production without PR-12 approval.
- **Not included:** traffic, final migration, manual conflict decisions.

### PR-11 `v12-frontend-cutover`

- **Purpose:** switch V0.3 pages/actions/routes to typed V1.2 contracts and complete E2E UX.
- **Dependencies:** PR-02-08 APIs/RLS; PR-10 reconciliation; D15/D16/D20.
- **Files:** generated Database Types, typed API client/error map, `src/lib/auth.ts`, Supabase wrappers, `src/app/actions.ts`, API routes, all dependency pages listed in `V12_FRONTEND_DEPENDENCIES.md`, Playwright/E2E fixtures.
- **Migration / functions / RLS:** no new foundation changes; only narrowly reviewed fixes with matching SQL tests. Schema drift regenerates types.
- **Edge:** call PR-02/05/06/07 endpoints; no direct service client in pages/actions.
- **Frontend:** Traditional Chinese Loading/Empty/Error/Permission/Membership states; secretary create/search/filter/import/export/invite; member accept/confirm; identity/session; OA link; audit; responsive UI.
- **Tests:** full invitation-first journey, multiple memberships, resend/resume onboarding, locked/suspended, identity unbind/rebind, session revoke, Club isolation, LINE Login/OA separation, import/export permission, six representative viewport checks.
- **Acceptance:** Gate 8 (`V12_PRODUCT_ARCHITECTURE_ROADMAP.md:568-589`), lint/typecheck/unit/build, no manual V1.2 result casts, no V0.3 RPC literal in V1.2 client path.
- **Rollback:** environment/feature flag returns all traffic to V0.3 read path; no dual-write. V1.2 data remains for reconciliation.
- **Not included:** activities/announcements/IOU/AI, deferred admin UIs, production switch.

### PR-12 `v12-release-candidate`

- **Purpose:** stage, rehearse, verify and document cutover/rollback; no automatic production release.
- **Dependencies:** PR-01-11 green; D17/D18; security/data owner approval.
- **Files:** staging/cutover/rollback runbooks, final verification manifest, monitoring/alerts, support procedures, migration/reconciliation evidence, release checklist.
- **Migration / functions / RLS:** frozen checksums and reviewed apply order; final permission diff and grants inventory.
- **Edge / frontend:** pinned deploy artifacts; callback/webhook/feature-flag switch plan.
- **Tests:** approved staging reset/migration, full E2E, load/concurrency, security/RLS, secret scan/rotation drill, backup/restore, final shadow/incremental reconciliation, smoke and rollback rehearsal.
- **Acceptance:** Gate 9 prerequisites and no open severity-1/2 security/data issue (`V12_PRODUCT_ARCHITECTURE_ROADMAP.md:599-633`). Production requires separate explicit approval.
- **Rollback:** documented V0.3 read-only fallback, trigger thresholds, owners and maximum decision time; restore data only from verified backup/reconciliation plan.
- **Not included:** automatic merge, Ready-for-review change, production deploy, formal traffic switch without human authorization.

## 7. Cross-PR verification contract

Every PR records commands and actual results, changed/unmodified files, migration/API/RLS impact, risks and rollback (`V12_PRODUCT_ARCHITECTURE_ROADMAP.md:666-684`). Minimum local gates:

```text
npm run check:migrations
npm run lint
npm run typecheck
npm test
npm run build
npm run db:v12:verify
```

PR-specific SQL/Edge/E2E suites are additive. CI must fail if legacy migration checksum changes, V1.2 type generation drifts, any RLS table lacks an explicit operation decision, mapping count is not 25/42, or logs/artifacts contain secret/token fixtures.

## 8. Top blockers and risk controls

1. **No legacy RLS policies:** 25 tables are fail-closed through grants/RPC only; PR-04 is a complete new design, not a port.
2. **Service-role multi-table auth flows:** `src/app/api/auth/line/callback/route.ts:20-94` and OA webhook `:9-29` bypass RLS and lack single DB transactions; replace only after transaction helpers exist.
3. **Token contract mismatch:** V0.3 returns plaintext token into redirect query (`src/app/actions.ts:133-146`) and hashes in DB; V1.2 requires Edge-only HMAC.
4. **Three legacy authorization models:** platform roles, operator permissions, and club roles need approved mapping before any shadow load.
5. **No generated types / no Edge baseline / no V1.2 CI:** current frontend casts JSON and CI omits the V1.2 database; PR-01/04/11 must close these in order.

Additional risks: district data absent in V0.3; Auth/LINE channel identity conflicts; preference/push/webhook tables missing from foundation; first human admin bootstrap is deliberately not automatic; Draft PR #7 relationship is unknown and untouched.

## 9. Definition of planning completion

- Migration, 25-table, 42-function, 25-table RLS, frontend/Auth/LINE dependencies are enumerated in repository documents.
- Two isolation options are evaluated and a full-stack-safe option is recommended, pending D01.
- All 12 PRs have purpose, dependency, concrete paths, migration/function/RLS/Edge/frontend scope, tests, acceptance, rollback and exclusions.
- Product/security/data decisions are explicit in `V12_DECISIONS_REQUIRED.md` rather than silently assumed.
- No claim is made that implementation, remote staging, production data migration, or Draft PR creation is complete.

## 10. Planning-pass verification record (2026-07-22)

- Static source and local catalog agree: 4 legacy migrations, 25 tables, 42 distinct functions, 25 RLS-enabled tables, 0 policies.
- Document completeness checks: 25 table mappings, 25 schema inventory rows, 42 RPC disposition rows, 42 exact signature rows, 25 legacy RLS rows, 31 planned V1.2 RLS rows, 12 PR sections, 20 human decisions.
- Frontend search confirms 32 direct Supabase dependency files, 34 literal called RPC names, 0 Edge Functions and 0 generated Database Types.
- Existing safe Option A flow was executed locally: `npm run db:v12:verify` rebuilt only `rotary_platform_v12_test`, reran idempotent seed, passed 11 files / 97 pgTAP tests, all three verification SQL files, and Supabase DB lint with no schema errors.
- Current path/line citations across V1.2 documents were machine-checked against files and line counts.
- V1.2 independent-workdir Option B, RLS, transaction functions, Edge Functions, generated types, frontend E2E, shadow migration, staging and production remain future PR work; the successful foundation check does not verify them.
