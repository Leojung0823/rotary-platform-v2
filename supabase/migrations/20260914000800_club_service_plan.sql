begin;

-- 社務: what a member can see about how their club is being run. The page
-- itself is assembled from data that already exists -- the club record and its
-- role assignments -- plus one new thing: the year's service plan, which had
-- nowhere to live.
--
-- The plan is keyed on (club_id, start_year) rather than referencing
-- rotary_years. Those rows are created by hand from the archive module, so a
-- club that never set up archives has none, and a service plan should not
-- require an unrelated setup step before it can be written.

create table public.club_service_plans (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  start_year integer not null check (start_year between 2000 and 2200),
  title text not null check (btrim(title) <> '' and char_length(title) <= 180),
  body text not null check (btrim(body) <> '' and char_length(body) <= 20000),
  plan_status text not null default 'draft' check (plan_status in ('draft', 'published')),
  created_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  updated_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_service_plans_year_unique unique (club_id, start_year),
  check (plan_status <> 'published' or published_at is not null)
);

comment on table public.club_service_plans is
  'One service plan per club per Rotary year. Officers write it; members read the published one.';

alter table public.club_service_plans enable row level security;
revoke all on table public.club_service_plans from public, anon, authenticated;

-- Who may write one. club.manage is the president and platform admin; an
-- executive secretary reaches club administration through current_can_manage_club,
-- the same pairing the club profile already uses.
create or replace function public.current_can_manage_service_plan(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.current_has_club_permission(p_club_id, 'club.manage')
    or public.current_can_manage_club(p_club_id)
$$;

create or replace function public.get_club_affairs_page(p_club_id uuid, p_start_year integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target_year integer := coalesce(p_start_year, public.current_rotary_year_start());
  can_manage boolean;
begin
  -- Readable by anyone with a live membership in the club. This page carries no
  -- personal data beyond the officers' own names, which the directory already
  -- shows to fellow members.
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'member.read') then
    raise exception using errcode = '42501', message = 'club_member_required';
  end if;

  can_manage := public.current_can_manage_service_plan(p_club_id);

  return jsonb_build_object(
    'club', (
      select jsonb_build_object(
        'club_id', club.id,
        'club_code', club.club_code,
        'club_name', club.club_name,
        'english_name', club.english_name,
        'member_count', (
          select count(*)::integer
          from public.club_memberships as membership
          where membership.club_id = club.id
            and membership.membership_status = 'active'
        )
      )
      from public.clubs as club
      where club.id = p_club_id and club.club_status = 'active'
    ),
    'officers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'role_key', officer.role_key,
        'display_name', officer.display_name
      ) order by officer.rank, officer.display_name)
      from (
        select assignment.role_key,
          person.canonical_name as display_name,
          case assignment.role_key
            when 'president' then 1 when 'secretary' then 2 when 'finance' then 3 else 4
          end as rank
        from public.club_role_assignments as assignment
        join public.app_accounts as account on account.id = assignment.app_account_id
        join public.people as person on person.id = account.person_id
        where assignment.club_id = p_club_id
          and assignment.assignment_status = 'active'
          and assignment.role_key in ('president', 'secretary', 'finance')
      ) as officer
    ), '[]'::jsonb),
    'start_year', target_year,
    'can_manage_plan', can_manage,
    -- A draft is visible to whoever may edit it and to nobody else, so an
    -- unfinished plan never reads as this year's plan to the club.
    'service_plan', (
      select jsonb_build_object(
        'title', plan.title,
        'body', plan.body,
        'plan_status', plan.plan_status,
        'published_at', plan.published_at,
        'updated_at', plan.updated_at
      )
      from public.club_service_plans as plan
      where plan.club_id = p_club_id
        and plan.start_year = target_year
        and (plan.plan_status = 'published' or can_manage)
    ),
    'plan_years', coalesce((
      select jsonb_agg(plan.start_year order by plan.start_year desc)
      from public.club_service_plans as plan
      where plan.club_id = p_club_id
        and (plan.plan_status = 'published' or can_manage)
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.upsert_club_service_plan(
  p_club_id uuid,
  p_start_year integer,
  p_title text,
  p_body text,
  p_publish boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_service_plans;
begin
  if actor_id is null or not public.current_can_manage_service_plan(p_club_id) then
    raise exception using errcode = '42501', message = 'service_plan_manage_required';
  end if;
  if p_start_year is null or p_start_year not between 2000 and 2200
     or btrim(coalesce(p_title, '')) = '' or char_length(btrim(p_title)) > 180
     or btrim(coalesce(p_body, '')) = '' or char_length(btrim(p_body)) > 20000 then
    raise exception using errcode = '22023', message = 'invalid_service_plan_input';
  end if;
  if not exists (
    select 1 from public.clubs where id = p_club_id and club_status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'club_not_active';
  end if;

  insert into public.club_service_plans as plan (
    club_id, start_year, title, body, plan_status,
    created_by_app_account_id, updated_by_app_account_id, published_at
  ) values (
    p_club_id, p_start_year, btrim(p_title), btrim(p_body),
    case when p_publish then 'published' else 'draft' end,
    actor_id, actor_id,
    case when p_publish then now() else null end
  )
  on conflict (club_id, start_year) do update
  set title = excluded.title,
      body = excluded.body,
      plan_status = excluded.plan_status,
      updated_by_app_account_id = actor_id,
      -- Keep the first publication date across later edits; unpublishing clears
      -- it so a re-published plan does not claim it was live all along.
      published_at = case
        when p_publish then coalesce(plan.published_at, now())
        else null
      end,
      updated_at = now()
  returning * into target;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'service_plan.saved', 'club_service_plan', target.id,
    jsonb_build_object('start_year', target.start_year, 'plan_status', target.plan_status));

  return jsonb_build_object(
    'plan_id', target.id,
    'start_year', target.start_year,
    'plan_status', target.plan_status
  );
end;
$$;

revoke all on function public.current_can_manage_service_plan(uuid) from public, anon;
grant execute on function public.current_can_manage_service_plan(uuid) to authenticated;

revoke all on function public.get_club_affairs_page(uuid, integer) from public, anon;
grant execute on function public.get_club_affairs_page(uuid, integer) to authenticated;

revoke all on function public.upsert_club_service_plan(uuid, integer, text, text, boolean) from public, anon;
grant execute on function public.upsert_club_service_plan(uuid, integer, text, text, boolean) to authenticated;

commit;
