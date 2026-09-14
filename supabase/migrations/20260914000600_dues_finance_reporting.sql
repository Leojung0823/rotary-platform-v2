begin;

-- Keep the report projection smaller than the management ledger.  It is used
-- by downloads, so it contains only annual aggregates and display names, never
-- auth ids, LINE ids, notes, or receipt/reconciliation audit rows.
create or replace function public.get_club_dues_finance_report(
  p_club_id uuid,
  p_rotary_year_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  year_record public.rotary_years;
begin
  if not public.current_has_dues_finance_permission(p_club_id, 'finance.read') then
    raise exception using errcode = '42501', message = 'dues_finance_read_required';
  end if;

  select year_item.*
    into year_record
  from public.rotary_years as year_item
  where year_item.id = p_rotary_year_id
    and year_item.club_id = p_club_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'dues_rotary_year_not_found';
  end if;

  return (
    with receivable_projection as (
      select
        receivable.id,
        receivable.membership_id,
        person.canonical_name as display_name,
        receivable.base_amount
          + coalesce(sum(adjustment.amount_delta), 0) as receivable_amount,
        coalesce(received.received_amount, 0) as received_amount
      from public.club_finance_receivables as receivable
      join public.club_memberships as membership
        on membership.id = receivable.membership_id
       and membership.club_id = p_club_id
      join public.people as person on person.id = membership.person_id
      left join public.club_finance_receivable_adjustments as adjustment
        on adjustment.receivable_id = receivable.id
       and adjustment.club_id = p_club_id
      left join lateral (
        select sum(allocation.amount) as received_amount
        from public.club_finance_receipt_allocations as allocation
        join public.club_finance_receipts as receipt
          on receipt.id = allocation.receipt_id
         and receipt.club_id = p_club_id
        where allocation.receivable_id = receivable.id
          and allocation.club_id = p_club_id
          and not exists (
            select 1
            from public.club_finance_receipt_reversals as reversal
            where reversal.receipt_id = receipt.id
              and reversal.club_id = p_club_id
          )
      ) as received on true
      where receivable.club_id = p_club_id
        and receivable.rotary_year_id = p_rotary_year_id
      group by receivable.id, receivable.membership_id, person.canonical_name,
        receivable.base_amount, received.received_amount
    ),
    member_report as (
      select
        display_name,
        count(*)::integer as receivable_count,
        sum(receivable_amount) as receivable_amount,
        sum(received_amount) as received_amount,
        sum(receivable_amount - received_amount) as outstanding_amount,
        count(*) filter (where received_amount = 0)::integer as unpaid_count,
        count(*) filter (where received_amount > 0 and received_amount < receivable_amount)::integer as partial_count,
        count(*) filter (where received_amount = receivable_amount)::integer as paid_count
      from receivable_projection
      group by membership_id, display_name
      order by display_name, membership_id
    ),
    receipt_projection as (
      select
        receipt.id,
        receipt.amount,
        receipt.received_on,
        receipt.payment_method,
        receipt.club_id
      from public.club_finance_receipts as receipt
      where receipt.club_id = p_club_id
        and exists (
          select 1
          from public.club_finance_receipt_allocations as allocation
          join public.club_finance_receivables as receivable
            on receivable.id = allocation.receivable_id
           and receivable.club_id = p_club_id
           and receivable.rotary_year_id = p_rotary_year_id
          where allocation.receipt_id = receipt.id
            and allocation.club_id = p_club_id
        )
        and not exists (
          select 1
          from public.club_finance_receipt_reversals as reversal
          where reversal.receipt_id = receipt.id
            and reversal.club_id = p_club_id
        )
    ),
    advance_projection as (
      select
        advance.id,
        advance.payer_membership_id,
        person.canonical_name as display_name,
        advance.amount,
        coalesce(reconciled.reconciled_amount, 0) as reconciled_amount,
        advance.advance_status
      from public.club_finance_advances as advance
      join public.club_memberships as membership
        on membership.id = advance.payer_membership_id
       and membership.club_id = p_club_id
      join public.people as person on person.id = membership.person_id
      left join lateral (
        select sum(reconciliation.amount) as reconciled_amount
        from public.club_finance_reconciliations as reconciliation
        where reconciliation.advance_id = advance.id
          and reconciliation.club_id = p_club_id
          and not exists (
            select 1
            from public.club_finance_reconciliation_reversals as reversal
            where reversal.reconciliation_id = reconciliation.id
              and reversal.club_id = p_club_id
          )
      ) as reconciled on true
      where advance.club_id = p_club_id
        and advance.rotary_year_id = p_rotary_year_id
    ),
    months as (
      select series.month_start::date
      from generate_series(
        make_date(year_record.start_year, 7, 1),
        make_date(year_record.start_year + 1, 6, 1),
        interval '1 month'
      ) as series(month_start)
    ),
    monthly_receipts as (
      select date_trunc('month', received_on)::date as month_start,
        count(*)::integer as receipt_count,
        sum(amount) as received_amount
      from receipt_projection
      group by date_trunc('month', received_on)::date
    ),
    payment_method_report as (
      select payment_method,
        count(*)::integer as receipt_count,
        sum(amount) as received_amount
      from receipt_projection
      group by payment_method
      order by payment_method
    )
    select jsonb_build_object(
      'club_id', p_club_id,
      'rotary_year_id', year_record.id,
      'rotary_year_start', year_record.start_year,
      'rotary_year_label', format('%s-%s', year_record.start_year, right((year_record.start_year + 1)::text, 2)),
      'starts_on', make_date(year_record.start_year, 7, 1),
      'ends_on', make_date(year_record.start_year + 1, 6, 30),
      'currency_code', 'TWD',
      'summary', jsonb_build_object(
        'member_count', (select count(*)::integer from member_report),
        'receivable_count', (select count(*)::integer from receivable_projection),
        'receivable_amount', coalesce((select sum(receivable_amount) from receivable_projection), 0),
        'received_amount', coalesce((select sum(received_amount) from receivable_projection), 0),
        'outstanding_amount', coalesce((select sum(receivable_amount - received_amount) from receivable_projection), 0),
        'unpaid_count', coalesce((select sum(unpaid_count) from member_report), 0),
        'partial_count', coalesce((select sum(partial_count) from member_report), 0),
        'paid_count', coalesce((select sum(paid_count) from member_report), 0),
        'receipt_count', (select count(*)::integer from receipt_projection),
        'received_by_method_amount', coalesce((select sum(received_amount) from payment_method_report), 0),
        'advance_count', (select count(*)::integer from advance_projection),
        'advance_amount', coalesce((select sum(amount) from advance_projection), 0),
        'reconciled_amount', coalesce((select sum(reconciled_amount) from advance_projection), 0),
        'advance_outstanding_amount', coalesce((select sum(amount - reconciled_amount) from advance_projection), 0)
      ),
      'months', coalesce((
        select jsonb_agg(jsonb_build_object(
          'month', to_char(months.month_start, 'YYYY-MM'),
          'receipt_count', coalesce(monthly_receipts.receipt_count, 0),
          'received_amount', coalesce(monthly_receipts.received_amount, 0)
        ) order by months.month_start)
        from months
        left join monthly_receipts on monthly_receipts.month_start = months.month_start
      ), '[]'::jsonb),
      'payment_methods', coalesce((
        select jsonb_agg(jsonb_build_object(
          'payment_method', payment_method,
          'receipt_count', receipt_count,
          'received_amount', received_amount
        ) order by payment_method)
        from payment_method_report
      ), '[]'::jsonb),
      'members', coalesce((
        select jsonb_agg(jsonb_build_object(
          'member_display_name', display_name,
          'receivable_count', receivable_count,
          'receivable_amount', receivable_amount,
          'received_amount', received_amount,
          'outstanding_amount', outstanding_amount,
          'unpaid_count', unpaid_count,
          'partial_count', partial_count,
          'paid_count', paid_count
        ) order by display_name)
        from member_report
      ), '[]'::jsonb),
      'advances', coalesce((
        select jsonb_agg(jsonb_build_object(
          'member_display_name', display_name,
          'amount', amount,
          'reconciled_amount', reconciled_amount,
          'outstanding_amount', amount - reconciled_amount,
          'advance_status', advance_status
        ) order by display_name, id)
        from advance_projection
      ), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.get_club_dues_annual_default(
  p_club_id uuid,
  p_rotary_year_id uuid
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
  if not exists (
    select 1 from public.rotary_years as year_item
    where year_item.id = p_rotary_year_id
      and year_item.club_id = p_club_id
  ) then
    raise exception using errcode = 'P0002', message = 'dues_rotary_year_not_found';
  end if;

  return (
    select jsonb_build_object(
      'club_id', annual_default.club_id,
      'rotary_year_id', annual_default.rotary_year_id,
      'default_amount', annual_default.default_amount,
      'currency_code', annual_default.currency_code,
      'updated_at', annual_default.updated_at
    )
    from public.club_finance_annual_dues_defaults as annual_default
    where annual_default.club_id = p_club_id
      and annual_default.rotary_year_id = p_rotary_year_id
  );
end;
$$;

create or replace function public.list_my_dues_finance_rotary_years(
  p_club_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not public.current_has_active_dues_membership(p_club_id) then
    raise exception using errcode = '42501', message = 'active_dues_membership_required';
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

revoke all on function public.get_club_dues_finance_report(uuid, uuid)
  from public, anon;
grant execute on function public.get_club_dues_finance_report(uuid, uuid)
  to authenticated;

revoke all on function public.get_club_dues_annual_default(uuid, uuid)
  from public, anon;
grant execute on function public.get_club_dues_annual_default(uuid, uuid)
  to authenticated;

revoke all on function public.list_my_dues_finance_rotary_years(uuid)
  from public, anon;
grant execute on function public.list_my_dues_finance_rotary_years(uuid)
  to authenticated;

commit;
