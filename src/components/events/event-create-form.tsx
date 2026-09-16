"use client";

import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { geocodeVenueAddressAction, updateEventAction, type VenueGeocodeState } from "@/app/event-actions";
import { createEventAction } from "@/app/event-actions";
import { AudiencePicker, type AudienceMember, type AudienceTag } from "@/components/audience/audience-picker";
import { addressesWholeClub, emptyAudienceSelection, type AudienceSelection } from "@/lib/audience/selection";
import {
  EVENT_CREATE_FIELDS,
  initialEventCreateActionState,
  type EventCreateField,
  type EventCreateFormValues,
} from "@/lib/events/validation";

const fieldLabels: Record<EventCreateField, string> = {
  eventType: "活動類型",
  title: "活動名稱",
  startsAt: "開始時間",
  endsAt: "結束時間",
  registrationDeadline: "報名截止",
  capacity: "名額",
  location: "地點",
  venueLocation: "定位簽到座標",
  countsForAttendance: "計入出席",
  description: "活動說明",
};

type EventCreateFormProps = {
  clubId: string;
  eventTypeLabels: Record<string, string>;
  tags: readonly AudienceTag[];
  members: readonly AudienceMember[];
  /* Editing reuses this form rather than a copy of it: the fields and their
     rules are the same question asked twice, and two forms would drift. */
  editing?: {
    eventId: string;
    version: number;
    values: EventCreateFormValues;
    /** The audience this event already has, so editing starts from the truth. */
    audience: AudienceSelection;
  };
};

export function EventCreateForm({ clubId, eventTypeLabels, tags, members, editing }: EventCreateFormProps) {
  // Creating starts on the whole club; editing starts on whatever the event
  // already addresses. Opening the picker empty for a targeted event would
  // have made "save" mean "send this to everyone".
  const initialAudience = editing?.audience ?? emptyAudienceSelection;
  const [targeted, setTargeted] = useState(!addressesWholeClub(initialAudience));
  const handleAudienceChange = useCallback((selection: AudienceSelection) => {
    setTargeted(!addressesWholeClub(selection));
  }, []);
  const [state, formAction, pending] = useActionState(
    editing ? updateEventAction : createEventAction,
    editing
      ? { ...initialEventCreateActionState, values: editing.values }
      : initialEventCreateActionState,
  );
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const values = state.values;

  // The lookup writes into the coordinate field the manager can also type into
  // by hand, so an address is a convenience rather than a second source of
  // truth: whatever ends up in that one field is what gets submitted.
  const applyVenueCoordinates = useCallback((latitude: number, longitude: number) => {
    const field = document.getElementById("event-create-venueLocation");
    if (field instanceof HTMLInputElement) {
      field.value = `${latitude}, ${longitude}`;
      field.focus();
    }
  }, []);

  useEffect(() => {
    if (state.status !== "error") return;
    const firstInvalidField = EVENT_CREATE_FIELDS.find((field) => state.fieldErrors[field]);
    if (firstInvalidField) {
      document.getElementById(`event-create-${firstInvalidField}`)?.focus();
      return;
    }
    errorSummaryRef.current?.focus();
  }, [state]);

  const errorFor = (field: EventCreateField) => state.status === "error" ? state.fieldErrors[field] : undefined;
  const describedBy = (field: EventCreateField) => errorFor(field) ? `event-create-${field}-error` : undefined;

  return <form action={formAction} className="form-stack" key={state.revision} noValidate>
    {editing && <>
      <input type="hidden" name="eventId" value={editing.eventId} />
      {/* The version the form was rendered from. A second officer who saved in
          the meantime makes this stale, and the database refuses rather than
          letting one edit quietly erase the other. */}
      <input type="hidden" name="expectedVersion" value={editing.version} />
    </>}
    <input type="hidden" name="clubId" value={clubId} />
    {/* Carried so the redirect after creating a draft returns to the
        management view; the member view hides drafts. */}
    <input type="hidden" name="mode" value="management" />
    {state.status === "error" && <div className="notice notice-error form-error-summary" role="alert" aria-label="建立活動錯誤" tabIndex={-1} ref={errorSummaryRef}>
      <strong>{state.formError}</strong>
      {Object.keys(state.fieldErrors).length > 0 && <ul>
        {EVENT_CREATE_FIELDS.map((field) => {
          const error = state.fieldErrors[field];
          return error ? <li key={field}><a href={`#event-create-${field}`}>{fieldLabels[field]}：{error}</a></li> : null;
        })}
      </ul>}
    </div>}
    <div className="form-grid">
      <label className="field" htmlFor="event-create-eventType"><span className="label">活動類型</span>
        <select
          className="input"
          id="event-create-eventType"
          name="eventType"
          defaultValue={values.eventType}
          aria-invalid={Boolean(errorFor("eventType"))}
          aria-describedby={describedBy("eventType")}
          required
        >
          {Object.entries(eventTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {errorFor("eventType") && <span className="field-error" id="event-create-eventType-error">{errorFor("eventType")}</span>}
      </label>
      <label className="field" htmlFor="event-create-title"><span className="label">活動名稱</span>
        <input className="input" id="event-create-title" name="title" maxLength={160} required defaultValue={values.title} aria-invalid={Boolean(errorFor("title"))} aria-describedby={describedBy("title")} />
        {errorFor("title") && <span className="field-error" id="event-create-title-error">{errorFor("title")}</span>}
      </label>
      <label className="field" htmlFor="event-create-startsAt"><span className="label">開始時間（台北）</span>
        <input className="input" id="event-create-startsAt" type="datetime-local" name="startsAt" required defaultValue={values.startsAt} aria-invalid={Boolean(errorFor("startsAt"))} aria-describedby={describedBy("startsAt")} />
        {errorFor("startsAt") && <span className="field-error" id="event-create-startsAt-error">{errorFor("startsAt")}</span>}
      </label>
      <label className="field" htmlFor="event-create-endsAt"><span className="label">結束時間（台北）</span>
        <input className="input" id="event-create-endsAt" type="datetime-local" name="endsAt" required defaultValue={values.endsAt} aria-invalid={Boolean(errorFor("endsAt"))} aria-describedby={describedBy("endsAt")} />
        {errorFor("endsAt") && <span className="field-error" id="event-create-endsAt-error">{errorFor("endsAt")}</span>}
      </label>
      <label className="field" htmlFor="event-create-registrationDeadline"><span className="label">報名截止（台北）</span>
        <input className="input" id="event-create-registrationDeadline" type="datetime-local" name="registrationDeadline" required defaultValue={values.registrationDeadline} aria-invalid={Boolean(errorFor("registrationDeadline"))} aria-describedby={describedBy("registrationDeadline")} />
        {errorFor("registrationDeadline") && <span className="field-error" id="event-create-registrationDeadline-error">{errorFor("registrationDeadline")}</span>}
      </label>
      <label className="field" htmlFor="event-create-capacity"><span className="label">名額（留空表示不限）</span>
        <input className="input" id="event-create-capacity" type="number" name="capacity" min={1} max={10000} inputMode="numeric" defaultValue={values.capacity} aria-invalid={Boolean(errorFor("capacity"))} aria-describedby={describedBy("capacity")} />
        {errorFor("capacity") && <span className="field-error" id="event-create-capacity-error">{errorFor("capacity")}</span>}
      </label>
      <label className="field" htmlFor="event-create-location"><span className="label">地點</span>
        <input className="input" id="event-create-location" name="location" maxLength={300} defaultValue={values.location} aria-invalid={Boolean(errorFor("location"))} aria-describedby={describedBy("location")} />
        {errorFor("location") && <span className="field-error" id="event-create-location-error">{errorFor("location")}</span>}
      </label>
      <label className="field" htmlFor="event-create-venueLocation"><span className="label">定位簽到座標（選填）</span>
        <input className="input" id="event-create-venueLocation" name="venueLocation" maxLength={2048} inputMode="text" placeholder="貼上地圖連結，或 25.033964, 121.564468" defaultValue={values.venueLocation} aria-invalid={Boolean(errorFor("venueLocation"))} aria-describedby={errorFor("venueLocation") ? "event-create-venueLocation-error" : "event-create-venueLocation-hint"} />
        <span className="hint" id="event-create-venueLocation-hint">填了之後，社員到現場可以直接用手機定位簽到（{"場地 200 公尺內"}），不必掃 QR。留空則此活動只能用 QR 簽到。</span>
        {errorFor("venueLocation") && <span className="field-error" id="event-create-venueLocation-error">{errorFor("venueLocation")}</span>}
      </label>
      <VenueAddressLookup clubId={clubId} onFound={applyVenueCoordinates} />
      {/* Disabled rather than merely ignored when the event is addressed to
          particular people: a targeted event is not a 例會, so counting it
          would put an absence on the record of everyone who was never asked.
          The action forces the same thing server-side. */}
      <label className="checkbox-row" htmlFor="event-create-countsForAttendance">
        <input id="event-create-countsForAttendance" type="checkbox" name="countsForAttendance" defaultChecked={values.countsForAttendance} disabled={targeted} aria-invalid={Boolean(errorFor("countsForAttendance"))} aria-describedby={describedBy("countsForAttendance")} />
        <span><strong>計入出席</strong><br /><span className="hint">{targeted
          ? "已指定發送對象，因此不是例會，不會計入出席率。"
          : "已發布且計入出席的活動可在活動前後 24 小時內開啟短效簽到 token。"}</span></span>
        {errorFor("countsForAttendance") && <span className="field-error" id="event-create-countsForAttendance-error">{errorFor("countsForAttendance")}</span>}
      </label>
    </div>
    <fieldset className="field">
      <legend className="label">發送對象</legend>
      <AudiencePicker
        clubId={clubId}
        tags={tags}
        members={members}
        initial={initialAudience}
        onSelectionChange={handleAudienceChange}
      />
    </fieldset>
    <label className="field" htmlFor="event-create-description"><span className="label">活動說明</span>
      <textarea className="input" id="event-create-description" name="description" maxLength={5000} rows={4} defaultValue={values.description} aria-invalid={Boolean(errorFor("description"))} aria-describedby={describedBy("description")} />
      {errorFor("description") && <span className="field-error" id="event-create-description-error">{errorFor("description")}</span>}
    </label>
    <div className="form-actions"><button className="button" type="submit" disabled={pending}>{pending ? "建立中…" : "建立草稿"}</button></div>
  </form>;
}

function VenueAddressLookup({
  clubId,
  onFound,
}: {
  clubId: string;
  onFound: (latitude: number, longitude: number) => void;
}) {
  const [state, setState] = useState<VenueGeocodeState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Calls the action directly rather than sitting in a form of its own: this
  // control lives inside the event form, and a nested form is invalid HTML.
  const lookup = useCallback(() => {
    const address = inputRef.current?.value.trim() ?? "";
    const payload = new FormData();
    payload.set("clubId", clubId);
    payload.set("venueAddress", address);
    startTransition(async () => {
      const next = await geocodeVenueAddressAction({ status: "idle" }, payload);
      setState(next);
      if (next.status === "found") onFound(next.latitude, next.longitude);
    });
  }, [clubId, onFound]);

  return <div className="field">
    <span className="label">用地址查座標（選填）</span>
    <div className="inline-form">
      <input
        className="input"
        id="event-create-venueAddress"
        ref={inputRef}
        maxLength={300}
        placeholder="例如：新北市板橋區文化路一段 1 號"
        aria-describedby="event-create-venueAddress-hint"
        onKeyDown={(pressed) => {
          // Enter here means "look this up", not "create the event".
          if (pressed.key !== "Enter") return;
          pressed.preventDefault();
          lookup();
        }}
      />
      <button className="button button-secondary" type="button" onClick={lookup} disabled={pending}>
        {pending ? "查詢中…" : "查座標"}
      </button>
    </div>
    <span className="hint" id="event-create-venueAddress-hint">
      查到之後會自動填進上面的座標欄位，您仍然可以手動修改。
    </span>
    {state.status === "found" && <span className="hint">
      已填入 {state.latitude}, {state.longitude}
      {state.formattedAddress ? `（${state.formattedAddress}）` : ""}
    </span>}
    {state.status === "error" && <span className="field-error">{state.message}</span>}
  </div>;
}
