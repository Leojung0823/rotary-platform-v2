begin;

-- An event's audience is not always a durable group. A golf outing goes to a
-- handful of people who have nothing in common but this one event, and making
-- a tag for them would leave the club's tag list full of one-off entries that
-- mean nothing a month later.
--
-- So an audience is now "these tags, and/or these members". Both tables empty
-- still means the whole club, so nothing that exists changes meaning.
--
-- Deliberately events only. The same idea on a board post would be a private
-- message to named members, which is a different feature with different
-- expectations (notification, reply, retention) and should not arrive by
-- accident through an audience picker.

create table public.club_event_audience_members (
  event_id uuid not null,
  membership_id uuid not null,
  club_id uuid not null references public.clubs(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (event_id, membership_id),
  constraint club_event_audience_members_event_club_fkey
    foreign key (event_id, club_id)
    references public.club_events (id, club_id) on delete restrict,
  constraint club_event_audience_members_membership_club_fkey
    foreign key (membership_id, club_id)
    references public.club_memberships (id, club_id) on delete restrict
);

alter table public.club_event_audience_members enable row level security;
revoke all on table public.club_event_audience_members from public, anon, authenticated;

-- The same invariant as the tag audience: a targeted event is not a 例會.
create trigger club_event_audience_members_reject_counted
before insert on public.club_event_audience_members
for each row execute function public.reject_audience_on_counted_event();

create or replace function public.reject_counted_targeted_event()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.counts_for_attendance and (
    exists (select 1 from public.club_event_audiences where event_id = new.id)
    or exists (select 1 from public.club_event_audience_members where event_id = new.id)
  ) then
    raise exception using errcode = '22023', message = 'targeted_event_cannot_count_for_attendance';
  end if;
  return new;
end;
$$;

create or replace function public.event_includes_current_member(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select (
    not exists (
      select 1 from public.club_event_audiences where event_id = p_event_id
    )
    and not exists (
      select 1 from public.club_event_audience_members where event_id = p_event_id
    )
  ) or exists (
    select 1
    from public.club_event_audiences as audience
    join public.club_membership_tags as tagged on tagged.tag_id = audience.tag_id
    join public.club_memberships as membership on membership.id = tagged.membership_id
    join public.app_accounts as account on account.person_id = membership.person_id
    where audience.event_id = p_event_id
      and account.auth_user_id = auth.uid()
      and account.account_status = 'active'
  ) or exists (
    select 1
    from public.club_event_audience_members as audience
    join public.club_memberships as membership on membership.id = audience.membership_id
    join public.app_accounts as account on account.person_id = membership.person_id
    where audience.event_id = p_event_id
      and account.auth_user_id = auth.uid()
      and account.account_status = 'active'
  )
$$;

-- Recreated rather than replaced: adding a defaulted parameter would leave the
-- three-argument version callable and the call ambiguous.
drop function if exists public.set_club_event_audience(uuid, uuid, uuid[]);

create function public.set_club_event_audience(
  p_club_id uuid,
  p_event_id uuid,
  p_tag_ids uuid[] default '{}'::uuid[],
  p_membership_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  wanted_tags uuid[] := coalesce(p_tag_ids, '{}'::uuid[]);
  wanted_members uuid[] := coalesce(p_membership_ids, '{}'::uuid[]);
begin
  if actor_id is null
     or not public.current_has_club_permission(p_club_id, 'event.manage') then
    raise exception using errcode = '42501', message = 'event_manage_required';
  end if;
  if not exists (
    select 1 from public.club_events
    where id = p_event_id and club_id = p_club_id and event_status <> 'cancelled'
  ) then
    raise exception using errcode = 'P0002', message = 'event_not_available';
  end if;

  -- Every tag and every membership must belong to this club, so an id from
  -- another club can never be attached by passing it in directly.
  if exists (
    select 1 from unnest(wanted_tags) as requested(tag_id)
    where not exists (
      select 1 from public.club_member_tags as tag
      where tag.id = requested.tag_id
        and tag.club_id = p_club_id
        and tag.tag_status = 'active'
    )
  ) then
    raise exception using errcode = '22023', message = 'invalid_member_tag';
  end if;
  if exists (
    select 1 from unnest(wanted_members) as requested(membership_id)
    where not exists (
      select 1 from public.club_memberships as membership
      where membership.id = requested.membership_id
        and membership.club_id = p_club_id
    )
  ) then
    raise exception using errcode = '22023', message = 'invalid_audience_membership';
  end if;

  delete from public.club_event_audiences
  where event_id = p_event_id and tag_id <> all (wanted_tags);
  delete from public.club_event_audience_members
  where event_id = p_event_id and membership_id <> all (wanted_members);

  insert into public.club_event_audiences (event_id, tag_id, club_id)
  select p_event_id, requested.tag_id, p_club_id
  from unnest(wanted_tags) as requested(tag_id)
  on conflict (event_id, tag_id) do nothing;

  insert into public.club_event_audience_members (event_id, membership_id, club_id)
  select p_event_id, requested.membership_id, p_club_id
  from unnest(wanted_members) as requested(membership_id)
  on conflict (event_id, membership_id) do nothing;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'event.audience_set', 'club_event', p_event_id,
    jsonb_build_object(
      'tag_count', coalesce(array_length(wanted_tags, 1), 0),
      'member_count', coalesce(array_length(wanted_members, 1), 0)
    )
  );

  return jsonb_build_object(
    'tag_count', coalesce(array_length(wanted_tags, 1), 0),
    'member_count', coalesce(array_length(wanted_members, 1), 0)
  );
end;
$$;

revoke all on function public.set_club_event_audience(uuid, uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.set_club_event_audience(uuid, uuid, uuid[], uuid[]) to authenticated;

commit;
