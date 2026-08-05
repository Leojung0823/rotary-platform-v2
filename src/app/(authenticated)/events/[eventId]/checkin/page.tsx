import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckinCameraScanner } from "@/components/events/checkin-camera-scanner";
import { GpsCheckinButton } from "@/components/events/gps-checkin-button";
import { Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { formatDateTime, formatTime } from "@/lib/member-experience";
import { createClient } from "@/lib/supabase/server";

type CheckinState = {
  event_id: string;
  title: string;
  location: string;
  starts_at: string;
  ends_at: string;
  event_status: string;
  configured: boolean;
  window_open: boolean;
  gps_enabled: boolean;
  qr_enabled: boolean;
  qr_session_open: boolean;
  checked_in: boolean;
  attendance_id: string | null;
  checkin_method: string | null;
  checked_in_at: string | null;
};

function isCheckinState(value: unknown): value is CheckinState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  return typeof state.event_id === "string" && typeof state.title === "string"
    && typeof state.starts_at === "string" && typeof state.window_open === "boolean"
    && typeof state.gps_enabled === "boolean" && typeof state.qr_enabled === "boolean"
    && typeof state.checked_in === "boolean";
}

export default async function MemberEventCheckinPage({ params }: { params: Promise<{ eventId: string }> }) {
  await requireIdentity();
  const { eventId } = await params;
  const supabase = await createClient();
  const result = await supabase.rpc("get_my_event_checkin_state", { p_event_id: eventId });
  if (result.error || !isCheckinState(result.data)) notFound();
  const state = result.data;

  return <div className="page-stack narrow">
    <Link className="back-link" href={`/events/${state.event_id}`}>← 返回活動</Link>
    <header className="page-header"><div><h1>我要簽到</h1><h2>{state.title}</h2><p>{formatDateTime(state.starts_at, true)}{state.location ? `｜${state.location}` : ""}</p></div></header>

    {state.checked_in ? <section className="success-result" role="status" aria-live="polite">
      <span className="success-check" aria-hidden="true">✓</span><h1>簽到成功</h1><p>{state.title}</p><p>{state.checked_in_at ? `${formatTime(state.checked_in_at)} 已完成簽到` : "您已完成簽到"}</p>
      <Link className="button" href={`/events/${state.event_id}`}>返回活動</Link>
    </section> : <>
      {!state.configured && <Notice>這場活動目前尚未開放簽到，請稍後再試或洽現場工作人員。</Notice>}
      {state.configured && !state.window_open && <Notice>目前不在活動簽到時間內。請在活動開始後再試，或洽現場工作人員。</Notice>}
      {state.configured && state.window_open && <div className="checkin-methods">
        {state.gps_enabled && <GpsCheckinButton eventId={state.event_id} />}
        {state.qr_enabled && state.qr_session_open && <CheckinCameraScanner expectedEventId={state.event_id} />}
        {state.qr_enabled && !state.qr_session_open && <Notice>現場 QR Code 簽到尚未開始。請等待工作人員開放，或使用其他已開放的簽到方式。</Notice>}
      </div>}
      <aside className="help-card"><h2>無法使用手機完成？</h2><p>請直接告知現場工作人員姓名，由具備權限的人員核對身分後人工補登。您不需要輸入任何簽到碼。</p></aside>
    </>}
  </div>;
}
