begin;

-- The application checks environment and rollout rules before rendering a
-- birthday surface. Keep the database boundary fail-closed as well: when a
-- birthday flag is absent or disabled, authenticated callers must not retain
-- EXECUTE on the feature's browser-facing RPCs. Service-role scheduler RPCs
-- are intentionally not changed here.
create or replace function public.sync_birthday_feature_execution_privileges(
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
  if p_feature_key = 'birthday_wishes_v2' then
    function_signatures := array[
      'public.get_my_birthday_page_v2(uuid)',
      'public.set_my_birthday_preference_v2(uuid, boolean, boolean)',
      'public.create_birthday_wish_v2(uuid, uuid, text)',
      'public.update_own_birthday_wish_v2(uuid, uuid, text)',
      'public.delete_own_birthday_wish_v2(uuid, uuid)'
    ];
  elsif p_feature_key = 'birthday_wishes_collection_v1' then
    function_signatures := array[
      'public.list_birthday_wish_question_bank(uuid)',
      'public.create_birthday_wish_question(uuid, text, text, text, integer)',
      'public.update_birthday_wish_question(uuid, uuid, text, text, integer, boolean)',
      'public.create_birthday_wish_assignment_batch(uuid, integer, integer)',
      'public.create_birthday_wish_campaign(uuid, uuid, integer, date, uuid)',
      'public.assign_birthday_wish_participant(uuid, uuid, uuid, uuid, uuid)',
      'public.generate_birthday_wish_collection_month(uuid, integer, integer)',
      'public.save_birthday_wish_submission(uuid, uuid, text)',
      'public.delete_own_birthday_wish_submission(uuid, uuid)',
      'public.get_my_birthday_wish_collection_page(uuid)',
      'public.publish_birthday_wish_submission(uuid, uuid)',
      'public.list_published_birthday_wish_submissions(uuid)',
      'public.hide_birthday_wish_submission(uuid, uuid)',
      'public.decline_birthday_wish_assignment(uuid, uuid)'
    ];
  else
    return;
  end if;

  foreach function_signature in array function_signatures loop
    if coalesce(p_enabled, false) then
      execute 'grant execute on function ' || function_signature || ' to authenticated';
    else
      execute 'revoke execute on function ' || function_signature || ' from authenticated';
    end if;
  end loop;
end;
$$;

create or replace function public.sync_birthday_feature_execution_privileges_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_birthday_feature_execution_privileges(old.feature_key, false);
    return old;
  end if;

  perform public.sync_birthday_feature_execution_privileges(new.feature_key, new.enabled);
  return new;
end;
$$;

drop trigger if exists platform_feature_flags_sync_birthday_execution_privileges
  on public.platform_feature_flags;

create trigger platform_feature_flags_sync_birthday_execution_privileges
after insert or update or delete on public.platform_feature_flags
for each row execute function public.sync_birthday_feature_execution_privileges_trigger();

-- Missing rows are a disabled state. Revoke first so a fresh deployment does
-- not inherit the grants from the earlier birthday migrations.
select public.sync_birthday_feature_execution_privileges('birthday_wishes_v2', false);
select public.sync_birthday_feature_execution_privileges('birthday_wishes_collection_v1', false);

do $$
declare
  feature_flag record;
begin
  for feature_flag in
    select feature_key, enabled
    from public.platform_feature_flags
    where feature_key in ('birthday_wishes_v2', 'birthday_wishes_collection_v1')
  loop
    perform public.sync_birthday_feature_execution_privileges(
      feature_flag.feature_key,
      feature_flag.enabled
    );
  end loop;
end;
$$;

revoke all on function public.sync_birthday_feature_execution_privileges(text, boolean)
  from public, anon, authenticated;
revoke all on function public.sync_birthday_feature_execution_privileges_trigger()
  from public, anon, authenticated;

commit;
