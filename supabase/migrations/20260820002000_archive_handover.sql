begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rotary-archives',
  'rotary-archives',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'text/plain'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table public.rotary_years (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  start_year integer not null check (start_year between 2000 and 2200),
  theme text,
  president_name text,
  secretary_name text,
  handover_status text not null default 'preparation'
    check (handover_status in ('preparation', 'awaiting_confirmation', 'completed', 'needs_update')),
  created_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, start_year),
  constraint rotary_year_theme_length check (theme is null or char_length(theme) <= 160),
  constraint rotary_year_president_length check (president_name is null or char_length(president_name) <= 160),
  constraint rotary_year_secretary_length check (secretary_name is null or char_length(secretary_name) <= 160)
);

create table public.archive_items (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  rotary_year_id uuid not null references public.rotary_years(id) on delete restrict,
  category text not null check (category in (
    'meeting_minutes', 'service_photos', 'grant_documents', 'reports',
    'finance_summary', 'decisions', 'templates_handover', 'other'
  )),
  title text not null check (btrim(title) <> '' and char_length(title) <= 180),
  description text,
  folder_path text not null default '未分類',
  tags text[] not null default '{}'::text[],
  confidentiality text not null default 'club_internal'
    check (confidentiality in ('club_internal', 'officers_only')),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by_app_account_id uuid references public.app_accounts(id) on delete restrict,
  constraint archive_item_description_length check (description is null or char_length(description) <= 2000),
  constraint archive_item_folder_length check (btrim(folder_path) <> '' and char_length(folder_path) <= 240),
  constraint archive_item_tags_count check (cardinality(tags) <= 10),
  constraint archive_item_archive_consistency check (
    (status = 'active' and archived_at is null and archived_by_app_account_id is null)
    or (status = 'archived' and archived_at is not null and archived_by_app_account_id is not null)
  )
);

create index archive_items_club_year_category_idx
  on public.archive_items (club_id, rotary_year_id, category, updated_at desc, id desc)
  where status = 'active';

create index archive_items_tags_idx on public.archive_items using gin (tags);

create table public.archive_item_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  archive_item_id uuid not null references public.archive_items(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  original_filename text not null check (btrim(original_filename) <> '' and char_length(original_filename) <= 240),
  object_path text not null unique check (btrim(object_path) <> '' and char_length(object_path) <= 500),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 10485760),
  media_type text not null check (media_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg', 'image/png', 'text/plain'
  )),
  change_summary text,
  upload_status text not null default 'pending' check (upload_status in ('pending', 'ready', 'failed')),
  created_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  failure_reason text,
  unique (archive_item_id, version_number),
  constraint archive_version_summary_length check (change_summary is null or char_length(change_summary) <= 500),
  constraint archive_version_status_consistency check (
    (upload_status = 'pending' and completed_at is null and failure_reason is null)
    or (upload_status = 'ready' and completed_at is not null and failure_reason is null)
    or (upload_status = 'failed' and completed_at is not null and btrim(failure_reason) <> '')
  )
);

create index archive_versions_item_ready_idx
  on public.archive_item_versions (archive_item_id, version_number desc)
  where upload_status = 'ready';

create table public.handover_checklists (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  rotary_year_id uuid not null references public.rotary_years(id) on delete restrict,
  label text not null check (btrim(label) <> '' and char_length(label) <= 180),
  category text not null check (category in (
    'meeting_minutes', 'service_photos', 'grant_documents', 'reports',
    'finance_summary', 'decisions', 'templates_handover', 'other'
  )),
  is_required boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'ready', 'confirmed', 'needs_update')),
  archive_item_id uuid references public.archive_items(id) on delete restrict,
  notes text,
  sort_order integer not null default 0,
  updated_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint handover_checklist_notes_length check (notes is null or char_length(notes) <= 1000),
  constraint handover_confirmed_requires_item check (status <> 'confirmed' or archive_item_id is not null)
);

create index handover_checklists_year_order_idx
  on public.handover_checklists (rotary_year_id, sort_order, id);

create table public.handover_confirmations (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  rotary_year_id uuid not null references public.rotary_years(id) on delete restrict,
  confirmed_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  confirmation_role text not null check (confirmation_role in ('outgoing', 'incoming')),
  confirmation_text text not null check (btrim(confirmation_text) <> '' and char_length(confirmation_text) <= 500),
  confirmed_at timestamptz not null default now(),
  unique (rotary_year_id, confirmed_by_app_account_id, confirmation_role)
);

create index handover_confirmations_year_idx
  on public.handover_confirmations (rotary_year_id, confirmed_at, id);

comment on table public.rotary_years is 'Club-scoped Rotary years, running July 1 through June 30, with explicit handover state.';
comment on table public.archive_item_versions is 'Immutable metadata for private Storage objects. A new upload always creates a new version.';
comment on table public.handover_confirmations is 'Named, immutable confirmation that an authorized officer can access the handover material.';

create or replace function public.current_has_active_archive_membership(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
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
  )
$$;

create or replace function public.current_can_manage_archive(p_club_id uuid)
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
      and public.current_has_club_permission(p_club_id, 'member.manage')
  )
$$;

create or replace function public.current_can_access_archive(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.current_has_active_archive_membership(p_club_id)
    or public.current_can_manage_archive(p_club_id)
$$;

create or replace function public.normalize_archive_tags(p_tags text[])
returns text[]
language sql
immutable
set search_path = pg_catalog, public
as $$
  select coalesce(array_agg(tag order by tag), '{}'::text[])
  from (
    select distinct lower(btrim(value)) as tag
    from unnest(coalesce(p_tags, '{}'::text[])) as source(value)
    where btrim(value) <> '' and char_length(btrim(value)) <= 40
    limit 10
  ) as normalized
$$;

create or replace function public.prevent_archive_hard_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = '42501', message = 'archive_hard_delete_forbidden';
end;
$$;

create or replace function public.protect_archive_item_tenant()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare year_club_id uuid;
begin
  select year_record.club_id into year_club_id
  from public.rotary_years as year_record
  where year_record.id = new.rotary_year_id;
  if year_club_id is null or year_club_id <> new.club_id then
    raise exception using errcode = '23514', message = 'archive_item_year_club_mismatch';
  end if;
  if new.folder_path like '%..%' then
    raise exception using errcode = '23514', message = 'invalid_archive_folder';
  end if;
  if exists (select 1 from unnest(new.tags) as tag where btrim(tag) = '' or char_length(tag) > 40) then
    raise exception using errcode = '23514', message = 'invalid_archive_tags';
  end if;
  if tg_op = 'UPDATE' and (
    old.id is distinct from new.id
    or old.club_id is distinct from new.club_id
    or old.rotary_year_id is distinct from new.rotary_year_id
    or old.created_by_app_account_id is distinct from new.created_by_app_account_id
    or old.created_at is distinct from new.created_at
  ) then
    raise exception using errcode = '23514', message = 'archive_item_identity_immutable';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.protect_archive_version()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare item_club_id uuid;
begin
  select item.club_id into item_club_id
  from public.archive_items as item
  where item.id = new.archive_item_id;
  if item_club_id is null or item_club_id <> new.club_id then
    raise exception using errcode = '23514', message = 'archive_version_item_club_mismatch';
  end if;
  if tg_op = 'UPDATE' then
    if old.id is distinct from new.id
       or old.club_id is distinct from new.club_id
       or old.archive_item_id is distinct from new.archive_item_id
       or old.version_number is distinct from new.version_number
       or old.original_filename is distinct from new.original_filename
       or old.object_path is distinct from new.object_path
       or old.file_size_bytes is distinct from new.file_size_bytes
       or old.media_type is distinct from new.media_type
       or old.change_summary is distinct from new.change_summary
       or old.created_by_app_account_id is distinct from new.created_by_app_account_id
       or old.created_at is distinct from new.created_at then
      raise exception using errcode = '23514', message = 'archive_version_immutable';
    end if;
    if old.upload_status <> 'pending' or new.upload_status = 'pending' then
      raise exception using errcode = '23514', message = 'archive_version_status_transition_invalid';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.protect_handover_tenant()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  year_club_id uuid;
  item_year_id uuid;
begin
  select year_record.club_id into year_club_id
  from public.rotary_years as year_record
  where year_record.id = new.rotary_year_id;
  if year_club_id is null or year_club_id <> new.club_id then
    raise exception using errcode = '23514', message = 'handover_year_club_mismatch';
  end if;
  if new.archive_item_id is not null then
    select item.rotary_year_id into item_year_id
    from public.archive_items as item
    where item.id = new.archive_item_id and item.club_id = new.club_id and item.status = 'active';
    if item_year_id is null or item_year_id <> new.rotary_year_id then
      raise exception using errcode = '23514', message = 'handover_item_year_mismatch';
    end if;
  end if;
  if tg_op = 'UPDATE' and (
    old.id is distinct from new.id
    or old.club_id is distinct from new.club_id
    or old.rotary_year_id is distinct from new.rotary_year_id
    or old.created_at is distinct from new.created_at
  ) then
    raise exception using errcode = '23514', message = 'handover_checklist_identity_immutable';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger archive_items_protect before insert or update on public.archive_items
for each row execute function public.protect_archive_item_tenant();
create trigger archive_versions_protect before insert or update on public.archive_item_versions
for each row execute function public.protect_archive_version();
create trigger handover_checklists_protect before insert or update on public.handover_checklists
for each row execute function public.protect_handover_tenant();

create trigger rotary_years_prevent_delete before delete on public.rotary_years
for each row execute function public.prevent_archive_hard_delete();
create trigger archive_items_prevent_delete before delete on public.archive_items
for each row execute function public.prevent_archive_hard_delete();
create trigger archive_versions_prevent_delete before delete on public.archive_item_versions
for each row execute function public.prevent_archive_hard_delete();
create trigger handover_checklists_prevent_delete before delete on public.handover_checklists
for each row execute function public.prevent_archive_hard_delete();
create trigger handover_confirmations_prevent_delete before delete on public.handover_confirmations
for each row execute function public.prevent_archive_hard_delete();

alter table public.rotary_years enable row level security;
alter table public.archive_items enable row level security;
alter table public.archive_item_versions enable row level security;
alter table public.handover_checklists enable row level security;
alter table public.handover_confirmations enable row level security;
revoke all on table public.rotary_years from public, anon, authenticated;
revoke all on table public.archive_items from public, anon, authenticated;
revoke all on table public.archive_item_versions from public, anon, authenticated;
revoke all on table public.handover_checklists from public, anon, authenticated;
revoke all on table public.handover_confirmations from public, anon, authenticated;

create or replace function public.refresh_handover_status(p_rotary_year_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare next_status text;
begin
  if exists (
    select 1 from public.handover_checklists
    where rotary_year_id = p_rotary_year_id and is_required and status = 'needs_update'
  ) then
    next_status := 'needs_update';
  elsif exists (
    select 1 from public.handover_checklists
    where rotary_year_id = p_rotary_year_id and is_required and status <> 'confirmed'
  ) then
    next_status := 'preparation';
  elsif exists (
    select 1
    from public.handover_confirmations as outgoing
    join public.handover_confirmations as incoming
      on incoming.rotary_year_id = outgoing.rotary_year_id
     and incoming.confirmation_role = 'incoming'
     and incoming.confirmed_by_app_account_id <> outgoing.confirmed_by_app_account_id
    where outgoing.rotary_year_id = p_rotary_year_id
      and outgoing.confirmation_role = 'outgoing'
  ) then
    next_status := 'completed';
  else
    next_status := 'awaiting_confirmation';
  end if;

  update public.rotary_years
  set handover_status = next_status, updated_at = now()
  where id = p_rotary_year_id and handover_status is distinct from next_status;
end;
$$;

create or replace function public.get_my_archive_page(
  p_club_id uuid default null,
  p_rotary_year_id uuid default null,
  p_query text default null,
  p_category text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  selected_club_id uuid;
  selected_year_id uuid;
  can_manage boolean := false;
  normalized_query text := nullif(btrim(coalesce(p_query, '')), '');
  result jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'archive_authentication_required';
  end if;
  if normalized_query is not null and char_length(normalized_query) > 100 then
    raise exception using errcode = '22023', message = 'invalid_archive_query';
  end if;
  if p_category is not null and p_category not in (
    'meeting_minutes', 'service_photos', 'grant_documents', 'reports',
    'finance_summary', 'decisions', 'templates_handover', 'other'
  ) then
    raise exception using errcode = '22023', message = 'invalid_archive_category';
  end if;
  if p_club_id is not null and not public.current_can_access_archive(p_club_id) then
    raise exception using errcode = '42501', message = 'archive_club_access_required';
  end if;

  select coalesce(p_club_id, club.id)
  into selected_club_id
  from public.clubs as club
  where club.club_status = 'active' and public.current_can_access_archive(club.id)
  order by club.club_name, club.id
  limit 1;

  if selected_club_id is not null then
    can_manage := public.current_can_manage_archive(selected_club_id);
    if p_rotary_year_id is not null and not exists (
      select 1 from public.rotary_years
      where id = p_rotary_year_id and club_id = selected_club_id
    ) then
      raise exception using errcode = '42501', message = 'archive_year_access_required';
    end if;
    select coalesce(p_rotary_year_id, year_record.id)
    into selected_year_id
    from public.rotary_years as year_record
    where year_record.club_id = selected_club_id
    order by year_record.start_year desc, year_record.id
    limit 1;
  end if;

  select jsonb_build_object(
    'clubs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'club_id', club.id, 'club_code', club.club_code, 'club_name', club.club_name
      ) order by club.club_name, club.id)
      from public.clubs as club
      where club.club_status = 'active' and public.current_can_access_archive(club.id)
    ), '[]'::jsonb),
    'selected_club_id', selected_club_id,
    'can_manage', can_manage,
    'years', case when selected_club_id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', year_record.id,
        'start_year', year_record.start_year,
        'theme', year_record.theme,
        'president_name', year_record.president_name,
        'secretary_name', year_record.secretary_name,
        'handover_status', year_record.handover_status
      ) order by year_record.start_year desc, year_record.id)
      from public.rotary_years as year_record
      where year_record.club_id = selected_club_id
    ), '[]'::jsonb) end,
    'selected_year_id', selected_year_id,
    'items', case when selected_year_id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'category', item.category,
        'title', item.title,
        'description', item.description,
        'folder_path', item.folder_path,
        'tags', to_jsonb(item.tags),
        'confidentiality', item.confidentiality,
        'updated_at', item.updated_at,
        'versions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', version.id,
            'version_number', version.version_number,
            'original_filename', version.original_filename,
            'file_size_bytes', version.file_size_bytes,
            'media_type', version.media_type,
            'change_summary', version.change_summary,
            'created_at', version.created_at
          ) order by version.version_number desc)
          from public.archive_item_versions as version
          where version.archive_item_id = item.id and version.upload_status = 'ready'
        ), '[]'::jsonb)
      ) order by item.updated_at desc, item.id desc)
      from (
        select candidate.*
        from public.archive_items as candidate
        where candidate.club_id = selected_club_id
          and candidate.rotary_year_id = selected_year_id
          and candidate.status = 'active'
          and (candidate.confidentiality = 'club_internal' or can_manage)
          and (p_category is null or candidate.category = p_category)
          and (
            normalized_query is null
            or candidate.title ilike '%' || normalized_query || '%'
            or coalesce(candidate.description, '') ilike '%' || normalized_query || '%'
            or candidate.folder_path ilike '%' || normalized_query || '%'
            or array_to_string(candidate.tags, ' ') ilike '%' || normalized_query || '%'
          )
        order by candidate.updated_at desc, candidate.id desc
        limit 200
      ) as item
    ), '[]'::jsonb) end,
    'checklist', case when selected_year_id is null or not can_manage then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', checklist.id,
        'label', checklist.label,
        'category', checklist.category,
        'is_required', checklist.is_required,
        'status', checklist.status,
        'archive_item_id', checklist.archive_item_id,
        'notes', checklist.notes
      ) order by checklist.sort_order, checklist.id)
      from public.handover_checklists as checklist
      where checklist.rotary_year_id = selected_year_id and checklist.club_id = selected_club_id
    ), '[]'::jsonb) end,
    'confirmations', case when selected_year_id is null or not can_manage then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', confirmation.id,
        'confirmed_by', account.account_display_name,
        'confirmation_role', confirmation.confirmation_role,
        'confirmed_at', confirmation.confirmed_at
      ) order by confirmation.confirmed_at, confirmation.id)
      from public.handover_confirmations as confirmation
      join public.app_accounts as account on account.id = confirmation.confirmed_by_app_account_id
      where confirmation.rotary_year_id = selected_year_id and confirmation.club_id = selected_club_id
    ), '[]'::jsonb) end,
    'missing_required_categories', case when selected_year_id is null or not can_manage then '[]'::jsonb else coalesce((
      select jsonb_agg(required.category order by required.sort_order)
      from (
        values
          ('meeting_minutes', 1), ('grant_documents', 2), ('reports', 3),
          ('finance_summary', 4), ('decisions', 5), ('templates_handover', 6)
      ) as required(category, sort_order)
      where not exists (
        select 1 from public.archive_items as item
        where item.club_id = selected_club_id
          and item.rotary_year_id = selected_year_id
          and item.category = required.category
          and item.status = 'active'
          and exists (
            select 1 from public.archive_item_versions as version
            where version.archive_item_id = item.id and version.upload_status = 'ready'
          )
      )
    ), '[]'::jsonb) end
  ) into result;
  return result;
end;
$$;

create or replace function public.create_rotary_year(
  p_club_id uuid,
  p_start_year integer,
  p_theme text,
  p_president_name text,
  p_secretary_name text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  year_id uuid;
  item record;
begin
  if actor_id is null or not public.current_can_manage_archive(p_club_id) then
    raise exception using errcode = '42501', message = 'archive_manager_required';
  end if;
  if p_start_year is null or p_start_year < 2000 or p_start_year > 2200
     or char_length(btrim(coalesce(p_theme, ''))) > 160
     or char_length(btrim(coalesce(p_president_name, ''))) > 160
     or char_length(btrim(coalesce(p_secretary_name, ''))) > 160 then
    raise exception using errcode = '22023', message = 'invalid_rotary_year';
  end if;

  insert into public.rotary_years (
    club_id, start_year, theme, president_name, secretary_name, created_by_app_account_id
  ) values (
    p_club_id,
    p_start_year,
    nullif(btrim(coalesce(p_theme, '')), ''),
    nullif(btrim(coalesce(p_president_name, '')), ''),
    nullif(btrim(coalesce(p_secretary_name, '')), ''),
    actor_id
  ) returning id into year_id;

  for item in select * from (values
    ('例會與理監事會紀錄', 'meeting_minutes', 10),
    ('補助申請與核銷資料', 'grant_documents', 20),
    ('年度成果與報告', 'reports', 30),
    ('年度財務摘要', 'finance_summary', 40),
    ('重要決策與公告', 'decisions', 50),
    ('範本與交接說明', 'templates_handover', 60)
  ) as defaults(label, category, sort_order)
  loop
    insert into public.handover_checklists (
      club_id, rotary_year_id, label, category, is_required, sort_order, updated_by_app_account_id
    ) values (
      p_club_id, year_id, item.label, item.category, true, item.sort_order, actor_id
    );
  end loop;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'archive.rotary_year_created', 'rotary_year', year_id,
    jsonb_build_object('start_year', p_start_year)
  );
  return year_id;
exception when unique_violation then
  raise exception using errcode = '23505', message = 'rotary_year_already_exists';
end;
$$;

create or replace function public.update_rotary_year(
  p_club_id uuid,
  p_rotary_year_id uuid,
  p_theme text,
  p_president_name text,
  p_secretary_name text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare actor_id uuid := public.current_app_account_id();
begin
  if actor_id is null or not public.current_can_manage_archive(p_club_id) then
    raise exception using errcode = '42501', message = 'archive_manager_required';
  end if;
  if char_length(btrim(coalesce(p_theme, ''))) > 160
     or char_length(btrim(coalesce(p_president_name, ''))) > 160
     or char_length(btrim(coalesce(p_secretary_name, ''))) > 160 then
    raise exception using errcode = '22023', message = 'invalid_rotary_year';
  end if;
  update public.rotary_years set
    theme = nullif(btrim(coalesce(p_theme, '')), ''),
    president_name = nullif(btrim(coalesce(p_president_name, '')), ''),
    secretary_name = nullif(btrim(coalesce(p_secretary_name, '')), ''),
    updated_at = now()
  where id = p_rotary_year_id and club_id = p_club_id;
  if not found then raise exception using errcode = 'P0002', message = 'rotary_year_not_found'; end if;
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id)
  values (p_club_id, actor_id, 'archive.rotary_year_updated', 'rotary_year', p_rotary_year_id);
end;
$$;

create or replace function public.create_archive_item(
  p_club_id uuid,
  p_rotary_year_id uuid,
  p_category text,
  p_title text,
  p_description text,
  p_folder_path text,
  p_tags text[],
  p_confidentiality text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  item_id uuid;
  normalized_tags text[] := public.normalize_archive_tags(p_tags);
  normalized_folder text := btrim(coalesce(p_folder_path, '未分類'));
begin
  if actor_id is null or not public.current_can_manage_archive(p_club_id) then
    raise exception using errcode = '42501', message = 'archive_manager_required';
  end if;
  if not exists (select 1 from public.rotary_years where id = p_rotary_year_id and club_id = p_club_id)
     or p_category not in ('meeting_minutes', 'service_photos', 'grant_documents', 'reports', 'finance_summary', 'decisions', 'templates_handover', 'other')
     or p_confidentiality not in ('club_internal', 'officers_only')
     or char_length(btrim(coalesce(p_title, ''))) < 1
     or char_length(btrim(coalesce(p_title, ''))) > 180
     or char_length(coalesce(p_description, '')) > 2000
     or char_length(normalized_folder) < 1
     or char_length(normalized_folder) > 240
     or normalized_folder like '%..%' then
    raise exception using errcode = '22023', message = 'invalid_archive_item';
  end if;
  insert into public.archive_items (
    club_id, rotary_year_id, category, title, description, folder_path, tags,
    confidentiality, created_by_app_account_id
  ) values (
    p_club_id, p_rotary_year_id, p_category, btrim(p_title),
    nullif(btrim(coalesce(p_description, '')), ''), normalized_folder, normalized_tags,
    p_confidentiality, actor_id
  ) returning id into item_id;
  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'archive.item_created', 'archive_item', item_id,
    jsonb_build_object('category', p_category, 'confidentiality', p_confidentiality)
  );
  return item_id;
end;
$$;

create or replace function public.update_archive_item(
  p_club_id uuid,
  p_archive_item_id uuid,
  p_category text,
  p_title text,
  p_description text,
  p_folder_path text,
  p_tags text[],
  p_confidentiality text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  normalized_tags text[] := public.normalize_archive_tags(p_tags);
  normalized_folder text := btrim(coalesce(p_folder_path, '未分類'));
begin
  if actor_id is null or not public.current_can_manage_archive(p_club_id) then
    raise exception using errcode = '42501', message = 'archive_manager_required';
  end if;
  if p_category not in ('meeting_minutes', 'service_photos', 'grant_documents', 'reports', 'finance_summary', 'decisions', 'templates_handover', 'other')
     or p_confidentiality not in ('club_internal', 'officers_only')
     or char_length(btrim(coalesce(p_title, ''))) < 1
     or char_length(btrim(coalesce(p_title, ''))) > 180
     or char_length(coalesce(p_description, '')) > 2000
     or char_length(normalized_folder) < 1
     or char_length(normalized_folder) > 240
     or normalized_folder like '%..%' then
    raise exception using errcode = '22023', message = 'invalid_archive_item';
  end if;
  update public.archive_items set
    category = p_category,
    title = btrim(p_title),
    description = nullif(btrim(coalesce(p_description, '')), ''),
    folder_path = normalized_folder,
    tags = normalized_tags,
    confidentiality = p_confidentiality
  where id = p_archive_item_id and club_id = p_club_id and status = 'active';
  if not found then raise exception using errcode = 'P0002', message = 'archive_item_not_found'; end if;
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id)
  values (p_club_id, actor_id, 'archive.item_updated', 'archive_item', p_archive_item_id);
end;
$$;

create or replace function public.archive_archive_item(p_club_id uuid, p_archive_item_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare actor_id uuid := public.current_app_account_id();
begin
  if actor_id is null or not public.current_can_manage_archive(p_club_id) then
    raise exception using errcode = '42501', message = 'archive_manager_required';
  end if;
  update public.archive_items set
    status = 'archived', archived_at = now(), archived_by_app_account_id = actor_id
  where id = p_archive_item_id and club_id = p_club_id and status = 'active';
  if not found then raise exception using errcode = 'P0002', message = 'archive_item_not_found'; end if;
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id)
  values (p_club_id, actor_id, 'archive.item_archived', 'archive_item', p_archive_item_id);
end;
$$;

create or replace function public.begin_archive_version(
  p_club_id uuid,
  p_archive_item_id uuid,
  p_original_filename text,
  p_file_size_bytes bigint,
  p_media_type text,
  p_change_summary text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target_item public.archive_items;
  next_version integer;
  version_id uuid := extensions.gen_random_uuid();
  object_path text;
begin
  if actor_id is null or not public.current_can_manage_archive(p_club_id) then
    raise exception using errcode = '42501', message = 'archive_manager_required';
  end if;
  if char_length(btrim(coalesce(p_original_filename, ''))) < 1
     or char_length(btrim(p_original_filename)) > 240
     or p_file_size_bytes is null or p_file_size_bytes < 1 or p_file_size_bytes > 10485760
     or p_media_type not in (
       'application/pdf',
       'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       'application/vnd.openxmlformats-officedocument.presentationml.presentation',
       'image/jpeg', 'image/png', 'text/plain'
     )
     or char_length(coalesce(p_change_summary, '')) > 500 then
    raise exception using errcode = '22023', message = 'invalid_archive_upload';
  end if;
  select * into target_item
  from public.archive_items
  where id = p_archive_item_id and club_id = p_club_id and status = 'active'
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'archive_item_not_found'; end if;
  select coalesce(max(version.version_number), 0) + 1 into next_version
  from public.archive_item_versions as version
  where version.archive_item_id = p_archive_item_id;
  object_path := p_club_id::text || '/' || target_item.rotary_year_id::text || '/'
    || p_archive_item_id::text || '/' || version_id::text;
  insert into public.archive_item_versions (
    id, club_id, archive_item_id, version_number, original_filename, object_path,
    file_size_bytes, media_type, change_summary, created_by_app_account_id
  ) values (
    version_id, p_club_id, p_archive_item_id, next_version, btrim(p_original_filename), object_path,
    p_file_size_bytes, p_media_type, nullif(btrim(coalesce(p_change_summary, '')), ''), actor_id
  );
  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'archive.version_started', 'archive_item_version', version_id,
    jsonb_build_object('archive_item_id', p_archive_item_id, 'version_number', next_version, 'file_size_bytes', p_file_size_bytes)
  );
  return jsonb_build_object('version_id', version_id, 'object_path', object_path, 'version_number', next_version);
end;
$$;

create or replace function public.complete_archive_version(p_club_id uuid, p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare actor_id uuid := public.current_app_account_id();
begin
  if actor_id is null or not public.current_can_manage_archive(p_club_id) then
    raise exception using errcode = '42501', message = 'archive_manager_required';
  end if;
  update public.archive_item_versions set upload_status = 'ready', completed_at = now()
  where id = p_version_id and club_id = p_club_id and upload_status = 'pending';
  if not found then raise exception using errcode = 'P0002', message = 'archive_version_not_pending'; end if;
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id)
  values (p_club_id, actor_id, 'archive.version_completed', 'archive_item_version', p_version_id);
end;
$$;

create or replace function public.fail_archive_version(p_club_id uuid, p_version_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  reason text := coalesce(nullif(left(btrim(coalesce(p_reason, '')), 300), ''), 'upload_failed');
begin
  if actor_id is null or not public.current_can_manage_archive(p_club_id) then
    raise exception using errcode = '42501', message = 'archive_manager_required';
  end if;
  update public.archive_item_versions set upload_status = 'failed', completed_at = now(), failure_reason = reason
  where id = p_version_id and club_id = p_club_id and upload_status = 'pending';
  if found then
    insert into public.audit_logs (
      club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
    ) values (
      p_club_id, actor_id, 'archive.version_failed', 'archive_item_version', p_version_id,
      jsonb_build_object('reason', reason)
    );
  end if;
end;
$$;

create or replace function public.authorize_archive_download(p_club_id uuid, p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  result jsonb;
begin
  if actor_id is null or not public.current_can_access_archive(p_club_id) then
    raise exception using errcode = '42501', message = 'archive_access_required';
  end if;
  select jsonb_build_object(
    'object_path', version.object_path,
    'original_filename', version.original_filename,
    'media_type', version.media_type
  ) into result
  from public.archive_item_versions as version
  join public.archive_items as item on item.id = version.archive_item_id
  where version.id = p_version_id
    and version.club_id = p_club_id
    and version.upload_status = 'ready'
    and item.status = 'active'
    and (item.confidentiality = 'club_internal' or public.current_can_manage_archive(p_club_id));
  if result is null then raise exception using errcode = '42501', message = 'archive_download_not_available'; end if;
  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id
  ) values (p_club_id, actor_id, 'archive.version_downloaded', 'archive_item_version', p_version_id);
  return result;
end;
$$;

create or replace function public.export_archive_manifest(p_club_id uuid, p_rotary_year_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  can_manage boolean := public.current_can_manage_archive(p_club_id);
  result jsonb;
begin
  if actor_id is null or not public.current_can_access_archive(p_club_id)
     or not exists (select 1 from public.rotary_years where id = p_rotary_year_id and club_id = p_club_id) then
    raise exception using errcode = '42501', message = 'archive_access_required';
  end if;
  select jsonb_build_object(
    'year', jsonb_build_object('start_year', year_record.start_year, 'theme', year_record.theme),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category', item.category,
        'title', item.title,
        'folder_path', item.folder_path,
        'tags', to_jsonb(item.tags),
        'confidentiality', item.confidentiality,
        'version_count', (
          select count(*) from public.archive_item_versions as version
          where version.archive_item_id = item.id and version.upload_status = 'ready'
        ),
        'latest_version_at', (
          select max(version.created_at) from public.archive_item_versions as version
          where version.archive_item_id = item.id and version.upload_status = 'ready'
        )
      ) order by item.folder_path, item.category, item.title)
      from public.archive_items as item
      where item.rotary_year_id = p_rotary_year_id
        and item.club_id = p_club_id
        and item.status = 'active'
        and (item.confidentiality = 'club_internal' or can_manage)
    ), '[]'::jsonb)
  ) into result
  from public.rotary_years as year_record
  where year_record.id = p_rotary_year_id and year_record.club_id = p_club_id;
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id)
  values (p_club_id, actor_id, 'archive.manifest_exported', 'rotary_year', p_rotary_year_id);
  return result;
end;
$$;

create or replace function public.update_handover_checklist(
  p_club_id uuid,
  p_checklist_id uuid,
  p_status text,
  p_archive_item_id uuid,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  year_id uuid;
begin
  if actor_id is null or not public.current_can_manage_archive(p_club_id) then
    raise exception using errcode = '42501', message = 'archive_manager_required';
  end if;
  if p_status not in ('pending', 'ready', 'confirmed', 'needs_update')
     or char_length(coalesce(p_notes, '')) > 1000
     or (p_status = 'confirmed' and p_archive_item_id is null) then
    raise exception using errcode = '22023', message = 'invalid_handover_checklist';
  end if;
  update public.handover_checklists set
    status = p_status,
    archive_item_id = p_archive_item_id,
    notes = nullif(btrim(coalesce(p_notes, '')), ''),
    updated_by_app_account_id = actor_id
  where id = p_checklist_id and club_id = p_club_id
  returning rotary_year_id into year_id;
  if not found then raise exception using errcode = 'P0002', message = 'handover_checklist_not_found'; end if;
  perform public.refresh_handover_status(year_id);
  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'archive.handover_checklist_updated', 'handover_checklist', p_checklist_id,
    jsonb_build_object('status', p_status, 'archive_item_id', p_archive_item_id)
  );
end;
$$;

create or replace function public.confirm_archive_handover(
  p_club_id uuid,
  p_rotary_year_id uuid,
  p_confirmation_role text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  confirmation_id uuid;
begin
  if actor_id is null or not public.current_can_manage_archive(p_club_id) then
    raise exception using errcode = '42501', message = 'archive_manager_required';
  end if;
  if p_confirmation_role not in ('outgoing', 'incoming')
     or not exists (select 1 from public.rotary_years where id = p_rotary_year_id and club_id = p_club_id) then
    raise exception using errcode = '22023', message = 'invalid_handover_confirmation';
  end if;
  if exists (
    select 1 from public.handover_checklists
    where rotary_year_id = p_rotary_year_id and is_required and status <> 'confirmed'
  ) then
    raise exception using errcode = '55000', message = 'handover_checklist_incomplete';
  end if;
  select id into confirmation_id
  from public.handover_confirmations
  where rotary_year_id = p_rotary_year_id
    and confirmed_by_app_account_id = actor_id
    and confirmation_role = p_confirmation_role;
  if confirmation_id is null then
    insert into public.handover_confirmations (
      club_id, rotary_year_id, confirmed_by_app_account_id, confirmation_role, confirmation_text
    ) values (
      p_club_id, p_rotary_year_id, actor_id, p_confirmation_role,
      case p_confirmation_role
        when 'incoming' then '本人確認已收到並可存取本年度交接資料。'
        else '本人確認已完成本年度資料整理與交付。'
      end
    ) returning id into confirmation_id;
    insert into public.audit_logs (
      club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
    ) values (
      p_club_id, actor_id, 'archive.handover_confirmed', 'handover_confirmation', confirmation_id,
      jsonb_build_object('rotary_year_id', p_rotary_year_id, 'confirmation_role', p_confirmation_role)
    );
  end if;
  perform public.refresh_handover_status(p_rotary_year_id);
  return confirmation_id;
end;
$$;

revoke all on function public.current_has_active_archive_membership(uuid) from public, anon, authenticated;
revoke all on function public.current_can_manage_archive(uuid) from public, anon, authenticated;
revoke all on function public.current_can_access_archive(uuid) from public, anon, authenticated;
revoke all on function public.normalize_archive_tags(text[]) from public, anon, authenticated;
revoke all on function public.prevent_archive_hard_delete() from public, anon, authenticated;
revoke all on function public.protect_archive_item_tenant() from public, anon, authenticated;
revoke all on function public.protect_archive_version() from public, anon, authenticated;
revoke all on function public.protect_handover_tenant() from public, anon, authenticated;
revoke all on function public.refresh_handover_status(uuid) from public, anon, authenticated;
revoke all on function public.get_my_archive_page(uuid, uuid, text, text) from public, anon;
revoke all on function public.create_rotary_year(uuid, integer, text, text, text) from public, anon;
revoke all on function public.update_rotary_year(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.create_archive_item(uuid, uuid, text, text, text, text, text[], text) from public, anon;
revoke all on function public.update_archive_item(uuid, uuid, text, text, text, text, text[], text) from public, anon;
revoke all on function public.archive_archive_item(uuid, uuid) from public, anon;
revoke all on function public.begin_archive_version(uuid, uuid, text, bigint, text, text) from public, anon;
revoke all on function public.complete_archive_version(uuid, uuid) from public, anon;
revoke all on function public.fail_archive_version(uuid, uuid, text) from public, anon;
revoke all on function public.authorize_archive_download(uuid, uuid) from public, anon;
revoke all on function public.export_archive_manifest(uuid, uuid) from public, anon;
revoke all on function public.update_handover_checklist(uuid, uuid, text, uuid, text) from public, anon;
revoke all on function public.confirm_archive_handover(uuid, uuid, text) from public, anon;

grant execute on function public.get_my_archive_page(uuid, uuid, text, text) to authenticated;
grant execute on function public.create_rotary_year(uuid, integer, text, text, text) to authenticated;
grant execute on function public.update_rotary_year(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.create_archive_item(uuid, uuid, text, text, text, text, text[], text) to authenticated;
grant execute on function public.update_archive_item(uuid, uuid, text, text, text, text, text[], text) to authenticated;
grant execute on function public.archive_archive_item(uuid, uuid) to authenticated;
grant execute on function public.begin_archive_version(uuid, uuid, text, bigint, text, text) to authenticated;
grant execute on function public.complete_archive_version(uuid, uuid) to authenticated;
grant execute on function public.fail_archive_version(uuid, uuid, text) to authenticated;
grant execute on function public.authorize_archive_download(uuid, uuid) to authenticated;
grant execute on function public.export_archive_manifest(uuid, uuid) to authenticated;
grant execute on function public.update_handover_checklist(uuid, uuid, text, uuid, text) to authenticated;
grant execute on function public.confirm_archive_handover(uuid, uuid, text) to authenticated;

commit;
