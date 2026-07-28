import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type LineProfile = { subject: string; displayName: string; pictureUrl?: string; email?: string };

type MockPayload = LineProfile & { nonce: string; issuedAt: number };

function baseUrl() { return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"; }
function mockSecret() { return process.env.LINE_MOCK_SIGNING_SECRET ?? ""; }

export function lineMode() {
  const mode = process.env.LINE_LOGIN_MODE ?? "mock";
  if (mode === "mock" && !["localhost", "127.0.0.1"].includes(new URL(baseUrl()).hostname)) {
    throw new Error("LINE mock provider is restricted to localhost.");
  }
  return mode === "line" ? "line" : "mock";
}

export function createOAuthSecrets() {
  return { state: randomBytes(32).toString("hex"), nonce: randomBytes(32).toString("hex") };
}

export function createLineAuthorizationUrl(state: string, nonce: string) {
  const callback = `${baseUrl()}/api/auth/line/callback`;
  if (lineMode() === "mock") {
    const url = new URL("/line/mock", baseUrl());
    url.searchParams.set("state", state); url.searchParams.set("nonce", nonce);
    return url.toString();
  }
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!channelId) throw new Error("LINE Login channel ID is missing.");
  const url = new URL("https://access.line.me/oauth2/v2.1/authorize");
  url.searchParams.set("response_type", "code"); url.searchParams.set("client_id", channelId);
  url.searchParams.set("redirect_uri", callback); url.searchParams.set("state", state);
  url.searchParams.set("scope", "openid profile email"); url.searchParams.set("nonce", nonce);
  return url.toString();
}

export function signMockAuthorization(profile: LineProfile, nonce: string) {
  const secret = mockSecret(); if (!secret) throw new Error("Mock signing secret is missing.");
  const payload = Buffer.from(JSON.stringify({ ...profile, nonce, issuedAt: Date.now() } satisfies MockPayload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyMockAuthorization(code: string, expectedNonce: string): LineProfile {
  const [payload, supplied] = code.split("."); const secret = mockSecret();
  if (!payload || !supplied || !secret) throw new Error("Invalid mock authorization code.");
  const expected = createHmac("sha256", secret).update(payload).digest();
  const actual = Buffer.from(supplied, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Invalid mock authorization signature.");
  const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as MockPayload;
  if (value.nonce !== expectedNonce || Date.now() - value.issuedAt > 5 * 60_000) throw new Error("Expired mock authorization code.");
  return { subject: value.subject, displayName: value.displayName, pictureUrl: value.pictureUrl, email: value.email };
}

export async function exchangeLineCode(code: string, expectedNonce: string): Promise<LineProfile> {
  if (lineMode() === "mock") return verifyMockAuthorization(code, expectedNonce);
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID; const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  if (!channelId || !channelSecret) throw new Error("LINE Login credentials are missing.");
  const tokenResponse = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code,
      redirect_uri: `${baseUrl()}/api/auth/line/callback`, client_id: channelId, client_secret: channelSecret }),
    cache: "no-store",
  });
  if (!tokenResponse.ok) throw new Error("LINE token exchange failed.");
  const token = await tokenResponse.json() as { id_token?: string };
  if (!token.id_token) throw new Error("LINE ID token is missing.");
  const verification = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: token.id_token, client_id: channelId, nonce: expectedNonce }),
    cache: "no-store",
  });
  if (!verification.ok) throw new Error("LINE ID token verification failed.");
  const profile = await verification.json() as { sub?: string; name?: string; picture?: string; email?: string; nonce?: string };
  if (!profile.sub || profile.nonce !== expectedNonce) throw new Error("LINE identity response is invalid.");
  return { subject: profile.sub, displayName: profile.name ?? "LINE 使用者", pictureUrl: profile.picture, email: profile.email };
}
