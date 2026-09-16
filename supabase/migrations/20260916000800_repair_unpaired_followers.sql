begin;

-- 把已經追蹤、但還沒配對的 follower 一次配完。
--
-- Auto-pairing runs on the follow event. Everyone who added the OA before it
-- was switched on is therefore still unpaired, and the only way through was one
-- row at a time on the LINE OA page -- for a club that asked its whole roster
-- to add the OA, that is the whole roster.
--
-- It reuses auto_pair_line_oa_follower rather than repeating the match, so
-- there is exactly one rule for who a follower is. That also means it inherits
-- the feature flag: with auto-pairing off this reports 'disabled' and changes
-- nothing, which is the honest answer rather than a second, quieter door.

create or replace function public.pair_unpaired_line_oa_followers(p_club_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  account_id uuid;
  candidate record;
  outcome text;
  paired integer := 0;
  unmatched integer := 0;
  conflicted integer := 0;
  blocked boolean := false;
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'oa.manage') then
    raise exception using errcode = '42501', message = 'oa_manage_required';
  end if;

  select account.id into account_id
  from public.line_oa_accounts as account
  where account.club_id = p_club_id
    and account.account_status <> 'disabled'
  order by account.created_at
  limit 1;
  if account_id is null then
    raise exception using errcode = 'P0002', message = 'line_oa_account_not_available';
  end if;

  -- Bounded: a run answers for a page of followers rather than holding a lock
  -- over an unbounded set. Pressing it again continues.
  for candidate in
    select follower.oa_user_id
    from public.line_oa_followers as follower
    where follower.line_oa_account_id = account_id
      and follower.club_id = p_club_id
      and follower.person_id is null
      and follower.follower_status = 'following'
    order by follower.followed_at, follower.id
    limit 200
  loop
    outcome := public.auto_pair_line_oa_follower(account_id, p_club_id, candidate.oa_user_id);
    if outcome = 'paired' then paired := paired + 1;
    elsif outcome = 'conflict' then conflicted := conflicted + 1;
    elsif outcome = 'disabled' then blocked := true;
    else unmatched := unmatched + 1;
    end if;
  end loop;

  -- The webhook's own audit rows carry no actor, because a follow event has
  -- none. This one does: an officer asked for it.
  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'line_oa.bulk_paired', 'line_oa_account', account_id,
    jsonb_build_object(
      'paired', paired, 'unmatched', unmatched, 'conflicted', conflicted, 'blocked', blocked
    )
  );

  return jsonb_build_object(
    'paired', paired,
    -- Someone whose LINE Login is not bound, or who is not an active member of
    -- this club, cannot be matched by an id nobody holds. That is a fact about
    -- them, not a failure of the run.
    'unmatched', unmatched,
    'conflicted', conflicted,
    'blocked', blocked
  );
end;
$$;

revoke all on function public.pair_unpaired_line_oa_followers(uuid) from public, anon;
grant execute on function public.pair_unpaired_line_oa_followers(uuid) to authenticated;

commit;
