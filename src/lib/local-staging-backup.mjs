import {
  constants,
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
  X509Certificate,
} from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  appendFile,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { basename, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export const APPROVED_STAGING_PROJECT_REF = "vmmzdautcsgknhyqrsto";
export const POSTGRES_DUMP_IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.155";

const MANAGEMENT_API_ORIGIN = "https://api.supabase.com";
const ENVELOPE_MAGIC = Buffer.from("RLYBK001", "ascii");
const ENVELOPE_PREFIX_BYTES = ENVELOPE_MAGIC.length + 2;
const AES_KEY_BYTES = 32;
const AES_IV_BYTES = 12;
const AES_TAG_BYTES = 16;
const MIN_RSA_BITS = 3072;

function requiredText(value) {
  return String(value ?? "").trim();
}

function pathIsRegularFile(path) {
  return lstat(path).then((info) => info.isFile()).catch(() => false);
}

export function validateLocalBackupInputs(environment, options) {
  const errors = [];
  const projectRef = requiredText(environment.SUPABASE_PROJECT_REF);
  const accessToken = String(environment.SUPABASE_ACCESS_TOKEN ?? "");
  const dbPassword = String(environment.SUPABASE_DB_PASSWORD ?? "");
  const sourceSha = requiredText(options.sourceSha);
  const outputDirectory = requiredText(options.outputDirectory);
  const recipientCertificate = requiredText(options.recipientCertificate);
  const recipientPrivateKey = requiredText(options.recipientPrivateKey);

  if (projectRef !== APPROVED_STAGING_PROJECT_REF) errors.push("STAGING_PROJECT_REF_MISMATCH");
  if (accessToken.length < 20 || /[\r\n]/u.test(accessToken)) errors.push("ACCESS_TOKEN_REQUIRED");
  if (dbPassword.length === 0 || /[\r\n]/u.test(dbPassword)) errors.push("DATABASE_PASSWORD_REQUIRED");
  if (!/^[0-9a-f]{40}$/u.test(sourceSha)) errors.push("SOURCE_SHA_INVALID");
  if (!isAbsolute(outputDirectory) || outputDirectory === parse(outputDirectory).root) {
    errors.push("PRIVATE_OUTPUT_DIRECTORY_REQUIRED");
  }
  if (!isAbsolute(recipientCertificate) || !isAbsolute(recipientPrivateKey)) {
    errors.push("ABSOLUTE_RECIPIENT_KEY_PATHS_REQUIRED");
  }
  if (recipientCertificate.length === 0 || recipientPrivateKey.length === 0) {
    errors.push("RECIPIENT_KEY_FILES_REQUIRED");
  }

  return {
    ok: errors.length === 0,
    errors,
    values: {
      projectRef,
      accessToken,
      dbPassword,
      sourceSha,
      outputDirectory,
      recipientCertificate,
      recipientPrivateKey,
    },
  };
}

/**
 * Query only the pre-approved Supabase staging project. No caller-provided URL
 * is used to choose the Management API host or the database host.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} environment
 * @param {{fetchImpl?: typeof fetch}} options
 */
export async function verifyApprovedStagingProject(environment, { fetchImpl = fetch } = {}) {
  const projectRef = requiredText(environment.SUPABASE_PROJECT_REF);
  const token = String(environment.SUPABASE_ACCESS_TOKEN ?? "");
  const localErrors = [];
  if (projectRef !== APPROVED_STAGING_PROJECT_REF) localErrors.push("STAGING_PROJECT_REF_MISMATCH");
  if (token.length < 20 || /[\r\n]/u.test(token)) localErrors.push("ACCESS_TOKEN_REQUIRED");
  if (localErrors.length > 0) return { ok: false, projectConnectable: false, errors: localErrors };

  let response;
  let metadata;
  try {
    response = await fetchImpl(
      `${MANAGEMENT_API_ORIGIN}/v1/projects/${encodeURIComponent(APPROVED_STAGING_PROJECT_REF)}`,
      {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
        },
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    return { ok: false, projectConnectable: false, errors: ["PROJECT_METADATA_REQUEST_FAILED"] };
  }

  if (!response?.ok) {
    return { ok: false, projectConnectable: false, errors: ["PROJECT_METADATA_REQUEST_FAILED"] };
  }
  try {
    metadata = await response.json();
  } catch {
    return { ok: false, projectConnectable: false, errors: ["PROJECT_METADATA_INVALID"] };
  }

  const errors = [];
  const returnedRef = requiredText(metadata?.ref);
  const status = requiredText(metadata?.status).toUpperCase();
  if (returnedRef !== APPROVED_STAGING_PROJECT_REF) {
    errors.push("PROJECT_METADATA_REF_MISMATCH");
  }
  if (!/staging/iu.test(requiredText(metadata?.name))) errors.push("PROJECT_NAME_NOT_STAGING");
  if (!new Set(["ACTIVE", "ACTIVE_HEALTHY"]).has(status)) errors.push("PROJECT_STATUS_NOT_CONNECTABLE");
  if (requiredText(metadata?.database?.host).toLowerCase()
    !== `db.${APPROVED_STAGING_PROJECT_REF}.supabase.co`) {
    errors.push("PROJECT_DATABASE_HOST_MISMATCH");
  }

  return {
    ok: errors.length === 0,
    projectConnectable: errors.length === 0,
    errors,
  };
}

export function selectPgDumpCommand({ projectRef, pgDumpVersion, dockerAvailable, dockerHost = "" }) {
  if (projectRef !== APPROVED_STAGING_PROJECT_REF) throw new Error("STAGING_PROJECT_REF_MISMATCH");
  const databaseUrl = `postgresql://postgres@db.${APPROVED_STAGING_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`;
  const dumpArgs = [
    "--dbname",
    databaseUrl,
    "--schema=public",
    "--no-owner",
    "--no-privileges",
    "--no-password",
    "--format=plain",
  ];
  const major = Number(/^pg_dump \(PostgreSQL\) (\d+)/u.exec(String(pgDumpVersion ?? ""))?.[1]);

  if (Number.isInteger(major) && major >= 17) {
    return { command: "pg_dump", args: dumpArgs, provider: "native" };
  }
  if (dockerAvailable && /^unix:\/\//u.test(dockerHost)) {
    return {
      command: "docker",
      args: [
        "run",
        "--rm",
        "--pull=never",
        "--network=bridge",
        "--env=PGPASSWORD",
        POSTGRES_DUMP_IMAGE,
        "pg_dump",
        ...dumpArgs,
      ],
      provider: "docker",
      dockerHost,
    };
  }
  throw new Error("LOCAL_POSTGRES_17_DUMP_TOOL_REQUIRED");
}

function spawnResult(command, args, options = {}) {
  return spawnSync(command, args, {
    ...options,
    env: options.env ?? minimalChildEnvironment(),
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "ignore"],
    timeout: options.timeout ?? 5_000,
  });
}

function localDockerHost(spawnSyncImpl) {
  const configuredHost = requiredText(process.env.DOCKER_HOST);
  if (configuredHost) return configuredHost.startsWith("unix://") ? configuredHost : "";

  const contextResult = spawnSyncImpl("docker", ["context", "show"], {
    env: minimalChildEnvironment(),
  });
  const contextName = contextResult?.status === 0 ? contextResult.stdout.trim() : "";
  if (!contextName || /[\r\n]/u.test(contextName)) return "";
  const inspect = spawnSyncImpl("docker", [
    "context",
    "inspect",
    contextName,
    "--format",
    "{{.Endpoints.docker.Host}}",
  ], { env: minimalChildEnvironment() });
  const endpoint = inspect?.status === 0 ? inspect.stdout.trim() : "";
  return endpoint.startsWith("unix://") && !/[\r\n]/u.test(endpoint) ? endpoint : "";
}

export function detectDumpTool({ spawnSyncImpl = spawnResult } = {}) {
  const pgDump = spawnSyncImpl("pg_dump", ["--version"], {
    env: minimalChildEnvironment(),
  });
  const pgDumpVersion = pgDump?.status === 0 ? pgDump.stdout.trim() : "";
  const dockerHost = localDockerHost(spawnSyncImpl);
  const docker = dockerHost
    ? spawnSyncImpl("docker", ["version", "--format", "{{.Server.Version}}"], {
      env: { ...minimalChildEnvironment(), DOCKER_HOST: dockerHost, DOCKER_CONTEXT: "" },
    })
    : null;
  return {
    pgDumpVersion,
    dockerAvailable: docker?.status === 0 && docker.stdout.trim().length > 0,
    dockerHost,
  };
}

function childExit(child, label) {
  return new Promise((resolve, reject) => {
    child.once("error", () => reject(new Error(`${label}_START_FAILED`)));
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label}_FAILED`));
    });
  });
}

function byteCounter() {
  let bytes = 0;
  const stream = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      callback(null, chunk);
    },
  });
  return { stream, get bytes() { return bytes; } };
}

function minimalChildEnvironment({ password = "", dockerHost = "" } = {}) {
  const childEnvironment = { PATH: process.env.PATH ?? "/usr/bin:/bin" };
  for (const name of [
    "HOME",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "DOCKER_CONFIG",
    "DOCKER_CONTEXT",
  ]) {
    const value = process.env[name];
    if (typeof value === "string" && value.length > 0 && !/[\r\n]/u.test(value)) {
      childEnvironment[name] = value;
    }
  }
  if (password) childEnvironment.PGPASSWORD = password;
  if (dockerHost) childEnvironment.DOCKER_HOST = dockerHost;
  return childEnvironment;
}

async function ensurePrivateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("OUTPUT_DIRECTORY_NOT_PRIVATE");
  if (process.platform !== "win32" && (info.mode & 0o077) !== 0) {
    throw new Error("OUTPUT_DIRECTORY_PERMISSIONS_TOO_OPEN");
  }
}

async function assertPrivateKeyPermissions(path) {
  const info = await lstat(path);
  if (!info.isFile()) throw new Error("RECIPIENT_PRIVATE_KEY_NOT_A_FILE");
  if (process.platform !== "win32" && (info.mode & 0o077) !== 0) {
    throw new Error("RECIPIENT_PRIVATE_KEY_PERMISSIONS_TOO_OPEN");
  }
}

function pathIsWithin(parent, child) {
  const relativePath = relative(parent, child);
  return relativePath === "" || (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath));
}

async function assertOutsideRepository(path, repositoryRoot, errorCode) {
  const canonicalPath = await realpath(path);
  if (pathIsWithin(repositoryRoot, canonicalPath)) throw new Error(errorCode);
}

async function repositoryRoot(cwd = process.cwd()) {
  const result = spawnResult("git", ["rev-parse", "--show-toplevel"], { cwd });
  const path = result?.status === 0 ? result.stdout.trim() : "";
  if (!path || /[\r\n]/u.test(path)) throw new Error("GIT_REPOSITORY_REQUIRED");
  return realpath(path);
}

function loadRecipientCertificate(certificateBytes) {
  let certificate;
  try {
    certificate = new X509Certificate(certificateBytes);
  } catch {
    throw new Error("RECIPIENT_CERTIFICATE_INVALID");
  }
  const validFrom = Date.parse(certificate.validFrom);
  const validTo = Date.parse(certificate.validTo);
  const publicKey = certificate.publicKey;
  if (!Number.isFinite(validFrom) || !Number.isFinite(validTo)
    || validFrom > Date.now() || validTo <= Date.now()) {
    throw new Error("RECIPIENT_CERTIFICATE_INVALID_OR_EXPIRED");
  }
  if (publicKey.asymmetricKeyType !== "rsa"
    || Number(publicKey.asymmetricKeyDetails?.modulusLength) < MIN_RSA_BITS) {
    throw new Error("RECIPIENT_CERTIFICATE_RSA_3072_REQUIRED");
  }
  return publicKey;
}

function loadRecipientPrivateKey(privateKeyBytes) {
  let privateKey;
  try {
    privateKey = createPrivateKey(privateKeyBytes);
  } catch {
    throw new Error("RECIPIENT_PRIVATE_KEY_INVALID_OR_ENCRYPTED");
  }
  if (privateKey.asymmetricKeyType !== "rsa"
    || Number(privateKey.asymmetricKeyDetails?.modulusLength) < MIN_RSA_BITS) {
    throw new Error("RECIPIENT_PRIVATE_KEY_RSA_3072_REQUIRED");
  }
  return privateKey;
}

function wrapDataKey(publicKey, dataKey) {
  return publicEncrypt({
    key: publicKey,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256",
  }, dataKey);
}

function unwrapDataKey(privateKey, encryptedKey) {
  try {
    return privateDecrypt({
      key: privateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    }, encryptedKey);
  } catch {
    throw new Error("RECIPIENT_CERTIFICATE_PRIVATE_KEY_MISMATCH");
  }
}

function assertRecipientKeyPair(publicKey, privateKey) {
  const probe = randomBytes(AES_KEY_BYTES);
  let unwrapped;
  try {
    const wrapped = wrapDataKey(publicKey, probe);
    unwrapped = unwrapDataKey(privateKey, wrapped);
    if (!probe.equals(unwrapped)) throw new Error("RECIPIENT_CERTIFICATE_PRIVATE_KEY_MISMATCH");
  } finally {
    probe.fill(0);
    unwrapped?.fill(0);
  }
}

function makeEnvelopeHeader(publicKey, dataKey, iv) {
  const encryptedKey = wrapDataKey(publicKey, dataKey);
  if (encryptedKey.length > 0xffff) throw new Error("RECIPIENT_ENCRYPTED_KEY_TOO_LARGE");
  const header = Buffer.alloc(ENVELOPE_PREFIX_BYTES + encryptedKey.length + AES_IV_BYTES);
  ENVELOPE_MAGIC.copy(header, 0);
  header.writeUInt16BE(encryptedKey.length, ENVELOPE_MAGIC.length);
  encryptedKey.copy(header, ENVELOPE_PREFIX_BYTES);
  iv.copy(header, ENVELOPE_PREFIX_BYTES + encryptedKey.length);
  return header;
}

async function streamDumpToEncryptedFile({ dumpCommand, password, publicKey, encryptedPath, spawnImpl }) {
  const dumpEnvironment = minimalChildEnvironment({
    password,
    dockerHost: dumpCommand.provider === "docker" ? dumpCommand.dockerHost : "",
  });
  const helperEnvironment = minimalChildEnvironment();
  const dataKey = randomBytes(AES_KEY_BYTES);
  const children = [];
  let tasks = [];
  let encryptedFile;
  try {
    const iv = randomBytes(AES_IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", dataKey, iv, { authTagLength: AES_TAG_BYTES });
    const header = makeEnvelopeHeader(publicKey, dataKey, iv);
    cipher.setAAD(header);
    encryptedFile = createWriteStream(encryptedPath, { flags: "wx", mode: 0o600 });
    if (!encryptedFile.write(header)) await once(encryptedFile, "drain");
    const dump = spawnImpl(dumpCommand.command, dumpCommand.args, {
      env: dumpEnvironment,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const gzip = spawnImpl("gzip", ["-c"], {
      env: helperEnvironment,
      stdio: ["pipe", "pipe", "ignore"],
    });
    const counter = byteCounter();
    children.push(dump, gzip);
    tasks = [
      pipeline(dump.stdout, counter.stream, gzip.stdin),
      pipeline(gzip.stdout, cipher),
      pipeline(cipher, encryptedFile),
      childExit(dump, "DATABASE_DUMP"),
      childExit(gzip, "LOCAL_COMPRESSION"),
    ];
    await Promise.all(tasks);
    if (counter.bytes === 0) throw new Error("DATABASE_DUMP_EMPTY");
    await appendFile(encryptedPath, cipher.getAuthTag());
    return counter.bytes;
  } catch (error) {
    for (const child of children) child.kill("SIGKILL");
    encryptedFile?.destroy();
    await Promise.allSettled(tasks);
    throw error;
  } finally {
    dataKey.fill(0);
  }
}

async function readEnvelopeHeader(encryptedPath) {
  const file = await open(encryptedPath, "r");
  try {
    const { size } = await file.stat();
    if (size < ENVELOPE_PREFIX_BYTES + AES_IV_BYTES + AES_TAG_BYTES + 1) {
      throw new Error("ENCRYPTED_BACKUP_TRUNCATED");
    }
    const prefix = Buffer.alloc(ENVELOPE_PREFIX_BYTES);
    const { bytesRead: prefixBytes } = await file.read(prefix, 0, prefix.length, 0);
    if (prefixBytes !== prefix.length || !prefix.subarray(0, ENVELOPE_MAGIC.length).equals(ENVELOPE_MAGIC)) {
      throw new Error("ENCRYPTED_BACKUP_FORMAT_INVALID");
    }
    const encryptedKeyLength = prefix.readUInt16BE(ENVELOPE_MAGIC.length);
    if (encryptedKeyLength < 1) throw new Error("ENCRYPTED_BACKUP_FORMAT_INVALID");
    const headerLength = ENVELOPE_PREFIX_BYTES + encryptedKeyLength + AES_IV_BYTES;
    const ciphertextLength = size - headerLength - AES_TAG_BYTES;
    if (ciphertextLength < 1) throw new Error("ENCRYPTED_BACKUP_TRUNCATED");
    const header = Buffer.alloc(headerLength);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    if (bytesRead !== header.length) throw new Error("ENCRYPTED_BACKUP_TRUNCATED");
    const encryptedKey = header.subarray(ENVELOPE_PREFIX_BYTES, ENVELOPE_PREFIX_BYTES + encryptedKeyLength);
    const iv = header.subarray(ENVELOPE_PREFIX_BYTES + encryptedKeyLength);
    const tag = Buffer.alloc(AES_TAG_BYTES);
    const { bytesRead: tagBytes } = await file.read(tag, 0, tag.length, size - AES_TAG_BYTES);
    if (tagBytes !== tag.length) throw new Error("ENCRYPTED_BACKUP_TRUNCATED");
    return { size, headerLength, ciphertextLength, encryptedKey, iv, tag, header };
  } finally {
    await file.close();
  }
}

async function verifyEncryptedFile({ encryptedPath, privateKey, spawnImpl }) {
  const envelope = await readEnvelopeHeader(encryptedPath);
  const dataKey = unwrapDataKey(privateKey, envelope.encryptedKey);
  const decrypt = createDecipheriv("aes-256-gcm", dataKey, envelope.iv, { authTagLength: AES_TAG_BYTES });
  decrypt.setAAD(envelope.header);
  decrypt.setAuthTag(envelope.tag);
  const gzipTest = spawnImpl("gzip", ["-t"], {
    env: minimalChildEnvironment(),
    stdio: ["pipe", "ignore", "ignore"],
  });
  const counter = byteCounter();
  const ciphertextStart = envelope.headerLength;
  const ciphertextEnd = envelope.size - AES_TAG_BYTES - 1;
  const encryptedInput = createReadStream(encryptedPath, { start: ciphertextStart, end: ciphertextEnd });
  const tasks = [
    pipeline(encryptedInput, decrypt, counter.stream, gzipTest.stdin),
    childExit(gzipTest, "LOCAL_ARCHIVE_VERIFICATION"),
  ];
  try {
    await Promise.all(tasks);
  } catch {
    gzipTest.kill("SIGKILL");
    await Promise.allSettled(tasks);
    throw new Error("ENCRYPTED_BACKUP_AUTHENTICATION_OR_ARCHIVE_CHECK_FAILED");
  } finally {
    dataKey.fill(0);
  }
  if (counter.bytes === 0) throw new Error("ENCRYPTED_BACKUP_VERIFICATION_EMPTY");
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function syncFile(path) {
  const file = await open(path, "r+");
  try {
    await file.sync();
  } finally {
    await file.close();
  }
}

async function assertNoExistingOutput(path) {
  try {
    await lstat(path);
    throw new Error("BACKUP_OUTPUT_ALREADY_EXISTS");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

/**
 * @param {{
 *   environment?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   sourceSha: string,
 *   outputDirectory: string,
 *   recipientCertificate: string,
 *   recipientPrivateKey: string,
 *   verifyIdentity?: (environment: NodeJS.ProcessEnv | Record<string, string | undefined>) => Promise<{ok: boolean, projectConnectable: boolean, errors?: string[]}>,
 *   dumpTool?: {pgDumpVersion?: string, dockerAvailable?: boolean, dockerHost?: string} | null,
 *   dumpCommand?: {command: string, args: string[], provider: string, dockerHost?: string} | null,
 *   spawnImpl?: typeof spawn,
 *   now?: Date,
 * }} options
 */
export async function exportLocalStagingBackup({
  environment = process.env,
  sourceSha,
  outputDirectory,
  recipientCertificate,
  recipientPrivateKey,
  verifyIdentity = verifyApprovedStagingProject,
  dumpTool = null,
  dumpCommand = null,
  spawnImpl = spawn,
  now = new Date(),
}) {
  const checked = validateLocalBackupInputs(environment, {
    sourceSha,
    outputDirectory,
    recipientCertificate,
    recipientPrivateKey,
  });
  if (!checked.ok) throw new Error(`LOCAL_STAGING_BACKUP_INPUT_INVALID:${checked.errors.join(",")}`);
  const values = checked.values;

  if (!await pathIsRegularFile(values.recipientCertificate)) throw new Error("RECIPIENT_CERTIFICATE_NOT_A_FILE");
  await assertPrivateKeyPermissions(values.recipientPrivateKey);
  const publicKey = loadRecipientCertificate(await readFile(values.recipientCertificate));
  const privateKey = loadRecipientPrivateKey(await readFile(values.recipientPrivateKey));
  assertRecipientKeyPair(publicKey, privateKey);

  const repoRoot = await repositoryRoot();
  const unresolvedOutputDirectory = resolve(values.outputDirectory);
  if (pathIsWithin(repoRoot, unresolvedOutputDirectory)) {
    throw new Error("OUTPUT_DIRECTORY_MUST_BE_OUTSIDE_REPOSITORY");
  }
  await ensurePrivateDirectory(values.outputDirectory);
  await assertOutsideRepository(values.outputDirectory, repoRoot, "OUTPUT_DIRECTORY_MUST_BE_OUTSIDE_REPOSITORY");
  await assertOutsideRepository(values.recipientCertificate, repoRoot, "RECIPIENT_CERTIFICATE_MUST_BE_OUTSIDE_REPOSITORY");
  await assertOutsideRepository(values.recipientPrivateKey, repoRoot, "RECIPIENT_PRIVATE_KEY_MUST_BE_OUTSIDE_REPOSITORY");

  const identity = await verifyIdentity(environment);
  if (!identity?.ok || !identity?.projectConnectable) {
    const errors = Array.isArray(identity?.errors) ? identity.errors.join(",") : "PROJECT_IDENTITY_FAILED";
    throw new Error(`STAGING_PROJECT_IDENTITY_FAILED:${errors}`);
  }

  const selectedDumpCommand = dumpCommand ?? selectPgDumpCommand({
    projectRef: values.projectRef,
    ...(dumpTool ?? detectDumpTool()),
  });
  if (selectedDumpCommand.provider === "docker" && !/^unix:\/\//u.test(selectedDumpCommand.dockerHost ?? "")) {
    throw new Error("LOCAL_DOCKER_SOCKET_REQUIRED");
  }

  const stamp = now.toISOString().replaceAll(/[-:]|\.\d{3}/gu, "");
  const fileName = `rotary-staging-public-${values.sourceSha.slice(0, 12)}-${stamp}.sql.gz.enc`;
  const checksumName = `${fileName}.sha256`;
  const encryptedPath = join(values.outputDirectory, fileName);
  const checksumPath = join(values.outputDirectory, checksumName);
  await assertNoExistingOutput(encryptedPath);
  await assertNoExistingOutput(checksumPath);

  const temporaryEncryptedPath = join(values.outputDirectory, `.${fileName}.partial-${randomBytes(12).toString("hex")}`);
  const temporaryChecksumPath = join(values.outputDirectory, `.${checksumName}.partial-${randomBytes(12).toString("hex")}`);
  let outputLinked = false;
  let checksumLinked = false;

  try {
    const plaintextBytes = await streamDumpToEncryptedFile({
      dumpCommand: selectedDumpCommand,
      password: values.dbPassword,
      publicKey,
      encryptedPath: temporaryEncryptedPath,
      spawnImpl,
    });
    await verifyEncryptedFile({ encryptedPath: temporaryEncryptedPath, privateKey, spawnImpl });
    const encryptedBytes = (await lstat(temporaryEncryptedPath)).size;
    if (encryptedBytes === 0) throw new Error("ENCRYPTED_BACKUP_EMPTY");
    await syncFile(temporaryEncryptedPath);
    const checksum = await sha256File(temporaryEncryptedPath);
    await writeFile(temporaryChecksumPath, `${checksum}  ${fileName}\n`, { flag: "wx", mode: 0o600 });
    await syncFile(temporaryChecksumPath);
    await link(temporaryEncryptedPath, encryptedPath);
    outputLinked = true;
    await link(temporaryChecksumPath, checksumPath);
    checksumLinked = true;
    await unlink(temporaryEncryptedPath);
    await unlink(temporaryChecksumPath);

    return {
      fileName,
      checksumName,
      encryptedPath,
      sha256: checksum,
      encryptedBytes,
      sourceSha: values.sourceSha,
      projectRef: values.projectRef,
      plaintextBytes,
      storage: "local-only",
    };
  } catch (error) {
    await Promise.allSettled([
      unlink(temporaryEncryptedPath),
      unlink(temporaryChecksumPath),
      ...(checksumLinked ? [unlink(checksumPath)] : []),
      ...(outputLinked ? [unlink(encryptedPath)] : []),
    ]);
    throw error;
  }
}

export function readMainSourceSha(cwd = process.cwd(), spawnSyncImpl = spawnResult) {
  const branch = spawnSyncImpl("git", ["branch", "--show-current"], { cwd });
  if (branch?.status !== 0 || branch.stdout.trim() !== "main") {
    throw new Error("RUN_FROM_UPDATED_MAIN_REQUIRED");
  }
  const status = spawnSyncImpl("git", ["status", "--porcelain", "--untracked-files=all"], { cwd });
  if (status?.status !== 0 || status.stdout.trim().length > 0) {
    throw new Error("CLEAN_MAIN_WORKTREE_REQUIRED");
  }
  const head = spawnSyncImpl("git", ["rev-parse", "HEAD"], { cwd });
  const sourceSha = head?.status === 0 ? head.stdout.trim() : "";
  if (!/^[0-9a-f]{40}$/u.test(sourceSha)) throw new Error("SOURCE_SHA_UNAVAILABLE");
  const upstream = spawnSyncImpl("git", ["rev-parse", "origin/main"], { cwd });
  if (upstream?.status !== 0 || upstream.stdout.trim() !== sourceSha) {
    throw new Error("MAIN_MUST_MATCH_ORIGIN_MAIN");
  }
  return sourceSha;
}

export function backupSummary(result) {
  return [
    "Local-only staging backup created and authenticated-encryption verified.",
    `Source commit: ${result.sourceSha}`,
    `Project ref: ${result.projectRef}`,
    `Encrypted file: ${result.encryptedPath}`,
    `Encrypted bytes: ${result.encryptedBytes}`,
    `SHA-256: ${result.sha256}`,
    `Checksum file: ${join(parse(result.encryptedPath).dir, result.checksumName)}`,
    "Encryption: AES-256-GCM with an RSA-OAEP-SHA256 wrapped data key.",
    "No plaintext dump was written to disk or uploaded.",
  ].join("\n");
}

export function assertLocalBackupFileName(name) {
  return basename(name) === name && name.startsWith("rotary-staging-public-") && name.endsWith(".sql.gz.enc");
}
