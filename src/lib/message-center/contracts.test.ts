import { describe, expect, it } from "vitest";
import { parseClubMessage } from "./contracts";

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
