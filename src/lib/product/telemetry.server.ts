import "server-only";
import { createHmac } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createTrustedAdminClient } from "@/lib/supabase/admin";
import {
  isValidProductTelemetryEvent,
  recordProductTelemetry,
  telemetryDatabasePayload,
  telemetryEventRequiresDailySubject,
  productTelemetryEventFamily,
  type ProductTelemetryEvent,
  type ProductTelemetryResult,
  type TelemetryFailureSignal,
} from "./telemetry";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const failureSignalWindowMs = 60_000;
const maximumFailureSignalKeys = 8;
const emittedFailureSignals = new Map<string, number>();

function telemetryPepper(environment: NodeJS.ProcessEnv = process.env): string | null {
  const pepper = environment.TELEMETRY_PSEUDONYM_PEPPER;
  return typeof pepper === "string" && pepper.length >= 32 && !/\s/u.test(pepper) ? pepper : null;
}

export function dailyTelemetryPseudonym({
  accountId,
  utcDate,
  eventFamily,
  pepper,
}: {
  accountId: string;
  utcDate: string;
  eventFamily: string;
  pepper: string;
}): string | null {
  if (!uuidPattern.test(accountId)
    || !/^\d{4}-\d{2}-\d{2}$/u.test(utcDate)
    || !/^(member_context|member_home|checkin)$/u.test(eventFamily)
    || pepper.length < 32
    || /\s/u.test(pepper)) return null;

  try {
    return createHmac("sha256", pepper).update(`${accountId}:${utcDate}:${eventFamily}`, "utf8").digest("hex");
  } catch {
    return null;
  }
}

export function boundedTelemetryFailureSignal(
  report: () => void = () => console.warn("PRODUCT_TELEMETRY_SINK_FAILURE"),
  now = () => Date.now(),
): TelemetryFailureSignal {
  return {
    report() {
      const key = "product_telemetry_sink";
      const timestamp = now();
      const previous = emittedFailureSignals.get(key);
      if (previous !== undefined && timestamp - previous < failureSignalWindowMs) return;
      if (!emittedFailureSignals.has(key) && emittedFailureSignals.size >= maximumFailureSignalKeys) return;
      emittedFailureSignals.set(key, timestamp);
      report();
    },
  };
}

async function currentInternalAccountId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  const { data, error } = await supabase.rpc("current_app_account_id");
  return !error && typeof data === "string" && uuidPattern.test(data) ? data : null;
}

export async function recordAuthenticatedProductTelemetry(
  event: unknown,
  now = new Date(),
  failureSignal = boundedTelemetryFailureSignal(),
): Promise<ProductTelemetryResult> {
  if (!isValidProductTelemetryEvent(event)) return { recorded: false, reason: "invalid_event" };

  const sink = {
    async write(validEvent: ProductTelemetryEvent) {
      const accountId = await currentInternalAccountId();
      if (!accountId) throw new Error("telemetry_identity_unavailable");

      const dailySubject = telemetryEventRequiresDailySubject(validEvent)
        ? dailyTelemetryPseudonym({
          accountId,
          utcDate: now.toISOString().slice(0, 10),
          eventFamily: productTelemetryEventFamily(validEvent),
          pepper: telemetryPepper() ?? "",
        })
        : null;
      if (telemetryEventRequiresDailySubject(validEvent) && !dailySubject) {
        throw new Error("telemetry_pseudonym_unavailable");
      }

      const admin = createTrustedAdminClient();
      const { error } = await admin.from("platform_product_telemetry").insert({
        event_name: validEvent.name,
        payload: telemetryDatabasePayload(validEvent),
        daily_subject: dailySubject,
      });
      if (error) throw new Error("telemetry_sink_write_failed");
    },
  };

  return recordProductTelemetry(sink, event, failureSignal);
}
