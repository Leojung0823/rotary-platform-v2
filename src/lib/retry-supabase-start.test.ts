import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const helper = resolve("scripts/retry-supabase-start.sh");

function runWithFakeCommands(options: {
  mode: "retry-twice" | "always-pull" | "non-image" | "stalled-pull" | "cleanup-fails" | "ecr-rate-limit" | "ecr-429" | "ecr-recovers" | "success";
  helperArgs: string[];
  github?: boolean;
  registry?: string;
}): {
  status: number | null;
  stdout: string;
  stderr: string;
  calls: string[];
  sleeps: string[];
  root: string;
} {
  const root = mkdtempSync(join(tmpdir(), "rotary-supabase-retry-test-"));
  const bin = join(root, "bin");
  const callsPath = join(root, "supabase-calls.log");
  const sleepsPath = join(root, "sleep-calls.log");
  mkdirSync(bin);

  writeFileSync(join(bin, "supabase"), `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "stop" ]]; then
  printf '%s\\n' "$*" >> "$SUPABASE_TEST_CALLS"
  if [[ "$SUPABASE_TEST_MODE" == "cleanup-fails" ]]; then
    echo 'cleanup failed'
    exit 44
  fi
  exit 0
fi
printf '%s\\n' "$*" >> "$SUPABASE_TEST_CALLS"
start_count="$(grep -c 'start' "$SUPABASE_TEST_CALLS" || true)"
case "$SUPABASE_TEST_MODE:$start_count" in
  retry-twice:1|retry-twice:2) echo 'toomanyrequests: registry rate limit'; exit 1 ;;
  always-pull:*) echo 'failed to pull image: registry unavailable'; exit 1 ;;
  non-image:1) echo 'database initialization failed'; exit 1 ;;
  cleanup-fails:1) echo 'toomanyrequests: registry rate limit'; exit 1 ;;
  ecr-rate-limit:1) echo "$SUPABASE_INTERNAL_IMAGE_REGISTRY: toomanyrequests: Rate exceeded"; exit 1 ;;
  ecr-429:1) echo "$SUPABASE_INTERNAL_IMAGE_REGISTRY: unexpected HTTP status 429"; exit 1 ;;
  ecr-recovers:1) echo "$SUPABASE_INTERNAL_IMAGE_REGISTRY: toomanyrequests: Rate exceeded"; exit 0 ;;
  *) echo 'local services started' ;;
esac
`);
  writeFileSync(join(bin, "timeout"), `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "-k" ]]; then shift 3; fi
if [[ "$SUPABASE_TEST_MODE" == "stalled-pull" && "$1" == "supabase" && "$2" == "db" ]]; then
  echo 'Pulling image registry.example.test/supabase/postgres:17'
  exit 124
fi
exec "$@"
`);
  writeFileSync(join(bin, "sleep"), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$1" >> "$SUPABASE_TEST_SLEEPS"
`);
  for (const executable of ["supabase", "timeout", "sleep"]) {
    chmodSync(join(bin, executable), 0o755);
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
    SUPABASE_TEST_CALLS: callsPath,
    SUPABASE_TEST_SLEEPS: sleepsPath,
    SUPABASE_TEST_MODE: options.mode,
    SUPABASE_INTERNAL_IMAGE_REGISTRY: options.registry ?? "registry.example.test",
    RUNNER_TEMP: root,
  };
  if (options.github !== false) {
    env.GITHUB_ACTIONS = "true";
    env.GITHUB_RUN_ID = "12345";
  } else {
    delete env.GITHUB_ACTIONS;
    delete env.GITHUB_RUN_ID;
  }

  const result = spawnSync("bash", [helper, ...options.helperArgs], {
    env,
    encoding: "utf8",
    timeout: 10_000,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    calls: existsSync(callsPath) ? readFileSync(callsPath, "utf8").trim().split("\n") : [],
    sleeps: existsSync(sleepsPath) ? readFileSync(sleepsPath, "utf8").trim().split("\n") : [],
    root,
  };
}

describe("Supabase CI startup retry helper", () => {
  it("retries only registry pull failures, stops the partial stack, and caps retries at three", () => {
    const result = runWithFakeCommands({ mode: "retry-twice", helperArgs: ["database"] });
    try {
      expect(result.status).toBe(0);
      expect(result.calls).toEqual([
        "db start",
        "stop --no-backup",
        "db start",
        "stop --no-backup",
        "db start",
      ]);
      expect(result.sleeps).toEqual(["60", "120"]);
    } finally {
      rmSync(result.root, { recursive: true, force: true });
    }
  });

  it("fails immediately for non-image startup errors", () => {
    const result = runWithFakeCommands({ mode: "non-image", helperArgs: ["database"] });
    try {
      expect(result.status).toBe(1);
      expect(result.calls).toEqual(["db start"]);
      expect(result.sleeps).toEqual([]);
      expect(`${result.stdout}${result.stderr}`).toContain("database initialization failed");
    } finally {
      rmSync(result.root, { recursive: true, force: true });
    }
  });

  it("does not exceed three image-pull attempts", () => {
    const result = runWithFakeCommands({ mode: "always-pull", helperArgs: ["database"] });
    try {
      expect(result.status).toBe(1);
      expect(result.calls.filter((call) => call === "db start")).toHaveLength(3);
      expect(result.calls.filter((call) => call === "stop --no-backup")).toHaveLength(2);
      expect(result.sleeps).toEqual(["60", "120"]);
      expect(`${result.stdout}${result.stderr}`).toContain("failed after 3 image-pull attempts");
    } finally {
      rmSync(result.root, { recursive: true, force: true });
    }
  });

  it.each(["ecr-rate-limit", "ecr-429", "ecr-recovers"] as const)("stops immediately on ECR rate limiting: %s", (mode) => {
    const result = runWithFakeCommands({ mode, registry: "public.ecr.aws", helperArgs: ["database"] });
    try {
      expect(result.status).toBe(1);
      expect(result.calls).toEqual(["db start"]);
      expect(result.sleeps).toEqual([]);
      expect(result.stdout).toContain("Supabase image registry: public.ecr.aws");
      expect(result.stdout).toContain("Registry rate limit detected (public.ecr.aws); stopping without retry");
    } finally {
      rmSync(result.root, { recursive: true, force: true });
    }
  });

  it.each(["ecr-rate-limit", "ecr-429", "ecr-recovers"] as const)("does not retry GHCR rate limiting: %s", (mode) => {
    const result = runWithFakeCommands({ mode, registry: "ghcr.io", helperArgs: ["database"] });
    try {
      expect(result.status).toBe(1);
      expect(result.calls).toEqual(["db start"]);
      expect(result.sleeps).toEqual([]);
      expect(result.stdout).toContain("Supabase image registry: ghcr.io");
      expect(result.stdout).toContain("Registry rate limit detected (ghcr.io); stopping without retry");
    } finally {
      rmSync(result.root, { recursive: true, force: true });
    }
  });

  it("retries a timeout only when the log proves an image pull was underway", () => {
    const result = runWithFakeCommands({ mode: "stalled-pull", helperArgs: ["database"] });
    try {
      expect(result.status).toBe(124);
      expect(result.calls).toEqual(["stop --no-backup", "stop --no-backup"]);
      expect(result.sleeps).toEqual(["60", "120"]);
      expect(`${result.stdout}${result.stderr}`).toContain("failed after 3 image-pull attempts");
    } finally {
      rmSync(result.root, { recursive: true, force: true });
    }
  });

  it("fails closed when cleanup of a partially started stack fails", () => {
    const result = runWithFakeCommands({ mode: "cleanup-fails", helperArgs: ["database"] });
    try {
      expect(result.status).toBe(44);
      expect(result.calls).toEqual(["db start", "stop --no-backup"]);
      expect(result.sleeps).toEqual([]);
      expect(`${result.stdout}${result.stderr}`).toContain("refusing to retry");
    } finally {
      rmSync(result.root, { recursive: true, force: true });
    }
  });

  it("passes the explicit service exclusion list to full Supabase startup", () => {
    const result = runWithFakeCommands({
      mode: "success",
      helperArgs: ["full", "-x", "studio,imgproxy,logflare,vector,edge-runtime,realtime,postgres-meta,supavisor"],
    });
    try {
      expect(result.status).toBe(0);
      expect(result.calls).toEqual([
        "start -x studio,imgproxy,logflare,vector,edge-runtime,realtime,postgres-meta,supavisor",
      ]);
      expect(result.sleeps).toEqual([]);
    } finally {
      rmSync(result.root, { recursive: true, force: true });
    }
  });

  it("refuses to stop or start a developer's local Supabase stack", () => {
    const result = runWithFakeCommands({ mode: "success", helperArgs: ["database"], github: false });
    try {
      expect(result.status).toBe(64);
      expect(result.calls).toEqual([]);
      expect(`${result.stdout}${result.stderr}`).toContain("Refusing to start or stop Supabase outside a GitHub Actions run");
    } finally {
      rmSync(result.root, { recursive: true, force: true });
    }
  });

  it("retains the ten-minute attempt timeout and bounded cleanup timeout", () => {
    const source = readFileSync(helper, "utf8");
    expect(source).toContain("timeout -k 30 600");
    expect(source).toContain("timeout -k 30 120 supabase stop --no-backup");
  });
});
