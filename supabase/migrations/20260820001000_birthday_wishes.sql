begin;

create table public.birthday_visibility_preferences (
  membership_id uuid primary key references public.club_memberships(id) on delete restrict,
  club_id uuid not null references public.clubs(id) on delete restrict,
  is_listed boolean not null default false,
  allow_wishes boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint birthday_visibility_wishes_require_listing check (is_listed or not allow_wishes)
);

comment on table public.birthday_visibility_preferences is
  'Explicit, club-scoped birthday month/day opt-in. Missing rows mean private. Birth year is never projected.';

create table public.birthday_wishes (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  recipient_membership_id uuid not null references public.club_memberships(id) on delete restrict,
  author_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  birthday_year integer not null default extract(year from current_date)::integer,
  content text not null,
  status text not null default 'active' check (status in ('active', 'deleted', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by_app_account_id uuid references public.app_accounts(id) on delete restrict,
  removal_reason text,
  constraint birthday_wishes_year_check check (birthday_year between 2000 and 2200),
  constraint birthday_wishes_content_check check (
    btrim(content) <> '' and char_length(content) between 1 and 500
  ),
  constraint birthday_wishes_removal_consistency check (
    (status = 'active' and removed_at is null and removed_by_app_account_id is null and removal_reason is null)
    or
    (status in ('deleted', 'hidden') and removed_at is not null and removed_by_app_account_id is not null and btrim(removal_reason) <> '')
  )
);

comment on table public.birthday_wishes is
  'Same-club birthday wishes. Tables are private; authenticated access is only through tenant-checking RPCs.';

create unique index birthday_wishes_one_active_per_author_year
  on public.birthday_wishes (club_id, recipient_membership_id, author_app_account_id, birthday_year)
  where status = 'active';

create index birthday_wishes_club_year_created_idx
  on public.birthday_wishes (club_id, birthday_year desc, created_at desc, id desc)
  where status = 'active';

create or replace function public.normalize_birthday_wish(p_content text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select btrim(regexp_replace(coalesce(p_content, ''), E'[\\t\\n\\r ]+', ' ', 'g'))
$$;

create or replace function public.current_birthday_membership_id(p_club_id uuid)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select membership.id
  from public.app_accounts as account
  join public.club_memberships as membership
    on membership.person_id = account.person_id
   and membership.club_id = p_club_id
   and membership.membership_status = 'active'
  join public.clubs as club
    on club.id = membership.club_id
   and club.club_status = 'active'
  where account.auth_user_id = auth.uid()
    and account.account_status = 'active'
  limit 1
$$;

create or replace function public.current_can_access_birthday_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.clubs as club
    where club.id = p_club_id
      and club.club_status = 'active'
      and (
        public.current_birthday_membership_id(p_club_id) is not null
        or public.current_can_manage_club(p_club_id)
      )
  )
$$;

create or replace function public.protect_birthday_preference()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  membership_club_id uuid;
begin
  select membership.club_id
  into membership_club_id
  from public.club_memberships as membership
  where membership.id = new.membership_id;

  if membership_club_id is null or membership_club_id <> new.club_id then
    raise exception using errcode = '23514', message = 'birthday_preference_membership_club_mismatch';
  end if;

  if tg_op = 'UPDATE' and (
    old.membership_id is distinct from new.membership_id
    or old.club_id is distinct from new.club_id
  ) then
    raise exception using errcode = '23514', message = 'birthday_preference_identity_immutable';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger birthday_visibility_preferences_protect
before insert or update on public.birthday_visibility_preferences
for each row execute function public.protect_birthday_preference();

create or replace function public.protect_birthday_wish()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  membership_club_id uuid;
begin
  select membership.club_id
  into membership_club_id
  from public.club_memberships as membership
  where membership.id = new.recipient_membership_id;

  if membership_club_id is null or membership_club_id <> new.club_id then
    raise exception using errcode = '23514', message = 'birthday_wish_recipient_club_mismatch';
  end if;

  if tg_op = 'UPDATE' then
    if old.club_id is distinct from new.club_id
       or old.recipient_membership_id is distinct from new.recipient_membership_id
       or old.author_app_account_id is distinct from new.author_app_account_id
       or old.birthday_year is distinct from new.birthday_year
       or old.created_at is distinct from new.created_at then
      raise exception using errcode = '23514', message = 'birthday_wish_identity_immutable';
    end if;

    if old.status <> 'active' then
      raise exception using errcode = '23514', message = 'removed_birthday_wish_immutable';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger birthday_wishes_protect
before insert or update on public.birthday_wishes
for each row execute function public.protect_birthday_wish();

create or replace function public.prevent_birthday_hard_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = '42501', message = 'birthday_hard_delete_forbidden';
end;
$$;

create trigger birthday_visibility_preferences_prevent_delete
before delete on public.birthday_visibility_preferences
for each row execute function public.prevent_birthday_hard_delete();

create trigger birthday_wishes_prevent_delete
before delete on public.birthday_wishes
for each row execute function public.prevent_birthday_hard_delete();

alter table public.birthday_visibility_preferences enable row level security;
alter table public.birthday_wishes enable row level security;
revoke all on table public.birthday_visibility_preferences from public, anon, authenticated;
revoke all on table public.birthday_wishes from public, anon, authenticated;

create or replace function public.get_my_birthday_page(p_club_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  selected_club_id uuid;
  actor_membership_id uuid;
  can_manage boolean := false;
  result jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'birthday_authentication_required';
  end if;

  if p_club_id is not null and not public.current_can_access_birthday_club(p_club_id) then
    raise exception using errcode = '42501', message = 'birthday_club_access_required';
  end if;

  select coalesce(p_club_id, accessible.club_id)
  into selected_club_id
  from (
    select club.id as club_id, club.club_name
    from public.clubs as club
    where club.club_status = 'active'
      and public.current_can_access_birthday_club(club.id)
    order by club.club_name, club.id
    limit 1
  ) as accessible;

  if selected_club_id is not null then
    actor_membership_id := public.current_birthday_membership_id(selected_club_id);
    can_manage := public.current_can_manage_club(selected_club_id);
  end if;

  select jsonb_build_object(
    'clubs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'club_id', club.id,
        'club_code', club.club_code,
        'club_name', club.club_name
      ) order by club.club_name, club.id)
      from public.clubs as club
      where club.club_status = 'active'
        and public.current_can_access_birthday_club(club.id)
    ), '[]'::jsonb),
    'selected_club_id', selected_club_id,
    'can_manage', can_manage,
    'my_preference', case when actor_membership_id is null then null else (
      select jsonb_build_object(
        'membership_id', membership.id,
        'has_birth_date', person.birth_date is not null,
        'is_listed', coalesce(preference.is_listed, false),
        'allow_wishes', coalesce(preference.allow_wishes, false)
      )
      from public.club_memberships as membership
      join public.people as person on person.id = membership.person_id
      left join public.birthday_visibility_preferences as preference
        on preference.membership_id = membership.id
      where membership.id = actor_membership_id
    ) end,
    'birthdays', case when selected_club_id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'membership_id', membership.id,
        'display_name', person.canonical_name,
        'avatar_url', person.avatar_url,
        'birth_month', extract(month from person.birth_date)::integer,
        'birth_day', extract(day from person.birth_date)::integer,
        'allow_wishes', preference.allow_wishes,
        'is_self', membership.id = actor_membership_id
      ) order by extract(month from person.birth_date), extract(day from person.birth_date), person.canonical_name)
      from public.birthday_visibility_preferences as preference
      join public.club_memberships as membership
        on membership.id = preference.membership_id
       and membership.club_id = selected_club_id
       and membership.membership_status = 'active'
      join public.people as person
        on person.id = membership.person_id
       and person.birth_date is not null
      where preference.club_id = selected_club_id
        and preference.is_listed = true
    ), '[]'::jsonb) end,
    'wishes', case when selected_club_id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', wish.id,
        'recipient_membership_id', wish.recipient_membership_id,
        'recipient_name', recipient.canonical_name,
        'author_name', author.account_display_name,
        'content', wish.content,
        'created_at', wish.created_at,
        'updated_at', wish.updated_at,
        'can_edit', wish.author_app_account_id = actor_id,
        'can_delete', wish.author_app_account_id = actor_id,
        'can_moderate', can_manage
      ) order by wish.created_at desc, wish.id desc)
      from public.birthday_wishes as wish
      join public.club_memberships as recipient_membership
        on recipient_membership.id = wish.recipient_membership_id
       and recipient_membership.club_id = selected_club_id
       and recipient_membership.membership_status = 'active'
      join public.people as recipient on recipient.id = recipient_membership.person_id
      join public.app_accounts as author on author.id = wish.author_app_account_id
      join public.birthday_visibility_preferences as preference
        on preference.membership_id = recipient_membership.id
       and preference.club_id = selected_club_id
       and preference.is_listed = true
      where wish.club_id = selected_club_id
        and wish.birthday_year = extract(year from current_date)::integer
        and wish.status = 'active'
      limit 200
    ), '[]'::jsonb) end
  ) into result;

  return result;
end;
$$;

create or replace function public.set_my_birthday_preference(
  p_club_id uuid,
  p_is_listed boolean,
  p_allow_wishes boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_membership_id uuid := public.current_birthday_membership_id(p_club_id);
  has_birth_date boolean;
begin
  if actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_birthday_membership_required';
  end if;

  select person.birth_date is not null
  into has_birth_date
  from public.club_memberships as membership
  join public.people as person on person.id = membership.person_id
  where membership.id = actor_membership_id;

  if coalesce(p_is_listed, false) and not coalesce(has_birth_date, false) then
    raise exception using errcode = '22023', message = 'birthday_birth_date_required';
  end if;

  insert into public.birthday_visibility_preferences (
    membership_id, club_id, is_listed, allow_wishes
  ) values (
    actor_membership_id,
    p_club_id,
    coalesce(p_is_listed, false),
    coalesce(p_is_listed, false) and coalesce(p_allow_wishes, false)
  )
  on conflict (membership_id) do update
  set is_listed = excluded.is_listed,
      allow_wishes = excluded.allow_wishes;
end;
$$;

create or replace function public.create_birthday_wish(
  p_club_id uuid,
  p_recipient_membership_id uuid,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_birthday_membership_id(p_club_id);
  normalized_content text := public.normalize_birthday_wish(p_content);
  created_id uuid;
begin
  if actor_id is null or actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_birthday_membership_required';
  end if;

  if p_recipient_membership_id is null or p_recipient_membership_id = actor_membership_id then
    raise exception using errcode = '22023', message = 'invalid_birthday_recipient';
  end if;

  if char_length(normalized_content) < 1 or char_length(normalized_content) > 500 then
    raise exception using errcode = '22023', message = 'invalid_birthday_wish_content';
  end if;

  if not exists (
    select 1
    from public.club_memberships as membership
    join public.people as person on person.id = membership.person_id
    join public.birthday_visibility_preferences as preference
      on preference.membership_id = membership.id
     and preference.club_id = p_club_id
     and preference.is_listed = true
     and preference.allow_wishes = true
    where membership.id = p_recipient_membership_id
      and membership.club_id = p_club_id
      and membership.membership_status = 'active'
      and person.birth_date is not null
  ) then
    raise exception using errcode = '42501', message = 'birthday_recipient_not_accepting_wishes';
  end if;

  insert into public.birthday_wishes (
    club_id, recipient_membership_id, author_app_account_id, birthday_year, content
  ) values (
    p_club_id,
    p_recipient_membership_id,
    actor_id,
    extract(year from current_date)::integer,
    normalized_content
  )
  returning id into created_id;

  return created_id;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'birthday_wish_already_exists';
end;
$$;

create or replace function public.update_own_birthday_wish(
  p_club_id uuid,
  p_wish_id uuid,
  p_content text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  normalized_content text := public.normalize_birthday_wish(p_content);
begin
  if actor_id is null or public.current_birthday_membership_id(p_club_id) is null then
    raise exception using errcode = '42501', message = 'active_birthday_membership_required';
  end if;

  if char_length(normalized_content) < 1 or char_length(normalized_content) > 500 then
    raise exception using errcode = '22023', message = 'invalid_birthday_wish_content';
  end if;

  update public.birthday_wishes
  set content = normalized_content
  where id = p_wish_id
    and club_id = p_club_id
    and author_app_account_id = actor_id
    and birthday_year = extract(year from current_date)::integer
    and status = 'active';

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_wish_not_available';
  end if;
end;
$$;

create or replace function public.delete_own_birthday_wish(p_club_id uuid, p_wish_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
begin
  if actor_id is null or public.current_birthday_membership_id(p_club_id) is null then
    raise exception using errcode = '42501', message = 'active_birthday_membership_required';
  end if;

  update public.birthday_wishes
  set status = 'deleted',
      removed_at = now(),
      removed_by_app_account_id = actor_id,
      removal_reason = 'author_deleted'
  where id = p_wish_id
    and club_id = p_club_id
    and author_app_account_id = actor_id
    and status = 'active';

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_wish_not_available';
  end if;
end;
$$;

create or replace function public.hide_birthday_wish(
  p_club_id uuid,
  p_wish_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  normalized_reason text := btrim(coalesce(p_reason, ''));
begin
  if actor_id is null
     or not public.current_can_access_birthday_club(p_club_id)
     or not public.current_can_manage_club(p_club_id) then
    raise exception using errcode = '42501', message = 'birthday_manager_required';
  end if;

  if char_length(normalized_reason) < 2 or char_length(normalized_reason) > 300 then
    raise exception using errcode = '22023', message = 'invalid_birthday_moderation_reason';
  end if;

  update public.birthday_wishes
  set status = 'hidden',
      removed_at = now(),
      removed_by_app_account_id = actor_id,
      removal_reason = normalized_reason
  where id = p_wish_id
    and club_id = p_club_id
    and status = 'active';

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_wish_not_available';
  end if;
end;
$$;

revoke all on function public.normalize_birthday_wish(text) from public, anon, authenticated;
revoke all on function public.current_birthday_membership_id(uuid) from public, anon, authenticated;
revoke all on function public.current_can_access_birthday_club(uuid) from public, anon, authenticated;
revoke all on function public.protect_birthday_preference() from public, anon, authenticated;
revoke all on function public.protect_birthday_wish() from public, anon, authenticated;
revoke all on function public.prevent_birthday_hard_delete() from public, anon, authenticated;
revoke all on function public.get_my_birthday_page(uuid) from public, anon;
revoke all on function public.set_my_birthday_preference(uuid, boolean, boolean) from public, anon;
revoke all on function public.create_birthday_wish(uuid, uuid, text) from public, anon;
revoke all on function public.update_own_birthday_wish(uuid, uuid, text) from public, anon;
revoke all on function public.delete_own_birthday_wish(uuid, uuid) from public, anon;
revoke all on function public.hide_birthday_wish(uuid, uuid, text) from public, anon;

grant execute on function public.get_my_birthday_page(uuid) to authenticated;
grant execute on function public.set_my_birthday_preference(uuid, boolean, boolean) to authenticated;
grant execute on function public.create_birthday_wish(uuid, uuid, text) to authenticated;
grant execute on function public.update_own_birthday_wish(uuid, uuid, text) to authenticated;
grant execute on function public.delete_own_birthday_wish(uuid, uuid) to authenticated;
grant execute on function public.hide_birthday_wish(uuid, uuid, text) to authenticated;

commit;
