import { timingSafeEqual } from "node:crypto";

export const LINE_OAUTH_TTL_SECONDS = 10 * 60;
export type LineOAuthFlow = "login" | "invitation" | "bind";

export const LINE_OAUTH_COOKIE_NAMES = [
  "line_oauth_state",
  "line_oauth_nonce",
  "line_invitation",
  "line_return_to",
  "line_flow",
] as const;

type CookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
};

export type LineCookieStore = {
  set(name: string, value: string, options: CookieOptions): unknown;
};

export function isProductionRuntime() {
  return process.env.APP_ENV === "production";
}

export function lineSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured && isProductionRuntime()) {
    throw new Error("LINE Login site URL is not configured.");
  }

  const url = new URL(configured || "http://localhost:3000");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password
    || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("LINE Login site URL is invalid.");
  }
  if (isProductionRuntime() && url.protocol !== "https:") {
    throw new Error("LINE Login production site URL must use HTTPS.");
  }
  return url;
}

export function lineOAuthCookieOptions(maxAge = LINE_OAUTH_TTL_SECONDS): CookieOptions {
  return {
    httpOnly: true,
    secure: isProductionRuntime(),
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

export function setLineOAuthCookies(
  store: LineCookieStore,
  values: {
    state: string;
    nonce: string;
    invitation: string;
    returnTo: string;
    flow: LineOAuthFlow;
  },
) {
  const options = lineOAuthCookieOptions();
  store.set("line_oauth_state", values.state, options);
  store.set("line_oauth_nonce", values.nonce, options);
  store.set("line_invitation", values.invitation, options);
  store.set("line_return_to", values.returnTo, options);
  store.set("line_flow", values.flow, options);
}

export function clearLineOAuthCookies(store: LineCookieStore) {
  const options = lineOAuthCookieOptions(0);
  for (const name of LINE_OAUTH_COOKIE_NAMES) store.set(name, "", options);
}

export function clearLineMvpCookies(store: LineCookieStore) {
  clearLineOAuthCookies(store);
  store.set("rotary_device", "", lineOAuthCookieOptions(0));
}

export function constantTimeEqual(leftValue: string, rightValue: string) {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function safeLineRedirectPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || value.length > 2048 || !value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/u.test(value)) return fallback;

  let decoded = value;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      return fallback;
    }
    if (decoded.startsWith("//") || decoded.includes("\\") || /[\u0000-\u001f\u007f]/u.test(decoded)) return fallback;
  }

  try {
    const parsed = new URL(value, "https://line-login.local");
    if (parsed.origin !== "https://line-login.local") return fallback;
  } catch {
    return fallback;
  }
  return value;
}

export function isSameOriginLineRequest(request: Request) {
  let expectedOrigin: string;
  try {
    expectedOrigin = lineSiteUrl().origin;
  } catch {
    return false;
  }

  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin !== expectedOrigin) return false;
  return !fetchSite || fetchSite === "same-origin";
}

export function lineLoginFailureUrl() {
  return new URL("/login?error=line_login_failed", lineSiteUrl());
}

export function trustedLineRedirectUrl(path: string) {
  return new URL(safeLineRedirectPath(path), lineSiteUrl());
}
