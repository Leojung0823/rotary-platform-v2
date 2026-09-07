import type { ExperienceContext } from "./experience-context";
import { resolveExperienceDashboard, type ExperienceDashboardResolution } from "./experience-routing";

export type DashboardRoleContextResolution =
  | Readonly<{ kind: "legacy"; contextUnavailable: boolean }>
  | Readonly<{ kind: "unavailable"; reason: "context_unavailable" }>
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
  if (!context) return { kind: "unavailable", reason: "context_unavailable" };
  return { kind: "resolver", resolution: resolveExperienceDashboard(context, requestedMode) };
}
