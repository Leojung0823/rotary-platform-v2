import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../../supabase/migrations/20261002000100_club_message_scheduling_v09.sql", import.meta.url), "utf8");
const route = readFileSync(new URL("../../app/api/internal/message-center/scheduler/route.ts", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../../../.github/workflows/message-center-scheduler.yml", import.meta.url), "utf8");
const actions = readFileSync(new URL("../../app/message-center-actions.ts", import.meta.url), "utf8");

describe("announcement V0.9 trust boundaries", () => {
  it("keeps the queue and audit tables closed and the audit append-only", () => {
    for (const table of ["club_message_scheduled_jobs", "club_message_audit_events"]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`revoke all on table public.${table} from public, anon, authenticated, service_role`);
    }
    expect(migration).toContain("club_message_audit_events_no_update");
    expect(migration).toContain("club_message_audit_append_only");
  });

  it("keeps scheduled publication server-only and rechecks the existing flag", () => {
    expect(migration).toContain("grant execute on function public.run_club_message_scheduler(timestamptz, integer) to service_role");
    expect(migration).toContain("revoke all on function public.run_club_message_scheduler(timestamptz, integer) from public, anon, authenticated");
    expect(route).toContain("hasValidMessageCenterSchedulerSecret");
    expect(route).toContain('process.env.APP_ENV !== "staging"');
    expect(route).toContain('"is_club_message_scheduler_enabled"');
    expect(route).toContain('"run_club_message_scheduler"');
    expect(workflow).toContain("environment:\n      name: message-center-scheduler");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).not.toContain("production");
  });

  it("does not send a scheduled announcement through LINE or Email", () => {
    const scheduleAction = actions.split("export async function saveClubMessageDraftAction")[1]?.split("async function manageLifecycleMessage")[0] ?? "";
    expect(scheduleAction).toContain('"schedule_club_message"');
    expect(scheduleAction).toContain('"publish_club_message_draft_now"');
    expect(scheduleAction).not.toContain("pushClubMessageToLine(");
    expect(migration).not.toContain("send_email");
    expect(migration).not.toContain("line_push");
  });
});
