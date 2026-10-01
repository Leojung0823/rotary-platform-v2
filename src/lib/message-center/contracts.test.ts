import { describe, expect, it } from "vitest";
import {
  parseClubMessage,
  parseClubMessageInbox,
  parseClubMessageLifecycleList,
} from "./contracts";

const baseMessage = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "提醒",
  body: "請查看",
  audience_kind: "members",
  published_at: "2026-08-24T00:00:00.000Z",
  author_display_name: "幹部",
  read_at: null,
};

describe("message action path contract", () => {
  it("keeps old messages compatible and accepts an in-app destination", () => {
    expect(parseClubMessage(baseMessage).action_path).toBeNull();
    expect(parseClubMessage(baseMessage).action_status).toBeNull();
    expect(parseClubMessage({ ...baseMessage, action_path: "/birthday-collection?clubId=11111111-1111-4111-8111-111111111111" }).action_path)
      .toBe("/birthday-collection?clubId=11111111-1111-4111-8111-111111111111");
    expect(parseClubMessage({ ...baseMessage, action_status: "needs_resubmission" }).action_status)
      .toBe("needs_resubmission");
  });

  it("rejects external, protocol-relative, and malformed destinations", () => {
    for (const actionPath of [
      "https://evil.example",
      "//evil.example/path",
      "/birthday-collection#unsafe",
      "/birthday collection",
      "/birthday-collection:javascript",
    ]) {
      expect(() => parseClubMessage({ ...baseMessage, action_path: actionPath })).toThrow("invalid_message_projection");
    }
  });

  it("rejects an unknown per-recipient action status", () => {
    expect(() => parseClubMessage({ ...baseMessage, action_status: "done" })).toThrow("invalid_message_projection");
  });
});

describe("announcement V0.9 projections", () => {
  it("keeps the pinned member projection separate from the chronological inbox", () => {
    const inbox = parseClubMessageInbox({
      messages: [baseMessage],
      pinned_messages: [{ ...baseMessage, id: "22222222-2222-4222-8222-222222222222" }],
      unread_count: 2,
      next_cursor: null,
    });
    expect(inbox.messages).toHaveLength(1);
    expect(inbox.pinnedMessages).toHaveLength(1);
    expect(inbox.unreadCount).toBe(2);
    expect(parseClubMessageInbox({ messages: [], unread_count: 0 }).pinnedMessages).toEqual([]);
  });

  it("parses lifecycle states and preserves the editable audience snapshot", () => {
    const [message] = parseClubMessageLifecycleList({ messages: [{
      id: "33333333-3333-4333-8333-333333333333",
      title: "草稿",
      body: "內容",
      status: "draft",
      audience_kind: "tags",
      scheduled_at: null,
      published_at: null,
      expires_at: null,
      pinned_at: null,
      created_at: "2026-10-02T00:00:00.000Z",
      updated_at: "2026-10-02T00:00:00.000Z",
      recipient_count: 4,
      read_count: 0,
      audience_tag_ids: ["44444444-4444-4444-8444-444444444444"],
      audience_membership_ids: [],
      audience_tag_names: ["理事會"],
    }] });
    expect(message.status).toBe("draft");
    expect(message.audience_tag_ids).toHaveLength(1);
    expect(message.audience_tag_names).toEqual(["理事會"]);
  });

  it("rejects unknown lifecycle states and malformed audience projections", () => {
    const valid = {
      id: "33333333-3333-4333-8333-333333333333",
      title: "草稿",
      body: "內容",
      status: "draft",
      audience_kind: "everyone",
      scheduled_at: null,
      published_at: null,
      expires_at: null,
      pinned_at: null,
      created_at: "2026-10-02T00:00:00.000Z",
      updated_at: "2026-10-02T00:00:00.000Z",
      recipient_count: 0,
      read_count: 0,
      audience_tag_ids: [],
      audience_membership_ids: [],
      audience_tag_names: [],
    };
    expect(() => parseClubMessageLifecycleList({ messages: [{ ...valid, status: "unknown" }] })).toThrow();
    expect(() => parseClubMessageLifecycleList({ messages: [{ ...valid, audience_membership_ids: "all" }] })).toThrow();
  });
});
