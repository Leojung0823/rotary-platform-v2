begin;

-- Executive secretaries (club_operator_permissions, permission_level =
-- 'club_manager') inherit their permission set through role_permissions
-- rows keyed on role_key = 'secretary' (see current_has_club_permission's
-- operator bypass). They previously had every club-admin permission except
-- role.manage, so they could not change a member's club role (president /
-- secretary / finance / member) — only the president could.
insert into public.role_permissions (role_key, permission_key)
values ('secretary', 'role.manage')
on conflict (role_key, permission_key) do nothing;

commit;
