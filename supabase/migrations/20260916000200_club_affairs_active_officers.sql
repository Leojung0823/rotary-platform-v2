begin;

-- 社務頁不該把已經停用的社友列為幹部。
--
-- The officer list asked only whether the role assignment was active, never
-- whether the person is still a member. A membership that is suspended, ended
-- or disabled keeps its assignment row, so the club went on being introduced
-- by someone who had left -- on the very same card whose member count already
-- excluded them.
--
-- Restated from the current definition with one condition added; nothing else
-- about this function changes. "Current" is 20260914001100, which re-declared
-- this function with a plain `create function` after a signature change --
-- the first draft of this migration restated 20260914000800 instead and would
-- have reverted that. src/lib/attendance/latest-definition.ts now reads both
-- spellings, and has a test that says so.

create or replace function public.get_club_affairs_page(
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
          -- The role is held by a member of this club, not by an account that
          -- once was one. A suspended or ended membership keeps its assignment
          -- and went on being introduced as the club's secretary, on the same
          -- card whose member count had already stopped counting them.
          and account.account_status = 'active'
          and exists (
            select 1
            from public.club_memberships as membership
            where membership.club_id = p_club_id
              and membership.person_id = person.id
              and membership.membership_status = 'active'
          )
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

commit;
