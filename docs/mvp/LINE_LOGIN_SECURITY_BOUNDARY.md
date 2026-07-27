# LINE Login MVP Security Boundary

## Pre-change audit

1. **Start route:** already generated random state/nonce, persisted digests, and set HttpOnly/Lax cookies, but provider configuration and production mock mode were not rejected before persistence, failures outside the insert path could escape generically, and cookie behavior was duplicated.
2. **Callback route:** already checked the state cookie, persisted digest, nonce digest, expiry, invitation digest, return path, and conditional `consumed_at`; however cancel/error handling was implicit, expiry was absent from the compare-and-set filter, trusted-origin redirects were not centralized, and failure-path coverage was missing.
3. **Provider exchange:** already used LINE's token and ID-token verification endpoints, but had no timeout and only checked subject plus nonce in the returned verification payload.
4. **ID-token verification:** did not decode-only, but local validation of issuer, audience, expiry, issued-at time, response shape, and bounded profile values was missing.
5. **State/nonce one-time behavior:** durable digest rows and a consume condition existed; the hardened path terminally consumes a valid state before treating provider cancel, error, or missing code as failure.
6. **Replay protection:** `consumed_at is null` existed; the hardened compare-and-set also requires unexpired state and replay fails before provider exchange.
7. **Redirect validation:** the shared helper rejected basic absolute/protocol-relative forms only. LINE routes now use a LINE-owned helper rejecting encoded, backslash, control, CRLF, and malformed bypasses without changing shared navigation.
8. **Cookie attributes:** attributes were duplicated across routes and production Secure depended only on `APP_ENV`. LINE OAuth cookies now share one helper and production includes either `APP_ENV=production` or the production Node runtime.
9. **Session creation:** existing Supabase magic-link hash verification creates the existing Supabase Auth session. No second session model is added.
10. **Logout:** only the shared server action existed. The MVP adds a LINE-owned same-origin POST endpoint using the same Supabase Auth session.
11. **Mock production boundary:** localhost was checked, but a production runtime with a localhost site value could enable mock. Mock now requires local/test runtime, localhost, explicit mock mode, and a dedicated 32-character server secret.
12. **Secret/token logging:** the routes had no explicit logging. Hardened errors remain generic and provider response bodies, callback queries, tokens, and secrets are never embedded in thrown or public messages.
13. **Error/cancel flow:** missing code indirectly failed and cleared cookies. The hardened flow explicitly handles provider error/cancel after validating and consuming a matching state, then returns one public failure class.
14. **Test gaps:** start/callback routes, strict redirects, production cookies/mock behavior, real verification claims, session validation, logout origin checks, and redaction were not covered.

## Preserved trust boundary

The MVP preserves `people → app_accounts → line_identities → Supabase Auth`. Browser input cannot select a Person, Account, Auth UUID, or trusted LINE subject. Real subjects come only from LINE's verified ID-token response; mock subjects come only from a valid local signed payload.

## Residual risks

- Provider exchange is external network I/O and is not in one ACID transaction with local identity/session mutations.
- The existing first-login path can create an Auth user, Person, Account, or identity before a later local step fails. The Callback now attempts local Supabase sign-out after a post-session failure, but orphan reconciliation and fully atomic identity provisioning require architecture/schema work outside this PR.
- Invitation binding continues to use the existing `bind_line_identity_from_invitation` RPC and raw invitation cookie/redirect behavior. This MVP neither redesigns nor claims to implement PR-03 Invitation Acceptance runtime.
- Application time participates in the PostgREST expiry compare-and-set because the existing schema exposes no dedicated consume RPC. Database constraints and a future server-authoritative consume function remain separate schema work.
- Real LINE provider smoke testing requires manually configured credentials, exact Console callback registration, and an HTTPS deployment. It is `MANUAL_CONFIGURATION_REQUIRED` and is not represented as executed here.

These risks remain fail-closed at the public Callback result where possible. No human, product, security, technical, legal, or operational approval is represented.
