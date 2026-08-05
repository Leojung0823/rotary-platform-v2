"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  parseEventResponse,
  parseEventText,
  parseEventType,
  parseGuestCount,
  parseOptionalCapacity,
  parseTaipeiDateTime,
} from "@/lib/events/validation";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function eventPath(clubId: string, key: "success" | "error", code: string) {
  const params = new URLSearchParams({ clubId, [key]: code });
  return `/events?${params.toString()}`;
}

function eventDetailPath(eventId: string, key: "success" | "error", code: string) {
  return `/events/${encodeURIComponent(eventId)}?${new URLSearchParams({ [key]: code }).toString()}`;
}

function actionResultPath(formData: FormData, clubId: string, key: "success" | "error", code: string) {
  const returnPath = String(formData.get("returnPath") ?? "");
  const managementPath = `/clubs/${clubId}/events`;
  if (returnPath === managementPath) return `${managementPath}?${new URLSearchParams({ [key]: code }).toString()}`;
  return eventPath(clubId, key, code);
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

export async function createEventAction(formData: FormData) {
  let clubId: string;
  let input: {
    eventType: ReturnType<typeof parseEventType>;
    title: string;
    description: string;
    location: string;
    startsAt: string;
    endsAt: string;
    registrationDeadline: string;
    capacity: number | null;
    countsForAttendance: boolean;
  };

  try {
    clubId = parseUuid(formData.get("clubId"));
    input = {
      eventType: parseEventType(formData.get("eventType")),
      title: parseEventText(formData.get("title"), 160, true),
      description: parseEventText(formData.get("description"), 5000),
      location: parseEventText(formData.get("location"), 300),
      startsAt: parseTaipeiDateTime(formData.get("startsAt")),
      endsAt: parseTaipeiDateTime(formData.get("endsAt")),
      registrationDeadline: parseTaipeiDateTime(formData.get("registrationDeadline")),
      capacity: parseOptionalCapacity(formData.get("capacity")),
      countsForAttendance: formData.get("countsForAttendance") === "on",
    };
    if (input.endsAt <= input.startsAt || input.registrationDeadline > input.startsAt) {
      throw new Error("invalid_event_time");
    }
  } catch {
    const rawClubId = typeof formData.get("clubId") === "string" ? String(formData.get("clubId")) : "";
    redirect(eventPath(rawClubId, "error", "invalid_input"));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_club_event", {
    p_club_id: clubId,
    p_event_type: input.eventType,
    p_title: input.title,
    p_description: input.description,
    p_location: input.location,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_registration_deadline: input.registrationDeadline,
    p_capacity: input.capacity,
    p_counts_for_attendance: input.countsForAttendance,
  });
  if (error) redirect(actionResultPath(formData, clubId, "error", mapEventError(error.message)));
  revalidatePath("/events");
  revalidatePath(`/clubs/${clubId}/events`);
  redirect(actionResultPath(formData, clubId, "success", "event_created"));
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
  if (error) redirect(actionResultPath(formData, clubId, "error", mapEventError(error.message)));
  revalidatePath("/events");
  revalidatePath(`/clubs/${clubId}/events`);
  redirect(actionResultPath(formData, clubId, "success", "event_published"));
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
  if (error) redirect(actionResultPath(formData, clubId, "error", mapEventError(error.message)));
  revalidatePath("/events");
  revalidatePath(`/clubs/${clubId}/events`);
  redirect(actionResultPath(formData, clubId, "success", "event_cancelled"));
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
    const rawEventId = typeof formData.get("eventId") === "string" ? String(formData.get("eventId")) : "";
    redirect(uuidPattern.test(rawEventId) ? eventDetailPath(rawEventId, "error", "invalid_input") : "/events?error=invalid_input");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_event_registration", {
    p_club_id: clubId,
    p_event_id: eventId,
    p_response: response,
    p_guest_count: guestCount,
    p_note: note,
  });
  if (error) redirect(eventDetailPath(eventId, "error", mapEventError(error.message)));
  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/dashboard");
  redirect(eventDetailPath(eventId, "success", "registration_saved"));
}
