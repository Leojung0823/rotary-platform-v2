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
