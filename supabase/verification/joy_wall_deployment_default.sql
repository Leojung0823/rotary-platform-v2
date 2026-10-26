do $$
begin
  if not exists (
    select 1
    from public.platform_feature_flags as flag
    where flag.feature_key = 'joy_wall_v1'
      and flag.enabled
      and flag.enabled_environments = array['local', 'staging', 'production']::text[]
      and flag.rollout_percentage = 100
      and flag.updated_by is null
      and flag.updated_by_kind = 'system'
  ) then
    raise exception 'Joy Wall deployment default is not automatically enabled or system-audited';
  end if;

  if not exists (
    select 1
    from public.platform_feature_flag_audit as audit
    where audit.feature_key = 'joy_wall_v1'
      and audit.action_type = 'created'
      and audit.actor_identifier_snapshot is null
      and audit.actor_kind = 'system'
      and audit.after_configuration = jsonb_build_object(
        'feature_key', 'joy_wall_v1',
        'enabled', true,
        'enabled_environments', array['local', 'staging', 'production']::text[],
        'rollout_percentage', 100
      )
  ) then
    raise exception 'Joy Wall system-migration audit record is missing';
  end if;
end $$;
