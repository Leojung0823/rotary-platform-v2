begin;

-- Forward-only tenant-integrity repair for the already committed V0.9 model.
alter table public.club_announcements
  add constraint club_announcements_id_club_unique unique (id, club_id);

alter table public.account_notifications
  add constraint account_notifications_id_tenant_unique
  unique (id, club_id, account_id, membership_id);

alter table public.club_announcement_versions
  add constraint club_announcement_versions_announcement_club_fkey
  foreign key (announcement_id, club_id)
  references public.club_announcements (id, club_id)
  on delete restrict;

alter table public.club_announcement_audiences
  add constraint club_announcement_audiences_announcement_club_fkey
  foreign key (announcement_id, club_id)
  references public.club_announcements (id, club_id)
  on delete restrict,
  add constraint club_announcement_audiences_membership_club_fkey
  foreign key (membership_id, club_id)
  references public.club_memberships (id, club_id)
  on delete restrict;

alter table public.announcement_receipts
  add constraint announcement_receipts_announcement_club_fkey
  foreign key (announcement_id, club_id)
  references public.club_announcements (id, club_id)
  on delete restrict,
  add constraint announcement_receipts_membership_club_fkey
  foreign key (membership_id, club_id)
  references public.club_memberships (id, club_id)
  on delete restrict;

alter table public.account_notifications
  add constraint account_notifications_membership_club_fkey
  foreign key (membership_id, club_id)
  references public.club_memberships (id, club_id)
  on delete restrict;

alter table public.notification_deliveries
  add constraint notification_deliveries_notification_tenant_fkey
  foreign key (notification_id, club_id, account_id, membership_id)
  references public.account_notifications (id, club_id, account_id, membership_id)
  on delete restrict,
  add constraint notification_deliveries_membership_club_fkey
  foreign key (membership_id, club_id)
  references public.club_memberships (id, club_id)
  on delete restrict;

-- Audiences are append-only identities. Scheduled edits retire the old set and
-- append a new active set, preserving history without hard deletes.
alter table public.club_announcement_audiences
  add column retired_at timestamptz,
  add column retired_by_account_id uuid references public.app_accounts(id) on delete restrict,
  add constraint club_announcement_audiences_retirement_check
    check ((retired_at is null and retired_by_account_id is null)
      or (retired_at is not null and retired_by_account_id is not null));

alter table public.club_announcement_audiences
  drop constraint club_announcement_audiences_announcement_id_audience_type_r_key;

create unique index club_announcement_audiences_one_active_target
  on public.club_announcement_audiences (
    announcement_id,
    audience_type,
    coalesce(role_key, ''),
    coalesce(membership_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where retired_at is null;

create index club_announcement_audiences_active_idx
  on public.club_announcement_audiences (announcement_id, audience_type)
  where retired_at is null;

create or replace function public.v09_announcement_protect_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.id is distinct from new.id
     or old.club_id is distinct from new.club_id
     or old.created_by_account_id is distinct from new.created_by_account_id
     or old.created_at is distinct from new.created_at then
    raise exception using errcode = '23514', message = 'announcement_identity_immutable';
  end if;

  if old.status in ('published', 'expired', 'cancelled', 'archived')
     and (
       old.title is distinct from new.title
       or old.body is distinct from new.body
       or old.publish_at is distinct from new.publish_at
       or old.expire_at is distinct from new.expire_at
       or old.pinned_until is distinct from new.pinned_until
     ) then
    raise exception using errcode = '23514', message = 'announcement_terminal_content_immutable';
  end if;

  if (old.published_at is not null or old.published_by_account_id is not null)
     and (
       old.published_at is distinct from new.published_at
       or old.published_by_account_id is distinct from new.published_by_account_id
     ) then
    raise exception using errcode = '23514', message = 'announcement_publish_identity_immutable';
  end if;
  if (old.cancelled_at is not null or old.cancelled_by_account_id is not null or old.cancel_reason is not null)
     and (
       old.cancelled_at is distinct from new.cancelled_at
       or old.cancelled_by_account_id is distinct from new.cancelled_by_account_id
       or old.cancel_reason is distinct from new.cancel_reason
     ) then
    raise exception using errcode = '23514', message = 'announcement_cancel_identity_immutable';
  end if;
  if (old.archived_at is not null or old.archived_by_account_id is not null)
     and (
       old.archived_at is distinct from new.archived_at
       or old.archived_by_account_id is distinct from new.archived_by_account_id
     ) then
    raise exception using errcode = '23514', message = 'announcement_archive_identity_immutable';
  end if;

  new.title := btrim(new.title);
  new.body := btrim(new.body);
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.v09_audience_protect_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if to_jsonb(old) - 'retired_at' - 'retired_by_account_id'
       is distinct from
     to_jsonb(new) - 'retired_at' - 'retired_by_account_id'
     or old.retired_at is not null
     or old.retired_by_account_id is not null
     or new.retired_at is null
     or new.retired_by_account_id is null then
    raise exception using errcode = '23514', message = 'announcement_audience_identity_immutable';
  end if;
  return new;
end;
$$;

drop trigger club_announcement_audiences_immutable on public.club_announcement_audiences;
create trigger club_announcement_audiences_protect_update
before update on public.club_announcement_audiences
for each row execute function public.v09_audience_protect_update();
create trigger club_announcement_audiences_prevent_delete
before delete on public.club_announcement_audiences
for each row execute function public.v09_immutable_history();

create or replace function public.v09_account_membership_matches(
  p_club_id uuid,
  p_account_id uuid,
  p_membership_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.clubs as club
    join public.club_memberships as membership
      on membership.club_id = club.id
     and membership.id = p_membership_id
    join public.app_accounts as account
      on account.person_id = membership.person_id
     and account.id = p_account_id
    where club.id = p_club_id
  )
$$;

create or replace function public.v09_notification_tenant_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if not public.v09_account_membership_matches(new.club_id, new.account_id, new.membership_id) then
    raise exception using errcode = '23503', message = 'notification_tenant_mismatch';
  end if;
  return new;
end;
$$;

create trigger account_notifications_tenant_guard
before insert or update on public.account_notifications
for each row execute function public.v09_notification_tenant_guard();

create or replace function public.v09_membership_is_current(
  p_club_id uuid,
  p_account_id uuid,
  p_membership_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.clubs as club
    join public.club_memberships as membership
      on membership.club_id = club.id
     and membership.id = p_membership_id
    join public.app_accounts as account
      on account.person_id = membership.person_id
     and account.id = p_account_id
    where club.id = p_club_id
      and club.club_status = 'active'
      and account.account_status = 'active'
      and membership.membership_status = 'active'
      and membership.joined_on <= (now() at time zone club.timezone_name)::date
      and (
        membership.ended_on is null
        or membership.ended_on >= (now() at time zone club.timezone_name)::date
      )
  )
$$;

create or replace function public.v09_audience_is_valid(p_club_id uuid, p_audiences jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  item jsonb;
  item_type text;
  item_membership uuid;
begin
  if jsonb_typeof(p_audiences) <> 'array'
     or jsonb_array_length(p_audiences) < 1
     or jsonb_array_length(p_audiences) > 100 then
    return false;
  end if;

  for item in select value from jsonb_array_elements(p_audiences)
  loop
    if jsonb_typeof(item) <> 'object' then return false; end if;
    item_type := item ->> 'type';
    if item_type = 'all_active_members' then
      if item ? 'role_key' or item ? 'membership_id' then return false; end if;
    elsif item_type = 'role' then
      if btrim(coalesce(item ->> 'role_key', '')) = ''
         or not exists (
           select 1 from public.role_definitions
           where role_key = item ->> 'role_key'
         ) then return false; end if;
    elsif item_type = 'membership' then
      begin
        item_membership := (item ->> 'membership_id')::uuid;
      exception when others then
        return false;
      end;
      if not exists (
        select 1 from public.club_memberships
        where id = item_membership and club_id = p_club_id
      ) then return false; end if;
    else
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.v09_append_audiences(
  p_club_id uuid,
  p_announcement_id uuid,
  p_audiences jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  item jsonb;
begin
  if not public.v09_audience_is_valid(p_club_id, p_audiences) then
    raise exception using errcode = '22023', message = 'announcement_input_invalid';
  end if;
  for item in select value from jsonb_array_elements(p_audiences)
  loop
    insert into public.club_announcement_audiences (
      club_id, announcement_id, audience_type, role_key, membership_id
    ) values (
      p_club_id,
      p_announcement_id,
      item ->> 'type',
      case when item ->> 'type' = 'role' then item ->> 'role_key' end,
      case when item ->> 'type' = 'membership' then (item ->> 'membership_id')::uuid end
    )
    on conflict do nothing;
  end loop;
end;
$$;

create or replace function public.v09_audience_snapshot(p_announcement_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'type', audience.audience_type,
      'role_key', audience.role_key,
      'membership_id', audience.membership_id
    )) order by audience.audience_type, audience.role_key, audience.membership_id
  ), '[]'::jsonb)
  from public.club_announcement_audiences as audience
  where audience.announcement_id = p_announcement_id
    and audience.retired_at is null
$$;

create or replace function public.v09_append_version(
  p_announcement_id uuid,
  p_actor_id uuid,
  p_transition text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.club_announcements;
  next_version integer;
begin
  select * into target
  from public.club_announcements
  where id = p_announcement_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'announcement_not_available';
  end if;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.club_announcement_versions
  where announcement_id = target.id;

  insert into public.club_announcement_versions (
    club_id, announcement_id, version_number, title_snapshot, body_snapshot,
    audience_snapshot, status_transition, created_by_account_id
  ) values (
    target.club_id, target.id, next_version, target.title, target.body,
    public.v09_audience_snapshot(target.id), left(p_transition, 64), p_actor_id
  );
  return next_version;
end;
$$;

create or replace function public.v09_can_view_announcement(
  p_announcement_id uuid,
  p_account_id uuid,
  p_membership_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.club_announcements as announcement
    where announcement.id = p_announcement_id
      and announcement.status = 'published'
      and announcement.publish_at <= now()
      and (announcement.expire_at is null or announcement.expire_at > now())
      and public.v09_membership_is_current(
        announcement.club_id, p_account_id, p_membership_id
      )
      and exists (
        select 1
        from public.club_announcement_audiences as audience
        where audience.announcement_id = announcement.id
          and audience.club_id = announcement.club_id
          and audience.retired_at is null
          and (
            audience.audience_type = 'all_active_members'
            or (audience.audience_type = 'membership' and audience.membership_id = p_membership_id)
            or (
              audience.audience_type = 'role'
              and exists (
                select 1
                from public.club_role_assignments as assignment
                where assignment.club_id = announcement.club_id
                  and assignment.app_account_id = p_account_id
                  and assignment.role_key = audience.role_key
                  and assignment.assignment_status = 'active'
              )
            )
          )
      )
  )
$$;

create or replace function public.list_my_announcement_clubs()
returns table (
  club_id uuid,
  club_code text,
  club_name text,
  membership_id uuid,
  can_manage boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select club.id, club.club_code, club.club_name, membership.id,
    public.current_has_club_permission(club.id, 'announcement.manage')
  from public.app_accounts as account
  join public.club_memberships as membership on membership.person_id = account.person_id
  join public.clubs as club on club.id = membership.club_id
  where account.auth_user_id = auth.uid()
    and public.v09_membership_is_current(club.id, account.id, membership.id)
  order by club.club_name, club.id
$$;

create or replace function public.list_my_announcements(
  p_club_id uuid,
  p_cursor timestamptz default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  viewer_account_id uuid := public.current_app_account_id();
  viewer_membership_id uuid;
  result jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'announcement_input_invalid';
  end if;
  select membership.id into viewer_membership_id
  from public.club_memberships as membership
  join public.app_accounts as account on account.person_id = membership.person_id
  where membership.club_id = p_club_id
    and account.id = viewer_account_id
    and public.v09_membership_is_current(p_club_id, viewer_account_id, membership.id)
  order by membership.joined_on desc, membership.id
  limit 1;
  if viewer_membership_id is null then
    raise exception using errcode = '42501', message = 'announcement_access_denied';
  end if;

  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', item.id,
      'club_id', item.club_id,
      'title', item.title,
      'excerpt', left(item.body, 240),
      'published_at', item.published_at,
      'expire_at', item.expire_at,
      'pinned_until', item.pinned_until,
      'read_at', receipt.read_at
    ) order by (item.pinned_until > now()) desc, item.published_at desc, item.id desc), '[]'::jsonb),
    'next_cursor', min(item.published_at)
  ) into result
  from (
    select announcement.*
    from public.club_announcements as announcement
    where announcement.club_id = p_club_id
      and (p_cursor is null or announcement.published_at < p_cursor)
      and public.v09_can_view_announcement(announcement.id, viewer_account_id, viewer_membership_id)
    order by (announcement.pinned_until > now()) desc,
      announcement.published_at desc,
      announcement.id desc
    limit p_limit
  ) as item
  left join public.announcement_receipts as receipt
    on receipt.announcement_id = item.id
   and receipt.membership_id = viewer_membership_id;
  return coalesce(result, jsonb_build_object('items', '[]'::jsonb, 'next_cursor', null));
end;
$$;

create or replace function public.get_my_announcement(
  p_club_id uuid,
  p_announcement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  viewer_account_id uuid := public.current_app_account_id();
  viewer_membership_id uuid;
  result jsonb;
begin
  select membership.id into viewer_membership_id
  from public.club_memberships as membership
  join public.app_accounts as account on account.person_id = membership.person_id
  where membership.club_id = p_club_id
    and account.id = viewer_account_id
    and public.v09_membership_is_current(p_club_id, viewer_account_id, membership.id)
  order by membership.joined_on desc, membership.id
  limit 1;
  if viewer_membership_id is null
     or not public.v09_can_view_announcement(p_announcement_id, viewer_account_id, viewer_membership_id) then
    raise exception using errcode = '42501', message = 'announcement_access_denied';
  end if;

  insert into public.announcement_receipts (
    club_id, announcement_id, membership_id, first_seen_at
  ) values (p_club_id, p_announcement_id, viewer_membership_id, now())
  on conflict (announcement_id, membership_id) do nothing;

  select jsonb_build_object(
    'id', announcement.id,
    'club_id', announcement.club_id,
    'title', announcement.title,
    'body', announcement.body,
    'published_at', announcement.published_at,
    'expire_at', announcement.expire_at,
    'pinned_until', announcement.pinned_until,
    'first_seen_at', receipt.first_seen_at,
    'read_at', receipt.read_at
  ) into result
  from public.club_announcements as announcement
  join public.announcement_receipts as receipt
    on receipt.announcement_id = announcement.id
   and receipt.membership_id = viewer_membership_id
  where announcement.id = p_announcement_id and announcement.club_id = p_club_id;
  return result;
end;
$$;

create or replace function public.mark_announcement_read(
  p_club_id uuid,
  p_announcement_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  viewer_account_id uuid := public.current_app_account_id();
  viewer_membership_id uuid;
  marked_at timestamptz;
begin
  select membership.id into viewer_membership_id
  from public.club_memberships as membership
  join public.app_accounts as account on account.person_id = membership.person_id
  where membership.club_id = p_club_id
    and account.id = viewer_account_id
    and public.v09_membership_is_current(p_club_id, viewer_account_id, membership.id)
  order by membership.joined_on desc, membership.id
  limit 1;
  if viewer_membership_id is null
     or not public.v09_can_view_announcement(p_announcement_id, viewer_account_id, viewer_membership_id) then
    raise exception using errcode = '42501', message = 'announcement_access_denied';
  end if;
  insert into public.announcement_receipts (
    club_id, announcement_id, membership_id, first_seen_at, read_at
  ) values (p_club_id, p_announcement_id, viewer_membership_id, now(), now())
  on conflict (announcement_id, membership_id) do update
    set read_at = coalesce(public.announcement_receipts.read_at, excluded.read_at)
  returning read_at into marked_at;
  return marked_at;
end;
$$;

create or replace function public.list_my_notifications(
  p_cursor timestamptz default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  viewer_account_id uuid := public.current_app_account_id();
  result jsonb;
begin
  if viewer_account_id is null or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'notification_access_denied';
  end if;
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', item.id,
      'club_id', item.club_id,
      'type', item.notification_type,
      'title', item.title,
      'body', item.body,
      'action_path', item.action_path,
      'created_at', item.created_at,
      'read_at', item.read_at
    ) order by item.created_at desc, item.id desc), '[]'::jsonb),
    'next_cursor', min(item.created_at)
  ) into result
  from (
    select notification.*
    from public.account_notifications as notification
    left join public.notification_settings as settings
      on settings.app_account_id = notification.account_id
    where notification.account_id = viewer_account_id
      and coalesce(settings.in_app_enabled, true)
      and public.v09_membership_is_current(
        notification.club_id, notification.account_id, notification.membership_id
      )
      and (p_cursor is null or notification.created_at < p_cursor)
    order by notification.created_at desc, notification.id desc
    limit p_limit
  ) as item;
  return coalesce(result, jsonb_build_object('items', '[]'::jsonb, 'next_cursor', null));
end;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  viewer_account_id uuid := public.current_app_account_id();
  marked_at timestamptz;
begin
  update public.account_notifications as notification
  set read_at = coalesce(notification.read_at, now())
  where notification.id = p_notification_id
    and notification.account_id = viewer_account_id
    and public.v09_membership_is_current(
      notification.club_id, notification.account_id, notification.membership_id
    )
  returning read_at into marked_at;
  if marked_at is null then
    raise exception using errcode = 'P0002', message = 'notification_not_available';
  end if;
  return marked_at;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  viewer_account_id uuid := public.current_app_account_id();
  affected integer;
begin
  if viewer_account_id is null then
    raise exception using errcode = '42501', message = 'notification_access_denied';
  end if;
  update public.account_notifications as notification
  set read_at = now()
  where notification.account_id = viewer_account_id
    and notification.read_at is null
    and public.v09_membership_is_current(
      notification.club_id, notification.account_id, notification.membership_id
    );
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.get_my_unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select count(*)::integer
  from public.account_notifications as notification
  left join public.notification_settings as settings
    on settings.app_account_id = notification.account_id
  join public.app_accounts as account on account.id = notification.account_id
  where account.auth_user_id = auth.uid()
    and account.account_status = 'active'
    and coalesce(settings.in_app_enabled, true)
    and notification.read_at is null
    and public.v09_membership_is_current(
      notification.club_id, notification.account_id, notification.membership_id
    )
$$;

create or replace function public.v09_manage_allowed(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.current_app_account_id() is not null
    and exists (
      select 1 from public.clubs
      where id = p_club_id and club_status = 'active'
    )
    and public.current_has_club_permission(p_club_id, 'announcement.manage')
$$;

create or replace function public.list_manageable_announcements(
  p_club_id uuid,
  p_status text default null,
  p_cursor timestamptz default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare result jsonb;
begin
  if not public.v09_manage_allowed(p_club_id) then
    raise exception using errcode = '42501', message = 'announcement_manage_denied';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100
     or (p_status is not null and p_status not in ('draft', 'scheduled', 'published', 'expired', 'cancelled', 'archived')) then
    raise exception using errcode = '22023', message = 'announcement_input_invalid';
  end if;
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', item.id,
      'title', item.title,
      'status', item.status,
      'publish_at', item.publish_at,
      'expire_at', item.expire_at,
      'pinned_until', item.pinned_until,
      'created_at', item.created_at,
      'updated_at', item.updated_at,
      'recipient_count', (
        select count(*) from public.account_notifications
        where source_type = 'announcement' and source_id = item.id
      )
    ) order by item.updated_at desc, item.id desc), '[]'::jsonb),
    'next_cursor', min(item.updated_at)
  ) into result
  from (
    select announcement.*
    from public.club_announcements as announcement
    where announcement.club_id = p_club_id
      and (p_status is null or announcement.status = p_status)
      and (p_cursor is null or announcement.updated_at < p_cursor)
    order by announcement.updated_at desc, announcement.id desc
    limit p_limit
  ) as item;
  return coalesce(result, jsonb_build_object('items', '[]'::jsonb, 'next_cursor', null));
end;
$$;

create or replace function public.get_manageable_announcement(
  p_club_id uuid,
  p_announcement_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare result jsonb;
begin
  if not public.v09_manage_allowed(p_club_id) then
    raise exception using errcode = '42501', message = 'announcement_manage_denied';
  end if;
  select jsonb_build_object(
    'id', announcement.id,
    'club_id', announcement.club_id,
    'title', announcement.title,
    'body', announcement.body,
    'status', announcement.status,
    'publish_at', announcement.publish_at,
    'expire_at', announcement.expire_at,
    'pinned_until', announcement.pinned_until,
    'cancel_reason', announcement.cancel_reason,
    'created_at', announcement.created_at,
    'updated_at', announcement.updated_at,
    'audiences', public.v09_audience_snapshot(announcement.id),
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'version_number', version.version_number,
        'title', version.title_snapshot,
        'body', version.body_snapshot,
        'audiences', version.audience_snapshot,
        'transition', version.status_transition,
        'created_at', version.created_at
      ) order by version.version_number desc)
      from public.club_announcement_versions as version
      where version.announcement_id = announcement.id
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', audit.action_key,
        'metadata', audit.metadata,
        'created_at', audit.created_at
      ) order by audit.created_at desc)
      from public.audit_logs as audit
      where audit.club_id = announcement.club_id
        and audit.subject_type = 'announcement'
        and audit.subject_id = announcement.id
    ), '[]'::jsonb)
  ) into result
  from public.club_announcements as announcement
  where announcement.id = p_announcement_id and announcement.club_id = p_club_id;
  if result is null then
    raise exception using errcode = 'P0002', message = 'announcement_not_available';
  end if;
  return result;
end;
$$;

create or replace function public.create_club_announcement(
  p_club_id uuid,
  p_title text,
  p_body text,
  p_audiences jsonb,
  p_expire_at timestamptz default null,
  p_pinned_until timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  created public.club_announcements;
  title_value text := btrim(coalesce(p_title, ''));
  body_value text := btrim(coalesce(p_body, ''));
begin
  if not public.v09_manage_allowed(p_club_id) then
    raise exception using errcode = '42501', message = 'announcement_manage_denied';
  end if;
  if char_length(title_value) not between 1 and 160
     or char_length(body_value) not between 1 and 12000
     or (p_expire_at is not null and p_expire_at <= now())
     or (p_pinned_until is not null and p_pinned_until <= now())
     or not public.v09_audience_is_valid(p_club_id, p_audiences) then
    raise exception using errcode = '22023', message = 'announcement_input_invalid';
  end if;
  insert into public.club_announcements (
    club_id, title, body, status, expire_at, pinned_until, created_by_account_id
  ) values (
    p_club_id, title_value, body_value, 'draft', p_expire_at, p_pinned_until, actor_id
  ) returning * into created;
  perform public.v09_append_audiences(p_club_id, created.id, p_audiences);
  perform public.v09_append_version(created.id, actor_id, 'created');
  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'announcement.created', 'announcement', created.id,
    jsonb_build_object('status', 'draft', 'audience_count', jsonb_array_length(p_audiences))
  );
  return created.id;
end;
$$;

create or replace function public.update_draft_announcement(
  p_club_id uuid,
  p_announcement_id uuid,
  p_title text,
  p_body text,
  p_audiences jsonb,
  p_publish_at timestamptz default null,
  p_expire_at timestamptz default null,
  p_pinned_until timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_announcements;
  title_value text := btrim(coalesce(p_title, ''));
  body_value text := btrim(coalesce(p_body, ''));
begin
  if not public.v09_manage_allowed(p_club_id) then
    raise exception using errcode = '42501', message = 'announcement_manage_denied';
  end if;
  if char_length(title_value) not between 1 and 160
     or char_length(body_value) not between 1 and 12000
     or (p_publish_at is not null and p_publish_at <= now())
     or (p_expire_at is not null and p_expire_at <= coalesce(p_publish_at, now()))
     or (p_pinned_until is not null and p_pinned_until < coalesce(p_publish_at, now()))
     or not public.v09_audience_is_valid(p_club_id, p_audiences) then
    raise exception using errcode = '22023', message = 'announcement_input_invalid';
  end if;
  select * into target from public.club_announcements
  where id = p_announcement_id and club_id = p_club_id
  for update;
  if not found or target.status not in ('draft', 'scheduled') then
    raise exception using errcode = 'P0002', message = 'announcement_not_editable';
  end if;
  if target.status = 'scheduled' and p_publish_at is null then
    raise exception using errcode = '22023', message = 'announcement_input_invalid';
  end if;
  update public.club_announcement_audiences
  set retired_at = now(), retired_by_account_id = actor_id
  where announcement_id = target.id and retired_at is null;
  update public.club_announcements
  set title = title_value,
      body = body_value,
      publish_at = case when target.status = 'scheduled' then p_publish_at else null end,
      expire_at = p_expire_at,
      pinned_until = p_pinned_until
  where id = target.id;
  perform public.v09_append_audiences(p_club_id, target.id, p_audiences);
  perform public.v09_append_version(target.id, actor_id, 'updated_' || target.status);
  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'announcement.updated', 'announcement', target.id,
    jsonb_build_object('status', target.status, 'audience_count', jsonb_array_length(p_audiences))
  );
end;
$$;

create or replace function public.schedule_club_announcement(
  p_club_id uuid,
  p_announcement_id uuid,
  p_publish_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_announcements;
begin
  if not public.v09_manage_allowed(p_club_id) then
    raise exception using errcode = '42501', message = 'announcement_manage_denied';
  end if;
  if p_publish_at is null or p_publish_at <= now() then
    raise exception using errcode = '22023', message = 'announcement_input_invalid';
  end if;
  select * into target from public.club_announcements
  where id = p_announcement_id and club_id = p_club_id
  for update;
  if not found or target.status <> 'draft' then
    raise exception using errcode = 'P0002', message = 'announcement_transition_denied';
  end if;
  update public.club_announcements
  set status = 'scheduled', publish_at = p_publish_at
  where id = target.id;
  perform public.v09_append_version(target.id, actor_id, 'scheduled');
  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'announcement.scheduled', 'announcement', target.id,
    jsonb_build_object('scheduled', true)
  );
end;
$$;

create or replace function public.v09_publish_announcement_locked(
  p_club_id uuid,
  p_announcement_id uuid,
  p_actor_id uuid,
  p_action_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.club_announcements;
  recipient_count integer;
  delivery_count integer;
begin
  select * into target from public.club_announcements
  where id = p_announcement_id and club_id = p_club_id
  for update;
  if not found or target.status not in ('draft', 'scheduled') then
    raise exception using errcode = 'P0002', message = 'announcement_transition_denied';
  end if;
  if not exists (
    select 1 from public.clubs where id = p_club_id and club_status = 'active'
  ) or not exists (
    select 1 from public.club_announcement_audiences
    where announcement_id = target.id and club_id = p_club_id and retired_at is null
  ) then
    raise exception using errcode = '42501', message = 'announcement_publish_denied';
  end if;

  perform public.v09_append_version(target.id, coalesce(p_actor_id, target.created_by_account_id), 'published');
  update public.club_announcements
  set status = 'published',
      publish_at = now(),
      published_at = now(),
      published_by_account_id = coalesce(p_actor_id, target.created_by_account_id)
  where id = target.id;

  with eligible as materialized (
    select distinct account.id as account_id, membership.id as membership_id
    from public.club_memberships as membership
    join public.clubs as club on club.id = membership.club_id
    join public.app_accounts as account
      on account.person_id = membership.person_id
     and account.account_status = 'active'
    where membership.club_id = p_club_id
      and membership.membership_status = 'active'
      and membership.joined_on <= (now() at time zone club.timezone_name)::date
      and (membership.ended_on is null or membership.ended_on >= (now() at time zone club.timezone_name)::date)
      and exists (
        select 1 from public.club_announcement_audiences as audience
        where audience.announcement_id = target.id
          and audience.club_id = p_club_id
          and audience.retired_at is null
          and (
            audience.audience_type = 'all_active_members'
            or (audience.audience_type = 'membership' and audience.membership_id = membership.id)
            or (
              audience.audience_type = 'role'
              and exists (
                select 1 from public.club_role_assignments as assignment
                where assignment.club_id = p_club_id
                  and assignment.app_account_id = account.id
                  and assignment.role_key = audience.role_key
                  and assignment.assignment_status = 'active'
              )
            )
          )
      )
  )
  insert into public.account_notifications (
    club_id, account_id, membership_id, notification_type, title, body,
    action_path, source_type, source_id, deduplication_key
  )
  select p_club_id, eligible.account_id, eligible.membership_id,
    'announcement_published', target.title, left(target.body, 1200),
    '/announcements/' || target.id::text, 'announcement', target.id,
    'announcement:' || target.id::text || ':published'
  from eligible
  on conflict (account_id, deduplication_key) do nothing;

  select count(*)::integer into recipient_count
  from public.account_notifications
  where source_type = 'announcement' and source_id = target.id;

  insert into public.notification_deliveries (
    club_id, notification_id, account_id, membership_id, channel,
    status, max_attempts, next_attempt_at
  )
  select notification.club_id, notification.id, notification.account_id,
    notification.membership_id, channel.channel, 'pending', 3, now()
  from public.account_notifications as notification
  join public.app_accounts as account on account.id = notification.account_id
  join public.people as person on person.id = account.person_id
  left join public.notification_settings as settings on settings.app_account_id = account.id
  cross join lateral (
    select 'email'::text as channel
    where coalesce(settings.email_enabled, true)
      and nullif(btrim(person.primary_email), '') is not null
    union all
    select 'line'::text
    where coalesce(settings.line_enabled, true)
      and exists (
        select 1
        from public.line_oa_followers as follower
        join public.line_oa_accounts as oa on oa.id = follower.line_oa_account_id
        where follower.club_id = notification.club_id
          and follower.app_account_id = notification.account_id
          and follower.person_id = account.person_id
          and follower.follower_status = 'following'
          and oa.club_id = notification.club_id
          and oa.account_status = 'active'
      )
  ) as channel
  where notification.source_type = 'announcement'
    and notification.source_id = target.id
    and public.v09_membership_is_current(
      notification.club_id, notification.account_id, notification.membership_id
    )
  on conflict (notification_id, channel) do nothing;

  select count(*)::integer into delivery_count
  from public.notification_deliveries as delivery
  join public.account_notifications as notification on notification.id = delivery.notification_id
  where notification.source_type = 'announcement' and notification.source_id = target.id;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, p_actor_id, p_action_key, 'announcement', target.id,
    jsonb_build_object('recipient_count', recipient_count, 'delivery_count', delivery_count)
  );
  return jsonb_build_object('recipient_count', recipient_count, 'delivery_count', delivery_count);
end;
$$;

create or replace function public.publish_club_announcement(
  p_club_id uuid,
  p_announcement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare actor_id uuid := public.current_app_account_id();
begin
  if not public.v09_manage_allowed(p_club_id) then
    raise exception using errcode = '42501', message = 'announcement_manage_denied';
  end if;
  return public.v09_publish_announcement_locked(
    p_club_id, p_announcement_id, actor_id, 'announcement.published'
  );
end;
$$;

create or replace function public.cancel_club_announcement(
  p_club_id uuid,
  p_announcement_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_announcements;
  reason_value text := btrim(coalesce(p_reason, ''));
begin
  if not public.v09_manage_allowed(p_club_id) then
    raise exception using errcode = '42501', message = 'announcement_manage_denied';
  end if;
  if char_length(reason_value) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'announcement_input_invalid';
  end if;
  select * into target from public.club_announcements
  where id = p_announcement_id and club_id = p_club_id for update;
  if not found or target.status not in ('draft', 'scheduled', 'published') then
    raise exception using errcode = 'P0002', message = 'announcement_transition_denied';
  end if;
  update public.club_announcements
  set status = 'cancelled', cancelled_at = now(), cancelled_by_account_id = actor_id,
      cancel_reason = reason_value
  where id = target.id;
  update public.notification_deliveries as delivery
  set status = 'cancelled'
  from public.account_notifications as notification
  where delivery.notification_id = notification.id
    and notification.source_type = 'announcement'
    and notification.source_id = target.id
    and delivery.status in ('pending', 'retry_wait');
  perform public.v09_append_version(target.id, actor_id, 'cancelled');
  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'announcement.cancelled', 'announcement', target.id,
    jsonb_build_object('reason_code', 'manager_cancelled')
  );
end;
$$;

create or replace function public.archive_club_announcement(
  p_club_id uuid,
  p_announcement_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_announcements;
begin
  if not public.v09_manage_allowed(p_club_id) then
    raise exception using errcode = '42501', message = 'announcement_manage_denied';
  end if;
  select * into target from public.club_announcements
  where id = p_announcement_id and club_id = p_club_id for update;
  if not found or target.status not in ('published', 'expired', 'cancelled') then
    raise exception using errcode = 'P0002', message = 'announcement_transition_denied';
  end if;
  update public.club_announcements
  set status = 'archived', archived_at = now(), archived_by_account_id = actor_id
  where id = target.id;
  perform public.v09_append_version(target.id, actor_id, 'archived');
  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'announcement.archived', 'announcement', target.id,
    '{}'::jsonb
  );
end;
$$;

create or replace function public.get_announcement_delivery_summary(
  p_club_id uuid,
  p_announcement_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare result jsonb;
begin
  if not public.v09_manage_allowed(p_club_id) then
    raise exception using errcode = '42501', message = 'announcement_manage_denied';
  end if;
  if not exists (
    select 1 from public.club_announcements
    where id = p_announcement_id and club_id = p_club_id
  ) then
    raise exception using errcode = 'P0002', message = 'announcement_not_available';
  end if;
  select jsonb_build_object(
    'recipient_count', count(distinct notification.account_id),
    'unread_count', count(distinct notification.account_id) filter (where notification.read_at is null),
    'delivery_count', count(delivery.id),
    'pending_count', count(delivery.id) filter (where delivery.status in ('pending', 'retry_wait', 'processing')),
    'sent_count', count(delivery.id) filter (where delivery.status = 'sent'),
    'failed_count', count(delivery.id) filter (where delivery.status = 'failed')
  ) into result
  from public.account_notifications as notification
  left join public.notification_deliveries as delivery on delivery.notification_id = notification.id
  where notification.club_id = p_club_id
    and notification.source_type = 'announcement'
    and notification.source_id = p_announcement_id;
  return result;
end;
$$;

create or replace function public.retry_failed_announcement_deliveries(
  p_club_id uuid,
  p_announcement_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  affected integer;
begin
  if not public.v09_manage_allowed(p_club_id) then
    raise exception using errcode = '42501', message = 'announcement_manage_denied';
  end if;
  update public.notification_deliveries as delivery
  set status = 'pending', attempt_count = 0, next_attempt_at = now(),
      claimed_at = null, claim_token_hash = null,
      generalized_error_code = null, failed_at = null
  from public.account_notifications as notification
  where delivery.notification_id = notification.id
    and notification.club_id = p_club_id
    and notification.source_type = 'announcement'
    and notification.source_id = p_announcement_id
    and delivery.status = 'failed';
  get diagnostics affected = row_count;
  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'announcement.delivery_retried', 'announcement', p_announcement_id,
    jsonb_build_object('delivery_count', affected)
  );
  return affected;
end;
$$;

revoke all on function public.v09_announcement_protect_update() from public, anon, authenticated;
revoke all on function public.v09_immutable_history() from public, anon, authenticated;
revoke all on function public.v09_receipt_protect_update() from public, anon, authenticated;
revoke all on function public.v09_notification_protect_update() from public, anon, authenticated;
revoke all on function public.v09_delivery_protect_update() from public, anon, authenticated;
revoke all on function public.v09_audience_protect_update() from public, anon, authenticated;
revoke all on function public.v09_account_membership_matches(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.v09_notification_tenant_guard() from public, anon, authenticated;
revoke all on function public.v09_membership_is_current(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.v09_audience_is_valid(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.v09_append_audiences(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.v09_audience_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.v09_append_version(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.v09_can_view_announcement(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.v09_manage_allowed(uuid) from public, anon, authenticated;
revoke all on function public.v09_publish_announcement_locked(uuid, uuid, uuid, text) from public, anon, authenticated;

revoke all on function public.list_my_announcement_clubs() from public, anon;
revoke all on function public.list_my_announcements(uuid, timestamptz, integer) from public, anon;
revoke all on function public.get_my_announcement(uuid, uuid) from public, anon;
revoke all on function public.mark_announcement_read(uuid, uuid) from public, anon;
revoke all on function public.list_my_notifications(timestamptz, integer) from public, anon;
revoke all on function public.mark_notification_read(uuid) from public, anon;
revoke all on function public.mark_all_notifications_read() from public, anon;
revoke all on function public.get_my_unread_notification_count() from public, anon;
revoke all on function public.list_manageable_announcements(uuid, text, timestamptz, integer) from public, anon;
revoke all on function public.get_manageable_announcement(uuid, uuid) from public, anon;
revoke all on function public.create_club_announcement(uuid, text, text, jsonb, timestamptz, timestamptz) from public, anon;
revoke all on function public.update_draft_announcement(uuid, uuid, text, text, jsonb, timestamptz, timestamptz, timestamptz) from public, anon;
revoke all on function public.schedule_club_announcement(uuid, uuid, timestamptz) from public, anon;
revoke all on function public.publish_club_announcement(uuid, uuid) from public, anon;
revoke all on function public.cancel_club_announcement(uuid, uuid, text) from public, anon;
revoke all on function public.archive_club_announcement(uuid, uuid) from public, anon;
revoke all on function public.get_announcement_delivery_summary(uuid, uuid) from public, anon;
revoke all on function public.retry_failed_announcement_deliveries(uuid, uuid) from public, anon;

grant execute on function public.list_my_announcement_clubs() to authenticated;
grant execute on function public.list_my_announcements(uuid, timestamptz, integer) to authenticated;
grant execute on function public.get_my_announcement(uuid, uuid) to authenticated;
grant execute on function public.mark_announcement_read(uuid, uuid) to authenticated;
grant execute on function public.list_my_notifications(timestamptz, integer) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.get_my_unread_notification_count() to authenticated;
grant execute on function public.list_manageable_announcements(uuid, text, timestamptz, integer) to authenticated;
grant execute on function public.get_manageable_announcement(uuid, uuid) to authenticated;
grant execute on function public.create_club_announcement(uuid, text, text, jsonb, timestamptz, timestamptz) to authenticated;
grant execute on function public.update_draft_announcement(uuid, uuid, text, text, jsonb, timestamptz, timestamptz, timestamptz) to authenticated;
grant execute on function public.schedule_club_announcement(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.publish_club_announcement(uuid, uuid) to authenticated;
grant execute on function public.cancel_club_announcement(uuid, uuid, text) to authenticated;
grant execute on function public.archive_club_announcement(uuid, uuid) to authenticated;
grant execute on function public.get_announcement_delivery_summary(uuid, uuid) to authenticated;
grant execute on function public.retry_failed_announcement_deliveries(uuid, uuid) to authenticated;

commit;
