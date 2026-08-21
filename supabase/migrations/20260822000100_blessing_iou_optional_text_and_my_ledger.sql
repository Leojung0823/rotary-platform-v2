begin;

-- Two changes to the blessing wall, both from the same observation: the
-- feature is as much an IOU ledger as a message board.
--
-- 1. The blessing text becomes optional, so a member may pledge without
--    having to compose something. An entry must still carry one or the
--    other -- a row with neither text nor amount says nothing.
--
-- 2. A member can see their own pledges and what has been collected against
--    them. Until now only officers could see any of that, through the
--    collection and reporting contexts; a member could not answer "how much
--    have I pledged this year, and how much have I actually paid".

alter table public.blessing_iou_entries
  drop constraint blessing_iou_entries_text_check;
alter table public.blessing_iou_entries
  add constraint blessing_iou_entries_text_check
  check (char_length(blessing_text) <= 1000);
alter table public.blessing_iou_entries
  add constraint blessing_iou_entries_content_check
  check (btrim(blessing_text) <> '' or pledged_amount is not null);

create or replace function public.create_blessing_iou_entry(
  p_club_id uuid,
  p_blessing_text text,
  p_pledged_amount numeric,
  p_hide_amount boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  membership_id uuid;
  club_timezone text;
  normalized_text text := public.normalize_blessing_iou_text(p_blessing_text);
  allow_public boolean := false;
  created_entry public.blessing_iou_entries;
begin
  select membership.id, club.timezone_name
  into membership_id, club_timezone
  from public.app_accounts as account
  join public.club_memberships as membership
    on membership.person_id = account.person_id
   and membership.club_id = p_club_id
   and membership.membership_status = 'active'
  join public.clubs as club
    on club.id = membership.club_id
   and club.club_status = 'active'
  where account.id = actor_id
    and account.account_status = 'active';

  if actor_id is null or membership_id is null then
    raise exception using errcode = '42501', message = 'active_blessing_iou_membership_required';
  end if;
  -- The blessing text is optional now: a member may simply pledge. What an
  -- entry may not be is empty of both, which would put a row on the wall
  -- saying nothing at all.
  if normalized_text is null or char_length(normalized_text) > 1000
     or (normalized_text = '' and p_pledged_amount is null)
     or p_hide_amount is null
     or (
       p_pledged_amount is not null and (
         p_pledged_amount < 1
         or p_pledged_amount > 9999999999
         or p_pledged_amount <> trunc(p_pledged_amount)
       )
     ) then
    raise exception using errcode = '22023', message = 'invalid_blessing_iou_entry';
  end if;

  select setting.allow_public_amounts into allow_public
  from public.club_blessing_iou_settings as setting
  where setting.club_id = p_club_id;
  allow_public := coalesce(allow_public, false);

  insert into public.blessing_iou_entries (
    club_id,
    author_membership_id,
    author_app_account_id,
    blessing_text,
    pledged_amount,
    amount_visibility,
    pledged_on
  ) values (
    p_club_id,
    membership_id,
    actor_id,
    normalized_text,
    p_pledged_amount,
    case when p_pledged_amount is not null and allow_public and not p_hide_amount
      then 'club' else 'private' end,
    (now() at time zone club_timezone)::date
  ) returning * into created_entry;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id,
    actor_id,
    'blessing_iou.created',
    'blessing_iou_entry',
    created_entry.id,
    jsonb_build_object(
      'has_pledge', created_entry.pledged_amount is not null,
      'amount_visibility', created_entry.amount_visibility
    )
  );

  return public.project_blessing_iou_entry(
    created_entry,
    actor_id,
    public.current_has_blessing_iou_permission(p_club_id, 'blessing_iou.manage')
  );
end;
$$;

create or replace function public.update_own_blessing_iou_entry(
  p_club_id uuid,
  p_entry_id uuid,
  p_blessing_text text,
  p_pledged_amount numeric,
  p_hide_amount boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  normalized_text text := public.normalize_blessing_iou_text(p_blessing_text);
  allow_public boolean := false;
  updated_entry public.blessing_iou_entries;
begin
  if actor_id is null or not public.current_has_active_blessing_iou_membership(p_club_id) then
    raise exception using errcode = '42501', message = 'active_blessing_iou_membership_required';
  end if;
  if p_entry_id is null or normalized_text is null
     or char_length(normalized_text) > 1000
     or (normalized_text = '' and p_pledged_amount is null)
     or p_hide_amount is null
     or (
       p_pledged_amount is not null and (
         p_pledged_amount < 1
         or p_pledged_amount > 9999999999
         or p_pledged_amount <> trunc(p_pledged_amount)
       )
     ) then
    raise exception using errcode = '22023', message = 'invalid_blessing_iou_entry';
  end if;

  select setting.allow_public_amounts into allow_public
  from public.club_blessing_iou_settings as setting
  where setting.club_id = p_club_id;
  allow_public := coalesce(allow_public, false);

  update public.blessing_iou_entries
  set blessing_text = normalized_text,
      pledged_amount = p_pledged_amount,
      amount_visibility = case
        when p_pledged_amount is not null and allow_public and not p_hide_amount then 'club'
        else 'private'
      end
  where id = p_entry_id
    and club_id = p_club_id
    and author_app_account_id = actor_id
    and entry_status = 'active'
  returning * into updated_entry;

  if not found then
    raise exception using errcode = 'P0002', message = 'blessing_iou_entry_not_available';
  end if;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id,
    actor_id,
    'blessing_iou.updated',
    'blessing_iou_entry',
    updated_entry.id,
    jsonb_build_object(
      'has_pledge', updated_entry.pledged_amount is not null,
      'amount_visibility', updated_entry.amount_visibility,
      'version', updated_entry.version
    )
  );

  return public.project_blessing_iou_entry(
    updated_entry,
    actor_id,
    public.current_has_blessing_iou_permission(p_club_id, 'blessing_iou.manage')
  );
end;
$$;


-- A member's own ledger. Deliberately narrow: it answers only for the caller's
-- own entries in a club they actively belong to, and exposes collection totals
-- that are otherwise officer-only because the money in question is the
-- caller's own. It never reveals who recorded a collection.
create or replace function public.get_my_blessing_iou_summary(p_club_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  clubs jsonb;
  selected uuid;
  membership_id uuid;
  entries jsonb;
  totals jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'active_account_required';
  end if;

  select coalesce(jsonb_agg(to_jsonb(club) - 'ord' order by club.ord), '[]'::jsonb)
  into clubs
  from public.list_my_blessing_iou_clubs() with ordinality
    -- Column order taken from the function's own signature, not assumed: both
    -- flags are booleans, so getting them the wrong way round would silently
    -- swap them rather than raise.
    as club(club_id, club_code, club_name, allow_public_amounts, can_manage, ord);

  if p_club_id is not null then
    select (entry->>'club_id')::uuid into selected
    from jsonb_array_elements(clubs) as entry
    where (entry->>'club_id')::uuid = p_club_id
    limit 1;
  end if;
  if selected is null then
    selected := (clubs->0->>'club_id')::uuid;
  end if;

  if selected is null then
    return jsonb_build_object('clubs', clubs, 'selected_club_id', null,
      'totals', null, 'entries', '[]'::jsonb);
  end if;

  select membership.id into membership_id
  from public.app_accounts as account
  join public.club_memberships as membership on membership.person_id = account.person_id
  join public.clubs as club on club.id = membership.club_id
  where account.id = actor_id
    and account.account_status = 'active'
    and membership.club_id = selected
    and membership.membership_status = 'active'
    and club.club_status = 'active';
  if membership_id is null then
    return jsonb_build_object('clubs', clubs, 'selected_club_id', selected,
      'totals', null, 'entries', '[]'::jsonb);
  end if;

  with mine as (
    select entry.id,
      entry.blessing_text,
      entry.pledged_amount,
      entry.currency_code,
      entry.amount_visibility,
      entry.pledged_on,
      entry.created_at,
      coalesce((
        select sum(collection.amount_received)
        from public.blessing_iou_collections as collection
        where collection.entry_id = entry.id
          and collection.club_id = entry.club_id
          and collection.collection_status = 'posted'
      ), 0)::numeric as collected_amount
    from public.blessing_iou_entries as entry
    where entry.club_id = selected
      and entry.author_app_account_id = actor_id
      and entry.entry_status = 'active'
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'entry_id', mine.id,
      'blessing_text', mine.blessing_text,
      'pledged_amount', mine.pledged_amount,
      'currency_code', mine.currency_code,
      'amount_is_public', mine.amount_visibility = 'club',
      'pledged_on', mine.pledged_on,
      'collected_amount', mine.collected_amount,
      'outstanding_amount', greatest(coalesce(mine.pledged_amount, 0) - mine.collected_amount, 0)
    ) order by mine.pledged_on desc, mine.created_at desc), '[]'::jsonb),
    jsonb_build_object(
      'entry_count', count(*),
      'pledged_total', coalesce(sum(mine.pledged_amount), 0),
      'collected_total', coalesce(sum(mine.collected_amount), 0),
      'outstanding_total', coalesce(sum(greatest(coalesce(mine.pledged_amount, 0) - mine.collected_amount, 0)), 0)
    )
  into entries, totals
  from mine;

  return jsonb_build_object(
    'clubs', clubs,
    'selected_club_id', selected,
    'totals', totals,
    'entries', coalesce(entries, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_my_blessing_iou_summary(uuid) from public, anon;
grant execute on function public.get_my_blessing_iou_summary(uuid) to authenticated;

commit;
