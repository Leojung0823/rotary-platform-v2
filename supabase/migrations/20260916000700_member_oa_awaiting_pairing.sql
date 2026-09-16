begin;

-- 「未加入」把兩件不同的事說成同一句話。
--
-- The member list joins a follower row on person_id, so a member who added the
-- OA but has not been linked to a membership yet has no row to find and reads
-- as 「未加入」 -- and the club goes off asking them to add an OA they already
-- added. What they actually need is one click on the LINE OA page, or
-- line_oa_auto_pairing_v1 switched on.
--
-- The two are told apart by the same value auto-pairing matches on: the stable
-- LINE user ID a member's LINE Login identity carries, against the user id an
-- unpaired follower arrived with.
--
-- The return type gains a value, not a column, so the signature is unchanged
-- and every existing caller and verification file still matches.
--
-- Restated from the current definition with that one expression replaced.

create or replace function public.list_club_members(p_club_id uuid, p_query text default null, p_status text default null)
returns table (
  membership_id uuid, person_id uuid, app_account_id uuid, line_identity_id uuid, oa_follower_id uuid,
  display_name text, phone text, email text, birth_date date,
  membership_status text, role_key text, line_login_status text, oa_status text, created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select membership.id, person.id, account.id, identity.id, follower.id,
    person.canonical_name, person.primary_phone, person.primary_email, person.birth_date,
    membership.membership_status,
    coalesce((select assignment.role_key from public.club_role_assignments as assignment
      where assignment.club_id = membership.club_id and assignment.app_account_id = account.id
        and assignment.assignment_status = 'active'
      order by case assignment.role_key when 'president' then 1 when 'secretary' then 2 when 'finance' then 3 else 4 end
      limit 1), 'member'),
    case when identity.id is null then 'unbound' else identity.identity_status end,
    -- Three states, not two. A follower row with no person_id is somebody who
    -- added the OA and whom nobody has linked to a membership yet; the join
    -- above cannot see them, so every one of them read as 「未加入」 and the
    -- club went off asking people to add an OA they had already added.
    --
    -- provider_subject is the stable LINE user ID shared by channels under the
    -- same provider, which is the same value auto_pair_line_oa_follower
    -- matches on. Nothing else -- not a name, not a picture -- is used.
    case
      when follower.id is not null then follower.follower_status
      when exists (
        select 1
        from public.line_oa_followers as waiting
        where waiting.club_id = membership.club_id
          and waiting.person_id is null
          and waiting.follower_status = 'following'
          and waiting.oa_user_id = identity.provider_subject
      ) then 'awaiting_pairing'
      else 'unpaired'
    end,
    membership.created_at
  from public.club_memberships as membership
  join public.people as person on person.id = membership.person_id
  left join public.app_accounts as account on account.person_id = person.id
  left join public.line_identities as identity on identity.app_account_id = account.id and identity.identity_status = 'active'
  left join public.line_oa_followers as follower on follower.club_id = membership.club_id
    and follower.person_id = person.id and follower.follower_status = 'following'
  where membership.club_id = p_club_id
    and public.current_has_club_permission(p_club_id, 'member.read')
    and (p_status is null or membership.membership_status = p_status)
    -- Archived members live on their own page. They stay reachable here when a
    -- caller names the status explicitly, so the status filter keeps working.
    and (p_status is not null or membership.membership_status not in ('disabled', 'ended'))
    and (nullif(btrim(coalesce(p_query, '')), '') is null
      or person.canonical_name ilike '%' || btrim(p_query) || '%'
      or coalesce(person.primary_email, '') ilike '%' || btrim(p_query) || '%'
      or coalesce(person.primary_phone, '') ilike '%' || btrim(p_query) || '%')
  order by person.canonical_name, membership.id
$$;

commit;
