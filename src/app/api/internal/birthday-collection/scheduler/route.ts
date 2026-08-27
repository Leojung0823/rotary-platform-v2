import { NextResponse, type NextRequest } from "next/server";
import { createTrustedAdminClient } from "@/lib/supabase/admin";
import { hasValidBirthdayCollectionSchedulerSecret } from "@/lib/birthday-collection/scheduler-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hostedEnvironments = new Set(["staging", "production"]);

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
  if (!hasValidBirthdayCollectionSchedulerSecret(request.headers.get("authorization"))) {
    return responseBody({ ok: false, reason: "unauthorized" }, 401);
  }

  const appEnvironment = process.env.APP_ENV;
  if (!appEnvironment || !hostedEnvironments.has(appEnvironment)) {
    return responseBody({ ok: false, reason: "scheduler_unavailable" }, 503);
  }

  try {
    const killSwitch = process.env.DISABLE_BIRTHDAY_WISHES_COLLECTION_V1;
    if (killSwitch !== undefined && killSwitch !== "true" && killSwitch !== "false") {
      return responseBody({ ok: false, reason: "scheduler_unavailable" }, 503);
    }
    if (killSwitch === "true") {
      return responseBody({ ok: true, status: "skipped", reason: "kill_switch" });
    }

    const admin = createTrustedAdminClient();
    const flag = await admin.rpc("is_birthday_wish_collection_scheduler_enabled", {
      p_environment: appEnvironment,
    });
    if (flag.error) return responseBody({ ok: false, reason: "scheduler_unavailable" }, 503);
    if (flag.data !== true) {
      return responseBody({ ok: true, status: "skipped", reason: "collection_disabled" });
    }

    const result = await admin.rpc("run_birthday_wish_collection_scheduler", {
      p_as_of: new Date().toISOString(),
    });
    if (result.error) return responseBody({ ok: false, reason: "scheduler_failed" }, 503);

    return responseBody({ ok: true, status: "completed", result: result.data });
  } catch {
    return responseBody({ ok: false, reason: "scheduler_unavailable" }, 503);
  }
}
