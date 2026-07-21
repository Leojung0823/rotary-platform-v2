# V2 Core Decisions

## Tenant model

- A single database serves multiple Rotary clubs.
- Every club-scoped business record must be isolated by `club_id`.
- A person's identity is shared across clubs; club membership is club-specific.

## Identity model

- `people`: the real person.
- `app_accounts`: login accounts linked to people.
- `club_memberships`: active or historical Rotary club memberships only.
- `club_operator_permissions`: club administration access such as executive secretary.

## Executive secretary

- An executive secretary is not represented by a club membership.
- Each operator uses an individual account; shared passwords are prohibited.
- A club may authorize multiple executive secretaries.
- Operators do not appear in member rosters or attendance denominators.
- A person with any active Rotary club membership cannot hold an active executive-secretary assignment in any club, and vice versa.

## Delivery strategy

- The Lovable application remains in production during V2 development.
- V2 uses a separate staging Supabase project.
- The first vertical slice is club provisioning plus the first operator invitation.
