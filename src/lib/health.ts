import { createTrustedAdminClient } from "@/lib/supabase/admin";
import { inspectDeploymentEnvironment } from "@/lib/deployment-env.mjs";

export type HealthSnapshot = {
  status: "ok" | "degraded";
  service: "rotary-platform-v2";
  environment: string;
  revision: string | null;
  timestamp: string;
  checks: {
    configuration: boolean;
    database: boolean;
  };
  issues: string[];
  warnings: string[];
};

type RevisionEnvironment = Record<string, string | undefined>;

export function resolveDeploymentRevision(env: RevisionEnvironment) {
  // Hosting-provider commit metadata describes the code that is actually
  // running. APP_REVISION is an operator-supplied fallback and can become
  // stale across deploys, so it must never mask Render or Vercel metadata.
  const value = env.RENDER_GIT_COMMIT
    ?? env.VERCEL_GIT_COMMIT_SHA
    ?? env.GITHUB_SHA
    ?? env.APP_REVISION
    ?? "";
  const normalized = value.trim();
  return normalized ? normalized.slice(0, 12) : null;
}

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  const deployment = inspectDeploymentEnvironment(process.env);
  let database = false;

  if (deployment.ok) {
    try {
      const admin = createTrustedAdminClient();
      const result = await admin.from("clubs").select("id", { head: true, count: "exact" }).limit(1);
      database = !result.error;
    } catch {
      database = false;
    }
  }

  const issues: string[] = [];
  if (!deployment.ok) issues.push("CONFIGURATION_INVALID");
  if (deployment.ok && !database) issues.push("DATABASE_UNAVAILABLE");

  const warnings = deployment.warnings.length > 0 ? ["DEPLOYMENT_WARNING"] : [];
  const healthy = deployment.ok && database;
  return {
    status: healthy ? "ok" : "degraded",
    service: "rotary-platform-v2",
    environment: deployment.environment,
    revision: resolveDeploymentRevision(process.env),
    timestamp: new Date().toISOString(),
    checks: {
      configuration: deployment.ok,
      database,
    },
    issues,
    warnings,
  };
}
