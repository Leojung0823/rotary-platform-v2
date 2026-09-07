begin;

-- A member can meet the club's official account in either order: add it as a
-- friend first and bind LINE Login later, or bind first and add it after. The
-- follow event pairs on the spot when an identity already exists; this covers
-- the other order, where the follower row has been sitting unpaired because the
-- platform had no identity to match it against yet.
--
-- Service-role only. It is called from the LINE callback after a successful
-- bind, where there is no end-user session to authorise against, so it derives
-- everything from the subject it is given and never trusts a caller-supplied
-- club or person.
create or replace function public.pair_line_oa_followers_for_subject(
  p_provider_subject text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  normalized_subject text := nullif(btrim(coalesce(p_provider_subject, '')), '');
  candidate record;
  outcome text;
  paired_count integer := 0;
begin
  if normalized_subject is null then
    return 0;
  end if;

  -- Only rows that are still waiting: following, unpaired, and belonging to an
  -- account that is not disabled. auto_pair_line_oa_follower re-checks all of
  -- this, and the feature flag, before it changes anything.
  for candidate in
    select follower.line_oa_account_id, follower.club_id
    from public.line_oa_followers as follower
    join public.line_oa_accounts as account
      on account.id = follower.line_oa_account_id
     and account.account_status <> 'disabled'
    where follower.oa_user_id = normalized_subject
      and follower.follower_status = 'following'
      and follower.person_id is null
  loop
    outcome := public.auto_pair_line_oa_follower(
      candidate.line_oa_account_id,
      candidate.club_id,
      normalized_subject
    );
    if outcome = 'paired' then
      paired_count := paired_count + 1;
    end if;
  end loop;

  return paired_count;
end;
$$;

comment on function public.pair_line_oa_followers_for_subject(text) is
  'Retries exact-match pairing for followers that were waiting on a LINE Login identity. Service-role only; returns how many were paired.';

revoke all on function public.pair_line_oa_followers_for_subject(text)
  from public, anon, authenticated;
grant execute on function public.pair_line_oa_followers_for_subject(text) to service_role;

commit;
