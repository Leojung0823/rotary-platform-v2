// Reads only. Sending, marking read and withdrawing are server actions in
// `src/app/message-center-actions.ts`.
import type { NextRequest } from "next/server";
import { parseClubMessageInbox } from "@/lib/message-center/contracts";
import {
  authenticatedMessageClient,
  messageFailure,
  messageRpcFailure,
  messageSuccess,
} from "@/lib/message-center/http";
import {
  decodeMessageCursor,
  encodeMessageCursor,
  parseMessageClubId,
  parseMessageLimit,
} from "@/lib/message-center/validation";

export async function GET(request: NextRequest) {
  const { client, user } = await authenticatedMessageClient();
  if (!user) return messageFailure(401);

  try {
    const clubId = parseMessageClubId(request.nextUrl.searchParams.get("club_id"));
    const limit = parseMessageLimit(request.nextUrl.searchParams.get("limit"));
    const cursor = decodeMessageCursor(request.nextUrl.searchParams.get("cursor"));
    const { data, error } = await client.rpc("list_my_club_messages", {
      p_club_id: clubId,
      p_cursor_published_at: cursor?.timestamp ?? null,
      p_cursor_id: cursor?.id ?? null,
      p_limit: limit,
    });
    if (error) return messageRpcFailure(error);

    const inbox = parseClubMessageInbox(data);
    return messageSuccess({
      messages: inbox.messages,
      unread_count: inbox.unreadCount,
      next_cursor: encodeMessageCursor(inbox.nextCursorPayload),
    });
  } catch {
    return messageFailure(400);
  }
}
