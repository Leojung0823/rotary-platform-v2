begin;

-- Birthday visibility is public by default. An explicit false remains private;
-- changing the column default must not overwrite an existing choice.
alter table public.birthday_visibility_preferences
  alter column is_listed set default true,
  alter column allow_wishes set default true;

comment on table public.birthday_visibility_preferences is
  'Explicit, club-scoped birthday month/day opt-out. New memberships default to public; an explicit false stays private. Birth year is never projected.';

-- Do not backfill missing rows. In V1, a missing preference means private;
-- making those people public without notice would violate their existing
-- privacy choice. They become public only after they explicitly save a new
-- preference (or when a genuinely new membership receives its default row).

-- Keep future memberships with a birthday aligned with the same default. This
-- is a database invariant, not a browser convenience, so it also covers
-- admin/RPC-created memberships and prevents the scheduler from silently
-- dropping new members. A membership without a birth date is intentionally
-- left row-less until the person provides one.
create or replace function public.ensure_birthday_visibility_preference()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
    from public.people as person
    where person.id = new.person_id
      and person.birth_date is not null
  ) then
    insert into public.birthday_visibility_preferences (
      membership_id,
      club_id,
      is_listed,
      allow_wishes
    ) values (
      new.id,
      new.club_id,
      true,
      true
    )
    on conflict (membership_id) do nothing;
  end if;

  return new;
end;
$$;

create trigger club_memberships_ensure_birthday_visibility_preference
after insert on public.club_memberships
for each row execute function public.ensure_birthday_visibility_preference();

-- The member settings page needs all of the current person's club-scoped
-- settings in one RPC. It deliberately returns no account, LINE, or other
-- private identifiers beyond the membership/club IDs already needed by the
-- protected preference mutation.
create or replace function public.get_my_birthday_preferences()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  result jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'birthday_authentication_required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'membership_id', membership.id,
    'club_id', club.id,
    'club_code', club.club_code,
    'club_name', club.club_name,
    'has_birth_date', person.birth_date is not null,
    'has_preference', preference.membership_id is not null,
    'is_listed', coalesce(preference.is_listed, false),
    'allow_wishes', coalesce(preference.allow_wishes, false)
  ) order by club.club_name, club.id), '[]'::jsonb)
  into result
  from public.app_accounts as account
  join public.people as person
    on person.id = account.person_id
  join public.club_memberships as membership
    on membership.person_id = person.id
   and membership.membership_status = 'active'
  join public.clubs as club
    on club.id = membership.club_id
   and club.club_status = 'active'
  left join public.birthday_visibility_preferences as preference
    on preference.membership_id = membership.id
   and preference.club_id = membership.club_id
  where account.id = actor_id
    and account.account_status = 'active';

  return result;
end;
$$;

revoke all on function public.ensure_birthday_visibility_preference() from public, anon, authenticated;
revoke all on function public.get_my_birthday_preferences() from public, anon;
grant execute on function public.get_my_birthday_preferences() to authenticated;

commit;
