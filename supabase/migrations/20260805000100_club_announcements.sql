begin;

insert into public.permissions (permission_key, description_zh_hant) values
  ('announcement.read', '查看社內公告'),
  ('announcement.manage', '建立、發布與封存社內公告')
on conflict (permission_key) do nothing;

insert into public.role_permissions (role_key, permission_key) values
  ('platform_admin', 'announcement.read'),
  ('platform_admin', 'announcement.manage'),
  ('president', 'announcement.read'),
  ('president', 'announcement.manage'),
  ('secretary', 'announcement.read'),
  ('secretary', 'announcement.manage'),
  ('finance', 'announcement.read'),
  ('member', 'announcement.read')
on conflict (role_key, permission_key) do nothing;

create table public.club_announcements (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  title text not null,
  body text not null,
  announcement_status text not null default 'draft',
  pinned boolean not null default false,
  requires_acknowledgement boolean not null default false,
  published_at timestamptz,
  expires_at timestamptz,
  created_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  updated_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint club_announcements_title_check check (
    btrim(title) <> '' and char_length(btrim(title)) <= 160
  ),
  constraint club_announcements_body_check check (
    btrim(body) <> '' and char_length(btrim(body)) <= 5000
  ),
  constraint club_announcements_status_check check (
    announcement_status in ('draft', 'published', 'archived', 'cancelled')
  ),
  constraint club_announcements_publish_consistency check (
    (announcement_status = 'draft' and published_at is null)
    or (announcement_status in ('published', 'archived', 'cancelled') and published_at is not null)
  ),
  constraint club_announcements_expiry_check check (
    expires_at is null or published_at is null or expires_at > published_at
  ),
  constraint club_announcements_id_club_unique unique (id, club_id)
);

create index club_announcements_member_feed_idx
  on public.club_announcements (club_id, pinned desc, published_at desc)
  where announcement_status = 'published';

create index club_announcements_management_idx
  on public.club_announcements (club_id, updated_at desc);

create table public.announcement_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  announcement_id uuid not null,
  club_id uuid not null,
  membership_id uuid not null,
  read_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcement_receipts_announcement_club_fkey
    foreign key (announcement_id, club_id)
    references public.club_announcements (id, club_id)
    on delete restrict,
  constraint announcement_receipts_membership_club_fkey
    foreign key (membership_id, club_id)
    references public.club_memberships (id, club_id)
    on delete restrict,
  constraint announcement_receipts_one_member unique (announcement_id, membership_id),
  constraint announcement_receipts_ack_check check (
    acknowledged_at is null or acknowledged_at >= read_at
  )
);

create index announcement_receipts_membership_idx
  on public.announcement_receipts (membership_id, read_at desc);

create or replace function public.current_can_manage_announcements(p_club_id uuid)
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
  ) and public.current_has_club_permission(p_club_id, 'announcement.manage')
$$;

create or replace function public.current_announcement_membership_id(p_club_id uuid)
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
  order by membership.created_at
  limit 1
$$;

create or replace function public.list_my_announcement_clubs()
returns table (
  club_id uuid,
  club_code text,
  club_name text,
  can_manage boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select club.id,
    club.club_code,
    club.club_name,
    public.current_can_manage_announcements(club.id)
  from public.clubs as club
  where club.club_status = 'active'
    and (
      public.current_announcement_membership_id(club.id) is not null
      or public.current_can_manage_announcements(club.id)
    )
  order by club.club_name, club.id
$$;

create or replace function public.list_club_announcements(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_membership_id uuid := public.current_announcement_membership_id(p_club_id);
  can_manage boolean := public.current_can_manage_announcements(p_club_id);
  result jsonb;
begin
  if actor_membership_id is null and not can_manage then
    raise exception using errcode = '42501', message = 'announcement_read_required';
  end if;

  select jsonb_build_object(
    'can_manage', can_manage,
    'announcements', coalesce(jsonb_agg(jsonb_build_object(
      'id', announcement.id,
      'club_id', announcement.club_id,
      'title', announcement.title,
      'body', announcement.body,
      'status', announcement.announcement_status,
      'pinned', announcement.pinned,
      'requires_acknowledgement', announcement.requires_acknowledgement,
      'published_at', announcement.published_at,
      'expires_at', announcement.expires_at,
      'version', announcement.version,
      'read_at', receipt.read_at,
      'acknowledged_at', receipt.acknowledged_at
    ) order by
      case when announcement.announcement_status = 'published' then 0 else 1 end,
      announcement.pinned desc,
      coalesce(announcement.published_at, announcement.updated_at) desc,
      announcement.id), '[]'::jsonb)
  ) into result
  from public.club_announcements as announcement
  left join public.announcement_receipts as receipt
    on receipt.announcement_id = announcement.id
   and receipt.membership_id = actor_membership_id
  where announcement.club_id = p_club_id
    and (
      can_manage
      or (
        announcement.announcement_status = 'published'
        and (announcement.expires_at is null or announcement.expires_at > now())
      )
    );

  return coalesce(result, jsonb_build_object('can_manage', can_manage, 'announcements', '[]'::jsonb));
end;
$$;

create or replace function public.save_club_announcement(
  p_club_id uuid,
  p_announcement_id uuid,
  p_title text,
  p_body text,
  p_pinned boolean,
  p_requires_acknowledgement boolean,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_announcements;
  saved public.club_announcements;
  normalized_title text := btrim(coalesce(p_title, ''));
  normalized_body text := btrim(coalesce(p_body, ''));
begin
  if actor_id is null or not public.current_can_manage_announcements(p_club_id) then
    raise exception using errcode = '42501', message = 'announcement_manage_required';
  end if;
  if normalized_title = '' or char_length(normalized_title) > 160
     or normalized_body = '' or char_length(normalized_body) > 5000
     or (p_expires_at is not null and p_expires_at <= now()) then
    raise exception using errcode = '22023', message = 'invalid_announcement_input';
  end if;

  if p_announcement_id is null then
    insert into public.club_announcements (
      club_id, title, body, pinned, requires_acknowledgement, expires_at,
      created_by_app_account_id, updated_by_app_account_id
    ) values (
      p_club_id, normalized_title, normalized_body, coalesce(p_pinned, false),
      coalesce(p_requires_acknowledgement, false), p_expires_at, actor_id, actor_id
    ) returning * into saved;

    insert into public.audit_logs (
      club_id, actor_app_account_id, action_key, subject_type, subject_id
    ) values (
      p_club_id, actor_id, 'announcement.created', 'club_announcement', saved.id
    );
  else
    select * into target
    from public.club_announcements
    where id = p_announcement_id and club_id = p_club_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'announcement_not_available';
    end if;
    if target.announcement_status in ('archived', 'cancelled') then
      raise exception using errcode = '22023', message = 'announcement_terminal';
    end if;
    if p_expires_at is not null
       and p_expires_at <= coalesce(target.published_at, now()) then
      raise exception using errcode = '22023', message = 'invalid_announcement_expiry';
    end if;

    update public.club_announcements
    set title = normalized_title,
      body = normalized_body,
      pinned = coalesce(p_pinned, false),
      requires_acknowledgement = coalesce(p_requires_acknowledgement, false),
      expires_at = p_expires_at,
      updated_by_app_account_id = actor_id,
      updated_at = now(),
      version = version + 1
    where id = target.id
    returning * into saved;

    insert into public.audit_logs (
      club_id, actor_app_account_id, action_key, subject_type, subject_id,
      metadata
    ) values (
      p_club_id, actor_id, 'announcement.updated', 'club_announcement', saved.id,
      jsonb_build_object('version', saved.version)
    );
  end if;

  return jsonb_build_object(
    'announcement_id', saved.id,
    'status', saved.announcement_status,
    'version', saved.version
  );
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
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_announcements;
begin
  if actor_id is null or not public.current_can_manage_announcements(p_club_id) then
    raise exception using errcode = '42501', message = 'announcement_manage_required';
  end if;

  select * into target
  from public.club_announcements
  where id = p_announcement_id and club_id = p_club_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'announcement_not_available';
  end if;
  if target.announcement_status = 'published' then
    return jsonb_build_object('announcement_id', target.id, 'status', 'published', 'idempotent', true);
  end if;
  if target.announcement_status <> 'draft'
     or (target.expires_at is not null and target.expires_at <= now()) then
    raise exception using errcode = '22023', message = 'announcement_cannot_publish';
  end if;

  update public.club_announcements
  set announcement_status = 'published',
    published_at = now(),
    updated_at = now(),
    updated_by_app_account_id = actor_id,
    version = version + 1
  where id = target.id
  returning * into target;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id,
    metadata
  ) values (
    p_club_id, actor_id, 'announcement.published', 'club_announcement', target.id,
    jsonb_build_object('version', target.version)
  );

  return jsonb_build_object('announcement_id', target.id, 'status', 'published', 'idempotent', false);
end;
$$;

create or replace function public.archive_club_announcement(
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
  reason text := btrim(coalesce(p_reason, ''));
begin
  if actor_id is null or not public.current_can_manage_announcements(p_club_id) then
    raise exception using errcode = '42501', message = 'announcement_manage_required';
  end if;
  if reason = '' or char_length(reason) > 500 then
    raise exception using errcode = '22023', message = 'announcement_archive_reason_required';
  end if;

  select * into target
  from public.club_announcements
  where id = p_announcement_id and club_id = p_club_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'announcement_not_available';
  end if;
  if target.announcement_status = 'archived' then return; end if;
  if target.announcement_status <> 'published' then
    raise exception using errcode = '22023', message = 'announcement_cannot_archive';
  end if;

  update public.club_announcements
  set announcement_status = 'archived',
    updated_at = now(),
    updated_by_app_account_id = actor_id,
    version = version + 1
  where id = target.id;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id,
    metadata
  ) values (
    p_club_id, actor_id, 'announcement.archived', 'club_announcement', target.id,
    jsonb_build_object('reason', reason)
  );
end;
$$;

create or replace function public.acknowledge_club_announcement(p_announcement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_announcements;
  actor_membership_id uuid;
  receipt public.announcement_receipts;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select * into target
  from public.club_announcements
  where id = p_announcement_id
    and announcement_status = 'published'
    and (expires_at is null or expires_at > now());
  if not found then
    raise exception using errcode = 'P0002', message = 'announcement_not_available';
  end if;

  actor_membership_id := public.current_announcement_membership_id(target.club_id);
  if actor_membership_id is null then
    raise exception using errcode = '42501', message = 'announcement_read_required';
  end if;

  insert into public.announcement_receipts (
    announcement_id, club_id, membership_id, acknowledged_at
  ) values (
    target.id, target.club_id, actor_membership_id,
    case when target.requires_acknowledgement then now() else null end
  )
  on conflict (announcement_id, membership_id) do update
  set read_at = least(public.announcement_receipts.read_at, excluded.read_at),
    acknowledged_at = case
      when target.requires_acknowledgement
        then coalesce(public.announcement_receipts.acknowledged_at, now())
      else public.announcement_receipts.acknowledged_at
    end,
    updated_at = now()
  returning * into receipt;

  if target.requires_acknowledgement then
    insert into public.audit_logs (
      club_id, actor_app_account_id, action_key, subject_type, subject_id
    ) values (
      target.club_id, actor_id, 'announcement.acknowledged', 'club_announcement', target.id
    );
  end if;

  return jsonb_build_object(
    'announcement_id', target.id,
    'read_at', receipt.read_at,
    'acknowledged_at', receipt.acknowledged_at
  );
end;
$$;

create or replace function public.protect_club_announcement_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.id is distinct from new.id
     or old.club_id is distinct from new.club_id
     or old.created_by_app_account_id is distinct from new.created_by_app_account_id
     or old.created_at is distinct from new.created_at
     or new.version <= old.version then
    raise exception using errcode = '23514', message = 'club_announcement_immutable_field';
  end if;
  if old.announcement_status in ('archived', 'cancelled') and new is distinct from old then
    raise exception using errcode = '23514', message = 'club_announcement_terminal';
  end if;
  return new;
end;
$$;

create trigger club_announcements_protect_update
before update on public.club_announcements
for each row execute function public.protect_club_announcement_update();

create or replace function public.prevent_announcement_hard_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = '42501', message = 'announcement_hard_delete_forbidden';
end;
$$;

create trigger club_announcements_prevent_delete
before delete on public.club_announcements
for each row execute function public.prevent_announcement_hard_delete();

create trigger announcement_receipts_prevent_delete
before delete on public.announcement_receipts
for each row execute function public.prevent_announcement_hard_delete();

alter table public.club_announcements enable row level security;
alter table public.announcement_receipts enable row level security;

revoke all on table public.club_announcements, public.announcement_receipts
  from public, anon, authenticated;
grant select, insert, update on table public.club_announcements, public.announcement_receipts
  to service_role;

revoke all on function public.current_can_manage_announcements(uuid) from public, anon, authenticated;
revoke all on function public.current_announcement_membership_id(uuid) from public, anon, authenticated;
revoke all on function public.protect_club_announcement_update() from public, anon, authenticated;
revoke all on function public.prevent_announcement_hard_delete() from public, anon, authenticated;
revoke all on function public.list_my_announcement_clubs() from public, anon;
revoke all on function public.list_club_announcements(uuid) from public, anon;
revoke all on function public.save_club_announcement(uuid, uuid, text, text, boolean, boolean, timestamptz) from public, anon;
revoke all on function public.publish_club_announcement(uuid, uuid) from public, anon;
revoke all on function public.archive_club_announcement(uuid, uuid, text) from public, anon;
revoke all on function public.acknowledge_club_announcement(uuid) from public, anon;

grant execute on function public.list_my_announcement_clubs() to authenticated;
grant execute on function public.list_club_announcements(uuid) to authenticated;
grant execute on function public.save_club_announcement(uuid, uuid, text, text, boolean, boolean, timestamptz) to authenticated;
grant execute on function public.publish_club_announcement(uuid, uuid) to authenticated;
grant execute on function public.archive_club_announcement(uuid, uuid, text) to authenticated;
grant execute on function public.acknowledge_club_announcement(uuid) to authenticated;

commit;
