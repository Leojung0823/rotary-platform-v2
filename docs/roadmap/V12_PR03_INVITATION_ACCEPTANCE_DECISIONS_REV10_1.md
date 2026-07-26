# PR-03 FORMAL SPECIFICATION — REVISION 10.1

## Architecture Correction Edition

## Specification Status

- Planning document: ARCHITECTURE CORRECTION IN PROGRESS
- Runtime implementation: BLOCKED
- Ninth independent review: REQUEST CHANGES
- Intermediate architecture review: ARCHITECTURE REVISION REQUIRED
- Formal specification approval requested: No
- Human/legal approval represented: No
- Repository validation status: NOT VERIFIED IN THIS SPECIFICATION RUN
- Model: gpt-5.6-sol / isolated architecture correction run

Revision 10.1 corrects the remaining architecture blockers discovered during Intermediate Architecture Review. It is not Revision 11 exact-contract finalization and does not authorize Runtime implementation.

# DOCUMENT PURPOSE, AUTHORITY, AND SCOPE

## Purpose

Revision 10.1 preserves the converged Revision 10 architecture and corrects:

- callback external-side-effect recovery;
- callback operation and browser recovery state;
- Exchange advisory-lock ordering;
- complete BFF Auth-session lifecycle;
- authentication/session public-classification boundaries;
- post-lock Reconciliation generation and mapping validation;
- architecture-test numbering and evidence requirements.

## Preserved Revision 10 architecture

The following remain normative unless explicitly refined below:

- `create-auth-continuation` returns `200` JSON.
- Client validates `authorization_url`.
- Client calls `window.location.assign` for top-level navigation.
- Authentication uses a dedicated-origin BFF Auth session.
- Browser stores no provider access or refresh token.
- Callback URL is sanitized before storage or network use.
- Exact Exchange tuple reread occurs before new capacity allocation.
- A full container does not block exact-tuple recovery.
- Operation deadline does not exceed browser-recoverable capability.
- Unknown commit does not delete the raw Idempotency-Key through a local timer.
- Reconciliation uses a Handoff advisory lock.
- Generic Rate Limited V1 is the single prevalidation HTTP `429` class.

## Authority order

1. Specification Status.
2. Normative Decision Register.
3. Callback Operation and BFF Auth Session state machines.
4. Exchange advisory-lock order.
5. Handoff, operation, and Reconciliation authoritative algorithms.
6. Privilege, recovery, tests, and Architecture Remediation Matrix.

## Excluded

- Runtime implementation.
- Database migrations or executable database code.
- RPC, Edge, or UI implementation.
- Implementation prompts.
- Revision 11 shared exact-header profile, final fixture bytes, package, and governance closure.

# DOMAIN DEFINITIONS

| Term | Definition |
|---|---|
| Callback operation | Durable server coordination record for one OAuth callback tuple and its external/local side-effect progress. |
| Callback operation reference | `cbop_` plus 43 unpadded base64url characters; opaque, non-authorizing, and flow-bound. |
| Continuation reference | `cnt_` plus 43 unpadded base64url characters; opaque reference to one OAuth continuation. |
| State digest reference | `std_` plus 43 unpadded base64url characters; non-secret reference to a stored state digest. |
| Callback tuple | Continuation, state digest, provider-code digest, PKCE-verifier digest, flow/container/selector, redirect URI, and contract version. |
| Unknown provider outcome | Provider exchange may have produced an external effect, but no authoritative local success proof exists. |
| Classified callback outcome | Durable generic success or allowlisted failure classification for one callback operation. |
| BFF Auth session | Server-side authenticated session represented by an HttpOnly dedicated-origin cookie. |
| Session family | Stable server-only lineage linking a BFF session and its rotated successors for same-actor recovery. |
| Session rotation generation | Monotonic server generation changed on each successful BFF session rotation. |
| Actor session binding ID | Browser-visible opaque non-authorizing ID unique to one active BFF session generation. |
| Candidate Handoff UUID | Pre-lock lookup result used only to derive the Handoff advisory key. |
| Exchange tuple advisory key | Request-material-derived transaction advisory-lock key calculated without Invitation database semantics. |

# FIXED ARCHITECTURAL PRINCIPLES

1. Provider authorization-code exchange is an external side effect and is not locally ACID.
2. Provider outcome unknown means fail closed and start a new Auth continuation.
3. A callback code is never blindly exchanged again after `provider_exchange_started` with unknown outcome.
4. A committed callback outcome and BFF session are replayable without duplication.
5. BFF session refresh has one server-side owner and rotates the session on success.
6. Session rotation changes the actor session binding ID.
7. Unknown Consume operations are never automatically rerun after descriptor mismatch.
8. Exchange tuple advisory lock precedes every Invitation semantic database read.
9. Pre-lock Exchange work is limited to request/security/shape/rate checks and pure calculation.
10. Reconciliation returns no semantic result from a pre-lock candidate lookup.
11. Every post-lock capability, mapping, session, generation, actor, operation, and outcome field is revalidated.
12. Runtime implementation remains `BLOCKED`.

# INVITATION STATE MACHINE

| State | Acceptance behavior |
|---|---|
| `pending` | Eligible only after token, generation, Membership, Person, actor, and operation checks pass. |
| `accepted` | Terminal; exact stored success may be replayed only for the accepted operation/actor boundary. |
| `expired` | Imported PR-02 Canonical Unavailable after authoritative semantic resolution. |
| `revoked` | Imported PR-02 Canonical Unavailable after authoritative semantic resolution. |

The Invitation transition to `accepted`, durable acceptance outcome, audit, Account create/reuse, terminal Handoff state, and recovery projection commit atomically inside the local acceptance transaction. This statement does not apply to the external OAuth provider call.

# NORMATIVE DECISION REGISTER

Every entry remains a model recommendation. Architecture remediation does not represent owner approval or repository validation.

## PR03-D001 — Authentication prerequisite

A valid dedicated-origin BFF Auth session is required before Consume or actor-bound Reconciliation. Authentication failure is classified before Invitation semantic lookup.

## PR03-D002 — Server-side BFF actor authority

The actor originates only from the server-side BFF session. Browser JSON, headers, descriptor IDs, or provider tokens cannot select the actor.

## PR03-D003 — Exact Auth and Person Account reuse

Reuse is allowed only for the verified actor and exact existing live human Account relationship. Conflicting Account identity is a semantic terminal rejection.

## PR03-D004 — Invitation target as Person source

The authoritative Invitation target relationship identifies the existing Person and Membership candidate; browser input cannot substitute either identity.

## PR03-D005 — Automatic Person merge is prohibited

Consume never merges Persons, guesses duplicate identity, or repairs identity ownership.

## PR03-D006 — Existing Person and Membership only

PR-03 accepts an Invitation only for an existing Person and existing target Membership.

## PR03-D007 — Existing target Membership behavior

The target Membership must remain eligible and in the exact pre-acceptance state required by the verified schema contract.

## PR03-D008 — Opaque-session-bound Idempotency-Key recovery

The browser binds the raw Idempotency-Key to `SHA-256(ASCII(actor_session_binding_id))`. Unknown commit preserves the key until a server-classified terminal/capability result, session-family or actor change, or natural tab-storage loss. Local timers never classify completion.

## PR03-D009 — Different idempotency key after acceptance

A different operation or key after terminal success cannot create another acceptance mutation and maps through the approved non-enumerating conflict/semantic boundary.

## PR03-D010 — Different actor replay

A different actor or session family cannot replay or rebind the original operation, raw key, callback operation, or terminal success snapshot.

## PR03-D011 — Operator and Executive Secretary route

No operator or special-administration acceptance path is added by PR-03.

## PR03-D012 — Verified recipient identity binding

Recipient identity binding remains governed by the approved D030 bearer-authority disposition and verified PR-02 policy.

## PR03-D013 — Auth user creation is prohibited in Consume

Consume never creates an Auth user or provider identity.

## PR03-D014 — External side effects are prohibited in Consume

Consume does not call OAuth providers, email, SMS, payment, analytics, or other external systems.

## PR03-D015 — Separate mutation and strict read-only reconciliation flags

New Exchange/Consume mutation is controlled separately from read-only Reconciliation. Reconciliation performs no Account, Invitation, Membership, Handoff, session, selector, or retention mutation.

## PR03-D016 — Durable canonical acceptance outcome

Successful acceptance persists an immutable outcome sufficient for exact same-operation success recovery.

## PR03-D017 — Callback, Auth-session, and operation recovery deadlines

Callback operation, callback client record, BFF session, selector, container, and operation coordination use separately owned deadlines. Operation binding remains clamped to recoverable selector/container capability. Unknown provider outcome cannot be retried merely because a deadline elapsed.

## PR03-D018 — Rejection versus system failure semantics

Conclusive semantic failure uses the imported semantic-unavailable boundary; infrastructure, lock timeout, provider uncertainty, or store failure uses a generic service class.

## PR03-D019 — Soft-deleted Account handling

Soft-deleted Accounts are not silently revived or reused.

## PR03-D020 — Suspended, deleted, or disabled Auth user

Auth-user eligibility is rechecked at login, refresh, before Consume, before actor-bound Reconciliation, and at a bounded session interval. Failure occurs before Invitation semantic lookup.

## PR03-D021 — Live human Account definition

Only the exact approved live human Account type/status qualifies for create/reuse.

## PR03-D022 — Allowed Account type and status

The allowed Account type/status values require repository verification and remain blocking.

## PR03-D023 — Membership eligibility

Membership state, Club association, Person relationship, and Invitation target must remain eligible after locks.

## PR03-D024 — Other Club Memberships

Other Memberships are not modified or merged by PR-03.

## PR03-D025 — Post-lock authoritative Reconciliation with session generations

Pre-lock lookup produces only a candidate Handoff UUID. After the advisory lock, the authoritative-primary transaction revalidates all flow, mapping, generation, session, actor, operation, deadline, terminal, and durable-outcome fields before classification.

## PR03-D026 — Recoverable callback operation and complete BFF Auth-session lifecycle

Provider exchange is governed by a durable callback-operation state machine. BFF sessions have explicit establishment, refresh, rotation, revocation, expiry, provider-invalid, and termination behavior. Provider-unknown outcome fails closed.

## PR03-D027 — No explicit operation abandonment

No client abandonment endpoint exists. An operation remains actor-bound until terminal state or authoritative expiry.

## PR03-D028 — Response-class header precedence

Imported PR-02 Canonical Unavailable remains the semantic fixture authority. Revision 11 finalizes shared PR-03-owned response headers and exact fixture integration.

## PR03-D029 — Exchange tuple lock before semantic validation

Only request/security/shape/rate checks and pure tuple-key calculation occur before Exchange advisory-lock acquisition. All Invitation, generation, hash, state, expiry, tuple, and capacity semantics occur after the lock.

## PR03-D030 — Invitation bearer authority

The Invitation token remains the proposed bearer authority subject to formal product/security/technical approval and verified PR-02 compatibility. Runtime remains blocked.

# DEDICATED ACCEPTANCE ORIGIN-WIDE EXECUTION POLICY

| Route | Role |
|---|---|
| `/invitation/accept` | Fragment ingress. |
| `/functions/v1/create-auth-continuation` | Continuation creation. |
| `/auth/callback` | Fixed-hash callback sanitation page. |
| `/functions/v1/exchange-auth-callback` | Callback operation processing. |
| `/functions/v1/reconcile-auth-callback` | Callback classified-outcome recovery. |
| `/functions/v1/auth-session-descriptor` | Opaque session binding descriptor. |
| `/functions/v1/exchange-membership-invitation` | Invitation Exchange. |
| `/functions/v1/consume-membership-invitation` | BFF-authenticated Consume. |
| `/functions/v1/reconcile-membership-invitation-acceptance` | BFF-authenticated Reconciliation. |
| `/invitation/result` | Minimal result UI. |

No third-party script, analytics, tag manager, replay, support widget, Service Worker, dynamic import, general application shell, or HTML API fallback is permitted.

# AUTH CONTINUATION CREATION ARCHITECTURE

`POST /functions/v1/create-auth-continuation` binds the flow container, selector, OAuth state/digest, PKCE challenge, exact redirect URI, and return route in one server continuation.

Architecture success:

```json
{
  "authorization_url": "https://<approved-idp-host>/<approved-path>?<approved-parameters>",
  "continuation_reference": "cnt_<43-base64url>",
  "version": "1"
}
```

Client validates HTTPS, exact IdP host/port/path, redirect URI, state, PKCE challenge/method, allowlisted parameters, and absence of userinfo/fragment/open-redirect input. It then calls `window.location.assign(authorization_url)`.

# CALLBACK URL SANITATION CONTRACT

The fixed-hash callback script executes in this order:

1. Read the serialized callback URL.
2. Exact-parse `code + state` or allowlisted `error + state`.
3. Copy required values to live memory.
4. Remove the complete query and fragment using `history.replaceState`.
5. Verify the current URL contains no OAuth parameter.
6. Read the tab-scoped continuation/callback client record.
7. Call Callback Exchange or Callback Reconciliation.

Sanitation failure is fail-closed. OAuth code/state/provider error, `error_description`, and `error_uri` are absent from history, UI, analytics, error SDKs, and general CDN/proxy/origin logs. Only an allowlisted generic provider-error family may be retained.

# AUTH CALLBACK ENDPOINT ARCHITECTURE

## Callback Exchange

- Method: `POST`
- Path: `/functions/v1/exchange-auth-callback`
- Content-Type: `application/json`
- Same-origin Origin/Fetch Metadata required
- Flow-container cookie required

```json
{
  "code": "<oauth-code>",
  "state": "<43-base64url>",
  "pkce_verifier": "<86-base64url>"
}
```

The endpoint validates exact schema, continuation, state digest, flow/selector binding, PKCE, redirect URI, provider timeout classification, and callback operation state.

## Callback Reconciliation

- Method: `POST`
- Path: `/functions/v1/reconcile-auth-callback`
- Content-Type: `application/json`
- Flow-container cookie required

```json
{
  "callback_operation_reference": "cbop_<43-base64url>",
  "continuation_reference": "cnt_<43-base64url>",
  "flow_selector": "flw_<22-base64url>"
}
```

The references and container must resolve to one callback operation and flow. No reference authorizes access alone. A committed outcome can reissue the same still-valid BFF session cookie; unknown provider outcome never becomes success through reconciliation.

# AUTH CALLBACK OPERATION STATE MACHINE

Provider authorization-code exchange is an external side effect. It cannot be atomically committed with local BFF-session and outcome state in one database transaction.

| State | Entry source | Allowed next state | Retry | Provider call | BFF session | Durable classification | Cleanup | Public class |
|---|---|---|---|---|---|---|---|---|
| `created` | Valid continuation and operation creation | `provider_exchange_started`, `terminal_failure`, `expired` | Yes | Permitted only after durable started transition | No | No | Callback TTL | Processing/service class |
| `provider_exchange_started` | Pre-provider transition committed | `provider_exchange_succeeded`, `terminal_failure`, `unknown_provider_outcome` | Only with proof request was not sent | At most once | No | No | Retain incident metadata | Processing/service class |
| `provider_exchange_succeeded` | Protected provider success captured | `session_commit_started`, `unknown_provider_outcome` | Local commit retry only | No | No | Protected provider result | Short protected retention | Processing/service class |
| `session_commit_started` | Local BFF-session/outcome transaction begins | `session_committed`, `unknown_provider_outcome` | Local reread/retry only | No | Maybe uncommitted | No until commit | Reread transaction result | Processing/service class |
| `session_committed` | Session and classified outcome committed | Session lifecycle only | Replay | No | Yes | Yes | Callback recovery TTL | Stored auth success |
| `terminal_failure` | Allowlisted terminal callback/provider failure | `expired` | Replay | No | No | Yes | Generic evidence retention | Stored generic auth failure |
| `unknown_provider_outcome` | Provider request/result or provider-success persistence uncertain | `expired` | Reconciliation only | No | No trusted session | Unknown classification | Redacted incident evidence | Auth restart required |
| `expired` | Callback-operation TTL elapsed | None | No | No | No | Expired | Remove secrets; retain audit | Callback unavailable |

## Processing algorithm

1. Validate callback request, state, PKCE, continuation, container, flow, and selector.
2. Create or reread callback operation.
3. Acquire callback-operation advisory lock.
4. `session_committed`: return stored outcome; never call provider; reissue same valid session cookie.
5. `terminal_failure`: return stored generic failure; never call provider.
6. `unknown_provider_outcome`: never call provider; require a new continuation.
7. `created`: commit `provider_exchange_started` before provider call.
8. Call provider once.
9. On success, retain only necessary protected provider result and commit `provider_exchange_succeeded`.
10. Commit `session_commit_started`.
11. Create BFF session and classified outcome locally.
12. Commit `session_committed`.

## Crash windows

### Crash before provider request

Retry is safe only when authoritative evidence proves the request was not sent. Ambiguous evidence is insufficient.

### Crash during provider request

Transition/recover as `unknown_provider_outcome`:

- do not exchange the same code again;
- do not claim login success;
- require a new Auth continuation;
- retain redacted evidence;
- use introspection/revocation only when reliably supported, never as a universal assumption.

### Provider success but local success not saved

Treat as `unknown_provider_outcome`. Do not re-exchange the code or construct an unproven BFF session. Provider-side orphan token remains a residual risk mitigated by provider TTL, revocation, provider-session policy, and monitoring.

### Crash after session/outcome commit before response

Exact callback retry returns the same classified outcome, creates no second session, performs no provider exchange, and may reissue the same still-valid cookie.

# CALLBACK OPERATION REFERENCE AND CLIENT RECORD

## Reference

```text
callback_operation_reference = cbop_<43-base64url>
```

It is 256-bit random, opaque, non-authorizing, free of code/state/verifier/actor identity, bound to one continuation/flow/selector/callback tuple, and unusable for another flow.

## Client record

Namespace:

```text
pr03.callback.<continuation_reference>.<flow_selector>
```

```json
{
  "version": "1",
  "callback_operation_reference": "cbop_<43-base64url>|null",
  "continuation_reference": "cnt_<43-base64url>",
  "state_digest_reference": "std_<43-base64url>",
  "flow_selector": "flw_<22-base64url>",
  "client_created_wallclock_hint": "<UTC-RFC3339-non-authoritative>",
  "processing_state": "continuation_ready|callback_sanitized|submitted|response_unknown|classified"
}
```

The record stores no provider token, actor UUID, Person, Membership, raw provider error description, or provider error URI.

Lifecycle:

- created after continuation creation and before navigation;
- tab-scoped sessionStorage only;
- client TTL is a cleanup hint; server callback-operation TTL is authoritative;
- retained on callback response loss;
- reload uses Callback Reconciliation when the operation reference exists;
- removed after terminal outcome acknowledgement, logout, incompatible session rotation, permanent operation expiry, or natural tab loss;
- unknown provider outcome remains until a new continuation begins or tab storage disappears.

# BFF AUTH SESSION STATE MACHINE

| State | Cookie valid | Provider token usable | Consume | Reconcile | Refresh | Public classification | Descriptor | Cleanup |
|---|---|---|---|---|---|---|---|---|
| `active` | Yes | Yes or not presently needed | Yes | Yes | Yes when due | Continue | Current binding ID | Normal expiry/rotation |
| `refreshing` | Identifies session family | Refresh in progress | Wait/coalesce | Wait/coalesce or historical read after refresh | Single owner | Temporary service class on timeout | Existing until commit | Clear refresh lease |
| `rotated` | Old cookie invalid | No | No under old session | No under old cookie | No | Session required | Old descriptor invalid | Retain lineage for operation recovery |
| `revoked` | No | No | No | No | No | Session required | Invalid | Revoke provider capability where supported |
| `expired` | No | No | No | No | No | Session required | Invalid | Clear cookie and protected tokens |
| `provider_invalid` | No | No | No | No | No | Session required | Invalid | Clear/revoke local session without provider detail |
| `terminated` | No | No | No | No | No | Session required | Invalid | Final tombstone/audit retention |

## Session establishment

At callback `session_committed`, the server generates a fresh opaque session ID. An existing browser cookie cannot select that ID. Session row, session family, actor, binding ID, expiry, and cookie issuance are linked. Provider tokens remain protected server-side.

## Refresh

- server-side only;
- one owner through per-session synchronization;
- concurrent requests coalesce;
- successful provider refresh always rotates the BFF session;
- old session becomes `rotated`;
- new successor becomes `active` with a new cookie and binding ID;
- transient failure returns to `active` only if current provider validity is proven;
- otherwise requests receive Generic Service Unavailable before Invitation semantic lookup;
- invalid refresh transitions to `provider_invalid`, clears the session/cookie, and returns generic session-required classification.

## Unknown Consume operation across rotation

The server retains a stable, non-browser session-family lineage.

- Descriptor mismatch prohibits automatic Consume retry.
- Client invokes Reconciliation under the successor session.
- Reconciliation verifies same actor and approved successor session family after the Handoff advisory lock.
- Historical success may be returned.
- If Not Completed and same-family continuity are proven, the client may atomically rebind the existing raw-key record to the new descriptor and retry the same operation.
- A different actor or session family cannot rebind or retry.

## Session expiry

Database time is authoritative. A present cookie with expired/revoked/provider-invalid state fails and is cleared before Invitation semantic lookup.

## Logout

Revoke local session and supported provider refresh capability, clear cookie, invalidate descriptor, clear actor-bound client key/callback records, and preserve unknown-operation server evidence.

## Account switch

Complete logout/revocation first. Do not reuse session ID, descriptor, or raw key. An actor-neutral selector may remain only when the flow policy permits.

## Multiple tabs

Cookie rotation becomes visible on subsequent requests. Descriptor mismatch prevents automatic Consume. Tabs fetch the current descriptor and use Reconciliation. Any cross-tab notice carries only a generic generation-changed signal, never a session ID, descriptor, token, selector, key, or actor value.

## Disabled or revoked Auth user

Recheck occurs at login, successful refresh, before Consume, before actor-bound Reconciliation, and at a bounded session interval no longer than 15 minutes. Failure occurs before Invitation semantic lookup.

# SESSION AND AUTHENTICATION RESPONSE CLASSIFICATION

Authentication/session classification occurs before Invitation semantic lookup.

| Condition | Public class |
|---|---|
| No BFF session cookie | Generic Authentication/Session Required |
| Unknown or invalid session cookie | Generic Authentication/Session Required |
| Expired, revoked, rotated-old, or terminated session | Generic Authentication/Session Required |
| Provider-invalid session | Generic Authentication/Session Required |
| Refresh temporarily unavailable or lock timeout | Generic Service Unavailable |
| Session store/database unavailable | Generic Service Unavailable |
| Acceptance feature disabled | Fixed Feature Disabled/Service class |
| Remaining capability below minimum operation window | Generic Service Unavailable |
| Invitation semantic failure after valid session/capability | Imported PR-02 Canonical Unavailable |

Revision 11 finalizes exact bytes and shared headers for PR-03-owned classes.

# HANDOFF EXCHANGE ENDPOINT CONTRACT

## Advisory-lock prevalidation boundary

Before Exchange tuple advisory-lock acquisition, only these actions are allowed:

1. HTTP method, Content-Type, body-size, and exact schema checks.
2. Origin, Fetch Metadata, mutation feature flag, and global prevalidation rate limiting.
3. Token-shaped grammar checks.
4. ASCII/base64url/length/version-shape checks.
5. Pure digest/HMAC preparation with no database read.
6. Exchange tuple advisory-key calculation.

Before the advisory lock, the service must not:

- look up Invitation existence;
- read token storage hash or current generation;
- classify pending/accepted/expired/revoked;
- read issued/expiry metadata;
- inspect container slots;
- classify a PR-02 semantic result;
- produce a valid-token-only response.

## Authoritative order

1. Request grammar/security prevalidation.
2. Token-shaped parsing without database semantic lookup.
3. Calculate Exchange tuple advisory key.
4. Acquire transaction-level Exchange tuple advisory lock.
5. Perform authoritative PR-02 validation: storage hash, HMAC, token version, current generation, nonce, issue metadata, expiry, and Invitation state.
6. Lock Invitation/generation rows.
7. Lock container row.
8. Authoritatively reread exact/partial/new tuple.
9. Exact tuple: return original selector and allocate no capacity.
10. Partial tuple: Flow Exchange Conflict.
11. New tuple: check and allocate capacity.
12. Atomically create slot, tuple, flow, Handoff, and selector.

All semantics are revalidated after lock acquisition. A hash collision only serializes unrelated requests and cannot mix tuple data.

# MULTI-FLOW CONTAINER AND CAPACITY ARCHITECTURE

- Full container does not block exact-tuple recovery.
- Exact tuple reread occurs before capacity allocation.
- Only new tuples consume a slot.
- Slot, tuple, flow, Handoff, and selector commit atomically.
- Post-lock new-tuple capacity denial maps to imported PR-02 Canonical Unavailable.
- Prevalidation Generic Rate Limited V1 never depends on active container fullness.

# CAPABILITY AND DEADLINE ARCHITECTURE

```text
operation_bound_deadline
<= operation_selector_deadline
<= container_absolute_deadline
<= flow_cookie_expiry
```

```text
effective_operation_deadline =
min(
  configured_operation_deadline,
  selector_capability_deadline,
  container_absolute_deadline
)
```

A near-expiry flow below the approved minimum window does not bind an operation.

Callback/session additions:

- Callback continuation and callback operation use server-authoritative deadlines.
- Client callback-record wall-clock value is a non-authoritative cleanup hint only.
- `unknown_provider_outcome` cannot be retried because a local deadline elapsed.
- Rotated session lineage is retained through the longest active unknown-operation recovery deadline.

# HANDOFF STATE MACHINE

| State | Consume behavior | Reconciliation behavior |
|---|---|---|
| `issued` | Bind one operation only after session/capability post-lock checks and minimum-window check. | Not Started only after post-lock validation. |
| `operation_bound` | Exact operation/key may continue; success or conclusive terminal classification commits. | Classify success, terminal, Not Completed, or service state after post-lock reread. |
| `terminal_success` | Exact actor/operation receives stored success. | Historical success only after current capability/session boundary passes. |
| `terminal_failure` | Imported PR-02 Canonical Unavailable. | Same semantic class while projection is retained. |
| `expired` | Semantic unavailable when retained; otherwise capability unavailable. | Same boundary after post-lock reread. |
| `revoked` | Semantic unavailable when retained; otherwise capability unavailable. | Same boundary after post-lock reread. |

No explicit abandonment endpoint exists.

# RAW IDEMPOTENCY-KEY CLIENT LIFECYCLE

```text
actor_binding_hash = SHA-256(ASCII(actor_session_binding_id))
```

Unknown commit key cleanup is limited to:

- server-confirmed success;
- server-confirmed terminal semantic rejection;
- server-confirmed operation expiry;
- permanent flow-capability failure;
- logout or session-family/actor change;
- natural tab/sessionStorage loss.

A local threshold only triggers Reconciliation and UI guidance.

Session rotation handling:

- descriptor mismatch prohibits automatic Consume;
- same-family successor continuity is checked after the Handoff lock;
- proven same-family Not Completed may atomically replace only the local binding hash and reuse the same raw key/operation;
- otherwise the key remains recovery-only or is cleared by a terminal session/capability result.

# CONSUME ENDPOINT AND RPC ARCHITECTURE

Consume authenticates through the BFF Auth-session cookie and flow-container cookie.

Before Invitation semantics:

1. Resolve server session.
2. Classify missing/invalid/expired/revoked/provider-invalid session.
3. Recheck disabled/revoked Auth user when due.
4. Resolve session family, rotation generation, descriptor generation, and actor.
5. Validate selector and key request shape.

Then:

1. Resolve candidate Handoff.
2. Acquire Handoff advisory lock.
3. Revalidate BFF session ID/family/generation, actor, descriptor generation, flow capability, and operation identity.
4. Acquire canonical row locks.
5. Bind only if the minimum capability window remains.
6. Execute the sole acceptance mutation owner.

No browser provider token or client actor identity is accepted.

# RECONCILIATION POST-LOCK AUTHORITATIVE ALGORITHM

## Pre-lock boundary

Pre-lock lookup returns only a candidate Handoff UUID needed to derive the advisory key. It cannot determine success, semantic terminal state, Not Completed, Not Started, actor match, or current session validity.

## Post-lock authoritative transaction

After acquiring the Handoff advisory lock, reread and validate:

1. `pr03_acceptance_reconciliation_enabled`.
2. Route allowlist and version.
3. Flow container ID.
4. Container current generation.
5. Container server state and absolute deadline.
6. Flow selector.
7. Selector generation/version.
8. Selector deadline.
9. Selector-to-Handoff current mapping.
10. Mapping generation.
11. Candidate Handoff UUID.
12. Actual current Handoff UUID.
13. Handoff state.
14. Handoff revocation.
15. Handoff capability generation.
16. Invitation token generation.
17. BFF session ID.
18. BFF session state.
19. BFF session family and rotation generation.
20. Actor UUID.
21. Actor session binding generation.
22. Disabled/revoked Auth-user status when due.
23. Operation ID.
24. Idempotency digest/version.
25. Request fingerprint/version.
26. Operation deadline.
27. Terminal projection retention.
28. Durable outcome reference and actor binding.

Only after every required value matches may the function classify historical success, terminal semantic outcome, Acceptance Not Completed, Acceptance Not Started, or infrastructure state.

## Boundary mapping

- Missing/invalid/expired/revoked/provider-invalid BFF session: Generic Authentication/Session Required.
- Flow/container/selector/mapping/generation/capability mismatch: Generic Flow Capability Error.
- Feature disabled: fixed Feature Disabled/Service class.
- Advisory/primary-store failure: Generic Service Unavailable.
- Valid capability and Invitation semantic failure: imported PR-02 Canonical Unavailable.

A stale candidate Handoff UUID can never directly return success.

# DATABASE PRIVILEGE AND SYNCHRONIZATION MODEL

| Principal | Architecture privilege |
|---|---|
| Continuation executor | Create/read continuation and callback operation references. |
| Callback exchange executor | Manage callback operation states and BFF session establishment; no Invitation acceptance. |
| BFF session service | Refresh/rotate/revoke sessions under per-session synchronization. |
| Exchange executor | Tuple advisory lock, semantic validation after lock, slot/flow/Handoff creation. |
| Consume executor | Handoff advisory lock and acceptance mutation. |
| Reconciliation caller | Execute-only narrow read-only function. |
| Reconciliation owner | Approved primary reads plus advisory lock; no table DML. |

Provider calls are external. Local state transitions are durable coordination, not a cross-system ACID claim.

# UX AND RECOVERY ARCHITECTURE

- Crash before provider request retries only when request-not-sent is proven.
- Unknown provider outcome requires a new Auth continuation.
- Committed callback response loss recovers through the callback operation reference.
- Provider errors remain generic and redacted.
- Session-required failure occurs before Invitation semantic lookup.
- Session refresh temporary failure uses a generic temporary-unavailable state.
- Descriptor mismatch never silently starts another Consume operation.
- Same-family unknown-operation recovery begins with Reconciliation.
- Full container does not block exact Exchange tuple recovery.
- Capability expiry while waiting for a lock becomes a capability error, not stale success.

# OBSERVABILITY AND REDACTION ARCHITECTURE

Required event families:

- callback_operation_created;
- callback_provider_exchange_started;
- callback_provider_exchange_succeeded;
- callback_unknown_provider_outcome;
- callback_session_commit_started;
- callback_session_committed;
- callback_operation_replayed;
- callback_operation_reconciled;
- bff_session_refresh_started;
- bff_session_refresh_coalesced;
- bff_session_rotated;
- bff_session_provider_invalid;
- bff_session_revoked;
- bff_descriptor_mismatch;
- exchange_tuple_lock_acquired;
- exchange_semantic_validation_after_lock;
- reconciliation_post_lock_generation_mismatch;
- stale_candidate_handoff_rejected.

Raw OAuth code/state/verifier, provider tokens, provider error descriptions, BFF cookie/session ID, actor UUID, flow cookie/selector, raw Idempotency-Key, and advisory source material are excluded from general logs, analytics, replay, traces, and metric labels.

# GENERIC RATE LIMITED V1

All prevalidation rate buckets use one architecture class:

- HTTP `429 Too Many Requests`;
- Content-Type `application/json; charset=utf-8`;
- body `{"code":"RATE_LIMITED","version":"1"}`;
- no semantic hint;
- no Set-Cookie;
- no Invitation-derived Retry-After.

Container new-slot denial does not use this class.

# TESTING AND CI SPECIFICATION

Tests 1–222 retain their Revision 10 numbering, meaning, and governing architecture assertions. Tests 223–244 retain the exact Revision 10 mapping below and are the unique source of truth.

| # | Purpose |
|---|---|
| 223 | Validated IdP URL |
| 224 | Top-level navigation |
| 225 | Callback Exchange |
| 226 | BFF session cookie |
| 227 | No browser provider token |
| 228 | Session descriptor |
| 229 | Callback stored-outcome replay |
| 230 | Callback response-loss creates no second session |
| 231 | Callback URL sanitation |
| 232 | OAuth log/history redaction |
| 233 | Full-container exact-tuple recovery |
| 234 | Tuple reread before capacity |
| 235 | Capacity bound |
| 236 | Tuple advisory before row locks |
| 237 | Deadline clamp |
| 238 | Near-expiry no bind |
| 239 | Cookie recovery window |
| 240 | Unknown-commit key retention |
| 241 | No cross-document monotonic comparison |
| 242 | Post-lock capability revalidation |
| 243 | Capability expiry during lock wait |
| 244 | Generic Rate Limited equality |

## Tests 245–260

| # | Purpose | Setup | Execution | Assertion | Negative assertion | Evidence | Shared-CI suitability |
|---|---|---|---|---|---|---|---|
| 245 | Callback operation state transition | Prepare each legal state and illegal transition. | Apply transitions under operation lock. | Only declared transitions/classifications succeed. | No provider re-exchange, duplicate session, or skipped state. | State log, durable snapshots, audit. | Yes |
| 246 | Crash before provider request can retry | Commit started state with authoritative request-not-sent evidence. | Crash before outbound call and retry. | One safe provider attempt occurs. | Ambiguous evidence cannot call provider. | Fault trace and provider count. | Yes |
| 247 | Unknown provider outcome does not re-exchange | Timeout/crash after dispatch without reliable result. | Retry Exchange and Reconciliation. | State remains unknown; new continuation required. | No second provider call or BFF session. | Provider count and operation snapshot. | Yes |
| 248 | Provider success/local crash fail closed | Provider succeeds; local proof/session commit is lost. | Reload/retry operation. | No login success is asserted. | No synthesized session and no code re-exchange. | Fault trace and session absence. | Yes |
| 249 | Session commit response loss returns same outcome | Commit one session/outcome and drop response. | Retry exact operation/reference. | Same outcome/session is returned. | No second session/provider exchange. | Session ID comparison and provider count. | Yes |
| 250 | Callback operation reference reload recovery | Store a valid operation reference and reload. | Call Callback Reconciliation. | Bound stored classification is returned. | Reference alone/other flow cannot recover. | Storage trace and binding audit. | Yes |
| 251 | Callback client record lifecycle | Prepare continuation, submitted, unknown, classified, logout, rotation, expiry states. | Exercise loss, reload, terminal display, logout, rotation. | Retention/cleanup follows contract. | No token, actor, Person, Membership, or provider description stored. | Browser storage inspection. | Yes |
| 252 | Session refresh single owner | Active session at refresh threshold with concurrent requests. | Run requests together. | One owner performs refresh. | No parallel provider refresh. | Provider count and lock trace. | Yes |
| 253 | Concurrent refresh coalescing | One in-flight refresh with concurrent Consume/Reconcile. | Observe wait/coalescing. | Requests converge on one successor or one temporary class. | No second refresh or indeterminate actor use. | Concurrency trace. | Yes |
| 254 | Session rotation changes descriptor | Successfully refresh an active session. | Compare old/new sessions, descriptors, lineage. | New session/descriptor; same server family. | Old descriptor cannot auto-retry. | Lineage and descriptor responses. | Yes |
| 255 | Revoked/expired/provider-invalid classification | Prepare each invalid session with cookie present. | Call descriptor, Consume, Reconciliation. | Session-required before Invitation semantics. | No PR-02 fixture or Invitation lookup. | Boundary trace and response class. | Yes |
| 256 | Multiple-tab session rotation | Two tabs; rotate in one while other has unknown operation. | Second tab detects mismatch and reconciles. | No duplicate Consume; same-family recovery is authoritative. | No secret is broadcast. | Browser multi-tab trace. | Conditional browser CI |
| 257 | No Invitation DB semantic lookup before advisory lock | Instrument lookups and lock acquisition. | Submit valid/invalid/partial shaped requests. | Lock precedes every semantic read. | No pre-lock Invitation/generation/capacity classification. | Ordered DB/lock trace. | Yes |
| 258 | PR-02 validation only after tuple lock | Prepare all PR-02 outcomes with instrumentation. | Execute Exchange. | Hash/HMAC/generation/nonce/issue/expiry/state checks occur after lock. | No valid-only response before lock. | Span order and response comparison. | Yes |
| 259 | Post-lock generation/mapping revalidation | Mutate each declared generation/mapping while waiting. | Release lock and continue reread. | Every declared field is reread. | No stale pre-lock value accepted. | Authoritative read set. | Yes |
| 260 | Stale candidate Handoff cannot return success | Resolve A then remap/revoke/replace before lock completes. | Continue Reconciliation. | Boundary failure is returned. | Success from stale A is not returned. | Candidate/current UUID and outcome trace. | Yes |

# ARCHITECTURE REMEDIATION MATRIX

| Finding | Resolution section | Tests | Architecture remediation | Final closure |
|---|---|---|---|---|
| INT-ARCH-P0-01 | AUTH CALLBACK OPERATION STATE MACHINE; CALLBACK OPERATION REFERENCE AND CLIENT RECORD | 245–251 | ADDRESSED | VALIDATION REQUIRED |
| INT-ARCH-P0-02 | HANDOFF EXCHANGE ENDPOINT CONTRACT | 257–258 | ADDRESSED | VALIDATION REQUIRED |
| INT-ARCH-P0-03 | BFF AUTH SESSION STATE MACHINE; SESSION AND AUTHENTICATION RESPONSE CLASSIFICATION | 252–256 | ADDRESSED | APPROVAL REQUIRED |
| INT-ARCH-P1-01 | RECONCILIATION POST-LOCK AUTHORITATIVE ALGORITHM | 259–260 | ADDRESSED | VALIDATION REQUIRED |
| INT-ARCH-P1-02 | TESTING AND CI SPECIFICATION | 223–260 | ADDRESSED | VALIDATION REQUIRED |

# INTERMEDIATE ARCHITECTURE REVIEW GATE

Revision 10.1 is eligible only for another Intermediate Architecture Review.

Review outcomes are limited to:

- `ARCHITECTURE READY FOR CONTRACT FINALIZATION`
- `ARCHITECTURE REVISION REQUIRED`

Even an architecture-ready result:

- does not authorize Runtime implementation;
- requires Revision 11 Exact Contract and Governance Finalization;
- leaves repository, platform, provider, browser, and database validation outstanding.

# REVISION 11 RESERVED FINALIZATION

Revision 11 will finalize:

- `PR03_RESPONSE_HEADERS_V1`;
- exact header presence/prohibition;
- CORS and exposed-header inheritance;
- Correlation-ID precedence;
- imported PR-02 exact fixture integration;
- exact bytes, Content-Length, newline, and compression;
- final Remediation Matrix closure;
- final package and sidecars;
- formal approval-review readiness.

The five Revision 10.1 architecture findings are not deferred; their architecture text is completed in this document.

# APPENDIX A — ARCHITECTURE REDACTION BOUNDARY

| Data | Browser policy |
|---|---|
| Provider access/refresh token | Never exposed. |
| OAuth code/state/verifier | Live callback memory only until sanitized submission. |
| Callback operation reference | Tab sessionStorage; opaque and non-authorizing. |
| BFF session ID | HttpOnly cookie only. |
| Actor session binding ID | Browser-readable opaque local-binding input. |
| Raw Idempotency-Key | Tab sessionStorage and request header. |
| Provider error description/URI | Never stored or displayed. |
| Candidate/current Handoff IDs | Server only. |

# APPENDIX B — CLEAN DOCUMENT ASSERTIONS

The Revision 10.1 Markdown contains:

- one Revision 10.1 title;
- one Architecture Correction Edition heading;
- D001–D030 exactly once;
- one Callback Operation State Machine;
- one BFF Auth Session State Machine;
- one Architecture Remediation Matrix;
- one Intermediate Architecture Review Gate;
- tests 223–260 with a unique current mapping;
- no Runtime implementation artifact;
- no executable database, RPC, Edge, or UI implementation;
- no final formal-approval disposition.

SUBMIT REVISION 10.1 FOR INTERMEDIATE ARCHITECTURE REVIEW
