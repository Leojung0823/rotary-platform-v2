begin;

-- A member-facing, caller-only ledger with a Rotary-year filter. The filter is
-- display state, never authority: account and membership are always derived
-- from auth.uid(), and a stale/tampered club id safely falls back to one of the
-- caller's own active clubs.
create or replace function public.get_my_blessing_iou_ledger(
  p_club_id uuid default null,
  p_rotary_year_start integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  clubs jsonb;
  selected uuid;
  membership_id uuid;
  club_timezone text;
  local_today date;
  current_year integer;
  selected_year integer;
  available_years jsonb;
  entries jsonb;
  totals jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'active_account_required';
  end if;

  select coalesce(jsonb_agg(to_jsonb(club) - 'ord' order by club.ord), '[]'::jsonb)
  into clubs
  from public.list_my_blessing_iou_clubs() with ordinality
    as club(club_id, club_code, club_name, allow_public_amounts, can_manage, ord);

  if p_club_id is not null then
    select (entry->>'club_id')::uuid into selected
    from jsonb_array_elements(clubs) as entry
    where (entry->>'club_id')::uuid = p_club_id
    limit 1;
  end if;
  if selected is null then
    selected := (clubs->0->>'club_id')::uuid;
  end if;

  if selected is null then
    return jsonb_build_object(
      'clubs', clubs,
      'selected_club_id', null,
      'current_year', null,
      'selected_year', null,
      'available_years', '[]'::jsonb,
      'totals', null,
      'entries', '[]'::jsonb
    );
  end if;

  select membership.id, club.timezone_name
  into membership_id, club_timezone
  from public.app_accounts as account
  join public.club_memberships as membership on membership.person_id = account.person_id
  join public.clubs as club on club.id = membership.club_id
  where account.id = actor_id
    and account.account_status = 'active'
    and membership.club_id = selected
    and membership.membership_status = 'active'
    and club.club_status = 'active';

  if membership_id is null then
    raise exception using errcode = '42501', message = 'active_blessing_iou_membership_required';
  end if;

  local_today := (now() at time zone club_timezone)::date;
  current_year := extract(year from local_today)::integer
    - case when extract(month from local_today) >= 7 then 0 else 1 end;
  selected_year := case
    when p_rotary_year_start is null then null
    when p_rotary_year_start between 1900 and extract(year from local_today)::integer + 1
      then p_rotary_year_start
    else current_year
  end;

  select coalesce(jsonb_agg(year_start order by year_start desc), '[]'::jsonb)
  into available_years
  from (
    select year_start
    from (
      select distinct extract(year from entry.pledged_on)::integer
        - case when extract(month from entry.pledged_on) >= 7 then 0 else 1 end as year_start
      from public.blessing_iou_entries as entry
      where entry.club_id = selected
        and entry.author_app_account_id = actor_id
        and entry.entry_status = 'active'
      union
      select current_year
    ) as years
    order by year_start desc
    limit 30
  ) as bounded_years;

  with mine as materialized (
    select entry.id,
      entry.blessing_text,
      entry.pledged_amount,
      entry.currency_code,
      entry.amount_visibility,
      entry.pledged_on,
      entry.created_at,
      coalesce((
        select sum(collection.amount_received)
        from public.blessing_iou_collections as collection
        where collection.entry_id = entry.id
          and collection.club_id = entry.club_id
          and collection.collection_status = 'posted'
      ), 0)::numeric as collected_amount
    from public.blessing_iou_entries as entry
    where entry.club_id = selected
      and entry.author_app_account_id = actor_id
      and entry.entry_status = 'active'
      and (
        selected_year is null
        or (
          entry.pledged_on >= make_date(selected_year, 7, 1)
          and entry.pledged_on < make_date(selected_year + 1, 7, 1)
        )
      )
  ), bounded as (
    select * from mine
    order by pledged_on desc, created_at desc, id desc
    limit 500
  )
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'entry_id', bounded.id,
        'blessing_text', bounded.blessing_text,
        'pledged_amount', bounded.pledged_amount,
        'currency_code', bounded.currency_code,
        'amount_is_public', bounded.amount_visibility = 'club',
        'pledged_on', bounded.pledged_on,
        'collected_amount', bounded.collected_amount,
        'outstanding_amount', greatest(coalesce(bounded.pledged_amount, 0) - bounded.collected_amount, 0)
      ) order by bounded.pledged_on desc, bounded.created_at desc, bounded.id desc)
      from bounded
    ), '[]'::jsonb),
    jsonb_build_object(
      'entry_count', (select count(*) from mine),
      'pledged_total', coalesce((select sum(pledged_amount) from mine), 0),
      'collected_total', coalesce((select sum(collected_amount) from mine), 0),
      'outstanding_total', coalesce((
        select sum(greatest(coalesce(pledged_amount, 0) - collected_amount, 0)) from mine
      ), 0)
    )
  into entries, totals;

  return jsonb_build_object(
    'clubs', clubs,
    'selected_club_id', selected,
    'current_year', current_year,
    'selected_year', selected_year,
    'available_years', available_years,
    'totals', totals,
    'entries', entries
  );
end;
$$;

revoke all on function public.get_my_blessing_iou_ledger(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.get_my_blessing_iou_ledger(uuid, integer) to authenticated;

commit;
