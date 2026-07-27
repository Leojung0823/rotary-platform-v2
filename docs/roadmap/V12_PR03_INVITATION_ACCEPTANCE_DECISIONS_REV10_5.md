# PR-03 FORMAL SPECIFICATION — REVISION 10.5

## Container Authentication Transition Closure Edition

## Specification Status

- Planning document: READY FOR INTERMEDIATE ARCHITECTURE REVIEW
- Runtime implementation: BLOCKED
- Ninth independent review: REQUEST CHANGES
- Revision 10.4 intermediate architecture review: ARCHITECTURE REVISION REQUIRED
- Revision 10.5 review status: NOT YET REVIEWED
- Formal specification approval requested: No
- Human/legal approval represented: No
- Repository validation status: NOT VERIFIED IN THIS SPECIFICATION RUN
- Model: gpt-5.6-sol / isolated architecture correction run

Revision 10.5 closes only the container-authentication epoch and guard-ordering blocker identified during the Revision 10.4 Intermediate Architecture Review. It does not perform Revision 11 HTTP-header, CORS, exact-byte, fixture, package, manifest, ZIP, sidecar, or governance finalization and does not authorize Runtime implementation.

# DOCUMENT PURPOSE, AUTHORITY, AND SCOPE

## Purpose

Revision 10.5 preserves the converged Revision 10–10.4 architecture and adds:

1. server-authoritative `container_auth_epoch`;
2. continuation binding to one exact container epoch;
3. epoch validation before first-login provider start and before first logical-session commit;
4. one container auth-transition guard shared by first-login, logout, forced termination, account switch, and session-family attach/detach/replace;
5. a global guard/lock order that eliminates container/auth domain inversion;
6. atomic logout epoch increment and final blocking-work decision;
7. Tests 290–295 and synchronized architecture remediation.

## Preserved architecture

- OAuth state and PKCE verifier are persisted before top-level navigation.
- Callback recovery is continuation-based and zero callback operation maps to Auth Restart Required.
- Provider network I/O is not locally ACID and never holds a logout guard.
- Existing-session cookie-capability reissue and provider refresh serialize through the authenticated logout guard.
- Raw BFF cookie bytes are never stored server-side.
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
| Container auth-transition guard | Transaction advisory lock derived from trusted flow-container UUID and a fixed domain/version prefix. |
| Authenticated logout guard | Guard derived from trusted session-family UUID + flow-container UUID. |
| Pre-auth callback guard | Guard derived from server-only pre-auth subject UUID + flow-container UUID. |
| Container auth transition | First-login provider start/commit, voluntary logout, forced logout, account-switch initiation, first family attach, family detach, or family replacement. |
| Existing-session capability transition | Cookie reissue or provider refresh that does not change the container-to-family binding. |
| Blocking callback state | `provider_exchange_started`, `provider_exchange_succeeded`, or `session_commit_started` for the applicable container/epoch. |
| Blocking Consume state | `operation_bound` with unresolved authoritative outcome. |
| Epoch mismatch | Continuation bound epoch differs from current authoritative `container_auth_epoch`. |
| Auth Restart Required | Generic fail-closed result requiring a new continuation and prohibiting provider/session continuation. |

# FIXED ARCHITECTURAL PRINCIPLES

1. A first-login continuation is valid only for the exact container epoch at creation.
2. Voluntary logout, forced security logout, administrative termination, and account-switch initiation increment the epoch atomically.
3. Session-family attach, detach, or replacement increments the epoch unless the same declared transition already incremented it in the same transaction.
4. First-login provider start and first logical-session commit both acquire the container guard and revalidate the bound epoch.
5. Container transition guard precedes authenticated logout or pre-auth callback guard whenever both are required.
6. Capability-only existing-session paths may acquire only the authenticated logout guard, but must never later acquire the container guard in the same transaction.
7. Provider network I/O holds neither container nor logout guard.
8. A provider result produced for a stale epoch cannot create a logical session or usable cookie.
9. Logout makes its final blocking-work decision while holding the container guard and authenticated logout guard.
10. A created-but-not-started first-login callback does not block logout; the epoch increment invalidates it.
11. A first-login callback that commits `provider_exchange_started` first blocks voluntary logout until classified or expired.
12. Browser input cannot supply an epoch, pre-auth subject, session family, or guard key as authority.
13. Runtime implementation remains `BLOCKED`.

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

OAuth continuation is persistent, callback recovery is continuation-based, cookie capabilities are digest-backed, and existing-session versus first-login guard identities are explicit.

## PR03-D027 — No client abandonment

No operation-abandonment endpoint exists. Voluntary logout is blocked during unresolved work. Forced security termination cannot release or rebind server operation coordination.

## PR03-D028 — Response precedence

Imported PR-02 remains semantic fixture authority. Revision 11 finalizes PR-03-owned exact headers and shared response profiles.

## PR03-D029 — Complete synchronization hierarchy

Exchange tuple lock precedes Exchange semantics; Invitation-generation lifecycle locks stabilize generation membership; Handoff locks protect each Handoff lifecycle; container auth-transition and Auth/logout guards serialize authentication transitions.

## PR03-D030 — Invitation bearer authority

Invitation bearer authority remains proposed, approval-required, and Runtime-blocking.

# CONTAINER AUTH EPOCH MODEL

## Storage

Each server flow container stores:

```text
container_auth_epoch: uint64
container_auth_transition_state: stable | logout_pending | account_switch_pending | forced_termination_pending
attached_session_family_id: UUID | null
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

## Epoch increment events

Increment exactly once in the transaction that commits:

- successful voluntary logout;
- forced security logout or authorized administrative termination;
- account-switch initiation;
- session-family attach, detach, or replacement occurring outside a transition that already incremented the epoch.

For account switch, initiation increments the epoch and sets `account_switch_pending`; detach/attach steps in that same identified transition do not increment it again.

# GLOBAL AUTH GUARD AND LOCK ORDER

When a path requires multiple domains:

```text
1. container_auth_transition_guard
2. authenticated_logout_guard OR pre_auth_callback_guard
3. logical_session OR callback_operation synchronization
4. Handoff advisory locks in deterministic order
5. Invitation-first row-lock order
```

Rules:

- No path may acquire container guard after authenticated/pre-auth guard.
- Existing-session capability reissue and provider-refresh phases acquire authenticated logout guard and logical-session synchronization only; they do not change container-family binding.
- If a capability path discovers that a container-family transition is needed, it aborts and restarts through the container-transition path.
- Lock timeout maps to a generic non-semantic service class.

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

After provider success:

1. acquire container auth-transition guard;
2. acquire pre-auth callback guard;
3. acquire callback-operation/session-commit synchronization;
4. reread epoch, transition state, attached family, bound epoch, callback operation, and provider-result classification;
5. require bound epoch equals current epoch;
6. require no attached family and no conflicting transition state;
7. create one logical session family and logical session;
8. attach the family to the container;
9. generate actor-session binding ID and cookie-capability digest;
10. increment `container_auth_epoch` once for first-family attachment;
11. commit;
12. emit Set-Cookie only after commit.

The continuation remains bound to its pre-attach epoch and cannot create another family.

If provider succeeded but epoch changed, no family/session/binding/digest/cookie is created; protected provider result is revoked when reliably supported or discarded to expire; public result is Auth Restart Required.

# ATOMIC VOLUNTARY LOGOUT

`GET /functions/v1/logout-readiness` is advisory only.

`POST /functions/v1/logout`:

1. resolve trusted container and family;
2. acquire container auth-transition guard;
3. acquire authenticated logout guard;
4. set `logout_pending`;
5. acquire required logical-session/callback synchronization and Handoff locks;
6. reread all blocking callback and Consume states;
7. blocking exists: clear `logout_pending`, commit no epoch change, return Logout Recovery Required;
8. no blocking exists:
   - increment `container_auth_epoch`;
   - revoke family/session and current/previous capability digests;
   - detach the family in the same transaction;
   - mark transition stable;
   - commit;
9. clear cookie only after commit.

No first-login provider start or first-session commit can cross this guarded decision boundary.

# FORCED SECURITY LOGOUT AND ADMINISTRATIVE TERMINATION

Authorized server-side processes acquire container guard first, authenticated logout guard when a family exists, then session/callback synchronization, Handoff locks, and row locks. They increment epoch, revoke/detach sessions and capabilities, preserve server operation evidence to terminal state or expiry, and prevent stale provider results from creating a session.

Browser input cannot request forced mode.

# ACCOUNT SWITCH

1. acquire container guard;
2. acquire authenticated logout guard;
3. increment epoch;
4. set `account_switch_pending`;
5. invalidate earlier continuations;
6. reconcile/block unresolved callback and Consume work;
7. detach/revoke old family when safe;
8. create a new continuation bound to current epoch;
9. attach successor family only through the guarded commit rules;
10. mark transition stable.

Old continuations fail with Auth Restart Required.

# EXISTING-SESSION REAUTHENTICATION AND CAPABILITY PATHS

Existing-session reauthentication continuation binds trusted current family + container + current epoch.

Provider start and reauth session commit obtain container guard, authenticated logout guard, then callback/session synchronization. They revalidate epoch, family attachment, session state, and transition state.

Callback cookie-capability reissue and provider refresh are capability-only paths:

- acquire authenticated logout guard;
- acquire logical-session synchronization;
- reject `logout_pending`, revoked, detached, replaced, expired, or provider-invalid state;
- never acquire container guard later in the transaction;
- abort/restart through a container-transition path if attachment must change.

# INVITATION-GENERATION AND HANDOFF SYNCHRONIZATION

Revision 10.4 rules remain normative:

- Exchange reads candidate generation, acquires lifecycle lock, rereads generation, then locks rows.
- Resend/Revoke reread current generation immediately after lifecycle-lock acquisition and again after Handoff/row locks.
- Multi-generation cleanup/repair revalidates applicability after all lifecycle locks and again after row locks.
- Every Handoff mutation or synchronized classification obtains its Handoff advisory lock.
- Multiple lifecycle/Handoff locks use deterministic unsigned numeric ordering with stable tie-breaks.

# CALLBACK ZERO-OPERATION RECOVERY

Zero callback operations resolves to Auth Restart Required:

- no provider call;
- no BFF session creation/reissue;
- no provider-failure or unknown-provider-outcome claim;
- continuation retention follows authoritative deadline.

# TESTING AND CI SPECIFICATION

Tests 1–260 retain their approved architecture meaning.

## Existing architecture tests 261–289

| # | Required architecture assertion |
|---|---|
| 261 | PKCE verifier persists before top-level navigation. |
| 262 | Client continuation record is complete and read-back verified. |
| 263 | Continuation creation response loss is idempotently recoverable. |
| 264 | Callback can be reconciled before a callback-operation reference reaches the browser. |
| 265 | Callback replay rotates cookie capability for the same logical session. |
| 266 | Raw cookie capability is absent from database storage. |
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
| 292 | Account switch invalidates old continuation | Account-switch initiation increments epoch under container + authenticated guards. | Old continuation cannot start provider or attach/replace a family. |
| 293 | Forced security logout invalidates pending pre-auth continuation | Forced logout increments epoch under container guard. | Pending provider result cannot create session or cookie. |
| 294 | Container guard precedes authenticated/pre-auth guards globally | Instrument every path requiring both domains and verify ordered acquisition. | No domain inversion or later container acquisition occurs. |
| 295 | Provider success with stale container epoch creates no logical session | Provider succeeds, then logout/account switch changes epoch before commit; callback returns restart-required classification. | No family/session/binding/digest/cookie persists or emits. |

## Required evidence

- ordered container/auth/pre-auth/session/Handoff/row lock traces;
- epoch values at continuation creation, provider start, logout/account switch, and session commit;
- callback state and provider-call counts;
- family attach/detach history;
- capability-digest and Set-Cookie ordering;
- rollback/retry and Auth Restart Required audit;
- absence of browser-controlled epoch or guard authority.

# ARCHITECTURE REMEDIATION MATRIX

| Finding | Resolution | Tests | Architecture status | Final closure |
|---|---|---|---|---|
| INT-ARCH-10.4-P0-01 | Container Auth Epoch Model; Global Auth Guard and Lock Order; First-Login Provider-Start; First Logical-Session Commit; Atomic Voluntary Logout; Forced Logout; Account Switch | 290–295 | ADDRESSED | VALIDATION REQUIRED |

# INTERMEDIATE ARCHITECTURE REVIEW GATE

Revision 10.5 is submitted only for Intermediate Architecture Review.

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

The Revision 10.5 architecture finding is resolved here and is not deferred to Revision 11.

# CLEAN DOCUMENT ASSERTIONS

Revision 10.5 contains:

- one Revision 10.5 title;
- one Container Authentication Transition Closure Edition heading;
- D001–D030 exactly once;
- one container-auth epoch model;
- one global guard/lock order;
- one first-login provider-start algorithm;
- one first logical-session commit algorithm;
- one atomic voluntary logout algorithm;
- one forced logout and account-switch model;
- Tests 261–295 exactly once;
- one Architecture Remediation Matrix;
- one Intermediate Architecture Review Gate;
- no Runtime, SQL, migration, RPC, Edge, or UI implementation;
- no Revision 11 HTTP-header, CORS, exact-byte, package, manifest, ZIP, or sidecar finalization.

SUBMIT REVISION 10.5 FOR INTERMEDIATE ARCHITECTURE REVIEW
