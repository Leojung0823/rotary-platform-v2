#!/usr/bin/env node

import { appendFile } from "node:fs/promises";
import { verifyStagingProjectIdentity } from "../src/lib/staging-project-identity.mjs";

const result = await verifyStagingProjectIdentity(process.env);

console.log(`Project suffix: ${result.projectRefSuffix ?? "invalid"}`);
console.log(`Supabase origin configured: ${result.supabaseOrigin ? "yes" : "no"}`);
console.log(`Project connectable: ${result.projectConnectable ? "yes" : "no"}`);

if (!result.ok) {
  for (const error of result.errors) console.error(`ERROR ${error}`);
  console.error("Staging project identity verification failed. No API response or credential value was printed.");
  process.exit(1);
}

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, "verified=true\n", { encoding: "utf8" });
}
console.log("Hosted Supabase project identity is an active staging target.");
