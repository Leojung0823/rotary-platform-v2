"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  type EventCreateActionState,
  type EventCreateField,
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
  if (message?.includes("event_cancel_lock_timeout")
    || message?.includes("event_cancel_statement_timeout")) return "retryable";
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

/**
 * Which field the database refused, and what to say about it.
 *
 * Every one of these used to arrive as `invalid_event_input`, so the form could
 * only say 「活動資料未通過系統規則」 and leave the officer to find it. The
 * database knew which rule it was; it just had no way to say so.
 */
const eventRuleFailures: readonly Readonly<{
  message: string;
  field: EventCreateField;
  text: string;
}>[] = [
  { message: "event_ends_before_it_starts", field: "endsAt", text: "結束時間必須晚於開始時間。" },
  { message: "event_deadline_after_start", field: "registrationDeadline", text: "報名截止不能晚於活動開始時間。" },
  { message: "invalid_event_capacity", field: "capacity", text: "名額請填 1 到 10000，或留空表示不限。" },
  { message: "invalid_event_title", field: "title", text: "請填活動名稱，最多 160 個字。" },
  { message: "invalid_event_description", field: "description", text: "活動說明最多 5000 個字。" },
  { message: "invalid_event_location", field: "location", text: "地點最多 300 個字。" },
  { message: "invalid_event_type", field: "eventType", text: "請選擇一種活動類型。" },
  { message: "invalid_event_venue_location", field: "venueLocation", text: "座標要一組完整的緯度與經度，例如 25.033964, 121.564468。" },
  { message: "invalid_event_time", field: "startsAt", text: "請填開始時間與結束時間。" },
];

function createEventRpcFailure(values: EventCreateFormValues, revision: number, message: string | undefined) {
  const code = mapEventError(message);
  if (code === "forbidden") {
    return createEventFailure(values, revision, "目前帳號沒有建立此扶輪社活動的權限。請確認社別與權限後再試。");
  }
  // Name the field before falling back to the sentence that names none.
  const named = eventRuleFailures.find((failure) => message?.includes(failure.message));
  if (named) {
    return createEventFailure(values, revision, "請修正下列欄位後再建立活動草稿。", { [named.field]: named.text });
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

export type EventCoverActionResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: string }>;

/**
 * Attach an uploaded object to its event, or detach it.
 *
 * Returns an outcome rather than nothing. It used to swallow every failure and
 * return void, while the button said 「圖片已更新。」 regardless -- so an upload
 * that reached Storage but was never recorded looked exactly like one that
 * worked, and the officer had no way to find out which they had.
 */
export async function recordEventCoverAction({
  clubId,
  eventId,
  path,
}: {
  clubId: string;
  eventId: string;
  path: string | null;
}): Promise<EventCoverActionResult> {
  let club: string;
  let event: string;
  try {
    club = parseUuid(clubId);
    event = parseUuid(eventId);
  } catch {
    return { ok: false, reason: "invalid_input" };
  }

  const supabase = await createClient();
  // The upload already proved the caller may write to this club's folder; this
  // proves the key belongs to the event it is being attached to.
  const { error } = await supabase.rpc("set_club_event_cover", {
    p_club_id: club,
    p_event_id: event,
    p_cover_image_path: path,
  });
  if (error) return { ok: false, reason: error.message ?? "unknown" };

  if (path === null) {
    // Leaving the object behind would keep consuming the storage allowance for
    // an image nothing renders.
    await supabase.storage.from(COVER_BUCKET).remove([`${club}/${event}`]);
  }
  revalidatePath("/events");
  revalidatePath(`/events/${event}`);
  revalidatePath(`/clubs/${club}/events`);
  revalidatePath("/dashboard");
  return { ok: true };
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

export type VenueGeocodeState =
  | { status: "idle" }
  | { status: "found"; latitude: number; longitude: number; formattedAddress: string }
  | { status: "error"; message: string };

const geocodeMessages: Record<string, string> = {
  not_configured: "這個環境還沒有設定地圖查詢金鑰，請直接貼上地圖連結或座標。",
  not_found: "查不到這個地址，請換個寫法，或直接貼上地圖連結。",
  lookup_failed: "地圖查詢沒有回應，請稍後再試，或直接貼上地圖連結。",
  forbidden: "您沒有管理這個社活動的權限。",
  invalid: "請輸入要查詢的地址。",
};

/**
 * Turns an address into venue coordinates for the check-in radius.
 *
 * Gated on the same authority as creating the event it belongs to. Without
 * that gate any signed-in member could use the club's Google key as a free
 * geocoding service, which is billed per request.
 */
export async function geocodeVenueAddressAction(
  _state: VenueGeocodeState,
  formData: FormData,
): Promise<VenueGeocodeState> {
  const clubId = String(formData.get("clubId") ?? "");
  const address = String(formData.get("venueAddress") ?? "").trim();
  if (!uuidPattern.test(clubId) || !address || address.length > 300) {
    return { status: "error", message: geocodeMessages.invalid };
  }

  const supabase = await createClient();
  const { data: allowed, error } = await supabase.rpc("current_can_manage_club_events", {
    p_club_id: clubId,
  });
  if (error || allowed !== true) {
    return { status: "error", message: geocodeMessages.forbidden };
  }

  const { geocodeVenueAddress } = await import("@/lib/events/geocode");
  const outcome = await geocodeVenueAddress(address);
  if (!outcome.ok) {
    return { status: "error", message: geocodeMessages[outcome.reason] ?? geocodeMessages.lookup_failed };
  }
  return {
    status: "found",
    latitude: outcome.latitude,
    longitude: outcome.longitude,
    formattedAddress: outcome.formattedAddress,
  };
}

/**
 * Edits an event that has already been published.
 *
 * Reuses the create form's validation wholesale, because the fields and their
 * constraints are the same question asked twice; only the database rules differ
 * (see 20260914001000). The version the form was rendered from travels with the
 * submission so a second officer editing the same event is refused rather than
 * silently overwritten.
 */
export async function updateEventAction(
  _state: EventCreateActionState,
  formData: FormData,
): Promise<EventCreateActionState> {
  const values = readEventCreateFormValues(formData);
  const revision = Number(formData.get("revision") ?? 0) + 1;
  const clubId = String(formData.get("clubId") ?? "");
  const eventId = String(formData.get("eventId") ?? "");
  const expectedVersion = Number.parseInt(String(formData.get("expectedVersion") ?? ""), 10);

  if (!uuidPattern.test(clubId) || !uuidPattern.test(eventId)) {
    return createEventFailure(values, revision, "目前無法確認這場活動，請重新整理後再試。");
  }

  const validated = validateEventCreateForm(values);
  if (!validated.ok) {
    return createEventFailure(values, revision, "請修正下列欄位後再儲存。", validated.fieldErrors);
  }

  // The edit form renders the audience picker, but this action never read it:
  // an officer could change 發送對象 and nothing happened. Forced the same way
  // creating does, so a targeted event cannot also claim to count.
  const audienceTagIds = readUuidList(formData, "audienceTagIds");
  const audienceMembershipIds = readUuidList(formData, "audienceMembershipIds");
  const targeted = audienceTagIds.length > 0 || audienceMembershipIds.length > 0;
  const countsForAttendance = validated.input.countsForAttendance && !targeted;

  type UpdateOutcome = { notify_members?: unknown; changed_field_count?: unknown; version?: unknown };
  let outcome: UpdateOutcome | null = null;
  try {
    const supabase = await createClient();
    // The audience first. counts_for_attendance and the audience are mutually
    // exclusive in the database, so widening the audience before the event
    // stops counting would be refused by the trigger -- but update_club_event
    // sets counts_for_attendance to false in the same call, and it has to have
    // done so before the audience is written.
    const result = await supabase.rpc("update_club_event", {
      p_club_id: clubId,
      p_event_id: eventId,
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
      p_expected_version: Number.isNaN(expectedVersion) ? null : expectedVersion,
    });
    if (result.error) return updateEventRpcFailure(values, revision, result.error.message);
    outcome = (result.data ?? null) as UpdateOutcome | null;

    // Always sent, including when it is empty: an officer removing every tag
    // is widening the event back to the whole club, and skipping the call for
    // an empty selection would make that the one edit that cannot be made.
    const audience = await supabase.rpc("set_club_event_audience", {
      p_club_id: clubId,
      p_event_id: eventId,
      p_tag_ids: audienceTagIds,
      p_membership_ids: audienceMembershipIds,
    });
    if (audience.error) {
      // The rest of the edit is already saved, and saying so matters: a plain
      // failure would send the officer to make the same changes again.
      revalidatePath("/events");
      revalidatePath(`/clubs/${clubId}/events`);
      return createEventFailure(
        values,
        revision,
        "活動已儲存，但發送對象未更新。請重新開啟編輯頁確認對象。",
      );
    }
  } catch {
    return createEventFailure(values, revision, "目前無法儲存這場活動，請稍後再試。已輸入的內容仍保留。");
  }

  // Members were told a time and a place. Only those moving is worth a push;
  // a typo fix that notified everyone would be noise. The push never turns a
  // saved edit into a failure -- the same rule publishing follows.
  if (outcome?.notify_members === true) {
    try {
      const supabase = await createClient();
      const eventVersion = typeof outcome.version === "number"
        && Number.isInteger(outcome.version)
        && outcome.version >= 1
        ? outcome.version
        : null;
      await pushPublishedEventToLine({ supabase, clubId, eventId, eventVersion });
    } catch {
      // Recorded by the push path itself; the edit is already saved.
    }
  }

  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/clubs/${clubId}/events`);
  redirect(`/clubs/${clubId}/events?mode=management&success=event_updated`);
}

function updateEventRpcFailure(
  values: EventCreateFormValues,
  revision: number,
  message?: string,
) {
  const messages: Record<string, string> = {
    event_not_editable: "這場活動已取消或已結束，不能再編輯。",
    event_already_finished: "這場活動已經結束，不能再編輯。",
    event_changed_elsewhere: "另一位幹部剛剛改過這場活動。請重新整理看最新內容，再決定要不要覆蓋。",
    capacity_below_registrations: "名額不能少於目前已報名的人數。請先調整報名，或把名額設為不限。",
    event_manage_required: "您沒有管理這個社活動的權限。",
    event_not_found: "找不到這場活動。",
  };
  const matched = Object.keys(messages).find((code) => message?.includes(code));
  return createEventFailure(values, revision, matched ? messages[matched] : "目前無法儲存這場活動，請稍後再試。");
}

const registrationErrors: Record<string, string> = {
  event_manage_required: "目前帳號沒有管理這個活動的權限。",
  event_not_available: "找不到這場活動。",
  membership_not_available: "找不到這位社員，或這場活動不是發送給他的。",
  event_registration_closed: "活動尚未發布或已結束，不能代為報名。",
  event_capacity_full: "名額已滿，這次沒有寫入。",
  invalid_event_registration: "報名內容不正確。",
  registration_reason_required: "請寫下原因（例如：來電告知無法出席），最多 200 字。",
};

function registrationErrorMessage(message: string | undefined): string {
  for (const [code, text] of Object.entries(registrationErrors)) {
    if (message?.includes(code)) return text;
  }
  return "目前無法更新報名狀態，請稍後再試。";
}

/**
 * An officer answering for a member.
 *
 * A member phoning to say they cannot come is ordinary club business that had
 * no home in the product: the card showed a count and nothing else. The reason
 * is required and stored as the registration's note, so the member can later
 * see why their answer is what it is, and the club can answer for the change.
 */
export async function setMemberEventRegistrationAction(formData: FormData) {
  let clubId: string;
  let eventId: string;
  let membershipId: string;
  try {
    clubId = parseUuid(formData.get("clubId"));
    eventId = parseUuid(formData.get("eventId"));
    membershipId = parseUuid(formData.get("membershipId"));
  } catch {
    redirect("/dashboard");
  }

  const response = String(formData.get("response") ?? "");
  const guestCount = Number.parseInt(String(formData.get("guestCount") ?? "0"), 10);
  const reason = String(formData.get("reason") ?? "").trim();
  const back = (key: "success" | "error", code: string) =>
    `/clubs/${encodeURIComponent(clubId)}/events?mode=management&${key}=${encodeURIComponent(code)}#event-${encodeURIComponent(eventId)}`;

  if (!["pending", "attending", "declined"].includes(response)) redirect(back("error", "invalid_input"));
  if (reason.length === 0 || reason.length > 200) redirect(back("error", "reason_required"));

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_event_registration_for_member", {
    p_club_id: clubId,
    p_event_id: eventId,
    p_membership_id: membershipId,
    p_response: response,
    p_guest_count: Number.isNaN(guestCount) ? 0 : guestCount,
    p_reason: reason,
  });
  if (error) {
    redirect(`${back("error", "registration_failed")}&detail=${encodeURIComponent(registrationErrorMessage(error.message))}`);
  }

  revalidatePath(`/clubs/${clubId}/events`);
  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/dashboard");
  redirect(back("success", "registration_set"));
}
