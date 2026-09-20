begin;

-- A receipt belongs to the Rotary year of the receivable it settles.  Without
-- this boundary, a future-year receivable could receive today's date and make
-- the annual report's 12 monthly buckets disagree with its totals.
create or replace function public.validate_dues_receipt_allocation_date()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  receipt_date date;
  receipt_club_id uuid;
  year_start integer;
  receivable_club_id uuid;
begin
  select receipt.received_on, receipt.club_id
    into receipt_date, receipt_club_id
  from public.club_finance_receipts as receipt
  where receipt.id = new.receipt_id;

  select receivable.club_id, year_item.start_year
    into receivable_club_id, year_start
  from public.club_finance_receivables as receivable
  join public.rotary_years as year_item on year_item.id = receivable.rotary_year_id
  where receivable.id = new.receivable_id;

  if receipt_date is null
     or receipt_club_id is distinct from new.club_id
     or receivable_club_id is distinct from new.club_id
     or receipt_date < make_date(year_start, 7, 1)
     or receipt_date >= make_date(year_start + 1, 7, 1) then
    raise exception using
      errcode = '22023',
      message = 'dues_receipt_date_outside_rotary_year';
  end if;

  return new;
end;
$$;

comment on function public.validate_dues_receipt_allocation_date() is
  'Rejects a dues receipt allocated to a receivable outside that receivable Rotary year.';

drop trigger if exists club_finance_receipt_allocation_date_boundary
  on public.club_finance_receipt_allocations;
create trigger club_finance_receipt_allocation_date_boundary
before insert on public.club_finance_receipt_allocations
for each row execute function public.validate_dues_receipt_allocation_date();

revoke all on function public.validate_dues_receipt_allocation_date() from public, anon, authenticated;

commit;
