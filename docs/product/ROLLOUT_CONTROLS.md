# Rollout Controls and Product Telemetry

This document defines the application-layer contract used by the member-experience V2 rollout.

## Feature keys

The canonical keys are:

- `role_context_v2`
- `role_shells_v2`
- `member_home_v2`
- `checkin_qr_v2`
- `checkin_gps_v2`
- `attendance_ui_v2`
- `announcements_v09`

Code must import the typed keys from `src/lib/product/feature-flags.ts`. Do not introduce ad-hoc string keys in pages or components.

## Evaluation order

A flag is enabled only when all of the following are true:

1. The emergency kill switch is absent or exactly `false`.
2. A valid database-backed configuration is available.
3. The configuration is enabled.
4. The current environment is explicitly allowed.
5. The deterministic rollout assignment is inside the configured percentage.

Missing or malformed configuration fails closed. A kill switch may disable a new experience, but an environment variable must never enable a database-disabled feature.

The current application-layer contract accepts a `FeatureFlagRecord`; a later database migration and repository adapter will supply that record without changing page-level consumers.

## Emergency kill switches

- `FORCE_LEGACY_ROLE_SHELLS=true`
- `FORCE_LEGACY_MEMBER_HOME=true`
- `DISABLE_GPS_CHECKIN=true`

Only the exact values `true` and `false` are valid when a variable is present. Invalid values fail closed so a typo cannot unexpectedly enable a new path.

## Rollout assignment

Partial rollout requires an opaque, stable rollout key. Consumers must not pass a name, Email address, LINE subject, session token or other directly identifying value. The evaluator hashes the feature key and opaque rollout key into a stable bucket and does not persist that input.

## Telemetry allowlist

`src/lib/product/telemetry.ts` defines a closed event union. Product code cannot attach arbitrary metadata or free text.

Allowed event families cover:

- member-context resolution success and failure;
- member-home projection duration and failure;
- check-in attempt, success, failure and pending confirmation;
- feature-flag evaluation failure.

Durations and counts are bounded before a sink is called. Sink failures are contained and must not break the member flow.

## Prohibited telemetry data

Do not record:

- QR credentials or hashes;
- latitude, longitude or exact distance;
- member names, Email addresses or LINE subjects;
- activity titles;
- cookies, session tokens or credentials;
- free-text manual check-in reasons;
- raw database or provider errors.

Use the bounded reason enums instead.

## Retention baseline

Until an approved policy replaces these defaults:

- check-in operational telemetry: 90 days;
- performance metrics: 90 days;
- login-security records: 365 days;
- club-management mutation audit: 3 years;
- raw QR credentials: never retained;
- member GPS coordinates: never retained.

The application-layer sink in this change is intentionally provider-neutral. A persistent database or external telemetry sink requires a separate security review, retention enforcement and database verification.

## Rollback verification

Each consuming PR must prove both states:

- flag enabled: the new path is reachable only for an authorized user;
- flag disabled or kill switch active: the legacy path remains usable without a database rollback.

The database schema remains forward-only. Feature rollback must never depend on reversing an applied migration.
