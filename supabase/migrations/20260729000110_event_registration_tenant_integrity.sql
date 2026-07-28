begin;

alter table public.club_events
  add constraint club_events_id_club_unique unique (id, club_id);

alter table public.event_registrations
  drop constraint event_registrations_event_id_fkey;

alter table public.event_registrations
  add constraint event_registrations_event_club_fkey
  foreign key (event_id, club_id)
  references public.club_events (id, club_id)
  on delete restrict;

create or replace function public.protect_club_event_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.id is distinct from new.id
     or old.club_id is distinct from new.club_id
     or old.created_by_app_account_id is distinct from new.created_by_app_account_id
     or old.created_at is distinct from new.created_at then
    raise exception using errcode = '23514', message = 'club_event_immutable_field';
  end if;

  if old.event_status in ('cancelled', 'completed') and new.event_status is distinct from old.event_status then
    raise exception using errcode = '23514', message = 'club_event_terminal_status';
  end if;
  if old.event_status = 'published' and new.event_status = 'draft' then
    raise exception using errcode = '23514', message = 'club_event_cannot_return_to_draft';
  end if;

  new.title := btrim(new.title);
  new.description := btrim(new.description);
  new.location := btrim(new.location);
  new.updated_at := now();
  new.version := old.version + 1;

  if new.event_status = 'published' then
    new.published_at := coalesce(old.published_at, now());
  end if;
  if new.event_status = 'cancelled' then
    new.cancelled_at := coalesce(old.cancelled_at, now());
    new.cancellation_reason := btrim(coalesce(new.cancellation_reason, ''));
  end if;
  return new;
end;
$$;

create or replace function public.protect_event_registration_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.id is distinct from new.id
     or old.club_id is distinct from new.club_id
     or old.event_id is distinct from new.event_id
     or old.app_account_id is distinct from new.app_account_id
     or old.created_at is distinct from new.created_at then
    raise exception using errcode = '23514', message = 'event_registration_immutable_field';
  end if;
  new.note := btrim(new.note);
  new.updated_at := now();
  if new.response = 'pending' then
    new.responded_at := null;
    new.guest_count := 0;
  else
    new.responded_at := now();
    if new.response = 'declined' then new.guest_count := 0; end if;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_club_event_update() from public, anon, authenticated;
revoke all on function public.protect_event_registration_update() from public, anon, authenticated;

commit;
