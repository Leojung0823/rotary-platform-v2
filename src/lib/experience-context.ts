export const experienceModes = ["member", "management", "platform"] as const;
export type ExperienceMode = (typeof experienceModes)[number];

export type ClubContext = Readonly<{
  clubId: string;
  clubCode: string;
  clubName: string;
  canManage: boolean;
}>;

export type ExperienceContext = Readonly<{
  hasActiveMembership: boolean;
  canRegister: boolean;
  canManage: boolean;
  hasPlatformAccess: boolean;
  memberClubs: readonly ClubContext[];
  managedOnlyClubs: readonly ClubContext[];
  activeClubId: string | null;
  defaultMode: ExperienceMode;
  availableModes: readonly ExperienceMode[];
}>;

export type ExperienceContextProjection = Omit<ExperienceContext, "activeClubId">;

const maximumClubs = 100;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMode(value: unknown): value is ExperienceMode {
  return typeof value === "string" && experienceModes.includes(value as ExperienceMode);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function parseClubContext(value: unknown): ClubContext | null {
  if (!isRecord(value)
    || !isUuid(value.club_id)
    || typeof value.club_code !== "string"
    || typeof value.club_name !== "string"
    || typeof value.can_manage !== "boolean"
    || value.club_code.length === 0
    || value.club_code.length > 64
    || value.club_name.length === 0
    || value.club_name.length > 300) return null;

  return {
    clubId: value.club_id,
    clubCode: value.club_code,
    clubName: value.club_name,
    canManage: value.can_manage,
  };
}

function parseClubs(value: unknown): readonly ClubContext[] | null {
  if (!Array.isArray(value) || value.length > maximumClubs) return null;
  const clubs = value.map(parseClubContext);
  if (clubs.some((club) => club === null)) return null;
  const complete = clubs as ClubContext[];
  return new Set(complete.map((club) => club.clubId)).size === complete.length ? complete : null;
}

function expectedModes({
  hasActiveMembership,
  canManage,
  hasPlatformAccess,
}: Pick<ExperienceContextProjection, "hasActiveMembership" | "canManage" | "hasPlatformAccess">) {
  return [
    ...(hasActiveMembership ? ["member" as const] : []),
    ...(canManage ? ["management" as const] : []),
    ...(hasPlatformAccess ? ["platform" as const] : []),
  ];
}

export function parseExperienceContextProjection(value: unknown): ExperienceContextProjection | null {
  if (!isRecord(value)
    || typeof value.has_active_membership !== "boolean"
    || typeof value.can_register !== "boolean"
    || typeof value.can_manage !== "boolean"
    || typeof value.has_platform_access !== "boolean"
    || !isMode(value.default_mode)
    || !Array.isArray(value.available_modes)
    || !value.available_modes.every(isMode)) return null;

  const availableModes = value.available_modes;

  const memberClubs = parseClubs(value.member_clubs);
  const managedOnlyClubs = parseClubs(value.managed_only_clubs);
  if (!memberClubs || !managedOnlyClubs) return null;
  if (memberClubs.some((member) => managedOnlyClubs.some((managed) => managed.clubId === member.clubId))) return null;

  const hasActiveMembership = value.has_active_membership;
  const canManage = value.can_manage;
  const hasPlatformAccess = value.has_platform_access;
  const modes = expectedModes({ hasActiveMembership, canManage, hasPlatformAccess });
  if (value.can_register !== hasActiveMembership || hasActiveMembership !== (memberClubs.length > 0)) return null;
  if (canManage !== (memberClubs.some((club) => club.canManage) || managedOnlyClubs.length > 0)) return null;
  if (value.default_mode !== modes[0]
    || modes.length !== availableModes.length
    || modes.some((mode, index) => mode !== availableModes[index])) return null;

  return {
    hasActiveMembership,
    canRegister: value.can_register,
    canManage,
    hasPlatformAccess,
    memberClubs,
    managedOnlyClubs,
    defaultMode: value.default_mode,
    availableModes: modes,
  };
}

export function activeClubCandidates(context: ExperienceContextProjection): readonly ClubContext[] {
  const candidates = [...context.memberClubs, ...context.managedOnlyClubs];
  return candidates.filter((club, index) => candidates.findIndex((candidate) => candidate.clubId === club.clubId) === index);
}

export function applyActiveClubPreference(
  context: ExperienceContextProjection,
  preferredClubId: unknown,
): ExperienceContext {
  const candidates = activeClubCandidates(context);
  const activeClubId = isUuid(preferredClubId) && candidates.some((club) => club.clubId === preferredClubId)
    ? preferredClubId
    : candidates[0]?.clubId ?? null;

  return { ...context, activeClubId };
}

export function resolveExperienceMode(context: ExperienceContext, requestedMode: unknown): ExperienceMode {
  return isMode(requestedMode) && context.availableModes.includes(requestedMode)
    ? requestedMode
    : context.defaultMode;
}

export function clubsForExperienceMode(context: ExperienceContext, mode: ExperienceMode): readonly ClubContext[] {
  if (mode === "member") return context.memberClubs;
  if (mode === "management") return [
    ...context.memberClubs.filter((club) => club.canManage),
    ...context.managedOnlyClubs,
  ];
  return [];
}

export function activeClubForMode(context: ExperienceContext, mode: ExperienceMode): ClubContext | null {
  const clubs = clubsForExperienceMode(context, mode);
  return clubs.find((club) => club.clubId === context.activeClubId) ?? clubs[0] ?? null;
}

export function resolveActiveClubPreferenceChange(
  context: ExperienceContext,
  requestedMode: unknown,
  requestedClubId: unknown,
): Readonly<{ mode: ExperienceMode; clubId: string | null }> {
  const mode = resolveExperienceMode(context, requestedMode);
  const candidate = clubsForExperienceMode(context, mode)
    .find((club) => club.clubId === requestedClubId)
    ?? activeClubForMode(context, mode);
  return { mode, clubId: candidate?.clubId ?? null };
}
