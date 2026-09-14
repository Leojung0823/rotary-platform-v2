begin;

-- Dues/collections/reconciliation V1 is deliberately dark until the
-- application enables this rollout key.  The key is added here, rather than
-- changing an already-applied migration, so the feature-key contract remains
-- forward-only.
alter table public.platform_feature_flags
  drop constraint platform_feature_flags_feature_key_check;
alter table public.platform_feature_flags
  add constraint platform_feature_flags_feature_key_check check (feature_key in (
    'role_context_v2', 'role_shells_v2', 'member_home_v2', 'checkin_qr_v2', 'checkin_gps_v2',
    'attendance_ui_v2', 'announcements_v09', 'blessing_iou_v1',
    'blessing_iou_collections_v1', 'blessing_iou_reporting_v1',
    'birthday_wishes_v1', 'birthday_wishes_v2', 'birthday_wishes_collection_v1',
    'message_board_v1', 'archive_handover_v1',
    'line_oa_auto_pairing_v1', 'line_oa_event_push_v1', 'line_oa_onboarding_v1',
    'line_oa_flex_templates_v1', 'club_join_link_v1', 'line_rich_menu_v1',
    'dues_finance_v1'
  ));

alter table public.platform_feature_flag_audit
  drop constraint platform_feature_flag_audit_feature_key_check;
alter table public.platform_feature_flag_audit
  add constraint platform_feature_flag_audit_feature_key_check check (feature_key in (
    'role_context_v2', 'role_shells_v2', 'member_home_v2', 'checkin_qr_v2', 'checkin_gps_v2',
    'attendance_ui_v2', 'announcements_v09', 'blessing_iou_v1',
    'blessing_iou_collections_v1', 'blessing_iou_reporting_v1',
    'birthday_wishes_v1', 'birthday_wishes_v2', 'birthday_wishes_collection_v1',
    'message_board_v1', 'archive_handover_v1',
    'line_oa_auto_pairing_v1', 'line_oa_event_push_v1', 'line_oa_onboarding_v1',
    'line_oa_flex_templates_v1', 'club_join_link_v1', 'line_rich_menu_v1',
    'dues_finance_v1'
  ));

create or replace function public.set_platform_feature_flag(
  p_feature_key text,
  p_enabled boolean,
  p_enabled_environments text[],
  p_rollout_percentage integer
)
returns table (
  feature_key text,
  enabled boolean,
  enabled_environments text[],
  rollout_percentage smallint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not public.current_has_platform_role(array['superadmin', 'platform_admin']) then
    raise exception using errcode = '42501', message = 'platform_feature_flag_admin_required';
  end if;
  if p_feature_key not in (
    'role_context_v2', 'role_shells_v2', 'member_home_v2', 'checkin_qr_v2', 'checkin_gps_v2',
    'attendance_ui_v2', 'announcements_v09', 'blessing_iou_v1',
    'blessing_iou_collections_v1', 'blessing_iou_reporting_v1',
    'birthday_wishes_v1', 'birthday_wishes_v2', 'birthday_wishes_collection_v1',
    'message_board_v1', 'archive_handover_v1',
    'line_oa_auto_pairing_v1', 'line_oa_event_push_v1', 'line_oa_onboarding_v1',
    'line_oa_flex_templates_v1', 'club_join_link_v1', 'line_rich_menu_v1',
    'dues_finance_v1'
  ) or p_enabled is null or p_enabled_environments is null
    or p_rollout_percentage not between 0 and 100
    or not (p_enabled_environments <@ array['local', 'staging', 'production']::text[]) then
    raise exception using errcode = '22023', message = 'invalid_platform_feature_flag_input';
  end if;

  return query
  insert into public.platform_feature_flags as flag (
    feature_key, enabled, enabled_environments, rollout_percentage
  ) values (
    p_feature_key, p_enabled, p_enabled_environments, p_rollout_percentage::smallint
  )
  on conflict on constraint platform_feature_flags_pkey do update
    set enabled = excluded.enabled,
        enabled_environments = excluded.enabled_environments,
        rollout_percentage = excluded.rollout_percentage
  returning flag.feature_key, flag.enabled, flag.enabled_environments, flag.rollout_percentage, flag.updated_at;
end;
$$;

create or replace function public.platform_product_telemetry_payload_is_valid(
  p_event_name text,
  p_payload jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
begin
  case p_event_name
    when 'member_context_resolve_success' then
      return public.jsonb_has_exact_keys(p_payload, array['duration_ms', 'club_count', 'mode_count'])
        and public.jsonb_bounded_integer(p_payload, 'duration_ms', 120000)
        and public.jsonb_bounded_integer(p_payload, 'club_count', 1000)
        and public.jsonb_bounded_integer(p_payload, 'mode_count', 3);
    when 'member_context_resolve_failure', 'member_home_projection_failure' then
      return public.jsonb_has_exact_keys(p_payload, array['duration_ms', 'reason'])
        and public.jsonb_bounded_integer(p_payload, 'duration_ms', 120000)
        and coalesce(p_payload ->> 'reason', '') in (
          'database_unavailable', 'invalid_projection', 'authorization_denied', 'invalid_configuration', 'unexpected'
        );
    when 'member_home_projection_duration' then
      return public.jsonb_has_exact_keys(p_payload, array['duration_ms', 'database_round_trips'])
        and public.jsonb_bounded_integer(p_payload, 'duration_ms', 120000)
        and public.jsonb_bounded_integer(p_payload, 'database_round_trips', 10);
    when 'checkin_attempt' then
      return public.jsonb_has_exact_keys(p_payload, array['method'])
        and coalesce(p_payload ->> 'method', '') in ('qr', 'gps', 'manual');
    when 'checkin_success' then
      return public.jsonb_has_exact_keys(p_payload, array['method', 'duration_ms', 'result'])
        and coalesce(p_payload ->> 'method', '') in ('qr', 'gps', 'manual')
        and public.jsonb_bounded_integer(p_payload, 'duration_ms', 120000)
        and coalesce(p_payload ->> 'result', '') in ('created', 'duplicate', 'current_qr', 'grace_qr');
    when 'checkin_failure' then
      return public.jsonb_has_exact_keys(p_payload, array['method', 'duration_ms', 'reason'])
        and coalesce(p_payload ->> 'method', '') in ('qr', 'gps', 'manual')
        and public.jsonb_bounded_integer(p_payload, 'duration_ms', 120000)
        and coalesce(p_payload ->> 'reason', '') in (
          'expired', 'previous_code_grace_expired', 'session_closed', 'not_started', 'not_eligible', 'duplicate',
          'network_timeout', 'gps_denied', 'gps_unavailable', 'gps_out_of_range', 'gps_low_quality', 'unexpected'
        );
    when 'checkin_pending_confirmation' then
      return public.jsonb_has_exact_keys(p_payload, array['method', 'reason'])
        and coalesce(p_payload ->> 'method', '') in ('qr', 'gps', 'manual')
        and p_payload ->> 'reason' = 'network_timeout';
    when 'feature_flag_evaluation_failure' then
      return public.jsonb_has_exact_keys(p_payload, array['feature_key', 'reason'])
        and coalesce(p_payload ->> 'feature_key', '') in (
          'role_context_v2', 'role_shells_v2', 'member_home_v2', 'checkin_qr_v2', 'checkin_gps_v2',
          'attendance_ui_v2', 'announcements_v09', 'blessing_iou_v1', 'blessing_iou_collections_v1',
          'blessing_iou_reporting_v1', 'birthday_wishes_v1', 'birthday_wishes_v2',
          'birthday_wishes_collection_v1', 'message_board_v1', 'archive_handover_v1',
          'line_oa_auto_pairing_v1', 'line_oa_event_push_v1', 'line_oa_onboarding_v1',
          'line_oa_flex_templates_v1', 'club_join_link_v1', 'line_rich_menu_v1',
          'dues_finance_v1'
        )
        and coalesce(p_payload ->> 'reason', '') in (
          'missing_configuration', 'invalid_configuration', 'evaluation_error'
        );
    else
      return false;
  end case;
end;
$$;

insert into public.permissions (permission_key, description_zh_hant) values
  ('finance.manage', '建立社費應收、登錄收款與財務調整'),
  ('finance.approve', '審核代墊核銷與反向調整')
on conflict (permission_key) do nothing;

insert into public.role_permissions (role_key, permission_key) values
  ('president', 'finance.read'),
  ('president', 'finance.manage'),
  ('president', 'finance.approve'),
  ('secretary', 'finance.manage'),
  ('secretary', 'finance.approve'),
  ('finance', 'finance.manage'),
  ('finance', 'finance.approve')
on conflict (role_key, permission_key) do nothing;

-- Composite keys make the tenant boundary part of every finance foreign key.
-- The id is already a primary key; these unique constraints only allow a
-- child row to prove that its referenced object belongs to the same club.
alter table public.rotary_years
  add constraint rotary_years_id_club_unique unique (id, club_id);

create table public.club_finance_annual_dues_defaults (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  rotary_year_id uuid not null,
  default_amount numeric(12, 2) not null,
  currency_code text not null default 'TWD',
  updated_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, rotary_year_id),
  constraint club_finance_annual_dues_defaults_year_club_fkey
    foreign key (rotary_year_id, club_id)
    references public.rotary_years (id, club_id)
    on delete restrict,
  constraint club_finance_annual_dues_defaults_amount_check check (
    default_amount between 1 and 9999999999
    and default_amount = trunc(default_amount)
  ),
  constraint club_finance_annual_dues_defaults_currency_check check (currency_code = 'TWD')
);

create table public.club_finance_receivables (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  rotary_year_id uuid not null,
  membership_id uuid not null,
  base_amount numeric(12, 2) not null,
  currency_code text not null default 'TWD',
  source_kind text not null default 'manual'
    check (source_kind in ('annual_default', 'manual', 'opening_balance')),
  source_note text not null,
  created_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique (club_id, rotary_year_id, membership_id),
  unique (id, club_id),
  constraint club_finance_receivables_year_club_fkey
    foreign key (rotary_year_id, club_id)
    references public.rotary_years (id, club_id)
    on delete restrict,
  constraint club_finance_receivables_membership_club_fkey
    foreign key (membership_id, club_id)
    references public.club_memberships (id, club_id)
    on delete restrict,
  constraint club_finance_receivables_amount_check check (
    base_amount between 1 and 9999999999
    and base_amount = trunc(base_amount)
  ),
  constraint club_finance_receivables_currency_check check (currency_code = 'TWD'),
  constraint club_finance_receivables_source_note_check check (
    char_length(btrim(source_note)) between 2 and 500
  )
);

-- The idempotency key is nullable for the annual-default generator, but is
-- required by the manual creation RPC.  It is kept on the row so a client
-- retry cannot create a second opening balance.
alter table public.club_finance_receivables
  add constraint club_finance_receivables_idempotency_key_check check (
    idempotency_key is null or char_length(btrim(idempotency_key)) between 1 and 160
  );
create unique index club_finance_receivables_club_idempotency_key_idx
  on public.club_finance_receivables (club_id, idempotency_key)
  where idempotency_key is not null;

create table public.club_finance_receivable_adjustments (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  receivable_id uuid not null,
  amount_delta numeric(12, 2) not null,
  reason text not null,
  idempotency_key text not null,
  adjusted_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint club_finance_receivable_adjustments_receivable_club_fkey
    foreign key (receivable_id, club_id)
    references public.club_finance_receivables (id, club_id)
    on delete restrict,
  constraint club_finance_receivable_adjustments_amount_check check (
    amount_delta between -9999999999 and 9999999999
    and amount_delta <> 0
    and amount_delta = trunc(amount_delta)
  ),
  constraint club_finance_receivable_adjustments_reason_check check (
    char_length(btrim(reason)) between 2 and 500
  ),
  constraint club_finance_receivable_adjustments_idempotency_key_check check (
    char_length(btrim(idempotency_key)) between 1 and 160
  ),
  unique (club_id, idempotency_key)
);

create table public.club_finance_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  amount numeric(12, 2) not null,
  currency_code text not null default 'TWD',
  received_on date not null,
  payment_method text not null
    check (payment_method in ('cash', 'bank_transfer', 'check', 'other')),
  reference_note text,
  idempotency_key text not null,
  recorded_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, club_id),
  constraint club_finance_receipts_amount_check check (
    amount between 1 and 9999999999
    and amount = trunc(amount)
  ),
  constraint club_finance_receipts_currency_check check (currency_code = 'TWD'),
  constraint club_finance_receipts_reference_note_check check (
    reference_note is null or char_length(btrim(reference_note)) <= 500
  ),
  constraint club_finance_receipts_idempotency_key_check check (
    char_length(btrim(idempotency_key)) between 1 and 160
  ),
  unique (club_id, idempotency_key)
);

create table public.club_finance_receipt_allocations (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  receipt_id uuid not null,
  receivable_id uuid not null,
  amount numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  constraint club_finance_receipt_allocations_receipt_club_fkey
    foreign key (receipt_id, club_id)
    references public.club_finance_receipts (id, club_id)
    on delete restrict,
  constraint club_finance_receipt_allocations_receivable_club_fkey
    foreign key (receivable_id, club_id)
    references public.club_finance_receivables (id, club_id)
    on delete restrict,
  constraint club_finance_receipt_allocations_amount_check check (
    amount between 1 and 9999999999
    and amount = trunc(amount)
  ),
  unique (club_id, receipt_id, receivable_id)
);

create table public.club_finance_receipt_reversals (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  receipt_id uuid not null,
  reason text not null,
  reversed_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  reversed_at timestamptz not null default now(),
  constraint club_finance_receipt_reversals_receipt_club_fkey
    foreign key (receipt_id, club_id)
    references public.club_finance_receipts (id, club_id)
    on delete restrict,
  constraint club_finance_receipt_reversals_reason_check check (
    char_length(btrim(reason)) between 2 and 500
  ),
  unique (club_id, receipt_id)
);

create table public.club_finance_advances (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  rotary_year_id uuid not null,
  payer_membership_id uuid not null,
  amount numeric(12, 2) not null,
  description text not null,
  incurred_on date not null,
  advance_status text not null default 'submitted'
    check (advance_status in ('submitted', 'returned', 'closed')),
  submission_count integer not null default 1 check (submission_count >= 1),
  submitted_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  last_submitted_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, club_id),
  constraint club_finance_advances_year_club_fkey
    foreign key (rotary_year_id, club_id)
    references public.rotary_years (id, club_id)
    on delete restrict,
  constraint club_finance_advances_membership_club_fkey
    foreign key (payer_membership_id, club_id)
    references public.club_memberships (id, club_id)
    on delete restrict,
  constraint club_finance_advances_amount_check check (
    amount between 1 and 9999999999
    and amount = trunc(amount)
  ),
  constraint club_finance_advances_description_check check (
    char_length(btrim(description)) between 2 and 1000
  ),
  constraint club_finance_advances_idempotency_key_check check (
    char_length(btrim(idempotency_key)) between 1 and 160
  ),
  unique (club_id, idempotency_key)
);

create table public.club_finance_advance_returns (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  advance_id uuid not null,
  reason text not null,
  returned_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  returned_at timestamptz not null default now(),
  constraint club_finance_advance_returns_advance_club_fkey
    foreign key (advance_id, club_id)
    references public.club_finance_advances (id, club_id)
    on delete restrict,
  constraint club_finance_advance_returns_reason_check check (
    char_length(btrim(reason)) between 2 and 500
  )
);

create table public.club_finance_reconciliations (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  advance_id uuid not null references public.club_finance_advances(id) on delete restrict,
  amount numeric(12, 2) not null,
  approval_note text,
  approved_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  approved_at timestamptz not null default now(),
  idempotency_key text not null,
  unique (id, club_id),
  constraint club_finance_reconciliations_advance_club_fkey
    foreign key (advance_id, club_id)
    references public.club_finance_advances (id, club_id)
    on delete restrict,
  constraint club_finance_reconciliations_amount_check check (
    amount between 1 and 9999999999
    and amount = trunc(amount)
  ),
  constraint club_finance_reconciliations_approval_note_check check (
    approval_note is null or char_length(btrim(approval_note)) <= 500
  ),
  constraint club_finance_reconciliations_idempotency_key_check check (
    char_length(btrim(idempotency_key)) between 1 and 160
  ),
  unique (club_id, idempotency_key)
);

create table public.club_finance_reconciliation_reversals (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  reconciliation_id uuid not null,
  reason text not null,
  reversed_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  reversed_at timestamptz not null default now(),
  constraint club_finance_reconciliation_reversals_reconciliation_club_fkey
    foreign key (reconciliation_id, club_id)
    references public.club_finance_reconciliations (id, club_id)
    on delete restrict,
  constraint club_finance_reconciliation_reversals_reason_check check (
    char_length(btrim(reason)) between 2 and 500
  ),
  unique (club_id, reconciliation_id)
);

create index club_finance_receivables_club_year_idx
  on public.club_finance_receivables (club_id, rotary_year_id, created_at desc, id desc);
create index club_finance_receivables_membership_idx
  on public.club_finance_receivables (membership_id, rotary_year_id);
create index club_finance_receivable_adjustments_receivable_idx
  on public.club_finance_receivable_adjustments (receivable_id, created_at, id);
create index club_finance_receipt_allocations_receivable_idx
  on public.club_finance_receipt_allocations (receivable_id, created_at, id);
create index club_finance_receipts_club_created_idx
  on public.club_finance_receipts (club_id, created_at desc, id desc);
create index club_finance_advances_club_year_idx
  on public.club_finance_advances (club_id, rotary_year_id, created_at desc, id desc);
create index club_finance_reconciliations_advance_idx
  on public.club_finance_reconciliations (advance_id, approved_at, id);
create index club_finance_advance_returns_advance_idx
  on public.club_finance_advance_returns (advance_id, returned_at, id);

comment on table public.club_finance_receivables is
  'One annual dues receivable per club, Rotary year, and membership. Amount changes are append-only adjustments.';
comment on table public.club_finance_receipts is
  'Immutable money received records. Corrections use club_finance_receipt_reversals.';
comment on table public.club_finance_advances is
  'Member or officer advances paid on behalf of a club; never mixed with dues receipts.';
comment on table public.club_finance_reconciliations is
  'Approved advance reconciliation entries. Corrections use reconciliation reversals.';

create or replace function public.prevent_club_finance_immutable_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = '55000', message = 'club_finance_record_immutable';
end;
$$;

create trigger club_finance_receivables_immutable
before update or delete on public.club_finance_receivables
for each row execute function public.prevent_club_finance_immutable_mutation();
create trigger club_finance_receivable_adjustments_immutable
before update or delete on public.club_finance_receivable_adjustments
for each row execute function public.prevent_club_finance_immutable_mutation();
create trigger club_finance_receipts_immutable
before update or delete on public.club_finance_receipts
for each row execute function public.prevent_club_finance_immutable_mutation();
create trigger club_finance_receipt_allocations_immutable
before update or delete on public.club_finance_receipt_allocations
for each row execute function public.prevent_club_finance_immutable_mutation();
create trigger club_finance_receipt_reversals_immutable
before update or delete on public.club_finance_receipt_reversals
for each row execute function public.prevent_club_finance_immutable_mutation();
create trigger club_finance_advance_returns_immutable
before update or delete on public.club_finance_advance_returns
for each row execute function public.prevent_club_finance_immutable_mutation();
create trigger club_finance_reconciliations_immutable
before update or delete on public.club_finance_reconciliations
for each row execute function public.prevent_club_finance_immutable_mutation();
create trigger club_finance_reconciliation_reversals_immutable
before update or delete on public.club_finance_reconciliation_reversals
for each row execute function public.prevent_club_finance_immutable_mutation();

create trigger club_finance_annual_dues_defaults_set_updated_at
before update on public.club_finance_annual_dues_defaults
for each row execute function public.set_updated_at();
create trigger club_finance_advances_set_updated_at
before update on public.club_finance_advances
for each row execute function public.set_updated_at();

alter table public.club_finance_annual_dues_defaults enable row level security;
alter table public.club_finance_receivables enable row level security;
alter table public.club_finance_receivable_adjustments enable row level security;
alter table public.club_finance_receipts enable row level security;
alter table public.club_finance_receipt_allocations enable row level security;
alter table public.club_finance_receipt_reversals enable row level security;
alter table public.club_finance_advances enable row level security;
alter table public.club_finance_advance_returns enable row level security;
alter table public.club_finance_reconciliations enable row level security;
alter table public.club_finance_reconciliation_reversals enable row level security;

revoke all on table public.club_finance_annual_dues_defaults,
  public.club_finance_receivables,
  public.club_finance_receivable_adjustments,
  public.club_finance_receipts,
  public.club_finance_receipt_allocations,
  public.club_finance_receipt_reversals,
  public.club_finance_advances,
  public.club_finance_advance_returns,
  public.club_finance_reconciliations,
  public.club_finance_reconciliation_reversals
from public, anon, authenticated;

grant select, insert, update on table public.club_finance_annual_dues_defaults,
  public.club_finance_receivables,
  public.club_finance_receivable_adjustments,
  public.club_finance_receipts,
  public.club_finance_receipt_allocations,
  public.club_finance_receipt_reversals,
  public.club_finance_advances,
  public.club_finance_advance_returns,
  public.club_finance_reconciliations,
  public.club_finance_reconciliation_reversals to service_role;

-- This helper intentionally does not call current_has_club_permission(),
-- because that older helper grants platform-wide authority as a convenience.
-- Financial data needs a real club role or an active club-manager assignment.
create or replace function public.current_has_dues_finance_permission(
  p_club_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.app_accounts as account
    join public.club_memberships as membership
      on membership.person_id = account.person_id
     and membership.club_id = p_club_id
     and membership.membership_status = 'active'
     and (membership.joined_on is null or membership.joined_on <= current_date)
     and (membership.ended_on is null or membership.ended_on >= current_date)
    join public.clubs as club
      on club.id = membership.club_id
     and club.club_status = 'active'
    join public.club_role_assignments as assignment
      on assignment.app_account_id = account.id
     and assignment.club_id = membership.club_id
     and assignment.assignment_status = 'active'
    join public.role_permissions as role_permission
      on role_permission.role_key = assignment.role_key
     and role_permission.permission_key = p_permission_key
    where account.auth_user_id = auth.uid()
      and account.account_status = 'active'
  ) or exists (
    select 1
    from public.app_accounts as account
    join public.club_operator_permissions as operator_permission
      on operator_permission.app_account_id = account.id
     and operator_permission.club_id = p_club_id
     and operator_permission.assignment_status = 'active'
     and operator_permission.permission_level = 'club_manager'
     and operator_permission.starts_at <= now()
     and (operator_permission.ends_at is null or operator_permission.ends_at > now())
    join public.clubs as club
      on club.id = operator_permission.club_id
     and club.club_status = 'active'
    join public.role_permissions as role_permission
      on role_permission.role_key = 'secretary'
     and role_permission.permission_key = p_permission_key
    where account.auth_user_id = auth.uid()
      and account.account_status = 'active'
  )
$$;

create or replace function public.current_has_active_dues_membership(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.app_accounts as account
    join public.club_memberships as membership
      on membership.person_id = account.person_id
     and membership.club_id = p_club_id
     and membership.membership_status = 'active'
     and (membership.joined_on is null or membership.joined_on <= current_date)
     and (membership.ended_on is null or membership.ended_on >= current_date)
    join public.clubs as club
      on club.id = membership.club_id
     and club.club_status = 'active'
    where account.auth_user_id = auth.uid()
      and account.account_status = 'active'
  )
$$;

create or replace function public.project_dues_receivable(p_receivable_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select jsonb_build_object(
    'receivable_id', receivable.id,
    'club_id', receivable.club_id,
    'rotary_year_id', receivable.rotary_year_id,
    'membership_id', receivable.membership_id,
    'member_display_name', person.canonical_name,
    'base_amount', receivable.base_amount,
    'adjustment_amount', coalesce((
      select sum(adjustment.amount_delta)
      from public.club_finance_receivable_adjustments as adjustment
      where adjustment.receivable_id = receivable.id
    ), 0),
    'receivable_amount', receivable.base_amount + coalesce((
      select sum(adjustment.amount_delta)
      from public.club_finance_receivable_adjustments as adjustment
      where adjustment.receivable_id = receivable.id
    ), 0),
    'received_amount', coalesce((
      select sum(allocation.amount)
      from public.club_finance_receipt_allocations as allocation
      join public.club_finance_receipts as receipt on receipt.id = allocation.receipt_id
      where allocation.receivable_id = receivable.id
        and not exists (
          select 1 from public.club_finance_receipt_reversals as reversal
          where reversal.receipt_id = receipt.id
        )
    ), 0),
    'outstanding_amount', (
      receivable.base_amount + coalesce((
        select sum(adjustment.amount_delta)
        from public.club_finance_receivable_adjustments as adjustment
        where adjustment.receivable_id = receivable.id
      ), 0)
    ) - coalesce((
      select sum(allocation.amount)
      from public.club_finance_receipt_allocations as allocation
      join public.club_finance_receipts as receipt on receipt.id = allocation.receipt_id
      where allocation.receivable_id = receivable.id
        and not exists (
          select 1 from public.club_finance_receipt_reversals as reversal
          where reversal.receipt_id = receipt.id
        )
    ), 0),
    'status', case
      when coalesce((
        select sum(allocation.amount)
        from public.club_finance_receipt_allocations as allocation
        join public.club_finance_receipts as receipt on receipt.id = allocation.receipt_id
        where allocation.receivable_id = receivable.id
          and not exists (
            select 1 from public.club_finance_receipt_reversals as reversal
            where reversal.receipt_id = receipt.id
          )
      ), 0) = 0 then 'unpaid'
      when coalesce((
        select sum(allocation.amount)
        from public.club_finance_receipt_allocations as allocation
        join public.club_finance_receipts as receipt on receipt.id = allocation.receipt_id
        where allocation.receivable_id = receivable.id
          and not exists (
            select 1 from public.club_finance_receipt_reversals as reversal
            where reversal.receipt_id = receipt.id
          )
      ), 0) < receivable.base_amount + coalesce((
        select sum(adjustment.amount_delta)
        from public.club_finance_receivable_adjustments as adjustment
        where adjustment.receivable_id = receivable.id
      ), 0) then 'partial'
      else 'paid'
    end,
    'source_kind', receivable.source_kind,
    'source_note', receivable.source_note,
    'created_at', receivable.created_at
  )
  from public.club_finance_receivables as receivable
  join public.club_memberships as membership on membership.id = receivable.membership_id
  join public.people as person on person.id = membership.person_id
  where receivable.id = p_receivable_id
$$;

create or replace function public.project_dues_advance(p_advance_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select jsonb_build_object(
    'advance_id', advance.id,
    'club_id', advance.club_id,
    'rotary_year_id', advance.rotary_year_id,
    'payer_membership_id', advance.payer_membership_id,
    'payer_display_name', person.canonical_name,
    'amount', advance.amount,
    'reconciled_amount', coalesce((
      select sum(reconciliation.amount)
      from public.club_finance_reconciliations as reconciliation
      where reconciliation.advance_id = advance.id
        and not exists (
          select 1 from public.club_finance_reconciliation_reversals as reversal
          where reversal.reconciliation_id = reconciliation.id
        )
    ), 0),
    'outstanding_amount', advance.amount - coalesce((
      select sum(reconciliation.amount)
      from public.club_finance_reconciliations as reconciliation
      where reconciliation.advance_id = advance.id
        and not exists (
          select 1 from public.club_finance_reconciliation_reversals as reversal
          where reversal.reconciliation_id = reconciliation.id
        )
    ), 0),
    'advance_status', advance.advance_status,
    'submission_count', advance.submission_count,
    'description', advance.description,
    'incurred_on', advance.incurred_on,
    'created_at', advance.created_at,
    'updated_at', advance.updated_at
  )
  from public.club_finance_advances as advance
  join public.club_memberships as membership on membership.id = advance.payer_membership_id
  join public.people as person on person.id = membership.person_id
  where advance.id = p_advance_id
$$;

create or replace function public.get_club_dues_finance_ledger(
  p_club_id uuid,
  p_rotary_year_id uuid,
  p_limit integer default 500
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  year_record public.rotary_years;
  result jsonb;
begin
  if not public.current_has_dues_finance_permission(p_club_id, 'finance.read') then
    raise exception using errcode = '42501', message = 'dues_finance_read_required';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception using errcode = '22023', message = 'invalid_dues_finance_limit';
  end if;

  select year_item.*
    into year_record
  from public.rotary_years as year_item
  where year_item.id = p_rotary_year_id
    and year_item.club_id = p_club_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'dues_rotary_year_not_found';
  end if;

  select jsonb_build_object(
    'club_id', p_club_id,
    'rotary_year_id', year_record.id,
    'rotary_year_start', year_record.start_year,
    'rotary_year_label', format('%s-%s', year_record.start_year, right((year_record.start_year + 1)::text, 2)),
    'summary', jsonb_build_object(
      'receivable_amount', coalesce((
        select sum(receivable.base_amount + coalesce((
          select sum(adjustment.amount_delta)
          from public.club_finance_receivable_adjustments as adjustment
          where adjustment.receivable_id = receivable.id
        ), 0))
        from public.club_finance_receivables as receivable
        where receivable.club_id = p_club_id
          and receivable.rotary_year_id = p_rotary_year_id
      ), 0),
      'received_amount', coalesce((
        select sum(allocation.amount)
        from public.club_finance_receipt_allocations as allocation
        join public.club_finance_receipts as receipt
          on receipt.id = allocation.receipt_id
         and receipt.club_id = p_club_id
        join public.club_finance_receivables as receivable
          on receivable.id = allocation.receivable_id
         and receivable.club_id = p_club_id
        where allocation.club_id = p_club_id
          and receivable.rotary_year_id = p_rotary_year_id
          and not exists (
            select 1 from public.club_finance_receipt_reversals as reversal
            where reversal.receipt_id = receipt.id
              and reversal.club_id = p_club_id
          )
      ), 0),
      'outstanding_amount', coalesce((
        select sum(receivable.base_amount + coalesce((
          select sum(adjustment.amount_delta)
          from public.club_finance_receivable_adjustments as adjustment
          where adjustment.receivable_id = receivable.id
        ), 0))
        from public.club_finance_receivables as receivable
        where receivable.club_id = p_club_id
          and receivable.rotary_year_id = p_rotary_year_id
      ), 0) - coalesce((
        select sum(allocation.amount)
        from public.club_finance_receipt_allocations as allocation
        join public.club_finance_receipts as receipt
          on receipt.id = allocation.receipt_id
         and receipt.club_id = p_club_id
        join public.club_finance_receivables as receivable
          on receivable.id = allocation.receivable_id
         and receivable.club_id = p_club_id
        where allocation.club_id = p_club_id
          and receivable.rotary_year_id = p_rotary_year_id
          and not exists (
            select 1 from public.club_finance_receipt_reversals as reversal
            where reversal.receipt_id = receipt.id
              and reversal.club_id = p_club_id
          )
      ), 0),
      'advance_amount', coalesce((
        select sum(advance.amount)
        from public.club_finance_advances as advance
        where advance.club_id = p_club_id
          and advance.rotary_year_id = p_rotary_year_id
      ), 0),
      'reconciled_amount', coalesce((
        select sum(reconciliation.amount)
        from public.club_finance_reconciliations as reconciliation
        join public.club_finance_advances as advance
          on advance.id = reconciliation.advance_id
         and advance.club_id = p_club_id
        where reconciliation.club_id = p_club_id
          and advance.rotary_year_id = p_rotary_year_id
          and not exists (
            select 1 from public.club_finance_reconciliation_reversals as reversal
            where reversal.reconciliation_id = reconciliation.id
              and reversal.club_id = p_club_id
          )
      ), 0),
      'advance_outstanding_amount', coalesce((
        select sum(advance.amount)
        from public.club_finance_advances as advance
        where advance.club_id = p_club_id
          and advance.rotary_year_id = p_rotary_year_id
      ), 0) - coalesce((
        select sum(reconciliation.amount)
        from public.club_finance_reconciliations as reconciliation
        join public.club_finance_advances as advance
          on advance.id = reconciliation.advance_id
         and advance.club_id = p_club_id
        where reconciliation.club_id = p_club_id
          and advance.rotary_year_id = p_rotary_year_id
          and not exists (
            select 1 from public.club_finance_reconciliation_reversals as reversal
            where reversal.reconciliation_id = reconciliation.id
              and reversal.club_id = p_club_id
          )
      ), 0)
    ),
    'receivables', coalesce((
      select jsonb_agg(public.project_dues_receivable(page.id)
        order by page.canonical_name, page.id)
      from (
        select receivable.id, person.canonical_name
        from public.club_finance_receivables as receivable
        join public.club_memberships as membership
          on membership.id = receivable.membership_id
         and membership.club_id = p_club_id
        join public.people as person on person.id = membership.person_id
        where receivable.club_id = p_club_id
          and receivable.rotary_year_id = p_rotary_year_id
        order by person.canonical_name, receivable.id
        limit p_limit
      ) as page
    ), '[]'::jsonb),
    'receipts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'receipt_id', receipt.id,
        'amount', receipt.amount,
        'currency_code', receipt.currency_code,
        'received_on', receipt.received_on,
        'payment_method', receipt.payment_method,
        'reference_note', receipt.reference_note,
        'status', case when exists (
          select 1 from public.club_finance_receipt_reversals as reversal
          where reversal.receipt_id = receipt.id and reversal.club_id = p_club_id
        ) then 'reversed' else 'posted' end,
        'recorded_by_app_account_id', receipt.recorded_by_app_account_id,
        'created_at', receipt.created_at,
        'allocations', coalesce((
          select jsonb_agg(jsonb_build_object(
            'receivable_id', allocation.receivable_id,
            'membership_id', receivable.membership_id,
            'member_display_name', person.canonical_name,
            'amount', allocation.amount
          ) order by person.canonical_name, allocation.id)
          from public.club_finance_receipt_allocations as allocation
          join public.club_finance_receivables as receivable
            on receivable.id = allocation.receivable_id
           and receivable.club_id = p_club_id
          join public.club_memberships as membership
            on membership.id = receivable.membership_id
           and membership.club_id = p_club_id
          join public.people as person on person.id = membership.person_id
          where allocation.receipt_id = receipt.id
            and allocation.club_id = p_club_id
            and receivable.rotary_year_id = p_rotary_year_id
        ), '[]'::jsonb)
      ) order by receipt.received_on desc, receipt.id desc)
      from (
        select receipt.*
        from public.club_finance_receipts as receipt
        where receipt.club_id = p_club_id
          and exists (
            select 1
            from public.club_finance_receipt_allocations as allocation
            join public.club_finance_receivables as receivable
              on receivable.id = allocation.receivable_id
             and receivable.club_id = p_club_id
            where allocation.receipt_id = receipt.id
              and allocation.club_id = p_club_id
              and receivable.rotary_year_id = p_rotary_year_id
          )
        order by receipt.received_on desc, receipt.id desc
        limit p_limit
      ) as receipt
    ), '[]'::jsonb),
    'advances', coalesce((
      select jsonb_agg(public.project_dues_advance(page.id)
        order by page.created_at desc, page.id desc)
      from (
        select advance.id, advance.created_at
        from public.club_finance_advances as advance
        where advance.club_id = p_club_id
          and advance.rotary_year_id = p_rotary_year_id
        order by advance.created_at desc, advance.id desc
        limit p_limit
      ) as page
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

create or replace function public.get_my_dues_finance_ledger(
  p_club_id uuid,
  p_rotary_year_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_person_id uuid;
  selected_year_id uuid;
  selected_year_start integer;
  current_year_start integer;
  result jsonb;
begin
  if actor_id is null or not public.current_has_active_dues_membership(p_club_id) then
    raise exception using errcode = '42501', message = 'active_dues_membership_required';
  end if;

  select account.person_id into actor_person_id
  from public.app_accounts as account
  where account.id = actor_id;

  if p_rotary_year_id is null then
    select extract(year from local_today)::integer
      - case when extract(month from local_today) < 7 then 1 else 0 end
      into current_year_start
    from (
      select (now() at time zone club.timezone_name)::date as local_today
      from public.clubs as club
      where club.id = p_club_id
        and club.club_status = 'active'
    ) as club_date;
    select year_item.id, year_item.start_year
      into selected_year_id, selected_year_start
    from public.rotary_years as year_item
    where year_item.club_id = p_club_id
      and year_item.start_year = current_year_start
    order by year_item.id
    limit 1;
  else
    select year_item.id, year_item.start_year
      into selected_year_id, selected_year_start
    from public.rotary_years as year_item
    where year_item.id = p_rotary_year_id
      and year_item.club_id = p_club_id;
  end if;
  if selected_year_id is null then
    raise exception using errcode = 'P0002', message = 'dues_rotary_year_not_found';
  end if;

  select jsonb_build_object(
    'club_id', p_club_id,
    'rotary_year_id', selected_year_id,
    'rotary_year_start', selected_year_start,
    'receivables', coalesce((
      select jsonb_agg(public.project_dues_receivable(receivable.id)
        order by receivable.id)
      from public.club_finance_receivables as receivable
      join public.club_memberships as membership
        on membership.id = receivable.membership_id
       and membership.club_id = p_club_id
       and membership.person_id = actor_person_id
      where receivable.club_id = p_club_id
        and receivable.rotary_year_id = selected_year_id
    ), '[]'::jsonb),
    'receipts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'receipt_id', receipt.id,
        'amount', receipt.amount,
        'currency_code', receipt.currency_code,
        'received_on', receipt.received_on,
        'payment_method', receipt.payment_method,
        'reference_note', receipt.reference_note,
        'status', case when exists (
          select 1 from public.club_finance_receipt_reversals as reversal
          where reversal.receipt_id = receipt.id and reversal.club_id = p_club_id
        ) then 'reversed' else 'posted' end,
        'created_at', receipt.created_at,
        'allocations', coalesce((
          select jsonb_agg(jsonb_build_object(
            'receivable_id', allocation.receivable_id,
            'amount', allocation.amount
          ) order by allocation.id)
          from public.club_finance_receipt_allocations as allocation
          join public.club_finance_receivables as receivable
            on receivable.id = allocation.receivable_id
           and receivable.club_id = p_club_id
           and receivable.rotary_year_id = selected_year_id
          join public.club_memberships as membership
            on membership.id = receivable.membership_id
           and membership.club_id = p_club_id
           and membership.person_id = actor_person_id
          where allocation.receipt_id = receipt.id
            and allocation.club_id = p_club_id
        ), '[]'::jsonb)
      ) order by receipt.received_on desc, receipt.id desc)
      from public.club_finance_receipts as receipt
      where receipt.club_id = p_club_id
        and exists (
          select 1
          from public.club_finance_receipt_allocations as allocation
          join public.club_finance_receivables as receivable
            on receivable.id = allocation.receivable_id
           and receivable.club_id = p_club_id
           and receivable.rotary_year_id = selected_year_id
          join public.club_memberships as membership
            on membership.id = receivable.membership_id
           and membership.club_id = p_club_id
           and membership.person_id = actor_person_id
          where allocation.receipt_id = receipt.id
            and allocation.club_id = p_club_id
        )
    ), '[]'::jsonb),
    'advances', coalesce((
      select jsonb_agg(public.project_dues_advance(advance.id)
        order by advance.created_at desc, advance.id desc)
      from public.club_finance_advances as advance
      join public.club_memberships as membership
        on membership.id = advance.payer_membership_id
       and membership.club_id = p_club_id
       and membership.person_id = actor_person_id
      where advance.club_id = p_club_id
        and advance.rotary_year_id = selected_year_id
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

create or replace function public.set_club_dues_annual_default(
  p_club_id uuid,
  p_rotary_year_id uuid,
  p_default_amount numeric,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  year_exists boolean;
  previous_amount numeric;
  updated_default public.club_finance_annual_dues_defaults;
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if actor_id is null
     or not public.current_has_dues_finance_permission(p_club_id, 'finance.manage') then
    raise exception using errcode = '42501', message = 'dues_finance_manage_required';
  end if;
  if p_default_amount is null
     or p_default_amount < 1
     or p_default_amount > 9999999999
     or p_default_amount <> trunc(p_default_amount) then
    raise exception using errcode = '22023', message = 'invalid_dues_default_amount';
  end if;
  if normalized_reason is not null and char_length(normalized_reason) > 500 then
    raise exception using errcode = '22023', message = 'invalid_dues_default_reason';
  end if;

  select exists (
    select 1 from public.rotary_years as year_item
    where year_item.id = p_rotary_year_id and year_item.club_id = p_club_id
  ) into year_exists;
  if not year_exists then
    raise exception using errcode = 'P0002', message = 'dues_rotary_year_not_found';
  end if;

  select default_item.default_amount into previous_amount
  from public.club_finance_annual_dues_defaults as default_item
  where default_item.club_id = p_club_id
    and default_item.rotary_year_id = p_rotary_year_id
  for update;

  insert into public.club_finance_annual_dues_defaults (
    club_id, rotary_year_id, default_amount, updated_by_app_account_id
  ) values (
    p_club_id, p_rotary_year_id, p_default_amount, actor_id
  )
  on conflict (club_id, rotary_year_id) do update
    set default_amount = excluded.default_amount,
        updated_by_app_account_id = excluded.updated_by_app_account_id
  returning * into updated_default;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'dues.annual_default_set', 'dues_annual_default', updated_default.id,
    jsonb_build_object(
      'rotary_year_id', p_rotary_year_id,
      'before_amount', previous_amount,
      'after_amount', updated_default.default_amount,
      'reason', normalized_reason
    )
  );

  return jsonb_build_object(
    'default_id', updated_default.id,
    'club_id', updated_default.club_id,
    'rotary_year_id', updated_default.rotary_year_id,
    'default_amount', updated_default.default_amount,
    'currency_code', updated_default.currency_code,
    'updated_at', updated_default.updated_at
  );
end;
$$;

create or replace function public.generate_club_dues_receivables(
  p_club_id uuid,
  p_rotary_year_id uuid,
  p_source_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  annual_default public.club_finance_annual_dues_defaults;
  eligible_count integer;
  created_count integer;
  normalized_note text := nullif(btrim(coalesce(p_source_note, '')), '');
begin
  if actor_id is null
     or not public.current_has_dues_finance_permission(p_club_id, 'finance.manage') then
    raise exception using errcode = '42501', message = 'dues_finance_manage_required';
  end if;
  if normalized_note is not null and char_length(normalized_note) > 500 then
    raise exception using errcode = '22023', message = 'invalid_dues_source_note';
  end if;

  select default_row.* into annual_default
  from public.club_finance_annual_dues_defaults as default_row
  where default_row.club_id = p_club_id
    and default_row.rotary_year_id = p_rotary_year_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'dues_annual_default_not_found';
  end if;

  select count(*)::integer into eligible_count
  from public.club_memberships as membership
  where membership.club_id = p_club_id
    and membership.membership_status = 'active';

  insert into public.club_finance_receivables (
    club_id, rotary_year_id, membership_id, base_amount, source_kind,
    source_note, created_by_app_account_id
  )
  select
    p_club_id,
    p_rotary_year_id,
    membership.id,
    annual_default.default_amount,
    'annual_default',
    coalesce(normalized_note, '由本年度預設金額建立'),
    actor_id
  from public.club_memberships as membership
  where membership.club_id = p_club_id
    and membership.membership_status = 'active'
  on conflict (club_id, rotary_year_id, membership_id) do nothing;
  get diagnostics created_count = row_count;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'dues.receivables_generated', 'rotary_year', p_rotary_year_id,
    jsonb_build_object(
      'default_amount', annual_default.default_amount,
      'eligible_count', eligible_count,
      'created_count', created_count,
      'skipped_count', eligible_count - created_count
    )
  );

  return jsonb_build_object(
    'club_id', p_club_id,
    'rotary_year_id', p_rotary_year_id,
    'created_count', created_count,
    'skipped_count', eligible_count - created_count,
    'default_amount', annual_default.default_amount
  );
end;
$$;

create or replace function public.create_dues_receivable(
  p_club_id uuid,
  p_rotary_year_id uuid,
  p_membership_id uuid,
  p_amount numeric,
  p_source_note text,
  p_source_kind text default 'manual',
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  existing_item public.club_finance_receivables;
  created_item public.club_finance_receivables;
  normalized_note text := nullif(btrim(coalesce(p_source_note, '')), '');
  normalized_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
begin
  if actor_id is null
     or not public.current_has_dues_finance_permission(p_club_id, 'finance.manage') then
    raise exception using errcode = '42501', message = 'dues_finance_manage_required';
  end if;
  if p_amount is null
     or p_amount < 1
     or p_amount > 9999999999
     or p_amount <> trunc(p_amount)
     or normalized_note is null
     or char_length(normalized_note) < 2
     or char_length(normalized_note) > 500
     or normalized_key is null
     or char_length(normalized_key) > 160
     or p_source_kind is null
     or p_source_kind not in ('manual', 'opening_balance') then
    raise exception using errcode = '22023', message = 'invalid_dues_receivable';
  end if;
  if not exists (
    select 1 from public.rotary_years as year_item
    where year_item.id = p_rotary_year_id and year_item.club_id = p_club_id
  ) or not exists (
    select 1 from public.club_memberships as membership
    where membership.id = p_membership_id
      and membership.club_id = p_club_id
      and membership.membership_status in ('active', 'suspended')
  ) then
    raise exception using errcode = 'P0002', message = 'dues_member_or_year_not_found';
  end if;

  select receivable.* into existing_item
  from public.club_finance_receivables as receivable
  where receivable.club_id = p_club_id
    and receivable.idempotency_key = normalized_key;
  if found then
    return public.project_dues_receivable(existing_item.id)
      || jsonb_build_object('idempotent_replay', true);
  end if;

  insert into public.club_finance_receivables (
    club_id, rotary_year_id, membership_id, base_amount, source_kind,
    source_note, created_by_app_account_id, idempotency_key
  ) values (
    p_club_id, p_rotary_year_id, p_membership_id, p_amount, p_source_kind,
    normalized_note, actor_id, normalized_key
  ) returning * into created_item;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'dues.receivable_created', 'dues_receivable', created_item.id,
    jsonb_build_object(
      'rotary_year_id', p_rotary_year_id,
      'membership_id', p_membership_id,
      'amount', p_amount,
      'source_kind', p_source_kind
    )
  );

  return public.project_dues_receivable(created_item.id)
    || jsonb_build_object('idempotent_replay', false);
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'dues_receivable_already_exists';
end;
$$;

create or replace function public.adjust_dues_receivable(
  p_club_id uuid,
  p_receivable_id uuid,
  p_amount_delta numeric,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_finance_receivables;
  existing_adjustment public.club_finance_receivable_adjustments;
  adjustment_item public.club_finance_receivable_adjustments;
  current_amount numeric;
  received_amount numeric;
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  normalized_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
begin
  if actor_id is null
     or not public.current_has_dues_finance_permission(p_club_id, 'finance.manage') then
    raise exception using errcode = '42501', message = 'dues_finance_manage_required';
  end if;
  if p_amount_delta is null
     or p_amount_delta = 0
     or p_amount_delta < -9999999999
     or p_amount_delta > 9999999999
     or p_amount_delta <> trunc(p_amount_delta)
     or normalized_reason is null
     or char_length(normalized_reason) < 2
     or char_length(normalized_reason) > 500
     or normalized_key is null
     or char_length(normalized_key) > 160 then
    raise exception using errcode = '22023', message = 'invalid_dues_receivable_adjustment';
  end if;

  select adjustment.* into existing_adjustment
  from public.club_finance_receivable_adjustments as adjustment
  where adjustment.club_id = p_club_id
    and adjustment.idempotency_key = normalized_key;
  if found then
    return public.project_dues_receivable(existing_adjustment.receivable_id)
      || jsonb_build_object('idempotent_replay', true);
  end if;

  select receivable.* into target
  from public.club_finance_receivables as receivable
  where receivable.id = p_receivable_id
    and receivable.club_id = p_club_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'dues_receivable_not_found';
  end if;

  select target.base_amount + coalesce(sum(adjustment.amount_delta), 0)
    into current_amount
  from public.club_finance_receivable_adjustments as adjustment
  where adjustment.receivable_id = target.id;
  select coalesce(sum(allocation.amount), 0)
    into received_amount
  from public.club_finance_receipt_allocations as allocation
  join public.club_finance_receipts as receipt on receipt.id = allocation.receipt_id
  where allocation.receivable_id = target.id
    and not exists (
      select 1 from public.club_finance_receipt_reversals as reversal
      where reversal.receipt_id = receipt.id
    );
  if current_amount + p_amount_delta < received_amount
     or current_amount + p_amount_delta < 1
     or current_amount + p_amount_delta > 9999999999 then
    raise exception using errcode = '22023', message = 'dues_adjustment_below_received';
  end if;

  insert into public.club_finance_receivable_adjustments (
    club_id, receivable_id, amount_delta, reason, idempotency_key,
    adjusted_by_app_account_id
  ) values (
    p_club_id, target.id, p_amount_delta, normalized_reason, normalized_key, actor_id
  ) returning * into adjustment_item;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'dues.receivable_adjusted', 'dues_receivable', target.id,
    jsonb_build_object(
      'adjustment_id', adjustment_item.id,
      'amount_delta', p_amount_delta,
      'reason_recorded', true,
      'before_amount', current_amount,
      'after_amount', current_amount + p_amount_delta
    )
  );

  return public.project_dues_receivable(target.id)
    || jsonb_build_object('idempotent_replay', false);
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'dues_adjustment_already_exists';
end;
$$;

create or replace function public.record_dues_receipt(
  p_club_id uuid,
  p_received_on date,
  p_payment_method text,
  p_reference_note text,
  p_items jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  existing_receipt public.club_finance_receipts;
  created_receipt public.club_finance_receipts;
  target public.club_finance_receivables;
  item jsonb;
  item_receivable_id uuid;
  item_amount numeric;
  receipt_year_id uuid;
  total_amount numeric := 0;
  current_amount numeric;
  received_amount numeric;
  normalized_note text := nullif(btrim(coalesce(p_reference_note, '')), '');
  normalized_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  seen_receivable_ids uuid[] := '{}'::uuid[];
begin
  if actor_id is null
     or not public.current_has_dues_finance_permission(p_club_id, 'finance.manage') then
    raise exception using errcode = '42501', message = 'dues_finance_manage_required';
  end if;
  if p_received_on is null
     or p_payment_method is null
     or p_payment_method not in ('cash', 'bank_transfer', 'check', 'other')
     or normalized_key is null
     or char_length(normalized_key) > 160
     or normalized_note is not null and char_length(normalized_note) > 500
     or p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 100 then
    raise exception using errcode = '22023', message = 'invalid_dues_receipt';
  end if;

  select receipt.* into existing_receipt
  from public.club_finance_receipts as receipt
  where receipt.club_id = p_club_id
    and receipt.idempotency_key = normalized_key;
  if found then
    select receivable.rotary_year_id into receipt_year_id
    from public.club_finance_receipt_allocations as allocation
    join public.club_finance_receivables as receivable
      on receivable.id = allocation.receivable_id
     and receivable.club_id = p_club_id
    where allocation.receipt_id = existing_receipt.id
      and allocation.club_id = p_club_id
    order by receivable.rotary_year_id
    limit 1;
    if receipt_year_id is null then
      raise exception using errcode = '55000', message = 'dues_receipt_allocations_missing';
    end if;
    return public.get_club_dues_finance_ledger(p_club_id, receipt_year_id)
      || jsonb_build_object(
        'receipt_id', existing_receipt.id,
        'idempotent_replay', true
      );
  end if;

  -- Lock every receivable in a deterministic order before checking its
  -- outstanding amount.  Concurrent retries therefore cannot over-collect.
  for item in
    select element.item
    from jsonb_array_elements(p_items) as element(item)
    order by element.item->>'receivable_id'
  loop
    if jsonb_typeof(item) <> 'object'
       or item->>'receivable_id' is null
       or item->>'receivable_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or item->>'amount' is null then
      raise exception using errcode = '22023', message = 'invalid_dues_receipt_item';
    end if;
    item_receivable_id := (item->>'receivable_id')::uuid;
    begin
      item_amount := (item->>'amount')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = '22023', message = 'invalid_dues_receipt_item_amount';
    end;
    if item_amount < 1
       or item_amount > 9999999999
       or item_amount <> trunc(item_amount)
       or item_receivable_id = any(seen_receivable_ids) then
      raise exception using errcode = '22023', message = 'invalid_dues_receipt_item_amount';
    end if;
    seen_receivable_ids := array_append(seen_receivable_ids, item_receivable_id);

    select receivable.* into target
    from public.club_finance_receivables as receivable
    where receivable.id = item_receivable_id
      and receivable.club_id = p_club_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'dues_receivable_not_found';
    end if;
    if receipt_year_id is null then
      receipt_year_id := target.rotary_year_id;
    elsif receipt_year_id <> target.rotary_year_id then
      raise exception using errcode = '22023', message = 'dues_receipt_must_use_one_rotary_year';
    end if;

    select target.base_amount + coalesce(sum(adjustment.amount_delta), 0)
      into current_amount
    from public.club_finance_receivable_adjustments as adjustment
    where adjustment.receivable_id = target.id;
    select coalesce(sum(allocation.amount), 0)
      into received_amount
    from public.club_finance_receipt_allocations as allocation
    join public.club_finance_receipts as receipt on receipt.id = allocation.receipt_id
    where allocation.receivable_id = target.id
      and not exists (
        select 1 from public.club_finance_receipt_reversals as reversal
        where reversal.receipt_id = receipt.id
      );
    if received_amount + item_amount > current_amount then
      raise exception using errcode = '22023', message = 'dues_receipt_exceeds_outstanding';
    end if;
    total_amount := total_amount + item_amount;
  end loop;
  if total_amount > 9999999999 then
    raise exception using errcode = '22023', message = 'dues_receipt_amount_too_large';
  end if;

  insert into public.club_finance_receipts (
    club_id, amount, received_on, payment_method, reference_note,
    idempotency_key, recorded_by_app_account_id
  ) values (
    p_club_id, total_amount, p_received_on, p_payment_method, normalized_note,
    normalized_key, actor_id
  ) returning * into created_receipt;

  for item in
    select element.item
    from jsonb_array_elements(p_items) as element(item)
    order by element.item->>'receivable_id'
  loop
    item_receivable_id := (item->>'receivable_id')::uuid;
    item_amount := (item->>'amount')::numeric;
    insert into public.club_finance_receipt_allocations (
      club_id, receipt_id, receivable_id, amount
    ) values (
      p_club_id, created_receipt.id, item_receivable_id, item_amount
    );
  end loop;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'dues.receipt_recorded', 'dues_receipt', created_receipt.id,
    jsonb_build_object(
      'rotary_year_id', receipt_year_id,
      'amount', total_amount,
      'item_count', jsonb_array_length(p_items),
      'payment_method', p_payment_method
    )
  );

  return public.get_club_dues_finance_ledger(p_club_id, receipt_year_id)
    || jsonb_build_object(
      'receipt_id', created_receipt.id,
      'idempotent_replay', false
    );
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'dues_receipt_already_exists';
end;
$$;

create or replace function public.reverse_dues_receipt(
  p_club_id uuid,
  p_receipt_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_finance_receipts;
  created_reversal public.club_finance_receipt_reversals;
  receipt_year_id uuid;
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if actor_id is null
     or not public.current_has_dues_finance_permission(p_club_id, 'finance.manage') then
    raise exception using errcode = '42501', message = 'dues_finance_manage_required';
  end if;
  if p_receipt_id is null
     or normalized_reason is null
     or char_length(normalized_reason) < 2
     or char_length(normalized_reason) > 500 then
    raise exception using errcode = '22023', message = 'invalid_dues_receipt_reversal';
  end if;

  select receipt.* into target
  from public.club_finance_receipts as receipt
  where receipt.id = p_receipt_id
    and receipt.club_id = p_club_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'dues_receipt_not_found';
  end if;
  if exists (
    select 1
    from public.club_finance_receipt_reversals as reversal
    where reversal.receipt_id = target.id
      and reversal.club_id = p_club_id
  ) then
    raise exception using errcode = '55000', message = 'dues_receipt_already_reversed';
  end if;
  select receivable.rotary_year_id into receipt_year_id
  from public.club_finance_receipt_allocations as allocation
  join public.club_finance_receivables as receivable
    on receivable.id = allocation.receivable_id
   and receivable.club_id = p_club_id
  where allocation.receipt_id = target.id
    and allocation.club_id = p_club_id
  order by receivable.rotary_year_id
  limit 1;
  if receipt_year_id is null then
    raise exception using errcode = '55000', message = 'dues_receipt_allocations_missing';
  end if;

  insert into public.club_finance_receipt_reversals (
    club_id, receipt_id, reason, reversed_by_app_account_id
  ) values (
    p_club_id, target.id, normalized_reason, actor_id
  ) returning * into created_reversal;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'dues.receipt_reversed', 'dues_receipt', target.id,
    jsonb_build_object('reversal_id', created_reversal.id, 'reason_recorded', true)
  );

  return public.get_club_dues_finance_ledger(p_club_id, receipt_year_id)
    || jsonb_build_object('reversed_receipt_id', target.id);
exception
  when unique_violation then
    raise exception using errcode = '55000', message = 'dues_receipt_already_reversed';
end;
$$;

create or replace function public.submit_dues_advance(
  p_club_id uuid,
  p_rotary_year_id uuid,
  p_amount numeric,
  p_description text,
  p_incurred_on date,
  p_idempotency_key text,
  p_payer_membership_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_can_manage boolean := false;
  payer_membership_id uuid := p_payer_membership_id;
  existing_advance public.club_finance_advances;
  created_advance public.club_finance_advances;
  normalized_description text := nullif(btrim(coalesce(p_description, '')), '');
  normalized_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'dues_finance_account_required';
  end if;
  actor_can_manage := public.current_has_dues_finance_permission(p_club_id, 'finance.manage');
  if p_amount is null
     or p_amount < 1
     or p_amount > 9999999999
     or p_amount <> trunc(p_amount)
     or normalized_description is null
     or char_length(normalized_description) < 2
     or char_length(normalized_description) > 1000
     or p_incurred_on is null
     or normalized_key is null
     or char_length(normalized_key) > 160 then
    raise exception using errcode = '22023', message = 'invalid_dues_advance';
  end if;
  if not exists (
    select 1 from public.rotary_years as year_item
    where year_item.id = p_rotary_year_id and year_item.club_id = p_club_id
  ) then
    raise exception using errcode = 'P0002', message = 'dues_rotary_year_not_found';
  end if;

  if payer_membership_id is null then
    select membership.id into payer_membership_id
    from public.app_accounts as account
    join public.club_memberships as membership
      on membership.person_id = account.person_id
     and membership.club_id = p_club_id
     and membership.membership_status = 'active'
     and (membership.joined_on is null or membership.joined_on <= current_date)
     and (membership.ended_on is null or membership.ended_on >= current_date)
    where account.id = actor_id;
  elsif not actor_can_manage then
    raise exception using errcode = '42501', message = 'dues_finance_manage_required';
  end if;
  if payer_membership_id is null or not exists (
    select 1 from public.club_memberships as membership
    where membership.id = payer_membership_id
      and membership.club_id = p_club_id
      and membership.membership_status = 'active'
      and (membership.joined_on is null or membership.joined_on <= current_date)
      and (membership.ended_on is null or membership.ended_on >= current_date)
  ) then
    raise exception using errcode = '42501', message = 'active_dues_membership_required';
  end if;

  select advance.* into existing_advance
  from public.club_finance_advances as advance
  where advance.club_id = p_club_id
    and advance.idempotency_key = normalized_key;
  if found then
    return public.project_dues_advance(existing_advance.id)
      || jsonb_build_object('idempotent_replay', true);
  end if;

  insert into public.club_finance_advances (
    club_id, rotary_year_id, payer_membership_id, amount, description,
    incurred_on, submitted_by_app_account_id, last_submitted_by_app_account_id,
    idempotency_key
  ) values (
    p_club_id, p_rotary_year_id, payer_membership_id, p_amount, normalized_description,
    p_incurred_on, actor_id, actor_id, normalized_key
  ) returning * into created_advance;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'dues.advance_submitted', 'dues_advance', created_advance.id,
    jsonb_build_object(
      'rotary_year_id', p_rotary_year_id,
      'payer_membership_id', payer_membership_id,
      'amount', p_amount
    )
  );

  return public.project_dues_advance(created_advance.id)
    || jsonb_build_object('idempotent_replay', false);
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'dues_advance_already_exists';
end;
$$;

create or replace function public.return_dues_advance(
  p_club_id uuid,
  p_advance_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_finance_advances;
  return_item public.club_finance_advance_returns;
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if actor_id is null
     or not public.current_has_dues_finance_permission(p_club_id, 'finance.approve') then
    raise exception using errcode = '42501', message = 'dues_finance_approve_required';
  end if;
  if p_advance_id is null
     or normalized_reason is null
     or char_length(normalized_reason) < 2
     or char_length(normalized_reason) > 500 then
    raise exception using errcode = '22023', message = 'invalid_dues_advance_return';
  end if;

  select advance.* into target
  from public.club_finance_advances as advance
  where advance.id = p_advance_id
    and advance.club_id = p_club_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'dues_advance_not_found';
  end if;
  if target.advance_status <> 'submitted' then
    raise exception using errcode = '55000', message = 'dues_advance_not_submittable';
  end if;

  insert into public.club_finance_advance_returns (
    club_id, advance_id, reason, returned_by_app_account_id
  ) values (
    p_club_id, target.id, normalized_reason, actor_id
  ) returning * into return_item;

  update public.club_finance_advances
  set advance_status = 'returned'
  where id = target.id;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'dues.advance_returned', 'dues_advance', target.id,
    jsonb_build_object('return_id', return_item.id, 'reason_recorded', true)
  );

  return public.project_dues_advance(target.id);
end;
$$;

create or replace function public.resubmit_dues_advance(
  p_club_id uuid,
  p_advance_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_finance_advances;
  can_manage boolean := false;
  normalized_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'dues_finance_account_required';
  end if;
  if normalized_note is not null and char_length(normalized_note) > 500 then
    raise exception using errcode = '22023', message = 'invalid_dues_resubmission_note';
  end if;
  can_manage := public.current_has_dues_finance_permission(p_club_id, 'finance.manage');
  if not can_manage and not public.current_has_active_dues_membership(p_club_id) then
    raise exception using errcode = '42501', message = 'active_dues_membership_required';
  end if;

  select advance.* into target
  from public.club_finance_advances as advance
  where advance.id = p_advance_id
    and advance.club_id = p_club_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'dues_advance_not_found';
  end if;
  if target.advance_status <> 'returned' then
    raise exception using errcode = '55000', message = 'dues_advance_not_returned';
  end if;
  if not can_manage and target.submitted_by_app_account_id <> actor_id then
    raise exception using errcode = '42501', message = 'dues_advance_owner_required';
  end if;

  update public.club_finance_advances
  set advance_status = 'submitted',
      submission_count = target.submission_count + 1,
      last_submitted_by_app_account_id = actor_id
  where id = target.id;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'dues.advance_resubmitted', 'dues_advance', target.id,
    jsonb_build_object('submission_count', target.submission_count + 1, 'note', normalized_note)
  );

  return public.project_dues_advance(target.id);
end;
$$;

create or replace function public.approve_dues_reconciliation(
  p_club_id uuid,
  p_advance_id uuid,
  p_amount numeric,
  p_approval_note text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_finance_advances;
  existing_reconciliation public.club_finance_reconciliations;
  created_reconciliation public.club_finance_reconciliations;
  approved_amount numeric;
  normalized_note text := nullif(btrim(coalesce(p_approval_note, '')), '');
  normalized_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
begin
  if actor_id is null
     or not public.current_has_dues_finance_permission(p_club_id, 'finance.approve') then
    raise exception using errcode = '42501', message = 'dues_finance_approve_required';
  end if;
  if p_amount is null
     or p_amount < 1
     or p_amount > 9999999999
     or p_amount <> trunc(p_amount)
     or normalized_key is null
     or char_length(normalized_key) > 160
     or normalized_note is not null and char_length(normalized_note) > 500 then
    raise exception using errcode = '22023', message = 'invalid_dues_reconciliation';
  end if;

  select reconciliation.* into existing_reconciliation
  from public.club_finance_reconciliations as reconciliation
  where reconciliation.club_id = p_club_id
    and reconciliation.idempotency_key = normalized_key;
  if found then
    return public.project_dues_advance(existing_reconciliation.advance_id)
      || jsonb_build_object(
        'reconciliation_id', existing_reconciliation.id,
        'idempotent_replay', true
      );
  end if;

  select advance.* into target
  from public.club_finance_advances as advance
  where advance.id = p_advance_id
    and advance.club_id = p_club_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'dues_advance_not_found';
  end if;
  if target.advance_status <> 'submitted' then
    raise exception using errcode = '55000', message = 'dues_advance_not_submittable';
  end if;

  select coalesce(sum(reconciliation.amount), 0)
    into approved_amount
  from public.club_finance_reconciliations as reconciliation
  where reconciliation.advance_id = target.id
    and reconciliation.club_id = p_club_id
    and not exists (
      select 1 from public.club_finance_reconciliation_reversals as reversal
      where reversal.reconciliation_id = reconciliation.id
        and reversal.club_id = p_club_id
    );
  if approved_amount + p_amount > target.amount then
    raise exception using errcode = '22023', message = 'dues_reconciliation_exceeds_outstanding';
  end if;

  insert into public.club_finance_reconciliations (
    club_id, advance_id, amount, approval_note, approved_by_app_account_id,
    idempotency_key
  ) values (
    p_club_id, target.id, p_amount, normalized_note, actor_id, normalized_key
  ) returning * into created_reconciliation;

  update public.club_finance_advances
  set advance_status = case
    when approved_amount + p_amount = target.amount then 'closed'
    else 'submitted'
  end
  where id = target.id;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'dues.reconciliation_approved', 'dues_reconciliation', created_reconciliation.id,
    jsonb_build_object(
      'advance_id', target.id,
      'amount', p_amount,
      'partial', approved_amount + p_amount < target.amount
    )
  );

  return public.project_dues_advance(target.id)
    || jsonb_build_object(
      'reconciliation_id', created_reconciliation.id,
      'idempotent_replay', false
    );
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'dues_reconciliation_already_exists';
end;
$$;

create or replace function public.reverse_dues_reconciliation(
  p_club_id uuid,
  p_reconciliation_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_finance_reconciliations;
  created_reversal public.club_finance_reconciliation_reversals;
  advance_item public.club_finance_advances;
  approved_amount numeric;
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if actor_id is null
     or not public.current_has_dues_finance_permission(p_club_id, 'finance.approve') then
    raise exception using errcode = '42501', message = 'dues_finance_approve_required';
  end if;
  if p_reconciliation_id is null
     or normalized_reason is null
     or char_length(normalized_reason) < 2
     or char_length(normalized_reason) > 500 then
    raise exception using errcode = '22023', message = 'invalid_dues_reconciliation_reversal';
  end if;

  select reconciliation.* into target
  from public.club_finance_reconciliations as reconciliation
  where reconciliation.id = p_reconciliation_id
    and reconciliation.club_id = p_club_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'dues_reconciliation_not_found';
  end if;
  if exists (
    select 1
    from public.club_finance_reconciliation_reversals as reversal
    where reversal.reconciliation_id = target.id
      and reversal.club_id = p_club_id
  ) then
    raise exception using errcode = '55000', message = 'dues_reconciliation_already_reversed';
  end if;

  insert into public.club_finance_reconciliation_reversals (
    club_id, reconciliation_id, reason, reversed_by_app_account_id
  ) values (
    p_club_id, target.id, normalized_reason, actor_id
  ) returning * into created_reversal;

  select advance.* into advance_item
  from public.club_finance_advances as advance
  where advance.id = target.advance_id
    and advance.club_id = p_club_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'dues_advance_not_found';
  end if;

  select coalesce(sum(reconciliation.amount), 0)
    into approved_amount
  from public.club_finance_reconciliations as reconciliation
  where reconciliation.advance_id = advance_item.id
    and reconciliation.club_id = p_club_id
    and not exists (
      select 1 from public.club_finance_reconciliation_reversals as reversal
      where reversal.reconciliation_id = reconciliation.id
        and reversal.club_id = p_club_id
    );
  update public.club_finance_advances
  set advance_status = case
    when approved_amount >= advance_item.amount then 'closed'
    else 'submitted'
  end
  where id = advance_item.id;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'dues.reconciliation_reversed', 'dues_reconciliation', target.id,
    jsonb_build_object('reversal_id', created_reversal.id, 'reason_recorded', true)
  );

  return public.project_dues_advance(advance_item.id)
    || jsonb_build_object('reversed_reconciliation_id', target.id);
exception
  when unique_violation then
    raise exception using errcode = '55000', message = 'dues_reconciliation_already_reversed';
end;
$$;

revoke all on function public.set_platform_feature_flag(text, boolean, text[], integer)
  from public, anon, authenticated;
grant execute on function public.set_platform_feature_flag(text, boolean, text[], integer)
  to authenticated;

revoke all on function public.platform_product_telemetry_payload_is_valid(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.prevent_club_finance_immutable_mutation()
  from public, anon, authenticated;
revoke all on function public.current_has_dues_finance_permission(uuid, text)
  from public, anon, authenticated;
revoke all on function public.current_has_active_dues_membership(uuid)
  from public, anon, authenticated;
revoke all on function public.project_dues_receivable(uuid)
  from public, anon, authenticated;
revoke all on function public.project_dues_advance(uuid)
  from public, anon, authenticated;

revoke all on function public.get_club_dues_finance_ledger(uuid, uuid, integer)
  from public, anon;
revoke all on function public.get_my_dues_finance_ledger(uuid, uuid)
  from public, anon;
revoke all on function public.set_club_dues_annual_default(uuid, uuid, numeric, text)
  from public, anon;
revoke all on function public.generate_club_dues_receivables(uuid, uuid, text)
  from public, anon;
revoke all on function public.create_dues_receivable(uuid, uuid, uuid, numeric, text, text, text)
  from public, anon;
revoke all on function public.adjust_dues_receivable(uuid, uuid, numeric, text, text)
  from public, anon;
revoke all on function public.record_dues_receipt(uuid, date, text, text, jsonb, text)
  from public, anon;
revoke all on function public.reverse_dues_receipt(uuid, uuid, text)
  from public, anon;
revoke all on function public.submit_dues_advance(uuid, uuid, numeric, text, date, text, uuid)
  from public, anon;
revoke all on function public.return_dues_advance(uuid, uuid, text)
  from public, anon;
revoke all on function public.resubmit_dues_advance(uuid, uuid, text)
  from public, anon;
revoke all on function public.approve_dues_reconciliation(uuid, uuid, numeric, text, text)
  from public, anon;
revoke all on function public.reverse_dues_reconciliation(uuid, uuid, text)
  from public, anon;

grant execute on function public.get_club_dues_finance_ledger(uuid, uuid, integer)
  to authenticated;
grant execute on function public.get_my_dues_finance_ledger(uuid, uuid)
  to authenticated;
grant execute on function public.set_club_dues_annual_default(uuid, uuid, numeric, text)
  to authenticated;
grant execute on function public.generate_club_dues_receivables(uuid, uuid, text)
  to authenticated;
grant execute on function public.create_dues_receivable(uuid, uuid, uuid, numeric, text, text, text)
  to authenticated;
grant execute on function public.adjust_dues_receivable(uuid, uuid, numeric, text, text)
  to authenticated;
grant execute on function public.record_dues_receipt(uuid, date, text, text, jsonb, text)
  to authenticated;
grant execute on function public.reverse_dues_receipt(uuid, uuid, text)
  to authenticated;
grant execute on function public.submit_dues_advance(uuid, uuid, numeric, text, date, text, uuid)
  to authenticated;
grant execute on function public.return_dues_advance(uuid, uuid, text)
  to authenticated;
grant execute on function public.resubmit_dues_advance(uuid, uuid, text)
  to authenticated;
grant execute on function public.approve_dues_reconciliation(uuid, uuid, numeric, text, text)
  to authenticated;
grant execute on function public.reverse_dues_reconciliation(uuid, uuid, text)
  to authenticated;

commit;
