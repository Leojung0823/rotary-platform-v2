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

export function trustedSiteUrl(environment: NodeJS.ProcessEnv = process.env) {
  const hosted = environment.APP_ENV === "staging" || environment.APP_ENV === "production";
  const configured = parseSiteOrigin(environment.NEXT_PUBLIC_SITE_URL);
  const render = parseSiteOrigin(environment.RENDER_EXTERNAL_URL);

  if (hosted) {
    if (configured?.protocol === "https:" && !localHosts.has(configured.hostname)) return configured;
    if (render?.protocol === "https:" && !localHosts.has(render.hostname)) return render;
    throw new Error("Hosted site URL is not configured.");
  }

  return configured ?? render ?? new URL("http://localhost:3000");
}

export function trustedSiteRedirect(path: string, environment: NodeJS.ProcessEnv = process.env) {
  return new URL(path, trustedSiteUrl(environment));
}
