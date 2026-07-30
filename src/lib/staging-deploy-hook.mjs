import { hostnameResolvesPublicly, isPublicHostname } from "./public-hostname.mjs";

export class StagingDeployHookError extends Error {
  constructor(code) {
    super(code);
    this.name = "StagingDeployHookError";
    this.code = code;
  }
}

export function parseStagingDeployHook(rawValue) {
  let hook;
  try {
    hook = new URL(String(rawValue ?? "").trim());
  } catch {
    throw new StagingDeployHookError("STAGING_DEPLOY_HOOK_INVALID");
  }

  if (hook.protocol !== "https:"
    || hook.username
    || hook.password
    || hook.hash
    || !isPublicHostname(hook.hostname)) {
    throw new StagingDeployHookError("STAGING_DEPLOY_HOOK_UNSAFE");
  }
  return hook;
}

export async function triggerStagingDeployment(rawValue, options = {}) {
  const hook = parseStagingDeployHook(rawValue);
  const timeoutMs = Number(options.timeoutMs ?? 15_000);
  const fetchImpl = options.fetchImpl ?? fetch;
  const lookupImpl = options.lookupImpl;

  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) {
    throw new StagingDeployHookError("STAGING_DEPLOY_HOOK_TIMEOUT_INVALID");
  }
  if (!await hostnameResolvesPublicly(hook.hostname, lookupImpl)) {
    throw new StagingDeployHookError("STAGING_DEPLOY_HOOK_DNS_UNSAFE");
  }

  let response;
  try {
    response = await fetchImpl(hook, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        accept: "application/json",
        "user-agent": "rotary-platform-staging-deploy/1.0",
      },
    });
  } catch {
    throw new StagingDeployHookError("STAGING_DEPLOY_HOOK_REQUEST_FAILED");
  }

  if (response.status >= 300 && response.status < 400) {
    throw new StagingDeployHookError("STAGING_DEPLOY_HOOK_REDIRECT_REJECTED");
  }
  if (response.status < 200 || response.status >= 300) {
    throw new StagingDeployHookError(`STAGING_DEPLOY_HOOK_HTTP_${response.status}`);
  }

  return { accepted: true, status: response.status };
}
