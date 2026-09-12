import "server-only";
import { buildClubFlexMessage, type FlexTemplate } from "./flex-templates";
import { sendLineOaMessage, type LineDeliveryResult } from "./messaging";
import { buildPushLogArgs, type ClubOaDispatchContext } from "./oa-dispatch";

/** The caller must check oa.manage, the Flex flag and resolve the audience.
 * Reuses the already selected club credentials and the existing batch sender.
 */
export async function deliverClubOaFlex({
  kind,
  recipients,
  context,
  template,
  senderName,
  title,
  message,
}: {
  kind: "broadcast" | "multicast";
  recipients: string[];
  context: ClubOaDispatchContext;
  template: FlexTemplate;
  senderName: string;
  title: string;
  message: string;
}): Promise<LineDeliveryResult> {
  // Validate before entering the provider error handler: invalid input is not
  // a delivery attempt, and should be reported by the form action as such.
  const payload = buildClubFlexMessage({ template, clubName: senderName, title, message });
  try {
    return await sendLineOaMessage(kind, recipients, [payload], { accessToken: context.accessToken });
  } catch {
    return {
      status: "failed", failureCode: "provider_error",
      batchCount: 0, sentBatchCount: 0, deliveredRecipientCount: 0,
    };
  }
}

export function buildFlexPushLogArgs({
  clubId, kind, recipientCount, template, message, title, delivery,
}: {
  clubId: string;
  kind: "broadcast" | "multicast";
  recipientCount: number;
  template: FlexTemplate;
  message: string;
  title: string;
  delivery: LineDeliveryResult;
}) {
  const args = buildPushLogArgs(clubId, kind, recipientCount, message, delivery);
  return {
    ...args,
    p_payload_summary: {
      ...args.p_payload_summary,
      message_type: "flex",
      template_key: template,
      title_character_count: title.trim().length,
      character_count: message.trim().length,
    },
  };
}
