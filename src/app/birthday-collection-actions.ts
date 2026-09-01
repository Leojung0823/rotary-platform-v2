"use server";

import { redirect } from "next/navigation";
import { requireIdentity } from "@/lib/auth";
import { birthdayCollectionBatchStatus } from "@/lib/birthday-collection/batch-result";
import { birthdayCollectionGenerationSuccessCode } from "@/lib/birthday-collection/notification-result";
import { birthdayCollectionRpcErrorCode } from "@/lib/birthday-collection/rpc-error";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const questionKeyPattern = /^[a-z][a-z0-9_]{2,63}$/u;
const questionTones = new Set(["warm", "humorous", "moving"]);

function collectionPath(clubId: string, kind?: "success" | "error", code?: string, management = false) {
  const query = new URLSearchParams(management ? { mode: "management" } : { clubId });
  if (kind && code) query.set(kind, code);
  return management
    ? `/clubs/${encodeURIComponent(clubId)}/birthday-collection?${query.toString()}`
    : `/birthday-collection?${query.toString()}`;
}

function managementInvalidInputPath(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "").trim().toLowerCase();
  return uuidPattern.test(clubId)
    ? collectionPath(clubId, "error", "invalid_input", true)
    : "/dashboard?mode=management&error=invalid_input";
}

function uuid(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim().toLowerCase();
  if (!uuidPattern.test(value)) throw new Error("invalid_input");
  return value;
}

function content(formData: FormData) {
  const value = String(formData.get("content") ?? "").replace(/\s+/gu, " ").trim();
  if (value.length < 1 || value.length > 500) throw new Error("invalid_content");
  return value;
}

function questionKey(formData: FormData) {
  const value = String(formData.get("questionKey") ?? "").trim().toLowerCase();
  if (!questionKeyPattern.test(value)) throw new Error("invalid_question");
  return value;
}

function questionPrompt(formData: FormData) {
  const value = String(formData.get("questionPrompt") ?? "").replace(/\s+/gu, " ").trim();
  if (value.length < 1 || value.length > 300) throw new Error("invalid_question");
  return value;
}

function questionTone(formData: FormData) {
  const value = String(formData.get("tone") ?? "").trim();
  if (!questionTones.has(value)) throw new Error("invalid_question");
  return value;
}

function sortOrder(formData: FormData) {
  const value = Number(String(formData.get("sortOrder") ?? ""));
  if (!Number.isInteger(value) || value < 0 || value > 10000) throw new Error("invalid_question");
  return value;
}

function enabled(formData: FormData) {
  const value = formData.get("isEnabled");
  if (value === null || value === "on" || value === "true") return value !== null;
  if (value === "false") return false;
  throw new Error("invalid_question");
}

function period(formData: FormData) {
  const year = Number(String(formData.get("birthdayYear") ?? ""));
  const month = Number(String(formData.get("birthdayMonth") ?? ""));
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("invalid_period");
  }
  return { year, month };
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function requireCollectionFlag() {
  const identity = await requireIdentity();
  const evaluation = await evaluateCurrentFeatureFlag({
    key: "birthday_wishes_collection_v1",
    subjectUuid: identity.id,
  });
  return evaluation.enabled;
}

export async function saveBirthdayCollectionSubmissionAction(formData: FormData) {
  let clubId: string;
  let participantId: string;
  let value: string;
  try {
    clubId = uuid(formData, "clubId");
    participantId = uuid(formData, "participantId");
    value = content(formData);
  } catch {
    redirect("/birthdays?error=invalid_input");
  }
  if (!await requireCollectionFlag()) redirect("/birthdays?error=feature_disabled");

  const { error } = await (await createClient()).rpc("save_birthday_wish_submission", {
    p_club_id: clubId,
    p_participant_id: participantId,
    p_content: value,
  });
  if (error) redirect(collectionPath(clubId, "error", birthdayCollectionRpcErrorCode(error.message)));
  redirect(collectionPath(clubId, "success", "submitted"));
}

export async function deleteBirthdayCollectionSubmissionAction(formData: FormData) {
  let clubId: string;
  let participantId: string;
  try {
    clubId = uuid(formData, "clubId");
    participantId = uuid(formData, "participantId");
  } catch {
    redirect("/birthdays?error=invalid_input");
  }
  if (!await requireCollectionFlag()) redirect("/birthdays?error=feature_disabled");

  const { error } = await (await createClient()).rpc("delete_own_birthday_wish_submission", {
    p_club_id: clubId,
    p_participant_id: participantId,
  });
  if (error) redirect(collectionPath(clubId, "error", birthdayCollectionRpcErrorCode(error.message)));
  redirect(collectionPath(clubId, "success", "deleted"));
}

export async function declineBirthdayCollectionAssignmentAction(formData: FormData) {
  let clubId: string;
  let participantId: string;
  try {
    clubId = uuid(formData, "clubId");
    participantId = uuid(formData, "participantId");
  } catch {
    redirect("/birthdays?error=invalid_input");
  }
  if (!await requireCollectionFlag()) redirect(collectionPath(clubId, "error", "feature_disabled"));

  const { error } = await (await createClient()).rpc("decline_birthday_wish_assignment", {
    p_club_id: clubId,
    p_participant_id: participantId,
  });
  if (error) redirect(collectionPath(clubId, "error", birthdayCollectionRpcErrorCode(error.message)));
  redirect(collectionPath(clubId, "success", "declined"));
}

export async function publishBirthdayCollectionSubmissionAction(formData: FormData) {
  let clubId: string;
  let participantId: string;
  try {
    clubId = uuid(formData, "clubId");
    participantId = uuid(formData, "participantId");
  } catch {
    redirect(managementInvalidInputPath(formData));
  }
  if (!await requireCollectionFlag()) redirect(collectionPath(clubId, "error", "feature_disabled", true));

  const { error } = await (await createClient()).rpc("publish_birthday_wish_submission", {
    p_club_id: clubId,
    p_participant_id: participantId,
  });
  if (error) redirect(collectionPath(clubId, "error", birthdayCollectionRpcErrorCode(error.message), true));
  redirect(collectionPath(clubId, "success", "published", true));
}

export async function hideBirthdayCollectionSubmissionAction(formData: FormData) {
  let clubId: string;
  let participantId: string;
  try {
    clubId = uuid(formData, "clubId");
    participantId = uuid(formData, "participantId");
  } catch {
    redirect(managementInvalidInputPath(formData));
  }
  if (!await requireCollectionFlag()) redirect(collectionPath(clubId, "error", "feature_disabled", true));

  const { error } = await (await createClient()).rpc("hide_birthday_wish_submission", {
    p_club_id: clubId,
    p_participant_id: participantId,
  });
  if (error) redirect(collectionPath(clubId, "error", birthdayCollectionRpcErrorCode(error.message), true));
  redirect(collectionPath(clubId, "success", "hidden", true));
}

export async function createBirthdayCollectionQuestionAction(formData: FormData) {
  let clubId: string;
  let key: string;
  let prompt: string;
  let tone: string;
  let order: number;
  try {
    clubId = uuid(formData, "clubId");
    key = questionKey(formData);
    prompt = questionPrompt(formData);
    tone = questionTone(formData);
    order = sortOrder(formData);
  } catch {
    redirect(managementInvalidInputPath(formData));
  }
  if (!await requireCollectionFlag()) redirect(collectionPath(clubId, "error", "feature_disabled", true));

  const { error } = await (await createClient()).rpc("create_birthday_wish_question", {
    p_club_id: clubId,
    p_question_key: key,
    p_prompt: prompt,
    p_tone: tone,
    p_sort_order: order,
  });
  if (error) redirect(collectionPath(clubId, "error", birthdayCollectionRpcErrorCode(error.message), true));
  redirect(collectionPath(clubId, "success", "question_created", true));
}

export async function updateBirthdayCollectionQuestionAction(formData: FormData) {
  let clubId: string;
  let questionId: string;
  let prompt: string;
  let tone: string;
  let order: number;
  let isEnabled: boolean;
  try {
    clubId = uuid(formData, "clubId");
    questionId = uuid(formData, "questionId");
    prompt = questionPrompt(formData);
    tone = questionTone(formData);
    order = sortOrder(formData);
    isEnabled = enabled(formData);
  } catch {
    redirect(managementInvalidInputPath(formData));
  }
  if (!await requireCollectionFlag()) redirect(collectionPath(clubId, "error", "feature_disabled", true));

  const { error } = await (await createClient()).rpc("update_birthday_wish_question", {
    p_club_id: clubId,
    p_question_id: questionId,
    p_prompt: prompt,
    p_tone: tone,
    p_sort_order: order,
    p_is_enabled: isEnabled,
  });
  if (error) redirect(collectionPath(clubId, "error", birthdayCollectionRpcErrorCode(error.message), true));
  redirect(collectionPath(clubId, "success", "question_updated", true));
}

export async function runBirthdayCollectionMonthAction(formData: FormData) {
  let clubId: string;
  let year: number;
  let month: number;
  try {
    clubId = uuid(formData, "clubId");
    ({ year, month } = period(formData));
  } catch {
    redirect(managementInvalidInputPath(formData));
  }
  if (!await requireCollectionFlag()) redirect(collectionPath(clubId, "error", "feature_disabled", true));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_birthday_wish_collection_month", {
    p_club_id: clubId,
    p_birthday_year: year,
    p_birthday_month: month,
  });
  if (error) redirect(collectionPath(clubId, "error", birthdayCollectionRpcErrorCode(error.message), true));

  const batch = objectValue(data);
  if (!batch) {
    redirect(collectionPath(clubId, "error", "unexpected", true));
    return;
  }
  const batchId = typeof batch.batch_id === "string" && uuidPattern.test(batch.batch_id)
    ? batch.batch_id
    : null;
  if (!batchId) {
    redirect(collectionPath(clubId, "error", "unexpected", true));
    return;
  }

  const batchStatus = birthdayCollectionBatchStatus(batch);
  if (!batchStatus) {
    redirect(collectionPath(clubId, "error", "unexpected", true));
    return;
  }

  if (batchStatus === "completed") {
    const notification = await supabase.rpc("ensure_birthday_wish_collection_notification", {
      p_club_id: clubId,
      p_assignment_batch_id: batchId,
    });
    if (notification.error) redirect(collectionPath(clubId, "error", "notification_failed", true));
    const successCode = birthdayCollectionGenerationSuccessCode(notification.data);
    if (!successCode) {
      redirect(collectionPath(clubId, "error", "notification_failed", true));
    }
    redirect(collectionPath(clubId, "success", successCode, true));
  }

  redirect(collectionPath(clubId, "success", "generation_failed", true));
}
