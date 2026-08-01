begin;

insert into public.permissions (permission_key, description_zh_hant) values
  ('announcement.read', '查看自己可讀的社內公告'),
  ('announcement.manage', '建立、發布與管理社內公告'),
  ('notification.read', '查看自己的站內通知')
on conflict (permission_key) do nothing;

insert into public.role_permissions (role_key, permission_key)
select role_key, permission_key from (values
  ('platform_admin', 'announcement.read'), ('platform_admin', 'announcement.manage'), ('platform_admin', 'notification.read'),
  ('president', 'announcement.read'), ('president', 'announcement.manage'), ('president', 'notification.read'),
  ('secretary', 'announcement.read'), ('secretary', 'announcement.manage'), ('secretary', 'notification.read'),
  ('finance', 'announcement.read'), ('finance', 'notification.read'),
  ('member', 'announcement.read'), ('member', 'notification.read')
) as grants(role_key, permission_key)
on conflict do nothing;

alter table public.notification_settings
  add column if not exists in_app_enabled boolean not null default true;

create table public.club_announcements (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text not null check (char_length(btrim(body)) between 1 and 12000),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'expired', 'cancelled', 'archived')),
  publish_at timestamptz,
  expire_at timestamptz,
  pinned_until timestamptz,
  created_by_account_id uuid not null references public.app_accounts(id) on delete restrict,
  published_by_account_id uuid references public.app_accounts(id) on delete restrict,
  published_at timestamptz,
  cancelled_by_account_id uuid references public.app_accounts(id) on delete restrict,
  cancelled_at timestamptz,
  cancel_reason text,
  archived_by_account_id uuid references public.app_accounts(id) on delete restrict,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'scheduled' or publish_at > created_at),
  check (status <> 'published' or (published_at is not null and published_by_account_id is not null)),
  check (status <> 'cancelled' or (cancelled_at is not null and cancelled_by_account_id is not null and char_length(btrim(coalesce(cancel_reason, ''))) between 1 and 500)),
  check (status <> 'archived' or (archived_at is not null and archived_by_account_id is not null)),
  check (expire_at is null or publish_at is null or expire_at >= publish_at),
  check (pinned_until is null or publish_at is null or pinned_until >= publish_at)
);
create index club_announcements_active_idx on public.club_announcements (club_id, publish_at desc, id desc)
  where status in ('published', 'scheduled');

create table public.club_announcement_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  announcement_id uuid not null references public.club_announcements(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  title_snapshot text not null,
  body_snapshot text not null,
  audience_snapshot jsonb not null default '[]'::jsonb,
  status_transition text not null check (char_length(status_transition) between 1 and 64),
  created_by_account_id uuid not null references public.app_accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (announcement_id, version_number)
);

create table public.club_announcement_audiences (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  announcement_id uuid not null references public.club_announcements(id) on delete restrict,
  audience_type text not null check (audience_type in ('all_active_members', 'role', 'membership')),
  role_key text references public.role_definitions(role_key) on delete restrict,
  membership_id uuid references public.club_memberships(id) on delete restrict,
  created_at timestamptz not null default now(),
  check ((audience_type = 'all_active_members' and role_key is null and membership_id is null)
    or (audience_type = 'role' and role_key is not null and membership_id is null)
    or (audience_type = 'membership' and role_key is null and membership_id is not null)),
  unique nulls not distinct (announcement_id, audience_type, role_key, membership_id)
);

create table public.announcement_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  announcement_id uuid not null references public.club_announcements(id) on delete restrict,
  membership_id uuid not null references public.club_memberships(id) on delete restrict,
  first_seen_at timestamptz not null default now(),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (announcement_id, membership_id)
);

create table public.account_notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  account_id uuid not null references public.app_accounts(id) on delete restrict,
  membership_id uuid not null references public.club_memberships(id) on delete restrict,
  notification_type text not null check (notification_type in ('announcement_published', 'announcement_updated', 'announcement_scheduled', 'event_reminder', 'invitation')),
  title text not null check (char_length(title) between 1 and 160),
  body text not null check (char_length(body) between 1 and 1200),
  action_path text not null check (action_path ~ '^/(?!/)' and action_path !~ '[[:space:]]' and char_length(action_path) <= 512),
  source_type text not null check (char_length(source_type) between 1 and 64),
  source_id uuid not null,
  deduplication_key text not null check (char_length(deduplication_key) between 16 and 200),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (account_id, deduplication_key)
);
create index account_notifications_page_idx on public.account_notifications (account_id, created_at desc, id desc);

create table public.notification_deliveries (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  notification_id uuid not null references public.account_notifications(id) on delete restrict,
  account_id uuid not null references public.app_accounts(id) on delete restrict,
  membership_id uuid not null references public.club_memberships(id) on delete restrict,
  channel text not null check (channel in ('email', 'line')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'retry_wait', 'failed', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  claim_token_hash text,
  provider_message_id_hash text,
  generalized_error_code text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  check ((status <> 'processing') or (claimed_at is not null and claim_token_hash is not null)),
  check ((status <> 'sent') or sent_at is not null),
  check ((status <> 'failed') or failed_at is not null),
  unique (notification_id, channel)
);
create index notification_deliveries_claim_idx on public.notification_deliveries (status, next_attempt_at, created_at)
  where status in ('pending', 'retry_wait', 'processing');

create or replace function public.v09_announcement_protect_update()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if old.id is distinct from new.id or old.club_id is distinct from new.club_id
    or old.created_by_account_id is distinct from new.created_by_account_id or old.created_at is distinct from new.created_at
    or old.published_by_account_id is distinct from new.published_by_account_id or old.published_at is distinct from new.published_at then
    raise exception using errcode = '23514', message = 'announcement_identity_immutable';
  end if;
  if old.status in ('published', 'expired', 'cancelled', 'archived') and (old.title is distinct from new.title or old.body is distinct from new.body) then
    raise exception using errcode = '23514', message = 'published_announcement_content_immutable';
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.v09_immutable_history()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then raise exception using errcode = '42501', message = 'announcement_history_hard_delete_forbidden'; end if;
  if old is distinct from new then raise exception using errcode = '23514', message = 'announcement_history_immutable'; end if;
  return new;
end $$;

create or replace function public.v09_receipt_protect_update()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if old.id is distinct from new.id or old.club_id is distinct from new.club_id
    or old.announcement_id is distinct from new.announcement_id or old.membership_id is distinct from new.membership_id
    or old.created_at is distinct from new.created_at or old.first_seen_at is distinct from new.first_seen_at
    or (old.read_at is not null and old.read_at is distinct from new.read_at) then
    raise exception using errcode = '23514', message = 'announcement_receipt_identity_immutable';
  end if;
  return new;
end $$;

create or replace function public.v09_notification_protect_update()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if old.id is distinct from new.id or old.club_id is distinct from new.club_id or old.account_id is distinct from new.account_id
    or old.membership_id is distinct from new.membership_id or old.notification_type is distinct from new.notification_type
    or old.title is distinct from new.title or old.body is distinct from new.body or old.action_path is distinct from new.action_path
    or old.source_type is distinct from new.source_type or old.source_id is distinct from new.source_id
    or old.deduplication_key is distinct from new.deduplication_key or old.created_at is distinct from new.created_at
    or (old.read_at is not null and old.read_at is distinct from new.read_at) then
    raise exception using errcode = '23514', message = 'notification_identity_immutable';
  end if;
  return new;
end $$;

create or replace function public.v09_delivery_protect_update()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if old.id is distinct from new.id or old.club_id is distinct from new.club_id or old.notification_id is distinct from new.notification_id
    or old.account_id is distinct from new.account_id or old.membership_id is distinct from new.membership_id
    or old.channel is distinct from new.channel or old.created_at is distinct from new.created_at then
    raise exception using errcode = '23514', message = 'notification_delivery_identity_immutable';
  end if;
  return new;
end $$;

create trigger club_announcements_protect_update before update on public.club_announcements for each row execute function public.v09_announcement_protect_update();
create trigger club_announcements_prevent_delete before delete on public.club_announcements for each row execute function public.v09_immutable_history();
create trigger club_announcement_versions_immutable before update or delete on public.club_announcement_versions for each row execute function public.v09_immutable_history();
create trigger club_announcement_audiences_immutable before update or delete on public.club_announcement_audiences for each row execute function public.v09_immutable_history();
create trigger announcement_receipts_protect_update before update on public.announcement_receipts for each row execute function public.v09_receipt_protect_update();
create trigger announcement_receipts_prevent_delete before delete on public.announcement_receipts for each row execute function public.v09_immutable_history();
create trigger account_notifications_protect_update before update on public.account_notifications for each row execute function public.v09_notification_protect_update();
create trigger account_notifications_prevent_delete before delete on public.account_notifications for each row execute function public.v09_immutable_history();
create trigger notification_deliveries_protect_update before update on public.notification_deliveries for each row execute function public.v09_delivery_protect_update();
create trigger notification_deliveries_prevent_delete before delete on public.notification_deliveries for each row execute function public.v09_immutable_history();

alter table public.club_announcements enable row level security;
alter table public.club_announcement_versions enable row level security;
alter table public.club_announcement_audiences enable row level security;
alter table public.announcement_receipts enable row level security;
alter table public.account_notifications enable row level security;
alter table public.notification_deliveries enable row level security;
revoke all on table public.club_announcements, public.club_announcement_versions, public.club_announcement_audiences,
  public.announcement_receipts, public.account_notifications, public.notification_deliveries from public, anon, authenticated;
grant select, insert, update on table public.club_announcements, public.club_announcement_versions, public.club_announcement_audiences,
  public.announcement_receipts, public.account_notifications, public.notification_deliveries to service_role;

commit;
