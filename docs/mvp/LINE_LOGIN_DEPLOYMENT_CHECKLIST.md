# LINE Login MVP Deployment Checklist

## Before deployment

- [ ] Deployment uses HTTPS.
- [ ] `NEXT_PUBLIC_SITE_URL` is the exact trusted HTTPS origin with no path.
- [ ] `LINE_LOGIN_CALLBACK_URL` is the exact HTTPS callback ending in `/api/auth/line/callback`.
- [ ] The same callback URL is registered manually in LINE Developers Console.
- [ ] `LINE_LOGIN_CHANNEL_ID` belongs to the intended LINE Login channel.
- [ ] `LINE_LOGIN_CHANNEL_SECRET` is provided through a server secret store.
- [ ] No LINE or Supabase secret uses a `NEXT_PUBLIC_` name.
- [ ] `LINE_LOGIN_MODE=line` in production.
- [ ] Local mock mode is disabled and `LINE_MOCK_SIGNING_SECRET` is not used as a real provider credential.
- [ ] Production OAuth cookies are observed with HttpOnly, Secure, SameSite=Lax, Path=/, and the expected Max-Age.
- [ ] Redirect cases are restricted to validated local paths.
- [ ] Repository and deployment logs contain no provider token, callback query, state, nonce, invitation token, cookie header, service-role key, or channel secret.
- [ ] No credential value is committed to the repository.

## Manual smoke test

- [ ] Start LINE Login from the deployed HTTPS origin.
- [ ] Complete a real provider login with a non-production test identity.
- [ ] Confirm successful return to the expected local path.
- [ ] Confirm `GET /api/auth/line/session` returns only the authentication boolean.
- [ ] Confirm same-origin `POST /api/auth/line/logout` succeeds and the session becomes unauthenticated.
- [ ] Confirm provider cancel and invalid/replayed Callback attempts return only the generic login failure.
- [ ] Confirm cross-site logout is rejected.

## Rollback

1. Disable traffic to the affected deployment revision.
2. Restore the previous application revision without changing database schema.
3. Remove or rotate deployment-only LINE credentials if exposure is suspected.
4. Confirm the exact registered callback still points only to an approved deployment.
5. Review redacted application events and LINE request IDs; do not copy token bodies into incident notes.

This checklist is manual guidance only. It performs no deployment, hosted Supabase mutation, LINE Console change, credential creation, or production rollout.
