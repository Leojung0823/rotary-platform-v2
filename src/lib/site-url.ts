const localHosts = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function parseSiteOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return new URL(parsed.origin);
  } catch {
    return null;
  }
}

function isPublicHttpsOrigin(url: URL | null) {
  return Boolean(url && url.protocol === "https:" && !localHosts.has(url.hostname));
}

export function trustedSiteUrl(environment: NodeJS.ProcessEnv = process.env) {
  const hosted = environment.APP_ENV === "staging" || environment.APP_ENV === "production";
  const configured = parseSiteOrigin(environment.NEXT_PUBLIC_SITE_URL);
  const render = parseSiteOrigin(environment.RENDER_EXTERNAL_URL);

  // Prefer a public HTTPS origin whenever one is available, even if APP_ENV was
  // accidentally omitted or set to local on a hosted Render service.
  if (isPublicHttpsOrigin(configured)) return configured!;
  if (isPublicHttpsOrigin(render)) return render!;

  if (hosted) {
    throw new Error("Hosted site URL is not configured.");
  }

  return configured ?? render ?? new URL("http://localhost:3000");
}

export function trustedSiteRedirect(path: string, environment: NodeJS.ProcessEnv = process.env) {
  return new URL(path, trustedSiteUrl(environment));
}
