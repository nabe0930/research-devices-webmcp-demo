import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  createIntegrityManifest,
  digestRecords,
  validateIntegrityManifest,
  validateVerifiedEvidenceCounts,
  validateVerifiedSourceTransition,
} from "../scripts/integrity.mjs";

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "rd-webmcp-integrity-"));
  await mkdir(resolve(root, "data"), { recursive: true });
  await writeFile(resolve(root, "data/value.json"), "{\"value\":1}\n");
  const manifest = await createIntegrityManifest({
    root,
    manifestPath: "review-manifest.json",
    kind: "synthetic_local_review_candidate",
    datasetVersion: "test-v1",
    licenseStatus: "pending_explicit_approval",
    sourceRoot: root,
    sourceInputPaths: ["data/value.json"],
  });
  await writeFile(resolve(root, "review-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return root;
}

test("integrity manifest validates an unchanged candidate", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = await validateIntegrityManifest({
    root,
    manifestPath: "review-manifest.json",
    expectedKind: "synthetic_local_review_candidate",
    expectedDatasetVersion: "test-v1",
    expectedLicenseStatus: "pending_explicit_approval",
  });
  assert.match(manifest.contentSha256, /^[a-f0-9]{64}$/);
  assert.match(manifest.approvalSha256, /^[a-f0-9]{64}$/);
});

test("public source verification may rebuild an absent dist but never accepts a changed dist", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "rd-webmcp-public-integrity-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(resolve(root, "data"), { recursive: true });
  await mkdir(resolve(root, "dist"), { recursive: true });
  await writeFile(resolve(root, "data/value.json"), "{\"value\":1}\n");
  await writeFile(resolve(root, "dist/index.html"), "approved\n");
  const manifest = await createIntegrityManifest({
    root,
    manifestPath: "release-integrity-manifest.json",
    kind: "synthetic_public_release_candidate",
    datasetVersion: "test-v1",
    licenseStatus: "applied",
    distRoot: resolve(root, "dist"),
  });
  await writeFile(
    resolve(root, "release-integrity-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  await rm(resolve(root, "dist"), { recursive: true });
  await assert.rejects(
    validateIntegrityManifest({
      root,
      manifestPath: "release-integrity-manifest.json",
      expectedKind: "synthetic_public_release_candidate",
      expectedDatasetVersion: "test-v1",
      expectedLicenseStatus: "applied",
    }),
    /ENOENT/,
  );
  await validateIntegrityManifest({
    root,
    manifestPath: "release-integrity-manifest.json",
    expectedKind: "synthetic_public_release_candidate",
    expectedDatasetVersion: "test-v1",
    expectedLicenseStatus: "applied",
    allowMissingDist: true,
  });

  await mkdir(resolve(root, "dist"), { recursive: true });
  await writeFile(resolve(root, "dist/index.html"), "changed\n");
  await assert.rejects(
    validateIntegrityManifest({
      root,
      manifestPath: "release-integrity-manifest.json",
      expectedKind: "synthetic_public_release_candidate",
      expectedDatasetVersion: "test-v1",
      expectedLicenseStatus: "applied",
      allowMissingDist: true,
    }),
    /does not match build output/i,
  );
});

test("approval envelope rejects edited source-input evidence", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = resolve(root, "review-manifest.json");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  manifest.sourceInputs[0].sha256 = "f".repeat(64);
  manifest.sourceInputSha256 = digestRecords(manifest.sourceInputs);
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  await assert.rejects(
    validateIntegrityManifest({
      root,
      manifestPath: "review-manifest.json",
      expectedKind: "synthetic_local_review_candidate",
      expectedDatasetVersion: "test-v1",
      expectedLicenseStatus: "pending_explicit_approval",
    }),
    /approval envelope/i,
  );
});

test("integrity manifest rejects unapproved extra metadata", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = resolve(root, "review-manifest.json");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  manifest.unapprovedNote = "not part of the sealed schema";
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  await assert.rejects(
    validateIntegrityManifest({
      root,
      manifestPath: "review-manifest.json",
      expectedKind: "synthetic_local_review_candidate",
      expectedDatasetVersion: "test-v1",
      expectedLicenseStatus: "pending_explicit_approval",
    }),
    /exact schema/i,
  );
});

test("integrity manifest rejects a one-byte candidate change", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(resolve(root, "data/value.json"), "{\"value\":2}\n");
  await assert.rejects(
    validateIntegrityManifest({
      root,
      manifestPath: "review-manifest.json",
      expectedKind: "synthetic_local_review_candidate",
      expectedDatasetVersion: "test-v1",
      expectedLicenseStatus: "pending_explicit_approval",
    }),
    /does not match/i,
  );
});

test("integrity manifest rejects unreviewed symbolic links", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await symlink(resolve(root, "data/value.json"), resolve(root, "data/link.json"));
  await assert.rejects(
    validateIntegrityManifest({
      root,
      manifestPath: "review-manifest.json",
      expectedKind: "synthetic_local_review_candidate",
      expectedDatasetVersion: "test-v1",
      expectedLicenseStatus: "pending_explicit_approval",
    }),
    /symbolic links/i,
  );
});

test("verified publication evidence counts are exact approved counts", () => {
  const approvedRelease = { fileCount: 48, distFileCount: 27 };
  assert.equal(
    validateVerifiedEvidenceCounts({
      approvedRelease,
      repositoryVerification: { filesMatched: 49 },
      deploymentVerification: { httpFilesMatched: 27 },
    }),
    true,
  );
  assert.throws(
    () => validateVerifiedEvidenceCounts({
      approvedRelease,
      repositoryVerification: { filesMatched: 1 },
      deploymentVerification: { httpFilesMatched: 27 },
    }),
    /counts/i,
  );
});

test("verified source transition permits only four controlled documents and one exact evidence file", () => {
  const record = (path, seed) => ({
    path,
    bytes: seed,
    sha256: String(seed).padStart(64, "0"),
  });
  const approvedFiles = [
    record("README.md", 1),
    record("data/catalog.json", 2),
    record("release-manifest.json", 3),
    record("scripts/check-source.mjs", 4),
  ].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const evidence = record("approved-release-integrity-manifest.json", 5);
  const verifiedFiles = [
    record("README.md", 11),
    approvedFiles.find(({ path }) => path === "data/catalog.json"),
    record("release-manifest.json", 13),
    approvedFiles.find(({ path }) => path === "scripts/check-source.mjs"),
    evidence,
  ].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  assert.equal(
    validateVerifiedSourceTransition({
      approvedRelease: { files: approvedFiles },
      verifiedRelease: { files: verifiedFiles },
      approvedReleaseIntegrityRecord: evidence,
    }),
    true,
  );
  assert.throws(
    () => validateVerifiedSourceTransition({
      approvedRelease: { files: approvedFiles },
      verifiedRelease: {
        files: verifiedFiles.map((entry) =>
          entry.path === "scripts/check-source.mjs" ? record(entry.path, 99) : entry,
        ),
      },
      approvedReleaseIntegrityRecord: evidence,
    }),
    /immutable approved source/i,
  );
  assert.throws(
    () => validateVerifiedSourceTransition({
      approvedRelease: { files: approvedFiles },
      verifiedRelease: {
        files: [...verifiedFiles, record("secret.env", 100)].sort((a, b) =>
          a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
        ),
      },
      approvedReleaseIntegrityRecord: evidence,
    }),
    /exact approved transition/i,
  );
});
