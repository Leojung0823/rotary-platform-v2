begin;

alter table public.platform_feature_flags
  drop constraint platform_feature_flags_feature_key_check;
alter table public.platform_feature_flags
  add constraint platform_feature_flags_feature_key_check check (feature_key in (
    'role_context_v2',
    'role_shells_v2',
    'member_home_v2',
    'checkin_qr_v2',
    'checkin_gps_v2',
    'attendance_ui_v2',
    'announcements_v09',
    'blessing_iou_v1',
    'blessing_iou_collections_v1'
  ));

alter table public.platform_feature_flag_audit
  drop constraint platform_feature_flag_audit_feature_key_check;
alter table public.platform_feature_flag_audit
  add constraint platform_feature_flag_audit_feature_key_check check (feature_key in (
    'role_context_v2',
    'role_shells_v2',
    'member_home_v2',
    'checkin_qr_v2',
    'checkin_gps_v2',
    'attendance_ui_v2',
    'announcements_v09',
    'blessing_iou_v1',
    'blessing_iou_collections_v1'
  ));

create or replace function public.set_platform_feature_flag(
  p_feature_key text,
  p_enabled boolean,
  p_enabled_environments text[],
  p_rollout_percentage integer
)
returns table (
  feature_key text,
  enabled boolean,
  enabled_environments text[],
  rollout_percentage smallint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not public.current_has_platform_role(array['superadmin', 'platform_admin']) then
    raise exception using errcode = '42501', message = 'platform_feature_flag_admin_required';
  end if;
  if p_feature_key not in (
    'role_context_v2', 'role_shells_v2', 'member_home_v2', 'checkin_qr_v2', 'checkin_gps_v2',
    'attendance_ui_v2', 'announcements_v09', 'blessing_iou_v1', 'blessing_iou_collections_v1'
  ) or p_enabled is null or p_enabled_environments is null
    or p_rollout_percentage not between 0 and 100
    or not (p_enabled_environments <@ array['local', 'staging', 'production']::text[]) then
    raise exception using errcode = '22023', message = 'invalid_platform_feature_flag_input';
  end if;

  return query
  insert into public.platform_feature_flags as flag (
    feature_key, enabled, enabled_environments, rollout_percentage
  ) values (
    p_feature_key, p_enabled, p_enabled_environments, p_rollout_percentage::smallint
  )
  on conflict on constraint platform_feature_flags_pkey do update
    set enabled = excluded.enabled,
        enabled_environments = excluded.enabled_environments,
        rollout_percentage = excluded.rollout_percentage
  returning flag.feature_key, flag.enabled, flag.enabled_environments, flag.rollout_percentage, flag.updated_at;
end;
$$;

revoke all on function public.set_platform_feature_flag(text, boolean, text[], integer)
  from public, anon, authenticated;
grant execute on function public.set_platform_feature_flag(text, boolean, text[], integer)
  to authenticated;

insert into public.permissions (permission_key, description_zh_hant) values
  ('blessing_iou.collect', '登錄、查看與沖銷社內祝福 IOU 收款')
on conflict (permission_key) do nothing;

insert into public.role_permissions (role_key, permission_key) values
  ('president', 'blessing_iou.collect'),
  ('secretary', 'blessing_iou.collect'),
  ('finance', 'blessing_iou.collect')
on conflict (role_key, permission_key) do nothing;

alter table public.blessing_iou_entries
  add constraint blessing_iou_entries_id_club_unique unique (id, club_id);

create table public.blessing_iou_collections (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  entry_id uuid not null,
  amount_received numeric(12, 2) not null,
  currency_code text not null default 'TWD',
  received_on date not null,
  payment_method text not null,
  reference_note text,
  collection_status text not null default 'posted',
  recorded_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  reversed_by_app_account_id uuid references public.app_accounts(id) on delete restrict,
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blessing_iou_collections_entry_club_fkey
    foreign key (entry_id, club_id)
    references public.blessing_iou_entries (id, club_id)
    on delete restrict,
  constraint blessing_iou_collections_amount_check check (
    amount_received between 1 and 9999999999
    and amount_received = trunc(amount_received)
  ),
  constraint blessing_iou_collections_currency_check check (currency_code = 'TWD'),
  constraint blessing_iou_collections_method_check check (
    payment_method in ('cash', 'transfer', 'check', 'other')
  ),
  constraint blessing_iou_collections_note_check check (
    reference_note is null
    or (btrim(reference_note) <> '' and char_length(reference_note) <= 300)
  ),
  constraint blessing_iou_collections_status_check check (
    collection_status in ('posted', 'reversed')
  ),
  constraint blessing_iou_collections_reversal_check check (
    (
      collection_status = 'posted'
      and reversed_by_app_account_id is null
      and reversed_at is null
      and reversal_reason is null
    ) or (
      collection_status = 'reversed'
      and reversed_by_app_account_id is not null
      and reversed_at is not null
      and btrim(coalesce(reversal_reason, '')) <> ''
      and char_length(reversal_reason) <= 300
    )
  )
);

comment on table public.blessing_iou_collections is
  'Immutable TWD receipts allocated to one blessing IOU entry. Corrections are explicit reversals; rows are never deleted.';

create index blessing_iou_collections_entry_status_idx
  on public.blessing_iou_collections (entry_id, collection_status, created_at desc);

create index blessing_iou_collections_club_received_idx
  on public.blessing_iou_collections (club_id, received_on desc, created_at desc);

create or replace function public.protect_blessing_iou_collection_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.collection_status = 'reversed' then
    raise exception using errcode = '55000', message = 'reversed_blessing_iou_collection_immutable';
  end if;
  if old.club_id is distinct from new.club_id
     or old.entry_id is distinct from new.entry_id
     or old.amount_received is distinct from new.amount_received
     or old.currency_code is distinct from new.currency_code
     or old.received_on is distinct from new.received_on
     or old.payment_method is distinct from new.payment_method
     or old.reference_note is distinct from new.reference_note
     or old.recorded_by_app_account_id is distinct from new.recorded_by_app_account_id
     or old.created_at is distinct from new.created_at
     or new.collection_status <> 'reversed'
     or new.reversed_by_app_account_id is null
     or new.reversed_at is null
     or btrim(coalesce(new.reversal_reason, '')) = ''
     or char_length(new.reversal_reason) > 300 then
    raise exception using errcode = '23514', message = 'invalid_blessing_iou_collection_reversal';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger blessing_iou_collections_protect_update
before update on public.blessing_iou_collections
for each row execute function public.protect_blessing_iou_collection_update();

create or replace function public.prevent_blessing_iou_collection_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = '42501', message = 'blessing_iou_collection_delete_forbidden';
end;
$$;

create trigger blessing_iou_collections_prevent_delete
before delete on public.blessing_iou_collections
for each row execute function public.prevent_blessing_iou_collection_delete();

alter table public.blessing_iou_collections enable row level security;
revoke all on table public.blessing_iou_collections from public, anon, authenticated;

-- A collection row permanently locks the member-authored promise, even after
-- an accounting reversal. The correction history remains meaningful only if
-- the original blessing and amount cannot later be rewritten or cancelled.
create or replace function public.protect_blessing_iou_entry_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.club_id is distinct from new.club_id
     or old.author_membership_id is distinct from new.author_membership_id
     or old.author_app_account_id is distinct from new.author_app_account_id
     or old.currency_code is distinct from new.currency_code
     or old.pledged_on is distinct from new.pledged_on
     or old.created_at is distinct from new.created_at then
    raise exception using errcode = '23514', message = 'blessing_iou_authority_fields_immutable';
  end if;

  if old.entry_status = 'deleted' then
    raise exception using errcode = '55000', message = 'deleted_blessing_iou_entry_immutable';
  end if;

  if exists (
    select 1 from public.blessing_iou_collections as collection
    where collection.entry_id = old.id
  ) and (
    old.blessing_text is distinct from new.blessing_text
    or old.pledged_amount is distinct from new.pledged_amount
    or old.amount_visibility is distinct from new.amount_visibility
    or old.entry_status is distinct from new.entry_status
  ) then
    raise exception using errcode = '55000', message = 'collected_blessing_iou_entry_immutable';
  end if;

  new.updated_at := now();
  new.version := old.version + 1;
  if new.entry_status = 'deleted' then
    new.deleted_at := coalesce(new.deleted_at, now());
  else
    new.deleted_by_app_account_id := null;
    new.deleted_at := null;
    new.deletion_reason := null;
  end if;
  return new;
end;
$$;

create or replace function public.project_blessing_iou_entry(
  p_entry public.blessing_iou_entries,
  p_actor_id uuid,
  p_can_manage boolean
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', p_entry.id,
    'blessing_text', p_entry.blessing_text,
    'pledged_amount', case
      when p_entry.pledged_amount is null then null
      when p_entry.author_app_account_id = p_actor_id or p_can_manage or (
        p_entry.amount_visibility = 'club' and coalesce(setting.allow_public_amounts, false)
      ) then p_entry.pledged_amount
      else null
    end,
    'has_pledge', p_entry.pledged_amount is not null,
    'currency_code', p_entry.currency_code,
    'amount_is_public', p_entry.pledged_amount is not null
      and p_entry.amount_visibility = 'club'
      and coalesce(setting.allow_public_amounts, false),
    'pledged_on', p_entry.pledged_on,
    'created_at', p_entry.created_at,
    'updated_at', p_entry.updated_at,
    'author_display_name', account.account_display_name,
    'author_avatar_url', person.avatar_url,
    'can_edit', p_entry.author_app_account_id = p_actor_id and not exists (
      select 1 from public.blessing_iou_collections as collection
      where collection.entry_id = p_entry.id
    ),
    'can_delete', (p_entry.author_app_account_id = p_actor_id or p_can_manage) and not exists (
      select 1 from public.blessing_iou_collections as collection
      where collection.entry_id = p_entry.id
    ),
    'viewer_can_manage', p_can_manage
  )
  from public.app_accounts as account
  join public.people as person on person.id = account.person_id
  left join public.club_blessing_iou_settings as setting on setting.club_id = p_entry.club_id
  where account.id = p_entry.author_app_account_id
$$;

create or replace function public.delete_blessing_iou_entry(
  p_club_id uuid,
  p_entry_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.blessing_iou_entries;
  actor_is_author boolean;
  can_manage boolean := public.current_has_blessing_iou_permission(p_club_id, 'blessing_iou.manage');
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if actor_id is null or p_entry_id is null then
    raise exception using errcode = '22023', message = 'invalid_blessing_iou_delete';
  end if;

  select entry.* into target
  from public.blessing_iou_entries as entry
  where entry.id = p_entry_id
    and entry.club_id = p_club_id
    and entry.entry_status = 'active'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'blessing_iou_entry_not_available';
  end if;
  if exists (
    select 1 from public.blessing_iou_collections as collection
    where collection.entry_id = target.id
  ) then
    raise exception using errcode = '55000', message = 'collected_blessing_iou_entry_immutable';
  end if;

  actor_is_author := target.author_app_account_id = actor_id;
  if actor_is_author then
    if not public.current_has_active_blessing_iou_membership(p_club_id) then
      raise exception using errcode = '42501', message = 'active_blessing_iou_membership_required';
    end if;
    normalized_reason := 'member_deleted';
  elsif not can_manage then
    raise exception using errcode = '42501', message = 'blessing_iou_manage_required';
  elsif normalized_reason is null or char_length(normalized_reason) > 300 then
    raise exception using errcode = '22023', message = 'blessing_iou_delete_reason_required';
  end if;

  update public.blessing_iou_entries
  set entry_status = 'deleted',
      deleted_by_app_account_id = actor_id,
      deleted_at = now(),
      deletion_reason = normalized_reason
  where id = target.id;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id,
    actor_id,
    case when actor_is_author then 'blessing_iou.member_deleted' else 'blessing_iou.manager_deleted' end,
    'blessing_iou_entry',
    target.id,
    jsonb_build_object('reason', normalized_reason, 'had_pledge', target.pledged_amount is not null)
  );
end;
$$;

create or replace function public.get_blessing_iou_collection_context(
  p_club_id uuid,
  p_period_month date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  club_projection jsonb;
  summary_projection jsonb;
  entry_projection jsonb;
  collection_projection jsonb;
begin
  if not public.current_has_blessing_iou_permission(p_club_id, 'blessing_iou.collect') then
    raise exception using errcode = '42501', message = 'blessing_iou_collect_required';
  end if;
  if p_period_month is null
     or p_period_month <> date_trunc('month', p_period_month)::date
     or p_period_month < date '2000-01-01'
     or p_period_month > (date_trunc('month', current_date) + interval '1 month')::date then
    raise exception using errcode = '22023', message = 'invalid_blessing_iou_period_month';
  end if;

  select jsonb_build_object(
    'club_id', club.id,
    'club_code', club.club_code,
    'club_name', club.club_name,
    'period_month', to_char(p_period_month, 'YYYY-MM')
  ) into club_projection
  from public.clubs as club
  where club.id = p_club_id and club.club_status = 'active';
  if club_projection is null then
    raise exception using errcode = 'P0002', message = 'club_not_available';
  end if;

  with period_entries as (
    select
      entry.id,
      entry.pledged_amount,
      coalesce(sum(collection.amount_received) filter (
        where collection.collection_status = 'posted'
      ), 0) as amount_received
    from public.blessing_iou_entries as entry
    left join public.blessing_iou_collections as collection on collection.entry_id = entry.id
    where entry.club_id = p_club_id
      and entry.entry_status = 'active'
      and entry.pledged_amount is not null
      and entry.pledged_on >= p_period_month
      and entry.pledged_on < (p_period_month + interval '1 month')::date
    group by entry.id, entry.pledged_amount
  )
  select jsonb_build_object(
    'pledged_amount', coalesce(sum(pledged_amount), 0),
    'received_amount', coalesce(sum(amount_received), 0),
    'outstanding_amount', coalesce(sum(pledged_amount - amount_received), 0),
    'entry_count', count(*),
    'unpaid_entry_count', count(*) filter (where amount_received = 0),
    'partial_entry_count', count(*) filter (where amount_received > 0 and amount_received < pledged_amount),
    'paid_entry_count', count(*) filter (where amount_received >= pledged_amount)
  ) into summary_projection
  from period_entries;

  select coalesce(jsonb_agg(row_projection order by pledged_on desc, created_at desc, entry_id), '[]'::jsonb)
  into entry_projection
  from (
    select
      entry.pledged_on,
      entry.created_at,
      entry.id as entry_id,
      jsonb_build_object(
        'entry_id', entry.id,
        'author_membership_id', entry.author_membership_id,
        'author_display_name', account.account_display_name,
        'blessing_text', entry.blessing_text,
        'pledged_on', entry.pledged_on,
        'created_at', entry.created_at,
        'pledged_amount', entry.pledged_amount,
        'received_amount', coalesce(sum(collection.amount_received) filter (
          where collection.collection_status = 'posted'
        ), 0),
        'outstanding_amount', entry.pledged_amount - coalesce(sum(collection.amount_received) filter (
          where collection.collection_status = 'posted'
        ), 0),
        'collection_status', case
          when coalesce(sum(collection.amount_received) filter (
            where collection.collection_status = 'posted'
          ), 0) >= entry.pledged_amount then 'paid'
          when coalesce(sum(collection.amount_received) filter (
            where collection.collection_status = 'posted'
          ), 0) > 0 then 'partial'
          else 'unpaid'
        end
      ) as row_projection
    from public.blessing_iou_entries as entry
    join public.app_accounts as account on account.id = entry.author_app_account_id
    left join public.blessing_iou_collections as collection on collection.entry_id = entry.id
    where entry.club_id = p_club_id
      and entry.entry_status = 'active'
      and entry.pledged_amount is not null
      and entry.pledged_on >= p_period_month
      and entry.pledged_on < (p_period_month + interval '1 month')::date
    group by entry.id, account.account_display_name
  ) as projected_entries;

  select coalesce(jsonb_agg(row_projection order by created_at desc, collection_id desc), '[]'::jsonb)
  into collection_projection
  from (
    select
      collection.created_at,
      collection.id as collection_id,
      jsonb_build_object(
        'collection_id', collection.id,
        'entry_id', entry.id,
        'author_display_name', account.account_display_name,
        'amount_received', collection.amount_received,
        'received_on', collection.received_on,
        'payment_method', collection.payment_method,
        'reference_note', collection.reference_note,
        'collection_status', collection.collection_status,
        'created_at', collection.created_at,
        'reversed_at', collection.reversed_at,
        'reversal_reason', collection.reversal_reason
      ) as row_projection
    from public.blessing_iou_collections as collection
    join public.blessing_iou_entries as entry on entry.id = collection.entry_id
    join public.app_accounts as account on account.id = entry.author_app_account_id
    where collection.club_id = p_club_id
      and entry.pledged_on >= p_period_month
      and entry.pledged_on < (p_period_month + interval '1 month')::date
    order by collection.created_at desc, collection.id desc
    limit 100
  ) as projected_collections;

  return club_projection || jsonb_build_object(
    'currency_code', 'TWD',
    'summary', summary_projection,
    'entries', entry_projection,
    'collections', collection_projection
  );
end;
$$;

create or replace function public.record_blessing_iou_collections(
  p_club_id uuid,
  p_period_month date,
  p_received_on date,
  p_payment_method text,
  p_reference_note text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  club_timezone text;
  normalized_note text := nullif(btrim(coalesce(p_reference_note, '')), '');
  item jsonb;
  target public.blessing_iou_entries;
  entry_id uuid;
  amount numeric;
  already_received numeric;
  collection_id uuid;
begin
  if actor_id is null
     or not public.current_has_blessing_iou_permission(p_club_id, 'blessing_iou.collect') then
    raise exception using errcode = '42501', message = 'blessing_iou_collect_required';
  end if;
  select club.timezone_name into club_timezone
  from public.clubs as club
  where club.id = p_club_id and club.club_status = 'active';
  if club_timezone is null then
    raise exception using errcode = 'P0002', message = 'club_not_available';
  end if;
  if p_period_month is null
     or p_period_month <> date_trunc('month', p_period_month)::date
     or p_received_on is null
     or p_received_on < date '2000-01-01'
     or p_received_on > ((now() at time zone club_timezone)::date + 1)
     or p_payment_method not in ('cash', 'transfer', 'check', 'other')
     or (normalized_note is not null and char_length(normalized_note) > 300)
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 50 then
    raise exception using errcode = '22023', message = 'invalid_blessing_iou_collection_batch';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) as element(item)
    where jsonb_typeof(element.item) <> 'object'
      or not (element.item ?& array['entry_id', 'amount'])
      or element.item - 'entry_id' - 'amount' <> '{}'::jsonb
      or jsonb_typeof(element.item->'entry_id') <> 'string'
      or jsonb_typeof(element.item->'amount') <> 'number'
      or (element.item->>'entry_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or (element.item->>'amount') !~ '^[0-9]+$'
  ) or exists (
    select 1
    from jsonb_array_elements(p_items) as element(item)
    group by element.item->>'entry_id'
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'invalid_blessing_iou_collection_items';
  end if;

  for item in
    select element.item
    from jsonb_array_elements(p_items) as element(item)
    order by element.item->>'entry_id'
  loop
    entry_id := (item->>'entry_id')::uuid;
    amount := (item->>'amount')::numeric;
    if amount < 1 or amount > 9999999999 or amount <> trunc(amount) then
      raise exception using errcode = '22023', message = 'invalid_blessing_iou_collection_amount';
    end if;

    select entry.* into target
    from public.blessing_iou_entries as entry
    where entry.id = entry_id
      and entry.club_id = p_club_id
      and entry.entry_status = 'active'
      and entry.pledged_amount is not null
      and entry.pledged_on >= p_period_month
      and entry.pledged_on < (p_period_month + interval '1 month')::date
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'blessing_iou_entry_not_collectable';
    end if;

    select coalesce(sum(collection.amount_received), 0) into already_received
    from public.blessing_iou_collections as collection
    where collection.entry_id = target.id
      and collection.collection_status = 'posted';
    if already_received + amount > target.pledged_amount then
      raise exception using errcode = '22023', message = 'blessing_iou_collection_exceeds_outstanding';
    end if;

    insert into public.blessing_iou_collections (
      club_id, entry_id, amount_received, received_on, payment_method,
      reference_note, recorded_by_app_account_id
    ) values (
      p_club_id, target.id, amount, p_received_on, p_payment_method,
      normalized_note, actor_id
    ) returning id into collection_id;

    insert into public.audit_logs (
      club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
    ) values (
      p_club_id,
      actor_id,
      'blessing_iou.collection_recorded',
      'blessing_iou_collection',
      collection_id,
      jsonb_build_object('payment_method', p_payment_method, 'received_on', p_received_on)
    );
  end loop;

  return public.get_blessing_iou_collection_context(p_club_id, p_period_month);
end;
$$;

create or replace function public.reverse_blessing_iou_collection(
  p_club_id uuid,
  p_collection_id uuid,
  p_period_month date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  target public.blessing_iou_collections;
begin
  if actor_id is null
     or not public.current_has_blessing_iou_permission(p_club_id, 'blessing_iou.collect') then
    raise exception using errcode = '42501', message = 'blessing_iou_collect_required';
  end if;
  if p_collection_id is null or p_period_month is null
     or p_period_month <> date_trunc('month', p_period_month)::date
     or normalized_reason is null
     or char_length(normalized_reason) < 2
     or char_length(normalized_reason) > 300 then
    raise exception using errcode = '22023', message = 'invalid_blessing_iou_collection_reversal';
  end if;

  select collection.* into target
  from public.blessing_iou_collections as collection
  where collection.id = p_collection_id
    and collection.club_id = p_club_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'blessing_iou_collection_not_available';
  end if;
  if target.collection_status <> 'posted' then
    raise exception using errcode = '55000', message = 'blessing_iou_collection_already_reversed';
  end if;

  update public.blessing_iou_collections
  set collection_status = 'reversed',
      reversed_by_app_account_id = actor_id,
      reversed_at = now(),
      reversal_reason = normalized_reason
  where id = target.id;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id,
    actor_id,
    'blessing_iou.collection_reversed',
    'blessing_iou_collection',
    target.id,
    jsonb_build_object('reason_recorded', true)
  );

  return public.get_blessing_iou_collection_context(p_club_id, p_period_month);
end;
$$;

revoke all on function public.protect_blessing_iou_collection_update()
  from public, anon, authenticated;
revoke all on function public.prevent_blessing_iou_collection_delete()
  from public, anon, authenticated;
revoke all on function public.get_blessing_iou_collection_context(uuid, date)
  from public, anon;
revoke all on function public.record_blessing_iou_collections(uuid, date, date, text, text, jsonb)
  from public, anon;
revoke all on function public.reverse_blessing_iou_collection(uuid, uuid, date, text)
  from public, anon;

grant execute on function public.get_blessing_iou_collection_context(uuid, date)
  to authenticated;
grant execute on function public.record_blessing_iou_collections(uuid, date, date, text, text, jsonb)
  to authenticated;
grant execute on function public.reverse_blessing_iou_collection(uuid, uuid, date, text)
  to authenticated;

commit;
