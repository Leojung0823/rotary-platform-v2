export type DashboardClubAccess = {
  permission_level: string;
};

export type DashboardAccessPresentation = {
  canManageClubs: boolean;
  clubCountLabel: string;
  roleLabel: string;
};

export function dashboardAccessPresentation(
  hasPlatformAccess: boolean,
  clubs: DashboardClubAccess[],
): DashboardAccessPresentation {
  const hasClubManagement = clubs.some((club) =>
    club.permission_level === "platform_admin" || club.permission_level === "club_manager"
  );
  const canManageClubs = hasPlatformAccess || hasClubManagement;

  return {
    canManageClubs,
    clubCountLabel: canManageClubs ? "可管理扶輪社" : "已加入扶輪社",
    roleLabel: hasPlatformAccess
      ? "平台管理員"
      : hasClubManagement
        ? "執行秘書"
        : clubs.length > 0
          ? "一般社員"
          : "一般使用者",
  };
}
