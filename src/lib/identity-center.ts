export type IdentityCenter = {
  account: {
    status: string;
    has_active_access: boolean;
    has_password_login: boolean;
  };
  profile: {
    display_name: string;
    phone: string | null;
    email: string | null;
    birth_date: string | null;
    avatar_url: string | null;
    occupation: string | null;
    profile_completed_at: string | null;
  };
  line_identity: {
    id: string;
    status: string;
    display_name: string;
    picture_url: string | null;
    bound_at: string;
    last_login_at: string | null;
  } | null;
  devices: {
    id: string;
    name: string;
    trusted: boolean;
    last_seen_at: string;
    revoked_at: string | null;
    is_current: boolean;
  }[];
  login_history: {
    provider: string;
    outcome: string;
    created_at: string;
    user_agent: string | null;
  }[];
  notification_settings: Record<string, boolean> | null;
  privacy_settings: Record<string, boolean> | null;
};

export const identityProviderLabels: Record<string, string> = {
  password: "平台密碼",
  line: "LINE Login",
  line_mock: "LINE 模擬登入",
  invite: "邀請",
};
