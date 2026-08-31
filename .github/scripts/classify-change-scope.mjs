import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const zeroSha = /^0+$/u;

// These paths can change runtime behavior, authorization, data shape, or the
// build itself. Unknown paths are also treated as high risk below so a new
// kind of change cannot silently bypass the safety gates.
const highRiskPathPatterns = [
  /^src\//u,
  /^supabase\//u,
  /^scripts\//u,
  /^e2e\//u,
  /^public\//u,
  /^tests\//u,
  /^\.github\/workflows\//u,
  /^AGENTS\.md$/u,
  /^Dockerfile(?:\..*)?$/u,
  /^(?:package|npm-shrinkwrap|yarn|pnpm)(?:-lock)?\.json$/u,
  /^(?:next|tsconfig|eslint|postcss|tailwind|vitest)\..*$/u,
  /^(?:render|fly|vercel|netlify)\.(?:ya?ml|json)$/u,
];

const lowRiskPathPatterns = [
  /^docs\//u,
  /^(?:README|CHANGELOG|CONTRIBUTING)(?:\..*)?$/iu,
  /^(?:LICENSE|NOTICE)(?:\..*)?$/iu,
  /^\.github\/dependabot\.ya?ml$/u,
];

function normalizePath(path) {
  return String(path ?? "").trim().replaceAll("\\", "/");
}

export function isHighRiskPath(path) {
  const normalized = normalizePath(path);
  if (!normalized) return false;
  if (highRiskPathPatterns.some((pattern) => pattern.test(normalized))) return true;
  if (lowRiskPathPatterns.some((pattern) => pattern.test(normalized))) return false;
  return true;
}

export function classifyChangedPaths(paths) {
  const changedPaths = paths.map(normalizePath).filter(Boolean);
  const highRiskPaths = changedPaths.filter(isHighRiskPath);
  if (changedPaths.length === 0) {
    return {
      runFull: true,
      reason: "no_changed_paths_fail_open",
      changedFileCount: 0,
      highRiskFileCount: 0,
    };
  }
  return {
    runFull: highRiskPaths.length > 0,
    reason: highRiskPaths.length > 0 ? "high_risk_change" : "docs_or_metadata_only",
    changedFileCount: changedPaths.length,
    highRiskFileCount: highRiskPaths.length,
  };
}

function readEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return {};
  try {
    return JSON.parse(readFileSync(eventPath, "utf8"));
  } catch {
    return {};
  }
}

function diffArguments(event) {
  const pullRequest = event.pull_request;
  if (pullRequest?.base?.sha && pullRequest?.head?.sha) {
    return [pullRequest.base.sha, pullRequest.head.sha];
  }

  const before = String(event.before ?? "").trim();
  const current = String(process.env.GITHUB_SHA ?? "").trim();
  if (before && current && !zeroSha.test(before)) return [before, current];

  const parent = String(process.env.GITHUB_SHA ?? "HEAD").trim();
  return [`${parent}^`, parent];
}

function changedPaths(event) {
  try {
    return execFileSync("git", ["diff", "--name-only", ...diffArguments(event)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).split("\n");
  } catch {
    return null;
  }
}

export function classifyCurrentChange(event = readEvent()) {
  const paths = changedPaths(event);
  if (paths === null) {
    return {
      runFull: true,
      reason: "diff_unavailable_fail_open",
      changedFileCount: 0,
      highRiskFileCount: 0,
    };
  }
  return classifyChangedPaths(paths);
}

function writeGitHubOutput(result) {
  console.log(`run_full=${result.runFull ? "true" : "false"}`);
  console.log(`reason=${result.reason}`);
  console.log(`changed_file_count=${result.changedFileCount}`);
  console.log(`high_risk_file_count=${result.highRiskFileCount}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  writeGitHubOutput(classifyCurrentChange());
}
