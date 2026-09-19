begin;

-- A failed scheduled push has no browser action that can display the error.
-- Keep the warning in the existing push log and expose only the latest
-- message-delivery quota failure to an OA manager.  This deliberately does not
-- create a club-wide message: ordinary members must not see an operational
-- warning meant for officers.
create or replace function public.get_line_oa_quota_notice(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  latest_push public.line_push_logs;
  summary jsonb;
  batch_count integer := 0;
  sent_batch_count integer := 0;
  delivered_recipient_count integer := 0;
begin
  if p_club_id is null
     or not public.current_has_club_permission(p_club_id, 'oa.read') then
    raise exception using errcode = '42501', message = 'oa_read_required';
  end if;

  -- Rich Menu calls also use line_push_logs, but they are not member-message
  -- quota alerts.  A later Rich Menu failure must not hide a message warning,
  -- and a Rich Menu 429 must not be described as a push failure.
  select push.*
  into latest_push
  from public.line_push_logs as push
  where push.club_id = p_club_id
    and push.push_kind in ('broadcast', 'multicast', 'push', 'reply')
  order by push.created_at desc, push.id desc
  limit 1;

  if not found or latest_push.failure_code is distinct from 'rate_limited' then
    return null;
  end if;

  summary := coalesce(latest_push.payload_summary, '{}'::jsonb);
  batch_count := case
    when coalesce(summary ->> 'batch_count', '') ~ '^[0-9]+$'
      then (summary ->> 'batch_count')::integer
    else 0
  end;
  sent_batch_count := case
    when coalesce(summary ->> 'sent_batch_count', '') ~ '^[0-9]+$'
      then (summary ->> 'sent_batch_count')::integer
    else 0
  end;
  delivered_recipient_count := case
    when coalesce(summary ->> 'delivered_recipient_count', '') ~ '^[0-9]+$'
      then (summary ->> 'delivered_recipient_count')::integer
    else 0
  end;

  return jsonb_build_object(
    'failure_code', 'rate_limited',
    'created_at', latest_push.created_at,
    'recipient_count', greatest(latest_push.recipient_count, 0),
    'batch_count', greatest(batch_count, 0),
    'sent_batch_count', greatest(sent_batch_count, 0),
    'delivered_recipient_count', greatest(delivered_recipient_count, 0)
  );
end;
$$;

comment on function public.get_line_oa_quota_notice(uuid) is
  'Returns the latest member-message quota warning to an OA manager; ordinary members cannot call it.';

revoke all on function public.get_line_oa_quota_notice(uuid) from public, anon, authenticated;
grant execute on function public.get_line_oa_quota_notice(uuid) to authenticated;

commit;
