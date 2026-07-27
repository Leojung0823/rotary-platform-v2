# Codex Task — LINE Login MVP Readiness

## Agent

- Tool: Codex
- Preferred model: GPT-5.6 Sol; fallback GPT-5.6 Terra
- Reasoning: High or Extra High

## Base and target

- Base: `feat/mvp-line-board-integration`
- Branch: `feat/mvp-line-login-readiness`
- Draft PR target: `feat/mvp-line-board-integration`

## Goal

Harden and verify the existing LINE Login implementation from `feat/v0.3-identity-admin` into a testable MVP without redesigning PR-03 or creating a second identity/session system.

## Required work

1. Audit `/api/auth/line/start` and `/api/auth/line/callback` for state, nonce, replay, redirect, cookie, error and secret-handling behavior.
2. Add a clear logout/session-validation MVP path using the existing Supabase Auth session.
3. Add explicit environment variable names and deployment notes without committing credentials.
4. Keep the local signed LINE mock strictly localhost/test-only and fail closed in production.
5. Add tests for:
   - valid start/callback flow;
   - invalid or replayed state;
   - nonce mismatch;
   - cancelled/failed provider response;
   - unsafe return path rejection;
   - server-only credentials and token redaction;
   - session persistence and logout;
   - production mock rejection.
6. Add an operator checklist for LINE Console callback URL configuration, but do not modify the external console.
7. Preserve the existing `people`／`app_accounts`／`line_identities` model and invitation behavior.

## File ownership

Allowed:

- `src/app/api/auth/line/**`
- `src/lib/line/**`
- LINE-specific tests
- `.env.example` variable names/comments
- LINE MVP documentation

Do not modify:

- Message Board files
- `src/components/app-shell.tsx`
- PR-03 Revision documents
- hosted or production resources

## Quality gates

- `npm run lint`
- `npm run typecheck`
- relevant tests
- `npm run build`
- secret/redaction scan

## Completion report

Report changed files, tests, commands and exit codes, remaining real-provider configuration, and confirmation that no hosted/production system or PR-03 runtime was modified.
