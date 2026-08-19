"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  closeDynamicCheckinAction,
  manualDynamicCheckinAction,
  revokeDynamicAttendanceAction,
  type CheckinReasonActionState,
  type ManualCheckinActionState,
} from "@/app/checkin-actions";
import type { CheckinSafeErrorCode } from "@/lib/checkin/dynamic";

const errorMessages: Record<CheckinSafeErrorCode, string> = {
  invalid_input: "請填寫完整且有效的資料。",
  forbidden: "目前帳號沒有管理此活動簽到的權限。",
  not_eligible: "此活動目前不能執行簽到操作。",
  window_closed: "目前不在活動前後 24 小時的簽到管理時間窗。",
  already_open: "簽到場次已存在。",
  not_open: "目前沒有可操作的簽到場次。",
  legacy_session_active: "目前仍使用舊版簽到場次。",
  invalid_token: "輸入內容無效。",
  expired: "此項操作已過期，請重新整理後再試。",
  session_closed: "簽到場次已關閉。",
  out_of_range: "定位不在活動場地範圍內。",
  venue_missing: "這個活動沒有設定場地座標，無法用定位簽到。",
  not_found: "找不到可操作的簽到紀錄。",
  temporary: "目前無法完成操作，請稍後再試；輸入內容已保留。",
};
const initialCheckinReasonActionState: CheckinReasonActionState = { status: "idle", revision: 0, value: "" };
const initialManualCheckinActionState: ManualCheckinActionState = { status: "idle", revision: 0, membershipId: "", reason: "" };

type Member = { membershipId: string; displayName: string };
type Attendance = { attendanceId: string; displayName: string };

function ErrorNotice({ code, id }: { code: CheckinSafeErrorCode; id: string }) {
  return <span className="field-error" id={id} role="alert">{errorMessages[code]}</span>;
}

export function DynamicCloseCheckinForm({ clubId, eventId }: { clubId: string; eventId: string }) {
  const [state, action, pending] = useActionState(closeDynamicCheckinAction, initialCheckinReasonActionState);
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === "success") router.refresh();
    if (state.status === "error") errorRef.current?.focus();
  }, [router, state]);
  const errorId = "dynamic-checkin-close-error";
  return <form action={action} className="inline-form" key={state.revision} noValidate>
    <input type="hidden" name="clubId" value={clubId} />
    <input type="hidden" name="eventId" value={eventId} />
    <label className="field" htmlFor="dynamic-checkin-close-reason"><span className="label">關閉原因</span>
      <input className="input" id="dynamic-checkin-close-reason" name="reason" maxLength={500} required defaultValue={state.value} aria-invalid={state.status === "error"} aria-describedby={state.status === "error" ? errorId : undefined} />
      {state.status === "error" && <ErrorNotice code={state.code} id={errorId} />}
    </label>
    <span className="hint">關閉後所有動態 QR 立即失效。</span>
    <button className="button button-danger" type="submit" disabled={pending}>{pending ? "關閉中…" : "關閉簽到"}</button>
    {state.status === "error" && <div className="sr-only" tabIndex={-1} ref={errorRef}>關閉簽到失敗，請修正原因後再試。</div>}
  </form>;
}

export function DynamicManualCheckinForm({
  clubId,
  eventId,
  members,
}: {
  clubId: string;
  eventId: string;
  members: readonly Member[];
}) {
  const [state, action, pending] = useActionState(manualDynamicCheckinAction, initialManualCheckinActionState);
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === "success") router.refresh();
    if (state.status === "error") errorRef.current?.focus();
  }, [router, state]);
  const errorId = "dynamic-checkin-manual-error";
  return <form action={action} className="inline-form" key={state.revision} noValidate>
    <input type="hidden" name="clubId" value={clubId} />
    <input type="hidden" name="eventId" value={eventId} />
    <label className="field" htmlFor="dynamic-checkin-membership"><span className="label">社員</span>
      <select className="input" id="dynamic-checkin-membership" name="membershipId" required defaultValue={state.membershipId} aria-invalid={state.status === "error"} aria-describedby={state.status === "error" ? errorId : undefined}>
        <option value="" disabled>選擇社員</option>
        {members.map((member) => <option key={member.membershipId} value={member.membershipId}>{member.displayName}</option>)}
      </select>
    </label>
    <label className="field" htmlFor="dynamic-checkin-manual-reason"><span className="label">補登原因</span>
      <input className="input" id="dynamic-checkin-manual-reason" name="reason" maxLength={500} required defaultValue={state.reason} aria-invalid={state.status === "error"} aria-describedby={state.status === "error" ? errorId : undefined} />
      {state.status === "error" && <ErrorNotice code={state.code} id={errorId} />}
    </label>
    <button className="button" type="submit" disabled={pending}>{pending ? "補登中…" : "人工補登"}</button>
    {state.status === "error" && <div className="sr-only" tabIndex={-1} ref={errorRef}>人工補登失敗，已保留社員與原因。</div>}
  </form>;
}

export function DynamicRevokeAttendanceForm({
  clubId,
  eventId,
  attendance,
}: {
  clubId: string;
  eventId: string;
  attendance: Attendance;
}) {
  const [state, action, pending] = useActionState(revokeDynamicAttendanceAction, initialCheckinReasonActionState);
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === "success") router.refresh();
    if (state.status === "error") errorRef.current?.focus();
  }, [router, state]);
  const errorId = `dynamic-checkin-revoke-${attendance.attendanceId}-error`;
  return <form action={action} className="inline-form" key={state.revision} noValidate>
    <input type="hidden" name="clubId" value={clubId} />
    <input type="hidden" name="eventId" value={eventId} />
    <input type="hidden" name="attendanceId" value={attendance.attendanceId} />
    <label className="field" htmlFor={`dynamic-checkin-revoke-${attendance.attendanceId}`}><span className="sr-only">撤銷 {attendance.displayName} 的原因</span>
      <input className="input" id={`dynamic-checkin-revoke-${attendance.attendanceId}`} name="reason" placeholder="撤銷原因" maxLength={500} required defaultValue={state.value} aria-invalid={state.status === "error"} aria-describedby={state.status === "error" ? errorId : undefined} />
      {state.status === "error" && <ErrorNotice code={state.code} id={errorId} />}
    </label>
    <button className="button button-danger" type="submit" disabled={pending}>{pending ? "撤銷中…" : "撤銷"}</button>
    {state.status === "error" && <div className="sr-only" tabIndex={-1} ref={errorRef}>撤銷簽到失敗，已保留原因。</div>}
  </form>;
}
