# Experience Context and Routing

## Decision

`public.resolve_my_experience_context()` is a bounded, caller-derived projection used only by server-side UX and routing. It derives the current account from `auth.uid()`, returns at most 100 member clubs and 100 management-only clubs, and never accepts an account ID, role, mode, or club ID from the browser as an authority input.

`memberClubs` contains active memberships in active clubs. `managedOnlyClubs` contains active, time-valid club-manager operator assignments that are not memberships. President, secretary, and finance role assignments make an active member eligible for management mode, but remain in `memberClubs` rather than duplicating the club. Platform access is separate and does not enumerate every club into a user context.

## Mode and club resolution

Mode precedence is member, then management, then platform. A requested mode is accepted only when it exists in the server projection. The active-club preference is an HttpOnly, same-site cookie; its UUID is treated only as a candidate. Each new projection checks that candidate against the current bounded result and falls back to the first legal club or `null`.

The dashboard's V2 resolver exposes only server-resolved mode and club destinations. Existing deep links are untouched: their route handlers, server actions, RPCs, and RLS remain responsible for independently authorizing their own `club_id`.

## Failure and observability

If `role_context_v2` is disabled or its evaluation fails, `/dashboard` uses the unchanged legacy dashboard. An enabled projection with no effective authority goes to Access denied; an unavailable or invalid projection retains the legacy dashboard with a generic notice. No database error reaches the browser. Context resolution writes only the allowlisted success/failure telemetry payloads from the rollout foundation, including bounded duration, club count, and mode count. It includes no club ID, identity, cookie, token, or raw error.

## Security invariants

- The projection is not an authorization API and has no mutation capability.
- The cookie cannot create cross-club data access; every target route/RPC still verifies the requested club.
- Account suspension, membership suspension, club-role loss, and operator revocation are re-evaluated by the next projection.
- The privileged RPC fixes `search_path`, schema-qualifies references, derives the caller from `auth.uid()`, and has explicit grants.
