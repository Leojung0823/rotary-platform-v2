begin;

-- V0.9 extends the existing message centre with durable drafts and a scheduled
-- in-app publication queue. The existing immediate-send RPC remains intact;
-- scheduled publication never calls a LINE or Email provider.

alter table public.club_messages
  alter column published_at drop not null,
  add column scheduled_at timestamptz,
  add column expires_at timestamptz,
  add column pinned_at timestamptz,
  add column cancelled_at timestamptz,
  add column archived_at timestamptz,
  add column expired_at timestamptz,
  add column failed_at timestamptz;

alter table public.club_messages
  drop constraint club_messages_status_check,
  add constraint club_messages_status_check check (status in (
    'draft', 'scheduled', 'active', 'cancelled', 'archived', 'expired', 'failed', 'deleted'
  )),
  drop constraint club_messages_deleted_consistency,
  add constraint club_messages_deleted_consistency check (
    (status = 'deleted' and deleted_at is not null)
    or (status <> 'deleted' and deleted_at is null)
  ),
  add constraint club_messages_publication_time_consistency check (
    (status in ('draft', 'scheduled', 'cancelled', 'failed') and published_at is null)
    or (status in ('active', 'archived', 'expired', 'deleted') and published_at is not null)
  ),
  add constraint club_messages_schedule_time_consistency check (
    (status = 'draft' and scheduled_at is null)
    or (status <> 'draft')
  ),
  add constraint club_messages_lifecycle_time_consistency check (
    (status = 'cancelled' and cancelled_at is not null or status <> 'cancelled' and cancelled_at is null)
    and (status = 'archived' and archived_at is not null or status <> 'archived' and archived_at is null)
    and (status = 'expired' and expired_at is not null or status <> 'expired' and expired_at is null)
    and (status = 'failed' and failed_at is not null or status <> 'failed' and failed_at is null)
    and (pinned_at is null or status = 'active')
  );

comment on column public.club_messages.scheduled_at is
  'Requested publication time for a scheduled message; the audience snapshot is refreshed when it is scheduled or published.';
comment on column public.club_messages.expires_at is
  'A published message is hidden by the scheduler at or after this timestamp.';
comment on column public.club_messages.pinned_at is
  'When set, the published message appears in the member inbox pinned section.';

-- Draft/scheduled audience snapshots live in the existing recipient table but
-- are not delivered until delivered_at is set. All current published messages
-- are backfilled as already delivered; future instant sends keep the default.
alter table public.club_message_recipients
  add column delivered_at timestamptz;

update public.club_message_recipients
set delivered_at = created_at;

alter table public.club_message_recipients
  alter column delivered_at set default now(),
  add constraint club_message_recipient_read_requires_delivery
    check (read_at is null or delivered_at is not null);

create index club_message_scheduled_due_idx
  on public.club_messages (scheduled_at, id)
  where status = 'scheduled';

create index club_message_expiration_due_idx
  on public.club_messages (expires_at, id)
  where status = 'active' and expires_at is not null;

create table public.club_message_scheduled_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  message_id uuid not null unique,
  club_id uuid not null references public.clubs(id) on delete restrict,
  available_at timestamptz not null,
  job_status text not null default 'queued',
  attempt_count integer not null default 0,
  max_attempts integer not null default 8,
  last_error_code text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_message_scheduled_job_message_club_fkey
    foreign key (message_id, club_id)
    references public.club_messages (id, club_id) on delete restrict,
  constraint club_message_scheduled_job_status_check
    check (job_status in ('queued', 'processing', 'completed', 'cancelled', 'dead')),
  constraint club_message_scheduled_job_attempts_check
    check (attempt_count >= 0 and max_attempts between 1 and 12 and attempt_count <= max_attempts),
  constraint club_message_scheduled_job_error_check
    check (last_error_code is null or last_error_code in (
      'processing_error', 'serialization_failure', 'deadlock', 'lock_unavailable', 'retry_limit_exceeded'
    )),
  constraint club_message_scheduled_job_completion_check
    check ((job_status in ('completed', 'cancelled', 'dead')) = (completed_at is not null))
);

create index club_message_scheduled_jobs_ready_idx
  on public.club_message_scheduled_jobs (available_at, created_at, id)
  where job_status = 'queued';

create table public.club_message_audit_events (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  message_id uuid not null,
  actor_app_account_id uuid references public.app_accounts(id) on delete restrict,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  constraint club_message_audit_event_message_club_fkey
    foreign key (message_id, club_id)
    references public.club_messages (id, club_id) on delete restrict,
  constraint club_message_audit_event_type_check check (event_type in (
    'draft_created', 'draft_updated', 'scheduled', 'published', 'cancelled',
    'archived', 'expired', 'failed', 'withdrawn', 'pinned', 'unpinned',
    'retry_scheduled', 'retry_exhausted', 'skipped'
  )),
  constraint club_message_audit_event_details_check
    check (jsonb_typeof(details) = 'object'
      and not (details ? 'title')
      and not (details ? 'body')
      and not (details ? 'email')
      and not (details ? 'oa_user_id'))
);

create index club_message_audit_events_message_idx
  on public.club_message_audit_events (club_id, message_id, occurred_at desc, id desc);

alter table public.club_message_scheduled_jobs enable row level security;
alter table public.club_message_audit_events enable row level security;
revoke all on table public.club_message_scheduled_jobs from public, anon, authenticated, service_role;
revoke all on table public.club_message_audit_events from public, anon, authenticated, service_role;

create or replace function public.protect_club_message_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public, auth
as $$
begin
  if old.club_id is distinct from new.club_id then
    raise exception using errcode = '23514', message = 'club_message_club_immutable';
  end if;
  if old.author_app_account_id is distinct from new.author_app_account_id then
    raise exception using errcode = '23514', message = 'club_message_author_immutable';
  end if;
  if old.created_at is distinct from new.created_at then
    raise exception using errcode = '23514', message = 'club_message_created_at_immutable';
  end if;
  if old.published_at is distinct from new.published_at
     and not (old.published_at is null and new.published_at is not null and new.status = 'active') then
    raise exception using errcode = '23514', message = 'club_message_published_at_immutable';
  end if;

  if old.status in ('cancelled', 'archived', 'expired', 'failed', 'deleted')
     and new.status is distinct from old.status then
    raise exception using errcode = '23514', message = 'club_message_terminal_status';
  end if;
  if old.status = 'draft' and new.status not in ('draft', 'scheduled', 'active') then
    raise exception using errcode = '23514', message = 'club_message_invalid_draft_transition';
  end if;
  if old.status = 'scheduled' and new.status not in ('scheduled', 'active', 'cancelled', 'failed') then
    raise exception using errcode = '23514', message = 'club_message_invalid_schedule_transition';
  end if;
  if old.status = 'active' and new.status not in ('active', 'archived', 'expired', 'deleted') then
    raise exception using errcode = '23514', message = 'club_message_invalid_published_transition';
  end if;

  if new.status <> 'deleted' then new.deleted_at := null;
  else new.deleted_at := coalesce(old.deleted_at, now()); end if;
  if new.status <> 'cancelled' then new.cancelled_at := null;
  else new.cancelled_at := coalesce(old.cancelled_at, now()); end if;
  if new.status <> 'archived' then new.archived_at := null;
  else new.archived_at := coalesce(old.archived_at, now()); end if;
  if new.status <> 'expired' then new.expired_at := null;
  else new.expired_at := coalesce(old.expired_at, now()); end if;
  if new.status <> 'failed' then new.failed_at := null;
  else new.failed_at := coalesce(old.failed_at, now()); end if;
  if new.status <> 'active' then new.pinned_at := null; end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.protect_club_message_recipient_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.message_id is distinct from new.message_id
     or old.membership_id is distinct from new.membership_id
     or old.club_id is distinct from new.club_id
     or old.created_at is distinct from new.created_at
     or (old.delivered_at is not null and old.delivered_at is distinct from new.delivered_at)
     or (old.read_at is not null and old.read_at is distinct from new.read_at)
     or (new.read_at is not null and new.delivered_at is null) then
    raise exception using errcode = '23514', message = 'club_message_recipient_immutable';
  end if;

  if old.delivered_at is null and new.delivered_at is not null
     and not exists (
       select 1 from public.club_messages as message
       where message.id = new.message_id
         and message.club_id = new.club_id
         and message.status = 'active'
         and message.published_at = new.delivered_at
     ) then
    raise exception using errcode = '23514', message = 'club_message_recipient_delivery_requires_publication';
  end if;

  return new;
end;
$$;

create or replace function public.audit_club_message_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  audit_type text;
  audit_details jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    audit_type := case new.status when 'draft' then 'draft_created' when 'scheduled' then 'scheduled' else 'published' end;
    audit_details := jsonb_strip_nulls(jsonb_build_object(
      'scheduled_at', new.scheduled_at,
      'expires_at', new.expires_at,
      'audience_kind', new.audience_kind
    ));
  elsif old.status is distinct from new.status then
    audit_type := case new.status
      when 'scheduled' then 'scheduled'
      when 'active' then 'published'
      when 'cancelled' then 'cancelled'
      when 'archived' then 'archived'
      when 'expired' then 'expired'
      when 'failed' then 'failed'
      when 'deleted' then 'withdrawn'
      else 'draft_updated'
    end;
    audit_details := jsonb_strip_nulls(jsonb_build_object(
      'from', old.status,
      'to', new.status,
      'scheduled_at', new.scheduled_at,
      'expires_at', new.expires_at
    ));
  elsif old.pinned_at is distinct from new.pinned_at then
    audit_type := case when new.pinned_at is null then 'unpinned' else 'pinned' end;
    audit_details := jsonb_build_object('pinned', new.pinned_at is not null);
  else
    audit_type := 'draft_updated';
  end if;

  insert into public.club_message_audit_events (
    club_id, message_id, actor_app_account_id, event_type, details
  ) values (
    new.club_id, new.id, public.current_app_account_id(), audit_type, audit_details
  );
  return new;
end;
$$;

drop trigger if exists club_messages_audit_lifecycle on public.club_messages;
create trigger club_messages_audit_lifecycle
after insert or update on public.club_messages
for each row execute function public.audit_club_message_lifecycle();

create or replace function public.prevent_club_message_audit_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = '42501', message = 'club_message_audit_append_only';
end;
$$;

create trigger club_message_audit_events_no_update
before update or delete on public.club_message_audit_events
for each row execute function public.prevent_club_message_audit_mutation();

create or replace function public.is_club_message_scheduler_enabled(p_environment text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce(p_environment in ('staging', 'production') and exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'announcements_v09'
      and flag.enabled
      and flag.rollout_percentage = 100
      and p_environment = any(flag.enabled_environments)
  ), false)
$$;

-- Refresh the fixed audience immediately before a draft is scheduled or
-- published. This keeps a long-lived draft from delivering to people whose
-- membership/account ceased to be eligible while it was being prepared.
create or replace function public.refresh_club_message_audience_snapshot(
  p_club_id uuid,
  p_message_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  message public.club_messages;
  wanted_tags uuid[] := '{}'::uuid[];
  wanted_members uuid[] := '{}'::uuid[];
  audience jsonb;
  recipient_count integer;
begin
  select * into message from public.club_messages
  where id = p_message_id and club_id = p_club_id and status = 'draft'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'club_message_not_available';
  end if;

  if message.audience_kind = 'tags' then
    select coalesce(array_agg(tag_id order by tag_id), '{}'::uuid[])
    into wanted_tags
    from public.club_message_audiences
    where message_id = p_message_id and club_id = p_club_id;
  elsif message.audience_kind = 'members' then
    select coalesce(array_agg(membership_id order by membership_id), '{}'::uuid[])
    into wanted_members
    from public.club_message_recipients
    where message_id = p_message_id and club_id = p_club_id and delivered_at is null;
  end if;

  audience := public.resolve_club_audience(p_club_id, wanted_tags, wanted_members);
  recipient_count := jsonb_array_length(coalesce(audience -> 'members', '[]'::jsonb));
  delete from public.club_message_recipients
  where message_id = p_message_id and club_id = p_club_id;
  insert into public.club_message_recipients (message_id, membership_id, club_id, read_at, delivered_at)
  select p_message_id, (addressed ->> 'membership_id')::uuid, p_club_id, null, null
  from jsonb_array_elements(coalesce(audience -> 'members', '[]'::jsonb)) as addressed;
  return recipient_count;
end;
$$;

create or replace function public.save_club_message_draft(
  p_club_id uuid,
  p_message_id uuid,
  p_title text,
  p_body text,
  p_tag_ids uuid[] default '{}'::uuid[],
  p_membership_ids uuid[] default '{}'::uuid[],
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  normalized_title text := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  normalized_body text := public.normalize_board_post_content(p_body);
  wanted_tags uuid[] := coalesce(p_tag_ids, '{}'::uuid[]);
  wanted_members uuid[] := coalesce(p_membership_ids, '{}'::uuid[]);
  audience jsonb;
  message public.club_messages;
  audience_size integer;
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'member.manage')
     or not exists (select 1 from public.clubs where id = p_club_id and club_status = 'active') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;
  if normalized_title = '' or char_length(normalized_title) > 120
     or normalized_body is null or normalized_body = '' or char_length(normalized_body) > 4000
     or (p_expires_at is not null and p_expires_at <= now()) then
    raise exception using errcode = '22023', message = 'invalid_message_draft';
  end if;
  if coalesce(array_length(wanted_tags, 1), 0) > 0
     and coalesce(array_length(wanted_members, 1), 0) > 0 then
    raise exception using errcode = '22023', message = 'invalid_message_audience';
  end if;
  if exists (
    select 1 from unnest(wanted_tags) as requested(tag_id)
    where not exists (
      select 1 from public.club_member_tags as tag
      where tag.id = requested.tag_id and tag.club_id = p_club_id and tag.tag_status = 'active'
    )
  ) or exists (
    select 1 from unnest(wanted_members) as requested(membership_id)
    where not exists (
      select 1 from public.club_memberships as membership
      where membership.id = requested.membership_id
        and membership.club_id = p_club_id
        and membership.membership_status = 'active'
    )
  ) then
    raise exception using errcode = '22023', message = 'invalid_message_audience';
  end if;

  audience := public.resolve_club_audience(p_club_id, wanted_tags, wanted_members);
  audience_size := jsonb_array_length(coalesce(audience -> 'members', '[]'::jsonb));
  if audience_size < 1 then
    raise exception using errcode = '22023', message = 'empty_message_audience';
  end if;

  if p_message_id is null then
    insert into public.club_messages (
      club_id, author_app_account_id, title, body, audience_kind, status, published_at, expires_at
    ) values (
      p_club_id, actor_id, normalized_title, normalized_body,
      case when cardinality(wanted_tags) > 0 then 'tags'
        when cardinality(wanted_members) > 0 then 'members' else 'everyone' end,
      'draft', null, p_expires_at
    ) returning * into message;
  else
    select * into message from public.club_messages
    where id = p_message_id and club_id = p_club_id and status = 'draft'
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'club_message_not_available';
    end if;
    update public.club_messages as current_message
    set title = normalized_title,
        body = normalized_body,
        audience_kind = case when cardinality(wanted_tags) > 0 then 'tags'
          when cardinality(wanted_members) > 0 then 'members' else 'everyone' end,
        expires_at = p_expires_at
    where current_message.id = message.id and current_message.club_id = p_club_id
    returning * into message;
    delete from public.club_message_recipients where message_id = message.id and club_id = p_club_id;
    delete from public.club_message_audiences where message_id = message.id and club_id = p_club_id;
  end if;

  insert into public.club_message_audiences (message_id, tag_id, club_id)
  select message.id, requested.tag_id, p_club_id
  from unnest(wanted_tags) as requested(tag_id);

  insert into public.club_message_recipients (message_id, membership_id, club_id, read_at, delivered_at)
  select message.id, (addressed ->> 'membership_id')::uuid, p_club_id, null, null
  from jsonb_array_elements(coalesce(audience -> 'members', '[]'::jsonb)) as addressed;

  return jsonb_build_object(
    'id', message.id,
    'title', message.title,
    'body', message.body,
    'audience_kind', message.audience_kind,
    'status', message.status,
    'scheduled_at', message.scheduled_at,
    'expires_at', message.expires_at,
    'recipient_count', audience_size,
    'read_count', 0,
    'pinned_at', message.pinned_at,
    'created_at', message.created_at,
    'updated_at', message.updated_at,
    'audience_tag_ids', to_jsonb(wanted_tags),
    'audience_membership_ids', to_jsonb(wanted_members)
  );
end;
$$;

create or replace function public.schedule_club_message(
  p_club_id uuid,
  p_message_id uuid,
  p_scheduled_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  message public.club_messages;
  eligible_count integer;
begin
  if public.current_app_account_id() is null
     or not public.current_has_club_permission(p_club_id, 'member.manage')
     or not exists (select 1 from public.clubs where id = p_club_id and club_status = 'active') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;
  if p_scheduled_at is null or p_scheduled_at <= now() then
    raise exception using errcode = '22023', message = 'invalid_message_schedule_time';
  end if;

  select * into message from public.club_messages
  where id = p_message_id and club_id = p_club_id and status = 'draft'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'club_message_not_available';
  end if;
  if message.expires_at is not null and message.expires_at <= p_scheduled_at then
    raise exception using errcode = '22023', message = 'message_expiry_before_schedule';
  end if;

  eligible_count := public.refresh_club_message_audience_snapshot(p_club_id, message.id);
  if eligible_count = 0 then
    raise exception using errcode = '22023', message = 'empty_active_message_audience';
  end if;

  update public.club_messages
  set status = 'scheduled', scheduled_at = p_scheduled_at
  where id = message.id and club_id = p_club_id;

  insert into public.club_message_scheduled_jobs (message_id, club_id, available_at)
  values (message.id, p_club_id, p_scheduled_at)
  on conflict (message_id) do update
    set available_at = excluded.available_at,
        job_status = 'queued',
        attempt_count = 0,
        last_error_code = null,
        completed_at = null,
        updated_at = now()
  where public.club_message_scheduled_jobs.job_status in ('cancelled', 'dead');

  return jsonb_build_object('id', message.id, 'status', 'scheduled', 'scheduled_at', p_scheduled_at);
end;
$$;

create or replace function public.publish_club_message_draft_now(p_club_id uuid, p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_club_membership_id(p_club_id);
  message public.club_messages;
  publication_time timestamptz := now();
  eligible_count integer;
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'member.manage')
     or not exists (select 1 from public.clubs where id = p_club_id and club_status = 'active') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;
  select * into message from public.club_messages
  where id = p_message_id and club_id = p_club_id and status = 'draft'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'club_message_not_available';
  end if;
  if message.expires_at is not null and message.expires_at <= publication_time then
    raise exception using errcode = '22023', message = 'message_expired';
  end if;

  eligible_count := public.refresh_club_message_audience_snapshot(p_club_id, message.id);
  if eligible_count = 0 then
    raise exception using errcode = '22023', message = 'empty_active_message_audience';
  end if;

  update public.club_messages
  set status = 'active', published_at = publication_time
  where id = message.id and club_id = p_club_id;
  update public.club_message_recipients as recipient
  set delivered_at = publication_time,
      read_at = case when recipient.membership_id = actor_membership_id then publication_time end
  from public.club_memberships as membership
  join public.app_accounts as account
    on account.person_id = membership.person_id
   and account.account_status = 'active'
   and account.auth_user_id is not null
  where recipient.message_id = message.id
    and recipient.club_id = p_club_id
    and recipient.membership_id = membership.id
    and membership.club_id = p_club_id
    and membership.membership_status = 'active'
    and recipient.delivered_at is null;

  return jsonb_build_object('id', message.id, 'status', 'active', 'published_at', publication_time,
    'recipient_count', eligible_count);
end;
$$;

create or replace function public.cancel_scheduled_club_message(p_club_id uuid, p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  changed uuid;
begin
  if public.current_app_account_id() is null
     or not public.current_has_club_permission(p_club_id, 'member.manage') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;
  update public.club_messages
  set status = 'cancelled', cancelled_at = now()
  where id = p_message_id and club_id = p_club_id and status = 'scheduled'
  returning id into changed;
  if changed is null then
    raise exception using errcode = 'P0002', message = 'club_message_not_available';
  end if;
  update public.club_message_scheduled_jobs
  set job_status = 'cancelled', completed_at = now(), updated_at = now()
  where message_id = changed and club_id = p_club_id and job_status in ('queued', 'processing');
  return jsonb_build_object('id', changed, 'status', 'cancelled');
end;
$$;

create or replace function public.set_club_message_pinned(
  p_club_id uuid,
  p_message_id uuid,
  p_pinned boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  pinned_time timestamptz := case when p_pinned then now() end;
  changed uuid;
begin
  if public.current_app_account_id() is null
     or not public.current_has_club_permission(p_club_id, 'member.manage') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;
  update public.club_messages
  set pinned_at = pinned_time
  where id = p_message_id and club_id = p_club_id and status = 'active'
    and (expires_at is null or expires_at > now())
    and pinned_at is distinct from pinned_time
  returning id into changed;
  if changed is null then
    if exists (select 1 from public.club_messages where id = p_message_id and club_id = p_club_id
      and status = 'active' and pinned_at is not distinct from pinned_time) then
      return jsonb_build_object('id', p_message_id, 'pinned', p_pinned, 'idempotent', true);
    end if;
    raise exception using errcode = 'P0002', message = 'club_message_not_available';
  end if;
  return jsonb_build_object('id', changed, 'pinned', p_pinned, 'idempotent', false);
end;
$$;

create or replace function public.archive_club_message(p_club_id uuid, p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  changed uuid;
begin
  if public.current_app_account_id() is null
     or not public.current_has_club_permission(p_club_id, 'member.manage') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;
  update public.club_messages
  set status = 'archived', archived_at = now()
  where id = p_message_id and club_id = p_club_id and status = 'active'
  returning id into changed;
  if changed is null then
    raise exception using errcode = 'P0002', message = 'club_message_not_available';
  end if;
  return jsonb_build_object('id', changed, 'status', 'archived');
end;
$$;

create or replace function public.list_club_message_lifecycle(p_club_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  result jsonb;
begin
  if public.current_app_account_id() is null
     or not public.current_has_club_permission(p_club_id, 'member.manage') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'invalid_message_limit';
  end if;

  select coalesce(jsonb_agg(item order by item->>'updated_at' desc), '[]'::jsonb)
  into result
  from (
    select jsonb_build_object(
      'id', message.id,
      'title', message.title,
      'body', message.body,
      'status', message.status,
      'audience_kind', message.audience_kind,
      'scheduled_at', message.scheduled_at,
      'published_at', message.published_at,
      'expires_at', message.expires_at,
      'pinned_at', message.pinned_at,
      'created_at', message.created_at,
      'updated_at', message.updated_at,
      'audience_tag_ids', coalesce((
        select jsonb_agg(addressed.tag_id order by addressed.tag_id)
        from public.club_message_audiences as addressed
        where addressed.message_id = message.id and addressed.club_id = p_club_id
      ), '[]'::jsonb),
      'audience_membership_ids', coalesce((
        select jsonb_agg(recipient.membership_id order by recipient.membership_id)
        from public.club_message_recipients as recipient
        where recipient.message_id = message.id and recipient.club_id = p_club_id
          and recipient.delivered_at is null
      ), '[]'::jsonb),
      'audience_tag_names', coalesce((
        select jsonb_agg(tag.tag_name order by tag.tag_name)
        from public.club_message_audiences as addressed
        join public.club_member_tags as tag on tag.id = addressed.tag_id
        where addressed.message_id = message.id and addressed.club_id = p_club_id
      ), '[]'::jsonb),
      'recipient_count', (select count(*) from public.club_message_recipients as recipient
        where recipient.message_id = message.id and recipient.club_id = p_club_id
          and (message.status in ('draft', 'scheduled', 'cancelled', 'failed') or recipient.delivered_at is not null)),
      'read_count', (select count(*) from public.club_message_recipients as recipient
        where recipient.message_id = message.id and recipient.club_id = p_club_id
          and recipient.delivered_at is not null and recipient.read_at is not null)
    ) as item
    from public.club_messages as message
    where message.club_id = p_club_id
      and message.status in ('draft', 'scheduled', 'active', 'cancelled', 'archived', 'expired', 'failed')
    order by message.updated_at desc, message.id desc
    limit p_limit
  ) as found;

  return jsonb_build_object('messages', result);
end;
$$;

-- Keep the member inbox cursor purely chronological. Pinned rows are projected
-- by list_my_pinned_club_messages and therefore cannot duplicate across pages.
create or replace function public.list_my_club_messages(
  p_club_id uuid,
  p_cursor_published_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  my_membership_id uuid := public.current_club_membership_id(p_club_id);
  result jsonb;
begin
  if not public.current_is_active_club_member(p_club_id) or my_membership_id is null then
    raise exception using errcode = '42501', message = 'active_club_membership_required';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using errcode = '22023', message = 'invalid_message_limit';
  end if;
  if (p_cursor_published_at is null) <> (p_cursor_id is null) then
    raise exception using errcode = '22023', message = 'invalid_message_cursor';
  end if;

  with page as materialized (
    select message.id, message.title, message.body, message.audience_kind,
      message.action_path, message.published_at, recipient.read_at,
      account.account_display_name as author_display_name,
      public.birthday_wish_action_status(
        birthday_assignment.participant_status, birthday_assignment.submission_status
      ) as action_status
    from public.club_message_recipients as recipient
    join public.club_messages as message on message.id = recipient.message_id
    join public.app_accounts as account on account.id = message.author_app_account_id
    left join lateral (
      select participant.participant_status, latest.submission_status
      from public.birthday_wish_campaign_participants as participant
      left join lateral (
        select submission.submission_status
        from public.birthday_wish_campaign_submissions as submission
        where submission.participant_id = participant.id
          and submission.club_id = participant.club_id
        order by submission.revision_number desc, submission.id desc
        limit 1
      ) as latest on true
      where participant.id = recipient.birthday_participant_id
        and participant.club_id = p_club_id
        and participant.assignee_membership_id = my_membership_id
      limit 1
    ) as birthday_assignment on true
    where recipient.club_id = p_club_id
      and recipient.membership_id = my_membership_id
      and recipient.delivered_at is not null
      and message.status = 'active'
      and message.pinned_at is null
      and (message.expires_at is null or message.expires_at > now())
      and (
        p_cursor_published_at is null
        or message.published_at < p_cursor_published_at
        or (message.published_at = p_cursor_published_at and message.id < p_cursor_id)
      )
    order by message.published_at desc, message.id desc
    limit p_limit + 1
  ), visible as materialized (
    select * from page
    order by published_at desc, id desc
    limit p_limit
  )
  select jsonb_build_object(
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', visible.id,
        'title', visible.title,
        'body', visible.body,
        'audience_kind', visible.audience_kind,
        'action_path', visible.action_path,
        'action_status', visible.action_status,
        'published_at', visible.published_at,
        'author_display_name', visible.author_display_name,
        'read_at', visible.read_at
      ) order by visible.published_at desc, visible.id desc)
      from visible
    ), '[]'::jsonb),
    'unread_count', public.my_unread_club_message_count(p_club_id),
    'next_cursor', case
      when (select count(*) from page) > p_limit then (
        select jsonb_build_object('v', 1, 'published_at', visible.published_at, 'id', visible.id)
        from visible
        order by visible.published_at asc, visible.id asc
        limit 1
      )
      else null
    end
  ) into result;
  return result;
end;
$$;

create or replace function public.my_unread_club_message_count(p_club_id uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select count(*)::integer
  from public.club_message_recipients as recipient
  join public.club_messages as message on message.id = recipient.message_id
  where recipient.club_id = p_club_id
    and recipient.membership_id = public.current_club_membership_id(p_club_id)
    and recipient.read_at is null
    and message.status = 'active'
    and (message.expires_at is null or message.expires_at > now())
$$;

-- Pinned notices are returned separately so the chronological inbox cursor
-- remains stable and a pinned row cannot be duplicated across pages.
create or replace function public.list_my_pinned_club_messages(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  my_membership_id uuid := public.current_club_membership_id(p_club_id);
  result jsonb;
begin
  if not public.current_is_active_club_member(p_club_id) or my_membership_id is null then
    raise exception using errcode = '42501', message = 'active_club_membership_required';
  end if;

  select coalesce(jsonb_agg(item order by published_at desc, id desc), '[]'::jsonb)
  into result
  from (
    select message.id, message.published_at,
      jsonb_build_object(
        'id', message.id,
        'title', message.title,
        'body', message.body,
        'audience_kind', message.audience_kind,
        'action_path', message.action_path,
        'action_status', public.birthday_wish_action_status(
          birthday_assignment.participant_status, birthday_assignment.submission_status
        ),
        'published_at', message.published_at,
        'author_display_name', account.account_display_name,
        'read_at', recipient.read_at
      ) as item
    from public.club_message_recipients as recipient
    join public.club_messages as message
      on message.id = recipient.message_id and message.club_id = recipient.club_id
    join public.app_accounts as account on account.id = message.author_app_account_id
    left join lateral (
      select participant.participant_status, latest.submission_status
      from public.birthday_wish_campaign_participants as participant
      left join lateral (
        select submission.submission_status
        from public.birthday_wish_campaign_submissions as submission
        where submission.participant_id = participant.id
          and submission.club_id = participant.club_id
        order by submission.revision_number desc, submission.id desc
        limit 1
      ) as latest on true
      where participant.id = recipient.birthday_participant_id
        and participant.club_id = p_club_id
        and participant.assignee_membership_id = my_membership_id
      limit 1
    ) as birthday_assignment on true
    where recipient.club_id = p_club_id
      and recipient.membership_id = my_membership_id
      and recipient.delivered_at is not null
      and message.status = 'active'
      and message.pinned_at is not null
      and (message.expires_at is null or message.expires_at > now())
    order by message.published_at desc, message.id desc
    limit 50
  ) as found;

  return result;
end;
$$;

create or replace function public.run_club_message_scheduler(p_as_of timestamptz, p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  job record;
  message public.club_messages;
  active_recipient_count integer;
  attempted integer;
  error_state text;
  safe_error_code text;
  next_time timestamptz;
  due_count integer := 0;
  published_count integer := 0;
  skipped_count integer := 0;
  retry_count integer := 0;
  dead_count integer := 0;
  expired_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_as_of is null or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'invalid_message_scheduler_request';
  end if;

  for job in
    select scheduled_job.id, scheduled_job.message_id, scheduled_job.club_id
    from public.club_message_scheduled_jobs as scheduled_job
    join public.club_messages as candidate
      on candidate.id = scheduled_job.message_id and candidate.club_id = scheduled_job.club_id
    where scheduled_job.job_status = 'queued'
      and scheduled_job.available_at <= p_as_of
      and candidate.status = 'scheduled'
      and candidate.scheduled_at <= p_as_of
    order by scheduled_job.available_at, scheduled_job.created_at, scheduled_job.id
    limit p_limit
    for update of scheduled_job skip locked
  loop
    due_count := due_count + 1;
    update public.club_message_scheduled_jobs
    set job_status = 'processing', attempt_count = attempt_count + 1, updated_at = p_as_of
    where id = job.id
    returning attempt_count into attempted;

    begin
      select * into message from public.club_messages
      where id = job.message_id and club_id = job.club_id and status = 'scheduled'
      for update;
      if not found then
        update public.club_message_scheduled_jobs
        set job_status = 'completed', completed_at = p_as_of, updated_at = p_as_of
        where id = job.id;
        skipped_count := skipped_count + 1;
      elsif message.expires_at is not null and message.expires_at <= p_as_of then
        update public.club_messages
        set status = 'cancelled', cancelled_at = p_as_of
        where id = message.id and club_id = message.club_id;
        update public.club_message_scheduled_jobs
        set job_status = 'completed', completed_at = p_as_of, updated_at = p_as_of
        where id = job.id;
        insert into public.club_message_audit_events (
          club_id, message_id, event_type, occurred_at, details
        ) values (job.club_id, job.message_id, 'skipped', p_as_of,
          jsonb_build_object('reason', 'expired_before_publish'));
        skipped_count := skipped_count + 1;
      elsif not exists (
        select 1 from public.clubs where id = job.club_id and club_status = 'active'
      ) then
        update public.club_messages
        set status = 'cancelled', cancelled_at = p_as_of
        where id = message.id and club_id = job.club_id;
        update public.club_message_scheduled_jobs
        set job_status = 'completed', completed_at = p_as_of, updated_at = p_as_of
        where id = job.id;
        insert into public.club_message_audit_events (
          club_id, message_id, event_type, occurred_at, details
        ) values (job.club_id, job.message_id, 'skipped', p_as_of,
          jsonb_build_object('reason', 'club_inactive'));
        skipped_count := skipped_count + 1;
      else
        select count(*) into active_recipient_count
        from public.club_message_recipients as recipient
        join public.club_memberships as membership
          on membership.id = recipient.membership_id
         and membership.club_id = job.club_id
         and membership.membership_status = 'active'
        join public.app_accounts as account
          on account.person_id = membership.person_id
         and account.account_status = 'active'
         and account.auth_user_id is not null
        where recipient.message_id = job.message_id
          and recipient.club_id = job.club_id
          and recipient.delivered_at is null;

        if active_recipient_count = 0 then
          update public.club_messages
          set status = 'cancelled', cancelled_at = p_as_of
          where id = message.id and club_id = job.club_id;
          update public.club_message_scheduled_jobs
          set job_status = 'completed', completed_at = p_as_of, updated_at = p_as_of
          where id = job.id;
          insert into public.club_message_audit_events (
            club_id, message_id, event_type, occurred_at, details
          ) values (job.club_id, job.message_id, 'skipped', p_as_of,
            jsonb_build_object('reason', 'no_active_recipients'));
          skipped_count := skipped_count + 1;
        else
          update public.club_messages
          set status = 'active', published_at = p_as_of
          where id = message.id and club_id = job.club_id;
          update public.club_message_recipients as recipient
          set delivered_at = p_as_of,
              read_at = case
                when recipient.membership_id = public.current_club_membership_id(job.club_id) then p_as_of
              end
          from public.club_memberships as membership
          join public.app_accounts as account
            on account.person_id = membership.person_id
           and account.account_status = 'active'
           and account.auth_user_id is not null
          where recipient.message_id = job.message_id
            and recipient.club_id = job.club_id
            and recipient.membership_id = membership.id
            and membership.club_id = job.club_id
            and membership.membership_status = 'active'
            and recipient.delivered_at is null;
          update public.club_message_scheduled_jobs
          set job_status = 'completed', completed_at = p_as_of, updated_at = p_as_of
          where id = job.id;
          published_count := published_count + 1;
        end if;
      end if;
    exception when others then
      get stacked diagnostics error_state = returned_sqlstate;
      safe_error_code := case error_state
        when '40001' then 'serialization_failure'
        when '40P01' then 'deadlock'
        when '55P03' then 'lock_unavailable'
        else 'processing_error'
      end;
      if attempted >= (select max_attempts from public.club_message_scheduled_jobs where id = job.id) then
        update public.club_message_scheduled_jobs
        set job_status = 'dead', last_error_code = 'retry_limit_exceeded',
            completed_at = p_as_of, updated_at = p_as_of
        where id = job.id;
        update public.club_messages
        set status = 'failed', failed_at = p_as_of
        where id = job.message_id and club_id = job.club_id and status = 'scheduled';
        insert into public.club_message_audit_events (
          club_id, message_id, event_type, occurred_at, details
        ) values (job.club_id, job.message_id, 'retry_exhausted', p_as_of,
          jsonb_build_object('attempt_count', attempted, 'error_code', safe_error_code));
        dead_count := dead_count + 1;
      else
        next_time := p_as_of + make_interval(secs => least(3600, 30 * power(2, attempted - 1)::integer));
        update public.club_message_scheduled_jobs
        set job_status = 'queued', available_at = next_time,
            last_error_code = safe_error_code, updated_at = p_as_of
        where id = job.id;
        insert into public.club_message_audit_events (
          club_id, message_id, event_type, occurred_at, details
        ) values (job.club_id, job.message_id, 'retry_scheduled', p_as_of,
          jsonb_build_object('attempt_count', attempted, 'error_code', safe_error_code,
            'available_at', next_time));
        retry_count := retry_count + 1;
      end if;
    end;
  end loop;

  with expired as (
    select candidate.id, candidate.club_id
    from public.club_messages as candidate
    where candidate.status = 'active'
      and candidate.expires_at is not null
      and candidate.expires_at <= p_as_of
    order by candidate.expires_at, candidate.id
    limit p_limit
    for update of candidate skip locked
  ), changed as (
    update public.club_messages as expired_message
    set status = 'expired', expired_at = p_as_of
    from expired
    where expired_message.id = expired.id and expired_message.club_id = expired.club_id
    returning expired_message.id
  )
  select count(*)::integer into expired_count from changed;

  return jsonb_build_object(
    'claimed', due_count,
    'published', published_count,
    'skipped', skipped_count,
    'retry_scheduled', retry_count,
    'failed', dead_count,
    'expired', expired_count
  );
end;
$$;

revoke all on function public.protect_club_message_update() from public, anon, authenticated;
revoke all on function public.protect_club_message_recipient_update() from public, anon, authenticated;
revoke all on function public.audit_club_message_lifecycle() from public, anon, authenticated;
revoke all on function public.prevent_club_message_audit_mutation() from public, anon, authenticated;
revoke all on function public.is_club_message_scheduler_enabled(text) from public, anon, authenticated;
revoke all on function public.refresh_club_message_audience_snapshot(uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_club_message_draft(uuid, uuid, text, text, uuid[], uuid[], timestamptz) from public, anon;
revoke all on function public.schedule_club_message(uuid, uuid, timestamptz) from public, anon;
revoke all on function public.publish_club_message_draft_now(uuid, uuid) from public, anon;
revoke all on function public.cancel_scheduled_club_message(uuid, uuid) from public, anon;
revoke all on function public.set_club_message_pinned(uuid, uuid, boolean) from public, anon;
revoke all on function public.archive_club_message(uuid, uuid) from public, anon;
revoke all on function public.list_club_message_lifecycle(uuid, integer) from public, anon;
revoke all on function public.list_my_pinned_club_messages(uuid) from public, anon;
revoke all on function public.run_club_message_scheduler(timestamptz, integer) from public, anon, authenticated;

grant execute on function public.save_club_message_draft(uuid, uuid, text, text, uuid[], uuid[], timestamptz) to authenticated;
grant execute on function public.schedule_club_message(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.publish_club_message_draft_now(uuid, uuid) to authenticated;
grant execute on function public.cancel_scheduled_club_message(uuid, uuid) to authenticated;
grant execute on function public.set_club_message_pinned(uuid, uuid, boolean) to authenticated;
grant execute on function public.archive_club_message(uuid, uuid) to authenticated;
grant execute on function public.list_club_message_lifecycle(uuid, integer) to authenticated;
grant execute on function public.list_my_pinned_club_messages(uuid) to authenticated;
grant execute on function public.is_club_message_scheduler_enabled(text) to service_role;
grant execute on function public.run_club_message_scheduler(timestamptz, integer) to service_role;

commit;
