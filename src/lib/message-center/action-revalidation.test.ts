import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
}

describe("message centre action revalidation", () => {
  const actions = source("src/app/message-center-actions.ts");
  const component = source("src/components/message-center/message-center.tsx");
  const eventActions = source("src/app/event-actions.ts");

  it("does not revalidate the route the client component is holding state for", () => {
    // The component awaits these actions and updates its own state. A
    // revalidatePath here re-renders the Server Component and discards that
    // update, so a sent or withdrawn message flickers back.
    // Matched as an import and a call, not as a bare word: the comment above
    // the actions names it deliberately, to say why it is absent.
    expect(actions).not.toContain('from "next/cache"');
    expect(actions).not.toContain("revalidatePath(");
    expect(component).toContain('"use client"');
    expect(component).toContain("await withdrawClubMessageAction(");
    expect(component).toContain("useState");
  });

  it("leaves form-submitted actions revalidating as before", () => {
    // This is not a rule against revalidatePath. Actions reached through
    // <form action={...}> do want the server round trip.
    expect(eventActions).toContain("revalidatePath");
  });

  it("still returns the durable row so the client can render it", () => {
    // Dropping revalidation is only safe because the action hands back the
    // parsed message, and the next navigation re-reads Supabase.
    expect(actions).toContain("return { ok: true, message };");
    expect(actions).toContain("parseClubMessage(");
  });
});
