import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("message centre LINE push boundary", () => {
  it("never turns a failed push into a failed send", () => {
    const action = source("src/app/message-center-actions.ts");
    // The message row is committed before the push runs. An officer told the
    // send failed would send again, and a LINE message cannot be withdrawn.
    const start = action.indexOf("export async function sendClubMessageAction");
    const next = action.indexOf("export async function", start + 1);
    const sendBlock = action.slice(start, next === -1 ? undefined : next);
    const pushIndex = sendBlock.indexOf("pushClubMessageToLine");
    expect(pushIndex).toBeGreaterThan(sendBlock.indexOf("create_club_message"));
    expect(sendBlock.slice(pushIndex)).not.toContain('ok: false');
    expect(sendBlock).toContain(".catch(");
  });

  it("keeps the server-only push module out of the browser bundle", () => {
    expect(source("src/lib/line/message-center-push.ts")).toContain('import "server-only"');
    const component = source("src/components/message-center/message-center.tsx");
    expect(component).not.toContain("message-center-push");
    expect(component).toContain("message-push-outcome");
  });

  it("resolves recipients in the database rather than reusing the follower list", () => {
    const push = source("src/lib/line/message-center-push.ts");
    // Pushing to `context.followers` would send a targeted announcement to
    // every follower of the account, including members it was not addressed to.
    expect(push).toContain("list_club_message_line_targets");
    expect(push).not.toMatch(/deliverClubOaText\(\s*"multicast",\s*dispatch\.context\.followers/u);
  });

  it("gates the push on the feature flag before touching the provider", () => {
    const push = source("src/lib/line/message-center-push.ts");
    const flagIndex = push.indexOf("line_oa_event_push_v1");
    expect(flagIndex).toBeGreaterThan(-1);
    expect(flagIndex).toBeLessThan(push.indexOf("loadClubOaDispatchContext("));
  });
});
