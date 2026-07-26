# PR-03 FORMAL SPECIFICATION — REVISION 10.2

## Architecture Recovery Closure Edition

## Specification Status

- Planning document: READY FOR INTERMEDIATE ARCHITECTURE REVIEW
- Runtime implementation: BLOCKED
- Ninth independent review: REQUEST CHANGES
- Intermediate architecture review: ARCHITECTURE REVISION REQUIRED
- Formal specification approval requested: No
- Human/legal approval represented: No
- Repository validation status: NOT VERIFIED IN THIS SPECIFICATION RUN
- Model: gpt-5.6-sol / isolated architecture correction run

Revision 10.2 closes the remaining architecture-recovery blockers identified in the Revision 10.1 Intermediate Architecture Review. It does not perform Revision 11 exact-header, fixture, package, sidecar, or governance finalization and does not authorize Runtime implementation.

# DOCUMENT PURPOSE, AUTHORITY, AND SCOPE

## Purpose

Revision 10.2 preserves the converged Revision 10/10.1 architecture and corrects:

- persistent OAuth state and PKCE verifier continuity across top-level navigation;
- callback response-loss recovery before a callback-operation reference reaches the browser;
- replay-safe BFF cookie-capability rotation for one logical session;
- voluntary versus forced logout behavior during unknown operations;
- Handoff advisory-lock coverage across the complete mutation and cleanup lifecycle;
- submission status, tests 261–273, and Architecture Remediation Matrix synchronization.

## Preserved architecture

The following remain normative:

- `create-auth-continuation` returns JSON.
- Client validates the returned authorization URL.
- Client uses `window.location.assign` for top-level IdP navigation.
- Authentication uses a dedicated-origin BFF Auth session.
- Browser stores no provider access or refresh token.
- Callback URL is sanitized before storage or network calls.
- Exact Exchange tuple reread occurs before new-flow capacity allocation.
- A full container cannot block exact-tuple recovery.
- Operation deadline cannot exceed recoverable selector/container/cookie capability.
- Unknown commit never clears the raw Idempotency-Key through a local timer.
- Reconciliation uses a Handoff advisory lock and post-lock authoritative reread.
- Generic Rate Limited V1 remains the only prevalidation HTTP `429` class.

## Authority order

1. Specification Status.
2. Normative Decision Register.
3. OAuth Client Continuation Record.
4. Callback Operation and BFF Auth Session state machines.
5. Exchange and Handoff advisory-lock rules.
6. Consume, Reconciliation, logout, cleanup, and recovery algorithms.
7. Testing, Architecture Remediation Matrix, and Intermediate Architecture Review Gate.

## Excluded

- Runtime implementation.
- Branches other than the current specification branch.
- SQL, migration, RPC, Edge, or UI implementation.
- Revision 11 response-header profile, exact fixture bytes, final package, sidecars, and formal governance closure.

# DOMAIN DEFINITIONS

| Term | Architecture definition |
|---|---|
| OAuth client continuation record | Tab-scoped `sessionStorage` record written before top-level navigation and containing state, PKCE verifier, flow binding, and later server continuation metadata. |
| Server continuation | Single-use server record binding flow container, selector, OAuth state digest, PKCE challenge, redirect URI, and server expiry. |
| Callback operation | Durable coordination record for one callback tuple and its external/provider plus local/session progress. |
| Callback operation reference | Opaque non-authorizing reference that may be returned after operation creation but is not required for recovery lookup. |
| Continuation recovery key | Flow-container cookie + continuation reference + flow selector; resolves at most one callback operation. |
| Logical BFF session | One authenticated server-side session identity independent of rotating browser cookie capabilities. |
| Cookie capability | Random opaque bearer stored only in the browser cookie and transient response memory; only keyed digests are stored server-side. |
| Current/previous cookie digest | Two-digest overlap used to tolerate concurrent replay/reissue response ordering for one logical session. |
| Provider refresh rotation | Successor logical session created by provider refresh; changes session ID and actor-session binding ID. |
| Callback capability reissue | New cookie capability for the same logical session; does not change actor-session binding ID. |
| Voluntary logout | User-initiated logout or account switch that may be blocked until unknown operation/callback recovery completes. |
| Forced security logout | Revocation, provider invalidation, disabled user, or incident response that may terminate browser recovery and retain server coordination until terminal state or expiry. |
| Handoff advisory lifecycle lock | Transaction advisory lock required before any mutation of Handoff validity, mappings, coordination, projections, or active indexes. |

# FIXED ARCHITECTURAL PRINCIPLES

1. OAuth state and PKCE verifier are persisted and read-back verified before top-level navigation.
2. Client continuation state is indexed by exact OAuth state.
3. `state_digest_reference` remains server-only and is removed from the browser record.
4. Callback recovery never depends on receiving a callback-operation reference in the first response.
5. Callback Reconciliation resolves by container + continuation reference + selector.
6. Server stores cookie-capability digests, never raw cookie bytes.
7. Callback replay reissues a cookie capability for the same logical session and preserves the binding ID.
8. Provider refresh creates a successor logical session and changes the binding ID.
9. Voluntary logout/account switch is blocked while any shared-container operation or callback is unresolved.
10. Forced security logout may destroy client recovery material but cannot release or rebind the server operation.
11. Every mutation of Handoff validity, mapping, coordination, projections, or active index acquires the corresponding Handoff advisory lock.
12. Multiple Handoff locks use deterministic unsigned numeric ordering.
13. Runtime implementation remains `BLOCKED`.

# INVITATION STATE MACHINE

| State | Acceptance architecture |
|---|---|
| `pending` | Eligible only after token, generation, target, BFF actor, capability, and operation checks pass. |
| `accepted` | Terminal; exact durable success can be recovered only within the approved actor/operation boundary. |
| `expired` | Imported PR-02 Canonical Unavailable after authoritative semantic resolution. |
| `revoked` | Imported PR-02 Canonical Unavailable after authoritative semantic resolution. |

Invitation acceptance, Account create/reuse, durable acceptance outcome, audit, terminal Handoff state, and recovery projection commit atomically in the local acceptance transaction. OAuth provider exchange remains an external non-ACID side effect governed by the Callback Operation State Machine.

# NORMATIVE DECISION REGISTER

Every decision remains a model recommendation. Architecture remediation is not human approval, final exact-contract closure, or repository validation.

## PR03-D001 — BFF authentication prerequisite

Consume and actor-bound Reconciliation require a valid dedicated-origin BFF Auth session. Session failure is classified before Invitation semantic lookup.

## PR03-D002 — Server-side actor authority

Only the server-side logical BFF session supplies the trusted actor. Browser body, headers, descriptors, or provider tokens cannot select the actor.

## PR03-D003 — Exact Account create/reuse

Create or reuse is limited to the exact verified live human Account relationship for the authenticated actor.

## PR03-D004 — Invitation target authority

The authoritative Invitation relationship identifies the Person and Membership candidate; browser input cannot replace either identity.

## PR03-D005 — Person merge prohibited

PR-03 never automatically merges Persons or repairs identity ownership.

## PR03-D006 — Existing Person and Membership only

The target Person and Membership must already exist.

## PR03-D007 — Membership eligibility

The target Membership must remain eligible after all authoritative locks and rereads.

## PR03-D008 — Opaque-session-bound Idempotency-Key

The browser binds the raw key to `SHA-256(ASCII(actor_session_binding_id))`. Unknown commit preserves it until a server-classified terminal/capability result, voluntary recovery completion, forced security loss, session-family/actor change, or natural tab loss.

## PR03-D009 — Different key after terminal success

A different operation or key cannot create another acceptance mutation after terminal success.

## PR03-D010 — Different actor replay

A different actor or session family cannot rebind a callback operation, Handoff operation, raw key, or terminal success.

## PR03-D011 — No operator acceptance route

PR-03 adds no operator, Executive Secretary, or administration acceptance path.

## PR03-D012 — Recipient identity policy

Recipient identity remains governed by the approved D030/PR-02 authority boundary.

## PR03-D013 — No Auth-user creation

Consume never creates an Auth user or provider identity.

## PR03-D014 — No external side effect in Consume

Consume never calls an OAuth provider or other external system.

## PR03-D015 — Separate mutation and Reconciliation flags

Exchange/Consume mutation and read-only Reconciliation remain independently controlled. Reconciliation performs no business, coordination, session, mapping, or deadline mutation.

## PR03-D016 — Durable acceptance outcome

Success persists an immutable outcome sufficient for exact same-operation recovery.

## PR03-D017 — Recovery-capability deadlines

Callback operation, server continuation, logical session, selector, container, and operation deadlines have independent owners. Operation deadline remains clamped to browser-recoverable capability. No local timer proves callback or Consume completion.

## PR03-D018 — Semantic versus infrastructure classification

Conclusive Invitation semantic failure uses the imported PR-02 boundary. Provider uncertainty, lock timeout, store failure, session refresh outage, or unprovable commit uses a generic non-semantic class.

## PR03-D019 — Soft-deleted Account

Soft-deleted Accounts are not silently revived or reused.

## PR03-D020 — Disabled or revoked Auth user

Eligibility is rechecked at login, provider refresh, before Consume, before actor-bound Reconciliation, and at the bounded session interval.

## PR03-D021 — Live human Account

Only the repository-verified live human Account class qualifies.

## PR03-D022 — Account type/status validation

Exact allowed Account type/status values remain repository-validation blockers.

## PR03-D023 — Membership relationship validation

Membership, Club, Person, and Invitation relationships are revalidated after locks.

## PR03-D024 — Other Membership isolation

Other Club Memberships are not modified or merged.

## PR03-D025 — Post-lock Reconciliation authority

Pre-lock lookup provides only a candidate Handoff UUID. All flow, mapping, generation, session, actor, operation, deadline, terminal, and outcome fields are authoritatively reread after the Handoff advisory lock.

## PR03-D026 — Callback and BFF recovery closure

The client persists complete OAuth continuation material before navigation. Callback recovery is continuation-based, not callback-reference-dependent. Logical BFF sessions rotate cookie capabilities through digests and distinguish callback reissue from provider refresh rotation.

## PR03-D027 — No client abandonment

There is no operation-abandonment endpoint. Voluntary logout is blocked during unresolved work. Forced security termination cannot rebind or release the server operation.

## PR03-D028 — Response precedence

Imported PR-02 remains the semantic fixture authority. Revision 11 finalizes PR-03-owned exact headers and shared response profiles.

## PR03-D029 — Complete advisory-lock lifecycle

Exchange tuple lock precedes semantic Exchange reads. Handoff advisory locks cover Consume, Resend, Revoke, expiry, selector/recovery cleanup, active-index removal, and administrative repair.

## PR03-D030 — Invitation bearer authority

Invitation bearer authority remains proposed and approval-required. Runtime implementation remains blocked.

# DEDICATED ACCEPTANCE ORIGIN-WIDE EXECUTION POLICY

| Route | Architecture role |
|---|---|
| `/invitation/accept` | Fragment ingress and Exchange initiation. |
| `/functions/v1/create-auth-continuation` | Create/reread idempotent server continuation. |
| `/auth/callback` | Fixed-hash callback sanitation and client-record recovery. |
| `/functions/v1/exchange-auth-callback` | Create/reread callback operation and process provider/local states. |
| `/functions/v1/reconcile-auth-callback` | Resolve callback operation through continuation recovery key. |
| `/functions/v1/auth-session-descriptor` | Return opaque non-authorizing session binding ID. |
| `/functions/v1/logout-readiness` | Authoritatively determine whether voluntary logout/account switch is currently safe. |
| `/functions/v1/logout` | Perform approved voluntary or forced termination mode. |
| `/functions/v1/exchange-membership-invitation` | Invitation Exchange. |
| `/functions/v1/consume-membership-invitation` | BFF-authenticated Consume. |
| `/functions/v1/reconcile-membership-invitation-acceptance` | BFF-authenticated read-only Reconciliation. |
| `/invitation/result` | Minimal result UI. |

All existing dedicated-origin restrictions remain: no provider tokens in browser JavaScript, third-party script, analytics, tag manager, session replay, support widget, Service Worker, dynamic import, general application shell, or HTML API fallback.

# OAUTH CLIENT CONTINUATION RECORD

## Namespace

```text
pr03.oauth.<oauth_state>
```

`oauth_state` is exactly 43 unpadded base64url characters representing 256 random bits.

## Prepared record before continuation request

Before calling `create-auth-continuation`, client code:

1. creates state, flow instance, PKCE verifier, and PKCE challenge;
2. writes the complete record;
3. reads it back and verifies every field;
4. only then sends the continuation request.

```json
{
  "version": "2",
  "oauth_state": "<43-base64url>",
  "flow_instance_id": "<22-base64url>",
  "flow_selector": "flw_<22-base64url>",
  "pkce_verifier": "<86-base64url>",
  "return_route": "/invitation/result",
  "continuation_reference": null,
  "callback_operation_reference": null,
  "server_continuation_expires_at": null,
  "processing_state": "prepared"
}
```

The client does not store a `state_digest_reference`; state digest and digest reference remain server-only.

## Continuation response and atomic update

`POST /functions/v1/create-auth-continuation` returns architecture fields:

```json
{
  "authorization_url": "https://<approved-idp-host>/<approved-path>?<approved-parameters>",
  "continuation_reference": "cnt_<43-base64url>",
  "server_continuation_expires_at": "<UTC-RFC3339>",
  "version": "1"
}
```

The endpoint is idempotent for the exact container + selector + state + PKCE challenge + redirect tuple.

Before top-level navigation, client code atomically updates and read-back verifies:

```text
continuation_reference
server_continuation_expires_at
processing_state = continuation_created
```

If the continuation response is lost, the client reuses the same prepared record and exact request. The server returns the same continuation reference and expiry and creates no duplicate continuation.

## Persistence and cleanup

The record is tab-scoped `sessionStorage` and intentionally carries `oauth_state` and `pkce_verifier` across:

```text
acceptance page
→ IdP top-level navigation
→ callback page
```

The browser wall clock does not authorize use; the server continuation expiry is authoritative.

The record is retained through callback response loss. It is removed after terminal callback acknowledgement, forced logout, incompatible account switch, permanent continuation/callback expiry, or natural tab loss.

# AUTH CONTINUATION CREATION ARCHITECTURE

Client validates the returned authorization URL for HTTPS, exact host/port/path, exact redirect URI, state equality, PKCE challenge/method equality, allowlisted parameters, and absence of userinfo, fragment, alternate redirect, or open redirect.

After continuation-record update and URL validation:

```javascript
window.location.assign(authorization_url)
```

Top-level navigation is never inferred from fetch redirect behavior.

# CALLBACK URL SANITATION CONTRACT

The callback script:

1. reads the serialized callback URL;
2. exact-parses `code + state` or allowlisted `error + state`;
3. copies required values to live memory;
4. immediately removes all query and fragment data with `history.replaceState`;
5. verifies the current URL contains no OAuth parameter;
6. loads only `pr03.oauth.<state>`;
7. validates flow/selector/continuation/PKCE record fields;
8. calls Callback Exchange or Callback Reconciliation.

Sanitation failure is fail-closed. OAuth code/state, provider errors, `error_description`, and `error_uri` are absent from browser history, UI, analytics, replay, and general CDN/proxy/origin logs.

# AUTH CALLBACK OPERATION STATE MACHINE

Provider authorization-code exchange is an external side effect and cannot be part of one local ACID transaction with BFF session creation and classified outcome persistence.

| State | Entry | Next states | Retry/provider rule | Session/outcome | Public architecture class |
|---|---|---|---|---|---|
| `created` | Valid continuation and callback operation creation | `provider_exchange_started`, `terminal_failure`, `expired` | Provider may be called only after durable started transition | No session/outcome | Processing/service |
| `provider_exchange_started` | Pre-provider transition committed | `provider_exchange_succeeded`, `terminal_failure`, `unknown_provider_outcome` | Retry provider only with authoritative proof request was never dispatched | No session/outcome | Processing/service |
| `provider_exchange_succeeded` | Protected provider success durably captured | `session_commit_started`, `unknown_provider_outcome` | Never call provider again | Protected result, no session | Processing/service |
| `session_commit_started` | Local session/outcome commit begins | `session_committed`, `unknown_provider_outcome` | Local reread/retry only | Maybe uncommitted | Processing/service |
| `session_committed` | Logical session and classified outcome committed | Session lifecycle only | Replay never calls provider | One logical session and durable outcome | Stored auth success |
| `terminal_failure` | Allowlisted terminal callback/provider failure | `expired` | Replay only; no provider call | Generic durable failure | Stored generic auth failure |
| `unknown_provider_outcome` | Provider dispatch/result or success persistence uncertain | `expired` | Never re-exchange same code | No trusted session/outcome | Auth restart required |
| `expired` | Callback operation deadline elapsed | None | No retry | Secrets removed; redacted audit retained | Callback unavailable |

Crash behavior remains:

- proven crash before provider request: safe retry;
- crash during provider request: `unknown_provider_outcome`;
- provider success without durable local proof: `unknown_provider_outcome`;
- crash after session/outcome commit: replay stored outcome with no second logical session.

# CALLBACK OPERATION LOOKUP AND CLIENT RECOVERY

## Callback Exchange

```text
POST /functions/v1/exchange-auth-callback
```

Exact architecture request remains:

```json
{
  "code": "<oauth-code>",
  "state": "<43-base64url>",
  "pkce_verifier": "<86-base64url>"
}
```

The server creates/rereads the callback operation under continuation and callback-tuple synchronization.

When a response reaches the browser, it may include:

```json
{
  "callback_operation_reference": "cbop_<43-base64url>",
  "classification": "<allowlisted-class>",
  "version": "1"
}
```

The reference is optional for recovery and cannot be the sole recovery key.

## Callback Reconciliation without reference catch-22

```text
POST /functions/v1/reconcile-auth-callback
```

Exact architecture request:

```json
{
  "continuation_reference": "cnt_<43-base64url>",
  "flow_selector": "flw_<22-base64url>"
}
```

The server uses:

```text
flow-container cookie
+ continuation reference
+ flow selector
```

to resolve at most one callback operation.

Rules:

- one continuation can have at most one active callback operation for the bound flow;
- exact callback tuple replay rereads that operation;
- a missing callback-operation reference does not block recovery;
- if the operation reference was received, it is an additional equality check only;
- another flow/container cannot use the continuation;
- `unknown_provider_outcome` returns Auth Restart Required and never re-exchanges code;
- `session_committed` returns the stored classification and may perform same-logical-session cookie-capability reissue.

The OAuth client record retains `callback_operation_reference: null` until one is received, but recovery always remains possible through the continuation recovery key.

# CALLBACK CLIENT RECORD LIFECYCLE

The OAuth continuation record is also the callback client record. Processing states are:

```text
prepared
continuation_created
callback_sanitized
callback_submitted
response_unknown
classified
```

On response loss after submission, the record remains with continuation reference, selector, state, and verifier. Reload calls Callback Reconciliation; it does not need the raw provider code or a callback-operation reference.

Raw provider access token, refresh token, actor UUID, Person, Membership, state digest reference, provider error description, and provider error URI are never stored.

# DEDICATED-ORIGIN BFF AUTH SESSION STORAGE

The browser cookie is:

```text
__Host-pr03_auth_session=<opaque-cookie-capability>
```

Required server fields include:

```text
logical_session_id
session_family_id
current_cookie_capability_digest
previous_cookie_capability_digest
previous_digest_valid_until
actor_session_binding_id
rotation_generation
session_state
actor_uuid
provider_credential_reference
created_at
expires_at
revoked_at
```

Raw cookie capability bytes:

- are generated with approved entropy;
- exist only in transient server response memory and the browser cookie;
- are never stored in the database, logs, traces, analytics, or metrics;
- are verified through a dedicated keyed digest and version.

Database disclosure alone cannot reconstruct a valid browser cookie.

# BFF AUTH SESSION STATE MACHINE

| State | Cookie behavior | Consume/Reconcile | Refresh | Descriptor/cleanup |
|---|---|---|---|---|
| `active` | Current or short-overlap previous capability accepted | Allowed after checks | Server-side owner may refresh | Current binding ID |
| `refreshing` | Current/previous capability identifies family | Coalesce/wait; timeout is service unavailable | One owner | Binding unchanged until commit |
| `rotated` | Old logical-session cookie invalid after overlap | Old session cannot authorize | No | Old binding invalid; lineage retained |
| `revoked` | Cookie rejected/cleared | Session required | No | Descriptor invalid; evidence retained |
| `expired` | Cookie rejected/cleared | Session required | No | Protected credentials removed |
| `provider_invalid` | Cookie rejected/cleared | Session required | No | Provider reason not exposed |
| `terminated` | Cookie rejected | No | No | Final tombstone/audit |

## Session establishment

Callback `session_committed` creates one logical session with a server-generated ID, session family, actor-session binding ID, and current cookie digest. A browser-supplied old cookie cannot select the new logical session.

## Callback capability reissue

Callback replay for a committed outcome does not reissue identical cookie bytes.

It:

1. resolves the existing logical session;
2. generates a new opaque cookie capability;
3. atomically moves current digest to previous;
4. stores the new current digest;
5. sets a short approved previous-digest overlap;
6. preserves logical session ID, session family, actor, and actor-session binding ID;
7. emits the new cookie capability.

This handles concurrent response ordering without creating a second logical session. If a browser presents a capability older than the accepted previous digest, it must reconcile and receive another authorized reissue.

## Provider refresh rotation

Provider refresh is server-side, single-owner, and coalesced.

Successful refresh:

- creates a successor logical session in the same session family;
- marks the old logical session `rotated`;
- creates a new actor-session binding ID;
- emits a new cookie capability;
- invalidates the old descriptor for automatic Consume.

Callback capability reissue and provider refresh rotation are distinct.

## Provider invalid, expiry, revocation, and termination

Provider-invalid, expired, revoked, or terminated sessions fail before Invitation semantic lookup and clear the cookie. Provider reasons are not disclosed.

## Multiple tabs

Tabs observe cookie/session generation changes on their next same-origin request. A generic cross-tab event may announce that session state changed, but carries no cookie, descriptor, actor, selector, key, or operation data.

# AUTH SESSION DESCRIPTOR

```text
GET /functions/v1/auth-session-descriptor
```

Success remains:

```json
{
  "actor_session_binding_id": "<43-base64url>",
  "version": "1"
}
```

Callback capability reissue preserves this ID. Provider refresh rotation changes it.

# VOLUNTARY LOGOUT AND ACCOUNT SWITCH RECOVERY

## Logout readiness

Before voluntary logout or account switch, the client calls:

```text
GET /functions/v1/logout-readiness
```

The server evaluates every active or recoverable flow and callback operation reachable through the shared flow-container cookie and current session family.

Blocking states include:

- `operation_bound`;
- unknown Consume commit;
- callback `provider_exchange_started`;
- callback `provider_exchange_succeeded`;
- callback `session_commit_started`;
- callback `unknown_provider_outcome`;
- response-unknown callback client coordination where the server operation remains nonterminal.

If any blocking state exists:

```text
Voluntary logout/account switch is denied.
Required action: reconcile all blocking flows/callbacks first.
```

All tabs sharing the container participate through server state; browser-only tab discovery is not the authority. A generic same-origin cross-tab notification prompts each tab to reconcile.

After every blocking item reaches terminal success, terminal semantic result, permanent capability loss, or authoritative expiry, voluntary logout may proceed.

## Voluntary logout

Voluntary logout:

- revokes the current logical session after readiness succeeds;
- clears the cookie and descriptor;
- clears only client records whose operations are terminal or permanently unavailable;
- does not manufacture abandonment.

## Account switch

Account switch first completes voluntary logout readiness and logout. It never reuses the old logical session, binding ID, raw key, callback operation, or operation identity.

# FORCED SECURITY LOGOUT

Forced security logout applies to:

- explicit session revocation;
- provider invalidation;
- disabled/revoked Auth user;
- security incident;
- mandatory administrative termination.

It may immediately:

- revoke/terminate the logical session;
- clear the cookie;
- invalidate descriptor and client material;
- revoke provider refresh capability where supported.

Architecture consequences are explicit:

- an operation-bound unknown Consume is not client-retryable after the raw key is destroyed;
- server operation coordination remains until success, terminal semantic state, or authoritative expiry;
- a different actor cannot start or bind another operation during that period;
- no client abandonment or release is inferred;
- later Reconciliation may report historical terminal success only if a valid approved session boundary exists;
- otherwise the operation expires through the normal locked cleanup path.

# SESSION AND AUTHENTICATION RESPONSE CLASSIFICATION

Authentication/session failures are classified before Invitation semantic lookup.

| Condition | Public architecture class |
|---|---|
| No, unknown, invalid, expired, revoked, rotated-old, provider-invalid, or terminated BFF session | Generic Authentication/Session Required |
| Refresh temporarily unavailable or session store failure | Generic Service Unavailable |
| Voluntary logout blocked by unresolved operation/callback | Logout Recovery Required |
| Forced security termination | Generic Authentication/Session Required |
| Feature disabled | Fixed Feature Disabled/Service class |
| Minimum operation capability window unavailable | Generic Service Unavailable |
| Invitation semantic failure after valid session/capability | Imported PR-02 Canonical Unavailable |

Revision 11 finalizes exact bytes and headers.

# HANDOFF EXCHANGE ENDPOINT CONTRACT

Before the Exchange tuple advisory lock, only request method/media/body checks, Origin/Fetch Metadata/flag/global-rate checks, token-shaped ASCII/base64url/length/version-shape checks, and pure digest/HMAC preparation are allowed.

The authoritative order remains:

1. Request/security prevalidation.
2. Token-shaped parsing without database semantic lookup.
3. Calculate tuple advisory key.
4. Acquire Exchange tuple transaction advisory lock.
5. Perform PR-02 storage-hash, HMAC, version, generation, nonce, issue, expiry, and Invitation-state validation.
6. Lock Invitation/generation.
7. Lock container.
8. Reread exact/partial/new tuple.
9. Exact tuple: return original selector without capacity allocation.
10. Partial tuple: conflict.
11. New tuple: evaluate/allocate capacity.
12. Commit slot, tuple, flow, Handoff, and selector atomically.

# GLOBAL HANDOFF ADVISORY LOCK RULE

Any process that mutates any of the following must first acquire the corresponding Handoff advisory lock:

```text
Handoff state
Invitation/generation-to-Handoff validity
selector-to-Handoff mapping
operation coordination
terminal projection
recovery projection
active-flow index
```

Covered processes include:

- Consume;
- Resend generation rotation;
- Revoke;
- issued-Handoff expiry cleanup;
- operation expiry cleanup;
- selector cleanup;
- recovery-projection cleanup;
- active-flow-index removal;
- administrative repair.

## Multi-Handoff acquisition

For a process touching multiple Handoffs:

1. derive every canonical Handoff advisory key;
2. interpret each key as unsigned 64-bit numeric value;
3. sort ascending unsigned numeric value;
4. use ascending full Handoff UUID as deterministic collision tie-break;
5. acquire all transaction advisory locks in that order;
6. then enter the Invitation-first row-lock order.

No process may mutate covered data without this lock, use `SKIP LOCKED`, or acquire row locks first.

# HANDOFF AND OPERATION STATE MACHINE

| State | Mutation/recovery rule |
|---|---|
| `issued` | Consume binds only after session and capability validation under the Handoff lock. Resend/Revoke/expiry also acquire the same lock. |
| `operation_bound` | Exact key/operation retry continues; voluntary logout is blocked; forced termination leaves coordination until terminal/expiry. |
| `terminal_success` | Stored success is immutable; projection/index cleanup uses the Handoff lock. |
| `terminal_failure` | Imported semantic-unavailable classification while retained; cleanup uses the Handoff lock. |
| `expired` | Capability/semantic boundary depends on retained projection; cleanup uses the Handoff lock. |
| `revoked` | Resend/Revoke transition and projection/index updates use the Handoff lock. |

# RAW IDEMPOTENCY-KEY CLIENT LIFECYCLE

```text
actor_binding_hash = SHA-256(ASCII(actor_session_binding_id))
```

Unknown commit never clears the key through a local timer.

Voluntary logout/account switch cannot clear the key while the server reports a blocking operation. Forced security logout may clear it but explicitly ends client retry capability without releasing the server operation.

Callback capability reissue preserves the binding ID and does not require key rebinding. Provider refresh rotation changes the descriptor; same-family recovery begins with Reconciliation and never automatically reruns Consume.

# CONSUME ENDPOINT AND RPC ARCHITECTURE

Before Invitation semantic lookup, Consume validates the logical BFF session, cookie capability digest, session state/family/generation, actor, descriptor generation, Auth-user eligibility, request shape, selector, and key shape.

It then:

1. resolves candidate Handoff;
2. acquires Handoff advisory lock;
3. post-lock revalidates session, actor, descriptor, flow capability, operation identity, and deadline;
4. acquires canonical Invitation-first row locks;
5. binds or retries the exact operation;
6. commits the only acceptance mutation path.

# RECONCILIATION POST-LOCK AUTHORITATIVE ALGORITHM

Pre-lock lookup returns only a candidate Handoff UUID.

After Handoff advisory-lock acquisition, one authoritative-primary transaction rereads and validates:

1. Reconciliation flag.
2. Route allowlist/version.
3. Flow-container ID.
4. Container generation/state/absolute deadline.
5. Selector, selector generation/version/deadline.
6. Selector-to-Handoff mapping and mapping generation.
7. Candidate and actual Handoff UUID.
8. Handoff state/revocation/capability generation.
9. Invitation token generation.
10. Logical BFF session ID.
11. Session family.
12. Current/previous cookie digest acceptance state.
13. Session state and rotation generation.
14. Actor UUID.
15. Actor-session binding generation.
16. Auth-user eligibility.
17. Operation ID.
18. Idempotency digest/version.
19. Request fingerprint/version.
20. Operation deadline.
21. Terminal-projection retention.
22. Durable outcome reference and actor binding.

Classification occurs only after all required values match.

Boundary rules:

- session invalidity: Generic Authentication/Session Required;
- container/selector/mapping/generation/capability mismatch: Generic Flow Capability Error;
- feature disabled: fixed feature/service class;
- advisory/primary-store failure: Generic Service Unavailable;
- valid capability plus Invitation semantic terminal: imported PR-02 Canonical Unavailable.

A stale candidate Handoff never returns success.

# CLEANUP, RESEND, REVOKE, AND REPAIR ALGORITHMS

## Resend

1. identify affected Handoffs without mutation locks;
2. derive/sort/acquire all Handoff advisory locks;
3. acquire Invitation/generation row locks;
4. rotate generation;
5. mark affected Handoffs revoked and update mappings/projections/indexes;
6. commit atomically.

## Revoke

Uses the same advisory-lock set and ordering before Invitation/generation and affected-row mutation.

## Issued/operation expiry

Cleanup acquires the Handoff advisory lock before checking the authoritative deadline and updating state, selector/recovery projection, coordination, and active index.

## Selector/recovery cleanup

Cleanup cannot remove a mapping or projection without the Handoff advisory lock and post-lock deadline/state reread.

## Administrative repair

Repair uses the same advisory and row-lock order, records the approved reason, and cannot bypass normal actor/operation invariants.

# DATABASE PRIVILEGE AND SYNCHRONIZATION MODEL

| Principal/process | Required synchronization |
|---|---|
| Callback executor | Callback-operation advisory synchronization; no Invitation mutation. |
| BFF session service | Logical-session/cookie-capability synchronization. |
| Exchange executor | Exchange tuple advisory lock before semantic reads and row locks. |
| Consume executor | Handoff advisory lock before row locks. |
| Reconciliation owner | Handoff advisory lock and read-only authoritative reread. |
| Resend/Revoke executor | Every affected Handoff advisory lock before Invitation-first row locks. |
| Expiry/selector/recovery cleanup | Corresponding Handoff advisory lock before mutation. |
| Administrative repair | Full deterministic advisory set before row locks. |

# UX AND RECOVERY ARCHITECTURE

- PKCE verifier survives top-level navigation only in the complete OAuth client continuation record.
- Continuation response loss retries the exact idempotent request.
- Callback response loss is recoverable without a callback-operation reference.
- Callback replay rotates a cookie capability for the same logical session and binding ID.
- Provider refresh creates a successor session and binding ID.
- Voluntary logout/account switch is blocked during unresolved callback or Consume work.
- Forced security logout may end client retry but cannot release/rebind server coordination.
- All tabs sharing a container are covered by server logout-readiness checks.
- Resend, Revoke, expiry, mapping cleanup, projection cleanup, and repair are serialized with Reconciliation through the same Handoff lock.

# OBSERVABILITY AND REDACTION ARCHITECTURE

Required architecture event families include:

- oauth_client_record_prepared;
- oauth_client_record_verified;
- auth_continuation_replayed;
- callback_reconciled_by_continuation;
- callback_reference_missing_recovery_succeeded;
- callback_cookie_capability_reissued;
- callback_cookie_previous_digest_accepted;
- provider_refresh_session_rotated;
- voluntary_logout_blocked;
- forced_logout_operation_orphaned_until_expiry;
- cross_tab_reconciliation_required;
- resend_handoff_locks_acquired;
- revoke_handoff_locks_acquired;
- cleanup_handoff_lock_acquired;
- multi_handoff_lock_order_verified.

Raw OAuth code/state/verifier, provider tokens, raw cookie capability, BFF cookie/session IDs, actor UUID, flow selector, raw Idempotency-Key, and advisory source material remain prohibited from general logs, analytics, replay, traces, and metric labels.

# GENERIC RATE LIMITED V1

All prevalidation rate buckets continue to use one generic HTTP `429` class. Container new-slot denial and exact-tuple recovery never use this class.

# TESTING AND CI SPECIFICATION

Tests 1–260 retain the unique Revision 10/10.1 numbering and governing architecture meaning. Tests 223–244 retain the Revision 10 mapping; tests 245–260 retain the Revision 10.1 detailed mapping.

## Tests 261–273

| # | Purpose | Setup | Execution | Assertion | Negative assertion | Evidence | Shared-CI suitability |
|---|---|---|---|---|---|---|---|
| 261 | PKCE verifier persists before navigation | Prepare a flow and state with empty storage. | Write/read-back record, create continuation, navigate and return. | Callback retrieves exact verifier from `pr03.oauth.<state>`. | Verifier is not memory-only or lost across navigation. | Browser storage and callback trace. | Yes |
| 262 | Complete continuation record | Generate every required field. | Persist and read back before request; update after response. | Version 2 schema and state transitions are exact. | No state digest reference or missing flow/return field. | Storage snapshot. | Yes |
| 263 | Continuation response loss is idempotent | Drop first continuation response after server commit. | Retry exact request from prepared record. | Same continuation reference/expiry; one server record. | No duplicate continuation or changed state binding. | Row count and response comparison. | Yes |
| 264 | Recovery before cbop reaches browser | Create callback operation and drop response before reference receipt. | Reload and reconcile using container + continuation + selector. | Unique operation/classification is recovered. | Missing cbop does not make recovery impossible. | Server lookup and browser trace. | Yes |
| 265 | Callback replay rotates cookie capability | Commit one logical session and lose/replay response. | Replay callback twice concurrently. | New capabilities map to same logical session and binding ID. | No second logical session or provider exchange. | Session rows, digest generations, provider count. | Yes |
| 266 | Raw cookie absent from database | Issue and reissue capabilities. | Inspect protected storage, logs, traces, and metrics. | Only versioned digests are stored. | Raw capability is absent everywhere server-persistent. | Secret scan and DB snapshot. | Yes |
| 267 | Voluntary logout blocked during unknown Consume | Create operation-bound unknown outcome in one shared-container tab. | Attempt logout/account switch from another tab. | Logout-readiness blocks and requires Reconciliation. | Client key/session is not cleared. | Multi-tab trace and server state. | Yes |
| 268 | Forced revocation preserves operation evidence | Create unknown operation then revoke session/security user. | Force logout and inspect operation through expiry. | Session/client recovery ends; server coordination/evidence remains. | Operation is not abandoned, released, or rebound. | Operation history and lock trace. | Yes |
| 269 | Cross-tab account switch checks all active flows | Prepare multiple tabs/flows with one unresolved item. | Request account switch. | Server checks every shared-container active/recoverable item. | A quiet initiating tab cannot bypass another tab’s operation. | Flow enumeration-free internal audit and browser trace. | Conditional browser CI |
| 270 | Resend locks affected Handoffs | Prepare multiple issued/operation-bound Handoffs for one generation. | Execute Resend concurrently with Reconciliation. | Deterministically sorted Handoff locks precede generation mutation. | No stale Reconciliation result or row-lock-first path. | Advisory/row lock order trace. | Yes |
| 271 | Revoke locks affected Handoffs | Prepare active Handoffs then Revoke concurrently. | Run Revoke/Reconciliation. | All affected Handoff locks precede state/mapping mutation. | No unlocked projection/index change. | Lock trace and snapshots. | Yes |
| 272 | Expiry and selector cleanup lock Handoff | Prepare deadline and mapping cleanup races. | Run issued/operation expiry and selector/recovery cleanup. | Corresponding lock is held through reread and mutation. | No cleanup mutates mapping/projection/index unlocked. | Fault/concurrency trace. | Yes |
| 273 | Deterministic multi-Handoff ordering | Prepare Handoffs whose signed and unsigned order differs plus a hash collision fixture. | Run Resend/Revoke/repair concurrently. | Locks use unsigned ascending key and UUID tie-break. | No signed-order divergence or deadlock-prone alternate order. | Derived-key list and acquisition trace. | Yes |

# ARCHITECTURE REMEDIATION MATRIX

| Finding | Resolution section | Tests | Architecture remediation | Final closure |
|---|---|---|---|---|
| INT-ARCH-10.1-P0-01 | OAUTH CLIENT CONTINUATION RECORD | 261–263 | ADDRESSED | VALIDATION REQUIRED |
| INT-ARCH-10.1-P0-02 | CALLBACK OPERATION LOOKUP AND CLIENT RECOVERY | 264 | ADDRESSED | VALIDATION REQUIRED |
| INT-ARCH-10.1-P0-03 | DEDICATED-ORIGIN BFF AUTH SESSION STORAGE; BFF AUTH SESSION STATE MACHINE | 265–266 | ADDRESSED | APPROVAL REQUIRED |
| INT-ARCH-10.1-P0-04 | VOLUNTARY LOGOUT AND ACCOUNT SWITCH RECOVERY; FORCED SECURITY LOGOUT | 267–269 | ADDRESSED | APPROVAL REQUIRED |
| INT-ARCH-10.1-P0-05 | GLOBAL HANDOFF ADVISORY LOCK RULE; CLEANUP, RESEND, REVOKE, AND REPAIR ALGORITHMS | 270–273 | ADDRESSED | VALIDATION REQUIRED |
| INT-ARCH-10.1-P1-01 | Specification Status | Document assertion | ADDRESSED | VALIDATION REQUIRED |
| INT-ARCH-10.1-P1-02 | TESTING AND CI SPECIFICATION | 261–273 | ADDRESSED | VALIDATION REQUIRED |

# INTERMEDIATE ARCHITECTURE REVIEW GATE

Revision 10.2 is submitted only for Intermediate Architecture Review.

Allowed review outcomes:

```text
ARCHITECTURE READY FOR CONTRACT FINALIZATION
```

or:

```text
ARCHITECTURE REVISION REQUIRED
```

Even an architecture-ready outcome:

- does not authorize Runtime implementation;
- does not authorize an implementation branch;
- requires Revision 11 Exact Contract and Governance Finalization;
- leaves repository, browser, OAuth-provider, database, lock, session, and concurrency validation outstanding.

# REVISION 11 RESERVED FINALIZATION

Revision 11 will finalize:

- `PR03_RESPONSE_HEADERS_V1`;
- exact header presence and prohibition;
- CORS and exposed-header inheritance;
- Correlation-ID precedence;
- imported PR-02 fixture integration;
- exact bytes, Content-Length, newline, and compression;
- final governance and owner disposition;
- final Remediation Matrix closure;
- formal package, manifest, ZIP, and sidecars;
- formal independent-review readiness.

The Revision 10.2 architecture findings are resolved in this document and are not deferred to Revision 11.

# APPENDIX A — ARCHITECTURE REDACTION BOUNDARY

| Data | Browser/server rule |
|---|---|
| OAuth state | Tab-scoped continuation record and callback URL memory until sanitation; never general logs. |
| PKCE verifier | Tab-scoped continuation record; sent only to callback exchange; never server logs. |
| State digest | Server-only. |
| Callback operation reference | Optional browser record; non-authorizing; not required for recovery. |
| Provider access/refresh token | Protected server storage only. |
| Raw BFF cookie capability | Browser cookie and transient response memory only. |
| Cookie capability digest | Protected server storage. |
| Actor session binding ID | Browser-readable, non-authorizing, logical-session-generation bound. |
| Raw Idempotency-Key | Tab sessionStorage and request header only. |
| Handoff advisory keys/source IDs | Server only. |

# APPENDIX B — CLEAN DOCUMENT ASSERTIONS

Revision 10.2 contains:

- one Revision 10.2 title;
- one Architecture Recovery Closure Edition heading;
- D001–D030 exactly once;
- one OAuth Client Continuation Record;
- one Callback Operation State Machine;
- one BFF Auth Session State Machine;
- one Global Handoff Advisory Lock Rule;
- one Architecture Remediation Matrix;
- one Intermediate Architecture Review Gate;
- tests 261–273 exactly once;
- no Runtime implementation, SQL, migration, RPC, Edge, or UI implementation;
- no Revision 11 final exact-header or package artifacts.

SUBMIT REVISION 10.2 FOR INTERMEDIATE ARCHITECTURE REVIEW
