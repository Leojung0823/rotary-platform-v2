"use server";

import { redirect } from "next/navigation";
import { archiveCategories, type ArchiveCategory } from "@/lib/archive/contracts";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const categorySet = new Set<string>(archiveCategories);

function uuid(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim().toLowerCase();
  if (!uuidPattern.test(value)) throw new Error("invalid_input");
  return value;
}

function optionalUuid(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim().toLowerCase();
  if (!value) return null;
  if (!uuidPattern.test(value)) throw new Error("invalid_input");
  return value;
}

function bounded(formData: FormData, name: string, maximum: number, required = false) {
  const value = String(formData.get(name) ?? "").trim();
  if ((required && !value) || value.length > maximum) throw new Error("invalid_input");
  return value;
}

function category(formData: FormData): ArchiveCategory {
  const value = String(formData.get("category") ?? "");
  if (!categorySet.has(value)) throw new Error("invalid_input");
  return value as ArchiveCategory;
}

function returnPath(clubId: string, yearId?: string | null) {
  const query = new URLSearchParams({ mode: "management" });
  if (yearId) query.set("yearId", yearId);
  return `/clubs/${encodeURIComponent(clubId)}/archives?${query.toString()}`;
}

function invalidInputPath(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "").trim().toLowerCase();
  return uuidPattern.test(clubId)
    ? `${returnPath(clubId)}&error=invalid_input`
    : "/dashboard?mode=management&error=invalid_input";
}

function redirectResult(clubId: string, yearId: string | null, kind: "success" | "error", code: string): never {
  const path = new URL(returnPath(clubId, yearId), "http://local");
  path.searchParams.set(kind, code);
  redirect(`${path.pathname}${path.search}`);
}

function rpcError(message: string) {
  if (message.includes("already_exists") || message.includes("23505")) return "already_exists";
  if (message.includes("checklist_incomplete")) return "checklist_incomplete";
  if (message.includes("required") || message.includes("42501")) return "forbidden";
  return "unexpected";
}

export async function createRotaryYearAction(formData: FormData) {
  let clubId: string;
  let startYear: number;
  let theme: string;
  let presidentName: string;
  let secretaryName: string;
  try {
    clubId = uuid(formData, "clubId");
    startYear = Number(String(formData.get("startYear") ?? ""));
    if (!Number.isInteger(startYear) || startYear < 2000 || startYear > 2200) throw new Error("invalid_input");
    theme = bounded(formData, "theme", 160);
    presidentName = bounded(formData, "presidentName", 160);
    secretaryName = bounded(formData, "secretaryName", 160);
  } catch {
    redirect(invalidInputPath(formData));
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_rotary_year", {
    p_club_id: clubId,
    p_start_year: startYear,
    p_theme: theme,
    p_president_name: presidentName,
    p_secretary_name: secretaryName,
  });
  if (error || typeof data !== "string") redirectResult(clubId, null, "error", rpcError(error?.message ?? ""));
  redirectResult(clubId, data, "success", "year_created");
}

export async function updateRotaryYearAction(formData: FormData) {
  let clubId: string;
  let yearId: string;
  let theme: string;
  let presidentName: string;
  let secretaryName: string;
  try {
    clubId = uuid(formData, "clubId");
    yearId = uuid(formData, "yearId");
    theme = bounded(formData, "theme", 160);
    presidentName = bounded(formData, "presidentName", 160);
    secretaryName = bounded(formData, "secretaryName", 160);
  } catch {
    redirect(invalidInputPath(formData));
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_rotary_year", {
    p_club_id: clubId,
    p_rotary_year_id: yearId,
    p_theme: theme,
    p_president_name: presidentName,
    p_secretary_name: secretaryName,
  });
  if (error) redirectResult(clubId, yearId, "error", rpcError(error.message));
  redirectResult(clubId, yearId, "success", "year_updated");
}

export async function createArchiveItemAction(formData: FormData) {
  let clubId: string;
  let yearId: string;
  let itemCategory: ArchiveCategory;
  let title: string;
  let description: string;
  let folderPath: string;
  let tags: string[];
  let confidentiality: "club_internal" | "officers_only";
  try {
    clubId = uuid(formData, "clubId");
    yearId = uuid(formData, "yearId");
    itemCategory = category(formData);
    title = bounded(formData, "title", 180, true);
    description = bounded(formData, "description", 2000);
    folderPath = bounded(formData, "folderPath", 240, true);
    tags = bounded(formData, "tags", 500).split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 10);
    const rawConfidentiality = String(formData.get("confidentiality") ?? "club_internal");
    if (rawConfidentiality !== "club_internal" && rawConfidentiality !== "officers_only") throw new Error("invalid_input");
    confidentiality = rawConfidentiality;
  } catch {
    redirect(invalidInputPath(formData));
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_archive_item", {
    p_club_id: clubId,
    p_rotary_year_id: yearId,
    p_category: itemCategory,
    p_title: title,
    p_description: description,
    p_folder_path: folderPath,
    p_tags: tags,
    p_confidentiality: confidentiality,
  });
  if (error) redirectResult(clubId, yearId, "error", rpcError(error.message));
  redirectResult(clubId, yearId, "success", "item_created");
}

export async function updateArchiveItemAction(formData: FormData) {
  let clubId: string;
  let yearId: string;
  let itemId: string;
  let itemCategory: ArchiveCategory;
  let title: string;
  let description: string;
  let folderPath: string;
  let tags: string[];
  let confidentiality: "club_internal" | "officers_only";
  try {
    clubId = uuid(formData, "clubId");
    yearId = uuid(formData, "yearId");
    itemId = uuid(formData, "itemId");
    itemCategory = category(formData);
    title = bounded(formData, "title", 180, true);
    description = bounded(formData, "description", 2000);
    folderPath = bounded(formData, "folderPath", 240, true);
    tags = bounded(formData, "tags", 500).split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 10);
    const rawConfidentiality = String(formData.get("confidentiality") ?? "club_internal");
    if (rawConfidentiality !== "club_internal" && rawConfidentiality !== "officers_only") throw new Error("invalid_input");
    confidentiality = rawConfidentiality;
  } catch {
    redirect(invalidInputPath(formData));
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_archive_item", {
    p_club_id: clubId,
    p_archive_item_id: itemId,
    p_category: itemCategory,
    p_title: title,
    p_description: description,
    p_folder_path: folderPath,
    p_tags: tags,
    p_confidentiality: confidentiality,
  });
  if (error) redirectResult(clubId, yearId, "error", rpcError(error.message));
  redirectResult(clubId, yearId, "success", "item_updated");
}

export async function archiveArchiveItemAction(formData: FormData) {
  let clubId: string;
  let yearId: string;
  let itemId: string;
  try {
    clubId = uuid(formData, "clubId");
    yearId = uuid(formData, "yearId");
    itemId = uuid(formData, "itemId");
  } catch {
    redirect(invalidInputPath(formData));
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_archive_item", { p_club_id: clubId, p_archive_item_id: itemId });
  if (error) redirectResult(clubId, yearId, "error", rpcError(error.message));
  redirectResult(clubId, yearId, "success", "item_archived");
}

export async function updateHandoverChecklistAction(formData: FormData) {
  let clubId: string;
  let yearId: string;
  let checklistId: string;
  let archiveItemId: string | null;
  let status: "pending" | "ready" | "confirmed" | "needs_update";
  let notes: string;
  try {
    clubId = uuid(formData, "clubId");
    yearId = uuid(formData, "yearId");
    checklistId = uuid(formData, "checklistId");
    archiveItemId = optionalUuid(formData, "archiveItemId");
    const rawStatus = String(formData.get("status") ?? "pending");
    if (!(["pending", "ready", "confirmed", "needs_update"] as const).includes(rawStatus as typeof status)) throw new Error("invalid_input");
    status = rawStatus as typeof status;
    notes = bounded(formData, "notes", 1000);
  } catch {
    redirect(invalidInputPath(formData));
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_handover_checklist", {
    p_club_id: clubId,
    p_checklist_id: checklistId,
    p_status: status,
    p_archive_item_id: archiveItemId,
    p_notes: notes,
  });
  if (error) redirectResult(clubId, yearId, "error", rpcError(error.message));
  redirectResult(clubId, yearId, "success", "checklist_updated");
}

export async function confirmArchiveHandoverAction(formData: FormData) {
  let clubId: string;
  let yearId: string;
  let confirmationRole: "outgoing" | "incoming";
  try {
    clubId = uuid(formData, "clubId");
    yearId = uuid(formData, "yearId");
    const role = String(formData.get("confirmationRole") ?? "");
    if (role !== "outgoing" && role !== "incoming") throw new Error("invalid_input");
    confirmationRole = role;
  } catch {
    redirect(invalidInputPath(formData));
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_archive_handover", {
    p_club_id: clubId,
    p_rotary_year_id: yearId,
    p_confirmation_role: confirmationRole,
  });
  if (error) redirectResult(clubId, yearId, "error", rpcError(error.message));
  redirectResult(clubId, yearId, "success", "handover_confirmed");
}
