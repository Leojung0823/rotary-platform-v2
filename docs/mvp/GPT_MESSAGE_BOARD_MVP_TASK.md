# GPT Task — Message Board MVP

## Agent

- Tool: General GPT conversation with GitHub read/write access
- Model: GPT-5.6 Thinking
- Mode: implementation with explicit repository writes

## Base and target

- Base: `feat/mvp-line-board-integration`
- Branch: `feat/mvp-message-board`
- Draft PR target: `feat/mvp-line-board-integration`

## Goal

Build a small authenticated message board on top of the existing Supabase Auth and identity model from `feat/v0.3-identity-admin`. Do not modify LINE OAuth implementation and do not depend on unfinished PR-03 runtime contracts.

## MVP behavior

Authenticated users can:

- view newest posts with cursor pagination;
- create a plain-text post;
- edit their own post;
- soft-delete their own post;
- see display name, avatar when available, and timestamps.

Unauthenticated users and cross-user mutation attempts must fail closed.

## Required architecture

1. Add a forward-only message-board migration and verification SQL.
2. Use the authenticated Supabase user to derive the current `app_account`; never accept author identity from browser input.
3. Do not grant broad browser table CRUD. Use controlled server/RPC boundaries and explicit grants.
4. Add generic API responses for list/create/edit/delete without leaking Auth UUID, LINE subject, email, session ID or Invitation semantics.
5. Add content limits, whitespace normalization, empty-content rejection and plain-text rendering.
6. Add cursor pagination with a stable ordering.
7. Add `/board` under the authenticated app and a navigation entry.
8. Add loading, empty, validation, forbidden and generic error states with mobile-friendly Traditional Chinese UI.
9. Add tests for ownership, unauthenticated denial, cross-user denial, pagination, soft deletion, content limits and XSS-safe rendering.

## Minimum data model

`board_posts`:

- `id`
- `author_app_account_id`
- `content`
- `status`
- `created_at`
- `updated_at`
- `deleted_at`

Add indexes and constraints needed for stable pagination and active-post filtering.

## Route contract

- `GET /api/v1/board/posts?cursor=<opaque>&limit=<n>`
- `POST /api/v1/board/posts`
- `PATCH /api/v1/board/posts/{postId}`
- `DELETE /api/v1/board/posts/{postId}`
- UI: `/board`

Exact PR-03 response bytes and Revision 11 headers are out of scope.

## File ownership

Allowed:

- new board migration/RPC/verification files
- `src/app/(authenticated)/board/**`
- board API routes or existing versioned dispatcher additions
- `src/components/message-board/**`
- authenticated navigation entry
- board tests and documentation

Do not modify:

- `src/app/api/auth/line/**`
- `src/lib/line/**`
- LINE provider/callback behavior
- PR-03 Revision documents
- hosted or production resources

## Quality gates

- `npm run lint`
- `npm run typecheck`
- relevant unit/integration tests
- `npm run build`
- local Supabase reset/lint/verification when available
- committed-file secret scan

## Completion report

Report changed files, schema/RPC security boundaries, tests, commands and exit codes, remaining integration work, and confirmation that LINE auth and PR-03 specification files were not modified.
