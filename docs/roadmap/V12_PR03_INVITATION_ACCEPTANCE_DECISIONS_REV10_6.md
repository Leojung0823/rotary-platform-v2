# PR-03 FORMAL SPECIFICATION — REVISION 10.6

## Terminal Callback Recovery and Account-Switch Closure Edition

## Specification Status

Planning document: READY FOR INTERMEDIATE ARCHITECTURE REVIEW
Runtime implementation: BLOCKED
Ninth independent review: REQUEST CHANGES
Revision 10.5 intermediate architecture review: ARCHITECTURE REVISION REQUIRED
Revision 10.6 review status: NOT YET REVIEWED
Formal specification approval requested: No
Human/legal approval represented: No
Repository validation status: NOT VERIFIED IN THIS SPECIFICATION RUN

Revision 10.6 closes the terminal Callback recovery and Account-Switch atomicity blockers identified during the prior Intermediate Architecture Review. It does not perform Revision 11 HTTP-header, CORS, exact-byte, fixture, package, manifest, ZIP, sidecar, or governance finalization and does not authorize Runtime implementation.

# DOCUMENT PURPOSE, AUTHORITY, AND SCOPE

## Purpose

Revision 10.6 preserves all earlier converged architecture and adds:

1. server-authoritative `container_auth_epoch`;
2. continuation binding to one exact container epoch;
3. a successful Callback dual-epoch commit that binds the committed epoch, family, logical session, immutable outcome, and cookie capability;
4. bounded response-loss recovery that reissues the exact same committed cookie capability bytes;
5. later-epoch invalidation after logout, Account Switch, forced termination, security revocation, or family replacement;
6. an atomic Account-Switch blocker gate followed by a durable, retry-safe second transaction for continuation creation;
7. one container auth-transition guard and global lock order shared by Callback, Consume, logout, forced termination, Account Switch, and session-family transitions;
8. Tests 296–303 and synchronized architecture remediation.

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
| Cookie reissue material | Server-protected encrypted or sealed material retained only for the bounded Callback recovery period so the exact committed capability bytes can be reissued. |
| Container auth-transition guard | Transaction advisory lock derived from trusted flow-container UUID and a fixed domain/version prefix. |
| Authenticated logout guard | Guard derived from trusted session-family UUID + flow-container UUID. |
| Pre-auth callback guard | Guard derived from server-only pre-auth subject UUID + flow-container UUID. |
| Container auth transition | First-login provider start/commit, voluntary logout, forced logout, account-switch initiation, first family attach, family detach, or family replacement. |
| Existing-session capability transition | Cookie reissue or provider refresh that does not change the container-to-family binding. |
| Pre-commit mutation authorization | Authorization for Callback states before `session_committed`; it requires the bound epoch to equal the current epoch. |
| Post-commit terminal recovery | Non-mutating replay of an immutable committed Callback outcome and exact same cookie capability, authorized by the committed epoch/family/session tuple. |
| Blocking callback state | `provider_exchange_started`, `provider_exchange_succeeded`, `session_commit_started`, `unknown_provider_outcome`, nonterminal `response_unknown`, or unresolved `session_committed` response-loss recovery for the attached epoch/family. |
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
9. A path that does not read or mutate the epoch may use only its narrower capability guard, but it must never later acquire the container guard in the same transaction.
10. Provider network I/O holds neither container nor logout guard and is not part of a local ACID database transaction.
11. A provider result produced for a stale epoch cannot create a logical session or usable cookie.
12. Callback replay after `session_committed` is authorized by the committed epoch/family/session/outcome tuple, not only by the pre-attach bound epoch.
13. Successful Callback replay reissues the exact same committed cookie capability bytes and creates no new capability, family, session, provider call, outcome, or epoch increment.
14. Any later epoch advancement invalidates old Callback cookie reissue and cannot restore or reattach the old family.
15. Logout makes its final blocking-work decision while holding the container guard and authenticated logout guard.
16. A created-but-not-started first-login callback does not block logout; the epoch increment invalidates it.
17. A first-login callback that commits `provider_exchange_started` first blocks voluntary logout until classified or expired.
18. Account-Switch continuation creation occurs only after old-family termination commits and is idempotent under one durable transition ID.
19. Browser input cannot supply an epoch, pre-auth subject, session family, guard key, transition ID, or committed outcome reference as authority.
20. Runtime implementation remains `BLOCKED`.

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

The browser binds the raw Idempotency-Key to the opaque actor-session binding ID. Unknown commit preserves the key until a server-classified terminal/capability result, approved same-family recovery, forced security loss, actor/family change, or natural tab loss.

## PR03-D009 — Different key after terminal success

A different key or operation cannot create another acceptance mutation after terminal success.

## PR03-D010 — Different actor replay

A different actor or session family cannot rebind callback, Handoff operation, raw key, or durable success.

## PR03-D011 — No operator acceptance route

PR-03 adds no operator, Executive Secretary, or administrative acceptance route.

## PR03-D012 — Recipient identity policy

Recipient identity remains governed by the approved D030 and verified PR-02 authority boundary.

## PR03-D013 — No Auth-user creation

Consume never creates an Auth user or provider identity.

## PR03-D014 — No external side effect in Consume

Consume never calls OAuth providers or another external system.

## PR03-D015 — Separate mutation and Reconciliation controls

Exchange/Consume mutation and read-only Reconciliation remain independently controlled. Reconciliation performs no business, session, mapping, retention, coordination, or capability mutation.

## PR03-D016 — Durable acceptance outcome

Success persists an immutable outcome sufficient for exact same-operation recovery.

## PR03-D017 — Recoverable deadlines

Callback, session, selector, container, and operation deadlines have independent server owners. Operation coordination cannot outlive browser-recoverable capability. Local timers do not prove completion.

## PR03-D018 — Semantic versus infrastructure classification

Conclusive Invitation semantic failure uses the imported PR-02 boundary. Provider uncertainty, synchronization timeout, storage failure, refresh outage, or unprovable commit uses a generic non-semantic class.

## PR03-D019 — Soft-deleted Account

Soft-deleted Accounts are not silently revived or reused.

## PR03-D020 — Disabled or revoked Auth user

Eligibility is rechecked at login, provider refresh, before Consume, before actor-bound Reconciliation, and at the bounded session interval.

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

OAuth continuation is persistent, callback recovery is continuation-based, cookie capabilities are digest-backed, and existing-session versus first-login guard identities are explicit. A successful first-login Callback persists the committed dual-epoch/family/session/outcome tuple and may reissue only the exact same committed cookie capability bytes during the bounded recovery period.

## PR03-D027 — No client abandonment

No operation-abandonment endpoint exists. Voluntary logout and Account Switch are blocked during unresolved work that would lose authoritative recovery. Forced security termination cannot release or rebind server operation coordination and permanently invalidates old Callback cookie reissue.

## PR03-D028 — Response precedence

Imported PR-02 remains semantic fixture authority. Revision 11 finalizes PR-03-owned exact headers and shared response profiles.

## PR03-D029 — Complete synchronization hierarchy

Exchange tuple lock precedes Exchange semantics; Invitation-generation lifecycle locks stabilize generation membership; Handoff locks protect each Handoff lifecycle; the container auth-transition guard is first for every epoch reader or mutator; Auth/logout, Callback, Handoff, and family locks then serialize authentication transitions in the normative global order.

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
committed_cookie_capability_version
committed_cookie_reissue_material_reference
```

The two epoch fields have different authority. The pre-attach epoch proves mutation authorization before the commit. The committed epoch proves whether terminal response-loss recovery is still authorized after the commit.

## Epoch increment events

Increment exactly once in the transaction that commits:

- successful voluntary logout;
- forced security logout or authorized administrative termination;
- Account-Switch Phase A only after the authoritative no-blocker reread;
- session-family attach, detach, or replacement occurring outside a transition that already incremented the epoch.

The first successful logical-session commit increments `E` to `E + 1` once for first-family attachment. Callback replay never increments it again.

For Account Switch, establishing transaction-local `account_switch_pending` is not an increment event. If any blocker exists, the transaction rolls back with the epoch and all pre-switch state unchanged. When no blocker exists, Phase A advances the epoch once and detaches/revokes the old family in the same transaction; Phase B never increments it.

## Later epoch invalidation

If a later authorized transition makes `current_container_auth_epoch > committed_container_auth_epoch`, the older Callback operation becomes non-authorizing. It cannot reissue its cookie, restore or reattach the old family, lower the epoch, call the provider, create a family or logical session, or create a replacement family. Its immutable historical outcome may remain only as a non-authorizing record where the approved public contract permits. The public result fails closed through the applicable generic authentication/session or flow-capability response and never exposes Invitation semantics.

# GLOBAL AUTH GUARD AND LOCK ORDER

Invariant: every path that reads or mutates `container_auth_epoch` acquires `container_auth_transition_guard` first. No path may acquire a Callback-operation, Handoff, Auth/logout, termination, or session-family lock and then attempt to acquire the container guard.

| Path | Required lock order |
|---|---|
| Callback first session commit | `container_auth_transition_guard` → pre-auth callback guard → callback operation guard → session-family rows |
| Callback reconciliation | `container_auth_transition_guard` → callback operation guard → callback/session rows |
| Consume | `container_auth_transition_guard` → Handoff advisory lock → canonical business rows |
| Account Switch | `container_auth_transition_guard` → logout/account-switch guard → callback operation guards → Handoff locks → session-family rows |
| Logout | `container_auth_transition_guard` → logout guard → callback/Handoff blockers → session-family rows |
| Forced termination | `container_auth_transition_guard` → termination guard → callback/Handoff blockers → session-family rows |

Rules:

- Multiple Callback rows are acquired by stable primary key; multiple Handoff rows are acquired by stable lock key using deterministic unsigned ordering and stable tie-breaks.
- The final blocker reread and any epoch increment occur while the same container guard remains held.
- A concurrent Consume or Callback path acquires that same container guard before creating new blocking work, so no blocker can appear between the final reread and epoch advancement.
- A capability-only path that does not read or mutate the epoch may acquire only its narrower capability guard. If it discovers that epoch or container-family state is required, it aborts and restarts through the container-first path.
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
13. persist `pre_attach_container_auth_epoch = E`;
14. advance `container_auth_epoch` exactly once to `E + 1`;
15. persist `committed_container_auth_epoch = E + 1`;
16. persist `committed_session_family_id`, `committed_logical_session_id`, and `committed_outcome_reference`;
17. persist `committed_cookie_capability_version` and `committed_cookie_reissue_material_reference`;
18. set `callback_operation_state = session_committed`;
19. commit all local state atomically;
20. issue `Set-Cookie` only after the local commit succeeds.

The immutable outcome reference resolves to the stored classified result. The continuation remains bound to its pre-attach epoch and cannot authorize another mutation or family. The committed epoch authorizes only bounded terminal recovery of this exact committed result.

If provider succeeded but the epoch changed before local commit, no family, session, binding, digest, reissue material, or cookie is created; protected provider result is revoked when reliably supported or discarded to expire; public result is Auth Restart Required.

# BFF AUTH SESSION STATE MACHINE

| State | Authoritative behavior |
|---|---|
| Pre-auth container | No family is attached. Continuations may mutate only when their bound epoch equals the current epoch. |
| Provider exchange pending | External outcome may be uncertain. No local authenticated cookie exists and destructive auth transitions obey blocker rules. |
| Session commit pending | The local commit has not completed. No response or browser state may imply authentication. |
| Attached committed family | Exactly one committed family and logical session are attached at the committed epoch. |
| Committed response unknown | The family is attached, but initial HTTP delivery is unknown. Callback Reconciliation may use only the committed recovery tuple. |
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

When `callback_operation_state = session_committed`, recovery no longer relies only on the original bound epoch. It is permitted only when all of the following are true under `container_auth_transition_guard` and the Callback-operation guard:

1. `current_container_auth_epoch = committed_container_auth_epoch`;
2. the currently attached session family equals `committed_session_family_id`;
3. `committed_logical_session_id` belongs to that family;
4. continuation, Callback operation, container, selector, and committed outcome remain bound consistently;
5. `committed_outcome_reference` exists and resolves to the immutable stored classified outcome;
6. the committed logical session remains valid;
7. no later logout, Account Switch, forced termination, security revocation, or session-family replacement has occurred.

When all conditions pass, Callback Reconciliation may only replay the immutable stored classified outcome and reissue the exact same committed cookie capability for the same logical session and family. It must not call the provider again, create another family or logical session, increment the epoch, alter the outcome, attach another family, or create a same-family successor session.

If any condition fails, recovery fails closed using the applicable generic authentication/session or flow-capability result without revealing Invitation semantics.

# CALLBACK CAPABILITY REISSUE

## Exact cookie-capability reissue rule

Callback recovery reissues the same committed cookie capability bytes. It does not rotate to a new capability during Callback replay.

To support response-loss recovery:

- raw cookie capability bytes are absent from general plaintext database columns;
- server-protected encrypted or sealed reissue material is retained only for the bounded Callback recovery period;
- the material is cryptographically and structurally bound to `committed_container_auth_epoch`, `committed_session_family_id`, `committed_logical_session_id`, `committed_outcome_reference`, Callback operation ID, cookie capability version, and container;
- reissue material is never returned in JSON, logged, traced, audited, or used as a metric label;
- it cannot authorize a different session, family, Callback, or container;
- it is deleted or rendered unusable after the approved recovery retention expires, logout, Account Switch, forced termination, security revocation, or session-family replacement.

Because the same capability is reissued, Callback replay creates no overlapping old/new capability window, no second active capability, and no capability-generation counter increment.

## Later transition prohibition

Once `current_container_auth_epoch > committed_container_auth_epoch`, or the committed family/session is revoked, detached, expired, or replaced, old Callback reconciliation cannot reissue the cookie, restore authorization, lower the epoch, reattach the old family, call the provider, or create a session. Historical outcome storage is non-authorizing only.

# RESPONSE-LOSS RECOVERY

An HTTP response may be lost after the local `session_committed` transaction. A subsequent request resolves the same Callback operation, acquires the global lock order, rereads the committed tuple, and applies the post-commit terminal recovery conditions. Successful recovery returns the immutable stored outcome and the exact same committed cookie capability bytes. It does not repeat provider exchange or local session mutation.

Response loss before the local commit never authorizes a cookie. Unknown local commit is reconciled from authoritative Callback/session rows; absence of a fully committed tuple fails closed.

# MULTIPLE-TAB BEHAVIOR

Tabs sharing a flow container share its server-authoritative epoch and family attachment. Concurrent Callback replay for the same operation serializes under the container and Callback guards and returns the same committed outcome/capability when still valid. A later logout, Account Switch, forced termination, or family replacement in any tab advances the epoch or invalidates the family and prevents every tab from using old Callback recovery. Tabs cannot use a stale pre-attach epoch, raw key, selector, or browser cache to restore the old authorization.

# ATOMIC VOLUNTARY LOGOUT

`GET /functions/v1/logout-readiness` is advisory only.

`POST /functions/v1/logout`:

1. resolve trusted container and family;
2. acquire container auth-transition guard;
3. acquire authenticated logout guard;
4. establish transaction-local `logout_pending`;
5. acquire Callback-operation guards, Handoff locks, and session rows in the global order;
6. authoritatively reread all blocking Callback and Consume states;
7. blocking exists: roll back the transaction with no persisted pending state or epoch change, then return Logout Recovery Required;
8. no blocking exists:
   - increment `container_auth_epoch`;
   - revoke family/session and current/previous capability digests;
   - detach the family in the same transaction;
   - delete or render unusable old Callback reissue material and clear only recovery material proven safe to clear;
   - mark transition stable;
   - commit;
9. clear cookie only after commit.

Blocking work includes all states in the Account-Switch blocker set below. No first-login provider start, first-session commit, Consume binding, or unresolved recovery can cross the final guarded decision boundary. A blocked logout preserves the session, cookie, actor-session descriptor, raw Idempotency-Key, Callback state, Consume state, and recovery material.

# FORCED SECURITY LOGOUT AND ADMINISTRATIVE TERMINATION

Authorized server-side processes acquire the container guard first, the termination guard and authenticated logout guard when applicable, then Callback-operation guards, Handoff locks, session-family rows, and canonical rows. They reread blockers under the same container guard. Security policy may require termination even when recovery work exists; in that case the process preserves immutable operation evidence but advances the epoch once, revokes/detaches the family and capabilities, invalidates all cookie reissue material, and makes old operation recovery non-authorizing. It never releases or rebinds server coordination to another actor.

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

Blocking work includes at minimum:

- Callback `provider_exchange_started`;
- Callback `provider_exchange_succeeded`;
- Callback `session_commit_started`;
- Callback `unknown_provider_outcome`;
- Callback `response_unknown` while its operation is nonterminal;
- Callback `session_committed` whose response-loss recovery remains unresolved under the currently attached epoch/family;
- Consume `operation_bound` with unresolved result;
- unknown Consume commit;
- pending idempotent recovery requiring the current actor/session;
- any operation whose recovery capability would be destroyed by epoch advancement, family detach, or descriptor invalidation.

When blocking work exists, roll back the entire transaction. Do not increment the epoch; persist `account_switch_pending` or a transition row; revoke or detach the family; invalidate the logical session, cookie, descriptor, or earlier continuation; delete the raw Idempotency-Key; remove Callback/Consume state; clear recovery material; or create a new Auth continuation. Rollback leaves every pre-switch state unchanged.

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

# EXISTING-SESSION REAUTHENTICATION AND CAPABILITY PATHS

Existing-session reauthentication continuation binds trusted current family + container + current epoch.

Provider start and reauth session commit obtain container guard, authenticated logout guard, then callback/session synchronization. They revalidate epoch, family attachment, session state, and transition state.

Provider refresh and non-Callback capability maintenance may remain capability-only only when they neither read nor mutate the container epoch or family attachment:

- acquire authenticated logout guard;
- acquire logical-session synchronization;
- reject `logout_pending`, revoked, detached, replaced, expired, or provider-invalid state;
- never acquire container guard later in the transaction;
- abort/restart through a container-transition path if attachment must change.

Terminal Callback cookie reissue is not this generic path. Because it compares `current_container_auth_epoch` to the committed epoch, it acquires the container guard first and follows Callback Reconciliation. It reissues the exact same committed capability and does not rotate it.

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

After the authoritative no-blocker decision, a successful auth transition may invalidate the old descriptor and clear only server recovery material proven no longer required. A later actor/family cannot rebind the key. Natural tab loss, approved terminal classification, forced security loss, or actor/family change ends browser recovery according to the existing retention contract.

# CALLBACK ZERO-OPERATION RECOVERY

Zero callback operations resolves to Auth Restart Required:

- no provider call;
- no BFF session creation/reissue;
- no provider-failure or unknown-provider-outcome claim;
- continuation retention follows authoritative deadline.

# UX AND PUBLIC CLASSIFICATION

- A blocked logout or Account Switch leaves the current session and recovery material intact and returns the applicable generic recovery-required class.
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
| 281 | Provider refresh successor commit serializes with atomic logout. |
| 282 | Callback capability reissue serializes with atomic logout. |
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
- Required assertions: `pre_attach_container_auth_epoch = E`; `committed_container_auth_epoch = E + 1`; the immutable stored outcome is recovered; the exact same cookie capability may be reissued; the same family and logical session are used; no provider call occurs; no second session or family is created.
- Negative assertions: The epoch does not advance again and no new cookie capability is generated.
- Required evidence: Transaction trace for both epoch fields and committed tuple, family/session row identities, immutable outcome reference, capability-byte or approved digest equivalence proof, provider-call count, and epoch history.
- Shared-CI suitability: Deterministic local database/concurrency fixture with injected HTTP response loss; no live provider, production secret, or wall-clock dependency.

## Test 297 — Committed Callback recovery requires the committed epoch

- Purpose: Prove that post-commit recovery uses the committed epoch/family/session/outcome tuple rather than only the continuation-bound pre-attach epoch.
- Setup: A `session_committed` Callback with both epoch fields, committed references, and sealed cookie reissue material; table-driven variants alter one tuple member at a time.
- Execution: Run Callback Reconciliation for a fully matching tuple, then for mismatched current epoch, attached family, logical-session ownership, and outcome reference.
- Required assertions: Recovery succeeds only when current epoch equals `committed_container_auth_epoch`, attached family equals `committed_session_family_id`, and the committed logical session and outcome references match.
- Negative assertions: Matching only `pre_attach_container_auth_epoch` is insufficient; no mismatch reissues a cookie or mutates session state.
- Required evidence: Guard/lock trace, authoritative reread snapshot, tuple comparison results, response classification, and absence/presence of `Set-Cookie`.
- Shared-CI suitability: Table-driven local fixture using deterministic UUIDs and no external network calls.

## Test 298 — Later logout, Account Switch, or forced termination blocks old Callback cookie reissue

- Purpose: Prove that every later authorized auth transition permanently invalidates the older committed Callback capability.
- Setup: A recoverable `session_committed` Callback at committed epoch `E + 1` with the family attached; one case each for logout, Account Switch, and forced termination.
- Execution: Commit the later transition so the current epoch is greater than the committed epoch, then invoke old Callback Reconciliation.
- Required assertions: The later transition advances the epoch beyond the committed epoch; old Callback reconciliation cannot reissue the cookie; the old family cannot be restored or reattached; no provider call or new logical session occurs.
- Negative assertions: Reconciliation cannot lower the epoch, create a replacement family, expose Invitation semantics, or use retained historical outcome as authorization.
- Required evidence: Before/after epoch and attachment history, reissue-material invalidation evidence, provider/session creation counts, and generic public classification.
- Shared-CI suitability: Deterministic local concurrency cases for each transition, with fake provider-call counters only.

## Test 299 — Successful Callback replay never increments the epoch again

- Purpose: Prove exact replay idempotency after the successful local session commit.
- Setup: One valid committed Callback tuple with current epoch equal to committed epoch and an attached valid family/session.
- Execution: Perform repeated exact Callback Reconciliation, including concurrent retries and simulated response loss.
- Required assertions: Every replay preserves the committed epoch, session family, logical session, stored outcome, and cookie capability version.
- Negative assertions: No second family, second logical session, provider exchange, auth-epoch increment, or capability generation occurs.
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
- Setup: An active session/family/cookie/descriptor, raw Idempotency-Key, Callback recovery state, Consume recovery state, and a blocker.
- Execution: Attempt Phase A and then exercise the still-authorized existing recovery path.
- Required assertions: The old session remains active; the family remains attached; current cookie and descriptor remain valid; raw Idempotency-Key remains; Callback and Consume recovery state remain; no new continuation exists.
- Negative assertions: No old-state artifact is revoked, detached, deleted, cleared, rebound, or replaced.
- Required evidence: Before/after row and digest snapshots, browser-state fixture, raw-key presence proof, recovery result, and continuation count.
- Shared-CI suitability: Local fixture with opaque test capabilities and no production credential material.

## Test 302 — Successful Account Switch advances epoch only after authoritative blocking-state reread

- Purpose: Prove the no-race atomic gate and global lock hierarchy.
- Setup: Active old family with nonblocking terminal operation rows, plus instrumented concurrent Callback and Consume attempts.
- Execution: Run Phase A while recording lock acquisition, deterministic row reread, no-blocker classification, epoch advance, and family detach.
- Required assertions: `container_auth_transition_guard` is acquired first; Callback, Handoff, and session rows follow the global lock matrix; blocking rows are reread; no blocker exists; only then are the epoch advanced and family detached.
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

## Required evidence

- ordered container/auth/pre-auth/session/Handoff/row lock traces;
- pre-attach and committed epoch values at continuation creation, provider start, logout/Account Switch, session commit, and Callback replay;
- callback state and provider-call counts;
- family attach/detach history;
- committed outcome and exact-cookie reissue equivalence evidence, capability-digest, sealed-material lifecycle, and `Set-Cookie` ordering;
- blocked Account-Switch rollback plus durable Phase B retry/response-loss evidence;
- absence of browser-controlled epoch or guard authority.

# ARCHITECTURE REMEDIATION MATRIX

| Finding | Finding summary | Resolution sections | Tests | Specification remediation | Repository validation | Approval | Final closure |
|---|---|---|---|---|---|---|---|
| INT-ARCH-10.4-P0-01 | Container authentication transitions lacked one authoritative epoch and global lock order. | Container Auth Epoch Model; Global Auth Guard and Lock Order; First-Login Provider-Start; First Logical-Session Commit; Atomic Voluntary Logout; Forced Termination; Account Switch | 290–295 | ADDRESSED | REQUIRED | REQUIRED | VALIDATION REQUIRED |
| INT-ARCH-10.5-P0-01 | Successful Callback terminal recovery lacked the committed dual-epoch, session-family, logical-session and outcome model. | Terminal Callback Recovery; First Logical-Session Commit; Callback Reconciliation; Exact Cookie-Capability Reissue; Container Auth Epoch | 296–299 | ADDRESSED | REQUIRED | REQUIRED | INTERMEDIATE REVIEW REQUIRED |
| INT-ARCH-10.5-P0-02 | Account Switch advanced authentication state before atomically proving that no blocking Callback or Consume recovery existed. | Atomic Account-Switch Gate; Durable Account-Switch Transition; Global Auth Guard and Lock Order; Phase B Continuation Recovery | 300–303 | ADDRESSED | REQUIRED | REQUIRED | INTERMEDIATE REVIEW REQUIRED |

# INTERMEDIATE ARCHITECTURE REVIEW GATE

Revision 10.6 is submitted only for Intermediate Architecture Review.

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

Revision 10.6 contains:

- one Revision 10.6 title;
- one Terminal Callback Recovery and Account-Switch Closure Edition heading;
- D001–D030 exactly once;
- one container-auth epoch model;
- one global container-auth guard/lock-order matrix;
- one first-login provider-start algorithm;
- one first logical-session commit algorithm;
- one atomic voluntary logout algorithm;
- one forced termination model;
- one two-transaction durable Account-Switch model;
- one exact same committed cookie-capability recovery rule;
- Tests 1–303 represented, with Tests 296–303 specified once each;
- one Architecture Remediation Matrix;
- one Intermediate Architecture Review Gate;
- no Runtime, SQL, migration, RPC, Edge, or UI implementation;
- no Revision 11 HTTP-header, CORS, exact-byte, package, manifest, ZIP, or sidecar finalization.

SUBMIT REVISION 10.6 FOR INTERMEDIATE ARCHITECTURE REVIEW
