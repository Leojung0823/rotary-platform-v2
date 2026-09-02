begin;

-- A follow event already creates the follower row in the webhook route. This
-- trusted RPC only fills the person/account projection when LINE Login gives us
-- an exact provider-subject match. It deliberately has no browser-facing grant.
create or replace function public.auto_pair_line_oa_follower(
  p_line_oa_account_id uuid,
  p_club_id uuid,
  p_oa_user_id text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  normalized_oa_user_id text := nullif(btrim(coalesce(p_oa_user_id, '')), '');
  target_follower public.line_oa_followers;
  matched_identity public.line_identities;
begin
  if p_line_oa_account_id is null
     or p_club_id is null
     or normalized_oa_user_id is null then
    return 'no_match';
  end if;

  -- Auto-pairing is all-or-nothing. A missing row, a disabled row, or a
  -- partial rollout must never make an unauthenticated webhook pair a person.
  -- Each deployed database is environment-specific; the protected rollout
  -- mutation controls the environment scope and this RPC requires a full
  -- rollout before it acts.
  if not exists (
    select 1
    from public.platform_feature_flags as flag
    where flag.feature_key = 'line_oa_auto_pairing_v1'
      and flag.enabled = true
      and flag.rollout_percentage = 100
      and cardinality(flag.enabled_environments) > 0
  ) then
    return 'disabled';
  end if;

  if not exists (
    select 1
    from public.line_oa_accounts as account
    where account.id = p_line_oa_account_id
      and account.club_id = p_club_id
      and account.account_status <> 'disabled'
  ) then
    return 'no_match';
  end if;

  -- Lock the row before deciding whether it has already been paired. A
  -- re-follow therefore cannot race an operator's manual pairing.
  select follower.*
  into target_follower
  from public.line_oa_followers as follower
  where follower.line_oa_account_id = p_line_oa_account_id
    and follower.club_id = p_club_id
    and follower.oa_user_id = normalized_oa_user_id
  for update;

  if not found then
    return 'no_match';
  end if;
  if target_follower.person_id is not null then
    return 'already_paired';
  end if;
  if target_follower.follower_status <> 'following' then
    return 'no_match';
  end if;

  -- provider_subject is the stable LINE user ID shared by channels under the
  -- same provider. Never use names, pictures, email, phone or other guesses.
  select identity.*
  into matched_identity
  from public.line_identities as identity
  join public.app_accounts as account
    on account.id = identity.app_account_id
   and account.person_id = identity.person_id
   and account.account_status = 'active'
  join public.people as person on person.id = identity.person_id
  where identity.provider_subject = normalized_oa_user_id
    and identity.identity_status = 'active'
  for update;

  if not found then
    return 'no_match';
  end if;

  if not exists (
    select 1
    from public.club_memberships as membership
    where membership.club_id = p_club_id
      and membership.person_id = matched_identity.person_id
      and membership.membership_status = 'active'
  ) then
    return 'no_match';
  end if;

  -- The partial unique index is the final protection. Serializing by account
  -- and person lets us return the documented conflict status instead of
  -- allowing two simultaneous follow events to race into an exception.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_line_oa_account_id::text || ':' || matched_identity.person_id::text,
      0
    )
  );

  if exists (
    select 1
    from public.line_oa_followers as other_follower
    where other_follower.line_oa_account_id = p_line_oa_account_id
      and other_follower.person_id = matched_identity.person_id
      and other_follower.follower_status = 'following'
      and other_follower.id <> target_follower.id
  ) then
    return 'conflict';
  end if;

  update public.line_oa_followers
  set person_id = matched_identity.person_id,
      app_account_id = matched_identity.app_account_id,
      follower_status = 'following',
      paired_at = now(),
      unpaired_at = null,
      updated_at = now()
  where id = target_follower.id
    and person_id is null;

  if not found then
    if exists (
      select 1
      from public.line_oa_followers as follower
      where follower.id = target_follower.id
        and follower.person_id is not null
    ) then
      return 'already_paired';
    end if;
    return 'no_match';
  end if;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id
  ) values (
    p_club_id, null, 'line_oa.auto_paired', 'line_oa_follower', target_follower.id
  );

  return 'paired';
exception
  when unique_violation then
    -- The partial unique index may still be the first observer of a concurrent
    -- pair. The update and audit insert are rolled back with the exception.
    return 'conflict';
end;
$$;

comment on function public.auto_pair_line_oa_follower(uuid, uuid, text) is
  'Trusted exact-match LINE OA follow pairing. Returns a status and never exposes LINE identifiers in audit metadata.';

revoke all on function public.auto_pair_line_oa_follower(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.auto_pair_line_oa_follower(uuid, uuid, text)
  to service_role;

commit;
