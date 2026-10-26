begin;

-- Deployment-created defaults are auditable without impersonating a human
-- platform administrator. A null actor UUID with actor_kind = 'system' records
-- a database migration; all existing user audit rows remain actor_kind = 'user'.
alter table public.platform_feature_flags
  alter column updated_by drop not null,
  add column updated_by_kind text not null default 'user',
  add constraint platform_feature_flags_updated_by_kind_check
    check (updated_by_kind in ('user', 'system')),
  add constraint platform_feature_flags_updated_by_identity_check
    check (
      (updated_by_kind = 'user' and updated_by is not null)
      or (updated_by_kind = 'system' and updated_by is null)
    );

alter table public.platform_feature_flag_audit
  alter column actor_identifier_snapshot drop not null,
  add column actor_kind text not null default 'user',
  add constraint platform_feature_flag_audit_actor_kind_check
    check (actor_kind in ('user', 'system')),
  add constraint platform_feature_flag_audit_actor_identity_check
    check (
      (actor_kind = 'user' and actor_identifier_snapshot is not null)
      or (actor_kind = 'system' and actor_identifier_snapshot is null)
    );

comment on column public.platform_feature_flags.updated_by_kind is
  'user identifies an authenticated platform administrator; system identifies an audited deployment migration.';
comment on column public.platform_feature_flag_audit.actor_kind is
  'user identifies an authenticated platform administrator; system identifies an audited deployment migration.';

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
    if session_user not in ('postgres', 'supabase_admin') then
      raise exception using errcode = '42501', message = 'platform_feature_flag_actor_required';
    end if;
    new.updated_by := null;
    new.updated_by_kind := 'system';
  else
    new.updated_by := actor_id;
    new.updated_by_kind := 'user';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.append_platform_feature_flag_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_kind text := 'user';
  before_value jsonb;
  after_value jsonb;
begin
  if actor_id is null then
    if session_user not in ('postgres', 'supabase_admin') then
      raise exception using errcode = '42501', message = 'platform_feature_flag_actor_required';
    end if;
    actor_kind := 'system';
  end if;

  if tg_op = 'INSERT' then
    insert into public.platform_feature_flag_audit (
      feature_key, action_type, before_configuration, after_configuration,
      actor_identifier_snapshot, actor_kind
    ) values (
      new.feature_key, 'created', null, public.platform_feature_flag_configuration(new), actor_id, actor_kind
    );
    return new;
  end if;

  before_value := public.platform_feature_flag_configuration(old);
  after_value := public.platform_feature_flag_configuration(new);
  if old.enabled is distinct from new.enabled then
    insert into public.platform_feature_flag_audit (
      feature_key, action_type, before_configuration, after_configuration,
      actor_identifier_snapshot, actor_kind
    ) values (
      new.feature_key,
      case when new.enabled then 'enabled' else 'disabled' end,
      before_value,
      after_value,
      actor_id,
      actor_kind
    );
  end if;
  if old.enabled_environments is distinct from new.enabled_environments then
    insert into public.platform_feature_flag_audit (
      feature_key, action_type, before_configuration, after_configuration,
      actor_identifier_snapshot, actor_kind
    ) values (
      new.feature_key, 'enabled_environments_changed', before_value, after_value, actor_id, actor_kind
    );
  end if;
  if old.rollout_percentage is distinct from new.rollout_percentage then
    insert into public.platform_feature_flag_audit (
      feature_key, action_type, before_configuration, after_configuration,
      actor_identifier_snapshot, actor_kind
    ) values (
      new.feature_key, 'rollout_percentage_changed', before_value, after_value, actor_id, actor_kind
    );
  end if;
  return new;
end;
$$;

-- The Joy Wall domain is introduced by this release. Seed its enabled default
-- as part of deployment so members never need a separate manual flag command.
-- Preserve a deliberate pre-existing operator disable if one exists.
insert into public.platform_feature_flags (
  feature_key, enabled, enabled_environments, rollout_percentage
) values (
  'joy_wall_v1', true, array['local', 'staging', 'production'], 100
)
on conflict (feature_key) do nothing;

commit;
