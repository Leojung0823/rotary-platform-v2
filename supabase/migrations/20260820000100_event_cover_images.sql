begin;

-- Event cover images.
--
-- The browser compresses and uploads straight to Storage under the caller's own
-- session, so the image bytes never pass through the application server -- which
-- matters because staging runs on a 0.1 CPU instance. That means Storage's own
-- row-level policies are the authorization boundary for the upload, not an
-- application check, so they are written against the same club functions the
-- rest of the events domain uses.
--
-- Object key is "<club_id>/<event_id>", which lets a policy read the owning club
-- straight out of the path.

alter table public.club_events
  add column cover_image_path text
    check (cover_image_path is null or cover_image_path <> '');

comment on column public.club_events.cover_image_path is
  'Storage object key in the event-covers bucket. Never a URL: links are signed per request.';

-- Private bucket. The size limit is a backstop -- the browser compresses well
-- below it -- and the mime allowlist keeps the bucket to images the app renders.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-covers', 'event-covers', false, 2097152, array['image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- A malformed key must not raise inside a policy; it simply belongs to no club.
create or replace function public.storage_object_club_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
begin
  return split_part(coalesce(p_name, ''), '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

revoke all on function public.storage_object_club_id(text) from public, anon;
grant execute on function public.storage_object_club_id(text) to authenticated;

-- Storage policies are evaluated as the calling role, but the club predicates
-- the events domain uses are deliberately revoked from `authenticated` -- they
-- are internal helpers for security-definer functions. Rather than widen those,
-- expose two narrow definer wrappers that answer only about the caller's own
-- access to one club, which is something the caller already knows.
create or replace function public.can_view_event_covers(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$ select p_club_id is not null and public.current_can_access_club_events(p_club_id) $$;

create or replace function public.can_manage_event_covers(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$ select p_club_id is not null and public.current_has_club_permission(p_club_id, 'event.manage') $$;

revoke all on function public.can_view_event_covers(uuid) from public, anon;
revoke all on function public.can_manage_event_covers(uuid) from public, anon;
grant execute on function public.can_view_event_covers(uuid) to authenticated;
grant execute on function public.can_manage_event_covers(uuid) to authenticated;

drop policy if exists "event covers are readable by the club" on storage.objects;
drop policy if exists "event covers are written by event managers" on storage.objects;
drop policy if exists "event covers are replaced by event managers" on storage.objects;
drop policy if exists "event covers are removed by event managers" on storage.objects;

-- Reading follows the same rule as seeing the club's events at all.
create policy "event covers are readable by the club"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'event-covers'
    and public.can_view_event_covers(public.storage_object_club_id(name))
  );

-- Writing follows the same rule as managing the club's events.
create policy "event covers are written by event managers"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'event-covers'
    and public.can_manage_event_covers(public.storage_object_club_id(name))
  );

create policy "event covers are replaced by event managers"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'event-covers'
    and public.can_manage_event_covers(public.storage_object_club_id(name))
  )
  with check (
    bucket_id = 'event-covers'
    and public.can_manage_event_covers(public.storage_object_club_id(name))
  );

create policy "event covers are removed by event managers"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'event-covers'
    and public.can_manage_event_covers(public.storage_object_club_id(name))
  );

-- Recording the key is a separate, authorised step: the upload proves the
-- caller may write to the club's folder, this proves the key belongs to the
-- event it is being attached to.
create or replace function public.set_club_event_cover(
  p_club_id uuid,
  p_event_id uuid,
  p_cover_image_path text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  normalized text := nullif(btrim(coalesce(p_cover_image_path, '')), '');
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'event.manage') then
    raise exception using errcode = '42501', message = 'event_manage_required';
  end if;

  -- Clearing is always allowed; setting must name this club's own event.
  if normalized is not null
     and normalized <> p_club_id::text || '/' || p_event_id::text then
    raise exception using errcode = '22023', message = 'invalid_event_cover_path';
  end if;

  update public.club_events
  set cover_image_path = normalized,
      updated_by_app_account_id = actor_id
  where id = p_event_id and club_id = p_club_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'event_not_found';
  end if;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'event.cover_updated', 'club_event', p_event_id,
    jsonb_build_object('cover_present', normalized is not null));

  return jsonb_build_object('event_id', p_event_id, 'cover_present', normalized is not null);
end;
$$;

revoke all on function public.set_club_event_cover(uuid, uuid, text) from public, anon;
grant execute on function public.set_club_event_cover(uuid, uuid, text) to authenticated;

-- The list projection carries the key so the page can sign a URL for it.
-- Still only a key, never a URL: links are minted per request and expire.
create or replace function public.list_club_events(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  can_manage boolean := public.current_has_club_permission(p_club_id, 'event.manage');
  result jsonb;
begin
  if actor_id is null or not public.current_can_access_club_events(p_club_id) then
    raise exception using errcode = '42501', message = 'event_read_required';
  end if;

  select jsonb_build_object(
    'events', coalesce(jsonb_agg(jsonb_build_object(
      'id', event.id,
      'event_type', event.event_type,
      'title', event.title,
      'description', event.description,
      'location', event.location,
      'starts_at', event.starts_at,
      'ends_at', event.ends_at,
      'registration_deadline', event.registration_deadline,
      'capacity', event.capacity,
      'counts_for_attendance', event.counts_for_attendance,
      'status', event.event_status,
      'version', event.version,
      'attending_members', event.attending_members,
      'attending_spots', event.attending_spots,
      'remaining_spots', case when event.capacity is null then null else greatest(event.capacity - event.attending_spots, 0) end,
      'my_response', event.my_response,
      'my_guest_count', event.my_guest_count,
      'my_note', event.my_note,
      'can_manage', can_manage,
      'cover_image_path', event.cover_image_path,
      'venue_location_set', event.venue_latitude is not null,
      'registration_open', event.event_status = 'published'
        and now() <= event.registration_deadline
        and now() < event.starts_at
    ) order by event.starts_at, event.id), '[]'::jsonb)
  ) into result
  from (
    select e.*,
      count(r.id) filter (where r.response = 'attending')::integer as attending_members,
      coalesce(sum(1 + r.guest_count) filter (where r.response = 'attending'), 0)::integer as attending_spots,
      mine.response as my_response,
      coalesce(mine.guest_count, 0) as my_guest_count,
      coalesce(mine.note, '') as my_note
    from public.club_events as e
    left join public.event_registrations as r on r.event_id = e.id
    left join public.event_registrations as mine on mine.event_id = e.id and mine.app_account_id = actor_id
    where e.club_id = p_club_id
      and (e.event_status in ('published', 'cancelled') or can_manage)
      and (e.starts_at >= now() - interval '30 days' or can_manage)
    group by e.id, mine.response, mine.guest_count, mine.note
    order by e.starts_at, e.id
    limit 200
  ) as event;

  return coalesce(result, jsonb_build_object('events', '[]'::jsonb));
end;
$$;

revoke all on function public.list_club_events(uuid) from public, anon;
grant execute on function public.list_club_events(uuid) to authenticated;

commit;
