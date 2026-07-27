# LINE Login MVP Runbook

## MVP scope

This MVP hardens the existing LINE OAuth boundary and continues to use the established identity chain:

```text
people → app_accounts → line_identities → Supabase Auth user/session
```

It adds no user table, session table, identity table, migration, RPC, Message Board behavior, or PR-03 Invitation Acceptance runtime.

## Local startup

1. Run `npm ci`.
2. Start the existing local Supabase stack using the repository workflow.
3. Copy `.env.example` to an ignored local environment file.
4. Configure the existing local Supabase variables.
5. Set:

```dotenv
APP_ENV=local
NEXT_PUBLIC_SITE_URL=http://localhost:3000
LINE_LOGIN_MODE=mock
LINE_MOCK_SIGNING_SECRET=<at-least-32-random-characters>
```

6. Run `npm run dev` and start login at `/api/auth/line/start`.

The signed mock accepts only a localhost site, requires a dedicated server-only signing secret, and is rejected when `APP_ENV=production` or the production Node runtime is active. Missing real credentials never trigger a mock fallback in production.

## Real LINE provider environment

Real provider mode requires these deployment environment values:

```dotenv
APP_ENV=production
NEXT_PUBLIC_SITE_URL=https://example.invalid
LINE_LOGIN_MODE=line
LINE_LOGIN_CHANNEL_ID=<manual-configuration>
LINE_LOGIN_CHANNEL_SECRET=<server-secret-store>
LINE_LOGIN_CALLBACK_URL=https://example.invalid/api/auth/line/callback
```

`LINE_LOGIN_CHANNEL_SECRET` is server-only and must never use a `NEXT_PUBLIC_` prefix. The token and ID-token verification endpoints are called only by server code. Access tokens, refresh tokens, and ID tokens are neither stored nor returned to the browser.

## LINE Developers Console manual checklist

- Create or select the intended LINE Login channel.
- Confirm the web-app channel ID and channel secret.
- Register the exact HTTPS callback URL.
- Confirm that the registered callback equals `LINE_LOGIN_CALLBACK_URL` byte for byte.
- Confirm the deployment origin equals `NEXT_PUBLIC_SITE_URL`.
- Do not configure LINE Official Account webhook or Rich Menu settings as part of this MVP.

The repository does not sign in to or modify LINE Developers Console automatically.

## Session and logout checks

- `GET /api/auth/line/session` returns only `{"authenticated":true}` for a user validated through Supabase Auth `getUser()`.
- Missing, invalid, or expired sessions return only `{"authenticated":false}`.
- `POST /api/auth/line/logout` requires the trusted same-origin `Origin`; Fetch Metadata, when present, must be `same-origin`.
- Logout uses the existing Supabase Auth session, clears LINE OAuth cookies, and is idempotent for an unauthenticated browser.
- Cross-site POST is rejected. No GET logout route exists.

## Generic errors

Public login failure redirects to `/login?error=line_login_failed`. Provider descriptions, database errors, callback query text, IDs, invitation state, codes, state, nonce, tokens, cookies, and secrets are not included.

## Security boundary

- OAuth state and nonce are high-entropy and stored in HttpOnly, SameSite=Lax, path-root cookies for ten minutes.
- Only state/nonce/invitation digests and required metadata are persisted server-side.
- The Callback validates cookie state, database digests, expiry, one-time consumption, nonce, invitation binding, and local redirect before exchanging the code.
- The official LINE verification endpoint authenticates the ID token; the returned issuer, audience, expiry, issued-at time, nonce, subject, and bounded profile fields are checked again locally.
- Production cookies are Secure based only on server runtime configuration, never forwarded headers.
- Redirects reject absolute, protocol-relative, encoded external, backslash, control-character, and CRLF forms.

See `LINE_LOGIN_SECURITY_BOUNDARY.md` for the pre-change audit and residual risks.

## Explicit exclusions

- No PR-03 runtime or Revision contract implementation.
- No Account Switch or LINE identity unlink.
- No hosted Supabase mutation, migration deployment, production data access, or Auth-user maintenance.
- No automatic LINE Console changes.
- No real-provider smoke-test claim without manually supplied credentials and an HTTPS deployment.
