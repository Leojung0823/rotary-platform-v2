import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isProductionRuntime, lineSiteUrl } from "./security";

export type LineProfile = { subject: string; displayName: string; pictureUrl?: string; email?: string };

type MockPayload = LineProfile & { nonce: string; issuedAt: number };
type ProviderMode = "line" | "mock";

const LINE_ID_TOKEN_ISSUER = "https://access.line.me";
const PROVIDER_TIMEOUT_MS = 8_000;
const MAX_TOKEN_LENGTH = 32_768;

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("LINE Login provider configuration is incomplete.");
  return value;
}

function mockSecret() {
  const secret = process.env.LINE_MOCK_SIGNING_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("LINE Login mock configuration is invalid.");
  return secret;
}

function callbackUrl() {
  const value = requiredEnvironment("LINE_LOGIN_CALLBACK_URL");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash || url.search
    || url.pathname !== "/api/auth/line/callback") {
    throw new Error("LINE Login callback URL is invalid.");
  }
  if (isProductionRuntime() && (url.protocol !== "https:" || url.origin !== lineSiteUrl().origin)) {
    throw new Error("LINE Login production callback URL is invalid.");
  }
  return url.toString();
}

export function lineMode(): ProviderMode {
  const configured = process.env.LINE_LOGIN_MODE?.trim();
  if (configured && configured !== "line" && configured !== "mock") {
    throw new Error("LINE Login provider mode is invalid.");
  }

  const mode: ProviderMode = configured === "line" ? "line" : "mock";
  if (mode === "mock") {
    const site = lineSiteUrl();
    if (isProductionRuntime() || !["localhost", "127.0.0.1", "::1"].includes(site.hostname)) {
      throw new Error("LINE Login mock provider is unavailable.");
    }
    mockSecret();
    return mode;
  }

  requiredEnvironment("LINE_LOGIN_CHANNEL_ID");
  requiredEnvironment("LINE_LOGIN_CHANNEL_SECRET");
  callbackUrl();
  return mode;
}

export function createOAuthSecrets() {
  return { state: randomBytes(32).toString("base64url"), nonce: randomBytes(32).toString("base64url") };
}

export function createLineAuthorizationUrl(state: string, nonce: string) {
  const mode = lineMode();
  if (mode === "mock") {
    const url = new URL("/line/mock", lineSiteUrl());
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    return url.toString();
  }

  const url = new URL("https://access.line.me/oauth2/v2.1/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", requiredEnvironment("LINE_LOGIN_CHANNEL_ID"));
  url.searchParams.set("redirect_uri", callbackUrl());
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("nonce", nonce);
  return url.toString();
}

function cleanOptionalString(value: unknown, maximum: number) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error("LINE Login identity response is invalid.");
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maximum) throw new Error("LINE Login identity response is invalid.");
  return cleaned;
}

function validatedProfile(value: Record<string, unknown>): LineProfile {
  const subject = cleanOptionalString(value.sub ?? value.subject, 255);
  if (!subject || !/^U[A-Za-z0-9_-]{8,254}$/u.test(subject)) {
    throw new Error("LINE Login identity response is invalid.");
  }

  const displayName = cleanOptionalString(value.name ?? value.displayName, 100) ?? "LINE 使用者";
  const pictureUrl = cleanOptionalString(value.picture ?? value.pictureUrl, 2_048);
  if (pictureUrl) {
    const picture = new URL(pictureUrl);
    if (picture.protocol !== "https:") throw new Error("LINE Login identity response is invalid.");
  }
  const email = cleanOptionalString(value.email, 320);
  if (email && (!email.includes("@") || /[\u0000-\u001f\u007f]/u.test(email))) {
    throw new Error("LINE Login identity response is invalid.");
  }
  return { subject, displayName, pictureUrl, email };
}

export function signMockAuthorization(profile: LineProfile, nonce: string) {
  if (lineMode() !== "mock") throw new Error("LINE Login mock provider is unavailable.");
  const validated = validatedProfile({
    subject: profile.subject,
    displayName: profile.displayName,
    pictureUrl: profile.pictureUrl,
    email: profile.email,
  });
  const payload = Buffer.from(JSON.stringify({ ...validated, nonce, issuedAt: Date.now() } satisfies MockPayload)).toString("base64url");
  const signature = createHmac("sha256", mockSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyMockAuthorization(code: string, expectedNonce: string): LineProfile {
  if (lineMode() !== "mock") throw new Error("LINE Login mock provider is unavailable.");
  const [payload, supplied, extra] = code.split(".");
  if (!payload || !supplied || extra) throw new Error("LINE Login mock authorization failed.");

  const expected = createHmac("sha256", mockSecret()).update(payload).digest();
  const actual = Buffer.from(supplied, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("LINE Login mock authorization failed.");
  }

  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("LINE Login mock authorization failed.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("LINE Login mock authorization failed.");
  }

  const claims = value as Record<string, unknown>;
  const issuedAt = claims.issuedAt;
  const nonce = claims.nonce;
  const now = Date.now();
  if (typeof issuedAt !== "number" || !Number.isFinite(issuedAt) || issuedAt > now + 30_000 || now - issuedAt > 5 * 60_000
    || typeof nonce !== "string" || nonce.length !== expectedNonce.length
    || !timingSafeEqual(Buffer.from(nonce), Buffer.from(expectedNonce))) {
    throw new Error("LINE Login mock authorization failed.");
  }
  return validatedProfile(claims);
}

async function providerJson(response: Response) {
  if (!response.ok) throw new Error("LINE Login provider request failed.");
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error("LINE Login provider response is invalid.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("LINE Login provider response is invalid.");
  }
  return value as Record<string, unknown>;
}

export async function exchangeLineCode(code: string, expectedNonce: string): Promise<LineProfile> {
  if (!code || code.length > 8_192 || !expectedNonce || expectedNonce.length > 512) {
    throw new Error("LINE Login authorization response is invalid.");
  }
  if (lineMode() === "mock") return verifyMockAuthorization(code, expectedNonce);

  const channelId = requiredEnvironment("LINE_LOGIN_CHANNEL_ID");
  const tokenResponse = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl(),
      client_id: channelId,
      client_secret: requiredEnvironment("LINE_LOGIN_CHANNEL_SECRET"),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  const token = await providerJson(tokenResponse);
  if (typeof token.id_token !== "string" || !token.id_token || token.id_token.length > MAX_TOKEN_LENGTH) {
    throw new Error("LINE Login provider response is invalid.");
  }

  const verificationResponse = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: token.id_token, client_id: channelId, nonce: expectedNonce }),
    cache: "no-store",
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  const claims = await providerJson(verificationResponse);
  const nowSeconds = Math.floor(Date.now() / 1_000);
  if (claims.iss !== LINE_ID_TOKEN_ISSUER || claims.aud !== channelId
    || typeof claims.exp !== "number" || !Number.isInteger(claims.exp) || claims.exp <= nowSeconds
    || typeof claims.iat !== "number" || !Number.isInteger(claims.iat) || claims.iat > nowSeconds + 60
    || typeof claims.nonce !== "string" || claims.nonce.length !== expectedNonce.length
    || !timingSafeEqual(Buffer.from(claims.nonce), Buffer.from(expectedNonce))) {
    throw new Error("LINE Login ID token verification failed.");
  }
  return validatedProfile(claims);
}
