import { NextResponse, type NextRequest } from "next/server";
import { hasEmptyBody, isSameOriginMutation, readBoundedJson } from "@/lib/api/json-request";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createClient } from "@/lib/supabase/server";
import { JOY_REQUEST_MAX_BYTES } from "./validation";

const noStoreHeaders = { "Cache-Control": "no-store" };
export function joyFailure(status = 400) {
  return NextResponse.json({ error: status === 429 ? "rate_limited" : "request_failed" }, { status, headers: noStoreHeaders });
}
export function joySuccess(data: unknown, status = 200) {
  return NextResponse.json({ data }, { status, headers: noStoreHeaders });
}
export async function authenticatedJoyClient() {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  const user = error ? null : data.user;
  const evaluation = user
    ? await evaluateCurrentFeatureFlag({ key: "joy_wall_v1", subjectUuid: user.id })
    : null;
  return { client, user, featureEnabled: evaluation?.enabled ?? false };
}
export function joyMutationAllowed(request: NextRequest) {
  return isSameOriginMutation({
    requestOrigin: request.nextUrl.origin,
    origin: request.headers.get("origin"),
    fetchSite: request.headers.get("sec-fetch-site"),
    configuredSiteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  });
}
export async function readJoyJson(request: NextRequest) {
  return readBoundedJson(request, JOY_REQUEST_MAX_BYTES);
}
export async function joyDeleteHasNoBody(request: NextRequest) {
  return hasEmptyBody(request, JOY_REQUEST_MAX_BYTES);
}
export function joyRpcFailure(error: { code?: string | null } | null) {
  if (error?.code === "22023") return joyFailure(400);
  if (error?.code === "54000") return joyFailure(429);
  if (error?.code === "P0002") return joyFailure(404);
  if (error?.code === "42501") return joyFailure(403);
  return joyFailure(500);
}
