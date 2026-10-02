#!/usr/bin/env node

import {
  backupSummary,
  exportLocalStagingBackup,
  readMainSourceSha,
} from "../src/lib/local-staging-backup.mjs";

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === "--help" || name === "-h") return { help: true };
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error("BACKUP_ARGUMENT_VALUE_REQUIRED");
    if (name === "--output-dir") options.outputDirectory = value;
    else if (name === "--recipient-cert") options.recipientCertificate = value;
    else if (name === "--recipient-key") options.recipientPrivateKey = value;
    else throw new Error("BACKUP_ARGUMENT_UNKNOWN");
    index += 1;
  }
  if (!options.outputDirectory || !options.recipientCertificate || !options.recipientPrivateKey) {
    throw new Error("BACKUP_ARGUMENTS_REQUIRED");
  }
  return options;
}

function usage() {
  return [
    "Usage (run from an up-to-date main checkout):",
    "  node --env-file=.env.staging scripts/export-local-staging-backup.mjs \\",
    "    --output-dir /absolute/path/to/private-backup-folder \\",
    "    --recipient-cert /absolute/path/to/recipient-cert.pem \\",
    "    --recipient-key /absolute/path/to/private-key.pem",
    "",
    "The exporter verifies staging identity, then streams the public-schema dump through local gzip and",
    "AES-256-GCM encryption with an RSA-OAEP-SHA256 wrapped key; only ciphertext and a checksum are saved locally.",
    "No GitHub artifact or plaintext dump file is created.",
  ].join("\n");
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
  } else {
    const sourceSha = readMainSourceSha();
    const result = await exportLocalStagingBackup({ ...options, sourceSha });
    process.stdout.write(`${backupSummary(result)}\n`);
  }
} catch (error) {
  const message = String(error?.message ?? "");
  const code = /^[A-Z0-9_:,.-]+$/u.test(message) ? message : "LOCAL_BACKUP_FAILED";
  process.stderr.write(`Local staging backup failed: ${code}. No hosted write or upload was attempted.\n`);
  process.exitCode = 1;
}
