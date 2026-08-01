begin;

-- A draft or scheduled announcement has no publication metadata. Its first
-- state transition to published must be able to set those fields exactly once;
-- every later change remains forbidden.
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

  if (old.published_by_account_id is distinct from new.published_by_account_id
      or old.published_at is distinct from new.published_at)
    and not (
      old.status in ('draft', 'scheduled')
      and new.status = 'published'
      and old.published_by_account_id is null
      and old.published_at is null
      and new.published_by_account_id is not null
      and new.published_at is not null
    ) then
    raise exception using errcode = '23514', message = 'announcement_identity_immutable';
  end if;

  if old.status in ('published', 'expired', 'cancelled', 'archived')
    and (old.title is distinct from new.title or old.body is distinct from new.body) then
    raise exception using errcode = '23514', message = 'published_announcement_content_immutable';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

commit;
