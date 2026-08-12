import Link from "next/link";
import { selfCheckinAction } from "@/app/checkin-actions";
import { CheckinCameraScanner } from "@/components/events/checkin-camera-scanner";
import { DynamicCheckinCameraScanner } from "@/components/events/dynamic-checkin-camera-scanner";
import { requireIdentity } from "@/lib/auth";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";

const successMessages: Record<string, string> = {
  checked_in: "簽到成功，系統已記錄您的社員社籍與簽到時間。",
  already_checked_in: "您已完成此活動簽到，重複掃描或輸入不會建立第二筆紀錄。",
};

const errorMessages: Record<string, string> = {
  invalid_token: "簽到 QR／token 無效、已到期或已被旋轉。請向現場管理者取得最新 QR。",
  forbidden: "目前帳號不是該社有效社員，無法使用此簽到 QR。",
  not_eligible: "活動目前不能簽到。",
  unexpected: "目前無法完成簽到，請稍後再試。",
};

export default async function EventCheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const params = await searchParams;
  const identity = await requireIdentity();
  const checkinV2 = await evaluateCurrentFeatureFlag({ key: "checkin_qr_v2", subjectUuid: identity.id });
  return <div className="page-stack narrow">
    <header className="page-header">
      <div>
        <p className="eyebrow">活動現場</p>
        <h1>社員簽到</h1>
        <p>{checkinV2.enabled
          ? "掃描現場動態 QR。系統只會為目前登入帳號所對應的同社有效社員社籍簽到。"
          : "掃描現場 QR，或手動輸入 64 字元 token。系統只會為目前登入帳號所對應的同社有效社員社籍簽到。"}</p>
      </div>
      <Link className="button button-secondary" href="/events">返回活動</Link>
    </header>

    {params.success && successMessages[params.success] && <div className="notice notice-success" role="status">
      {successMessages[params.success]}
    </div>}
    {params.error && <div className="notice notice-error" role="alert">
      {errorMessages[params.error] ?? errorMessages.unexpected}
    </div>}

    {checkinV2.enabled ? <DynamicCheckinCameraScanner /> : <CheckinCameraScanner />}

    {!checkinV2.enabled && <section className="card">
      <div className="section-heading">
        <div><p className="eyebrow">備用方式</p><h2>手動輸入簽到 token</h2></div>
      </div>
      <form action={selfCheckinAction} className="form-stack">
        <label className="field">
          <span className="label">簽到 token</span>
          <textarea
            className="input token-value"
            name="token"
            rows={4}
            minLength={64}
            maxLength={64}
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            required
          />
        </label>
        <div className="notice notice-info">
          token 會在短時間內到期，管理者旋轉 token 後舊值會立即失效。請勿將 QR 或 token 貼到公開社群。
        </div>
        <div className="form-actions"><button className="button" type="submit">完成本人簽到</button></div>
      </form>
    </section>}
  </div>;
}
