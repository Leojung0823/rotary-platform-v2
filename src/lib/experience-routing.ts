import {
  activeClubForMode,
  resolveExperienceMode,
  type ExperienceContext,
  type ExperienceMode,
} from "./experience-context";

export type ExperienceDashboardResolution =
  | Readonly<{ kind: "access_denied" }>
  | Readonly<{ kind: "resolver"; mode: ExperienceMode; destination: string }>;

export function resolveExperienceDashboard(
  context: ExperienceContext,
  requestedMode: unknown,
): ExperienceDashboardResolution {
  const mode = resolveExperienceMode(context, requestedMode);
  if (mode === "platform") return { kind: "resolver", mode, destination: "/platform/clubs" };

  const activeClub = activeClubForMode(context, mode);
  if (!activeClub) return { kind: "access_denied" };

  return {
    kind: "resolver",
    mode,
    destination: mode === "member"
      ? `/club/${encodeURIComponent(activeClub.clubId)}`
      : `/clubs/${encodeURIComponent(activeClub.clubId)}/identity`,
  };
}
