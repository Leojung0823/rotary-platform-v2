# Rollout Controls and Privacy-safe Product Telemetry

This is the delivery foundation for the member-experience V2 work. It changes no Shell, member home, check-in UI, hosted Supabase project, staging flag, or production flag.

## Authority and mutations

The repository's existing database predicate is the sole Feature Flag administrator model:

```sql
public.current_has_platform_role(array['superadmin', 'platform_admin'])
```

It derives `auth.uid()` in the database, requires an active `app_accounts` row, and requires an unrevoked `platform_roles` assignment. `public.set_platform_feature_flag(...)` rechecks that predicate in its `SECURITY DEFINER` body. It is executable by `authenticated` only because the predicate is authoritative; a normal authenticated browser cannot mutate a flag. Direct `INSERT`, `UPDATE`, and `DELETE` on `public.platform_feature_flags` are revoked from browser roles and RLS is enabled.

There is deliberately no management UI in this PR. Platform administrators can use the protected RPC through an authorized server/operator workflow. Club operators, ordinary members, unauthenticated users, client-provided role claims, Email domains, and UI visibility cannot mutate a Flag. A later PR may add a platform management screen, but it must continue to call this predicate-protected path rather than introduce another authority model.

## Migrations

- `20260806000100_product_rollout_feature_flags.sql` — typed, protected flag source and minimal read RPC.
- `20260806000200_product_rollout_telemetry.sql` — closed telemetry schema, daily-pseudonym rate guard, and browser table lockout.
- `20260806000300_product_rollout_feature_flag_audit.sql` — transactionally coupled append-only audit and protected mutation RPC.
- `20260806000400_product_rollout_retention_cleanup.sql` — bounded retention cleanup and reserved login-security retention sink.

All migrations are forward-only. No runtime schema introspection or database-error probing is used for feature availability.

## Feature evaluation

The only accepted keys are:

- `role_context_v2`
- `role_shells_v2`
- `member_home_v2`
- `checkin_qr_v2`
- `checkin_gps_v2`
- `attendance_ui_v2`
- `announcements_v09`
- `blessing_iou_v1`

The evaluator has this fixed order:

| Order | Condition | Result when not satisfied |
| --- | --- | --- |
| 1 | Corresponding exact-value kill switch is not `true` | disabled |
| 2 | A valid database record exists | disabled |
| 3 | `enabled` is true | disabled |
| 4 | server-only `APP_ENV` is `local`, `staging`, or `production` and appears in `enabled_environments` | disabled |
| 5 | HMAC rollout bucket is below `rollout_percentage` | disabled |

Malformed kill-switch values, invalid records, invalid environment data, database-read errors, absent pepper, absent subject, and HMAC errors all fail closed. `0` enables nobody and `100` enables every otherwise eligible subject. Failure selects the existing legacy path through `selectFeaturePath`; it does not turn a safe legacy page into a 500.

`FORCE_LEGACY_ROLE_SHELLS`, `FORCE_LEGACY_MEMBER_HOME`, `DISABLE_GPS_CHECKIN`, and `DISABLE_BLESSING_IOU` are each read directly from server runtime configuration on every evaluation. They only force the legacy path and can never enable a database-disabled feature. Flag-record reads use React request-scoped memoization only: there is no cross-request TTL, so a kill switch has no cache propagation delay and a flag mutation is visible on the next request.

For partial rollout, the subject is a server-derived internal UUID, never a name, Email, phone number, LINE identifier, display name, token, or other personal value. The exact bucket is:

```text
uint32be(HMAC_SHA256(FEATURE_FLAG_ROLLOUT_PEPPER,
                     internal_subject_uuid + ":" + feature_key)[0:4]) mod 100
```

The HMAC input includes the Feature Key so one feature's cohort is not automatically another's. Pepper values are server-only and are never returned to a browser. Rotating `FEATURE_FLAG_ROLLOUT_PEPPER` intentionally reassigns all partial-rollout buckets; plan that as a rollout event.

## Telemetry schema and privacy

`public.platform_product_telemetry` accepts only these event names and exact, bounded payload keys:

| Event | Exact payload |
| --- | --- |
| `member_context_resolve_success` | `duration_ms` 0–120000, `club_count` 0–1000, `mode_count` 0–3 |
| `member_context_resolve_failure` | `duration_ms` 0–120000, bounded `reason` |
| `member_home_projection_duration` | `duration_ms` 0–120000, `database_round_trips` 0–10 |
| `member_home_projection_failure` | `duration_ms` 0–120000, bounded `reason` |
| `checkin_attempt` | bounded `method` |
| `checkin_success` | bounded `method`, `duration_ms`, bounded `result` |
| `checkin_failure` | bounded `method`, `duration_ms`, bounded `reason` |
| `checkin_pending_confirmation` | bounded `method`, fixed `network_timeout` reason |
| `feature_flag_evaluation_failure` | typed `feature_key`, bounded reason |

Every payload is structurally validated in TypeScript and by a database check function. Unknown event names, unknown keys, arrays, arbitrary JSON, free text, raw errors, and out-of-range values are rejected. The schema has no field that can contain Email, LINE identifiers, QR data, GPS coordinates, exact distance, tokens, headers, IP addresses, user agents, or client-chosen subjects.

The server-only sink obtains the verified login and internal account UUID through the normal server Supabase client. It never accepts account, member, membership, club, or subject data from the caller. It then uses the trusted service-role client only to insert the already validated, non-identifying row. Browser roles have no direct read, insert, update, or delete grant.

Member-context, member-home, and check-in events store only a daily pseudonym:

```text
HMAC_SHA256(TELEMETRY_PSEUDONYM_PEPPER,
            internal_account_uuid + ":" + UTC_date + ":" + event_family)
```

It is deterministic within the UTC day and event family but changes daily. The table stores no mapping back to an account. `feature_flag_evaluation_failure` stores no subject at all. There is no club ID in product telemetry, preventing a small-club subject/time/club activity trail. A database rate guard is keyed by the same daily value, retains no IP, and is cleaned after two days.

Telemetry sink failures are contained: product actions receive `{ recorded: false, reason: 'sink_failure' }`, not an action failure. A process-bounded, once-per-minute `PRODUCT_TELEMETRY_SINK_FAILURE` signal contains no payload or database error. This signal is not telemetry; a failed `feature_flag_evaluation_failure` therefore attempts one telemetry write at most and cannot recurse.

## Retention and cleanup

The database controls these bounded classes:

- `product_checkin_90d`
- `product_performance_90d`
- `login_security_365d`
- `club_mutation_audit_3y`
- `operational_rate_limit_2d`

The login-security table is a locked, reserved future sink with no browser interface or producer in this PR. The three-year audit value is a current product/business policy, not a claimed legal retention obligation. Raw QR credentials and raw GPS coordinates have no storage column and are never retained.

Only `service_role` may call `public.cleanup_platform_retention(as_of, batch_size)`. It accepts a testable `timestamptz` `as_of` (defaults to database `now()` in production), clamps every batch to 1–500, accepts neither table names nor retention days, holds an advisory transaction lock, and returns per-class deletion counts. Its exact boundary is `created_at < as_of - retention_interval`; data exactly at 90 days, 365 days, or three years is retained. Product telemetry, login-security records, feature-flag audit, and rate-limit rows are deleted in explicit separate queries, so telemetry cleanup cannot accidentally delete non-expired audit data.

## Feature-flag audit

`public.append_platform_feature_flag_audit()` runs in the same transaction as every protected flag insert or configuration change. It writes structured before/after Flag configuration, one action row for create, enable/disable, environment changes, and rollout-percentage changes, plus an independent immutable internal actor UUID snapshot. Flag settings are not secrets; the audit never has a Pepper, credential, or token field.

The audit table has RLS, direct browser privileges revoked, explicit revoke of `UPDATE` and `DELETE`, and a database trigger that rejects updates or deletes even for a privileged normal mutation path. The only deletion exception is the constrained three-year service-role cleanup function, which sets a transaction-local maintenance guard; it cannot rewrite audit rows.

## Consistency and verification

`product-rollout-db-contract.test.ts` parses the migration constraints and fails CI if the TypeScript Feature Key union or telemetry event allowlist diverges from the database. The SQL verification fixture exercises RLS/privileges, platform and non-platform mutation paths, actor derivation, append-only audit, telemetry schema rejection, telemetry rate limit, retention boundaries, idempotency, and the advisory-lock implementation.
