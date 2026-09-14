"use server";

import { redirect } from "next/navigation";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createTrustedAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { readServerSecret } from "@/lib/line/oa-runtime";
import {
  buildMemberRichMenu,
  clearDefaultRichMenu,
  isRichMenuId,
  publishMemberRichMenu,
  RichMenuProviderError,
  validateRichMenuImage,
} from "@/lib/line/rich-menu";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type RichMenuAccount = {
  id: string;
  rich_menu_id: string | null;
  access_token_env_key: string;
  account_status: string;
};

function pagePath(clubId: string) {
  return `/clubs/${encodeURIComponent(clubId)}/line-oa?mode=management`;
}

function fail(clubId: string, code: string): never {
  if (!uuidPattern.test(clubId)) redirect("/dashboard?error=unexpected");
  redirect(`${pagePath(clubId)}&error=${encodeURIComponent(code)}`);
}

function hasManagePermission(value: unknown) {
  return Array.isArray(value) && value.some((item) => (
    typeof item === "object" && item !== null
    && "permission_key" in item
    && item.permission_key === "oa.manage"
  ));
}

function readAccount(value: unknown): RichMenuAccount | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const richMenuId = record.rich_menu_id === null || record.rich_menu_id === undefined
    ? null
    : typeof record.rich_menu_id === "string" && isRichMenuId(record.rich_menu_id.trim())
      ? record.rich_menu_id.trim()
      : null;
  const accessTokenEnvironmentKey = typeof record.access_token_env_key === "string"
    ? record.access_token_env_key.trim()
    : "";
  const accountStatus = typeof record.account_status === "string" ? record.account_status : "";
  if (!uuidPattern.test(id) || !accessTokenEnvironmentKey || accountStatus === "disabled") return null;
  return {
    id,
    rich_menu_id: richMenuId,
    access_token_env_key: accessTokenEnvironmentKey,
    account_status: accountStatus,
  };
}

async function authorizedAccount(clubId: string) {
  const supabase = await createClient();
  let permissions;
  try {
    permissions = await supabase.rpc("list_my_permissions", { p_club_id: clubId });
  } catch {
    fail(clubId, "rich_menu_unexpected");
  }
  if (permissions.error || !hasManagePermission(permissions.data)) fail(clubId, "rich_menu_forbidden");

  let admin;
  try {
    admin = createTrustedAdminClient();
  } catch {
    fail(clubId, "rich_menu_unexpected");
  }
  let result;
  try {
    result = await admin
      .from("line_oa_accounts")
      .select("id,rich_menu_id,access_token_env_key,account_status")
      .eq("club_id", clubId)
      .neq("account_status", "disabled")
      .maybeSingle();
  } catch {
    fail(clubId, "rich_menu_unexpected");
  }
  const account = readAccount(result.data);
  if (result.error || !account) fail(clubId, "rich_menu_oa_not_configured");
  return { supabase, account };
}

function providerFailureCode(error: unknown) {
  return error instanceof RichMenuProviderError
    ? `rich_menu_${error.code}`
    : "rich_menu_provider_error";
}

function readSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

function readMode() {
  const mode = process.env.LINE_OA_MODE ?? "mock";
  return mode === "line" || mode === "mock" ? mode : null;
}

function readAccessToken(account: RichMenuAccount, mode: "line" | "mock", clubId: string) {
  if (mode === "mock") return undefined;
  try {
    return readServerSecret(account.access_token_env_key, "LINE OA access token");
  } catch {
    fail(clubId, "rich_menu_oa_not_configured");
  }
}

export async function publishLineRichMenuAction(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "").trim();
  if (!uuidPattern.test(clubId)) fail(clubId, "rich_menu_unexpected");

  const { supabase, account } = await authorizedAccount(clubId);
  const flag = await evaluateCurrentFeatureFlag({ key: "line_rich_menu_v1", subjectUuid: clubId });
  if (!flag.enabled) fail(clubId, "rich_menu_disabled");

  const file = formData.get("image");
  if (!(file instanceof File)) fail(clubId, "rich_menu_image_invalid");
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    fail(clubId, "rich_menu_image_invalid");
  }
  const image = validateRichMenuImage(bytes, file.type);
  if (!image.ok) fail(clubId, "rich_menu_image_invalid");

  const siteUrl = readSiteUrl();
  let menu;
  try {
    menu = buildMemberRichMenu({ clubId, siteUrl });
  } catch {
    fail(clubId, "rich_menu_invalid_site");
  }
  const mode = readMode();
  if (!mode) fail(clubId, "rich_menu_unexpected");
  const accessToken = readAccessToken(account, mode, clubId);

  let published;
  try {
    published = await publishMemberRichMenu({
      mode,
      siteUrl,
      accessToken,
      menu,
      image: bytes,
      contentType: file.type,
    });
  } catch (error) {
    fail(clubId, providerFailureCode(error));
  }

  const saved = await supabase.rpc("set_line_oa_rich_menu", {
    p_club_id: clubId,
    p_rich_menu_id: published.richMenuId,
  });
  if (saved.error) fail(clubId, "rich_menu_persist_failed");
  redirect(`${pagePath(clubId)}&success=rich_menu_published`);
}

export async function disableLineRichMenuAction(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "").trim();
  if (!uuidPattern.test(clubId)) fail(clubId, "rich_menu_unexpected");
  const { supabase, account } = await authorizedAccount(clubId);
  const flag = await evaluateCurrentFeatureFlag({ key: "line_rich_menu_v1", subjectUuid: clubId });
  if (!flag.enabled) fail(clubId, "rich_menu_disabled");
  const mode = readMode();
  if (!mode) fail(clubId, "rich_menu_unexpected");
  const accessToken = readAccessToken(account, mode, clubId);

  if (account.rich_menu_id && mode === "line") {
    try {
      await clearDefaultRichMenu(accessToken ?? "", readSiteUrl(), account.rich_menu_id);
    } catch (error) {
      fail(clubId, providerFailureCode(error));
    }
  }

  const cleared = await supabase.rpc("set_line_oa_rich_menu", {
    p_club_id: clubId,
    p_rich_menu_id: null,
  });
  if (cleared.error) fail(clubId, "rich_menu_persist_failed");
  redirect(`${pagePath(clubId)}&success=rich_menu_disabled`);
}
