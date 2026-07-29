export type DirectoryClub = {
  club_id: string;
  club_code: string;
  club_name: string;
};

export type DirectoryMember = {
  membership_id: string;
  display_name: string;
  avatar_url: string | null;
  role_key: "president" | "secretary" | "finance" | "member";
  email: string | null;
  phone: string | null;
  birth_year: number | null;
  is_self: boolean;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const roleKeys = new Set<DirectoryMember["role_key"]>(["president", "secretary", "finance", "member"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseDirectoryUuid(value: unknown) {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (!uuidPattern.test(parsed)) throw new Error("invalid_directory_uuid");
  return parsed.toLowerCase();
}

export function parseDirectoryClubs(value: unknown): DirectoryClub[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    if (
      typeof item.club_id !== "string"
      || typeof item.club_code !== "string"
      || typeof item.club_name !== "string"
      || !uuidPattern.test(item.club_id)
    ) return [];
    return [{
      club_id: item.club_id.toLowerCase(),
      club_code: item.club_code,
      club_name: item.club_name,
    }];
  });
}

export function parseDirectoryMembers(value: unknown): DirectoryMember[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    if (
      typeof item.membership_id !== "string"
      || !uuidPattern.test(item.membership_id)
      || typeof item.display_name !== "string"
      || !roleKeys.has(item.role_key as DirectoryMember["role_key"])
      || (item.avatar_url !== null && typeof item.avatar_url !== "string")
      || (item.email !== null && typeof item.email !== "string")
      || (item.phone !== null && typeof item.phone !== "string")
      || (item.birth_year !== null && (!Number.isInteger(item.birth_year) || Number(item.birth_year) < 1900 || Number(item.birth_year) > 2200))
      || typeof item.is_self !== "boolean"
    ) return [];
    return [{
      membership_id: item.membership_id.toLowerCase(),
      display_name: item.display_name,
      avatar_url: item.avatar_url,
      role_key: item.role_key as DirectoryMember["role_key"],
      email: item.email,
      phone: item.phone,
      birth_year: item.birth_year === null ? null : Number(item.birth_year),
      is_self: item.is_self,
    }];
  });
}

export function parseDirectoryMember(value: unknown): DirectoryMember | null {
  const parsed = parseDirectoryMembers(value === null ? [] : [value]);
  return parsed[0] ?? null;
}

export function directoryRoleLabel(role: DirectoryMember["role_key"]) {
  return {
    president: "社長",
    secretary: "秘書",
    finance: "財務",
    member: "社員",
  }[role];
}
