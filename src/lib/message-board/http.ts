import { NextResponse, type NextRequest } from "next/server";
import { hasEmptyBody, isSameOriginMutation, readBoundedJson } from "@/lib/api/json-request";
import { createClient } from "@/lib/supabase/server";
import { BOARD_REQUEST_MAX_BYTES } from "@/lib/message-board/validation";

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

export async function readBoardJson(request: NextRequest): Promise<unknown> {
  return readBoundedJson(request, BOARD_REQUEST_MAX_BYTES);
}

export async function deleteHasNoBody(request: NextRequest) {
  return hasEmptyBody(request, BOARD_REQUEST_MAX_BYTES);
}

export function boardRpcFailure(error: { code?: string | null } | null) {
  if (error?.code === "22023") return boardFailure(400);
  if (error?.code === "P0002") return boardFailure(404);
  if (error?.code === "42501") return boardFailure(403);
  return boardFailure(500);
}
