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

function revision() {
  const value = process.env.APP_REVISION
    ?? process.env.VERCEL_GIT_COMMIT_SHA
    ?? process.env.GITHUB_SHA
    ?? process.env.RENDER_GIT_COMMIT
    ?? "";
  return value ? value.slice(0, 12) : null;
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
    revision: revision(),
    timestamp: new Date().toISOString(),
    checks: {
      configuration: deployment.ok,
      database,
    },
    issues,
    warnings,
  };
}
