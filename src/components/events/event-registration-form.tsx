"use client";

import { useFormStatus } from "react-dom";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { registerEventAction, type EventRegistrationState } from "@/app/event-actions";

function ResponseButtons({ response }: { response: string | null }) {
  const { pending } = useFormStatus();
  return <div className="form-actions" aria-busy={pending}>
    <button className="button" type="submit" name="response" value="attending" disabled={pending} aria-pressed={response === "attending"}>
      {pending ? "儲存中…" : response === "attending" ? "已報名・更新資料" : "我要參加"}
    </button>
    <button className="button button-secondary" type="submit" name="response" value="declined" formNoValidate disabled={pending} aria-pressed={response === "declined"}>
      {response === "declined" ? "已回覆不參加" : "不克參加"}
    </button>
    {response && response !== "pending" && <button className="button button-secondary" type="submit" name="response" value="pending" formNoValidate disabled={pending}>改為待確認</button>}
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
  const router = useRouter();
  const [state, action, pending] = useActionState(async (previous: EventRegistrationState, data: FormData) => {
    const result = await registerEventAction(previous, data);
    if (result.status === "success") {
      setCurrentResponse(result.response);
      setGuests(String(result.guestCount));
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
        <input className="input" name="note" maxLength={500} value={currentNote} onChange={event => setCurrentNote(event.target.value)} disabled={pending} />
      </label>
      <label className="field"><span className="label">攜伴人數（選填）</span>
        <input className="input" type="number" name="guestCount" min={0} max={20} value={guests} onChange={event => setGuests(event.target.value)} inputMode="numeric" disabled={pending} />
      </label>
    </div>
    <p className="hint">點選按鈕即儲存回覆；要更新攜伴人數或備註，修改後再點一次參加按鈕即可。</p>
    <ResponseButtons response={currentResponse} />
    {!pending && state.status === "error" && <p role="alert">{errors[state.errorCode] ?? "目前無法完成操作，請稍後再試。"}</p>}
    {!pending && state.status === "success" && <p role="status">報名狀態已更新。</p>}
  </form>;
}
