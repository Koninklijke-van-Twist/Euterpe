import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, afterEach } from "node:test";
import {
  _resetCommitCacheForTests,
  getCachedCommitSha,
  getLocalCommitSha,
  resolveGitHead,
} from "../server/version.js";

describe("version", () => {
  afterEach(() => {
    _resetCommitCacheForTests();
  });

  it("resolveGitHead reads detached HEAD", () => {
    assert.equal(
      resolveGitHead("/fake", "abcdef0123456789abcdef0123456789abcdef01\n"),
      "abcdef0"
    );
  });

  it("resolveGitHead follows ref", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "euterpe-git-"));
    const refs = path.join(dir, "refs", "heads", "master");
    fs.mkdirSync(path.dirname(refs), { recursive: true });
    fs.writeFileSync(refs, "fedcba0987654321fedcba0987654321fedcba09\n");
    assert.equal(resolveGitHead(dir, "ref: refs/heads/master\n"), "fedcba0");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("getLocalCommitSha returns short sha in git repo", () => {
    const sha = getLocalCommitSha();
    assert.match(sha ?? "", /^[0-9a-f]{7}$/);
  });

  it("getCachedCommitSha caches result", () => {
    const a = getCachedCommitSha();
    const b = getCachedCommitSha();
    assert.equal(a, b);
  });
});
