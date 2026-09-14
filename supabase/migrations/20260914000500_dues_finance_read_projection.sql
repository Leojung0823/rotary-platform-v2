begin;

-- Complete the finance read boundary without changing the already-created
-- finance core migration.  Finance officers need to read the ledger as well
-- as write it, and the UI needs a club-scoped list of Rotary years before it
-- can ask for one year's ledger.

insert into public.role_permissions (role_key, permission_key)
values
  ('secretary', 'finance.read'),
  ('finance', 'finance.read')
on conflict (role_key, permission_key) do nothing;

create or replace function public.list_dues_finance_rotary_years(
  p_club_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not public.current_has_dues_finance_permission(p_club_id, 'finance.read') then
    raise exception using errcode = '42501', message = 'dues_finance_read_required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', year_item.id,
      'club_id', year_item.club_id,
      'start_year', year_item.start_year,
      'rotary_year_label', format('%s-%s', year_item.start_year, right((year_item.start_year + 1)::text, 2))
    ) order by year_item.start_year desc, year_item.id)
    from public.rotary_years as year_item
    where year_item.club_id = p_club_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_dues_finance_rotary_years(uuid)
  from public, anon;
grant execute on function public.list_dues_finance_rotary_years(uuid)
  to authenticated;

-- The management screen needs to show which reconciliation entries can be
-- reversed.  Keep this as part of the same server projection so it does not
-- need a per-advance table query from the browser.
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
    'updated_at', advance.updated_at,
    'reconciliations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'reconciliation_id', reconciliation.id,
        'amount', reconciliation.amount,
        'approval_note', reconciliation.approval_note,
        'approved_at', reconciliation.approved_at,
        'status', case when exists (
          select 1 from public.club_finance_reconciliation_reversals as reversal
          where reversal.reconciliation_id = reconciliation.id
        ) then 'reversed' else 'posted' end,
        'reversal_reason', (
          select reversal.reason
          from public.club_finance_reconciliation_reversals as reversal
          where reversal.reconciliation_id = reconciliation.id
          order by reversal.id desc
          limit 1
        )
      ) order by reconciliation.approved_at, reconciliation.id)
      from public.club_finance_reconciliations as reconciliation
      where reconciliation.advance_id = advance.id
    ), '[]'::jsonb)
  )
  from public.club_finance_advances as advance
  join public.club_memberships as membership on membership.id = advance.payer_membership_id
  join public.people as person on person.id = membership.person_id
  where advance.id = p_advance_id
$$;

revoke all on function public.project_dues_advance(uuid)
  from public, anon, authenticated;

commit;
