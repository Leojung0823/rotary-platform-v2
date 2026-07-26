BEGIN;

-- This UUID is the single well-known non-login actor for deterministic seed
-- attribution. It must never be copied into application code or bootstrap SQL.
INSERT INTO public.accounts (
  account_id,
  account_kind,
  account_person_id,
  account_auth_user_id,
  account_status,
  account_creation_source,
  account_activated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'system',
  NULL,
  NULL,
  'active',
  'data_migration',
  now()
)
ON CONFLICT (account_id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.accounts
    WHERE account_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND account_kind = 'system'
      AND account_status = 'active'
      AND account_person_id IS NULL
      AND account_auth_user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Reserved V1.2 seed actor UUID is occupied by an incompatible Account';
  END IF;
END;
$$;

INSERT INTO public.roles (
  role_scope_type, role_code, role_name, role_description, role_is_system_role
)
VALUES
  ('platform', 'platform.admin', '平台管理員', '管理平台身份與授權基礎。', true),
  ('district', 'district.admin', '地區管理員', '管理單一地區的社與管理者。', true),
  ('club', 'club.president', '社長', '管理所屬扶輪社的治理與人員。', true),
  ('club', 'club.secretary', '秘書', '管理所屬扶輪社社員、邀請與身份狀態。', true),
  ('club', 'club.finance', '財務', '檢視社員並管理財務相關授權邊界。', true),
  ('club', 'club.member', '一般社員', '使用所屬扶輪社的一般社員功能。', true)
ON CONFLICT (role_code) DO UPDATE SET
  role_scope_type = EXCLUDED.role_scope_type,
  role_name = EXCLUDED.role_name,
  role_description = EXCLUDED.role_description,
  role_is_system_role = true,
  role_status = 'active';

INSERT INTO public.permissions (
  permission_code, permission_resource, permission_action,
  permission_description, permission_risk_level
)
VALUES
  ('platform.manage', 'platform', 'manage', '管理平台層級設定與管理者。', 'critical'),
  ('district.manage', 'district', 'manage', '管理地區層級設定與管理者。', 'high'),
  ('club.manage', 'club', 'manage', '管理扶輪社基本資料。', 'high'),
  ('member.read', 'member', 'read', '檢視授權範圍內的社員資料。', 'medium'),
  ('member.manage', 'member', 'manage', '建立、修改、停用或啟用社員。', 'high'),
  ('invitation.manage', 'invitation', 'manage', '建立、重送與撤銷社員邀請。', 'high'),
  ('identity.read', 'identity', 'read', '檢視身份綁定與登入狀態。', 'medium'),
  ('identity.unbind', 'identity', 'unbind', '解除登入身份並啟動重綁流程。', 'critical'),
  ('device.manage', 'device', 'manage', '管理社員裝置與工作階段。', 'high'),
  ('line_oa.manage', 'line_oa', 'manage', '管理 LINE OA 聯絡人配對。', 'high'),
  ('audit.read', 'audit', 'read', '檢視授權範圍內的稽核紀錄。', 'high'),
  ('profile.self_manage', 'profile', 'self_manage', '管理自己的基本資料與偏好。', 'low')
ON CONFLICT (permission_code) DO UPDATE SET
  permission_resource = EXCLUDED.permission_resource,
  permission_action = EXCLUDED.permission_action,
  permission_description = EXCLUDED.permission_description,
  permission_risk_level = EXCLUDED.permission_risk_level,
  permission_status = 'active';

WITH grants(role_code, permission_code) AS (
  VALUES
    ('platform.admin', 'platform.manage'),
    ('platform.admin', 'district.manage'),
    ('platform.admin', 'club.manage'),
    ('platform.admin', 'member.read'),
    ('platform.admin', 'member.manage'),
    ('platform.admin', 'invitation.manage'),
    ('platform.admin', 'identity.read'),
    ('platform.admin', 'identity.unbind'),
    ('platform.admin', 'device.manage'),
    ('platform.admin', 'line_oa.manage'),
    ('platform.admin', 'audit.read'),
    ('district.admin', 'district.manage'),
    ('district.admin', 'club.manage'),
    ('district.admin', 'member.read'),
    ('district.admin', 'member.manage'),
    ('district.admin', 'invitation.manage'),
    ('district.admin', 'identity.read'),
    ('district.admin', 'audit.read'),
    ('club.president', 'club.manage'),
    ('club.president', 'member.read'),
    ('club.president', 'member.manage'),
    ('club.president', 'invitation.manage'),
    ('club.president', 'identity.read'),
    ('club.president', 'identity.unbind'),
    ('club.president', 'device.manage'),
    ('club.president', 'line_oa.manage'),
    ('club.president', 'audit.read'),
    ('club.secretary', 'member.read'),
    ('club.secretary', 'member.manage'),
    ('club.secretary', 'invitation.manage'),
    ('club.secretary', 'identity.read'),
    ('club.secretary', 'identity.unbind'),
    ('club.secretary', 'device.manage'),
    ('club.secretary', 'line_oa.manage'),
    ('club.finance', 'member.read'),
    ('club.member', 'profile.self_manage')
)
INSERT INTO public.role_permissions (
  role_permission_role_id,
  role_permission_permission_id,
  role_permission_granted_by_account_id
)
SELECT r.role_id, p.permission_id,
       '00000000-0000-0000-0000-000000000001'::uuid
FROM grants g
JOIN public.roles r ON r.role_code = g.role_code
JOIN public.permissions p ON p.permission_code = g.permission_code
ON CONFLICT (role_permission_role_id, role_permission_permission_id) DO NOTHING;

INSERT INTO v12_meta.seed_versions (
  seed_version,
  seed_description
)
VALUES (
  '0001_system_actor_and_rbac',
  'Deterministic non-login system actor and RBAC catalog.'
)
ON CONFLICT (seed_version) DO NOTHING;

COMMIT;
