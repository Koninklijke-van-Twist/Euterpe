import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let cachedCommit = undefined;

export function resolveGitHead(gitDir, headContent) {
  const trimmed = headContent.trim();
  if (trimmed.startsWith("ref: ")) {
    const refPath = path.join(gitDir, trimmed.slice(5).trim());
    if (!fs.existsSync(refPath)) return null;
    const sha = fs.readFileSync(refPath, "utf8").trim();
    return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7) : null;
  }
  if (/^[0-9a-f]{40}$/i.test(trimmed)) return trimmed.slice(0, 7);
  return null;
}

export function getLocalCommitSha(root = projectRoot) {
  try {
    const sha = execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (/^[0-9a-f]{7,40}$/i.test(sha)) return sha.slice(0, 7);
  } catch {
    /* git niet beschikbaar of geen repo */
  }

  try {
    const gitDir = path.join(root, ".git");
    const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8");
    return resolveGitHead(gitDir, head);
  } catch {
    return null;
  }
}

export function getCachedCommitSha() {
  if (cachedCommit === undefined) {
    cachedCommit = getLocalCommitSha();
  }
  return cachedCommit;
}

export function _resetCommitCacheForTests() {
  cachedCommit = undefined;
}
