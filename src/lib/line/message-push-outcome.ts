/**
 * Shared between the server action that performs the push and the client
 * component that reports it, so the outcome type does not have to be imported
 * out of a server-only module into the browser bundle.
 */
export type MessagePushOutcome =
  | { status: "sent"; recipientCount: number }
  | { status: "skipped"; reason: "flag_disabled" | "oa_not_configured" | "no_reachable_recipients" }
  | { status: "failed"; reason: string };

/**
 * What to add after "訊息已送出". An officer who is not told the push failed
 * would assume every member saw it on their phone, so a failure is always
 * stated; a disabled feature is not, because there is nothing to act on.
 */
export function describeMessagePushOutcome(outcome?: MessagePushOutcome): string {
  if (!outcome) return "";
  if (outcome.status === "sent") {
    return `已同時推播 LINE 給 ${outcome.recipientCount} 位社員。`;
  }
  if (outcome.status === "skipped") {
    switch (outcome.reason) {
      case "flag_disabled":
        return "";
      case "oa_not_configured":
        return "本社尚未設定 LINE 官方帳號，這則訊息沒有推播 LINE。";
      case "no_reachable_recipients":
        return "收件人中沒有人加入官方帳號並開啟通知，這則訊息沒有推播 LINE。";
    }
  }
  return "LINE 推播沒有成功，訊息仍在訊息中心；請到 LINE OA 的推播紀錄確認後再決定是否重送。";
}
