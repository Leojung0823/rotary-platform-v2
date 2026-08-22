import type { NextRequest } from "next/server";
import { parseMessageDeliveries } from "@/lib/message-center/contracts";
import {
  authenticatedMessageClient,
  messageFailure,
  messageRpcFailure,
  messageSuccess,
} from "@/lib/message-center/http";
import { parseMessageClubId, parseMessageId } from "@/lib/message-center/validation";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { client, user } = await authenticatedMessageClient();
  if (!user) return messageFailure(401);

  try {
    const clubId = parseMessageClubId(request.nextUrl.searchParams.get("club_id"));
    const messageId = parseMessageId((await params).messageId);
    const { data, error } = await client.rpc("list_club_message_deliveries", {
      p_club_id: clubId,
      p_message_id: messageId,
    });
    if (error) return messageRpcFailure(error);
    return messageSuccess(parseMessageDeliveries(data));
  } catch {
    return messageFailure(400);
  }
}
