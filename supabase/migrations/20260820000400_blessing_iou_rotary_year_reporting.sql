begin;

alter table public.platform_feature_flags
  drop constraint platform_feature_flags_feature_key_check;
alter table public.platform_feature_flags
  add constraint platform_feature_flags_feature_key_check check (feature_key in (
    'role_context_v2',
    'role_shells_v2',
    'member_home_v2',
    'checkin_qr_v2',
    'checkin_gps_v2',
    'attendance_ui_v2',
    'announcements_v09',
    'blessing_iou_v1',
    'blessing_iou_collections_v1',
    'blessing_iou_reporting_v1'
  ));

alter table public.platform_feature_flag_audit
  drop constraint platform_feature_flag_audit_feature_key_check;
alter table public.platform_feature_flag_audit
  add constraint platform_feature_flag_audit_feature_key_check check (feature_key in (
    'role_context_v2',
    'role_shells_v2',
    'member_home_v2',
    'checkin_qr_v2',
    'checkin_gps_v2',
    'attendance_ui_v2',
    'announcements_v09',
    'blessing_iou_v1',
    'blessing_iou_collections_v1',
    'blessing_iou_reporting_v1'
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
    'blessing_iou_collections_v1', 'blessing_iou_reporting_v1'
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

revoke all on function public.set_platform_feature_flag(text, boolean, text[], integer)
  from public, anon, authenticated;
grant execute on function public.set_platform_feature_flag(text, boolean, text[], integer)
  to authenticated;

insert into public.permissions (permission_key, description_zh_hant) values
  ('blessing_iou.report', '查看社內祝福 IOU 扶輪年度與社員彙總')
on conflict (permission_key) do nothing;

insert into public.role_permissions (role_key, permission_key) values
  ('president', 'blessing_iou.report'),
  ('secretary', 'blessing_iou.report'),
  ('finance', 'blessing_iou.report')
on conflict (role_key, permission_key) do nothing;

create index blessing_iou_entries_club_year_reporting_idx
  on public.blessing_iou_entries (club_id, pledged_on, author_membership_id)
  where entry_status = 'active' and pledged_amount is not null;

create or replace function public.get_blessing_iou_rotary_year_report(
  p_club_id uuid,
  p_rotary_year_start integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  club_timezone text;
  local_today date;
  current_rotary_year_start integer;
  starts_on date;
  ends_on date;
  result jsonb;
begin
  if not public.current_has_blessing_iou_permission(p_club_id, 'blessing_iou.report') then
    raise exception using errcode = '42501', message = 'blessing_iou_report_required';
  end if;

  select club.timezone_name into club_timezone
  from public.clubs as club
  where club.id = p_club_id and club.club_status = 'active';
  if club_timezone is null then
    raise exception using errcode = 'P0002', message = 'club_not_available';
  end if;

  local_today := (now() at time zone club_timezone)::date;
  current_rotary_year_start := extract(year from local_today)::integer
    - case when extract(month from local_today) < 7 then 1 else 0 end;
  if p_rotary_year_start is null
     or p_rotary_year_start < 2000
     or p_rotary_year_start > current_rotary_year_start then
    raise exception using errcode = '22023', message = 'invalid_rotary_year_start';
  end if;

  starts_on := make_date(p_rotary_year_start, 7, 1);
  ends_on := make_date(p_rotary_year_start + 1, 6, 30);

  with year_entries as materialized (
    select
      entry.id,
      entry.author_membership_id,
      account.account_display_name as author_display_name,
      entry.pledged_on,
      entry.pledged_amount,
      coalesce(sum(collection.amount_received) filter (
        where collection.collection_status = 'posted'
      ), 0) as received_amount
    from public.blessing_iou_entries as entry
    join public.app_accounts as account on account.id = entry.author_app_account_id
    left join public.blessing_iou_collections as collection on collection.entry_id = entry.id
    where entry.club_id = p_club_id
      and entry.entry_status = 'active'
      and entry.pledged_amount is not null
      and entry.pledged_on between starts_on and ends_on
    group by entry.id, account.account_display_name
  ), month_axis as materialized (
    select generate_series(
      starts_on::timestamp,
      ends_on::timestamp,
      interval '1 month'
    )::date as month_start
  ), monthly as materialized (
    select
      date_trunc('month', pledged_on)::date as month_start,
      count(*) as entry_count,
      count(distinct author_membership_id) as member_count,
      sum(pledged_amount) as pledged_amount,
      sum(received_amount) as received_amount,
      sum(pledged_amount - received_amount) as outstanding_amount
    from year_entries
    group by date_trunc('month', pledged_on)::date
  ), member_totals as materialized (
    select
      author_membership_id,
      author_display_name,
      count(*) as entry_count,
      sum(pledged_amount) as pledged_amount,
      sum(received_amount) as received_amount,
      sum(pledged_amount - received_amount) as outstanding_amount,
      count(*) filter (where received_amount = 0) as unpaid_entry_count,
      count(*) filter (where received_amount > 0 and received_amount < pledged_amount) as partial_entry_count,
      count(*) filter (where received_amount >= pledged_amount) as paid_entry_count
    from year_entries
    group by author_membership_id, author_display_name
  )
  select jsonb_build_object(
    'club_id', club.id,
    'club_code', club.club_code,
    'club_name', club.club_name,
    'rotary_year_start', p_rotary_year_start,
    'rotary_year_label', format(
      '%s-%s',
      p_rotary_year_start,
      right((p_rotary_year_start + 1)::text, 2)
    ),
    'starts_on', starts_on,
    'ends_on', ends_on,
    'currency_code', 'TWD',
    'summary', (
      select jsonb_build_object(
        'entry_count', count(*),
        'member_count', count(distinct author_membership_id),
        'pledged_amount', coalesce(sum(pledged_amount), 0),
        'received_amount', coalesce(sum(received_amount), 0),
        'outstanding_amount', coalesce(sum(pledged_amount - received_amount), 0),
        'unpaid_entry_count', count(*) filter (where received_amount = 0),
        'partial_entry_count', count(*) filter (
          where received_amount > 0 and received_amount < pledged_amount
        ),
        'paid_entry_count', count(*) filter (where received_amount >= pledged_amount)
      ) from year_entries
    ),
    'months', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'month', to_char(axis.month_start, 'YYYY-MM'),
        'entry_count', coalesce(month.entry_count, 0),
        'member_count', coalesce(month.member_count, 0),
        'pledged_amount', coalesce(month.pledged_amount, 0),
        'received_amount', coalesce(month.received_amount, 0),
        'outstanding_amount', coalesce(month.outstanding_amount, 0)
      ) order by axis.month_start), '[]'::jsonb)
      from month_axis as axis
      left join monthly as month on month.month_start = axis.month_start
    ),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'author_membership_id', member.author_membership_id,
        'author_display_name', member.author_display_name,
        'entry_count', member.entry_count,
        'pledged_amount', member.pledged_amount,
        'received_amount', member.received_amount,
        'outstanding_amount', member.outstanding_amount,
        'unpaid_entry_count', member.unpaid_entry_count,
        'partial_entry_count', member.partial_entry_count,
        'paid_entry_count', member.paid_entry_count
      ) order by member.outstanding_amount desc, member.author_display_name, member.author_membership_id), '[]'::jsonb)
      from member_totals as member
    )
  ) into result
  from public.clubs as club
  where club.id = p_club_id and club.club_status = 'active';

  if result is null then
    raise exception using errcode = 'P0002', message = 'club_not_available';
  end if;
  return result;
end;
$$;

revoke all on function public.get_blessing_iou_rotary_year_report(uuid, integer)
  from public, anon;
grant execute on function public.get_blessing_iou_rotary_year_report(uuid, integer)
  to authenticated;

commit;
