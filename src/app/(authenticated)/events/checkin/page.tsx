import Link from "next/link";
import { CheckinCameraScanner } from "@/components/events/checkin-camera-scanner";
import { requireIdentity } from "@/lib/auth";

export default async function MemberQrCheckinPage({ searchParams }: { searchParams: Promise<{ scan?: string }> }) {
  await requireIdentity();
  const query = await searchParams;
  return <div className="page-stack narrow">
    <Link className="back-link" href="/events">← 返回活動</Link>
    <header className="page-header"><div><h1>掃描簽到</h1><p>掃描現場顯示的 QR Code，確認活動資訊後完成簽到。</p></div></header>
    <CheckinCameraScanner loadCapturedCredential={query.scan === "1"} />
    <aside className="help-card"><h2>無法掃描？</h2><p>請洽現場工作人員核對身分並人工補登。平台不會要求您手動輸入長字串或無法辨識的代碼。</p></aside>
  </div>;
}
