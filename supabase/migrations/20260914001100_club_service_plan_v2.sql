begin;

-- V2 keeps the original one-plan-per-club-per-Rotary-year record and adds a
-- structured projection for the four Rotary service avenues. Keeping the
-- avenues in a child table makes each section auditable and avoids turning
-- permission-sensitive club content into an opaque JSON blob.
alter table public.club_service_plans
  add column annual_theme text not null default ''
    check (char_length(annual_theme) <= 180),
  add column member_invitation text not null default ''
    check (char_length(member_invitation) <= 2000);

create table public.club_service_plan_sections (
  id uuid primary key default extensions.gen_random_uuid(),
  service_plan_id uuid not null references public.club_service_plans(id) on delete cascade,
  category_key text not null check (category_key in (
    'membership', 'vocational', 'community', 'international'
  )),
  progress_status text not null default 'planned' check (progress_status in (
    'planned', 'in_progress', 'completed'
  )),
  annual_goal text not null default '' check (char_length(annual_goal) <= 4000),
  activities text not null default '' check (char_length(activities) <= 8000),
  latest_result text not null default '' check (char_length(latest_result) <= 8000),
  next_step text not null default '' check (char_length(next_step) <= 4000),
  member_participation text not null default '' check (char_length(member_participation) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_service_plan_sections_category_unique unique (service_plan_id, category_key)
);

comment on table public.club_service_plan_sections is
  'The four fixed service avenues inside one club service plan; members read published sections and officers maintain them.';

alter table public.club_service_plan_sections enable row level security;
revoke all on table public.club_service_plan_sections from public, anon, authenticated;

-- This is deliberately a separate permission so the management overview can
-- show the tool to the secretary and president without granting finance or
-- member administration by implication. current_can_manage_club remains in
-- the gate for existing delegated club managers.
insert into public.permissions (permission_key, description_zh_hant) values
  ('service_plan.manage', '維護年度服務計劃與執行成果')
on conflict (permission_key) do nothing;

insert into public.role_permissions (role_key, permission_key) values
  ('platform_admin', 'service_plan.manage'),
  ('president', 'service_plan.manage'),
  ('secretary', 'service_plan.manage')
on conflict (role_key, permission_key) do nothing;

create or replace function public.current_can_manage_service_plan(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.current_has_club_permission(p_club_id, 'service_plan.manage')
    or public.current_can_manage_club(p_club_id)
$$;

-- The third parameter is explicit so a manager viewing the member shell gets
-- exactly the same published projection as an ordinary member. The default
-- keeps existing two-argument callers working while the canonical management
-- route opts into p_as_member = false.
drop function if exists public.get_club_affairs_page(uuid, integer);

create function public.get_club_affairs_page(
  p_club_id uuid,
  p_start_year integer default null,
  p_as_member boolean default true
)
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
  -- Every view, including a manager's member-mode view, needs live membership
  -- in the target club. The mode flag only controls draft visibility and the
  -- management capability returned to the caller.
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'member.read') then
    raise exception using errcode = '42501', message = 'club_member_required';
  end if;

  if target_year is null or target_year not between 2000 and 2200 then
    raise exception using errcode = '22023', message = 'invalid_service_plan_year';
  end if;

  can_manage := p_as_member is false and public.current_can_manage_service_plan(p_club_id);

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
    'service_plan', (
      select jsonb_build_object(
        'title', plan.title,
        'body', plan.body,
        'annual_theme', plan.annual_theme,
        'member_invitation', plan.member_invitation,
        'plan_status', plan.plan_status,
        'published_at', plan.published_at,
        'updated_at', plan.updated_at,
        'sections', coalesce((
          select jsonb_agg(jsonb_build_object(
            'category_key', section.category_key,
            'progress_status', section.progress_status,
            'annual_goal', section.annual_goal,
            'activities', section.activities,
            'latest_result', section.latest_result,
            'next_step', section.next_step,
            'member_participation', section.member_participation,
            'updated_at', section.updated_at
          ) order by case section.category_key
            when 'membership' then 1
            when 'vocational' then 2
            when 'community' then 3
            when 'international' then 4
          end)
          from public.club_service_plan_sections as section
          where section.service_plan_id = plan.id
        ), '[]'::jsonb)
      )
      from public.club_service_plans as plan
      where plan.club_id = p_club_id
        and plan.start_year = target_year
        and (
          plan.plan_status = 'published'
          or (p_as_member is false and can_manage)
        )
    ),
    'plan_years', coalesce((
      select jsonb_agg(plan.start_year order by plan.start_year desc)
      from public.club_service_plans as plan
      where plan.club_id = p_club_id
        and (
          plan.plan_status = 'published'
          or (p_as_member is false and can_manage)
        )
    ), '[]'::jsonb)
  );
end;
$$;

create function public.upsert_club_service_plan_v2(
  p_club_id uuid,
  p_start_year integer,
  p_title text,
  p_body text,
  p_annual_theme text,
  p_member_invitation text,
  p_publish boolean,
  p_sections jsonb
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

  if p_publish is null
     or p_start_year is null or p_start_year not between 2000 and 2200
     or btrim(coalesce(p_title, '')) = '' or char_length(btrim(p_title)) > 180
     or btrim(coalesce(p_body, '')) = '' or char_length(btrim(p_body)) > 20000
     or char_length(coalesce(p_annual_theme, '')) > 180
     or char_length(coalesce(p_member_invitation, '')) > 2000 then
    raise exception using errcode = '22023', message = 'invalid_service_plan_input';
  end if;

  if not exists (
    select 1 from public.clubs where id = p_club_id and club_status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'club_not_active';
  end if;

  if p_sections is null
     or jsonb_typeof(p_sections) <> 'array'
     or jsonb_array_length(p_sections) <> 4 then
    raise exception using errcode = '22023', message = 'invalid_service_plan_sections';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_sections) as section_row
    where jsonb_typeof(section_row) <> 'object'
       or jsonb_typeof(section_row->'category_key') <> 'string'
       or jsonb_typeof(section_row->'progress_status') <> 'string'
       or jsonb_typeof(section_row->'annual_goal') <> 'string'
       or jsonb_typeof(section_row->'activities') <> 'string'
       or jsonb_typeof(section_row->'latest_result') <> 'string'
       or jsonb_typeof(section_row->'next_step') <> 'string'
       or jsonb_typeof(section_row->'member_participation') <> 'string'
  ) then
    raise exception using errcode = '22023', message = 'invalid_service_plan_sections';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_sections) as section_row
    where section_row->>'category_key' not in (
      'membership', 'vocational', 'community', 'international'
    )
  )
  or (
    select count(distinct section_row->>'category_key')
    from jsonb_array_elements(p_sections) as section_row
  ) <> 4 then
    raise exception using errcode = '22023', message = 'invalid_service_plan_sections';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_sections) as section_row
    where section_row->>'progress_status' not in ('planned', 'in_progress', 'completed')
       or char_length(section_row->>'annual_goal') > 4000
       or char_length(section_row->>'activities') > 8000
       or char_length(section_row->>'latest_result') > 8000
       or char_length(section_row->>'next_step') > 4000
       or char_length(section_row->>'member_participation') > 4000
  ) then
    raise exception using errcode = '22023', message = 'invalid_service_plan_sections';
  end if;

  if p_publish and exists (
    select 1
    from jsonb_array_elements(p_sections) as section_row
    where btrim(section_row->>'annual_goal') = ''
       or btrim(section_row->>'activities') = ''
       or btrim(section_row->>'latest_result') = ''
       or btrim(section_row->>'member_participation') = ''
  ) then
    raise exception using errcode = '22023', message = 'service_plan_publish_incomplete';
  end if;

  insert into public.club_service_plans as plan (
    club_id, start_year, title, body, annual_theme, member_invitation,
    plan_status, created_by_app_account_id, updated_by_app_account_id, published_at
  ) values (
    p_club_id, p_start_year, btrim(p_title), btrim(p_body),
    btrim(coalesce(p_annual_theme, '')), btrim(coalesce(p_member_invitation, '')),
    case when p_publish then 'published' else 'draft' end,
    actor_id, actor_id,
    case when p_publish then now() else null end
  )
  on conflict (club_id, start_year) do update
  set title = excluded.title,
      body = excluded.body,
      annual_theme = excluded.annual_theme,
      member_invitation = excluded.member_invitation,
      plan_status = excluded.plan_status,
      updated_by_app_account_id = actor_id,
      published_at = case
        when p_publish then coalesce(plan.published_at, now())
        else null
      end,
      updated_at = now()
  returning * into target;

  insert into public.club_service_plan_sections as section (
    service_plan_id, category_key, progress_status, annual_goal, activities,
    latest_result, next_step, member_participation, updated_at
  )
  select
    target.id,
    section_row->>'category_key',
    section_row->>'progress_status',
    btrim(section_row->>'annual_goal'),
    btrim(section_row->>'activities'),
    btrim(section_row->>'latest_result'),
    btrim(section_row->>'next_step'),
    btrim(section_row->>'member_participation'),
    now()
  from jsonb_array_elements(p_sections) as section_row
  on conflict (service_plan_id, category_key) do update
  set progress_status = excluded.progress_status,
      annual_goal = excluded.annual_goal,
      activities = excluded.activities,
      latest_result = excluded.latest_result,
      next_step = excluded.next_step,
      member_participation = excluded.member_participation,
      updated_at = now();

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'service_plan.v2_saved', 'club_service_plan', target.id,
    jsonb_build_object(
      'start_year', target.start_year,
      'plan_status', target.plan_status,
      'category_count', 4
    )
  );

  return jsonb_build_object(
    'plan_id', target.id,
    'start_year', target.start_year,
    'plan_status', target.plan_status
  );
end;
$$;

revoke all on function public.current_can_manage_service_plan(uuid) from public, anon, authenticated;
grant execute on function public.current_can_manage_service_plan(uuid) to authenticated;

revoke all on function public.get_club_affairs_page(uuid, integer, boolean) from public, anon;
grant execute on function public.get_club_affairs_page(uuid, integer, boolean) to authenticated;

revoke all on function public.upsert_club_service_plan_v2(uuid, integer, text, text, text, text, boolean, jsonb)
  from public, anon;
grant execute on function public.upsert_club_service_plan_v2(uuid, integer, text, text, text, text, boolean, jsonb)
  to authenticated;

commit;
