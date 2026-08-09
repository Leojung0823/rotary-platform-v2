import type { ExperienceContext } from "./experience-context";
import { resolveExperienceDashboard, type ExperienceDashboardResolution } from "./experience-routing";

export type DashboardRoleContextResolution =
  | Readonly<{ kind: "legacy"; contextUnavailable: boolean }>
  | Readonly<{ kind: "resolver"; resolution: ExperienceDashboardResolution }>;

export function resolveDashboardRoleContext({
  roleContextEnabled,
  context,
  requestedMode,
}: {
  roleContextEnabled: boolean;
  context: ExperienceContext | null;
  requestedMode: unknown;
}): DashboardRoleContextResolution {
  if (!roleContextEnabled) return { kind: "legacy", contextUnavailable: false };
  if (!context) return { kind: "legacy", contextUnavailable: true };
  return { kind: "resolver", resolution: resolveExperienceDashboard(context, requestedMode) };
}
