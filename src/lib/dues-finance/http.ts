import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSameOriginBlessingMutation } from "@/lib/blessing-iou/validation";
import { DUES_FINANCE_REQUEST_MAX_BYTES } from "./validation";

const noStoreHeaders = { "Cache-Control": "no-store" };

export function duesFinanceFailure(status = 400) {
  return NextResponse.json({ error: "request_failed" }, { status, headers: noStoreHeaders });
}

export function duesFinanceSuccess(data: unknown, status = 200) {
  return NextResponse.json({ data }, { status, headers: noStoreHeaders });
}

export function duesFinanceMutationAllowed(request: NextRequest) {
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
    && (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > DUES_FINANCE_REQUEST_MAX_BYTES)) {
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
      if (totalBytes > DUES_FINANCE_REQUEST_MAX_BYTES) {
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

export async function readDuesFinanceJson(request: NextRequest): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new Error("invalid_content_type");
  }
  try {
    return JSON.parse(await readBoundedText(request));
  } catch {
    throw new Error("invalid_json");
  }
}

export async function authenticatedDuesFinanceClient() {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  return { client, user: error ? null : data.user };
}

export function duesFinanceRpcFailure(error: { code?: string | null } | null) {
  if (error?.code === "22023") return duesFinanceFailure(400);
  if (error?.code === "P0002") return duesFinanceFailure(404);
  if (error?.code === "42501") return duesFinanceFailure(403);
  if (error?.code === "55000" || error?.code === "23505") return duesFinanceFailure(409);
  return duesFinanceFailure(500);
}
