import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  BLESSING_IOU_REQUEST_MAX_BYTES,
  isBlessingJsonContentType,
  isSameOriginBlessingMutation,
} from "./validation";

const noStoreHeaders = { "Cache-Control": "no-store" };

export function blessingIouFailure(status = 400) {
  return NextResponse.json({ error: "request_failed" }, { status, headers: noStoreHeaders });
}

export function blessingIouSuccess(data: unknown, status = 200) {
  return NextResponse.json({ data }, { status, headers: noStoreHeaders });
}

export async function authenticatedBlessingIouClient() {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  return { client, user: error ? null : data.user };
}

export function blessingIouMutationAllowed(request: NextRequest) {
  return isSameOriginBlessingMutation({
    requestOrigin: request.nextUrl.origin,
    origin: request.headers.get("origin"),
    fetchSite: request.headers.get("sec-fetch-site"),
    configuredSiteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  });
}

async function readBoundedText(request: NextRequest) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength
    && (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > BLESSING_IOU_REQUEST_MAX_BYTES)) {
    throw new Error("request_too_large");
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > BLESSING_IOU_REQUEST_MAX_BYTES) {
        await reader.cancel("request_too_large").catch(() => undefined);
        throw new Error("request_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("invalid_encoding");
  }
}

export async function readBlessingIouJson(request: NextRequest): Promise<unknown> {
  if (!isBlessingJsonContentType(request.headers.get("content-type"))) {
    throw new Error("invalid_content_type");
  }
  const text = await readBoundedText(request);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("invalid_json");
  }
}

export function blessingIouRpcFailure(error: { code?: string | null } | null) {
  if (error?.code === "22023") return blessingIouFailure(400);
  if (error?.code === "P0002") return blessingIouFailure(404);
  if (error?.code === "42501") return blessingIouFailure(403);
  if (error?.code === "55000") return blessingIouFailure(409);
  return blessingIouFailure(500);
}
