begin;

-- Existing rows are deliberately untouched. A missing row still means private,
-- while rows first created by V2 inherit the new public/allow-wishes defaults.
alter table public.birthday_visibility_preferences
  alter column is_listed set default true,
  alter column allow_wishes set default true;

alter table public.birthday_wishes
  add column experience_version smallint not null default 1,
  add constraint birthday_wishes_experience_version_check
    check (experience_version in (1, 2));

comment on column public.birthday_wishes.experience_version is
  'V1 retains one active wish per author and birthday year; V2 allows multiple wishes under the local-day limit.';

drop index public.birthday_wishes_one_active_per_author_year;

-- The legacy path remains a complete fallback when birthday_wishes_v2 is off.
create unique index birthday_wishes_one_active_per_author_year
  on public.birthday_wishes (club_id, recipient_membership_id, author_app_account_id, birthday_year)
  where status = 'active' and experience_version = 1;

create index birthday_wishes_local_day_limit_idx
  on public.birthday_wishes (club_id, author_app_account_id, recipient_membership_id, created_at);

create or replace function public.birthday_effective_date(p_birth_date date, p_year integer)
returns date
language sql
immutable
strict
set search_path = pg_catalog, public
as $$
  select case
    when extract(month from p_birth_date)::integer = 2
      and extract(day from p_birth_date)::integer = 29
      then pg_catalog.make_date(p_year, 3, 1) - 1
    else pg_catalog.make_date(
      p_year,
      extract(month from p_birth_date)::integer,
      extract(day from p_birth_date)::integer
    )
  end
$$;

create or replace function public.birthday_age_on(p_birth_date date, p_local_date date)
returns integer
language sql
immutable
strict
set search_path = pg_catalog, public
as $$
  select extract(year from p_local_date)::integer
    - extract(year from p_birth_date)::integer
    - case
        when p_local_date < public.birthday_effective_date(
          p_birth_date,
          extract(year from p_local_date)::integer
        ) then 1
        else 0
      end
$$;

create or replace function public.birthday_club_local_date(
  p_club_id uuid,
  p_at timestamptz default now()
)
returns date
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select (p_at at time zone club.timezone_name)::date
  from public.clubs as club
  where club.id = p_club_id
$$;

create or replace function public.enforce_birthday_wish_local_day_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  club_timezone text;
  local_created_date date;
  local_day_start timestamptz;
  local_day_end timestamptz;
  locked_author_id uuid;
  wish_count integer;
begin
  select club.timezone_name
  into club_timezone
  from public.clubs as club
  where club.id = new.club_id;

  if club_timezone is null then
    raise exception using errcode = '23503', message = 'birthday_wish_club_required';
  end if;

  -- A real account row is the lock shared by every insert from this author.
  -- This serializes concurrent requests before counting the composite local day.
  select account.id
  into locked_author_id
  from public.app_accounts as account
  where account.id = new.author_app_account_id
  for update;

  if locked_author_id is null then
    raise exception using errcode = '23503', message = 'birthday_wish_author_required';
  end if;

  local_created_date := (new.created_at at time zone club_timezone)::date;
  local_day_start := local_created_date::timestamp at time zone club_timezone;
  local_day_end := (local_created_date + 1)::timestamp at time zone club_timezone;
  new.birthday_year := extract(year from local_created_date)::integer;

  select count(*)::integer
  into wish_count
  from public.birthday_wishes as wish
  where wish.club_id = new.club_id
    and wish.author_app_account_id = new.author_app_account_id
    and wish.recipient_membership_id = new.recipient_membership_id
    and wish.created_at >= local_day_start
    and wish.created_at < local_day_end;

  if wish_count >= 10 then
    raise exception using errcode = '22023', message = 'birthday_wish_daily_limit_reached';
  end if;

  return new;
end;
$$;

create trigger birthday_wishes_00_local_day_limit
before insert on public.birthday_wishes
for each row execute function public.enforce_birthday_wish_local_day_limit();

create or replace function public.protect_birthday_wish_experience_version()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.experience_version is distinct from new.experience_version then
    raise exception using errcode = '23514', message = 'birthday_wish_experience_version_immutable';
  end if;
  return new;
end;
$$;

create trigger birthday_wishes_v2_experience_version_immutable
before update on public.birthday_wishes
for each row execute function public.protect_birthday_wish_experience_version();

-- Keep the V1 fallback tenant projection, but do not let a rollback disclose
-- author identity. Birthday year also follows the selected club's local date.
create or replace function public.get_my_birthday_page(p_club_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  selected_club_id uuid;
  actor_membership_id uuid;
  can_manage boolean := false;
  result jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'birthday_authentication_required';
  end if;

  if p_club_id is not null and not public.current_can_access_birthday_club(p_club_id) then
    raise exception using errcode = '42501', message = 'birthday_club_access_required';
  end if;

  select coalesce(p_club_id, accessible.club_id)
  into selected_club_id
  from (
    select club.id as club_id, club.club_name
    from public.clubs as club
    where club.club_status = 'active'
      and public.current_can_access_birthday_club(club.id)
    order by club.club_name, club.id
    limit 1
  ) as accessible;

  if selected_club_id is not null then
    actor_membership_id := public.current_birthday_membership_id(selected_club_id);
    can_manage := public.current_can_manage_club(selected_club_id);
  end if;

  select jsonb_build_object(
    'clubs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'club_id', club.id,
        'club_code', club.club_code,
        'club_name', club.club_name
      ) order by club.club_name, club.id)
      from public.clubs as club
      where club.club_status = 'active'
        and public.current_can_access_birthday_club(club.id)
    ), '[]'::jsonb),
    'selected_club_id', selected_club_id,
    'can_manage', can_manage,
    'my_preference', case when actor_membership_id is null then null else (
      select jsonb_build_object(
        'membership_id', membership.id,
        'has_birth_date', person.birth_date is not null,
        'is_listed', coalesce(preference.is_listed, false),
        'allow_wishes', coalesce(preference.allow_wishes, false)
      )
      from public.club_memberships as membership
      join public.people as person on person.id = membership.person_id
      left join public.birthday_visibility_preferences as preference
        on preference.membership_id = membership.id
      where membership.id = actor_membership_id
    ) end,
    'birthdays', case when selected_club_id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'membership_id', membership.id,
        'display_name', person.canonical_name,
        'avatar_url', person.avatar_url,
        'birth_month', extract(month from person.birth_date)::integer,
        'birth_day', extract(day from person.birth_date)::integer,
        'allow_wishes', preference.allow_wishes,
        'is_self', membership.id = actor_membership_id
      ) order by extract(month from person.birth_date), extract(day from person.birth_date), person.canonical_name)
      from public.birthday_visibility_preferences as preference
      join public.club_memberships as membership
        on membership.id = preference.membership_id
       and membership.club_id = selected_club_id
       and membership.membership_status = 'active'
      join public.people as person
        on person.id = membership.person_id
       and person.birth_date is not null
      where preference.club_id = selected_club_id
        and preference.is_listed = true
    ), '[]'::jsonb) end,
    'wishes', case when selected_club_id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', wish.id,
        'recipient_membership_id', wish.recipient_membership_id,
        'recipient_name', recipient.canonical_name,
        'author_name', case
          when wish.author_app_account_id = actor_id or can_manage then author.account_display_name
          else null
        end,
        'author_is_hidden', not (wish.author_app_account_id = actor_id or can_manage),
        'content', wish.content,
        'created_at', wish.created_at,
        'updated_at', wish.updated_at,
        'can_edit', wish.author_app_account_id = actor_id,
        'can_delete', wish.author_app_account_id = actor_id,
        'can_moderate', can_manage
      ) order by wish.created_at desc, wish.id desc)
      from public.birthday_wishes as wish
      join public.club_memberships as recipient_membership
        on recipient_membership.id = wish.recipient_membership_id
       and recipient_membership.club_id = selected_club_id
       and recipient_membership.membership_status = 'active'
      join public.people as recipient on recipient.id = recipient_membership.person_id
      join public.app_accounts as author on author.id = wish.author_app_account_id
      join public.birthday_visibility_preferences as preference
        on preference.membership_id = recipient_membership.id
       and preference.club_id = selected_club_id
       and preference.is_listed = true
      where wish.club_id = selected_club_id
        and wish.birthday_year = extract(
          year from public.birthday_club_local_date(selected_club_id)
        )::integer
        and wish.status = 'active'
      limit 200
    ), '[]'::jsonb) end
  ) into result;

  return result;
end;
$$;

create or replace function public.update_own_birthday_wish(
  p_club_id uuid,
  p_wish_id uuid,
  p_content text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  normalized_content text := public.normalize_birthday_wish(p_content);
begin
  if actor_id is null or public.current_birthday_membership_id(p_club_id) is null then
    raise exception using errcode = '42501', message = 'active_birthday_membership_required';
  end if;

  if char_length(normalized_content) < 1 or char_length(normalized_content) > 500 then
    raise exception using errcode = '22023', message = 'invalid_birthday_wish_content';
  end if;

  update public.birthday_wishes
  set content = normalized_content
  where id = p_wish_id
    and club_id = p_club_id
    and author_app_account_id = actor_id
    and birthday_year = extract(
      year from public.birthday_club_local_date(p_club_id)
    )::integer
    and status = 'active';

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_wish_not_available';
  end if;
end;
$$;

create or replace function public.get_my_birthday_page_v2(p_club_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  selected_club_id uuid;
  actor_membership_id uuid;
  can_manage boolean := false;
  club_timezone text;
  local_today date;
  local_year integer;
  result jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'birthday_authentication_required';
  end if;

  if p_club_id is not null and not public.current_can_access_birthday_club(p_club_id) then
    raise exception using errcode = '42501', message = 'birthday_club_access_required';
  end if;

  select coalesce(p_club_id, accessible.club_id)
  into selected_club_id
  from (
    select club.id as club_id, club.club_name
    from public.clubs as club
    where club.club_status = 'active'
      and public.current_can_access_birthday_club(club.id)
    order by club.club_name, club.id
    limit 1
  ) as accessible;

  if selected_club_id is not null then
    actor_membership_id := public.current_birthday_membership_id(selected_club_id);
    can_manage := public.current_can_manage_club(selected_club_id);
    select club.timezone_name
    into club_timezone
    from public.clubs as club
    where club.id = selected_club_id;
    local_today := (now() at time zone club_timezone)::date;
    local_year := extract(year from local_today)::integer;
  end if;

  select jsonb_build_object(
    'clubs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'club_id', club.id,
        'club_code', club.club_code,
        'club_name', club.club_name
      ) order by club.club_name, club.id)
      from public.clubs as club
      where club.club_status = 'active'
        and public.current_can_access_birthday_club(club.id)
    ), '[]'::jsonb),
    'selected_club_id', selected_club_id,
    'can_manage', can_manage,
    'my_preference', case when actor_membership_id is null then null else (
      select jsonb_build_object(
        'membership_id', membership.id,
        'has_birth_date', person.birth_date is not null,
        'has_preference', preference.membership_id is not null,
        'is_listed', coalesce(preference.is_listed, false),
        'allow_wishes', coalesce(preference.allow_wishes, false)
      )
      from public.club_memberships as membership
      join public.people as person on person.id = membership.person_id
      left join public.birthday_visibility_preferences as preference
        on preference.membership_id = membership.id
      where membership.id = actor_membership_id
    ) end,
    'birthdays', case when selected_club_id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'membership_id', membership.id,
        'display_name', person.canonical_name,
        'avatar_url', person.avatar_url,
        'birth_month', extract(month from upcoming.effective_date)::integer,
        'birth_day', extract(day from upcoming.effective_date)::integer,
        'age', case
          when preference.is_listed = true and coalesce(privacy.show_birthday_year, false)
            then public.birthday_age_on(person.birth_date, local_today)
          else null
        end,
        'days_until', (upcoming.effective_date - local_today)::integer,
        'allow_wishes', preference.allow_wishes,
        'is_self', membership.id = actor_membership_id
      ) order by upcoming.effective_date, person.canonical_name, membership.id)
      from public.birthday_visibility_preferences as preference
      join public.club_memberships as membership
        on membership.id = preference.membership_id
       and membership.club_id = selected_club_id
       and membership.membership_status = 'active'
      join public.people as person
        on person.id = membership.person_id
       and person.birth_date is not null
      left join public.app_accounts as recipient_account
        on recipient_account.person_id = person.id
       and recipient_account.account_status = 'active'
      left join public.privacy_settings as privacy
        on privacy.app_account_id = recipient_account.id
      cross join lateral (
        select case
          when public.birthday_effective_date(person.birth_date, local_year) >= local_today
            then public.birthday_effective_date(person.birth_date, local_year)
          else public.birthday_effective_date(person.birth_date, local_year + 1)
        end as effective_date
      ) as upcoming
      where preference.club_id = selected_club_id
        and preference.is_listed = true
    ), '[]'::jsonb) end,
    'wishes', case when selected_club_id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', wish.id,
        'recipient_membership_id', wish.recipient_membership_id,
        'recipient_name', recipient.canonical_name,
        'author_name', case
          when wish.author_app_account_id = actor_id or can_manage then author.account_display_name
          else null
        end,
        'author_is_hidden', not (wish.author_app_account_id = actor_id or can_manage),
        'content', wish.content,
        'created_at', wish.created_at,
        'updated_at', wish.updated_at,
        'can_edit', wish.author_app_account_id = actor_id,
        'can_delete', wish.author_app_account_id = actor_id,
        'can_moderate', can_manage
      ) order by wish.created_at desc, wish.id desc)
      from public.birthday_wishes as wish
      join public.club_memberships as recipient_membership
        on recipient_membership.id = wish.recipient_membership_id
       and recipient_membership.club_id = selected_club_id
       and recipient_membership.membership_status = 'active'
      join public.people as recipient on recipient.id = recipient_membership.person_id
      join public.app_accounts as author on author.id = wish.author_app_account_id
      join public.birthday_visibility_preferences as preference
        on preference.membership_id = recipient_membership.id
       and preference.club_id = selected_club_id
       and preference.is_listed = true
      where wish.club_id = selected_club_id
        and wish.birthday_year = local_year
        and wish.status = 'active'
      limit 200
    ), '[]'::jsonb) end
  ) into result;

  return result;
end;
$$;

create or replace function public.set_my_birthday_preference_v2(
  p_club_id uuid,
  p_is_listed boolean default true,
  p_allow_wishes boolean default true
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_membership_id uuid := public.current_birthday_membership_id(p_club_id);
  has_birth_date boolean;
  effective_is_listed boolean := coalesce(p_is_listed, true);
  effective_allow_wishes boolean := effective_is_listed and coalesce(p_allow_wishes, true);
begin
  if actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_birthday_membership_required';
  end if;

  select person.birth_date is not null
  into has_birth_date
  from public.club_memberships as membership
  join public.people as person on person.id = membership.person_id
  where membership.id = actor_membership_id;

  if effective_is_listed and not coalesce(has_birth_date, false) then
    raise exception using errcode = '22023', message = 'birthday_birth_date_required';
  end if;

  insert into public.birthday_visibility_preferences (
    membership_id, club_id, is_listed, allow_wishes
  ) values (
    actor_membership_id,
    p_club_id,
    effective_is_listed,
    effective_allow_wishes
  )
  on conflict (membership_id) do update
  set is_listed = excluded.is_listed,
      allow_wishes = excluded.allow_wishes;
end;
$$;

create or replace function public.create_birthday_wish_v2(
  p_club_id uuid,
  p_recipient_membership_id uuid,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_birthday_membership_id(p_club_id);
  normalized_content text := public.normalize_birthday_wish(p_content);
  created_id uuid;
begin
  if actor_id is null or actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_birthday_membership_required';
  end if;

  if p_recipient_membership_id is null or p_recipient_membership_id = actor_membership_id then
    raise exception using errcode = '22023', message = 'invalid_birthday_recipient';
  end if;

  if char_length(normalized_content) < 1 or char_length(normalized_content) > 500 then
    raise exception using errcode = '22023', message = 'invalid_birthday_wish_content';
  end if;

  if not exists (
    select 1
    from public.club_memberships as membership
    join public.people as person on person.id = membership.person_id
    join public.birthday_visibility_preferences as preference
      on preference.membership_id = membership.id
     and preference.club_id = p_club_id
     and preference.is_listed = true
     and preference.allow_wishes = true
    where membership.id = p_recipient_membership_id
      and membership.club_id = p_club_id
      and membership.membership_status = 'active'
      and person.birth_date is not null
  ) then
    raise exception using errcode = '42501', message = 'birthday_recipient_not_accepting_wishes';
  end if;

  insert into public.birthday_wishes (
    club_id, recipient_membership_id, author_app_account_id, content, experience_version
  ) values (
    p_club_id,
    p_recipient_membership_id,
    actor_id,
    normalized_content,
    2
  )
  returning id into created_id;

  return created_id;
end;
$$;

create or replace function public.update_own_birthday_wish_v2(
  p_club_id uuid,
  p_wish_id uuid,
  p_content text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  normalized_content text := public.normalize_birthday_wish(p_content);
begin
  if actor_id is null or public.current_birthday_membership_id(p_club_id) is null then
    raise exception using errcode = '42501', message = 'active_birthday_membership_required';
  end if;

  if char_length(normalized_content) < 1 or char_length(normalized_content) > 500 then
    raise exception using errcode = '22023', message = 'invalid_birthday_wish_content';
  end if;

  update public.birthday_wishes
  set content = normalized_content
  where id = p_wish_id
    and club_id = p_club_id
    and author_app_account_id = actor_id
    and birthday_year = extract(
      year from public.birthday_club_local_date(p_club_id)
    )::integer
    and status = 'active';

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_wish_not_available';
  end if;
end;
$$;

-- Register the dark-launch key in both database constraints and the exact
-- protected setter copied forward from 20260823000100.
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
    'blessing_iou_reporting_v1',
    'birthday_wishes_v1',
    'birthday_wishes_v2',
    'message_board_v1',
    'archive_handover_v1'
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
    'blessing_iou_reporting_v1',
    'birthday_wishes_v1',
    'birthday_wishes_v2',
    'message_board_v1',
    'archive_handover_v1'
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
    'birthday_wishes_v1', 'birthday_wishes_v2', 'message_board_v1', 'archive_handover_v1'
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
          'blessing_iou_reporting_v1', 'birthday_wishes_v1', 'birthday_wishes_v2', 'message_board_v1',
          'archive_handover_v1'
        )
        and coalesce(p_payload ->> 'reason', '') in (
          'missing_configuration', 'invalid_configuration', 'evaluation_error'
        );
    else
      return false;
  end case;
end;
$$;

revoke all on function public.birthday_effective_date(date, integer) from public, anon, authenticated;
revoke all on function public.birthday_age_on(date, date) from public, anon, authenticated;
revoke all on function public.birthday_club_local_date(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.enforce_birthday_wish_local_day_limit() from public, anon, authenticated;
revoke all on function public.protect_birthday_wish_experience_version() from public, anon, authenticated;
revoke all on function public.get_my_birthday_page_v2(uuid) from public, anon;
revoke all on function public.set_my_birthday_preference_v2(uuid, boolean, boolean) from public, anon;
revoke all on function public.create_birthday_wish_v2(uuid, uuid, text) from public, anon;
revoke all on function public.update_own_birthday_wish_v2(uuid, uuid, text) from public, anon;
revoke all on function public.set_platform_feature_flag(text, boolean, text[], integer) from public, anon, authenticated;

grant execute on function public.get_my_birthday_page_v2(uuid) to authenticated;
grant execute on function public.set_my_birthday_preference_v2(uuid, boolean, boolean) to authenticated;
grant execute on function public.create_birthday_wish_v2(uuid, uuid, text) to authenticated;
grant execute on function public.update_own_birthday_wish_v2(uuid, uuid, text) to authenticated;
grant execute on function public.set_platform_feature_flag(text, boolean, text[], integer) to authenticated;

commit;
