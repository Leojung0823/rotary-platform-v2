import { createClient } from "@supabase/supabase-js";

const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

function adminEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Trusted Supabase admin environment is not configured.");

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Trusted Supabase admin URL is invalid.");
  }

  return { url, serviceRoleKey, parsed, local: localHosts.has(parsed.hostname) };
}

export function createLocalAdminClient() {
  const environment = adminEnvironment();
  if (!environment.local) throw new Error("Admin operations are restricted to local Supabase.");
  return createClient(environment.url, environment.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createTrustedAdminClient() {
  const environment = adminEnvironment();
  if (!environment.local) {
    const appEnvironment = process.env.APP_ENV;
    const trustedBoundary = process.env.TRUSTED_ADMIN_ENVIRONMENT;
    const hostedEnvironment = appEnvironment === "staging" || appEnvironment === "production";
    if (environment.parsed.protocol !== "https:") {
      throw new Error("Trusted hosted admin operations require HTTPS Supabase.");
    }
    if (!hostedEnvironment || trustedBoundary !== appEnvironment) {
      throw new Error("Trusted admin operations require an exact hosted environment boundary.");
    }
  }
  return createClient(environment.url, environment.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
