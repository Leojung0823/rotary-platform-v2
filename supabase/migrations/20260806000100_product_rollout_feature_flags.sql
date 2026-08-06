begin;

create table public.platform_feature_flags (
  feature_key text primary key check (feature_key in (
    'role_context_v2',
    'role_shells_v2',
    'member_home_v2',
    'checkin_qr_v2',
    'checkin_gps_v2',
    'attendance_ui_v2',
    'announcements_v09'
  )),
  enabled boolean not null default false,
  enabled_environments text[] not null default '{}'::text[]
    check (enabled_environments <@ array['local', 'staging', 'production']::text[]),
  rollout_percentage smallint not null default 0
    check (rollout_percentage between 0 and 100),
  updated_by uuid not null references public.app_accounts(id) on delete restrict,
  updated_at timestamptz not null default now()
);

comment on table public.platform_feature_flags is
  'Server-authoritative rollout configuration. Direct browser table mutation is forbidden.';

create index platform_feature_flags_updated_at_idx
  on public.platform_feature_flags (updated_at desc);

alter table public.platform_feature_flags enable row level security;

revoke all on table public.platform_feature_flags from public, anon, authenticated;

create or replace function public.set_platform_feature_flag_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'platform_feature_flag_actor_required';
  end if;

  new.updated_by := actor_id;
  new.updated_at := now();
  return new;
end;
$$;

create trigger platform_feature_flags_set_updated_at
before insert or update on public.platform_feature_flags
for each row execute function public.set_platform_feature_flag_updated_at();

create or replace function public.get_platform_feature_flags()
returns table (
  feature_key text,
  enabled boolean,
  enabled_environments text[],
  rollout_percentage smallint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if public.current_app_account_id() is null then
    return;
  end if;

  return query
  select flag.feature_key, flag.enabled, flag.enabled_environments, flag.rollout_percentage
  from public.platform_feature_flags as flag
  order by flag.feature_key;
end;
$$;

revoke all on function public.set_platform_feature_flag_updated_at() from public, anon, authenticated;
revoke all on function public.get_platform_feature_flags() from public, anon, authenticated;
grant execute on function public.get_platform_feature_flags() to authenticated;

commit;
