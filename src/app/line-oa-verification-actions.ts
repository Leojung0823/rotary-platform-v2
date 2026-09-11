"use server";

import { redirect } from "next/navigation";
import { readServerSecret } from "@/lib/line/oa-runtime";
import { createTrustedAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const lineBotInfoUrl = "https://api.line.me/v2/bot/info";
const lineBotInfoTimeoutMs = 10_000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const lineBotUserIdPattern = /^U[A-Za-z0-9_-]{8,128}$/u;

type LineBotInfo = {
  basicId: string;
  userId: string;
};

type OaVerificationAccount = {
  id: string;
  basicId: string;
  accessTokenEnvironmentKey: string;
};

function pagePath(clubId: string) {
  return `/clubs/${encodeURIComponent(clubId)}/line-oa`;
}

function errorPath(clubId: string, code: string) {
  if (!uuidPattern.test(clubId)) return "/dashboard?error=unexpected";
  return `${pagePath(clubId)}?error=${encodeURIComponent(code)}`;
}

function fail(clubId: string, code: string): never {
  redirect(errorPath(clubId, code));
}

function hasManagePermission(data: unknown) {
  return Array.isArray(data) && data.some((item) => (
    typeof item === "object" && item !== null &&
    "permission_key" in item && item.permission_key === "oa.manage"
  ));
}

function readVerificationAccount(data: unknown): OaVerificationAccount | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const basicId = typeof record.basic_id === "string" ? record.basic_id.trim() : "";
  const accessTokenEnvironmentKey = typeof record.access_token_env_key === "string"
    ? record.access_token_env_key.trim()
    : "";
  const accountStatus = typeof record.account_status === "string"
    ? record.account_status
    : "";

  if (
    !uuidPattern.test(id) ||
    accountStatus !== "active" ||
    basicId.length === 0 ||
    basicId.length > 100 ||
    accessTokenEnvironmentKey.length === 0
  ) {
    return null;
  }

  return { id, basicId, accessTokenEnvironmentKey };
}

function parseLineBotInfo(value: unknown): LineBotInfo | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const basicId = typeof record.basicId === "string" ? record.basicId.trim() : "";
  const userId = typeof record.userId === "string" ? record.userId.trim() : "";
  if (!basicId || basicId.length > 100 || !lineBotUserIdPattern.test(userId)) return null;
  return { basicId, userId };
}

function lineBotInfoFailureCode(status: number) {
  if (status === 401 || status === 403) return "credentials_rejected";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "request_rejected";
}

function isTimeout(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

export async function verifyLineOaAction(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "").trim();
  if (!uuidPattern.test(clubId)) fail(clubId, "unexpected");

  const supabase = await createClient();
  let permissions;
  try {
    permissions = await supabase.rpc("list_my_permissions", { p_club_id: clubId });
  } catch {
    fail(clubId, "unexpected");
  }
  if (permissions.error || !hasManagePermission(permissions.data)) {
    fail(clubId, "forbidden");
  }

  // A local mock must never be mistaken for a real identity verification.
  // Only the hosted LINE mode is allowed to read a real channel access token.
  if (process.env.LINE_OA_MODE !== "line") fail(clubId, "oa_live_mode_required");

  let admin;
  try {
    admin = createTrustedAdminClient();
  } catch {
    fail(clubId, "oa_verification_failed");
  }

  let accountResult;
  try {
    accountResult = await admin
      .from("line_oa_accounts")
      .select("id,basic_id,access_token_env_key,account_status")
      .eq("club_id", clubId)
      .eq("account_status", "active")
      .maybeSingle();
  } catch {
    fail(clubId, "oa_verification_failed");
  }
  const account = readVerificationAccount(accountResult.data);
  if (accountResult.error || !account) fail(clubId, "oa_not_configured");

  let accessToken: string;
  try {
    accessToken = readServerSecret(
      account.accessTokenEnvironmentKey,
      "LINE OA access token",
    );
  } catch {
    fail(clubId, "oa_not_configured");
  }

  let response: Response;
  try {
    response = await fetch(lineBotInfoUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(lineBotInfoTimeoutMs),
    });
  } catch (error) {
    fail(clubId, isTimeout(error) ? "provider_timeout" : "provider_unavailable");
  }

  if (!response.ok) fail(clubId, lineBotInfoFailureCode(response.status));

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    fail(clubId, "oa_verification_failed");
  }
  const botInfo = parseLineBotInfo(body);
  if (!botInfo) fail(clubId, "oa_verification_failed");
  if (botInfo.basicId !== account.basicId) fail(clubId, "oa_identity_mismatch");

  let verificationResult;
  try {
    verificationResult = await admin.rpc("record_line_oa_account_identity_verification", {
      p_line_oa_account_id: account.id,
      p_basic_id: botInfo.basicId,
      p_bot_user_id: botInfo.userId,
    });
  } catch {
    fail(clubId, "oa_verification_failed");
  }
  if (verificationResult.error || verificationResult.data !== true) {
    fail(clubId, "oa_verification_failed");
  }

  redirect(`${pagePath(clubId)}?success=verified`);
}
