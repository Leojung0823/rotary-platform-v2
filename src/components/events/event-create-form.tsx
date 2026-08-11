"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createEventAction } from "@/app/event-actions";
import {
  EVENT_CREATE_FIELDS,
  initialEventCreateActionState,
  initialEventCreateFormValues,
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
  countsForAttendance: "計入出席",
  description: "活動說明",
};

type EventCreateFormProps = {
  clubId: string;
  eventTypeLabels: Record<string, string>;
};

export function EventCreateForm({ clubId, eventTypeLabels }: EventCreateFormProps) {
  const [state, formAction, pending] = useActionState(createEventAction, initialEventCreateActionState);
  const [values, setValues] = useState<EventCreateFormValues>(initialEventCreateFormValues);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

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

  return <form action={formAction} className="form-stack" noValidate>
    <input type="hidden" name="clubId" value={clubId} />
    {state.status === "error" && <div className="notice notice-error form-error-summary" role="alert" tabIndex={-1} ref={errorSummaryRef}>
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
          value={values.eventType}
          onChange={(event) => setValues((current) => ({ ...current, eventType: event.target.value }))}
          aria-invalid={Boolean(errorFor("eventType"))}
          aria-describedby={describedBy("eventType")}
          required
        >
          {Object.entries(eventTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {errorFor("eventType") && <span className="field-error" id="event-create-eventType-error">{errorFor("eventType")}</span>}
      </label>
      <label className="field" htmlFor="event-create-title"><span className="label">活動名稱</span>
        <input className="input" id="event-create-title" name="title" maxLength={160} required value={values.title} onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))} aria-invalid={Boolean(errorFor("title"))} aria-describedby={describedBy("title")} />
        {errorFor("title") && <span className="field-error" id="event-create-title-error">{errorFor("title")}</span>}
      </label>
      <label className="field" htmlFor="event-create-startsAt"><span className="label">開始時間（台北）</span>
        <input className="input" id="event-create-startsAt" type="datetime-local" name="startsAt" required value={values.startsAt} onChange={(event) => setValues((current) => ({ ...current, startsAt: event.target.value }))} aria-invalid={Boolean(errorFor("startsAt"))} aria-describedby={describedBy("startsAt")} />
        {errorFor("startsAt") && <span className="field-error" id="event-create-startsAt-error">{errorFor("startsAt")}</span>}
      </label>
      <label className="field" htmlFor="event-create-endsAt"><span className="label">結束時間（台北）</span>
        <input className="input" id="event-create-endsAt" type="datetime-local" name="endsAt" required value={values.endsAt} onChange={(event) => setValues((current) => ({ ...current, endsAt: event.target.value }))} aria-invalid={Boolean(errorFor("endsAt"))} aria-describedby={describedBy("endsAt")} />
        {errorFor("endsAt") && <span className="field-error" id="event-create-endsAt-error">{errorFor("endsAt")}</span>}
      </label>
      <label className="field" htmlFor="event-create-registrationDeadline"><span className="label">報名截止（台北）</span>
        <input className="input" id="event-create-registrationDeadline" type="datetime-local" name="registrationDeadline" required value={values.registrationDeadline} onChange={(event) => setValues((current) => ({ ...current, registrationDeadline: event.target.value }))} aria-invalid={Boolean(errorFor("registrationDeadline"))} aria-describedby={describedBy("registrationDeadline")} />
        {errorFor("registrationDeadline") && <span className="field-error" id="event-create-registrationDeadline-error">{errorFor("registrationDeadline")}</span>}
      </label>
      <label className="field" htmlFor="event-create-capacity"><span className="label">名額（留空表示不限）</span>
        <input className="input" id="event-create-capacity" type="number" name="capacity" min={1} max={10000} inputMode="numeric" value={values.capacity} onChange={(event) => setValues((current) => ({ ...current, capacity: event.target.value }))} aria-invalid={Boolean(errorFor("capacity"))} aria-describedby={describedBy("capacity")} />
        {errorFor("capacity") && <span className="field-error" id="event-create-capacity-error">{errorFor("capacity")}</span>}
      </label>
      <label className="field" htmlFor="event-create-location"><span className="label">地點</span>
        <input className="input" id="event-create-location" name="location" maxLength={300} value={values.location} onChange={(event) => setValues((current) => ({ ...current, location: event.target.value }))} aria-invalid={Boolean(errorFor("location"))} aria-describedby={describedBy("location")} />
        {errorFor("location") && <span className="field-error" id="event-create-location-error">{errorFor("location")}</span>}
      </label>
      <label className="checkbox-row" htmlFor="event-create-countsForAttendance">
        <input id="event-create-countsForAttendance" type="checkbox" name="countsForAttendance" checked={values.countsForAttendance} onChange={(event) => setValues((current) => ({ ...current, countsForAttendance: event.target.checked }))} aria-invalid={Boolean(errorFor("countsForAttendance"))} aria-describedby={describedBy("countsForAttendance")} />
        <span><strong>計入出席</strong><br /><span className="hint">已發布且計入出席的活動可在活動前後 24 小時內開啟短效簽到 token。</span></span>
        {errorFor("countsForAttendance") && <span className="field-error" id="event-create-countsForAttendance-error">{errorFor("countsForAttendance")}</span>}
      </label>
    </div>
    <label className="field" htmlFor="event-create-description"><span className="label">活動說明</span>
      <textarea className="input" id="event-create-description" name="description" maxLength={5000} rows={4} value={values.description} onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))} aria-invalid={Boolean(errorFor("description"))} aria-describedby={describedBy("description")} />
      {errorFor("description") && <span className="field-error" id="event-create-description-error">{errorFor("description")}</span>}
    </label>
    <div className="form-actions"><button className="button" type="submit" disabled={pending}>{pending ? "建立中…" : "建立草稿"}</button></div>
  </form>;
}
