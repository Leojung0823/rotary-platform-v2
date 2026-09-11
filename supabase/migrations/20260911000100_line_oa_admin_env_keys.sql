begin;

-- The values are environment-variable names, not credentials. Expose only
-- the two names used by the server so an OA manager can configure hosting
-- without putting a token or secret in the database response.
create or replace function public.get_line_oa_admin(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare result jsonb;
begin
  if not public.current_has_club_permission(p_club_id, 'oa.read') then
    raise exception using errcode = '42501', message = 'oa_read_required';
  end if;
  select jsonb_build_object(
    'account', (select jsonb_build_object('id', account.id, 'display_name', account.display_name,
      'basic_id', account.basic_id, 'channel_id', account.channel_id, 'rich_menu_id', account.rich_menu_id,
      'access_token_env_key', account.access_token_env_key,
      'webhook_secret_env_key', account.webhook_secret_env_key,
      'status', account.account_status) from public.line_oa_accounts as account
      where account.club_id = p_club_id and account.account_status <> 'disabled' limit 1),
    'followers', coalesce((select jsonb_agg(jsonb_build_object('id', follower.id, 'oa_user_id', follower.oa_user_id,
      'status', follower.follower_status, 'person_id', follower.person_id, 'display_name', person.canonical_name,
      'paired_at', follower.paired_at) order by follower.updated_at desc)
      from public.line_oa_followers as follower left join public.people as person on person.id = follower.person_id
      where follower.club_id = p_club_id), '[]'::jsonb),
    'push_logs', coalesce((select jsonb_agg(jsonb_build_object('id', push.id, 'kind', push.push_kind,
      'recipient_count', push.recipient_count, 'status', push.delivery_status, 'created_at', push.created_at)
      order by push.created_at desc) from (select * from public.line_push_logs where club_id = p_club_id order by created_at desc limit 30) as push), '[]'::jsonb),
    'webhooks', coalesce((select jsonb_agg(jsonb_build_object('id', webhook.id, 'event_type', webhook.event_type,
      'signature_valid', webhook.signature_valid, 'status', webhook.processing_status, 'received_at', webhook.received_at)
      order by webhook.received_at desc) from (select * from public.line_webhooks where club_id = p_club_id order by received_at desc limit 30) as webhook), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

commit;
