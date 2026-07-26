# PR-03 FORMAL SPECIFICATION — REVISION 10.3

## Architecture Concurrency Closure Edition

## Specification Status

- Planning document: READY FOR INTERMEDIATE ARCHITECTURE REVIEW
- Runtime implementation: BLOCKED
- Ninth independent review: REQUEST CHANGES
- Revision 10.2 intermediate architecture review: ARCHITECTURE REVISION REQUIRED
- Revision 10.3 review status: NOT YET REVIEWED
- Formal specification approval requested: No
- Human/legal approval represented: No
- Repository validation status: NOT VERIFIED IN THIS SPECIFICATION RUN
- Model: gpt-5.6-sol / isolated architecture correction run

Revision 10.3 closes the atomic-logout, generation-set synchronization, and zero-callback-operation recovery blockers identified in the Revision 10.2 Intermediate Architecture Review. It does not perform Revision 11 exact-header, fixture, package, sidecar, or governance finalization and does not authorize Runtime implementation.

# DOCUMENT PURPOSE, AUTHORITY, AND SCOPE

## Purpose

Revision 10.3 preserves the converged Revision 10–10.2 architecture and corrects:

- the voluntary logout readiness-to-logout TOCTOU race through one atomic server-side logout fence;
- browser inability to request or select forced-security logout mode;
- Invitation-generation Handoff-set instability during Exchange, Resend, Revoke, expiry, and set-based repair;
- zero-callback-operation reconciliation through an explicit Auth Restart Required classification;
- tests 274–280 and Architecture Remediation Matrix synchronization.

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
- Revision 10.2 OAuth continuation, callback recovery, cookie-capability rotation, and unknown-operation preservation remain in force.

## Authority order

1. Specification Status.
2. Normative Decision Register.
3. Atomic Logout Fence.
4. Invitation-Generation Lifecycle Advisory Lock.
5. OAuth/Callback and BFF Auth Session state machines.
6. Exchange, Consume, Reconciliation, Resend, Revoke, cleanup, and repair algorithms.
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
| Continuation recovery key | Flow-container cookie + continuation reference + flow selector; resolves zero or one callback operation. |
| Auth Restart Required | Generic fail-closed callback recovery class used when no callback operation exists or provider outcome cannot be safely resumed. |
| Logical BFF session | One authenticated server-side session identity independent of rotating browser cookie capabilities. |
| Cookie capability | Random opaque bearer stored only in the browser cookie and transient response memory; only keyed digests are stored server-side. |
| Current/previous cookie digest | Two-digest overlap used to tolerate concurrent replay/reissue response ordering for one logical session. |
| Provider refresh rotation | Successor logical session created by provider refresh; changes session ID and actor-session binding ID. |
| Callback capability reissue | New cookie capability for the same logical session; does not change actor-session binding ID. |
| Voluntary logout | User-initiated logout or account switch executed only through the atomic logout fence. |
| Forced security logout | Server-triggered revocation, provider invalidation, disabled user, authorized administration, or incident response; never browser-selectable. |
| Logout guard | Shared session-family + flow-container synchronization domain used by voluntary logout, Consume operation binding, callback start, and callback session commit. |
| `logout_pending` | Server-side transient fence state set while the atomic voluntary logout gate rereads all blocking work. |
| Handoff advisory lifecycle lock | Transaction advisory lock required before mutation of one Handoff's validity, mappings, coordination, projections, or active indexes. |
| Invitation-generation lifecycle advisory lock | Separate advisory-lock domain that freezes creation/removal membership of the Handoff set for one Invitation generation. |

# FIXED ARCHITECTURAL PRINCIPLES

1. OAuth state and PKCE verifier are persisted and read-back verified before top-level navigation.
2. Client continuation state is indexed by exact OAuth state.
3. `state_digest_reference` remains server-only and is removed from the browser record.
4. Callback recovery never depends on receiving a callback-operation reference in the first response.
5. Callback Reconciliation resolves by container + continuation reference + selector.
6. Zero resolved callback operations return Auth Restart Required without a provider call or BFF session creation.
7. Server stores cookie-capability digests, never raw cookie bytes.
8. Callback replay reissues a cookie capability for the same logical session and preserves the binding ID.
9. Provider refresh creates a successor logical session and changes the binding ID.
10. `GET /logout-readiness` is advisory UI information only and never authorizes logout.
11. `POST /logout` performs one atomic server-side fence and cannot accept a forced-mode selector from the browser.
12. Consume operation binding, callback provider-start transition, and callback session commit participate in the same logout guard.
13. Forced security logout may destroy client recovery material but cannot release or rebind the server operation.
14. Exchange creation and every mutation that changes an Invitation generation's active Handoff membership use the Invitation-generation lifecycle advisory lock.
15. Every mutation of an individual Handoff's validity, mapping, coordination, projections, or active index also acquires its Handoff advisory lock.
16. Multiple lifecycle and Handoff locks use deterministic ordering.
17. Runtime implementation remains `BLOCKED`.

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

The client persists complete OAuth continuation material before navigation. Callback recovery is continuation-based, not callback-reference-dependent. Zero callback operations return Auth Restart Required without a provider call or session creation. Logical BFF sessions rotate cookie capabilities through digests and distinguish callback reissue from provider refresh rotation.

## PR03-D027 — Atomic logout fence and no client abandonment

There is no operation-abandonment endpoint. `GET /logout-readiness` is advisory only. Voluntary logout/account switch uses an atomic server-side logout guard and `logout_pending` fence; it cannot commit while callback or Consume work is unresolved. Forced security termination is server-triggered only and cannot rebind or release the server operation.

## PR03-D028 — Response precedence

Imported PR-02 remains the semantic fixture authority. Revision 11 finalizes PR-03-owned exact headers and shared response profiles.

## PR03-D029 — Generation-set and Handoff advisory-lock lifecycle

Exchange acquires the tuple advisory lock, performs authoritative lookup, then acquires the Invitation-generation lifecycle lock before generation revalidation and row locks. Resend, Revoke, generation-affecting expiry/cleanup, and set-based repair acquire the lifecycle lock before discovering the final affected Handoff set, then acquire every Handoff advisory lock deterministically before Invitation-first row locks.

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
| `/functions/v1/logout-readiness` | Advisory UI snapshot only; never authorizes logout. |
| `/functions/v1/logout` | Atomic voluntary logout gate only; browser cannot select forced-security mode. |
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

The callback transitions `created → provider_exchange_started` and `session_commit_started → session_committed` acquire the shared logout guard and fail closed when `logout_pending`, revoked, or terminated session-family state is present. The guard is never held across the external provider network call; the committed `provider_exchange_started` state itself blocks voluntary logout.

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

to resolve zero or one callback operation.

Rules:

- one continuation can have at most one callback operation for the bound flow;
- exact callback tuple replay rereads that operation;
- a missing callback-operation reference does not block recovery;
- if the operation reference was received, it is an additional equality check only;
- another flow/container cannot use the continuation;
- `unknown_provider_outcome` returns Auth Restart Required and never re-exchanges code;
- `session_committed` returns the stored classification and may perform same-logical-session cookie-capability reissue.

### Zero callback operation

When no callback operation exists:

```text
Auth Restart Required
```

The server:

- does not call the provider;
- does not create or reissue a BFF session;
- does not describe the result as a provider failure or unknown provider outcome;
- does not infer that a provider request was started;
- retains or expires the server continuation only according to its authoritative deadline and existing single-use rules.

The browser may clear the unusable callback submission state and begin a new Auth continuation. The original OAuth code is not recoverable after URL sanitation/reload and is never reconstructed.

More than one callback operation for the same continuation/flow is an integrity failure and maps to Generic Service Unavailable, with no provider call or session creation.

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

# ATOMIC LOGOUT FENCE AND ACCOUNT SWITCH RECOVERY

## Advisory readiness endpoint

```text
GET /functions/v1/logout-readiness
```

This endpoint exists only to prepare the UI and prompt Reconciliation. It is a non-authorizing snapshot and cannot be used as evidence that a later logout is safe.

It may report blocking states reachable through the shared flow-container cookie and current session family, including:

- `operation_bound`;
- unknown Consume commit;
- callback `provider_exchange_started`;
- callback `provider_exchange_succeeded`;
- callback `session_commit_started`;
- callback `unknown_provider_outcome`;
- callback response-unknown coordination.

A `safe` response can become stale immediately and never bypasses the atomic `POST /logout` gate.

## Shared logout guard

The server derives one transaction advisory guard from the exact logical session family and flow-container identity:

```text
digest = SHA-256(
  ASCII("pr03-logout-guard.v1")
  || 0x0A || ASCII(canonical_session_family_uuid)
  || 0x0A || ASCII(canonical_flow_container_uuid)
)
logout_guard_key = signed_big_endian_int64(digest[0:8])
```

The guard is synchronization, not authorization. Hash collision can only conservatively serialize unrelated pairs; every row relationship is still authoritatively revalidated.

The following transitions acquire/check the same guard before committing:

- Consume `issued → operation_bound`;
- callback `created → provider_exchange_started`;
- callback local `session_commit_started → session_committed`;
- voluntary `POST /logout`.

When `logout_pending` is set:

- no new Consume operation may bind;
- no callback may enter provider exchange;
- no callback may commit a logical BFF session;
- existing blocking states remain visible to the logout transaction.

## Atomic voluntary logout

```text
POST /functions/v1/logout
```

Browser request body is empty or the exact Revision 11 no-field schema. It contains no `mode`, `forced`, `security`, `reason`, or equivalent selector.

Server algorithm:

1. Resolve the current logical session family and flow container.
2. Acquire the shared logout guard.
3. In the guarded server transaction, set `logout_pending`.
4. Authoritatively reread every blocking callback and Consume state across all flows reachable through the shared container and session family.
5. If any blocking item exists:
   - clear `logout_pending`;
   - commit no session revocation;
   - preserve cookie, descriptor, callback record, and raw Idempotency-Key;
   - return Logout Recovery Required.
6. If no blocking item exists:
   - atomically revoke the logical session;
   - invalidate its descriptor/cookie capabilities;
   - mark logout committed;
   - clear only terminal or permanently unavailable client records through the normal browser response path.
7. Release the guard at transaction end.

Readiness and logout are never two halves of one authorization decision; only the guarded POST transaction decides.

## Account switch

Account switch first completes the same atomic voluntary logout gate. Only after logout commits may a new Auth continuation or logical session be created. It never reuses the old logical session, binding ID, raw key, callback operation, or operation identity.

# FORCED SECURITY LOGOUT

Forced security logout is not a browser-selectable mode.

Permitted triggers are limited to:

- server-side session revocation;
- provider/session invalidation;
- disabled or revoked Auth user;
- authenticated and authorized administrative termination;
- security-incident automation or operator action.

A browser request to `POST /logout` cannot supply a body/header/query/cookie value that selects, upgrades, or simulates forced mode. Invalid attempts are rejected before Invitation semantic lookup and do not clear recovery material.

A trusted forced-security event acquires the same logout guard, marks security termination pending, and may immediately:

- revoke/terminate the logical session;
- clear the cookie;
- invalidate descriptor and client material;
- revoke provider refresh capability where supported.

Architecture consequences remain explicit:

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
| Atomic voluntary logout gate finds unresolved operation/callback | Logout Recovery Required |
| Zero callback operation or unknown provider outcome | Auth Restart Required |
| Forced security termination | Generic Authentication/Session Required |
| Feature disabled | Fixed Feature Disabled/Service class |
| Minimum operation capability window unavailable | Generic Service Unavailable |
| Invitation semantic failure after valid session/capability | Imported PR-02 Canonical Unavailable |

Revision 11 finalizes exact bytes and headers.

# HANDOFF EXCHANGE ENDPOINT CONTRACT

Before the Exchange tuple advisory lock, only request method/media/body checks, Origin/Fetch Metadata/flag/global-rate checks, token-shaped ASCII/base64url/length/version-shape checks, and pure digest/HMAC preparation are allowed.

The authoritative order is:

1. Request/security prevalidation.
2. Token-shaped parsing without database semantic lookup.
3. Calculate and acquire the Exchange tuple transaction advisory lock.
4. Perform authoritative PR-02 token, Invitation, and generation lookup.
5. Derive and acquire the Invitation-generation lifecycle advisory lock for the resolved generation.
6. Revalidate token hash/HMAC, generation, nonce, issue metadata, expiry, and Invitation state after lifecycle-lock acquisition.
7. Acquire Invitation/generation row locks.
8. Lock the container.
9. Reread exact/partial/new tuple.
10. Exact tuple: return original selector without capacity allocation.
11. Partial tuple: conflict.
12. New tuple: evaluate and allocate capacity.
13. Commit slot, tuple, flow, Handoff, selector, and generation membership atomically.

No Handoff may be created for a generation without holding its lifecycle lock. If generation changes between steps 4 and 6, the transaction fails/restarts under the newly authoritative generation rather than creating a stale Handoff.

# INVITATION-GENERATION AND HANDOFF ADVISORY LOCK RULES

## Invitation-generation lifecycle lock

A separate transaction advisory-lock domain freezes the active/recoverable Handoff membership of one Invitation generation.

```text
digest = SHA-256(
  ASCII("pr03-invitation-generation-lifecycle.v1")
  || 0x0A || ASCII(canonical_invitation_uuid)
  || 0x0A || ASCII(canonical_generation_decimal)
)
lifecycle_key = signed_big_endian_int64(digest[0:8])
```

The key is not authorization. Hash collision only causes conservative serialization; the full Invitation UUID and generation are revalidated after lock acquisition.

It is required before:

- Exchange creates a Handoff for that generation;
- Resend rotates or batch-invalidates a generation;
- Revoke batch-invalidates Handoffs;
- issued/operation expiry removes a Handoff from generation membership;
- selector/recovery/active-index cleanup changes generation membership;
- set-based administrative repair changes the affected set.

For multiple Invitation generations:

1. derive every lifecycle key;
2. interpret as unsigned 64-bit values;
3. sort ascending unsigned value;
4. use ascending canonical Invitation UUID and generation as collision tie-break;
5. acquire all lifecycle locks before any Handoff advisory lock.

## Handoff advisory lifecycle lock

After the applicable generation lifecycle lock, any process that mutates any of the following acquires each corresponding Handoff advisory lock:

```text
Handoff state
Invitation/generation-to-Handoff validity
selector-to-Handoff mapping
operation coordination
terminal projection
recovery projection
active-flow index
```

Covered processes include Consume, Resend, Revoke, issued/operation expiry, selector/recovery cleanup, active-index removal, and administrative repair.

## Multi-Handoff acquisition

For a process touching multiple Handoffs:

1. hold all applicable Invitation-generation lifecycle locks;
2. derive every canonical Handoff advisory key;
3. interpret each key as unsigned 64-bit numeric value;
4. sort ascending unsigned numeric value;
5. use ascending full Handoff UUID as collision tie-break;
6. acquire all transaction advisory locks in that order;
7. then enter the Invitation-first row-lock order.

No process may mutate covered data without the required lifecycle/Handoff locks, use `SKIP LOCKED`, or acquire row locks first.

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

1. acquires the shared logout guard before any `issued → operation_bound` transition;
2. fails with Logout Recovery Required or session-required classification if `logout_pending`/revocation blocks binding;
3. resolves candidate Handoff;
4. acquires Handoff advisory lock;
5. post-lock revalidates session, actor, descriptor, flow capability, operation identity, and deadline;
6. acquires canonical Invitation-first row locks;
7. binds or retries the exact operation;
8. commits the only acceptance mutation path.

An exact retry of an already `operation_bound` operation does not create a new binding, but still validates current session/recovery policy.

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

1. Acquire the Invitation-generation lifecycle advisory lock for the current generation.
2. Authoritatively read the complete affected Handoff set.
3. Derive, sort, and acquire every Handoff advisory lock.
4. Acquire Invitation/generation row locks.
5. Reread the complete affected Handoff set.
6. Compare the second set with the locked discovery set.
7. If unequal, rollback and retry from step 1.
8. If equal, rotate generation, revoke affected Handoffs, and update mappings/projections/indexes atomically.

Because Exchange must acquire the same lifecycle lock before creating a Handoff, no new Handoff can enter the generation between discovery and mutation.

## Revoke

Revoke uses the same lifecycle-lock → affected-set discovery → sorted Handoff-lock → Invitation/generation row-lock → affected-set reread sequence. Set mismatch rolls back and retries.

## Issued/operation expiry

If expiry changes active/recoverable generation membership:

1. acquire the Invitation-generation lifecycle lock;
2. acquire the Handoff advisory lock;
3. reread deadline, generation membership, mapping, and state;
4. update state, selector/recovery projection, coordination, and active index atomically.

## Selector/recovery cleanup

Cleanup that changes selector-to-Handoff or active/recoverable generation membership acquires the lifecycle lock before the Handoff lock and performs post-lock deadline/state/mapping reread.

## Administrative repair

Single-Handoff repair follows lifecycle lock → Handoff lock → Invitation-first row locks when generation membership is affected.

Set-based repair:

1. acquire all applicable lifecycle locks deterministically;
2. discover the complete affected Handoff sets;
3. acquire all Handoff locks deterministically;
4. acquire Invitation-first row locks;
5. reread every set;
6. rollback/retry on mismatch;
7. otherwise commit the approved repair reason and mutations atomically.

No repair bypasses actor, operation, generation, or terminal invariants.

# DATABASE PRIVILEGE AND SYNCHRONIZATION MODEL

| Principal/process | Required synchronization |
|---|---|
| Callback executor | Callback-operation lock plus logout guard before provider-start and session-commit transitions; no Invitation mutation. |
| BFF session service | Logical-session/cookie-capability synchronization; forced mode only from trusted server/admin trigger. |
| Voluntary logout executor | Shared logout guard, `logout_pending`, and atomic blocking-state reread/revocation transaction. |
| Exchange executor | Exchange tuple lock, then Invitation-generation lifecycle lock, then authoritative revalidation and row locks. |
| Consume executor | Logout guard before new operation binding; Handoff advisory lock before row locks. |
| Reconciliation owner | Handoff advisory lock and read-only authoritative reread. |
| Resend/Revoke executor | Invitation-generation lifecycle lock, complete affected-set discovery, every Handoff lock, then Invitation-first row locks and set reread. |
| Expiry/selector/recovery cleanup | Lifecycle lock when generation membership changes, then corresponding Handoff lock before mutation. |
| Administrative repair | All lifecycle locks, deterministic Handoff lock set, affected-set reread, then row locks/mutation. |

# UX AND RECOVERY ARCHITECTURE

- PKCE verifier survives top-level navigation only in the complete OAuth client continuation record.
- Continuation response loss retries the exact idempotent request.
- Callback response loss is recoverable without a callback-operation reference.
- Zero callback-operation recovery displays Auth Restart Required and begins a new continuation; it never alleges provider failure.
- Callback replay rotates a cookie capability for the same logical session and binding ID.
- Provider refresh creates a successor session and binding ID.
- `GET /logout-readiness` is a UI hint only.
- `POST /logout` atomically fences new callback/Consume starts and either commits logout or returns Logout Recovery Required.
- Browser code cannot request forced-security logout.
- Forced security logout may end client retry but cannot release/rebind server coordination.
- All tabs sharing a container are covered by the server-side logout guard and blocking-state reread.
- Exchange and generation-wide invalidation are serialized through the Invitation-generation lifecycle lock.
- Resend, Revoke, expiry, mapping cleanup, projection cleanup, and repair are serialized with Reconciliation through lifecycle plus Handoff locks.

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
- logout_guard_acquired;
- logout_pending_set;
- logout_atomic_gate_blocked;
- browser_forced_logout_attempt_rejected;
- invitation_generation_lifecycle_lock_acquired;
- affected_handoff_set_changed;
- callback_reconcile_zero_operation;
- cross_tab_reconciliation_required;
- resend_handoff_locks_acquired;
- revoke_handoff_locks_acquired;
- cleanup_handoff_lock_acquired;
- multi_handoff_lock_order_verified.

Raw OAuth code/state/verifier, provider tokens, raw cookie capability, BFF cookie/session IDs, actor UUID, flow selector, raw Idempotency-Key, and advisory source material remain prohibited from general logs, analytics, replay, traces, and metric labels.

# GENERIC RATE LIMITED V1

All prevalidation rate buckets continue to use one generic HTTP `429` class. Container new-slot denial and exact-tuple recovery never use this class.

# TESTING AND CI SPECIFICATION

Tests 1–273 retain the unique Revision 10–10.2 numbering and governing architecture meaning. Tests 223–244 retain the Revision 10 mapping; tests 245–260 retain Revision 10.1; tests 261–273 retain Revision 10.2.

## Tests 261–273

| # | Purpose | Setup | Execution | Assertion | Negative assertion | Evidence | Shared-CI suitability |
|---|---|---|---|---|---|---|---|
| 261 | PKCE verifier persists before navigation | Prepare a flow and state with empty storage. | Write/read-back record, create continuation, navigate and return. | Callback retrieves exact verifier from `pr03.oauth.<state>`. | Verifier is not memory-only or lost across navigation. | Browser storage and callback trace. | Yes |
| 262 | Complete continuation record | Generate every required field. | Persist and read back before request; update after response. | Version 2 schema and state transitions are exact. | No state digest reference or missing flow/return field. | Storage snapshot. | Yes |
| 263 | Continuation response loss is idempotent | Drop first continuation response after server commit. | Retry exact request from prepared record. | Same continuation reference/expiry; one server record. | No duplicate continuation or changed state binding. | Row count and response comparison. | Yes |
| 264 | Recovery before cbop reaches browser | Create callback operation and drop response before reference receipt. | Reload and reconcile using container + continuation + selector. | Unique operation/classification is recovered. | Missing cbop does not make recovery impossible. | Server lookup and browser trace. | Yes |
| 265 | Callback replay rotates cookie capability | Commit one logical session and lose/replay response. | Replay callback twice concurrently. | New capabilities map to same logical session and binding ID. | No second logical session or provider exchange. | Session rows, digest generations, provider count. | Yes |
| 266 | Raw cookie absent from database | Issue and reissue capabilities. | Inspect protected storage, logs, traces, and metrics. | Only versioned digests are stored. | Raw capability is absent everywhere server-persistent. | Secret scan and DB snapshot. | Yes |
| 267 | Voluntary logout blocked during unknown Consume | Create operation-bound unknown outcome in one shared-container tab. | Call atomic `POST /logout` from another tab. | Guarded server reread returns Logout Recovery Required. | Advisory readiness cannot authorize logout; client key/session is not cleared. | Multi-tab guard trace and server state. | Yes |
| 268 | Forced revocation preserves operation evidence | Create unknown operation then revoke session/security user. | Force logout and inspect operation through expiry. | Session/client recovery ends; server coordination/evidence remains. | Operation is not abandoned, released, or rebound. | Operation history and lock trace. | Yes |
| 269 | Cross-tab account switch checks all active flows | Prepare multiple tabs/flows with one unresolved item. | Request account switch through atomic logout. | Guarded server transaction checks every shared-container active/recoverable item. | A quiet initiating tab or stale readiness result cannot bypass another tab’s operation. | Flow enumeration-free internal audit and browser trace. | Conditional browser CI |
| 270 | Resend locks affected Handoffs | Prepare multiple issued/operation-bound Handoffs for one generation. | Execute Resend concurrently with Exchange and Reconciliation. | Generation lifecycle lock precedes set discovery; sorted Handoff locks precede row locks and mutation. | No stale Reconciliation result, new set entrant, or row-lock-first path. | Lifecycle/Handoff/row lock order trace. | Yes |
| 271 | Revoke locks affected Handoffs | Prepare active Handoffs then Revoke concurrently with Exchange/Reconciliation. | Run the full lifecycle-lock and set-reread sequence. | All affected Handoff locks follow the generation lifecycle lock and precede state/mapping mutation. | No unlocked projection/index change or late set entrant. | Lock trace and snapshots. | Yes |
| 272 | Expiry and selector cleanup lock Handoff | Prepare deadline and mapping cleanup races that change generation membership. | Run issued/operation expiry and selector/recovery cleanup. | Generation lifecycle lock precedes the Handoff lock; both are held through reread and mutation. | No cleanup changes membership, mapping, projection, or index unlocked. | Fault/concurrency trace. | Yes |
| 273 | Deterministic multi-Handoff ordering | Prepare multiple generations/Handoffs whose signed and unsigned order differs plus collision fixtures. | Run Resend/Revoke/repair concurrently. | Lifecycle locks sort first; Handoff locks then use unsigned ascending key and UUID tie-break. | No signed-order divergence, domain inversion, or deadlock-prone alternate order. | Derived-key lists and acquisition trace. | Yes |

## Tests 274–280

| # | Purpose | Setup | Execution | Assertion | Negative assertion | Evidence | Shared-CI suitability |
|---|---|---|---|---|---|---|---|
| 274 | Atomic logout fence blocks concurrent Consume binding | One tab starts `POST /logout`; another is ready to bind an issued Handoff. | Pause under the shared guard and race both transitions. | Either operation binding commits first and logout returns Recovery Required, or logout commits first and binding is rejected. | No logout commit can clear recovery material after a concurrent operation binds outside the fence. | Guard/state transition trace and session/Handoff snapshots. | Yes |
| 275 | Atomic logout fence blocks callback start/session commit | Prepare callbacks before `provider_exchange_started` and before `session_committed`. | Race each transition with voluntary logout. | Logout and callback transitions serialize through the same guard; blocking callback state prevents logout. | No provider-start or session commit appears after a successful logout fence decision. | Callback/logout transaction order and provider/session counts. | Yes |
| 276 | Browser cannot request forced-security logout | Submit voluntary logout requests with `mode=forced`, body/header/query variants, and forged reason. | Call browser endpoint under valid and invalid sessions. | Forced selector is rejected/ignored according to the exact no-field contract; only the voluntary atomic gate runs. | Browser cannot clear unknown-operation recovery through forced mode. | Request parser trace, trigger audit, and unchanged operation state. | Yes |
| 277 | Concurrent Exchange cannot enter Resend affected set after discovery | Hold Resend lifecycle lock after affected-set discovery; start an Exchange for the same generation. | Attempt Handoff creation while Resend proceeds. | Exchange waits; it cannot create a Handoff until Resend commits/rolls back and generation is revalidated. | No unlocked Handoff B, stale selector, or capacity/index leak. | Lifecycle/Handoff lock trace and set snapshots. | Yes |
| 278 | Resend rereads affected set after lifecycle and row locks | Prepare multiple Handoffs and inject set mutation attempt/fault. | Execute full Resend sequence. | Second authoritative set equals discovery set before mutation; mismatch rolls back and retries. | No generation rotation commits with an inconsistent affected set. | Two set snapshots, retry trace, and atomic mutation audit. | Yes |
| 279 | Revoke and set-based repair use generation lifecycle lock | Prepare concurrent Exchange, Revoke, and set-based repair on one/multiple generations. | Run operations with lock instrumentation. | Lifecycle locks precede Handoff locks and row locks; all sets are reread. | No set-based mutation relies on pre-lock discovery alone. | Ordered lock lists, set comparisons, and repair audit. | Yes |
| 280 | Zero callback-operation reconciliation | Persist callback client state, ensure Exchange request never reaches server, sanitize/reload, then reconcile. | Call continuation-based Callback Reconciliation. | Returns Auth Restart Required; no provider call/session; continuation cleanup follows authoritative deadline. | Not classified as provider failure or `unknown_provider_outcome`. | Provider count, callback-operation row count, continuation state, and response class. | Yes |

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
| INT-ARCH-10.2-P0-01 | ATOMIC LOGOUT FENCE AND ACCOUNT SWITCH RECOVERY; FORCED SECURITY LOGOUT | 274–276 | ADDRESSED | VALIDATION REQUIRED |
| INT-ARCH-10.2-P0-02 | INVITATION-GENERATION AND HANDOFF ADVISORY LOCK RULES; HANDOFF EXCHANGE; CLEANUP/RESEND/REVOKE/REPAIR | 277–279 | ADDRESSED | VALIDATION REQUIRED |
| INT-ARCH-10.2-P1-01 | CALLBACK OPERATION LOOKUP AND CLIENT RECOVERY | 280 | ADDRESSED | VALIDATION REQUIRED |

# INTERMEDIATE ARCHITECTURE REVIEW GATE

Revision 10.3 is submitted only for Intermediate Architecture Review.

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

The Revision 10.3 architecture findings are resolved in this document and are not deferred to Revision 11.

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

Revision 10.3 contains:

- one Revision 10.3 title;
- one Architecture Concurrency Closure Edition heading;
- D001–D030 exactly once;
- one OAuth Client Continuation Record;
- one Callback Operation State Machine;
- one BFF Auth Session State Machine;
- one Atomic Logout Fence and Account Switch Recovery section;
- one Invitation-Generation Lifecycle Advisory Lock;
- one combined Invitation-Generation and Handoff Advisory Lock Rules section;
- one Architecture Remediation Matrix;
- one Intermediate Architecture Review Gate;
- tests 261–280 exactly once;
- no Runtime implementation, SQL, migration, RPC, Edge, or UI implementation;
- no Revision 11 final exact-header or package artifacts.

SUBMIT REVISION 10.3 FOR INTERMEDIATE ARCHITECTURE REVIEW
