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
-- about this function changes.

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
          -- The role is held by a member of this club, not by an account that
          -- once was one. A suspended or ended membership kept its assignment
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

commit;
