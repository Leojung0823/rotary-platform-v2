import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  BOARD_REQUEST_MAX_BYTES,
  isJsonContentType,
  isSameOriginMutation,
} from "@/lib/message-board/validation";

const noStoreHeaders = { "Cache-Control": "no-store" };

export function boardFailure(status = 400) {
  return NextResponse.json({ error: "request_failed" }, { status, headers: noStoreHeaders });
}

export function boardSuccess(data: unknown, status = 200) {
  return NextResponse.json({ data }, { status, headers: noStoreHeaders });
}

export async function authenticatedBoardClient() {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  return { client, user: error ? null : data.user };
}

export function mutationAllowed(request: NextRequest) {
  return isSameOriginMutation({
    requestOrigin: request.nextUrl.origin,
    origin: request.headers.get("origin"),
    fetchSite: request.headers.get("sec-fetch-site"),
    configuredSiteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  });
}

async function readBoundedBoardText(request: NextRequest) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > BOARD_REQUEST_MAX_BYTES)) {
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
      if (totalBytes > BOARD_REQUEST_MAX_BYTES) {
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

export async function readBoardJson(request: NextRequest): Promise<unknown> {
  if (!isJsonContentType(request.headers.get("content-type"))) throw new Error("invalid_content_type");
  const text = await readBoundedBoardText(request);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("invalid_json");
  }
}

export async function deleteHasNoBody(request: NextRequest) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && declaredLength !== "0") return false;
  return (await readBoundedBoardText(request)).length === 0;
}

export function boardRpcFailure(error: { code?: string | null } | null) {
  if (error?.code === "22023") return boardFailure(400);
  if (error?.code === "P0002") return boardFailure(404);
  if (error?.code === "42501") return boardFailure(403);
  return boardFailure(500);
}
