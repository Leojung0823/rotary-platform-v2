"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  type EventCreateActionState,
  type EventCreateFormValues,
  parseEventResponse,
  parseEventText,
  parseGuestCount,
  readEventCreateFormValues,
  validateEventCreateForm,
} from "@/lib/events/validation";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function eventPath(clubId: string, key: "success" | "error", code: string) {
  const params = new URLSearchParams({ clubId, [key]: code });
  return `/events?${params.toString()}`;
}

function parseUuid(value: FormDataEntryValue | null) {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (!uuidPattern.test(parsed)) throw new Error("invalid_uuid");
  return parsed;
}

function mapEventError(message: string | undefined) {
  if (message?.includes("event_capacity_full")) return "capacity_full";
  if (message?.includes("event_registration_closed")) return "registration_closed";
  if (message?.includes("event_manage_required")) return "forbidden";
  if (message?.includes("active_event_membership_required")) return "forbidden";
  if (message?.includes("event_cannot_be_published")) return "cannot_publish";
  if (message?.includes("invalid_event")) return "invalid_input";
  return "unexpected";
}

function createEventFailure(
  values: EventCreateFormValues,
  revision: number,
  formError: string,
  fieldErrors: EventCreateActionState["fieldErrors"] = {},
): EventCreateActionState {
  return { status: "error", revision, values, fieldErrors, formError };
}

function createEventRpcFailure(values: EventCreateFormValues, revision: number, message: string | undefined) {
  const code = mapEventError(message);
  if (code === "forbidden") {
    return createEventFailure(values, revision, "目前帳號沒有建立此扶輪社活動的權限。請確認社別與權限後再試。");
  }
  if (code === "invalid_input" || code === "cannot_publish") {
    return createEventFailure(values, revision, "活動資料未通過系統規則，請確認內容後再試。");
  }
  return createEventFailure(values, revision, "目前無法建立活動草稿，請稍後再試。已輸入的內容仍保留，可直接重試。");
}

export async function createEventAction(
  previousState: EventCreateActionState,
  formData: FormData,
): Promise<EventCreateActionState> {
  const values = readEventCreateFormValues(formData);
  const revision = previousState.revision + 1;
  let clubId: string;
  try {
    clubId = parseUuid(formData.get("clubId"));
  } catch {
    return createEventFailure(values, revision, "目前無法確認活動社別與權限，請重新整理後再試。");
  }

  const validated = validateEventCreateForm(values);
  if (!validated.ok) {
    return createEventFailure(values, revision, "請修正下列欄位後再建立活動草稿。", validated.fieldErrors);
  }

  let rpcError: { message?: string } | null = null;
  try {
    const supabase = await createClient();
    const result = await supabase.rpc("create_club_event", {
      p_club_id: clubId,
      p_event_type: validated.input.eventType,
      p_title: validated.input.title,
      p_description: validated.input.description,
      p_location: validated.input.location,
      p_starts_at: validated.input.startsAt,
      p_ends_at: validated.input.endsAt,
      p_registration_deadline: validated.input.registrationDeadline,
      p_capacity: validated.input.capacity,
      p_counts_for_attendance: validated.input.countsForAttendance,
      p_venue_latitude: validated.input.venue?.latitude ?? null,
      p_venue_longitude: validated.input.venue?.longitude ?? null,
    });
    rpcError = result.error;
  } catch {
    return createEventFailure(values, revision, "目前無法建立活動草稿，請稍後再試。已輸入的內容仍保留，可直接重試。");
  }
  if (rpcError) return createEventRpcFailure(values, revision, rpcError.message);
  revalidatePath("/events");
  redirect(eventPath(clubId, "success", "event_created"));
}

export async function publishEventAction(formData: FormData) {
  let clubId: string;
  let eventId: string;
  try {
    clubId = parseUuid(formData.get("clubId"));
    eventId = parseUuid(formData.get("eventId"));
  } catch {
    redirect("/events?error=invalid_input");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_club_event", {
    p_club_id: clubId,
    p_event_id: eventId,
  });
  if (error) redirect(eventPath(clubId, "error", mapEventError(error.message)));
  revalidatePath("/events");
  redirect(eventPath(clubId, "success", "event_published"));
}

export async function cancelEventAction(formData: FormData) {
  let clubId: string;
  let eventId: string;
  let reason: string;
  try {
    clubId = parseUuid(formData.get("clubId"));
    eventId = parseUuid(formData.get("eventId"));
    reason = parseEventText(formData.get("reason"), 500, true);
  } catch {
    redirect("/events?error=invalid_input");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_club_event", {
    p_club_id: clubId,
    p_event_id: eventId,
    p_reason: reason,
  });
  if (error) redirect(eventPath(clubId, "error", mapEventError(error.message)));
  revalidatePath("/events");
  redirect(eventPath(clubId, "success", "event_cancelled"));
}

export async function registerEventAction(formData: FormData) {
  let clubId: string;
  let eventId: string;
  let response: ReturnType<typeof parseEventResponse>;
  let guestCount: number;
  let note: string;
  try {
    clubId = parseUuid(formData.get("clubId"));
    eventId = parseUuid(formData.get("eventId"));
    response = parseEventResponse(formData.get("response"));
    guestCount = parseGuestCount(formData.get("guestCount"), response);
    note = parseEventText(formData.get("note"), 500);
  } catch {
    redirect("/events?error=invalid_input");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_event_registration", {
    p_club_id: clubId,
    p_event_id: eventId,
    p_response: response,
    p_guest_count: guestCount,
    p_note: note,
  });
  if (error) redirect(eventPath(clubId, "error", mapEventError(error.message)));
  revalidatePath("/events");
  redirect(eventPath(clubId, "success", "registration_saved"));
}
