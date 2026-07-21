begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.people (
  id uuid primary key default extensions.gen_random_uuid(),
  canonical_name text not null check (btrim(canonical_name) <> ''),
  primary_email text,
  primary_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.people is
  'One row per real person, shared across all Rotary clubs.';

create table public.app_accounts (
  id uuid primary key default extensions.gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  person_id uuid not null unique references public.people(id) on delete restrict,
  login_email text not null check (btrim(login_email) <> ''),
  login_email_normalized text generated always as (lower(btrim(login_email))) stored,
  account_display_name text not null check (btrim(account_display_name) <> ''),
  account_status text not null default 'active'
    check (account_status in ('active', 'suspended', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.app_accounts is
  'Application login accounts. Each real person has at most one account.';

create unique index app_accounts_one_active_login_email
  on public.app_accounts (login_email_normalized)
  where account_status = 'active';

create table public.platform_roles (
  id uuid primary key default extensions.gen_random_uuid(),
  app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  role_key text not null check (role_key in ('platform_admin', 'superadmin')),
  granted_at timestamptz not null default now(),
  granted_by_app_account_id uuid references public.app_accounts(id) on delete restrict,
  revoked_at timestamptz,
  revoked_by_app_account_id uuid references public.app_accounts(id) on delete restrict,
  revoke_reason text,
  created_at timestamptz not null default now(),
  check (revoked_at is null or revoked_at >= granted_at)
);

comment on table public.platform_roles is
  'Platform-wide authority. Club-scoped operators do not belong here.';

create unique index platform_roles_one_active_role
  on public.platform_roles (app_account_id, role_key)
  where revoked_at is null;

create table public.clubs (
  id uuid primary key default extensions.gen_random_uuid(),
  club_code text not null check (btrim(club_code) <> ''),
  club_name text not null check (btrim(club_name) <> ''),
  english_name text,
  timezone_name text not null default 'Asia/Taipei',
  club_status text not null default 'provisioning'
    check (club_status in ('provisioning', 'active', 'suspended', 'archived')),
  created_by_app_account_id uuid references public.app_accounts(id) on delete restrict,
  activated_at timestamptz,
  suspended_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.clubs is
  'Tenant root. Every club-scoped business record must reference a club.';

create unique index clubs_club_code_case_insensitive
  on public.clubs (lower(btrim(club_code)));

create table public.club_memberships (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  person_id uuid not null references public.people(id) on delete restrict,
  membership_number text,
  membership_status text not null default 'active'
    check (membership_status in ('active', 'suspended', 'ended')),
  joined_on date not null default current_date,
  ended_on date,
  created_by_app_account_id uuid references public.app_accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_on is null or ended_on >= joined_on)
);

comment on table public.club_memberships is
  'Rotary club membership only. Executive secretaries never receive membership rows.';

create unique index club_memberships_one_active_per_person_per_club
  on public.club_memberships (club_id, person_id)
  where membership_status = 'active';

create index club_memberships_person_id_idx
  on public.club_memberships (person_id);

create table public.club_operator_permissions (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  operator_role_key text not null default 'executive_secretary'
    check (operator_role_key in ('executive_secretary')),
  permission_level text not null default 'club_manager'
    check (permission_level in ('club_manager', 'read_only')),
  assignment_status text not null default 'active'
    check (assignment_status in ('active', 'revoked', 'expired')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  granted_by_app_account_id uuid references public.app_accounts(id) on delete restrict,
  revoked_at timestamptz,
  revoked_by_app_account_id uuid references public.app_accounts(id) on delete restrict,
  revoke_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  check (revoked_at is null or revoked_at >= starts_at),
  check (assignment_status <> 'revoked' or revoked_at is not null)
);

comment on table public.club_operator_permissions is
  'Independent club administration assignments. A club may have many executive secretaries.';

create unique index club_operator_permissions_one_active_per_account_per_club
  on public.club_operator_permissions (club_id, app_account_id)
  where assignment_status = 'active';

create index club_operator_permissions_app_account_id_idx
  on public.club_operator_permissions (app_account_id);

create table public.club_operator_invites (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  email text not null check (btrim(email) <> ''),
  email_normalized text generated always as (lower(btrim(email))) stored,
  display_name text not null check (btrim(display_name) <> ''),
  operator_role_key text not null default 'executive_secretary'
    check (operator_role_key in ('executive_secretary')),
  permission_level text not null default 'club_manager'
    check (permission_level in ('club_manager', 'read_only')),
  invite_status text not null default 'pending'
    check (invite_status in ('pending', 'sent', 'accepted', 'expired', 'revoked', 'failed')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  sent_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  failure_reason text,
  invited_by_app_account_id uuid references public.app_accounts(id) on delete restrict,
  accepted_app_account_id uuid references public.app_accounts(id) on delete restrict,
  idempotency_key text not null unique check (btrim(idempotency_key) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    invite_status <> 'accepted'
    or (accepted_at is not null and accepted_app_account_id is not null)
  ),
  check (invite_status <> 'revoked' or revoked_at is not null)
);

comment on table public.club_operator_invites is
  'Pending and historical invitations used before an Auth user and app account exist.';

create unique index club_operator_invites_one_open_per_email_per_club
  on public.club_operator_invites (club_id, email_normalized)
  where invite_status in ('pending', 'sent');

create index club_operator_invites_email_normalized_idx
  on public.club_operator_invites (email_normalized);

create table public.audit_logs (
  id bigint generated by default as identity primary key,
  club_id uuid references public.clubs(id) on delete restrict,
  actor_app_account_id uuid references public.app_accounts(id) on delete restrict,
  action_key text not null check (btrim(action_key) <> ''),
  subject_type text not null check (btrim(subject_type) <> ''),
  subject_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_logs is
  'Append-only audit trail for provisioning, membership, and operator actions.';

create index audit_logs_club_created_at_idx
  on public.audit_logs (club_id, created_at desc);

create index audit_logs_actor_created_at_idx
  on public.audit_logs (actor_app_account_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger people_set_updated_at
before update on public.people
for each row execute function public.set_updated_at();

create trigger app_accounts_set_updated_at
before update on public.app_accounts
for each row execute function public.set_updated_at();

create trigger clubs_set_updated_at
before update on public.clubs
for each row execute function public.set_updated_at();

create trigger club_memberships_set_updated_at
before update on public.club_memberships
for each row execute function public.set_updated_at();

create trigger club_operator_permissions_set_updated_at
before update on public.club_operator_permissions
for each row execute function public.set_updated_at();

create trigger club_operator_invites_set_updated_at
before update on public.club_operator_invites
for each row execute function public.set_updated_at();

create or replace function public.prevent_app_account_identity_relink()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.auth_user_id is distinct from new.auth_user_id
     or old.person_id is distinct from new.person_id then
    raise exception using
      errcode = '23514',
      message = 'An app account cannot be relinked to another Auth user or person.';
  end if;

  return new;
end;
$$;

create trigger app_accounts_prevent_identity_relink
before update of auth_user_id, person_id on public.app_accounts
for each row execute function public.prevent_app_account_identity_relink();

create or replace function public.prevent_member_operator_overlap()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.membership_status <> 'active' then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.person_id::text, 0)
  );

  if exists (
    select 1
    from public.club_operator_permissions as operator_permission
    join public.app_accounts as account
      on account.id = operator_permission.app_account_id
    where account.person_id = new.person_id
      and operator_permission.assignment_status = 'active'
  ) then
    raise exception using
      errcode = '23514',
      message = 'A person with an active executive-secretary assignment cannot receive an active Rotary membership.';
  end if;

  return new;
end;
$$;

create trigger club_memberships_prevent_operator_overlap
before insert or update of person_id, membership_status on public.club_memberships
for each row execute function public.prevent_member_operator_overlap();

create or replace function public.prevent_operator_member_overlap()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  target_person_id uuid;
begin
  if new.assignment_status <> 'active' then
    return new;
  end if;

  select account.person_id
    into target_person_id
  from public.app_accounts as account
  where account.id = new.app_account_id;

  if target_person_id is null then
    raise exception using
      errcode = '23503',
      message = 'The operator account must be linked to a person.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_person_id::text, 0)
  );

  if exists (
    select 1
    from public.club_memberships as membership
    where membership.person_id = target_person_id
      and membership.membership_status = 'active'
  ) then
    raise exception using
      errcode = '23514',
      message = 'An active Rotary member cannot receive an executive-secretary assignment.';
  end if;

  return new;
end;
$$;

create trigger club_operator_permissions_prevent_member_overlap
before insert or update of app_account_id, assignment_status
on public.club_operator_permissions
for each row execute function public.prevent_operator_member_overlap();

alter table public.people enable row level security;
alter table public.app_accounts enable row level security;
alter table public.platform_roles enable row level security;
alter table public.clubs enable row level security;
alter table public.club_memberships enable row level security;
alter table public.club_operator_permissions enable row level security;
alter table public.club_operator_invites enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table public.people from anon, authenticated;
revoke all on table public.app_accounts from anon, authenticated;
revoke all on table public.platform_roles from anon, authenticated;
revoke all on table public.clubs from anon, authenticated;
revoke all on table public.club_memberships from anon, authenticated;
revoke all on table public.club_operator_permissions from anon, authenticated;
revoke all on table public.club_operator_invites from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.prevent_app_account_identity_relink() from public, anon, authenticated;
revoke all on function public.prevent_member_operator_overlap() from public, anon, authenticated;
revoke all on function public.prevent_operator_member_overlap() from public, anon, authenticated;

commit;
