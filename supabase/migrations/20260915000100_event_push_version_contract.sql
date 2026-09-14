begin;

-- 20260914001000 introduced the versioned event-push function, but it left
-- the old seven-argument overload in place. That overload is still the one
-- selected when a caller omits p_event_version, and the feature-flag sync
-- function still granted it. Remove the stale overload so there is one
-- callable event-push contract.
drop function if exists public.record_club_event_line_push(
  uuid, uuid, integer, jsonb, text, text, text
);

-- The versioned overload was granted directly by the previous migration. Make
-- its privilege state fail closed before reapplying the flag's real state.
revoke all on function public.record_club_event_line_push(
  uuid, uuid, integer, jsonb, text, text, text, integer
) from public, anon, authenticated;

-- Keep the existing audited feature-flag hook, but point it at the only
-- versioned event-push overload. The list is deliberately explicit: this
-- function is a security boundary, not a generic grant helper.
create or replace function public.sync_line_oa_push_execution_privileges(
  p_feature_key text,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  function_signature text;
  function_signatures text[];
begin
  if p_feature_key <> 'line_oa_event_push_v1' then
    return;
  end if;

  function_signatures := array[
    'public.list_club_message_line_targets(uuid, uuid)',
    'public.record_club_message_line_push(uuid, uuid, integer, jsonb, text, text, text)',
    'public.list_club_event_line_targets(uuid, uuid)',
    'public.record_club_event_line_push(uuid, uuid, integer, jsonb, text, text, text, integer)'
  ];

  foreach function_signature in array function_signatures loop
    if p_enabled then
      execute 'grant execute on function ' || function_signature || ' to authenticated';
    else
      execute 'revoke execute on function ' || function_signature || ' from authenticated';
    end if;
  end loop;
end;
$$;

-- Reconcile both states: local reset normally starts disabled, while a hosted
-- database may already have the flag enabled before this repair migration.
select public.sync_line_oa_push_execution_privileges('line_oa_event_push_v1', false);

do $$
declare
  feature_flag record;
begin
  for feature_flag in
    select feature_key, enabled
    from public.platform_feature_flags
    where feature_key = 'line_oa_event_push_v1'
  loop
    perform public.sync_line_oa_push_execution_privileges(feature_flag.feature_key, feature_flag.enabled);
  end loop;
end;
$$;

commit;
