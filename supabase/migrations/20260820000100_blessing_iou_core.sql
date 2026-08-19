begin;

-- The feature is fail-closed until a platform administrator enables this
-- record through the existing protected rollout RPC. Existing authenticated
-- pages do not gain a new data query while the flag remains disabled.
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
    'blessing_iou_v1'
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
    'blessing_iou_v1'
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
    'attendance_ui_v2', 'announcements_v09', 'blessing_iou_v1'
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
  ('blessing_iou.manage', '管理社內祝福、金額公開設定與未收款承諾')
on conflict (permission_key) do nothing;

insert into public.role_permissions (role_key, permission_key) values
  ('president', 'blessing_iou.manage'),
  ('secretary', 'blessing_iou.manage'),
  ('finance', 'blessing_iou.manage')
on conflict (role_key, permission_key) do nothing;

create table public.club_blessing_iou_settings (
  club_id uuid primary key references public.clubs(id) on delete restrict,
  allow_public_amounts boolean not null default false,
  updated_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.club_blessing_iou_settings is
  'Club-scoped permission to let newly submitted blessing pledges expose their amount. Missing rows fail closed to private.';

create table public.blessing_iou_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  author_membership_id uuid not null,
  author_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  blessing_text text not null,
  pledged_amount numeric(12, 2),
  currency_code text not null default 'TWD',
  amount_visibility text not null default 'private',
  pledged_on date not null,
  entry_status text not null default 'active',
  deleted_by_app_account_id uuid references public.app_accounts(id) on delete restrict,
  deleted_at timestamptz,
  deletion_reason text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blessing_iou_entries_membership_club_fkey
    foreign key (author_membership_id, club_id)
    references public.club_memberships (id, club_id)
    on delete restrict,
  constraint blessing_iou_entries_text_check check (
    btrim(blessing_text) <> '' and char_length(blessing_text) <= 1000
  ),
  constraint blessing_iou_entries_amount_check check (
    pledged_amount is null
    or (pledged_amount between 1 and 9999999999 and pledged_amount = trunc(pledged_amount))
  ),
  constraint blessing_iou_entries_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint blessing_iou_entries_visibility_check check (
    amount_visibility in ('private', 'club')
    and (pledged_amount is not null or amount_visibility = 'private')
  ),
  constraint blessing_iou_entries_status_check check (entry_status in ('active', 'deleted')),
  constraint blessing_iou_entries_deletion_check check (
    (entry_status = 'active' and deleted_by_app_account_id is null and deleted_at is null and deletion_reason is null)
    or (
      entry_status = 'deleted'
      and deleted_by_app_account_id is not null
      and deleted_at is not null
      and btrim(coalesce(deletion_reason, '')) <> ''
      and char_length(deletion_reason) <= 300
    )
  ),
  constraint blessing_iou_entries_version_check check (version >= 1)
);

comment on table public.blessing_iou_entries is
  'Blessing wall posts with an optional TWD pledge. Rows are soft-deleted and browser access is RPC-only.';

create index blessing_iou_entries_club_active_pagination_idx
  on public.blessing_iou_entries (club_id, created_at desc, id desc)
  where entry_status = 'active';

create index blessing_iou_entries_club_author_period_idx
  on public.blessing_iou_entries (club_id, author_membership_id, pledged_on, created_at desc)
  where entry_status = 'active';

create or replace function public.current_has_active_blessing_iou_membership(p_club_id uuid)
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
    join public.clubs as club
      on club.id = membership.club_id
     and club.club_status = 'active'
    where account.auth_user_id = auth.uid()
      and account.account_status = 'active'
  )
$$;

-- Platform authority is deliberately not sufficient here. A platform
-- administrator may manage IOU data only when they also hold a real active
-- club role or operator assignment in that club.
create or replace function public.current_has_blessing_iou_permission(
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

create or replace function public.normalize_blessing_iou_text(p_text text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select regexp_replace(
    regexp_replace(
      replace(replace(p_text, E'\r\n', E'\n'), E'\r', E'\n'),
      '^[[:space:]]+',
      ''
    ),
    '[[:space:]]+$',
    ''
  )
$$;

create or replace function public.set_club_blessing_iou_settings_actor()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'blessing_iou_settings_actor_required';
  end if;
  new.updated_by_app_account_id := actor_id;
  new.updated_at := now();
  return new;
end;
$$;

create trigger club_blessing_iou_settings_set_actor
before insert or update on public.club_blessing_iou_settings
for each row execute function public.set_club_blessing_iou_settings_actor();

create or replace function public.protect_blessing_iou_entry_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.club_id is distinct from new.club_id
     or old.author_membership_id is distinct from new.author_membership_id
     or old.author_app_account_id is distinct from new.author_app_account_id
     or old.currency_code is distinct from new.currency_code
     or old.pledged_on is distinct from new.pledged_on
     or old.created_at is distinct from new.created_at then
    raise exception using errcode = '23514', message = 'blessing_iou_authority_fields_immutable';
  end if;

  if old.entry_status = 'deleted' then
    raise exception using errcode = '55000', message = 'deleted_blessing_iou_entry_immutable';
  end if;

  new.updated_at := now();
  new.version := old.version + 1;
  if new.entry_status = 'deleted' then
    new.deleted_at := coalesce(new.deleted_at, now());
  else
    new.deleted_by_app_account_id := null;
    new.deleted_at := null;
    new.deletion_reason := null;
  end if;
  return new;
end;
$$;

create trigger blessing_iou_entries_protect_update
before update on public.blessing_iou_entries
for each row execute function public.protect_blessing_iou_entry_update();

create or replace function public.prevent_blessing_iou_entry_hard_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = '42501', message = 'blessing_iou_hard_delete_forbidden';
end;
$$;

create trigger blessing_iou_entries_prevent_hard_delete
before delete on public.blessing_iou_entries
for each row execute function public.prevent_blessing_iou_entry_hard_delete();

alter table public.club_blessing_iou_settings enable row level security;
alter table public.blessing_iou_entries enable row level security;
revoke all on table public.club_blessing_iou_settings from public, anon, authenticated;
revoke all on table public.blessing_iou_entries from public, anon, authenticated;

create or replace function public.project_blessing_iou_entry(
  p_entry public.blessing_iou_entries,
  p_actor_id uuid,
  p_can_manage boolean
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', p_entry.id,
    'blessing_text', p_entry.blessing_text,
    'pledged_amount', case
      when p_entry.pledged_amount is null then null
      when p_entry.author_app_account_id = p_actor_id or p_can_manage or (
        p_entry.amount_visibility = 'club' and coalesce(setting.allow_public_amounts, false)
      ) then p_entry.pledged_amount
      else null
    end,
    'has_pledge', p_entry.pledged_amount is not null,
    'currency_code', p_entry.currency_code,
    'amount_is_public', p_entry.pledged_amount is not null
      and p_entry.amount_visibility = 'club'
      and coalesce(setting.allow_public_amounts, false),
    'pledged_on', p_entry.pledged_on,
    'created_at', p_entry.created_at,
    'updated_at', p_entry.updated_at,
    'author_display_name', account.account_display_name,
    'author_avatar_url', person.avatar_url,
    'can_edit', p_entry.author_app_account_id = p_actor_id,
    'can_delete', p_entry.author_app_account_id = p_actor_id or p_can_manage,
    'viewer_can_manage', p_can_manage
  )
  from public.app_accounts as account
  join public.people as person on person.id = account.person_id
  left join public.club_blessing_iou_settings as setting on setting.club_id = p_entry.club_id
  where account.id = p_entry.author_app_account_id
$$;

create or replace function public.list_my_blessing_iou_clubs()
returns table (
  club_id uuid,
  club_code text,
  club_name text,
  allow_public_amounts boolean,
  can_manage boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select
    club.id,
    club.club_code,
    club.club_name,
    coalesce(setting.allow_public_amounts, false),
    public.current_has_blessing_iou_permission(club.id, 'blessing_iou.manage')
  from public.app_accounts as account
  join public.club_memberships as membership
    on membership.person_id = account.person_id
   and membership.membership_status = 'active'
  join public.clubs as club
    on club.id = membership.club_id
   and club.club_status = 'active'
  left join public.club_blessing_iou_settings as setting on setting.club_id = club.id
  where account.auth_user_id = auth.uid()
    and account.account_status = 'active'
  order by club.club_name, club.id
$$;

create or replace function public.list_blessing_iou_entries(
  p_club_id uuid,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  can_manage boolean := public.current_has_blessing_iou_permission(p_club_id, 'blessing_iou.manage');
  result jsonb;
begin
  if actor_id is null or (
    not public.current_has_active_blessing_iou_membership(p_club_id) and not can_manage
  ) then
    raise exception using errcode = '42501', message = 'blessing_iou_access_required';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using errcode = '22023', message = 'invalid_blessing_iou_limit';
  end if;
  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise exception using errcode = '22023', message = 'invalid_blessing_iou_cursor';
  end if;
  if p_cursor_id is not null and not exists (
    select 1
    from public.blessing_iou_entries as cursor_entry
    where cursor_entry.id = p_cursor_id
      and cursor_entry.club_id = p_club_id
      and cursor_entry.created_at = p_cursor_created_at
      and cursor_entry.entry_status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'invalid_blessing_iou_cursor';
  end if;

  with page as materialized (
    select entry.*
    from public.blessing_iou_entries as entry
    where entry.club_id = p_club_id
      and entry.entry_status = 'active'
      and (
        p_cursor_created_at is null
        or entry.created_at < p_cursor_created_at
        or (entry.created_at = p_cursor_created_at and entry.id < p_cursor_id)
      )
    order by entry.created_at desc, entry.id desc
    limit p_limit + 1
  ), visible as materialized (
    select * from page
    order by created_at desc, id desc
    limit p_limit
  )
  select jsonb_build_object(
    'entries', coalesce((
      select jsonb_agg(
        public.project_blessing_iou_entry(visible, actor_id, can_manage)
        order by visible.created_at desc, visible.id desc
      ) from visible
    ), '[]'::jsonb),
    'next_cursor', case when (select count(*) from page) > p_limit then (
      select jsonb_build_object('v', 1, 'created_at', visible.created_at, 'id', visible.id)
      from visible
      order by visible.created_at asc, visible.id asc
      limit 1
    ) else null end,
    'viewer_can_manage', can_manage
  ) into result;
  return result;
end;
$$;

create or replace function public.create_blessing_iou_entry(
  p_club_id uuid,
  p_blessing_text text,
  p_pledged_amount numeric,
  p_hide_amount boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  membership_id uuid;
  club_timezone text;
  normalized_text text := public.normalize_blessing_iou_text(p_blessing_text);
  allow_public boolean := false;
  created_entry public.blessing_iou_entries;
begin
  select membership.id, club.timezone_name
  into membership_id, club_timezone
  from public.app_accounts as account
  join public.club_memberships as membership
    on membership.person_id = account.person_id
   and membership.club_id = p_club_id
   and membership.membership_status = 'active'
  join public.clubs as club
    on club.id = membership.club_id
   and club.club_status = 'active'
  where account.id = actor_id
    and account.account_status = 'active';

  if actor_id is null or membership_id is null then
    raise exception using errcode = '42501', message = 'active_blessing_iou_membership_required';
  end if;
  if normalized_text is null or normalized_text = '' or char_length(normalized_text) > 1000
     or p_hide_amount is null
     or (
       p_pledged_amount is not null and (
         p_pledged_amount < 1
         or p_pledged_amount > 9999999999
         or p_pledged_amount <> trunc(p_pledged_amount)
       )
     ) then
    raise exception using errcode = '22023', message = 'invalid_blessing_iou_entry';
  end if;

  select setting.allow_public_amounts into allow_public
  from public.club_blessing_iou_settings as setting
  where setting.club_id = p_club_id;
  allow_public := coalesce(allow_public, false);

  insert into public.blessing_iou_entries (
    club_id,
    author_membership_id,
    author_app_account_id,
    blessing_text,
    pledged_amount,
    amount_visibility,
    pledged_on
  ) values (
    p_club_id,
    membership_id,
    actor_id,
    normalized_text,
    p_pledged_amount,
    case when p_pledged_amount is not null and allow_public and not p_hide_amount
      then 'club' else 'private' end,
    (now() at time zone club_timezone)::date
  ) returning * into created_entry;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id,
    actor_id,
    'blessing_iou.created',
    'blessing_iou_entry',
    created_entry.id,
    jsonb_build_object(
      'has_pledge', created_entry.pledged_amount is not null,
      'amount_visibility', created_entry.amount_visibility
    )
  );

  return public.project_blessing_iou_entry(
    created_entry,
    actor_id,
    public.current_has_blessing_iou_permission(p_club_id, 'blessing_iou.manage')
  );
end;
$$;

create or replace function public.update_own_blessing_iou_entry(
  p_club_id uuid,
  p_entry_id uuid,
  p_blessing_text text,
  p_pledged_amount numeric,
  p_hide_amount boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  normalized_text text := public.normalize_blessing_iou_text(p_blessing_text);
  allow_public boolean := false;
  updated_entry public.blessing_iou_entries;
begin
  if actor_id is null or not public.current_has_active_blessing_iou_membership(p_club_id) then
    raise exception using errcode = '42501', message = 'active_blessing_iou_membership_required';
  end if;
  if p_entry_id is null or normalized_text is null or normalized_text = ''
     or char_length(normalized_text) > 1000 or p_hide_amount is null
     or (
       p_pledged_amount is not null and (
         p_pledged_amount < 1
         or p_pledged_amount > 9999999999
         or p_pledged_amount <> trunc(p_pledged_amount)
       )
     ) then
    raise exception using errcode = '22023', message = 'invalid_blessing_iou_entry';
  end if;

  select setting.allow_public_amounts into allow_public
  from public.club_blessing_iou_settings as setting
  where setting.club_id = p_club_id;
  allow_public := coalesce(allow_public, false);

  update public.blessing_iou_entries
  set blessing_text = normalized_text,
      pledged_amount = p_pledged_amount,
      amount_visibility = case
        when p_pledged_amount is not null and allow_public and not p_hide_amount then 'club'
        else 'private'
      end
  where id = p_entry_id
    and club_id = p_club_id
    and author_app_account_id = actor_id
    and entry_status = 'active'
  returning * into updated_entry;

  if not found then
    raise exception using errcode = 'P0002', message = 'blessing_iou_entry_not_available';
  end if;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id,
    actor_id,
    'blessing_iou.updated',
    'blessing_iou_entry',
    updated_entry.id,
    jsonb_build_object(
      'has_pledge', updated_entry.pledged_amount is not null,
      'amount_visibility', updated_entry.amount_visibility,
      'version', updated_entry.version
    )
  );

  return public.project_blessing_iou_entry(
    updated_entry,
    actor_id,
    public.current_has_blessing_iou_permission(p_club_id, 'blessing_iou.manage')
  );
end;
$$;

create or replace function public.delete_blessing_iou_entry(
  p_club_id uuid,
  p_entry_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.blessing_iou_entries;
  actor_is_author boolean;
  can_manage boolean := public.current_has_blessing_iou_permission(p_club_id, 'blessing_iou.manage');
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if actor_id is null or p_entry_id is null then
    raise exception using errcode = '22023', message = 'invalid_blessing_iou_delete';
  end if;

  select entry.* into target
  from public.blessing_iou_entries as entry
  where entry.id = p_entry_id
    and entry.club_id = p_club_id
    and entry.entry_status = 'active'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'blessing_iou_entry_not_available';
  end if;

  actor_is_author := target.author_app_account_id = actor_id;
  if actor_is_author then
    if not public.current_has_active_blessing_iou_membership(p_club_id) then
      raise exception using errcode = '42501', message = 'active_blessing_iou_membership_required';
    end if;
    normalized_reason := 'member_deleted';
  elsif not can_manage then
    raise exception using errcode = '42501', message = 'blessing_iou_manage_required';
  elsif normalized_reason is null or char_length(normalized_reason) > 300 then
    raise exception using errcode = '22023', message = 'blessing_iou_delete_reason_required';
  end if;

  update public.blessing_iou_entries
  set entry_status = 'deleted',
      deleted_by_app_account_id = actor_id,
      deleted_at = now(),
      deletion_reason = normalized_reason
  where id = target.id;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id,
    actor_id,
    case when actor_is_author then 'blessing_iou.member_deleted' else 'blessing_iou.manager_deleted' end,
    'blessing_iou_entry',
    target.id,
    jsonb_build_object('reason', normalized_reason, 'had_pledge', target.pledged_amount is not null)
  );
end;
$$;

create or replace function public.get_blessing_iou_management_context(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  result jsonb;
begin
  if not public.current_has_blessing_iou_permission(p_club_id, 'blessing_iou.manage') then
    raise exception using errcode = '42501', message = 'blessing_iou_manage_required';
  end if;
  select jsonb_build_object(
    'club_id', club.id,
    'club_code', club.club_code,
    'club_name', club.club_name,
    'allow_public_amounts', coalesce(setting.allow_public_amounts, false)
  ) into result
  from public.clubs as club
  left join public.club_blessing_iou_settings as setting on setting.club_id = club.id
  where club.id = p_club_id and club.club_status = 'active';
  if result is null then
    raise exception using errcode = 'P0002', message = 'club_not_available';
  end if;
  return result;
end;
$$;

create or replace function public.set_blessing_iou_amount_visibility(
  p_club_id uuid,
  p_allow_public_amounts boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  previous_value boolean := false;
begin
  if actor_id is null
     or not public.current_has_blessing_iou_permission(p_club_id, 'blessing_iou.manage') then
    raise exception using errcode = '42501', message = 'blessing_iou_manage_required';
  end if;
  if p_allow_public_amounts is null then
    raise exception using errcode = '22023', message = 'invalid_blessing_iou_setting';
  end if;

  select setting.allow_public_amounts into previous_value
  from public.club_blessing_iou_settings as setting
  where setting.club_id = p_club_id
  for update;
  previous_value := coalesce(previous_value, false);

  insert into public.club_blessing_iou_settings (
    club_id, allow_public_amounts, updated_by_app_account_id
  ) values (
    p_club_id, p_allow_public_amounts, actor_id
  )
  on conflict (club_id) do update
    set allow_public_amounts = excluded.allow_public_amounts;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id,
    actor_id,
    'blessing_iou.amount_visibility_updated',
    'club',
    p_club_id,
    jsonb_build_object('before', previous_value, 'after', p_allow_public_amounts)
  );

  return public.get_blessing_iou_management_context(p_club_id);
end;
$$;

revoke all on function public.current_has_active_blessing_iou_membership(uuid)
  from public, anon, authenticated;
revoke all on function public.current_has_blessing_iou_permission(uuid, text)
  from public, anon, authenticated;
revoke all on function public.normalize_blessing_iou_text(text)
  from public, anon, authenticated;
revoke all on function public.set_club_blessing_iou_settings_actor()
  from public, anon, authenticated;
revoke all on function public.protect_blessing_iou_entry_update()
  from public, anon, authenticated;
revoke all on function public.prevent_blessing_iou_entry_hard_delete()
  from public, anon, authenticated;
revoke all on function public.project_blessing_iou_entry(public.blessing_iou_entries, uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.list_my_blessing_iou_clubs()
  from public, anon;
revoke all on function public.list_blessing_iou_entries(uuid, timestamptz, uuid, integer)
  from public, anon;
revoke all on function public.create_blessing_iou_entry(uuid, text, numeric, boolean)
  from public, anon;
revoke all on function public.update_own_blessing_iou_entry(uuid, uuid, text, numeric, boolean)
  from public, anon;
revoke all on function public.delete_blessing_iou_entry(uuid, uuid, text)
  from public, anon;
revoke all on function public.get_blessing_iou_management_context(uuid)
  from public, anon;
revoke all on function public.set_blessing_iou_amount_visibility(uuid, boolean)
  from public, anon;

grant execute on function public.list_my_blessing_iou_clubs() to authenticated;
grant execute on function public.list_blessing_iou_entries(uuid, timestamptz, uuid, integer) to authenticated;
grant execute on function public.create_blessing_iou_entry(uuid, text, numeric, boolean) to authenticated;
grant execute on function public.update_own_blessing_iou_entry(uuid, uuid, text, numeric, boolean) to authenticated;
grant execute on function public.delete_blessing_iou_entry(uuid, uuid, text) to authenticated;
grant execute on function public.get_blessing_iou_management_context(uuid) to authenticated;
grant execute on function public.set_blessing_iou_amount_visibility(uuid, boolean) to authenticated;

commit;
