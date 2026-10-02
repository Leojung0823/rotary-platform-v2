import { execFileSync, spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  constants,
  createDecipheriv,
  createPrivateKey,
  privateDecrypt,
} from "node:crypto";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APPROVED_STAGING_PROJECT_REF,
  POSTGRES_DUMP_IMAGE,
  detectDumpTool,
  exportLocalStagingBackup,
  readMainSourceSha,
  selectPgDumpCommand,
  validateLocalBackupInputs,
  verifyApprovedStagingProject,
} from "./local-staging-backup.mjs";

const workDirs: string[] = [];

function temporaryDirectory() {
  const path = mkdtempSync(join(tmpdir(), "rotary-local-staging-backup-"));
  workDirs.push(path);
  return path;
}

function makeRecipient(directory: string, name = "recipient") {
  const keyPath = join(directory, `${name}-key.pem`);
  const certificatePath = join(directory, `${name}-certificate.pem`);
  execFileSync("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:3072",
    "-sha256",
    "-nodes",
    "-keyout",
    keyPath,
    "-out",
    certificatePath,
    "-days",
    "2",
    "-subj",
    "/CN=Rotary Staging Backup Test",
  ], { stdio: "ignore" });
  chmodSync(keyPath, 0o600);
  chmodSync(certificatePath, 0o600);
  return { keyPath, certificatePath };
}

function stagingEnvironment(overrides: Record<string, string> = {}) {
  return {
    SUPABASE_PROJECT_REF: APPROVED_STAGING_PROJECT_REF,
    SUPABASE_ACCESS_TOKEN: "test-management-token-not-a-real-secret",
    SUPABASE_DB_PASSWORD: "test-database-password-not-a-real-secret",
    ...overrides,
  };
}

function metadataResponse(overrides: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    id: "7f20de3d-2f31-4c89-9f87-ef2f30d95f73",
    ref: APPROVED_STAGING_PROJECT_REF,
    name: "Rotary Platform Staging",
    status: "ACTIVE_HEALTHY",
    database: { host: `db.${APPROVED_STAGING_PROJECT_REF}.supabase.co` },
    ...overrides,
  }), { status: 200, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  for (const directory of workDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("local-only staging logical backup", () => {
  it("retires the GitHub artifact workflow so future exports stay local", () => {
    expect(existsSync(".github/workflows/staging-logical-backup.yml")).toBe(false);
  });

  it("fails closed unless the exact staging project, password and private local paths are supplied", () => {
    const base = stagingEnvironment();
    const options = {
      sourceSha: "a".repeat(40),
      outputDirectory: "/tmp/rotary-backup",
      recipientCertificate: "/tmp/certificate.pem",
      recipientPrivateKey: "/tmp/private-key.pem",
    };
    expect(validateLocalBackupInputs(base, options).ok).toBe(true);
    expect(validateLocalBackupInputs({ ...base, SUPABASE_PROJECT_REF: "production-project" }, options).errors)
      .toContain("STAGING_PROJECT_REF_MISMATCH");
    expect(validateLocalBackupInputs({ ...base, SUPABASE_DB_PASSWORD: "" }, options).errors)
      .toContain("DATABASE_PASSWORD_REQUIRED");
    expect(validateLocalBackupInputs(base, { ...options, sourceSha: "not-a-commit" }).errors)
      .toContain("SOURCE_SHA_INVALID");
    expect(validateLocalBackupInputs(base, { ...options, outputDirectory: "/" }).errors)
      .toContain("PRIVATE_OUTPUT_DIRECTORY_REQUIRED");
  });

  it("requests metadata only for the fixed project and validates its returned staging identity", async () => {
    const fetchImpl = vi.fn(async () => metadataResponse());
    const result = await verifyApprovedStagingProject(stagingEnvironment(), { fetchImpl });
    expect(result).toMatchObject({ ok: true, projectConnectable: true, errors: [] });
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.supabase.com/v1/projects/${APPROVED_STAGING_PROJECT_REF}`,
      expect.objectContaining({ redirect: "error" }),
    );

    const wrongRefFetch = vi.fn();
    const wrongRef = await verifyApprovedStagingProject(
      stagingEnvironment({ SUPABASE_PROJECT_REF: "production-project" }),
      { fetchImpl: wrongRefFetch },
    );
    expect(wrongRef.errors).toContain("STAGING_PROJECT_REF_MISMATCH");
    expect(wrongRefFetch).not.toHaveBeenCalled();

    const spoofedId = await verifyApprovedStagingProject(stagingEnvironment(), {
      fetchImpl: async () => metadataResponse({
        id: APPROVED_STAGING_PROJECT_REF,
        ref: "production-project-ref",
      }),
    });
    expect(spoofedId.errors).toContain("PROJECT_METADATA_REF_MISMATCH");

    const unhealthy = await verifyApprovedStagingProject(stagingEnvironment(), {
      fetchImpl: async () => metadataResponse({
        name: "Rotary Production",
        status: "INACTIVE",
        database: { host: "db.production.supabase.co" },
      }),
    });
    expect(unhealthy.errors).toEqual(expect.arrayContaining([
      "PROJECT_NAME_NOT_STAGING",
      "PROJECT_STATUS_NOT_CONNECTABLE",
      "PROJECT_DATABASE_HOST_MISMATCH",
    ]));
    expect(JSON.stringify(result)).not.toContain(stagingEnvironment().SUPABASE_ACCESS_TOKEN);
  });

  it("pins pg_dump to the approved database and never puts the password in process arguments", () => {
    const native = selectPgDumpCommand({
      projectRef: APPROVED_STAGING_PROJECT_REF,
      pgDumpVersion: "pg_dump (PostgreSQL) 17.6",
      dockerAvailable: false,
    });
    expect(native.command).toBe("pg_dump");
    expect(native.args.join(" ")).toContain(`db.${APPROVED_STAGING_PROJECT_REF}.supabase.co`);
    expect(native.args.join(" ")).not.toContain("test-database-password");

    const docker = selectPgDumpCommand({
      projectRef: APPROVED_STAGING_PROJECT_REF,
      pgDumpVersion: "pg_dump (PostgreSQL) 16.9",
      dockerAvailable: true,
      dockerHost: "unix:///Users/test/.docker/run/docker.sock",
    });
    expect(docker.command).toBe("docker");
    expect(docker.args).toContain("--pull=never");
    expect(docker.args).toContain("--env=PGPASSWORD");
    expect(docker.args).toContain(POSTGRES_DUMP_IMAGE);
    expect(docker.args.join(" ")).not.toContain("test-database-password");
    expect(() => selectPgDumpCommand({
      projectRef: APPROVED_STAGING_PROJECT_REF,
      pgDumpVersion: "",
      dockerAvailable: true,
      dockerHost: "ssh://remote-host",
    })).toThrow("LOCAL_POSTGRES_17_DUMP_TOOL_REQUIRED");
  });

  it("rejects a private key readable by group or other users before any staging request", async () => {
    const root = temporaryDirectory();
    const recipient = makeRecipient(root);
    const outputDirectory = join(root, "backup");
    mkdirSync(outputDirectory, { mode: 0o700 });
    chmodSync(recipient.keyPath, 0o644);
    const verifyIdentity = vi.fn();
    await expect(exportLocalStagingBackup({
      environment: stagingEnvironment(),
      sourceSha: "a".repeat(40),
      outputDirectory,
      recipientCertificate: recipient.certificatePath,
      recipientPrivateKey: recipient.keyPath,
      verifyIdentity,
      dumpCommand: { command: process.execPath, args: ["-e", "process.stdout.write('x')"], provider: "native" },
    })).rejects.toThrow("RECIPIENT_PRIVATE_KEY_PERMISSIONS_TOO_OPEN");
    expect(verifyIdentity).not.toHaveBeenCalled();
  });

  it("streams a synthetic dump to a local authenticated-encrypted file and leaves no plaintext artifact", async () => {
    const root = temporaryDirectory();
    const recipient = makeRecipient(root);
    const outputDirectory = join(root, "private-backups");
    mkdirSync(outputDirectory, { mode: 0o700 });
    const sql = "CREATE TABLE local_backup_test(id integer);\nINSERT INTO local_backup_test VALUES (7);\n";
    const childEnvironments: Array<{ command: string; env: Record<string, string | undefined> }> = [];
    const result = await exportLocalStagingBackup({
      environment: stagingEnvironment(),
      sourceSha: "b".repeat(40),
      outputDirectory,
      recipientCertificate: recipient.certificatePath,
      recipientPrivateKey: recipient.keyPath,
      verifyIdentity: async () => ({ ok: true, projectConnectable: true, errors: [] }),
      dumpCommand: {
        command: process.execPath,
        args: ["-e", `process.stdout.write(${JSON.stringify(sql)})`],
        provider: "native",
      },
      spawnImpl: ((
        command: string,
        args: string[],
        options?: import("node:child_process").SpawnOptions,
      ) => {
        childEnvironments.push({ command: String(command), env: options?.env ?? {} });
        return spawn(command, args, options ?? {});
      }) as never,
      now: new Date("2026-10-02T12:34:56.000Z"),
    });

    expect(result.storage).toBe("local-only");
    expect(result.fileName).toMatch(/\.sql\.gz\.enc$/u);
    expect(result.plaintextBytes).toBe(Buffer.byteLength(sql));
    expect(childEnvironments[0]?.env.PGPASSWORD).toBe(stagingEnvironment().SUPABASE_DB_PASSWORD);
    expect(childEnvironments.slice(1).every(({ env }) => !("PGPASSWORD" in env))).toBe(true);
    expect(existsSync(result.encryptedPath)).toBe(true);
    expect((statSync(result.encryptedPath).mode & 0o777)).toBe(0o600);
    expect((statSync(join(outputDirectory, result.checksumName)).mode & 0o777)).toBe(0o600);
    expect(readdirSync(outputDirectory).sort()).toEqual([result.checksumName, result.fileName].sort());

    const encrypted = readFileSync(result.encryptedPath);
    expect(encrypted.subarray(0, 8).toString("ascii")).toBe("RLYBK001");
    const encryptedKeyLength = encrypted.readUInt16BE(8);
    const keyStart = 10;
    const ivStart = keyStart + encryptedKeyLength;
    const bodyStart = ivStart + 12;
    const encryptedKey = encrypted.subarray(keyStart, ivStart);
    const iv = encrypted.subarray(ivStart, bodyStart);
    const privateKey = createPrivateKey(readFileSync(recipient.keyPath));
    const dataKey = privateDecrypt({
      key: privateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    }, encryptedKey);
    const decipher = createDecipheriv("aes-256-gcm", dataKey, iv, { authTagLength: 16 });
    decipher.setAAD(encrypted.subarray(0, bodyStart));
    decipher.setAuthTag(encrypted.subarray(encrypted.length - 16));
    const gzipBytes = Buffer.concat([
      decipher.update(encrypted.subarray(bodyStart, encrypted.length - 16)),
      decipher.final(),
    ]);
    expect(gunzipSync(gzipBytes).toString("utf8")).toBe(sql);

    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 0xff;
    const badTagCheck = createDecipheriv("aes-256-gcm", dataKey, iv, { authTagLength: 16 });
    badTagCheck.setAAD(tampered.subarray(0, bodyStart));
    badTagCheck.setAuthTag(tampered.subarray(tampered.length - 16));
    badTagCheck.update(tampered.subarray(bodyStart, tampered.length - 16));
    expect(() => badTagCheck.final()).toThrow();
    dataKey.fill(0);

    const checksum = readFileSync(join(outputDirectory, result.checksumName), "utf8");
    expect(checksum).toContain(result.sha256);
    expect(checksum).not.toContain("CREATE TABLE");
  });

  it("removes only its own partial encrypted output after a failed dump", async () => {
    const root = temporaryDirectory();
    const recipient = makeRecipient(root);
    const outputDirectory = join(root, "private-backups");
    mkdirSync(outputDirectory, { mode: 0o700 });
    await expect(exportLocalStagingBackup({
      environment: stagingEnvironment(),
      sourceSha: "e".repeat(40),
      outputDirectory,
      recipientCertificate: recipient.certificatePath,
      recipientPrivateKey: recipient.keyPath,
      verifyIdentity: async () => ({ ok: true, projectConnectable: true, errors: [] }),
      dumpCommand: {
        command: process.execPath,
        args: ["-e", "process.stdout.write('partial sql'); process.exit(3)"],
        provider: "native",
      },
    })).rejects.toThrow();
    expect(readdirSync(outputDirectory)).toEqual([]);
  });

  it("refuses dirty or stale main checkouts when selecting the backup source SHA", () => {
    const sha = "c".repeat(40);
    const currentMain = vi.fn((_command: string, args: string[]) => {
      if (args[0] === "branch") return { status: 0, stdout: "main\n" };
      if (args[0] === "status") return { status: 0, stdout: "" };
      if (args[0] === "rev-parse" && args[1] === "HEAD") return { status: 0, stdout: `${sha}\n` };
      if (args[0] === "rev-parse" && args[1] === "origin/main") return { status: 0, stdout: `${sha}\n` };
      return { status: 1, stdout: "" };
    });
    expect(readMainSourceSha("/repo", currentMain as never)).toBe(sha);

    const dirtyMain = vi.fn((_command: string, args: string[]) => {
      if (args[0] === "branch") return { status: 0, stdout: "main\n" };
      if (args[0] === "status") return { status: 0, stdout: "?? backup.sql\n" };
      return { status: 0, stdout: `${sha}\n` };
    });
    expect(() => readMainSourceSha("/repo", dirtyMain as never)).toThrow("CLEAN_MAIN_WORKTREE_REQUIRED");

    const staleMain = vi.fn((_command: string, args: string[]) => {
      if (args[0] === "branch") return { status: 0, stdout: "main\n" };
      if (args[0] === "status") return { status: 0, stdout: "" };
      return { status: 0, stdout: `${sha}\n` };
    });
    staleMain.mockImplementation((_command, args) => {
      if (args[0] === "rev-parse" && args[1] === "origin/main") return { status: 0, stdout: `${"d".repeat(40)}\n` };
      if (args[0] === "rev-parse" && args[1] === "HEAD") return { status: 0, stdout: `${sha}\n` };
      if (args[0] === "branch") return { status: 0, stdout: "main\n" };
      return { status: 0, stdout: "" };
    });
    expect(() => readMainSourceSha("/repo", staleMain as never)).toThrow("MAIN_MUST_MATCH_ORIGIN_MAIN");
  });

  it("does not use a remote Docker context for the database stream", () => {
    vi.stubEnv("DOCKER_HOST", "");
    vi.stubEnv("SUPABASE_ACCESS_TOKEN", "management-token-must-not-reach-child-processes");
    vi.stubEnv("SUPABASE_DB_PASSWORD", "database-password-must-not-reach-probes");
    const results = [
      { status: 1, stdout: "" },
      { status: 0, stdout: "desktop-linux\n" },
      { status: 0, stdout: "ssh://docker-host\n" },
    ];
    const childEnvironments: Array<NodeJS.ProcessEnv | undefined> = [];
    const spawnSyncImpl = vi.fn((
      _command: string,
      _args: string[],
      options?: import("node:child_process").SpawnSyncOptions,
    ) => {
      childEnvironments.push(options?.env as NodeJS.ProcessEnv | undefined);
      return results.shift() ?? { status: 1, stdout: "" };
    });
    const tools = detectDumpTool({ spawnSyncImpl: spawnSyncImpl as never });
    expect(tools.dockerHost).toBe("");
    expect(tools.dockerAvailable).toBe(false);
    expect(spawnSyncImpl).toHaveBeenCalledTimes(3);
    expect(childEnvironments).toHaveLength(3);
    expect(childEnvironments.every((environment) => environment?.PATH)).toBe(true);
    expect(childEnvironments.every((environment) => !environment?.SUPABASE_ACCESS_TOKEN)).toBe(true);
    expect(childEnvironments.every((environment) => !environment?.SUPABASE_DB_PASSWORD)).toBe(true);
  });
});
