# PR-03 FORMAL SPECIFICATION — REVISION 10.4

## Architecture Synchronization Final Closure Edition

## Specification Status

- Planning document: READY FOR INTERMEDIATE ARCHITECTURE REVIEW
- Runtime implementation: BLOCKED
- Ninth independent review: REQUEST CHANGES
- Revision 10.3 intermediate architecture review: ARCHITECTURE REVISION REQUIRED
- Revision 10.4 review status: NOT YET REVIEWED
- Formal specification approval requested: No
- Human/legal approval represented: No
- Repository validation status: NOT VERIFIED IN THIS SPECIFICATION RUN
- Model: gpt-5.6-sol / isolated architecture correction run

Revision 10.4 closes only the Auth-capability/logout synchronization, current-generation lifecycle-lock revalidation, and pre-auth callback guard-identity blockers identified during the Revision 10.3 Intermediate Architecture Review. It does not perform Revision 11 HTTP-header, CORS, exact-byte, fixture, package, manifest, ZIP, sidecar, or governance finalization and does not authorize Runtime implementation.

# DOCUMENT PURPOSE, AUTHORITY, AND SCOPE

## Purpose

Revision 10.4 preserves the converged Revision 10–10.3 architecture and adds:

1. one logout-guard discipline for every existing-session Auth capability creation, rotation, ownership claim, commit, and emission;
2. a server-only first-login pre-auth guard identity that does not invent a logical session family;
3. provider-refresh ownership and successor commit as two separately guarded phases around external provider I/O;
4. callback cookie-capability reissue serialized with logout;
5. current-generation revalidation immediately after Invitation-generation lifecycle-lock acquisition and again before mutation;
6. multi-generation applicability revalidation after all lifecycle locks and after all row locks;
7. Tests 281–289 and synchronized architecture remediation.

## Preserved architecture

The following remain normative:

- OAuth state and PKCE verifier are persisted and read-back verified before top-level navigation.
- Callback recovery uses flow-container cookie + continuation reference + flow selector and does not depend on the first response carrying a callback-operation reference.
- Zero callback operation resolves to Auth Restart Required with no provider call and no BFF session creation.
- Raw BFF cookie capability bytes are never stored in the database; only keyed digests are stored.
- Voluntary logout is an atomic server gate; browser requests cannot select forced-security logout.
- Exact Exchange tuple recovery precedes new-flow capacity allocation.
- Exchange tuple advisory lock precedes Invitation semantic reads.
- Handoff advisory locks cover all Handoff mutations, projections, mappings, cleanup, and repair.
- Operation deadlines are clamped to recoverable selector/container/cookie capability.
- Unknown Consume commit never deletes the raw Idempotency-Key through a local timer.
- Reconciliation performs complete post-lock authoritative reread.
- Runtime implementation remains `BLOCKED`.

## Authority order

1. Specification Status.
2. Normative Decision Register.
3. Auth Guard Identity and Ordering.
4. Callback Capability Reissue and Provider Refresh algorithms.
5. Atomic Logout Fence.
6. Invitation-Generation Lifecycle Advisory Lock and batch-mutation algorithms.
7. Callback recovery classification.
8. Testing, Architecture Remediation Matrix, and Intermediate Architecture Review Gate.

## Excluded

- Runtime, SQL, migration, RPC, Edge, or UI implementation.
- A new implementation branch or new PR.
- Revision 11 response headers, CORS, exact response bytes, fixture packaging, manifest, ZIP, sidecars, and governance closure.

# DOMAIN DEFINITIONS

| Term | Architecture definition |
|---|---|
| Logical BFF session | One server-side authenticated session identity, independent of rotating browser cookie capabilities. |
| Session family | Server-only lineage connecting a logical session and approved refresh successors for the same actor. |
| Cookie capability | Random opaque browser bearer; only a keyed digest is persisted. |
| Callback capability reissue | New cookie capability for the same logical session; logical session ID, family, and actor-session binding ID remain unchanged. |
| Provider refresh ownership claim | Durable single-owner claim committed before external provider refresh I/O. |
| Provider refresh successor commit | Post-provider local transaction that may create a successor logical session only after reacquiring and passing the authenticated logout guard. |
| Authenticated logout guard | Synchronization key derived from canonical session-family UUID + flow-container UUID. |
| Pre-auth guard subject | Server-only random UUID created with a first-login continuation when no session family exists. |
| Pre-auth callback guard | Synchronization key derived from pre-auth guard subject + flow-container UUID. |
| Container auth-transition guard | Container-level guard preventing first-session commit from racing logout, account switch, or conflicting session binding. |
| `logout_pending` | Server transient fence set by voluntary logout while blocking callback/Consume state is authoritatively reread. |
| Invitation-generation lifecycle lock | Advisory lock derived from Invitation UUID + candidate generation + fixed domain prefix. |
| Candidate generation | Generation read before lifecycle-lock acquisition and not yet authoritative for mutation. |
| Current-generation revalidation | Authoritative reread proving the held lifecycle lock still corresponds to the Invitation current generation. |
| Generation applicability set | Generations that remain valid targets for cleanup or repair after all lifecycle and row locks are held. |
| Auth Restart Required | Generic fail-closed callback recovery class for zero callback operation or unsafe provider recovery. |

# FIXED ARCHITECTURAL PRINCIPLES

1. Every existing-session Auth capability creation, rotation, ownership claim, commit, or emission is synchronized with the same authenticated logout guard.
2. Guard ordering is: applicable Auth/logout guard → logical-session synchronization → capability/session mutation.
3. Provider network I/O never holds the logout guard.
4. Provider refresh acquires the guard before ownership claim and reacquires it before successor-session commit.
5. If logout wins after provider dispatch, no successor session or usable cookie capability is created.
6. Callback capability reissue cannot modify current/previous capability digests after logout commit.
7. A late browser Set-Cookie response cannot restore server authorization after logout.
8. Existing-session reauthentication binds to the trusted current session family and flow container.
9. First login uses a server-only pre-auth guard subject and never fabricates a session-family UUID.
10. First-login session commit also obtains the container auth-transition guard before creating the first logical session family.
11. Browser input cannot select any guard mode, session family, pre-auth subject, or forced-security logout mode.
12. Candidate Invitation generation is revalidated immediately after lifecycle-lock acquisition.
13. Current generation and affected Handoff set are revalidated again after Handoff and row locks and before mutation.
14. Multi-generation work revalidates every generation's applicability after all lifecycle locks and again after row locks.
15. An old-generation lifecycle lock cannot authorize mutation of a newer current generation.
16. Runtime implementation remains `BLOCKED`.

# NORMATIVE DECISION REGISTER

Every decision is a model recommendation. `ADDRESSED` means architecture text exists; it is not approval or runtime validation.

## PR03-D001 — BFF authentication prerequisite

Consume and actor-bound Reconciliation require a valid dedicated-origin BFF Auth session. Session failure is classified before Invitation semantic lookup.

## PR03-D002 — Server-side actor authority

Only the server-side logical BFF session supplies the trusted actor. Browser bodies, headers, descriptors, callback references, or provider tokens cannot select the actor.

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

The browser binds the raw Idempotency-Key to the opaque actor-session binding ID. Unknown commit preserves the key until server-classified terminal/capability state, approved same-family recovery, forced security loss, actor/family change, or natural tab loss.

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

Exchange tuple lock precedes Exchange semantics; Invitation-generation lifecycle locks stabilize generation membership; Handoff locks protect each Handoff lifecycle; Auth/logout guards serialize Auth capability issuance with logout.

## PR03-D030 — Invitation bearer authority

Invitation bearer authority remains proposed, approval-required, and Runtime-blocking.

# AUTH GUARD IDENTITY AND ORDERING

## Existing-session guard mode

A server continuation created while a valid logical BFF session exists is fixed to:

```text
guard_mode = existing_session_family
existing_session_family_id = trusted current family UUID
flow_container_id = trusted current container UUID
```

The authenticated logout guard key is derived from:

```text
HMAC-SHA-256(
  auth-logout-guard-secret,
  "pr03-auth-logout-guard.v1" || family_uuid || container_uuid
)
```

Browser input cannot supply or replace `existing_session_family_id`.

This guard is required by:

- existing-session callback `created → provider_exchange_started`;
- existing-session callback session/reauth commit;
- callback cookie-capability reissue;
- provider-refresh ownership claim;
- provider-refresh successor-session commit;
- Consume `issued → operation_bound`;
- voluntary logout;
- forced security logout.

## First-login pre-auth guard mode

When continuation creation has no valid existing BFF session:

```text
guard_mode = first_login_pre_auth
pre_auth_guard_subject_id = server-generated random canonical UUID
flow_container_id = trusted current container UUID
```

The server stores the pre-auth subject in the continuation. It is never returned to the browser and is not a logical session family.

The pre-auth callback guard key is derived from:

```text
HMAC-SHA-256(
  auth-logout-guard-secret,
  "pr03-pre-auth-callback-guard.v1" || pre_auth_subject_uuid || container_uuid
)
```

First-login provider start uses callback-operation synchronization plus the pre-auth callback guard. Before first logical-session commit, the service acquires:

1. pre-auth callback guard;
2. container auth-transition guard;
3. callback-operation/session-commit synchronization.

It then rereads the continuation, callback operation, container state, conflicting logout/account-switch state, and existing session binding. Only if no conflict exists may it create the first logical session family.

## Common existing-session capability order

Every existing-session capability mutation uses:

1. acquire authenticated logout guard;
2. reject `logout_pending`, `revoked`, `terminated`, `expired`, `provider_invalid`, or family/container mismatch;
3. acquire logical-session synchronization;
4. reread session family, session generation, current/previous capability digests, and actor binding;
5. perform the permitted capability/session mutation;
6. commit before emitting Set-Cookie.

# GUARDED CALLBACK COOKIE-CAPABILITY REISSUE

Callback replay or callback Reconciliation may reissue a cookie capability only for an already committed logical session.

Algorithm:

1. Resolve callback operation and committed logical session without emitting a cookie.
2. Acquire the authenticated logout guard for the committed session family and flow container.
3. Reject if `logout_pending`, revoked, terminated, expired, provider-invalid, family/container mismatch, or callback outcome mismatch.
4. Acquire logical-session synchronization.
5. Reread the logical session and capability digests.
6. Generate a fresh random cookie capability.
7. Atomically move current digest to previous digest and persist the new current digest.
8. Keep logical session ID, session family, actor, and actor-session binding ID unchanged.
9. Commit.
10. Emit the new cookie only from committed state.

If logout commits first, reissue returns Generic Authentication/Session Required and emits no cookie. If reissue commits first, logout subsequently revokes the logical session and both current/previous digests. A late HTTP response may place a stale cookie in the browser, but the server rejects it and clears it on the next request; it cannot restore authorization.

# TWO-PHASE GUARDED PROVIDER REFRESH

Provider network I/O never holds the logout guard.

## Phase A — ownership claim before provider I/O

1. Acquire authenticated logout guard.
2. Reject `logout_pending`, revoked, terminated, expired, provider-invalid, family/container mismatch, or an existing valid refresh owner.
3. Acquire logical-session synchronization.
4. Persist a unique refresh ownership claim containing session family, source logical session, source rotation generation, nonce, start time, and deadline.
5. Commit and release locks.
6. Call the external provider.

## Phase B — successor commit after provider I/O

1. Reacquire the same authenticated logout guard.
2. Reject if logout committed, `logout_pending` exists, session/family is revoked/terminated/expired/provider-invalid, source generation changed incompatibly, or refresh ownership no longer matches.
3. Acquire logical-session synchronization.
4. Reread the ownership claim, source session, actor, family, container, and provider result classification.
5. If valid, create one successor logical session, new actor-session binding ID, and new cookie capability digest; mark the source logical session rotated; close the ownership claim.
6. Commit.
7. Emit the successor cookie only after commit.

## Logout-won provider result

If provider I/O completed but voluntary or forced logout committed before Phase B:

- no successor logical session is created;
- no new actor-session binding ID is created;
- no usable cookie capability is emitted;
- the protected provider result is revoked when the provider reliably supports revocation, otherwise discarded and allowed to expire under the provider security policy;
- the refresh ownership claim closes as `logout_won`;
- the public result is Generic Authentication/Session Required or the Revision 11-approved equivalent.

# ATOMIC LOGOUT FENCE

`GET /functions/v1/logout-readiness` is advisory UI information only. It never authorizes logout.

`POST /functions/v1/logout` performs the authoritative voluntary gate:

1. resolve trusted session family and flow container;
2. acquire authenticated logout guard;
3. set `logout_pending` inside the server transaction;
4. block new Consume binding, existing-session callback provider-start/session commit, callback capability reissue, provider-refresh ownership claim, and provider-refresh successor commit through the same guard;
5. acquire required Handoff locks in deterministic order;
6. reread every shared-container blocking callback and Consume state;
7. if blocking work exists, clear `logout_pending`, commit no logout, and return Logout Recovery Required;
8. if no blocking work exists, revoke the logical session family/current session/current and previous capability digests, clear protected provider refresh capability as supported, and commit logout;
9. emit cookie clearing only after commit.

Forced security logout is triggered only by a server-side security event, authorized administrative process, provider/session invalidation, or disabled/revoked Auth user. A browser request body, query, header, or route parameter cannot choose forced mode.

# INVITATION-GENERATION LIFECYCLE ADVISORY LOCK

## Key derivation

The lifecycle advisory key is derived from:

```text
HMAC-SHA-256(
  invitation-generation-lock-secret,
  "pr03-invitation-generation-lifecycle.v1"
  || invitation_uuid
  || candidate_generation
)
```

It freezes one candidate generation's Handoff membership only after post-acquisition current-generation revalidation succeeds.

## Single-current-generation algorithm

Resend, current-generation Revoke, current-generation cleanup, and current-generation repair use:

1. authoritatively read candidate current generation `G`;
2. acquire lifecycle advisory lock for Invitation + `G`;
3. immediately reread Invitation current generation;
4. if current generation is not `G`, rollback/release and restart from step 1;
5. discover the complete affected Handoff set for `G`;
6. derive and sort every Handoff advisory key by unsigned numeric value, then stable full Handoff UUID tie-break;
7. acquire all Handoff advisory locks;
8. acquire Invitation-first row locks;
9. reread Invitation current generation and complete affected Handoff set;
10. if generation is not `G` or the set differs, rollback and restart;
11. perform mutation, mapping/index updates, and durable audit atomically.

An old-generation lock never authorizes mutation of a newer current generation.

## Exchange order

Exchange uses:

1. Exchange tuple advisory lock;
2. authoritative Invitation/token/generation lookup yielding candidate `G`;
3. lifecycle advisory lock for Invitation + `G`;
4. immediate token/generation reread;
5. mismatch: rollback and restart;
6. Invitation/generation row locks;
7. second generation/token reread;
8. exact/partial/new tuple classification;
9. Handoff creation only while `G` remains current.

## Resend

Resend uses the single-current-generation algorithm. After the second generation/set validation it rotates to the next generation, revokes the complete affected set, updates selector/recovery/active-capacity indexes, and commits atomically.

A second Resend that waited on the old generation lock must detect the new current generation and restart; it cannot rotate using stale generation authority.

## Revoke

A current-generation Revoke uses the same immediate and final current-generation validation. If another Resend changed the generation while Revoke waited, Revoke restarts before Handoff-set discovery or mutation.

## Multi-generation cleanup or repair

For work spanning multiple Invitations or generations:

1. read the candidate generation applicability set;
2. derive every lifecycle key;
3. sort by unsigned numeric key and stable Invitation UUID/generation tie-break;
4. acquire all lifecycle locks;
5. reread every candidate generation's applicability;
6. if any candidate is no longer applicable, rollback and restart with the new set;
7. discover all affected Handoffs;
8. acquire all Handoff locks deterministically;
9. acquire Invitation-first row locks;
10. reread generation applicability and Handoff sets again;
11. mismatch causes rollback/retry;
12. only then mutate.

# GLOBAL HANDOFF ADVISORY LOCK RULE

Any process modifying Handoff state, Invitation/generation-to-Handoff validity, selector mapping, operation coordination, terminal/recovery projection, active-flow index, or capacity membership obtains the corresponding Handoff advisory lock first.

Covered paths:

- Consume;
- Reconciliation for synchronized read classification;
- Resend;
- Revoke;
- issued expiry cleanup;
- operation expiry cleanup;
- selector cleanup;
- recovery projection cleanup;
- active-flow index removal;
- administrative repair.

Set-based paths acquire applicable lifecycle locks before discovering the final Handoff set, then acquire Handoff locks, then Invitation-first row locks.

# CALLBACK ZERO-OPERATION RECOVERY

Callback Reconciliation resolves by:

```text
flow-container cookie
+ continuation reference
+ flow selector
```

Exactly zero callback operations resolves to Auth Restart Required:

- do not call the provider;
- do not create or reissue a BFF session;
- do not classify the result as provider failure or unknown provider outcome;
- retain or expire the continuation only according to its authoritative server deadline;
- require a new Auth continuation.

More than one operation is an invariant failure and maps to Generic Service Unavailable with security telemetry.

# CONSUME AND RECONCILIATION SYNCHRONIZATION

Consume binding for an existing session obtains the authenticated logout guard before Handoff operation binding. After the Handoff advisory lock, it revalidates session family, logical session, binding generation, container, selector, Invitation generation, actor, and operation identity.

Reconciliation performs no mutation and does not emit or rotate an Auth capability. It acquires the Handoff advisory lock and rereads authoritative primary state. A stale candidate Handoff, generation, selector mapping, session family, actor, or capability cannot return historical success.

# TESTING AND CI SPECIFICATION

Tests 1–260 retain the approved Revision 10–10.3 architecture meaning. Tests 261–280 remain normative and are summarized below; Tests 281–289 close the Revision 10.4 findings.

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

## Tests 281–289

| # | Test | Required assertion | Negative assertion |
|---|---|---|---|
| 281 | Provider refresh successor commit serializes with atomic logout | Refresh ownership and successor commit each acquire the authenticated logout guard; exactly one of logout or successor commit wins. | No successor logical session or cookie is created after logout commit. |
| 282 | Callback capability reissue serializes with atomic logout | Reissue obtains the same guard and logical-session synchronization before digest rotation. | No digest or Set-Cookie mutation occurs after logout commit. |
| 283 | Logout winning after provider response prevents successor creation | Provider returns success, then logout commits before Phase B. Phase B closes the claim as `logout_won`. | No successor session, binding ID, or usable cookie capability exists. |
| 284 | Concurrent cookie reissue cannot overwrite successful logout with usable capability | Adversarial HTTP response order may leave a late cookie in browser storage, but server digests/session are revoked. | The late cookie cannot authorize, modify digests, or revive the session. |
| 285 | Second Resend revalidates current generation after lifecycle-lock wait | Two Resends read `G`; first rotates to `G+1`; second acquires old-`G` lock and immediately restarts. | Old-`G` lock cannot authorize another rotation or Handoff mutation. |
| 286 | Revoke restarts when candidate generation becomes stale | Revoke reads `G`; concurrent Resend rotates; post-lock reread detects mismatch. | No affected-set discovery or mutation proceeds under stale generation authority. |
| 287 | Multi-generation repair revalidates applicability after all locks | Change one candidate before all lifecycle locks complete; repair rereads every candidate and restarts. | No stale generation remains in the mutation set. |
| 288 | First-login callback has a defined pre-auth guard domain | Continuation contains a server-only pre-auth subject; callback uses pre-auth + container auth-transition guards before first session commit. | No fabricated session-family UUID or browser-supplied guard identity is used. |
| 289 | Existing-session reauthentication binds callback guard to current family | Continuation binds trusted current family + container; provider-start, callback commit, reissue, refresh, and logout use that guard. | Request fields cannot select another family or bypass logout. |

## Required evidence

- ordered guard/lock traces;
- session-family and capability-digest snapshots;
- refresh ownership records and provider-call counts;
- logout transaction and Set-Cookie ordering evidence;
- candidate/current generation rereads;
- affected-set snapshots before and after locks;
- retry/rollback audit records;
- callback continuation guard-mode records;
- absence of browser-controlled guard IDs.

# ARCHITECTURE REMEDIATION MATRIX

| Finding | Resolution | Tests | Architecture status | Final closure |
|---|---|---|---|---|
| INT-ARCH-10.3-P0-01 | Auth Guard Identity and Ordering; Guarded Callback Cookie-Capability Reissue; Two-Phase Guarded Provider Refresh; Atomic Logout Fence | 281–284 | ADDRESSED | VALIDATION REQUIRED |
| INT-ARCH-10.3-P0-02 | Invitation-Generation Lifecycle Advisory Lock; Resend; Revoke; Multi-Generation Cleanup or Repair | 285–287 | ADDRESSED | VALIDATION REQUIRED |
| INT-ARCH-10.3-P1-01 | Existing-Session Guard Mode; First-Login Pre-Auth Guard Mode | 288–289 | ADDRESSED | VALIDATION REQUIRED |

# INTERMEDIATE ARCHITECTURE REVIEW GATE

Revision 10.4 is submitted only for Intermediate Architecture Review.

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
- leaves repository, browser, OAuth-provider, database, guard, lock, session, and concurrency validation outstanding.

# REVISION 11 RESERVED FINALIZATION

Revision 11 may begin only after an Intermediate Architecture Review returns `ARCHITECTURE READY FOR CONTRACT FINALIZATION`.

Revision 11 will finalize:

- `PR03_RESPONSE_HEADERS_V1`;
- exact HTTP header presence/prohibition;
- CORS and exposed-header inheritance;
- Correlation-ID precedence;
- imported PR-02 fixture integration;
- exact bytes, Content-Length, newline, and compression;
- final governance/owner disposition;
- final Remediation Matrix closure;
- package, manifest, ZIP, and sidecars;
- formal independent-review readiness.

The Revision 10.4 architecture findings are resolved here and are not deferred to Revision 11.

# CLEAN DOCUMENT ASSERTIONS

Revision 10.4 contains:

- one Revision 10.4 title;
- one Architecture Synchronization Final Closure Edition heading;
- D001–D030 exactly once;
- one authenticated logout-guard model;
- one first-login pre-auth guard model;
- one guarded callback capability-reissue algorithm;
- one two-phase guarded provider-refresh algorithm;
- one current-generation lifecycle-lock revalidation algorithm;
- one multi-generation applicability-revalidation algorithm;
- one Architecture Remediation Matrix;
- one Intermediate Architecture Review Gate;
- Tests 261–289 exactly once;
- no Runtime, SQL, migration, RPC, Edge, or UI implementation;
- no Revision 11 HTTP-header, CORS, exact-byte, package, manifest, ZIP, or sidecar finalization.

SUBMIT REVISION 10.4 FOR INTERMEDIATE ARCHITECTURE REVIEW
