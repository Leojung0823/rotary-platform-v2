# PR-03 FORMAL SPECIFICATION — REVISION 10.7

## Callback Recovery Lifecycle and Lock-Order Closure Edition

## Specification Status

Planning document: READY FOR INTERMEDIATE ARCHITECTURE REVIEW
Runtime implementation: BLOCKED
Ninth independent review: REQUEST CHANGES
Revision 10.6 intermediate architecture review: ARCHITECTURE REVISION REQUIRED
Revision 10.7 review status: NOT YET REVIEWED
Formal specification approval requested: No
Human/legal approval represented: No
Repository validation status: NOT VERIFIED IN THIS SPECIFICATION RUN

Revision 10.7 closes the Callback recovery lifecycle and Terminal Callback lock-order blockers identified during the prior Intermediate Architecture Review. It does not implement the acknowledgment endpoint or cleanup jobs, perform Revision 11 HTTP-header, CORS, exact-byte, fixture, package, manifest, ZIP, sidecar, or governance finalization, or authorize Runtime implementation.

# DOCUMENT PURPOSE, AUTHORITY, AND SCOPE

## Purpose

Revision 10.7 preserves all earlier converged architecture and adds:

1. server-authoritative `container_auth_epoch`;
2. continuation binding to one exact container epoch;
3. a successful Callback dual-epoch commit that binds the committed epoch, family, logical session, immutable outcome, and cookie capability;
4. an authoritative durable `recovery_pending` → `acknowledged` or `recovery_expired` lifecycle;
5. a bounded, non-sliding sealed-material deadline and idempotent Callback delivery acknowledgment architecture;
6. authoritative lazy expiry and same-transaction sealed-material destruction;
7. Account-Switch and logout blocker classification based only on active, unexpired `recovery_pending` terminal recovery;
8. one Terminal Callback reissue lock order compatible with acknowledgment, provider refresh, logout, Account Switch, forced termination, and Consume;
9. Tests 304–308 and synchronized architecture remediation.

## Preserved architecture

- OAuth state and PKCE verifier are persisted before top-level navigation.
- Callback recovery is continuation-based and zero callback operation maps to Auth Restart Required.
- Provider network I/O is not locally ACID and never holds a logout guard.
- Existing-session cookie-capability reissue and provider refresh serialize through the authenticated logout guard.
- Raw BFF cookie capability bytes are never stored in general plaintext database columns; bounded server-protected sealed reissue material is permitted only for terminal Callback response-loss recovery.
- Browser requests cannot select forced-security logout or any guard identity.
- Exact Exchange tuple recovery precedes new-flow capacity allocation.
- Exchange tuple advisory lock precedes Invitation semantics.
- Invitation-generation lifecycle locks are revalidated after acquisition and before mutation.
- Handoff advisory locks cover the complete Handoff lifecycle.
- Unknown Consume commit never deletes the raw Idempotency-Key through a local timer.
- Reconciliation performs complete post-lock authoritative reread.
- Runtime implementation remains `BLOCKED`.

## Excluded

- Runtime, SQL, migration, RPC, Edge, or UI implementation.
- A new PR or implementation branch.
- Runtime acknowledgment endpoint, cleanup-job, SQL, migration, RPC, Edge Function, UI, workflow, or schema implementation.
- Revision 11 response headers, CORS, exact response bytes, fixture packaging, manifest, ZIP, sidecars, and governance closure.

# DOMAIN DEFINITIONS

| Term | Architecture definition |
|---|---|
| Flow container | Server-side container for related PR-03 flows and authentication-transition state. |
| `container_auth_epoch` | Monotonic unsigned server counter invalidating continuations created before a container authentication transition. |
| Continuation bound epoch | Exact `container_auth_epoch` copied into the server continuation at creation. |
| `pre_attach_container_auth_epoch` | Epoch `E` that authorized the successful first logical-session mutation before the family was attached. |
| `committed_container_auth_epoch` | Epoch `E + 1` atomically persisted with the successful first logical-session commit and required for terminal Callback recovery. |
| Committed Callback binding | Immutable tuple of committed container epoch, session family, logical session, outcome reference, Callback operation, and cookie-capability version. |
| `callback_recovery_state` | Durable lifecycle state, separate from Callback operation state, with values `recovery_pending`, `acknowledged`, or `recovery_expired`. |
| `recovery_pending` | The session is committed but durable browser receipt is not proved; exact same-cookie recovery remains possible only before the authoritative deadline. |
| `acknowledged` | A valid idempotent browser delivery acknowledgment committed and the sealed reissue material was destroyed in the same transaction. |
| `recovery_expired` | Authoritative database time reached the non-sliding deadline and sealed material was destroyed; cookie reissue is permanently prohibited. |
| Cookie reissue material | Server-protected encrypted or sealed material retained only while recovery is pending and before its bounded deadline so the exact committed capability bytes can be reissued. |
| Cookie reissue material deadline | Authoritative, non-sliding server/database deadline no later than every Callback, session, cookie-capability, and container recovery bound. |
| Delivery acknowledgment | Idempotent, same-origin, BFF-session-authenticated confirmation sent only after the browser accepts the committed cookie and persists required non-secret completion state. |
| Container auth-transition guard | Transaction advisory lock derived from trusted flow-container UUID and a fixed domain/version prefix. |
| Authenticated logout guard | Guard derived from trusted session-family UUID + flow-container UUID. |
| Pre-auth callback guard | Guard derived from server-only pre-auth subject UUID + flow-container UUID. |
| Container auth transition | First-login provider start/commit, voluntary logout, forced logout, account-switch initiation, first family attach, family detach, or family replacement. |
| Existing-session capability transition | Cookie reissue or provider refresh that does not change the container-to-family binding. |
| Pre-commit mutation authorization | Authorization for Callback states before `session_committed`; it requires the bound epoch to equal the current epoch. |
| Post-commit terminal recovery | Non-mutating replay of an immutable committed Callback outcome and exact same cookie capability, authorized by the committed epoch/family/session tuple. |
| Blocking callback state | `provider_exchange_started`, `provider_exchange_succeeded`, `session_commit_started`, `unknown_provider_outcome`, nonterminal `response_unknown`, or `session_committed` with valid current epoch/family/session and active unexpired `recovery_pending`. |
| Blocking Consume state | `operation_bound` with unresolved result, unknown Consume commit, or pending idempotent recovery requiring the current actor/session. |
| Account-Switch transition | Durable opaque, unique, container- and epoch-bound record that makes post-termination continuation creation retry-safe. |
| Epoch mismatch | Continuation bound epoch differs from current authoritative `container_auth_epoch`. |
| Auth Restart Required | Generic fail-closed result requiring a new continuation and prohibiting provider/session continuation. |

# FIXED ARCHITECTURAL PRINCIPLES

1. A first-login continuation is valid for mutation only at the exact container epoch at creation.
2. Every path that reads or mutates `container_auth_epoch` acquires `container_auth_transition_guard` first.
3. Voluntary logout, forced security logout, administrative termination, and a successful Account-Switch Phase A increment the epoch atomically.
4. Account Switch must authoritatively prove that no blocking Callback or Consume work exists before it increments the epoch, revokes the family, or invalidates recovery material.
5. Session-family attach, detach, or replacement increments the epoch unless the same declared transition already increments it in the same transaction.
6. The first successful logical-session commit advances `E` to `E + 1` exactly once and atomically binds both epochs, the family, logical session, outcome, and cookie capability.
7. First-login provider start and first logical-session commit both acquire the container guard and revalidate the bound epoch.
8. Container transition guard precedes authenticated logout, pre-auth callback, Callback-operation, Handoff, session-family, and row locks.
9. Terminal Callback recovery, acknowledgment, provider refresh, logout, Account Switch, and forced termination use compatible container-first and authenticated-logout-guard prefixes; no narrower lock may be acquired before either required prefix guard.
10. Provider network I/O holds neither container nor logout guard and is not part of a local ACID database transaction.
11. A provider result produced for a stale epoch cannot create a logical session or usable cookie.
12. Callback operation state and Callback recovery state are separate durable state machines.
13. The first successful session commit sets `session_committed` and `recovery_pending`, persists the non-sliding authoritative reissue deadline, and stores protected sealed material atomically.
14. Callback replay after `session_committed` is authorized by the committed epoch/family/session/outcome tuple, active `recovery_pending`, unexpired deadline, and valid sealed material.
15. Successful Callback replay reissues the exact same committed cookie capability bytes and creates no new capability, family, session, provider call, outcome, epoch increment, or deadline extension.
16. A valid acknowledgment transitions `recovery_pending` to `acknowledged` atomically and idempotently while destroying sealed material; authoritative expiry transitions it to `recovery_expired` and destroys material.
17. Neither terminal recovery state may return to `recovery_pending`, and neither may reissue the authentication cookie.
18. Account Switch blocks a committed Callback only while its recovery is pending, unexpired, material-backed, and still bound to the current committed epoch/family/session.
19. Ordinary logout uses the same classification; the proposed user-requested blocking policy remains human-approval-required before Runtime implementation.
20. Forced security termination may override pending recovery only under a separately approved incident policy; no such approval is represented here.
21. Any later epoch advancement invalidates old Callback cookie reissue and cannot restore or reattach the old family.
22. Logout makes its final blocking-work decision while holding the container guard and authenticated logout guard.
23. A created-but-not-started first-login callback does not block logout; the epoch increment invalidates it.
24. A first-login callback that commits `provider_exchange_started` first blocks voluntary logout until classified or expired.
25. Account-Switch continuation creation occurs only after old-family termination commits and is idempotent under one durable transition ID.
26. Browser input cannot supply an epoch, pre-auth subject, session family, guard key, transition ID, committed outcome reference, recovery state, or deadline as authority.
27. Runtime implementation remains `BLOCKED`.

# NORMATIVE DECISION REGISTER

## PR03-D001 — BFF authentication prerequisite

Consume and actor-bound Reconciliation require a valid dedicated-origin BFF Auth session. Session failure is classified before Invitation semantic lookup.

## PR03-D002 — Server-side actor authority

Only the server-side logical BFF session supplies the trusted actor. Browser bodies, headers, descriptors, callback references, guard identifiers, or provider tokens cannot select the actor.

## PR03-D003 — Exact Account create or reuse

Account create/reuse is limited to the exact verified live human Account relationship for the authenticated actor.

## PR03-D004 — Invitation target authority

The authoritative Invitation relationship identifies the Person and Membership candidate; browser input cannot replace either identity.

## PR03-D005 — Person merge prohibited

PR-03 never automatically merges Persons or repairs identity ownership.

## PR03-D006 — Existing Person and Membership only

The target Person and Membership must already exist.

## PR03-D007 — Membership eligibility

Membership, Club, Person, and Invitation relationships are revalidated after authoritative synchronization.

## PR03-D008 — Opaque-session-bound Idempotency-Key

The browser binds the raw Idempotency-Key to the opaque actor-session binding ID. Unknown commit preserves the key until a server-classified terminal/capability result, specified same-family recovery, forced security loss, actor/family change, or natural tab loss.

## PR03-D009 — Different key after terminal success

A different key or operation cannot create another acceptance mutation after terminal success.

## PR03-D010 — Different actor replay

A different actor or session family cannot rebind callback, Handoff operation, raw key, or durable success.

## PR03-D011 — No operator acceptance route

PR-03 adds no operator, Executive Secretary, or administrative acceptance route.

## PR03-D012 — Recipient identity policy

Recipient identity remains governed by the D030 proposal and verified PR-02 authority boundary.

## PR03-D013 — No Auth-user creation

Consume never creates an Auth user or provider identity.

## PR03-D014 — No external side effect in Consume

Consume never calls OAuth providers or another external system.

## PR03-D015 — Separate mutation and Reconciliation controls

Exchange/Consume mutation and actor-bound read-only Reconciliation remain independently controlled and perform no business, session, mapping, retention, coordination, or capability mutation. Terminal Auth Callback reconciliation is a separate flow that may perform only the recovery lifecycle transitions and exact same-cookie reissue specified here.

## PR03-D016 — Durable acceptance outcome

Success persists an immutable outcome sufficient for exact same-operation recovery.

## PR03-D017 — Recoverable deadlines

Callback, session, selector, container, operation, cookie capability, and recovery-material deadlines have independent server owners. The reissue deadline is authoritative, bounded by their minimum, and non-sliding. Operation coordination cannot outlive browser-recoverable capability. Local timers do not prove completion.

## PR03-D018 — Semantic versus infrastructure classification

Conclusive Invitation semantic failure uses the imported PR-02 boundary. Provider uncertainty, synchronization timeout, storage failure, refresh outage, or unprovable commit uses a generic non-semantic class.

## PR03-D019 — Soft-deleted Account

Soft-deleted Accounts are not silently revived or reused.

## PR03-D020 — Disabled or revoked Auth user

Eligibility is rechecked at login, provider refresh under the container-first authenticated-logout-guard order, before Consume, before actor-bound Reconciliation, and at the bounded session interval.

## PR03-D021 — Live human Account

Only the repository-verified live human Account class qualifies.

## PR03-D022 — Account type and status validation

Exact allowed Account type/status values remain repository-validation blockers.

## PR03-D023 — Membership relationship validation

The exact target Membership relationship remains eligible after locks and rereads.

## PR03-D024 — Other Membership isolation

Other Club Memberships are not modified or merged.

## PR03-D025 — Post-lock Reconciliation authority

Pre-lock lookup may provide only a candidate Handoff UUID. Flow, mapping, generation, session, actor, operation, deadline, terminal projection, and outcome are reread after the Handoff advisory lock.

## PR03-D026 — Callback and BFF recovery closure

OAuth continuation is persistent, callback recovery is continuation-based, cookie capabilities are digest-backed, and existing-session versus first-login guard identities are explicit. A successful first-login Callback persists the committed dual-epoch/family/session/outcome tuple and starts an authoritative `recovery_pending` lifecycle; same-cookie reissue ends permanently on acknowledgment, expiry, or later auth transition.

## PR03-D027 — No client abandonment

No operation-abandonment endpoint exists. Account Switch and the proposed ordinary-logout policy block only active, unexpired pending recovery or other unresolved work that would lose authoritative recovery. Forced security termination cannot release or rebind server operation coordination and permanently invalidates old Callback cookie reissue under an explicit incident-policy gate.

## PR03-D028 — Response precedence

Imported PR-02 remains semantic fixture authority. Revision 11 finalizes PR-03-owned exact headers and shared response profiles.

## PR03-D029 — Complete synchronization hierarchy

Exchange tuple lock precedes Exchange semantics; Invitation-generation lifecycle locks stabilize generation membership; Handoff locks protect each Handoff lifecycle; the container auth-transition guard is first for every epoch reader or mutator. Terminal Callback recovery then acquires authenticated logout guard, Callback guard, logical session/family rows, and recovery material in that single order; provider refresh and auth transitions use compatible prefixes.

## PR03-D030 — Invitation bearer authority

Invitation bearer authority remains proposed, approval-required, and Runtime-blocking.

# CONTAINER AUTH EPOCH MODEL

## Storage

Each server flow container stores:

```text
container_auth_epoch: uint64
container_auth_transition_state: stable | logout_pending | account_switch_pending | forced_termination_pending
attached_session_family_id: UUID | null
active_account_switch_transition_id: UUID | null
```

Epoch overflow is a fail-closed invariant violation; wraparound is prohibited.

## Continuation creation

Under the container auth-transition guard, continuation creation persists:

```text
flow_container_id
bound_container_auth_epoch
guard_mode
existing_session_family_id | null
pre_auth_guard_subject_id | null
```

Browser input cannot override these fields.

For a Callback operation that reaches its first successful logical-session commit, the same local database transaction additionally persists:

```text
pre_attach_container_auth_epoch = E
committed_container_auth_epoch = E + 1
committed_session_family_id
committed_logical_session_id
committed_outcome_reference
callback_operation_state = session_committed
callback_recovery_state = recovery_pending
cookie_reissue_material_expires_at
delivery_acknowledged_at = null
recovery_expired_at = null
recovery_state_version
committed_cookie_capability_version
committed_cookie_reissue_material_reference
```

The two epoch fields have different authority. The pre-attach epoch proves mutation authorization before the commit. The committed epoch proves whether terminal response-loss recovery is still authorized after the commit.

## Authoritative recovery deadline

The first successful session commit calculates and persists:

```text
cookie_reissue_material_expires_at
<=
min(
  callback_operation_deadline,
  logical_session_expiry,
  cookie_capability_server_expiry,
  container_recovery_deadline
)
```

Every comparison uses authoritative server/database time. The deadline is non-sliding: Callback replay, reconciliation, acknowledgment, retry, or cleanup cannot extend or replace it.

## Epoch increment events

Increment exactly once in the transaction that commits:

- successful voluntary logout;
- forced security logout or authorized administrative termination;
- Account-Switch Phase A only after the authoritative no-blocker reread;
- session-family attach, detach, or replacement occurring outside a transition that already incremented the epoch.

The first successful logical-session commit increments `E` to `E + 1` once for first-family attachment. Callback replay never increments it again.

For Account Switch, establishing transaction-local `account_switch_pending` is not an increment event. If any blocker exists, the transaction rolls back with the epoch and all pre-switch state unchanged. When no blocker exists, Phase A advances the epoch once and detaches/revokes the old family in the same transaction; Phase B never increments it.

## Later epoch invalidation

If a later authorized transition makes `current_container_auth_epoch > committed_container_auth_epoch`, the older Callback operation becomes non-authorizing. It cannot reissue its cookie, restore or reattach the old family, lower the epoch, call the provider, create a family or logical session, or create a replacement family. Its immutable historical outcome may remain only as a non-authorizing record where the future public contract permits. The public result fails closed through the applicable generic authentication/session or flow-capability response and never exposes Invitation semantics.

# GLOBAL AUTH GUARD AND LOCK ORDER

Invariant: every path that reads or mutates `container_auth_epoch` acquires `container_auth_transition_guard` first. No path may acquire a Callback-operation, Handoff, Auth/logout, termination, or session-family lock and then attempt to acquire the container guard.

| Path | Required lock order |
|---|---|
| Callback first session commit | container auth-transition guard → pre-auth Callback guard → Callback operation guard → logical session/family rows → recovery material |
| Terminal Callback reconciliation/reissue | container auth-transition guard → authenticated logout guard → Callback operation guard → logical session/family rows → recovery material |
| Callback acknowledgment | container auth-transition guard → authenticated logout guard → Callback operation guard → logical session/family rows → recovery material |
| Provider refresh | container auth-transition guard → authenticated logout guard → logical session/family rows |
| Logout | container auth-transition guard → authenticated logout guard → Callback/Handoff blockers in stable order → logical session/family rows |
| Account Switch | container auth-transition guard → authenticated logout/account-switch guard → Callback guards → Handoff locks → session-family rows |
| Forced termination | container auth-transition guard → termination/logout-compatible guard → Callback/Handoff blockers → session-family rows |
| Consume | container auth-transition guard → Handoff advisory lock → canonical business rows |

Rules:

- Multiple Callback rows are acquired by stable primary key; multiple Handoff rows are acquired by stable lock key using deterministic unsigned ordering and stable tie-breaks.
- The final blocker reread and any epoch increment occur while the same container guard remains held.
- A concurrent Consume or Callback path acquires that same container guard before creating new blocking work, so no blocker can appear between the final reread and epoch advancement.
- No path may acquire `callback_operation_guard` and then `authenticated_logout_guard`.
- No path may acquire a logical-session/session-family lock and then `authenticated_logout_guard`.
- No path may acquire a Handoff lock and then `container_auth_transition_guard`.
- Terminal Callback recovery holds the authenticated logout guard through epoch/family/session validation, expiry classification, sealed-material validation, stored-outcome lookup, and any same-cookie reissue decision.
- Lock timeout maps to a generic non-semantic service class.

# CALLBACK OPERATION STATE MACHINE

Normative Callback operation states are:

| State | Meaning and authorization |
|---|---|
| `created` | No provider side effect has started; pre-commit mutation authorization applies. |
| `provider_exchange_started` | External provider exchange may be in flight; pre-commit mutation authorization and blocker rules apply. |
| `provider_exchange_succeeded` | Protected provider success is stored; no local session is yet committed. |
| `session_commit_started` | Local session transaction may be in flight; no cookie may be inferred or emitted before commit. |
| `unknown_provider_outcome` | Provider outcome is uncertain and blocks destructive auth transitions until classified or expired. |
| `session_committed` | The immutable committed epoch/family/session/outcome tuple exists; only post-commit terminal recovery is permitted. |
| `response_unknown` | HTTP delivery is unknown. Authorization depends on the underlying nonterminal or `session_committed` operation state. |
| `terminal_failure` | Classified terminal failure; no authenticated cookie may be issued. |

For `created`, `provider_exchange_started`, `provider_exchange_succeeded`, `session_commit_started`, and `unknown_provider_outcome`, mutation authorization requires:

```text
bound_container_auth_epoch = current_container_auth_epoch
```

No uncommitted state may infer, issue, or reissue an authenticated session cookie. The OAuth provider authorization-code exchange is an external side effect and is never described as part of the local ACID database transaction.

# CALLBACK RECOVERY LIFECYCLE

Callback recovery uses a durable state machine separate from `callback_operation_state`. Every committed recovery record contains:

```text
callback_recovery_state:
  recovery_pending | acknowledged | recovery_expired
cookie_reissue_material_expires_at
delivery_acknowledged_at: timestamp | null
recovery_expired_at: timestamp | null
recovery_state_version
committed_cookie_capability_version
committed_cookie_reissue_material_reference
```

Recovery-state updates use authoritative database time, the single Terminal Callback guard order, compare-and-set or equivalent row-version enforcement, and one atomic transaction. The only forward transitions are:

```text
recovery_pending → acknowledged
recovery_pending → recovery_expired
```

No state may return from `acknowledged` or `recovery_expired` to `recovery_pending`.

## recovery_pending

`recovery_pending` means the successful local session commit and immutable classified outcome exist, but the server cannot prove that the browser durably received and retained the result. Protected sealed material remains usable only before its authoritative deadline.

Exact Terminal Callback reconciliation may return the stored outcome and reissue the same committed cookie-capability bytes only when all are true:

- current container epoch equals committed container epoch;
- attached family equals committed family;
- committed logical session remains valid and belongs to that family;
- committed outcome reference matches;
- authoritative database time is strictly before `cookie_reissue_material_expires_at`;
- sealed reissue material remains present, valid, and version-bound;
- all required guards are held.

Account Switch, the proposed ordinary user-requested logout policy, and ordinary user-requested family replacement treat this state as blocking while these conditions remain valid. Forced security termination may override it only through the explicit incident-policy gate described below.

## acknowledged

`acknowledged` means the browser completed the specified persistence step and the server committed a valid idempotent acknowledgment. `delivery_acknowledged_at` is set once, and sealed reissue material is destroyed or cryptographically rendered unusable in the same transaction.

Terminal Callback recovery may return only the non-authorizing stored classified result where retention policy permits. It cannot reissue the authentication cookie, and Account Switch or logout does not treat this record as a Callback recovery blocker.

The transition `recovery_pending → acknowledged` is atomic, monotonic, and idempotent. No acknowledgment can restore pending recovery.

## recovery_expired

`recovery_expired` means authoritative database time reached or passed `cookie_reissue_material_expires_at`. The transition sets `recovery_expired_at` and destroys or cryptographically renders sealed reissue material unusable in the same transaction.

Callback recovery cannot reissue the cookie, Account Switch or logout no longer treats this record as a Callback recovery blocker, and the historical outcome remains non-authorizing where retention policy permits.

The transition `recovery_pending → recovery_expired` is atomic and monotonic. It cannot extend the deadline or restore pending recovery.

# FIRST-LOGIN PROVIDER-START ALGORITHM

For `created → provider_exchange_started` with no existing session family:

1. resolve trusted container and continuation;
2. acquire container auth-transition guard;
3. acquire pre-auth callback guard;
4. acquire callback-operation synchronization;
5. reread current epoch, transition state, attached family, bound epoch, and callback state;
6. require bound epoch equals current epoch;
7. require no attached family and no conflicting transition state;
8. atomically commit `provider_exchange_started`;
9. release guards;
10. call provider.

If logout/account switch commits first, epoch mismatch returns Auth Restart Required with no provider call. If provider start commits first, voluntary logout later observes a blocking callback and returns Logout Recovery Required.

# FIRST LOGICAL-SESSION COMMIT ALGORITHM

After provider success, let the continuation-bound and current epoch both be `E`. In one local database transaction:

1. acquire `container_auth_transition_guard`;
2. acquire the pre-auth callback guard;
3. acquire callback-operation/session-commit synchronization;
4. verify `bound_container_auth_epoch = current_container_auth_epoch = E`;
5. reread transition state, attached family, callback operation, and provider-result classification;
6. require no attached family and no conflicting transition state;
7. create or finalize exactly one logical session family;
8. create or finalize exactly one logical session;
9. attach that family to the container;
10. create the actor-session binding ID;
11. create the cookie-capability digest;
12. persist server-protected encrypted or sealed cookie reissue material;
13. calculate with authoritative database time and persist the bounded, non-sliding `cookie_reissue_material_expires_at`;
14. persist `pre_attach_container_auth_epoch = E`;
15. advance `container_auth_epoch` exactly once to `E + 1`;
16. persist `committed_container_auth_epoch = E + 1`;
17. persist `committed_session_family_id`, `committed_logical_session_id`, and the immutable `committed_outcome_reference`;
18. persist `committed_cookie_capability_version` and `committed_cookie_reissue_material_reference`;
19. set `callback_operation_state = session_committed`;
20. set `callback_recovery_state = recovery_pending`;
21. persist `delivery_acknowledged_at = null`, `recovery_expired_at = null`, and the initial `recovery_state_version`;
22. commit all local state atomically;
23. issue `Set-Cookie` only after the local commit succeeds.

The immutable outcome reference resolves to the stored classified result. The continuation remains bound to its pre-attach epoch and cannot authorize another mutation or family. The committed epoch authorizes only bounded terminal recovery of this exact committed result while the separate recovery state remains pending and the authoritative deadline is unexpired.

If provider succeeded but the epoch changed before local commit, no family, session, binding, digest, reissue material, or cookie is created; protected provider result is revoked when reliably supported or discarded to expire; public result is Auth Restart Required.

# BFF AUTH SESSION STATE MACHINE

| State | Authoritative behavior |
|---|---|
| Pre-auth container | No family is attached. Continuations may mutate only when their bound epoch equals the current epoch. |
| Provider exchange pending | External outcome may be uncertain. No local authenticated cookie exists and destructive auth transitions obey blocker rules. |
| Session commit pending | The local commit has not completed. No response or browser state may imply authentication. |
| Attached committed family | Exactly one committed family and logical session are attached at the committed epoch. |
| Committed recovery pending | The family is attached, initial delivery is not durably proved, and exact same-cookie recovery is available only while recovery is pending and unexpired. |
| Delivery acknowledged | The committed result was acknowledged idempotently; sealed material is destroyed and the stored result is non-authorizing. |
| Recovery expired | The authoritative deadline was reached; sealed material is destroyed and the stored result is non-authorizing. |
| Logout or termination pending | New blocker creation is fenced by the container guard; the final authoritative reread decides the transition. |
| Revoked or replaced | The epoch is later than the old committed epoch or the family is no longer attached. Old Callback reissue is permanently prohibited. |

No browser-observed state transition overrides the authoritative container, family, Callback, or logical-session rows.

# SESSION FAMILY ATTACHMENT

The first successful attachment occurs only inside the First Logical-Session Commit transaction. That transaction attaches exactly one `committed_session_family_id`, advances the epoch once, and binds one `committed_logical_session_id`. A replay may neither attach a different family nor create a same-family successor logical session.

Detach, replacement, logout, Account Switch, forced termination, or security revocation acquires the container guard first and invalidates the prior family/capability authorization. No later transition may decrement the epoch or restore an earlier attachment.

# TERMINAL CALLBACK RECOVERY

## Callback Reconciliation

### Pre-commit authorization path

For every state before `session_committed`, including `created`, `provider_exchange_started`, `provider_exchange_succeeded`, `session_commit_started`, and `unknown_provider_outcome`, Callback Reconciliation may coordinate or classify only when the continuation-bound epoch equals the current container epoch. It cannot infer a session cookie, manufacture a committed outcome, or treat an external provider exchange as locally committed.

### Post-commit terminal recovery path

When `callback_operation_state = session_committed`, recovery no longer relies only on the original bound epoch. It uses this single order:

```text
container_auth_transition_guard
→ authenticated_logout_guard
→ callback_operation_guard
→ logical_session/session_family synchronization
→ recovery/material rows
```

The authenticated logout guard is the same guard used by provider refresh, logout, and existing-session capability maintenance. It remains held through epoch/family/session validation, expiry classification, sealed-material validation, stored-outcome lookup, and any permitted same-cookie reissue decision.

After acquiring those guards, Terminal Callback recovery rereads the operation state, recovery state and version, both epochs, attached and committed family, committed logical session, outcome reference, authoritative database time, deadline, cookie-capability version, and sealed-material validity.

If recovery is pending and database time is at or after the deadline, the same guarded transaction first transitions it to `recovery_expired`, sets `recovery_expired_at`, and destroys or invalidates sealed material. Reconciliation then continues only with the resulting non-authorizing state.

Cookie reissue is permitted only when all of the following are true:

1. `current_container_auth_epoch = committed_container_auth_epoch`;
2. the currently attached session family equals `committed_session_family_id`;
3. `committed_logical_session_id` belongs to that family;
4. continuation, Callback operation, container, selector, and committed outcome remain bound consistently;
5. `committed_outcome_reference` exists and resolves to the immutable stored classified outcome;
6. `callback_recovery_state = recovery_pending`;
7. authoritative database time is strictly before `cookie_reissue_material_expires_at`;
8. committed-version sealed material exists and remains valid;
9. the committed logical session remains valid;
10. no later logout, Account Switch, forced termination, security revocation, or session-family replacement has occurred.

When all conditions pass, Callback Reconciliation may only replay the immutable stored classified outcome and reissue the exact same committed cookie capability for the same logical session and family. It must not call the provider again, create another family or logical session, increment the epoch, alter the outcome, attach another family, create a same-family successor session, or extend the deadline.

When recovery is `acknowledged` or `recovery_expired`, it may return only a non-authorizing historical classified result where retention policy permits and cannot reissue the cookie. If any authorization condition fails, recovery fails closed using the applicable generic authentication/session or flow-capability result without revealing Invitation semantics.

# CALLBACK CAPABILITY REISSUE

## Sealed Reissue Material Lifecycle

### Exact cookie-capability reissue rule

Callback recovery reissues the same committed cookie capability bytes. It does not rotate to a new capability during Callback replay.

To support response-loss recovery:

- raw cookie capability bytes are absent from general plaintext database columns;
- server-protected encrypted or sealed reissue material is retained only while recovery is pending and authoritative database time is before its bounded deadline;
- the material is cryptographically and structurally bound to `committed_container_auth_epoch`, `committed_session_family_id`, `committed_logical_session_id`, `committed_outcome_reference`, Callback operation ID, cookie capability version, and container;
- reissue material is never returned in JSON, logged, traced, audited, or used as a metric label;
- it cannot authorize a different session, family, Callback, or container;
- acknowledgment destroys or renders it unusable atomically with `recovery_pending → acknowledged`;
- authoritative expiry destroys or renders it unusable atomically with `recovery_pending → recovery_expired`;
- logout, Account Switch, forced termination, security revocation, or session-family replacement destroys or invalidates it when that transition is permitted to commit;
- no replay, reconciliation, acknowledgment, retry, or cleanup action extends the deadline.

Because the same capability is reissued, Callback replay creates no overlapping old/new capability window, no second active capability, and no capability-generation counter increment.

### Later transition prohibition

Once `current_container_auth_epoch > committed_container_auth_epoch`, or the committed family/session is revoked, detached, expired, or replaced, old Callback reconciliation cannot reissue the cookie, restore authorization, lower the epoch, reattach the old family, call the provider, or create a session. Historical outcome storage is non-authorizing only.

# DELIVERY ACKNOWLEDGMENT

This section specifies architecture only; it does not implement an endpoint.

```http
POST /functions/v1/acknowledge-auth-callback-recovery
```

Architecture-level request body:

```json
{
  "callback_operation_reference": "<opaque-reference>",
  "flow_selector": "flw_<22-base64url>"
}
```

Request requirements:

- dedicated acceptance origin only;
- valid BFF Auth session and valid flow-container cookie required;
- exact same-origin `Origin` and Fetch Metadata required;
- unknown or duplicate fields rejected and body size bounded;
- no raw OAuth code, state, PKCE verifier, token, actor UUID, Person, Membership, Account, logical-session ID, or session-family ID accepted;
- Callback operation reference is opaque, scoped, and non-authorizing;
- exact final HTTP bytes and the shared response-header profile remain deferred to Revision 11.

The client sends acknowledgment only after it has received the committed Callback result, received and accepted the committed Auth session cookie, persisted required non-secret local completion state, and verified the expected actor-session descriptor relationship where applicable.

The acknowledgment transaction:

1. acquires `container_auth_transition_guard`;
2. acquires `authenticated_logout_guard`;
3. acquires `callback_operation_guard`;
4. acquires logical-session/session-family synchronization, then recovery/material rows;
5. rereads Callback operation and recovery state/version, committed epoch, current epoch, committed and attached family, logical session, outcome, authoritative database time, deadline, and sealed-material validity;
6. verifies the requesting BFF session is the same committed logical session/family under the current committed epoch;
7. when state is `recovery_pending` and database time is strictly before the deadline, sets `acknowledged`, sets `delivery_acknowledged_at` once, advances `recovery_state_version`, destroys or invalidates sealed material, and commits atomically;
8. when already `acknowledged`, returns the same successful acknowledgment classification without another mutation;
9. when pending but database time is at or after the deadline, atomically applies authoritative expiry instead of acknowledgment;
10. when `recovery_expired`, never recreates material or reissues the cookie;
11. when current epoch/family/session does not match, fails closed before Invitation semantic lookup.

Acknowledgment response loss is safely retryable. A retry never recreates sealed material, restores pending recovery, reissues the Callback cookie, alters the committed outcome, advances the epoch, or creates another session or family.

Concurrent acknowledgment and expiry have one deterministic winner under the same guards and row order. If acknowledgment owns the guards and validates authoritative database time strictly before the deadline, it may commit. At or after the deadline, expiry wins and acknowledgment cannot set `acknowledged`.

# RECOVERY EXPIRY

When a guarded path observes `callback_recovery_state = recovery_pending` and authoritative `database_time >= cookie_reissue_material_expires_at`, it atomically:

1. transitions the state to `recovery_expired`;
2. sets `recovery_expired_at` from authoritative database time;
3. advances `recovery_state_version` exactly once;
4. destroys or cryptographically invalidates sealed reissue material;
5. prohibits all further cookie reissue;
6. commits before returning a classification based on the expired state.

This lazy authoritative transition is available from Terminal Callback reconciliation, delivery acknowledgment, Account-Switch blocker classification, logout blocker classification, forced-termination processing, and governed cleanup processing. Correctness does not depend on browser time, local timers, or scheduled cleanup.

The deadline is non-sliding. No replay, acknowledgment, concurrent retry, reconciliation, or cleanup action extends it. Concurrent acknowledgment and expiry follow the deterministic strictly-before rule in Delivery Acknowledgment.

# CLEANUP

A scheduled cleanup job may additionally process expired records, but this document does not implement one and correctness never depends solely on it. Governed cleanup uses the same container-first stable lock order, obtains recovery/material rows last, rereads authoritative database time and current recovery state, and performs only the idempotent expiry transition or retention deletion already authorized by policy.

Cleanup never recreates sealed material, changes a terminal state back to pending, extends the deadline, reissues a cookie, alters the immutable outcome, advances the container epoch, or logs secret material.

# OBSERVABILITY AND REDACTION

Permitted audit data includes opaque operation/transition references, recovery-state transition names, state version, coarse reason class, server timestamps, lock-path identifier, and success/failure classification. Raw cookie capability bytes, sealed material, encryption inputs, OAuth code/state/PKCE/token values, raw flow selector, raw Idempotency-Key, and secret-bearing headers are never logged, traced, audited, or used as metric labels.

Forced-termination recovery override is auditable by policy identifier and non-secret reason class. This specification records no human or security approval for such a policy.

# RESPONSE-LOSS RECOVERY

An HTTP response may be lost after the local `session_committed`/`recovery_pending` transaction. A subsequent request resolves the same Callback operation, acquires the single Terminal Callback lock order, applies lazy expiry, rereads the committed tuple and recovery state, and applies the post-commit terminal recovery conditions. Before the deadline, successful pending recovery returns the immutable stored outcome and the exact same committed cookie capability bytes. It does not repeat provider exchange or local session mutation.

Response loss before the local commit never authorizes a cookie. Unknown local commit is reconciled from authoritative Callback/session rows; absence of a fully committed tuple fails closed.

After the browser accepts the result, cookie, and required local state, it sends Delivery Acknowledgment. A lost acknowledgment response is retried idempotently. Once acknowledgment or expiry commits, Callback replay cannot reissue a cookie.

# MULTIPLE-TAB BEHAVIOR

Tabs sharing a flow container share its server-authoritative epoch, family attachment, Callback recovery state, and deadline. Concurrent replay or acknowledgment for the same operation serializes under the full Terminal Callback order. Acknowledgment by one tab ends cookie reissue for every tab; authoritative expiry does the same. A later logout, Account Switch, forced termination, or family replacement in any tab advances the epoch or invalidates the family and prevents every tab from using old Callback recovery. Tabs cannot use a stale pre-attach epoch, raw key, selector, or browser cache to restore authorization or pending recovery.

# AUTHENTICATED LOGOUT GUARD

The authenticated logout guard is derived only from trusted current session-family and flow-container identities. Terminal Callback reconciliation/reissue, delivery acknowledgment, provider refresh, ordinary logout, Account Switch, and logout-compatible forced termination all acquire `container_auth_transition_guard` first and then this same guard, or the explicitly compatible transition guard identified by the global matrix.

No browser value selects the guard identity. The guard is held until every epoch/family/session/recovery validation, expiry classification, material decision, outcome lookup, capability decision, and applicable transition mutation completes.

# ATOMIC VOLUNTARY LOGOUT

`GET /functions/v1/logout-readiness` is advisory only.

`POST /functions/v1/logout`:

1. resolve trusted container and family;
2. acquire container auth-transition guard;
3. acquire authenticated logout guard;
4. establish transaction-local `logout_pending`;
5. acquire Callback-operation guards, Handoff locks, and session/family rows in stable global order;
6. authoritatively reread all blocking Callback and Consume states, including separate Callback operation and recovery states;
7. lazily transition every pending terminal recovery whose deadline has arrived to `recovery_expired`, set its expiry timestamp, and destroy its sealed material, then classify the resulting state;
8. blocking exists: roll back the transaction with no persisted pending state or epoch change, then return Logout Recovery Required;
9. no blocking exists:
   - increment `container_auth_epoch`;
   - revoke family/session and current/previous capability digests;
   - detach the family in the same transaction;
   - delete or render unusable old Callback reissue material and clear only recovery material proven safe to clear;
   - mark transition stable;
   - commit;
10. clear cookie only after commit.

Pre-commit Callback states and unresolved Consume work remain blockers as previously specified. A `session_committed` Callback blocks ordinary logout only when its recovery is `recovery_pending`, authoritative database time is before its deadline, sealed material is valid, and the current committed epoch/family/session relationship remains valid. `acknowledged`, `recovery_expired`, terminal failures without recoverable authentication, and historical non-authorizing outcomes are not Callback recovery blockers.

This specification proposes blocking ordinary user-requested logout while that active pending condition holds so browser recovery authority is not destroyed. Human product/security approval remains REQUIRED before Runtime implementation; this document does not represent that approval. A blocked logout preserves the session, cookie, actor-session descriptor, raw Idempotency-Key, Callback state, Consume state, and sealed material.

# FORCED SECURITY LOGOUT AND ADMINISTRATIVE TERMINATION

Authorized server-side processes acquire the container guard first, the termination/logout-compatible guard, then Callback-operation guards, Handoff locks, session-family rows, recovery/material rows, and canonical rows. They apply authoritative lazy expiry and reread blockers under the same container guard.

Forced security termination may override active pending recovery only under an explicit security-incident policy. Approval for that policy remains REQUIRED and is not represented here. When such an authorized override commits, it advances the epoch once, revokes/detaches the family and capabilities, destroys sealed reissue material immediately, transitions the recovery to terminal non-reissuable `recovery_expired` with an auditable non-secret forced-termination reason, and preserves the immutable outcome as non-authorizing evidence. It never releases or rebinds server coordination to another actor or logs secrets.

Browser input cannot request forced mode. A later forced termination prevents stale provider results or committed Callback replay from creating a session or reissuing a cookie.

# ATOMIC ACCOUNT-SWITCH GATE

Account Switch uses two local database transactions. No sequence may increment the epoch, revoke/detach the old family, invalidate the actor-session descriptor, clear the cookie, or destroy recovery material before the authoritative blocker decision.

## Durable Account-Switch Transition

The durable record contains at least:

```text
account_switch_transition_id: opaque unique UUID
container_id
account_switch_epoch
old_session_family_id
old_logical_session_id
state
new_continuation_reference: opaque reference | null
created_at
updated_at
contract_version
```

Allowed states are exactly:

- `old_family_terminated`;
- `continuation_creation_pending`;
- `continuation_created`;
- `terminal_failure`.

The transition ID is server-generated, opaque, unique, and cannot be selected by browser input. It is the stable idempotency identity for every Phase B attempt.

## Phase A — Atomic gate and old-family termination

In one transaction:

1. acquire `container_auth_transition_guard`;
2. acquire the authenticated logout/Account-Switch guard;
3. establish transaction-local `account_switch_pending`;
4. acquire required Callback-operation synchronization;
5. acquire required Handoff advisory locks;
6. read Callback and Consume operation rows in deterministic stable-key order;
7. authoritatively reread every blocking Callback and Consume state;
8. classify whether blocking work exists while the same container guard remains held.

### Account-Switch Blocker Classification

For each committed Callback recovery, the guarded reread includes:

- `callback_operation_state`;
- `callback_recovery_state` and `recovery_state_version`;
- committed and current container epochs;
- committed and currently attached families;
- committed logical session and current logical-session state;
- `committed_outcome_reference`;
- `cookie_reissue_material_expires_at`;
- authoritative database time;
- presence, validity, and committed version of sealed reissue material.

Before blocker classification, Phase A applies the lazy authoritative expiry transition to pending recoveries whose deadline has arrived, destroys their sealed material, and then rereads or classifies the resulting state. If Phase A later rolls back because another blocker exists, all transaction-local expiry changes also roll back and pre-switch state remains unchanged; another guarded path will deterministically reapply expiry.

Blocking work includes at minimum:

- Callback `provider_exchange_started`;
- Callback `provider_exchange_succeeded`;
- Callback `session_commit_started`;
- Callback `unknown_provider_outcome`;
- Callback `response_unknown` while its operation is nonterminal;
- Callback `session_committed` only when `callback_recovery_state = recovery_pending`, authoritative database time is strictly before `cookie_reissue_material_expires_at`, sealed material is valid, and the current committed epoch/family/session relationship remains valid;
- Consume `operation_bound` with unresolved result;
- unknown Consume commit;
- pending idempotent recovery requiring the current actor/session;
- any operation whose recovery capability would be destroyed by epoch advancement, family detach, or descriptor invalidation.

Account Switch does not treat `acknowledged`, `recovery_expired`, terminal failure without recoverable authentication, or historical non-authorizing outcomes as Callback recovery blockers. It never classifies every `session_committed` record as automatically blocking or automatically resolved.

When blocking work exists, roll back the entire transaction. Do not increment the epoch; persist `account_switch_pending` or a transition row; revoke or detach the family; invalidate the logical session, cookie, descriptor, or earlier continuation; delete the raw Idempotency-Key; remove Callback/Consume state; clear recovery material; or create a new Auth continuation. Rollback leaves every pre-switch session and recovery state unchanged, including sealed material for active pending recovery.

When no blocking work exists:

1. create the durable transition with the current container, old family/session, contract version, and opaque ID;
2. set its state to `continuation_creation_pending`;
3. bind `account_switch_epoch` to the next epoch;
4. advance `container_auth_epoch` exactly once;
5. revoke the old session family;
6. detach the old family from the container;
7. invalidate old session capabilities;
8. invalidate old actor-session binding descriptors;
9. invalidate older Auth continuations;
10. clear only recovery material proven safe after the no-blocker determination;
11. preserve the durable transition in `continuation_creation_pending` for Phase B;
12. commit.

The transition row, epoch advance, and old-family termination are atomic. An intermediate implementation may use `old_family_terminated` as a same-transaction checkpoint, but the chosen committed Phase A state is `continuation_creation_pending`. No new continuation is created inside Phase A, and cookie clearing occurs only after Phase A commit.

## Phase B Continuation Recovery — Retry-safe continuation creation

Phase B starts only after Phase A commits and uses the same `account_switch_transition_id`:

1. acquire `container_auth_transition_guard`;
2. acquire the Account-Switch transition guard;
3. reread the durable transition;
4. verify it belongs to the current container and epoch;
5. verify the old family remains revoked and detached;
6. verify `container_auth_epoch` has not advanced again unexpectedly;
7. if `new_continuation_reference` already exists, return the same continuation and create nothing;
8. otherwise create exactly one continuation bound to the current container epoch, Account-Switch transition ID, dedicated acceptance origin, and new pre-auth guard subject;
9. persist `new_continuation_reference`;
10. set state to `continuation_created`;
11. commit.

Phase B transaction failure or HTTP response loss never restores the old family, decrements or increments the epoch, or creates multiple continuations. The durable transition retains enough state to retry or determine whether continuation creation committed. A retry with the same transition ID returns the same continuation reference.

If Phase B reaches terminal unrecoverable failure, preserve the detached/revoked old-family state, set `terminal_failure`, return a generic authentication-flow error, and never silently reactivate the old family.

Old continuations fail with Auth Restart Required. A successor family may attach only through a later guarded first-session commit and is not part of either Account-Switch transaction.

# PROVIDER REFRESH AND EXISTING-SESSION REAUTHENTICATION

Existing-session reauthentication continuation binds trusted current family + container + current epoch.

Provider start and reauthentication session commit obtain the container guard, authenticated logout guard, then Callback/session synchronization. They revalidate epoch, family attachment, session state, and transition state.

Each guarded provider-refresh start or local commit phase uses:

```text
container_auth_transition_guard
→ authenticated_logout_guard
→ logical_session/session_family synchronization
```

It rejects `logout_pending`, detached, replaced, revoked, expired, epoch-mismatched, or provider-invalid state. External provider network I/O occurs while no database guard is held; after the call, the local result phase reacquires the same order and authoritatively rereads state before any capability mutation.

Provider refresh never acquires a logical-session/family lock before the authenticated logout guard. If it discovers a required Callback or container-family transition, it aborts the narrow phase and restarts through that path's full container-first order.

Terminal Callback reissue shares the container/authenticated-logout prefix but additionally acquires Callback guard, session/family rows, and recovery material. It reissues the exact same committed capability only while recovery is pending and unexpired; it never rotates during Callback replay.

# INVITATION-GENERATION AND HANDOFF SYNCHRONIZATION

Revision 10.4 rules remain normative:

- Exchange reads candidate generation, acquires lifecycle lock, rereads generation, then locks rows.
- Resend/Revoke reread current generation immediately after lifecycle-lock acquisition and again after Handoff/row locks.
- Multi-generation cleanup/repair revalidates applicability after all lifecycle locks and again after row locks.
- Every Handoff mutation or synchronized classification obtains its Handoff advisory lock.
- Multiple lifecycle/Handoff locks use deterministic unsigned numeric ordering with stable tie-breaks.

# CONSUME UNKNOWN OUTCOME

Consume acquires `container_auth_transition_guard` before its Handoff advisory lock whenever it reads current auth epoch/family state or creates recovery work bound to the actor/session. An `operation_bound` row with unresolved result, an unknown local commit, or pending idempotent recovery remains blocking until authoritative classification.

Account Switch and voluntary logout reread these rows under the container guard and Handoff locks. A blocked transition cannot detach the family, invalidate the actor-session descriptor, or destroy the only capability that can reconcile the Consume result. Forced security termination may invalidate actor authorization but preserves immutable operation evidence and never rebinds it.

# RAW IDEMPOTENCY-KEY LIFECYCLE

The raw Idempotency-Key is browser-held and bound to the opaque actor-session binding ID. It is not deleted because of a local timeout or a blocked logout/Account Switch. It remains available while unknown Consume commit or same-actor/session recovery is unresolved.

After the authoritative no-blocker decision, a successful auth transition may invalidate the old descriptor and clear only server recovery material proven no longer required. A later actor/family cannot rebind the key. Natural tab loss, server-classified terminal outcome, forced security loss, or actor/family change ends browser recovery according to the existing retention contract.

# CALLBACK ZERO-OPERATION RECOVERY

Zero callback operations resolves to Auth Restart Required:

- no provider call;
- no BFF session creation/reissue;
- no provider-failure or unknown-provider-outcome claim;
- continuation retention follows authoritative deadline.

# UX AND RECOVERY

- A blocked logout or Account Switch leaves the current session and recovery material intact and returns the applicable generic recovery-required class.
- After accepting the committed Callback result and cookie and persisting required non-secret state, the browser sends the architecture-level Delivery Acknowledgment; response loss triggers the same idempotent retry.
- Acknowledgment or authoritative expiry ends cookie reissue for all tabs and releases the Callback recovery blocker without altering the active committed session.
- While valid recovery remains pending, Account Switch and the proposed ordinary logout policy remain blocked; UI treatment and product/security approval remain Runtime blockers.
- The browser does not clear its cookie, descriptor, or raw Idempotency-Key before a successful Phase A commit.
- After Account-Switch Phase A, the old session stays revoked even if Phase B fails; retry uses the opaque transition flow and never asks the user to restore the old family.
- Phase B response loss retrieves the same continuation rather than creating another.
- Stale Callback recovery after a later epoch uses a generic authentication/session or flow-capability result and never reveals Invitation validity or state.
- Browser copy must not describe a Callback replay, Account Switch, or this planning document as approved Runtime behavior.

# TESTING AND CI SPECIFICATION

Tests 1–260 retain their previously specified architecture meaning.

## Existing architecture tests 261–289

| # | Required architecture assertion |
|---|---|
| 261 | PKCE verifier persists before top-level navigation. |
| 262 | Client continuation record is complete and read-back verified. |
| 263 | Continuation creation response loss is idempotently recoverable. |
| 264 | Callback can be reconciled before a callback-operation reference reaches the browser. |
| 265 | Callback replay reissues the exact same committed cookie capability for the same logical session. |
| 266 | Raw cookie capability is absent from general plaintext database columns; bounded sealed recovery material follows the Callback reissue contract. |
| 267 | Voluntary logout is decided by atomic POST logout, not advisory readiness. |
| 268 | Forced revocation preserves server operation evidence to terminal state or expiry. |
| 269 | Cross-tab account switch checks every active shared-container flow. |
| 270 | Resend acquires affected Handoff advisory locks. |
| 271 | Revoke acquires affected Handoff advisory locks. |
| 272 | Expiry and selector cleanup acquire Handoff advisory locks. |
| 273 | Multiple Handoff locks use deterministic unsigned ordering. |
| 274 | Atomic logout fence blocks concurrent Consume binding. |
| 275 | Atomic logout fence blocks callback provider-start and session commit. |
| 276 | Browser cannot request forced-security logout mode. |
| 277 | Concurrent Exchange cannot enter a Resend affected set after lifecycle-set stabilization. |
| 278 | Resend rereads current generation and affected set after lifecycle/Handoff/row locks. |
| 279 | Revoke and set-based repair use generation lifecycle locks. |
| 280 | Zero callback-operation Reconciliation returns Auth Restart Required. |
| 281 | Provider refresh uses the container/authenticated-logout prefix and serializes with atomic logout. |
| 282 | Terminal Callback capability reissue uses the container/authenticated-logout/Callback order and serializes with logout. |
| 283 | Logout winning after provider response prevents successor creation. |
| 284 | Concurrent cookie reissue cannot overwrite successful logout with usable capability. |
| 285 | Second Resend revalidates current generation after lifecycle-lock wait. |
| 286 | Revoke restarts when candidate generation becomes stale. |
| 287 | Multi-generation repair revalidates generation applicability after all locks. |
| 288 | First-login callback has a defined pre-auth guard domain. |
| 289 | Existing-session reauthentication binds callback guard to the current session family. |

## Tests 290–295

| # | Test | Required assertion | Negative assertion |
|---|---|---|---|
| 290 | First-login provider-start serializes with voluntary logout | Both acquire container guard first. Provider-start-first makes logout observe a blocking callback; logout-first makes epoch mismatch prevent provider start. | No provider call starts after successful logout epoch increment. |
| 291 | First-login session commit cannot recreate login after logout | Logout increments epoch and detaches/revokes family; later callback commit detects stale bound epoch. | No logical session, family, binding ID, digest, or Set-Cookie is created. |
| 292 | Account Switch invalidates old continuation | Successful Phase A advances the epoch under container + authenticated guards only after the authoritative no-blocker reread. | Old continuation cannot start provider or attach/replace a family; a blocked switch changes nothing. |
| 293 | Forced security logout invalidates pending pre-auth continuation | Forced logout increments epoch under container guard. | Pending provider result cannot create session or cookie. |
| 294 | Container guard precedes authenticated/pre-auth guards globally | Instrument every path requiring both domains and verify ordered acquisition. | No domain inversion or later container acquisition occurs. |
| 295 | Provider success with stale container epoch creates no logical session | Provider succeeds, then logout/account switch changes epoch before commit; callback returns restart-required classification. | No family/session/binding/digest/cookie persists or emits. |

## Test 296 — First-login commit epoch increment preserves exact Callback response-loss recovery

- Purpose: Prove that the successful first logical-session commit advances the epoch while preserving terminal recovery for the exact committed result.
- Setup: Current container epoch `E`; a valid Callback operation; no committed logical session or attached family.
- Execution: Commit the successful logical session locally, advancing the epoch to `E + 1`; lose the initial HTTP response; perform Callback Reconciliation.
- Required assertions: `pre_attach_container_auth_epoch = E`; `committed_container_auth_epoch = E + 1`; recovery starts as `recovery_pending` with a bounded deadline; the immutable stored outcome is recovered; the exact same cookie capability may be reissued before that deadline; the same family and logical session are used; no provider call occurs; no second session or family is created.
- Negative assertions: The epoch does not advance again, no new cookie capability is generated, and replay does not extend the deadline.
- Required evidence: Transaction trace for both epoch fields and committed tuple, family/session row identities, immutable outcome reference, capability-byte or specified digest equivalence proof, provider-call count, and epoch history.
- Shared-CI suitability: Deterministic local database/concurrency fixture with injected HTTP response loss; no live provider, production secret, or wall-clock dependency.

## Test 297 — Committed Callback recovery requires the committed epoch

- Purpose: Prove that post-commit recovery uses the committed epoch/family/session/outcome tuple rather than only the continuation-bound pre-attach epoch.
- Setup: A `session_committed`/`recovery_pending` Callback with both epoch fields, committed references, unexpired deadline, and sealed cookie reissue material; table-driven variants alter one tuple member at a time.
- Execution: Run Callback Reconciliation for a fully matching tuple, then for mismatched current epoch, attached family, logical-session ownership, and outcome reference.
- Required assertions: Recovery succeeds only when current epoch equals `committed_container_auth_epoch`, attached family equals `committed_session_family_id`, committed logical session and outcome references match, recovery is pending, database time is before the deadline, and material is valid.
- Negative assertions: Matching only `pre_attach_container_auth_epoch` is insufficient; acknowledged, expired, deadline-reached, material-invalid, or tuple-mismatched recovery never reissues a cookie.
- Required evidence: Guard/lock trace, authoritative reread snapshot, tuple comparison results, response classification, and absence/presence of `Set-Cookie`.
- Shared-CI suitability: Table-driven local fixture using deterministic UUIDs and no external network calls.

## Test 298 — Later logout, Account Switch, or forced termination blocks old Callback cookie reissue

- Purpose: Prove that every later authorized auth transition permanently invalidates the older committed Callback capability.
- Setup: A recoverable `session_committed` Callback at committed epoch `E + 1` with the family attached; one case each for logout, Account Switch, and forced termination.
- Execution: Commit the later transition so the current epoch is greater than the committed epoch, then invoke old Callback Reconciliation.
- Required assertions: The later transition advances the epoch beyond the committed epoch; sealed material is destroyed or invalidated; old Callback reconciliation cannot reissue the cookie; the old family cannot be restored or reattached; no provider call or new logical session occurs.
- Negative assertions: Reconciliation cannot lower the epoch, create a replacement family, expose Invitation semantics, or use retained historical outcome as authorization.
- Required evidence: Before/after epoch and attachment history, reissue-material invalidation evidence, provider/session creation counts, and generic public classification.
- Shared-CI suitability: Deterministic local concurrency cases for each transition, with fake provider-call counters only.

## Test 299 — Successful Callback replay never increments the epoch again

- Purpose: Prove exact replay idempotency after the successful local session commit.
- Setup: One valid committed Callback tuple with current epoch equal to committed epoch and an attached valid family/session.
- Execution: Perform repeated exact Callback Reconciliation, including concurrent retries and simulated response loss.
- Required assertions: Every replay preserves the committed epoch, session family, logical session, stored outcome, cookie capability version, recovery state/version, and fixed deadline until acknowledgment or expiry wins.
- Negative assertions: No second family, second logical session, provider exchange, auth-epoch increment, capability generation, or deadline extension occurs.
- Required evidence: Stable row identities and outcome hash, epoch history, capability-version and byte-equivalence proof, provider-call count, and creation counters.
- Shared-CI suitability: Repeatable local idempotency/concurrency fixture without browser or provider dependency.

## Test 300 — Blocked Account Switch rolls back epoch and pending state

- Purpose: Prove that Phase A is atomic and cannot partially advance authentication state when blocking work exists.
- Setup: An active attached family plus a blocking Callback or Consume operation; capture the current epoch and absence of an Account-Switch transition.
- Execution: Invoke Account-Switch Phase A through the complete lock order and authoritative blocker reread.
- Required assertions: The blocker is observed; Phase A rolls back; the epoch is unchanged; `account_switch_pending` is not persisted; no Account-Switch transition row is committed.
- Negative assertions: No revoke, detach, descriptor invalidation, cookie clearing, recovery-material removal, or continuation creation occurs.
- Required evidence: Transaction rollback trace, ordered lock trace, before/after container and transition rows, and blocker classification.
- Shared-CI suitability: Deterministic local transaction test with seeded Callback and Consume variants.

## Test 301 — Blocked Account Switch preserves session and recovery material

- Purpose: Prove that a rejected switch does not destroy the authority needed to finish existing work.
- Setup: An active session/family/cookie/descriptor, raw Idempotency-Key, active unexpired pending Callback recovery, Consume recovery state, and a blocker.
- Execution: Attempt Phase A and then exercise the still-authorized existing recovery path.
- Required assertions: The old session remains active; the family remains attached; current cookie and descriptor remain valid; raw Idempotency-Key remains; Callback and Consume recovery state remain; no new continuation exists.
- Negative assertions: No old-state artifact is revoked, detached, deleted, cleared, rebound, or replaced.
- Required evidence: Before/after row and digest snapshots, browser-state fixture, raw-key presence proof, recovery result, and continuation count.
- Shared-CI suitability: Local fixture with opaque test capabilities and no production credential material.

## Test 302 — Successful Account Switch advances epoch only after authoritative blocking-state reread

- Purpose: Prove the no-race atomic gate and global lock hierarchy.
- Setup: Active old family with nonblocking terminal operation rows, plus instrumented concurrent Callback and Consume attempts.
- Execution: Run Phase A while recording lock acquisition, deterministic row reread, no-blocker classification, epoch advance, and family detach.
- Required assertions: `container_auth_transition_guard` and authenticated logout/Account-Switch guard are acquired first; Callback, Handoff, and session rows follow the global lock matrix; recovery state/deadline/material and all blocking rows are reread; no blocker exists; only then are the epoch advanced and family detached.
- Negative assertions: No Callback or Consume path uses reverse order `Handoff or Callback lock → container_auth_transition_guard`; no new blocker appears between final reread and epoch advancement.
- Required evidence: Complete ordered lock trace, barrier-controlled race trace, authoritative reread snapshot, epoch write timestamp/order, and family attachment history.
- Shared-CI suitability: Deterministic barrier-based local concurrency test; no timing-only assertion.

## Test 303 — New Account-Switch continuation is created only after old-family termination commits

- Purpose: Prove transaction separation and retry-safe Phase B continuation creation.
- Setup: A switchable old family and deterministic failure/response-loss injection around Phase A commit and Phase B commit/response.
- Execution: Commit Transaction 1 with epoch advancement and old-family revoke/detach; run Transaction 2 using the same transition ID; inject one Phase B transaction failure and one lost Phase B HTTP response, then retry/retrieve.
- Required assertions: Transaction 1 commits before continuation creation; Transaction 2 creates or retrieves the new continuation; the same transition ID makes Phase B idempotent; transaction failure is retryable; HTTP response loss retrieves the same continuation; exactly one new continuation exists; Phase B never increments the epoch again.
- Negative assertions: No continuation exists before Phase A commit; Phase B failure never restores the old family; duplicate Phase B requests never create multiple continuations.
- Required evidence: Separate transaction commit records, durable transition state history, stable continuation reference, continuation row count, epoch history, old-family state, and retry/response-loss traces.
- Shared-CI suitability: Deterministic local two-transaction fixture with explicit fault injection and no live provider.

## Test 304 — session_committed starts as recovery_pending

- Purpose: Prove the first successful local session commit initializes operation and recovery state atomically with bounded reissue authority.
- Setup: A Callback operation ready for its first successful local session commit; current container epoch `E`; no existing committed family or logical session.
- Execution: Commit the logical session, session family, immutable outcome, sealed reissue material, and dual-epoch state in one local transaction.
- Required assertions: `callback_operation_state = session_committed`; `callback_recovery_state = recovery_pending`; authoritative `cookie_reissue_material_expires_at` is persisted; sealed material exists only in protected form; the deadline is no later than Callback-operation deadline, logical-session expiry, cookie-capability server expiry, or container recovery deadline; `Set-Cookie` occurs only after commit.
- Negative assertions: No `delivery_acknowledged_at`; no `recovery_expired_at`; no second session or family; no epoch increment beyond `E + 1`; no plaintext cookie capability.
- Required evidence: Atomic transaction trace, both epoch values, recovery-state/version row, all four bounding expiries and calculated deadline, sealed-material reference, family/session counts, and commit-before-`Set-Cookie` trace.
- Shared-CI suitability: Deterministic local database test with fixed authoritative clock and protected test material; no provider, production secret, or browser dependency.

## Test 305 — Idempotent acknowledgment resolves recovery and destroys sealed material

- Purpose: Prove delivery acknowledgment is same-session authorized, atomic, monotonic, idempotent, and response-loss safe.
- Setup: `session_committed`; `recovery_pending`; unexpired deadline; committed BFF logical session/family/epoch valid; sealed material present.
- Execution: Browser accepts and persists the committed result/cookie state; send acknowledgment; lose the acknowledgment HTTP response; retry the identical acknowledgment.
- Required assertions: The first successful transaction sets `acknowledged`; `delivery_acknowledged_at` is set once; recovery version advances once; sealed material is destroyed or unusable in the same transaction; retry returns the same successful classification without mutation; Account Switch no longer treats the Callback as blocking.
- Negative assertions: No cookie reissue; no return to `recovery_pending`; no epoch increment; no new session or family; no outcome mutation; no material recreation.
- Required evidence: Ordered guard trace, requesting-session tuple validation, recovery before/after snapshots, material-destruction proof, acknowledgment timestamp/version history, lost-response retry trace, and Account-Switch classification.
- Shared-CI suitability: Deterministic local idempotency fixture with injected response loss and no live endpoint or external network.

## Test 306 — Recovery expiry destroys material and releases Account-Switch blocker

- Purpose: Prove authoritative, non-sliding expiry permanently ends cookie reissue and pending blocker authority.
- Setup: `session_committed`; `recovery_pending`; sealed material present; authoritative database time reaches the persisted deadline.
- Execution: Invoke Terminal Callback reconciliation, Account-Switch classification, or governed cleanup and concurrently attempt a late acknowledgment.
- Required assertions: State becomes `recovery_expired`; `recovery_expired_at` is set from database time; recovery version advances once; sealed material is destroyed; the old Callback cannot reissue the cookie; Account Switch no longer treats the record as blocking; acknowledgment cannot win at or after the deadline.
- Negative assertions: No deadline extension; no restoration of `recovery_pending`; no sealed-material recreation; no session restoration through Callback; no browser-clock authority.
- Required evidence: Persisted deadline, authoritative clock trace, ordered guards/row lock, deterministic concurrency winner, recovery/material before/after state, reissue denial, and Account-Switch result.
- Shared-CI suitability: Fixed-clock local concurrency fixture with explicit barrier control rather than timing-only assertions.

## Test 307 — Account Switch cannot pass while recovery_pending

- Purpose: Prove exact committed-recovery blocker classification before and after acknowledgment or authoritative expiry.
- Setup: Valid committed epoch/family/session; `session_committed`; `recovery_pending`; deadline unexpired; sealed material valid.
- Execution: Start Account-Switch Phase A, then repeat after acknowledgment and in a separate case after authoritative expiry.
- Required assertions: Initially the blocker is authoritatively detected; Phase A rolls back; epoch remains unchanged; family/session remain active and attached; recovery state and sealed material remain; no transition or continuation commits. After acknowledgment or expiry, the Callback is no longer a recovery blocker and Account Switch may continue when no other blocker exists.
- Negative assertions: No switch passes during active pending recovery; no blanket blocking of `acknowledged` or `recovery_expired`; no automatic resolution based only on `session_committed`; no cleanup of pending material on rollback.
- Required evidence: Complete guarded reread tuple, database-time/deadline comparison, rollback snapshot, transition/continuation counts, post-ack and post-expiry classifications, and epoch/family history.
- Shared-CI suitability: Table-driven local transaction fixture covering pending, acknowledged, expired, invalid-relation, and other-blocker cases.

## Test 308 — Terminal Callback reissue uses the single approved lock order

- Purpose: Prove one deadlock-free Terminal Callback order compatible with acknowledgment, provider refresh, logout, Account Switch, forced termination, and Consume.
- Setup: Recoverable Terminal Callback plus concurrent provider refresh/logout attempts and instrumented acknowledgment, Account-Switch, forced-termination, and Consume lock paths.
- Execution: Exercise every path with deterministic concurrency barriers and record each guard/lock acquisition and release.
- Required assertions: Terminal Callback uses container guard → authenticated logout guard → Callback guard → logical session/family → recovery material; provider refresh and logout use compatible prefixes; multiple Callback/Handoff locks use stable ordering; deterministic winner/loser behavior occurs; later epoch/family transition prevents stale cookie reissue.
- Negative assertions: No Callback guard → authenticated logout guard path; no session-family → authenticated logout guard path; no Handoff → container guard path; no deadlock cycle; no stale same-cookie reissue after a losing transition.
- Required evidence: Machine-checked lock graph, per-path ordered traces, barrier-controlled race results, deadlock detector result, epoch/family state, material decision, and reissue outcome.
- Shared-CI suitability: Deterministic local concurrency harness with virtual/fixed time and no live provider or production infrastructure.

## Required evidence

- ordered container/auth/pre-auth/session/Handoff/row lock traces;
- pre-attach and committed epoch values at continuation creation, provider start, logout/Account Switch, session commit, and Callback replay;
- callback state and provider-call counts;
- family attach/detach history;
- committed outcome and exact-cookie reissue equivalence evidence, capability-digest, sealed-material lifecycle, and `Set-Cookie` ordering;
- blocked Account-Switch rollback plus durable Phase B retry/response-loss evidence;
- recovery-state/version transitions, all deadline bounds, authoritative database-time comparisons, and non-sliding proofs;
- idempotent acknowledgment response-loss retry and sealed-material destruction evidence;
- machine-checked single Terminal Callback/provider-refresh/logout lock graph;
- absence of browser-controlled epoch or guard authority.

# ARCHITECTURE REMEDIATION MATRIX

| Finding | Finding summary | Resolution sections | Tests | Specification remediation | Repository validation | Approval | Final closure |
|---|---|---|---|---|---|---|---|
| INT-ARCH-10.4-P0-01 | Container authentication transitions lacked one authoritative epoch and global lock order. | Container Auth Epoch Model; Global Auth Guard and Lock Order; First-Login Provider-Start; First Logical-Session Commit; Atomic Voluntary Logout; Forced Termination; Account Switch | 290–295 | ADDRESSED | REQUIRED | REQUIRED | VALIDATION REQUIRED |
| INT-ARCH-10.5-P0-01 | Successful Callback terminal recovery lacked the committed dual-epoch, session-family, logical-session and outcome model. | Terminal Callback Recovery; First Logical-Session Commit; Callback Reconciliation; Exact Cookie-Capability Reissue; Container Auth Epoch | 296–299 | ADDRESSED | REQUIRED | REQUIRED | INTERMEDIATE REVIEW REQUIRED |
| INT-ARCH-10.5-P0-02 | Account Switch advanced authentication state before atomically proving that no blocking Callback or Consume recovery existed. | Atomic Account-Switch Gate; Durable Account-Switch Transition; Global Auth Guard and Lock Order; Phase B Continuation Recovery | 300–303 | ADDRESSED | REQUIRED | REQUIRED | INTERMEDIATE REVIEW REQUIRED |
| INT-ARCH-10.6-P0-01 | The specification lacked an authoritative durable state for determining whether a `session_committed` Callback response-loss recovery remained pending, was acknowledged, or had expired. | Callback Recovery Lifecycle; Delivery Acknowledgment; Recovery Expiry; Account-Switch Blocker Classification; Sealed Reissue Material Lifecycle | 304–307 | ADDRESSED | REQUIRED | REQUIRED WHERE APPLICABLE | INTERMEDIATE REVIEW REQUIRED |
| INT-ARCH-10.6-P1-01 | Terminal Callback cookie reissue had contradictory authenticated logout guard requirements. | Terminal Callback Recovery; Authenticated Logout Guard; Global Auth Guard and Lock Order; Provider Refresh; Logout | 308 | ADDRESSED | REQUIRED | REQUIRED WHERE APPLICABLE | INTERMEDIATE REVIEW REQUIRED |

# INTERMEDIATE ARCHITECTURE REVIEW GATE

Revision 10.7 is submitted only for Intermediate Architecture Review.

Allowed outcomes:

```text
ARCHITECTURE READY FOR CONTRACT FINALIZATION
```

or:

```text
ARCHITECTURE REVISION REQUIRED
```

Even an architecture-ready result:

- does not authorize Runtime implementation;
- does not authorize an implementation branch;
- requires Revision 11 Exact Contract and Governance Finalization;
- leaves repository, browser, OAuth-provider, database, guard, epoch, lock, session, and concurrency validation outstanding.

# REVISION 11 RESERVED FINALIZATION

Revision 11 may begin only after an Intermediate Architecture Review returns `ARCHITECTURE READY FOR CONTRACT FINALIZATION`.

Revision 11 will finalize HTTP header profiles, CORS, Correlation-ID precedence, imported PR-02 fixture integration, exact bytes, Content-Length, newline/compression, governance, remediation closure, package, manifest, ZIP, sidecars, and formal independent-review readiness.

The current specification remediations remain subject to repository validation and independent Intermediate Architecture Review; they are not deferred as current work to Revision 11.

# CLEAN DOCUMENT ASSERTIONS

Revision 10.7 contains:

- one Revision 10.7 title;
- one Callback Recovery Lifecycle and Lock-Order Closure Edition heading;
- D001–D030 exactly once;
- one container-auth epoch model;
- one durable Callback recovery lifecycle;
- one architecture-level idempotent Delivery Acknowledgment;
- one authoritative non-sliding recovery expiry algorithm;
- one sealed reissue-material lifecycle;
- one global container-auth guard/lock-order matrix with one Terminal Callback reissue order;
- one first-login provider-start algorithm;
- one first logical-session commit algorithm;
- one atomic voluntary logout algorithm;
- one forced termination model;
- one two-transaction durable Account-Switch model;
- one exact same committed cookie-capability recovery rule;
- Tests 1–308 represented, with Tests 296–303 and Tests 304–308 specified once each;
- one Architecture Remediation Matrix;
- one Intermediate Architecture Review Gate;
- no Runtime, SQL, migration, RPC, Edge, or UI implementation;
- no Revision 11 HTTP-header, CORS, exact-byte, package, manifest, ZIP, or sidecar finalization.

SUBMIT REVISION 10.7 FOR INTERMEDIATE ARCHITECTURE REVIEW
