export type ManagementToolFeatures = Readonly<{
  blessingIouEnabled: boolean;
  birthdayCollectionEnabled: boolean;
  archiveHandoverEnabled: boolean;
}>;

export type ManagementTool = Readonly<{
  id: string;
  title: string;
  description: string;
  href: string;
}>;

function managementToolHref(clubId: string, path: string) {
  return `/clubs/${encodeURIComponent(clubId)}/${path}?mode=management`;
}

/**
 * Build only the low-frequency cards that belong on the management overview.
 * First-level work destinations, such as messages, stay in the shell and are
 * intentionally not duplicated here.
 */
export function managementToolsForClub(
  clubId: string,
  permissions: readonly string[],
  features: ManagementToolFeatures,
): readonly ManagementTool[] {
  const hasPermission = (permission: string) => permissions.includes(permission);

  return [
    hasPermission("member.manage") ? {
      id: "members",
      title: "社員管理",
      description: "查看社員、調整社籍與處理邀請相關工作。",
      href: managementToolHref(clubId, "members"),
    } : null,
    hasPermission("invitation.manage") ? {
      id: "invitations",
      title: "邀請管理",
      description: "建立、重送或取消社員邀請。",
      href: managementToolHref(clubId, "invitations"),
    } : null,
    hasPermission("identity.read") ? {
      id: "identity",
      title: "社務資料",
      description: "維護扶輪社名稱與基本資料。",
      href: managementToolHref(clubId, "identity"),
    } : null,
    features.blessingIouEnabled && hasPermission("blessing_iou.manage") ? {
      id: "blessing-iou",
      title: "祝福 IOU",
      description: "查看祝福、承諾捐款與收款統計。",
      href: managementToolHref(clubId, "blessing-iou"),
    } : null,
    features.birthdayCollectionEnabled && hasPermission("member.manage") ? {
      id: "birthday-collection",
      title: "生日祝福徵集",
      description: "派發每人一則生日任務、審核內容與管理題庫。",
      href: managementToolHref(clubId, "birthday-collection"),
    } : null,
    features.archiveHandoverEnabled && hasPermission("member.manage") ? {
      id: "archives",
      title: "文件中心與年度交接",
      description: "管理年度文件、版本與交接清單。",
      href: managementToolHref(clubId, "archives"),
    } : null,
    hasPermission("role.manage") ? {
      id: "operators",
      title: "執行秘書管理",
      description: "管理社務操作人員與管理範圍。",
      href: managementToolHref(clubId, "operators"),
    } : null,
  ].filter((tool): tool is ManagementTool => tool !== null);
}
