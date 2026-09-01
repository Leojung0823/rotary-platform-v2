-- Dispatching the current month gave a member born on the 1st no time at all:
-- the batch was created by the first daily run of that same month, so the
-- invitation and the birthday landed together. Dispatch next month's birthdays
-- instead, so the shortest possible lead time -- a birthday on the 1st, seen by
-- the first run of the preceding month -- is a full month, and a birthday late
-- in the month gets close to two.
--
-- A rolling thirty-day window was rejected. It would give everyone exactly
-- thirty days, but a single calendar month could then carry invitations for two
-- different birthday months, and one invitation per member per month is a
-- product rule that has to hold. Shifting whole months keeps one batch per
-- birthday month, and therefore keeps that quota untouched.
--
-- This also makes the second birthday_effective_date row load-bearing again:
-- dispatching from December has to reach January of the following year.

begin;

create or replace function public.run_birthday_wish_collection_scheduler(
  p_as_of timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  club_row record;
  period record;
  manager_auth_user_id uuid;
  result jsonb;
  notification_result jsonb;
  generated_count integer := 0;
  notified_count integer := 0;
  skipped_count integer := 0;
  skipped_no_manager_count integer := 0;
  failed_count integer := 0;
begin
  if p_as_of is null then
    raise exception using errcode = '22023', message = 'invalid_birthday_scheduler_time';
  end if;

  for club_row in
    select club_data.id, club_data.timezone_name
    from public.clubs as club_data
    where club_data.club_status = 'active'
    order by club_data.id
  loop
    -- Pick a birthday manager belonging to this club. Executive secretaries
    -- live in club_operator_permissions; presidents and secretaries live in
    -- club_role_assignments and were invisible here, which skipped the whole
    -- club. Platform administrators are deliberately excluded: an automatic
    -- dispatch has to act as a real officer of the club it dispatches for, and
    -- club_role_assignments carries no validity window, so 'active' is the
    -- whole expiry test on that path.
    select candidate.auth_user_id
    into manager_auth_user_id
    from (
      select account.auth_user_id,
             1 as manager_priority,
             permission.starts_at as ordered_at,
             account.id as account_id
      from public.club_operator_permissions as permission
      join public.app_accounts as account
        on account.id = permission.app_account_id
      where permission.club_id = club_row.id
        and permission.permission_level = 'club_manager'
        and permission.assignment_status = 'active'
        and permission.starts_at <= p_as_of
        and (permission.ends_at is null or permission.ends_at > p_as_of)
        and account.account_status = 'active'
        and account.auth_user_id is not null
      union all
      select account.auth_user_id,
             case assignment.role_key when 'president' then 2 else 3 end as manager_priority,
             assignment.granted_at as ordered_at,
             account.id as account_id
      from public.club_role_assignments as assignment
      join public.app_accounts as account
        on account.id = assignment.app_account_id
      join public.club_memberships as membership
        on membership.club_id = assignment.club_id
       and membership.person_id = account.person_id
       and membership.membership_status = 'active'
      where assignment.club_id = club_row.id
        and assignment.role_key in ('president', 'secretary')
        and assignment.assignment_status = 'active'
        and account.account_status = 'active'
        and account.auth_user_id is not null
    ) as candidate
    order by candidate.manager_priority, candidate.ordered_at, candidate.account_id
    limit 1;

    if manager_auth_user_id is null then
      skipped_count := skipped_count + 1;
      skipped_no_manager_count := skipped_no_manager_count + 1;
      continue;
    end if;

    -- The claim is set only inside this SECURITY DEFINER transaction and only
    -- after the caller passed the service_role-only function grant.
    perform set_config('request.jwt.claim.sub', manager_auth_user_id::text, true);

    for period in
      select
        extract(year from birthday.birthday_date)::integer as birthday_year,
        extract(month from birthday.birthday_date)::integer as birthday_month,
        min(birthday.birthday_date) as first_birthday_date
      from public.club_memberships as membership
      join public.people as person on person.id = membership.person_id
      join public.birthday_visibility_preferences as preference
        on preference.membership_id = membership.id
       and preference.club_id = club_row.id
       and preference.is_listed = true
       and preference.allow_wishes = true
      cross join lateral (
        select (p_as_of at time zone club_row.timezone_name)::date as local_today
      ) as clock
      cross join lateral (
        select public.birthday_effective_date(
          person.birth_date, extract(year from clock.local_today)::integer
        ) as birthday_date
        union all
        select public.birthday_effective_date(
          person.birth_date, extract(year from clock.local_today)::integer + 1
        ) as birthday_date
      ) as birthday
      where membership.club_id = club_row.id
        and membership.membership_status = 'active'
        and person.birth_date is not null
        and birthday.birthday_date >= (date_trunc('month', clock.local_today) + interval '1 month')::date
        and birthday.birthday_date < (date_trunc('month', clock.local_today) + interval '2 months')::date
      group by extract(year from birthday.birthday_date), extract(month from birthday.birthday_date)
      order by first_birthday_date
    loop
      begin
        result := public.generate_birthday_wish_collection_month(
          club_row.id, period.birthday_year, period.birthday_month
        );
        generated_count := generated_count + 1;

        notification_result := public.ensure_birthday_wish_collection_notification(
          club_row.id, (result ->> 'batch_id')::uuid
        );
        if notification_result ->> 'status' = 'sent' then
          notified_count := notified_count + 1;
        elsif notification_result ->> 'status' = 'failed' then
          failed_count := failed_count + 1;
        end if;
      exception when others then
        failed_count := failed_count + 1;
      end;
    end loop;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'generated_count', generated_count,
    'notified_count', notified_count,
    'skipped_count', skipped_count,
    'skipped_reasons', jsonb_build_object(
      'no_active_birthday_manager', skipped_no_manager_count
    ),
    'failed_count', failed_count
  );
end;
$$;

revoke all on function public.run_birthday_wish_collection_scheduler(timestamptz) from public, anon, authenticated;
grant execute on function public.run_birthday_wish_collection_scheduler(timestamptz) to service_role;

commit;
