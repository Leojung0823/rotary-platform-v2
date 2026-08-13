begin;

-- Executive secretaries should have every permission scoped to their own
-- club; the only thing distinguishing them from a platform admin is that
-- platform-level actions (creating/renaming/archiving clubs, seeing every
-- club) are gated directly on current_has_platform_role(...) in those RPCs,
-- never on this table -- so granting the rest of the club-scoped
-- permissions here cannot leak cross-club capability.
--
-- secretary already had every other permission; finance.read and
-- profile.self were the only two missing.
insert into public.role_permissions (role_key, permission_key)
values
  ('secretary', 'finance.read'),
  ('secretary', 'profile.self')
on conflict (role_key, permission_key) do nothing;

commit;
