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
import { COVER_BUCKET } from "@/lib/events/cover-image";
import { pushPublishedEventToLine } from "@/lib/line/event-push";
import type { MessagePushOutcome } from "@/lib/line/message-push-outcome";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function eventPath(clubId: string, key: "success" | "error", code: string, mode?: string) {
  const params = new URLSearchParams(mode === "management" ? { [key]: code, mode } : { clubId, [key]: code });
  // The mode has to survive the redirect. Without it a manager who has just
  // created a draft lands back in the member view, where drafts are correctly
  // hidden -- so the event they just made appears not to exist.
  if (mode === "management") params.set("mode", mode);
  return mode === "management"
    ? `/clubs/${encodeURIComponent(clubId)}/events?${params.toString()}`
    : `/events?${params.toString()}`;
}

function readMode(formData: FormData) {
  const mode = formData.get("mode");
  return mode === "management" ? "management" : undefined;
}

function invalidEventPath(formData: FormData) {
  const rawClubId = typeof formData.get("clubId") === "string"
    ? String(formData.get("clubId")).trim()
    : "";
  const mode = readMode(formData);
  return uuidPattern.test(rawClubId)
    ? eventPath(rawClubId, "error", "invalid_input", mode)
    : "/events?error=invalid_input";
}

/** Repeated form entries, filtered to well-formed ids. */
function readUuidList(formData: FormData, name: string) {
  const values = formData.getAll(name).map((value) => String(value).trim());
  return Array.from(new Set(values.filter((value) => uuidPattern.test(value))));
}

function readEventId(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const id = (data as Record<string, unknown>).event_id ?? (data as Record<string, unknown>).id;
  return typeof id === "string" && uuidPattern.test(id) ? id : null;
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

  // An event addressed to particular people is not a 例會, so it cannot count
  // for attendance. The form disables the control, and the value is forced
  // here as well so a request that supplies both cannot reach the database and
  // be refused by the trigger with an error the officer cannot act on.
  const audienceTagIds = readUuidList(formData, "audienceTagIds");
  const audienceMembershipIds = readUuidList(formData, "audienceMembershipIds");
  const targeted = audienceTagIds.length > 0 || audienceMembershipIds.length > 0;
  const countsForAttendance = validated.input.countsForAttendance && !targeted;

  let rpcError: { message?: string } | null = null;
  let createdEventId: string | null = null;
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
      p_counts_for_attendance: countsForAttendance,
      p_venue_latitude: validated.input.venue?.latitude ?? null,
      p_venue_longitude: validated.input.venue?.longitude ?? null,
    });
    rpcError = result.error;
    createdEventId = readEventId(result.data);

    if (!rpcError && targeted && createdEventId) {
      const audience = await supabase.rpc("set_club_event_audience", {
        p_club_id: clubId,
        p_event_id: createdEventId,
        p_tag_ids: audienceTagIds,
        p_membership_ids: audienceMembershipIds,
      });
      // The draft exists at this point. Saying so matters: reporting a plain
      // failure would send the officer to create it again and leave two.
      if (audience.error) {
        revalidatePath("/events");
        revalidatePath(`/clubs/${clubId}/events`);
        return createEventFailure(
          values,
          revision,
          "活動草稿已建立，但發送對象未儲存。請在活動列表確認草稿，並重新設定對象。",
        );
      }
    }
  } catch {
    return createEventFailure(values, revision, "目前無法建立活動草稿，請稍後再試。已輸入的內容仍保留，可直接重試。");
  }
  if (rpcError) return createEventRpcFailure(values, revision, rpcError.message);
  revalidatePath("/events");
  revalidatePath(`/clubs/${clubId}/events`);
  redirect(eventPath(clubId, "success", "event_created", readMode(formData)));
}

export async function recordEventCoverAction({
  clubId,
  eventId,
  path,
}: {
  clubId: string;
  eventId: string;
  path: string | null;
}) {
  let club: string;
  let event: string;
  try {
    club = parseUuid(clubId);
    event = parseUuid(eventId);
  } catch {
    return;
  }

  const supabase = await createClient();
  // The upload already proved the caller may write to this club's folder; this
  // proves the key belongs to the event it is being attached to.
  const { error } = await supabase.rpc("set_club_event_cover", {
    p_club_id: club,
    p_event_id: event,
    p_cover_image_path: path,
  });
  if (error) return;

  if (path === null) {
    // Leaving the object behind would keep consuming the storage allowance for
    // an image nothing renders.
    await supabase.storage.from(COVER_BUCKET).remove([`${club}/${event}`]);
  }
  revalidatePath("/events");
  revalidatePath(`/clubs/${club}/events`);
  revalidatePath("/dashboard");
}

export async function publishEventAction(formData: FormData) {
  let clubId: string;
  let eventId: string;
  const mode = readMode(formData);
  try {
    clubId = parseUuid(formData.get("clubId"));
    eventId = parseUuid(formData.get("eventId"));
  } catch {
    redirect(invalidEventPath(formData));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_club_event", {
    p_club_id: clubId,
    p_event_id: eventId,
  });
  if (error) redirect(eventPath(clubId, "error", mapEventError(error.message), mode));

  // The event is published either way. A failed push is reported as a different
  // success code, never as a failed publish -- an officer told the publish
  // failed would try again and the second attempt would be refused anyway.
  const linePush = await pushPublishedEventToLine({ supabase, clubId, eventId })
    .catch((): MessagePushOutcome => ({ status: "failed", reason: "unexpected" }));

  revalidatePath("/events");
  revalidatePath(`/clubs/${clubId}/events`);
  redirect(eventPath(
    clubId,
    "success",
    linePush.status === "failed" ? "event_published_line_failed" : "event_published",
    mode,
  ));
}

export async function cancelEventAction(formData: FormData) {
  let clubId: string;
  let eventId: string;
  let reason: string;
  const mode = readMode(formData);
  try {
    clubId = parseUuid(formData.get("clubId"));
    eventId = parseUuid(formData.get("eventId"));
    reason = parseEventText(formData.get("reason"), 500, true);
  } catch {
    redirect(invalidEventPath(formData));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_club_event", {
    p_club_id: clubId,
    p_event_id: eventId,
    p_reason: reason,
  });
  if (error) redirect(eventPath(clubId, "error", mapEventError(error.message), mode));
  revalidatePath("/events");
  revalidatePath(`/clubs/${clubId}/events`);
  redirect(eventPath(clubId, "success", "event_cancelled", mode));
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
