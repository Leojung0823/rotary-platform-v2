"use client";

import { useFormStatus } from "react-dom";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { registerEventAction, type EventRegistrationState } from "@/app/event-actions";

function ResponseButtons({ response, hasUnsavedChanges }: { response: string | null; hasUnsavedChanges: boolean }) {
  const { pending } = useFormStatus();
  const attending = response === "attending";
  const declined = response === "declined";
  return <div className="form-actions event-response-actions" aria-busy={pending}>
    <button className={declined ? "button" : "button button-secondary"} type="submit" name="response" value={declined && !hasUnsavedChanges ? "pending" : "declined"} data-response-choice="declined" disabled={pending} aria-pressed={declined} formNoValidate>
      不克參加
    </button>
    <button className={attending ? "button" : "button button-secondary"} type="submit" name="response" value={attending && !hasUnsavedChanges ? "pending" : "attending"} data-response-choice="attending" disabled={pending} aria-pressed={attending} formNoValidate>
      我要參加
    </button>
    {pending && <span role="status">正在儲存，請稍候。</span>}
  </div>;
}

const errors: Record<string, string> = {
  invalid_input: "請確認攜伴人數與備註格式，再試一次。",
  capacity_full: "活動名額已滿，這次報名沒有寫入。",
  registration_closed: "報名已截止，這次回覆沒有寫入。",
  forbidden: "目前帳號沒有報名此活動的權限。",
};

export function EventRegistrationForm({ clubId, eventId, response, guestCount, note }: {
  clubId: string; eventId: string; response: string | null; guestCount: number; note: string;
}) {
  const [currentResponse, setCurrentResponse] = useState(response);
  const [guests, setGuests] = useState(String(guestCount));
  const [currentNote, setCurrentNote] = useState(note);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState(async (previous: EventRegistrationState, data: FormData) => {
    const result = await registerEventAction(previous, data);
    if (result.status === "success") {
      setCurrentResponse(result.response);
      setGuests(String(result.guestCount));
      setHasUnsavedChanges(false);
    }
    return result;
  }, { status: "idle" } as EventRegistrationState);
  useEffect(() => {
    if (state.status !== "success") return;
    router.refresh();
  }, [state, router]);
  return <form action={action} className="form-stack">
    <input type="hidden" name="clubId" value={clubId} />
    <input type="hidden" name="eventId" value={eventId} />
    <div className="response-grid">
      <label className="field"><span className="label">備註（選填）</span>
        <input className="input" name="note" maxLength={500} value={currentNote} onChange={event => { setCurrentNote(event.target.value); setHasUnsavedChanges(true); }} disabled={pending} />
      </label>
      <label className="field"><span className="label">攜伴人數（選填）</span>
        <input className="input" type="number" name="guestCount" min={0} max={20} value={guests} onChange={event => { setGuests(event.target.value); setHasUnsavedChanges(true); }} inputMode="numeric" disabled={pending} />
      </label>
    </div>
    <p className="hint">點選按鈕即儲存回覆。再點一次已選項目可取消回覆；如果先修改備註或攜伴人數，再點目前選項會儲存變更。</p>
    <ResponseButtons response={currentResponse} hasUnsavedChanges={hasUnsavedChanges} />
    {!pending && state.status === "error" && <p role="alert">{errors[state.errorCode] ?? "目前無法完成操作，請稍後再試。"}</p>}
    {!pending && state.status === "success" && <p role="status">報名狀態已更新。</p>}
  </form>;
}
