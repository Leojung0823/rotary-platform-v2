begin;

-- 平台管理員進得去每一個社的管理介面，而且是從社團選擇器進去。
--
-- current_has_club_permission 的第一個條件就是
-- current_has_platform_role(['superadmin','platform_admin'])，所以資料庫從來
-- 都允許。但 resolve_my_experience_context 只從「執行秘書指派」和「社內幹部
-- 角色」算 managed_clubs，平台角色不在其中 —— 於是平台管理員的
-- clubsForExperienceMode('management') 是空的、社團選擇器是空的、每一條社務
-- 管理的路都進不去，而平台端的頁面還放著「管理社員」「管理執行秘書」兩顆
-- 指過去的按鈕。
--
-- 改在這裡而不是在 layout 特例，是因為脈絡要說出資料庫實際允許什麼。放在
-- layout 的話，每一個從脈絡推導「我能管哪些社」的頁面（社費就是一個）都要
-- 各自再補一次例外，而漏掉的那個就是下一個「無法存取」。
--
-- limit 100 維持原樣。一個平台管理員的選擇器列一百個社已經不是選擇器了，
-- 而超過那個規模需要的是搜尋，不是更大的數字。

create or replace function public.resolve_my_experience_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  result jsonb;
begin
  if public.current_app_account_id() is null then
    raise exception using errcode = '42501', message = 'experience_context_access_denied';
  end if;

  with caller as (
    select account.id as app_account_id, account.person_id
    from public.app_accounts as account
    where account.id = public.current_app_account_id()
  ),
  member_clubs as (
    select
      club.id as club_id,
      club.club_code,
      club.club_name,
      (
        exists (
          select 1
          from public.club_role_assignments as assignment
          where assignment.club_id = club.id
            and assignment.app_account_id = caller.app_account_id
            and assignment.assignment_status = 'active'
            and assignment.role_key in ('president', 'secretary', 'finance')
        )
        -- An executive secretary who is also a member of the club they operate
        -- was impossible until the overlap rule was dropped. Without this the
        -- club would land in member_clubs with can_manage false and be excluded
        -- from managed_only_clubs, silently costing them their management shell.
        or exists (
          select 1
          from public.club_operator_permissions as operator_permission
          where operator_permission.club_id = club.id
            and operator_permission.app_account_id = caller.app_account_id
            and operator_permission.assignment_status = 'active'
            and operator_permission.permission_level = 'club_manager'
            and operator_permission.starts_at <= pg_catalog.now()
            and (operator_permission.ends_at is null or operator_permission.ends_at > pg_catalog.now())
        )
      ) as can_manage
    from caller
    join public.club_memberships as membership
      on membership.person_id = caller.person_id
     and membership.membership_status = 'active'
    join public.clubs as club
      on club.id = membership.club_id
     and club.club_status = 'active'
    order by club.club_name, club.id
    limit 100
  ),
  assigned_managed_clubs as (
    select
      club.id as club_id,
      club.club_code,
      club.club_name
    from caller
    join public.clubs as club
      on club.club_status in ('provisioning', 'active')
    where exists (
      select 1
      from public.club_operator_permissions as operator_permission
      where operator_permission.club_id = club.id
        and operator_permission.app_account_id = caller.app_account_id
        and operator_permission.assignment_status = 'active'
        and operator_permission.permission_level = 'club_manager'
        and operator_permission.starts_at <= pg_catalog.now()
        and (operator_permission.ends_at is null or operator_permission.ends_at > pg_catalog.now())
    )
    or exists (
      select 1
      from public.club_role_assignments as assignment
      join public.club_memberships as membership
        on membership.club_id = assignment.club_id
       and membership.person_id = caller.person_id
       and membership.membership_status = 'active'
      where assignment.club_id = club.id
        and assignment.app_account_id = caller.app_account_id
        and assignment.assignment_status = 'active'
        and assignment.role_key in ('president', 'secretary', 'finance')
    )
    order by club.club_name, club.id
    limit 100
  ),
  -- 平台管理員管得了每一個社。
  --
  -- current_has_club_permission 的第一個條件就是平台角色，所以資料庫一直都是
  -- 這樣算的 —— 只有這份投影不是，於是平台管理員的社團選擇器是空的，每一條
  -- 社務管理的路都進不去，而平台端的頁面還放著指過去的按鈕。
  --
  -- 和「靠指派管理」分開，因為兩者決定的是不同的事：這一份決定選擇器裡有
  -- 哪些社，assigned_managed_clubs 決定登入之後預設落在哪個模式。合成一個的
  -- 話，平台管理員一登入就會掉進某一個社的管理介面，而不是平台工作台。
  managed_clubs as (
    select assigned.club_id, assigned.club_code, assigned.club_name
    from assigned_managed_clubs as assigned
    union
    select club.id, club.club_code, club.club_name
    from public.clubs as club
    where club.club_status in ('provisioning', 'active')
      and public.current_has_platform_role(array['superadmin', 'platform_admin'])
    order by 3, 1
    limit 100
  ),
  managed_only_clubs as (
    select managed.club_id, managed.club_code, managed.club_name
    from managed_clubs as managed
    where not exists (
      select 1 from member_clubs as member
      where member.club_id = managed.club_id
    )
    order by managed.club_name, managed.club_id
    limit 100
  ),
  flags as (
    select
      exists (select 1 from member_clubs) as has_active_membership,
      exists (select 1 from managed_clubs) as can_manage,
      -- 預設模式看的是「有人指派我管這個社」，不是「我管得了」。平台管理員
      -- 管得了每一個社，但他登入之後該落在平台工作台。
      exists (select 1 from assigned_managed_clubs) as manages_by_assignment,
      public.current_has_platform_role(array['superadmin', 'platform_admin']) as has_platform_access
  ),
  projection as (
    select
      flags.has_active_membership,
      flags.can_manage,
      flags.manages_by_assignment,
      flags.has_platform_access,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'club_id', member.club_id,
            'club_code', member.club_code,
            'club_name', member.club_name,
            'can_manage', member.can_manage
          ) order by member.club_name, member.club_id
        )
        from member_clubs as member
      ), '[]'::jsonb) as member_clubs,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'club_id', managed.club_id,
            'club_code', managed.club_code,
            'club_name', managed.club_name,
            'can_manage', true
          ) order by managed.club_name, managed.club_id
        )
        from managed_only_clubs as managed
      ), '[]'::jsonb) as managed_only_clubs
    from flags
  )
  select jsonb_build_object(
    'has_active_membership', has_active_membership,
    'can_register', has_active_membership,
    'can_manage', can_manage,
    'has_platform_access', has_platform_access,
    'member_clubs', member_clubs,
    'managed_only_clubs', managed_only_clubs,
    'default_mode', case
      when has_active_membership then 'member'
      when manages_by_assignment then 'management'
      when has_platform_access then 'platform'
      else null
    end,
    'available_modes', to_jsonb(array_remove(array[
      case when has_active_membership then 'member'::text end,
      case when can_manage then 'management'::text end,
      case when has_platform_access then 'platform'::text end
    ], null))
  ) into result
  from projection;

  if result is null or result ->> 'default_mode' is null then
    raise exception using errcode = '42501', message = 'experience_context_access_denied';
  end if;

  return result;
end;
$$;
commit;
