import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { DisabledNotificationProvider } from "../src/lib/notifications/disabled-provider.ts";
import { MockNotificationProvider, type MockProviderBehavior } from "../src/lib/notifications/mock-provider.ts";
import { safeWorkerLog } from "../src/lib/notifications/redaction.ts";
import { assertLocalWorkerEnvironment, runAnnouncementBatch, runNotificationBatch } from "../src/lib/notifications/worker.ts";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = assertLocalWorkerEnvironment(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.APP_ENV);
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) throw new Error("local_worker_configuration_missing");

const providerMode = process.env.NOTIFICATION_PROVIDER_MODE?.trim() || "disabled";
if (providerMode !== "mock" && providerMode !== "disabled") throw new Error("local_worker_provider_invalid");
const behavior = (process.env.NOTIFICATION_MOCK_BEHAVIOR?.trim() || "success") as MockProviderBehavior;
if (!["success", "temporary_failure", "permanent_failure"].includes(behavior)) {
  throw new Error("local_worker_mock_behavior_invalid");
}

const requestedBatch = Number.parseInt(process.env.NOTIFICATION_WORKER_BATCH_SIZE || "20", 10);
const workerId = `local-${randomUUID().slice(0, 12)}`;
const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const command = process.argv[2] || "all";
const output: Record<string, number> = {};

if (command === "announcements" || command === "all") {
  const result = await runAnnouncementBatch(client, workerId, requestedBatch);
  for (const [key, value] of Object.entries(result)) output[`announcement_${key}`] = value;
}
if (command === "notifications" || command === "all") {
  const provider = providerMode === "mock"
    ? new MockNotificationProvider(behavior)
    : new DisabledNotificationProvider();
  const result = await runNotificationBatch(client, provider, workerId, requestedBatch);
  for (const [key, value] of Object.entries(result)) output[`notification_${key}`] = value;
}
if (!["announcements", "notifications", "all"].includes(command)) throw new Error("local_worker_command_invalid");
console.log(safeWorkerLog(output));
