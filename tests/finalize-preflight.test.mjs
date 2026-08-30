import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { digestRecords } from "../scripts/integrity.mjs";
import {
  parsePreflightArguments,
  validatePreflightSourceInputSeal,
} from "../scripts/finalize-preflight.mjs";

const sourceInputs = [
  "scripts/export-synthetic-submission.mjs",
  "scripts/finalize-public-release.mjs",
  "scripts/prepare-public-release.mjs",
  "submission-profile/PUBLICATION-RUNBOOK.md",
  "submission-profile/runtime/scripts/finalize-preflight.mjs",
  "submission-profile/profile.synthetic.json",
].sort().map((path, index) => ({
  path,
  bytes: index + 1,
  sha256: String(index + 1).padStart(64, "0"),
}));
const approvedReview = {
  sourceInputs,
  sourceInputSha256: digestRecords(sourceInputs),
};

test("sealed candidate preflight requires every release control and exact current hashes", () => {
  assert.deepEqual(validatePreflightSourceInputSeal(approvedReview, sourceInputs), sourceInputs.map((record) => record.path));
  assert.throws(
    () => validatePreflightSourceInputSeal(approvedReview, sourceInputs.slice(1)),
    /sealed review inputs/i,
  );
  assert.throws(
    () => validatePreflightSourceInputSeal(
      approvedReview,
      sourceInputs.map((record, index) => index === 1 ? { ...record, sha256: "f".repeat(64) } : record),
    ),
    /sealed review inputs/i,
  );
});

test("preflight strips one absolute workspace root and forwards finalizer gates", () => {
  assert.deepEqual(
    parsePreflightArguments([
      "--workspace-root",
      "/tmp/approved-worktree",
      "--dry-run",
      "--approved-release-sha256",
      "a".repeat(64),
      "--candidate-commit-sha",
      "b".repeat(40),
    ]),
    {
      workspaceRoot: "/tmp/approved-worktree",
      forwarded: [
        "--dry-run",
        "--approved-release-sha256",
        "a".repeat(64),
        "--candidate-commit-sha",
        "b".repeat(40),
      ],
    },
  );
  assert.throws(() => parsePreflightArguments(["--dry-run"]), /workspace-root/i);
  assert.throws(
    () => parsePreflightArguments(["--workspace-root", "relative/path"]),
    /absolute path/i,
  );
});

test("sealed preflight is self-contained and executes only immutable candidate and control snapshots", async () => {
  const source = await readFile(new URL("../scripts/finalize-preflight.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from ["']\.\/integrity\.mjs["']/);
  assert.match(source, /const candidateSnapshot = await snapshotCandidateIntegrity\(\)/);
  assert.match(source, /candidateSnapshot\.sourceFiles\.get\("release-manifest\.json"\)/);
  assert.match(source, /const finalizer = resolve\(temporary, "scripts\/finalize-public-release\.mjs"\)/);
  assert.match(source, /RD_WEBMCP_FINALIZE_WORKSPACE_ROOT: workspaceRoot/);
  assert.doesNotMatch(source, /const finalizer = resolve\(workspaceRoot, "scripts\/finalize-public-release\.mjs"\)/);
  assert.doesNotMatch(source, /execFileAsync\([^\n]+\{ cwd: candidateRoot/);
});
