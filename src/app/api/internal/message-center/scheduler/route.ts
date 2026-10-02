import { NextResponse, type NextRequest } from "next/server";
import { hasValidMessageCenterSchedulerSecret } from "@/lib/message-center/scheduler-auth";
import { createTrustedAdminClient } from "@/lib/supabase/admin";
import { pushJoyIouDeadlineReminders } from "@/lib/line/joy-iou-deadline-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function responseBody(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "cache-control": "no-store, max-age=0",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export async function POST(request: NextRequest) {
  if (!hasValidMessageCenterSchedulerSecret(request.headers.get("authorization"))) {
    return responseBody({ ok: false, reason: "unauthorized" }, 401);
  }

  // V0.9 is explicitly a staging rollout. Production scheduling requires a
  // separate product/release decision, even if the shared flag is enabled.
  if (process.env.APP_ENV !== "staging") {
    return responseBody({ ok: false, reason: "scheduler_unavailable" }, 503);
  }

  try {
    const admin = createTrustedAdminClient();
    const flag = await admin.rpc("is_club_message_scheduler_enabled", {
      p_environment: "staging",
    });
    if (flag.error) return responseBody({ ok: false, reason: "scheduler_unavailable" }, 503);
    let announcements: Record<string, unknown> = {
      status: "skipped",
      reason: "announcements_disabled",
    };
    if (flag.data === true) {
      const result = await admin.rpc("run_club_message_scheduler", {
        p_as_of: new Date().toISOString(),
        p_limit: 50,
      });
      if (result.error) return responseBody({ ok: false, reason: "scheduler_failed" }, 503);
      announcements = { status: "completed", result: result.data };
    }

    const joyIouReminders = await pushJoyIouDeadlineReminders(admin);
    if (joyIouReminders.status === "failed") {
      return responseBody({ ok: false, reason: "scheduler_failed" }, 503);
    }
    return responseBody({
      ok: true,
      status: "completed",
      announcements,
      joy_iou_reminders: joyIouReminders,
    });
  } catch {
    return responseBody({ ok: false, reason: "scheduler_unavailable" }, 503);
  }
}
