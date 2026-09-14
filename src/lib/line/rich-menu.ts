import "server-only";
import { randomUUID } from "node:crypto";

export const RICH_MENU_WIDTH = 2500;
export const RICH_MENU_HEIGHT = 1686;
export const RICH_MENU_IMAGE_MAX_BYTES = 1_000_000;

const richMenuIdPattern = /^richmenu-[A-Za-z0-9_-]{20,100}$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const acceptedImageTypes = new Set(["image/png", "image/jpeg"]);
const requestTimeoutMs = 10_000;

export const memberRichMenuItems = [
  { label: "社團首頁", path: "/dashboard" },
  { label: "活動報名", path: "/events" },
  { label: "生日祝福", path: "/birthdays" },
  { label: "我的資料", path: "/me" },
] as const;

export type MemberRichMenu = {
  size: { width: number; height: number };
  selected: boolean;
  name: string;
  chatBarText: string;
  areas: Array<{
    bounds: { x: number; y: number; width: number; height: number };
    action: { type: "uri"; label: string; uri: string };
  }>;
};

export type RichMenuImageValidation =
  | { ok: true; width: number; height: number }
  | { ok: false; reason: "invalid_type" | "empty" | "too_large" | "invalid_image" | "invalid_dimensions" };

export type RichMenuFailureCode =
  | "credentials_rejected"
  | "rate_limited"
  | "request_rejected"
  | "provider_unavailable"
  | "provider_timeout"
  | "provider_error";

export class RichMenuProviderError extends Error {
  readonly code: RichMenuFailureCode;

  constructor(code: RichMenuFailureCode) {
    super(code);
    this.name = "RichMenuProviderError";
    this.code = code;
  }
}

function isLocalSite(siteUrl: string) {
  try {
    return ["localhost", "127.0.0.1"].includes(new URL(siteUrl).hostname);
  } catch {
    return false;
  }
}

function trustedSite(siteUrl: string) {
  let url: URL;
  try {
    url = new URL(siteUrl);
  } catch {
    throw new Error("invalid_site_url");
  }
  if (url.username || url.password || url.hash || (url.protocol !== "https:" && !isLocalSite(siteUrl))) {
    throw new Error("invalid_site_url");
  }
  return url;
}

function memberUri(siteUrl: string, path: string, clubId: string) {
  const url = new URL(path, trustedSite(siteUrl));
  if (url.origin !== trustedSite(siteUrl).origin) throw new Error("invalid_site_url");
  url.searchParams.set("clubId", clubId);
  url.searchParams.set("mode", "member");
  return url.toString();
}

function menuName(clubId: string) {
  return `Rotary ${clubId.slice(0, 8)} 社員選單`;
}

/**
 * Builds the only menu shape this app publishes. Every action is a same-origin
 * member route carrying the selected club id; callers cannot inject arbitrary
 * URLs, management paths, postbacks, or message content.
 */
export function buildMemberRichMenu(input: { clubId: unknown; siteUrl: unknown }): MemberRichMenu {
  const clubId = typeof input.clubId === "string" ? input.clubId.trim() : "";
  const siteUrl = typeof input.siteUrl === "string" ? input.siteUrl.trim() : "";
  if (!uuidPattern.test(clubId) || !siteUrl) throw new Error("invalid_rich_menu_input");

  const cellWidth = RICH_MENU_WIDTH / 2;
  const cellHeight = RICH_MENU_HEIGHT / 2;
  return {
    size: { width: RICH_MENU_WIDTH, height: RICH_MENU_HEIGHT },
    selected: false,
    name: menuName(clubId),
    chatBarText: "開啟社團功能",
    areas: memberRichMenuItems.map((item, index) => ({
      bounds: {
        x: index % 2 === 0 ? 0 : cellWidth,
        y: index < 2 ? 0 : cellHeight,
        width: cellWidth,
        height: cellHeight,
      },
      action: {
        type: "uri" as const,
        label: item.label,
        uri: memberUri(siteUrl, item.path, clubId),
      },
    })),
  };
}

function readPngDimensions(bytes: Uint8Array) {
  if (bytes.length < 24
    || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47
    || bytes[4] !== 0x0d || bytes[5] !== 0x0a || bytes[6] !== 0x1a || bytes[7] !== 0x0a
    || bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function readJpegDimensions(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset++];
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) return null;
    if (offset + 2 > bytes.length) return null;
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 7) return null;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
    }
    offset += segmentLength;
  }
  return null;
}

function imageDimensions(bytes: Uint8Array, contentType: string) {
  return contentType === "image/png" ? readPngDimensions(bytes) : readJpegDimensions(bytes);
}

export function validateRichMenuImage(
  input: ArrayBuffer | Uint8Array,
  contentType: string,
): RichMenuImageValidation {
  if (!acceptedImageTypes.has(contentType)) return { ok: false, reason: "invalid_type" };
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength === 0) return { ok: false, reason: "empty" };
  if (bytes.byteLength > RICH_MENU_IMAGE_MAX_BYTES) return { ok: false, reason: "too_large" };
  const dimensions = imageDimensions(bytes, contentType);
  if (!dimensions) return { ok: false, reason: "invalid_image" };
  if (dimensions.width !== RICH_MENU_WIDTH || dimensions.height !== RICH_MENU_HEIGHT) {
    return { ok: false, reason: "invalid_dimensions" };
  }
  return { ok: true, ...dimensions };
}

function failureCodeForStatus(status: number): RichMenuFailureCode {
  if (status === 401 || status === 403) return "credentials_rejected";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "request_rejected";
}

function assertProviderToken(token: string | undefined, siteUrl: string) {
  if (!token?.trim()) throw new RichMenuProviderError("credentials_rejected");
  if (isLocalSite(siteUrl)) throw new RichMenuProviderError("request_rejected");
  return token.trim();
}

async function requestProvider(
  url: string,
  token: string,
  init: RequestInit = {},
  acceptedStatuses: readonly number[] = [],
) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
    throw new RichMenuProviderError(timedOut ? "provider_timeout" : "provider_unavailable");
  }
  if (!response.ok && !acceptedStatuses.includes(response.status)) {
    throw new RichMenuProviderError(failureCodeForStatus(response.status));
  }
  return response;
}

function providerId(value: unknown) {
  if (typeof value !== "object" || value === null || !("richMenuId" in value)) return null;
  const id = (value as { richMenuId?: unknown }).richMenuId;
  return typeof id === "string" && richMenuIdPattern.test(id) ? id : null;
}

async function createRichMenu(token: string, menu: MemberRichMenu) {
  const response = await requestProvider("https://api.line.me/v2/bot/richmenu", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(menu),
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new RichMenuProviderError("provider_error");
  }
  const id = providerId(body);
  if (!id) throw new RichMenuProviderError("provider_error");
  return id;
}

async function uploadRichMenuImage(token: string, richMenuId: string, bytes: Uint8Array, contentType: string) {
  const imageBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(imageBuffer).set(bytes);
  await requestProvider(`https://api-data.line.me/v2/bot/richmenu/${encodeURIComponent(richMenuId)}/content`, token, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: new Blob([imageBuffer], { type: contentType }),
  });
}

export async function setDefaultRichMenu(accessToken: string, richMenuId: string, siteUrl: string) {
  const token = assertProviderToken(accessToken, siteUrl);
  if (!richMenuIdPattern.test(richMenuId)) throw new RichMenuProviderError("request_rejected");
  await requestProvider(
    `https://api.line.me/v2/bot/user/all/richmenu/${encodeURIComponent(richMenuId)}`,
    token,
    { method: "POST" },
  );
}

async function readDefaultRichMenuId(token: string) {
  const response = await requestProvider(
    "https://api.line.me/v2/bot/user/all/richmenu",
    token,
    { method: "GET" },
    [403, 404],
  );
  if (response.status === 403 || response.status === 404) return null;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new RichMenuProviderError("provider_error");
  }
  const id = providerId(body);
  if (!id) throw new RichMenuProviderError("provider_error");
  return id;
}

export async function clearDefaultRichMenu(
  accessToken: string,
  siteUrl: string,
  expectedRichMenuId: string,
) {
  const token = assertProviderToken(accessToken, siteUrl);
  if (!richMenuIdPattern.test(expectedRichMenuId)) throw new RichMenuProviderError("request_rejected");
  const currentRichMenuId = await readDefaultRichMenuId(token);
  if (currentRichMenuId !== expectedRichMenuId) return { cleared: false as const };
  await requestProvider("https://api.line.me/v2/bot/user/all/richmenu", token, { method: "DELETE" });
  return { cleared: true as const };
}

export async function publishMemberRichMenu(input: {
  mode: "mock" | "line";
  siteUrl: string;
  accessToken?: string;
  menu: MemberRichMenu;
  image: ArrayBuffer | Uint8Array;
  contentType: string;
}) {
  const bytes = input.image instanceof Uint8Array ? input.image : new Uint8Array(input.image);
  if (input.mode === "mock") {
    if (!isLocalSite(input.siteUrl)) throw new RichMenuProviderError("request_rejected");
    return { richMenuId: `richmenu-${randomUUID().replaceAll("-", "")}`, provider: "mock" as const };
  }

  const token = assertProviderToken(input.accessToken, input.siteUrl);
  const richMenuId = await createRichMenu(token, input.menu);
  try {
    await uploadRichMenuImage(token, richMenuId, bytes, input.contentType);
    await setDefaultRichMenu(token, richMenuId, input.siteUrl);
  } catch (error) {
    // LINE does not provide a transaction across create/upload/default. The new
    // menu is not made visible until the final request, and keeping it unused is
    // safer than deleting an object we cannot prove belongs to this app.
    throw error;
  }
  return { richMenuId, provider: "line" as const };
}

export function isRichMenuId(value: unknown): value is string {
  return typeof value === "string" && richMenuIdPattern.test(value);
}
