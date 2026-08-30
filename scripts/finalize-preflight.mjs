import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const candidateRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const execFileAsync = promisify(execFile);
const requiredSourceInputs = Object.freeze([
  "scripts/export-synthetic-submission.mjs",
  "scripts/finalize-public-release.mjs",
  "scripts/prepare-public-release.mjs",
  "submission-profile/PUBLICATION-RUNBOOK.md",
  "submission-profile/runtime/scripts/finalize-preflight.mjs",
]);

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function digestRecords(records) {
  return sha256(`${JSON.stringify(records)}\n`);
}

function digestApprovalManifest(manifest) {
  const envelope = {
    schemaVersion: manifest.schemaVersion,
    kind: manifest.kind,
    datasetVersion: manifest.datasetVersion,
    licenseStatus: manifest.licenseStatus,
    fileCount: manifest.fileCount,
    files: manifest.files,
    contentSha256: manifest.contentSha256,
  };
  if (manifest.sourceInputs !== undefined) {
    envelope.sourceInputCount = manifest.sourceInputCount;
    envelope.sourceInputs = manifest.sourceInputs;
    envelope.sourceInputSha256 = manifest.sourceInputSha256;
  }
  if (manifest.distFiles !== undefined) {
    envelope.distFileCount = manifest.distFileCount;
    envelope.distFiles = manifest.distFiles;
    envelope.distSha256 = manifest.distSha256;
  }
  return sha256(`${JSON.stringify(envelope)}\n`);
}

function validateRecordList(records, label) {
  if (!Array.isArray(records)) fail(`${label} must be an array.`);
  let previous = "";
  for (const record of records) {
    if (
      !record ||
      typeof record.path !== "string" ||
      !record.path ||
      record.path.startsWith("/") ||
      record.path.split("/").includes("..") ||
      !Number.isInteger(record.bytes) ||
      record.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(record.sha256 ?? "") ||
      record.path <= previous
    ) {
      fail(`${label} contains an invalid or unsorted file record.`);
    }
    previous = record.path;
  }
}

function validateIntegrityEnvelope({
  manifest,
  expectedKind,
  expectedDatasetVersion,
  expectedLicenseStatus,
  label,
}) {
  const expectedKeys = [
    "approvalSha256",
    "contentSha256",
    "datasetVersion",
    "fileCount",
    "files",
    "kind",
    "licenseStatus",
    "schemaVersion",
  ];
  if (manifest?.sourceInputs !== undefined) {
    expectedKeys.push("sourceInputCount", "sourceInputSha256", "sourceInputs");
  }
  if (manifest?.distFiles !== undefined) {
    expectedKeys.push("distFileCount", "distFiles", "distSha256");
  }
  if (JSON.stringify(Object.keys(manifest ?? {}).sort()) !== JSON.stringify(expectedKeys.sort())) {
    fail(`${label} does not match the exact schema.`);
  }
  if (
    manifest.schemaVersion !== 1 ||
    manifest.kind !== expectedKind ||
    manifest.datasetVersion !== expectedDatasetVersion ||
    manifest.licenseStatus !== expectedLicenseStatus ||
    !Number.isInteger(manifest.fileCount) ||
    !/^[a-f0-9]{64}$/.test(manifest.contentSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(manifest.approvalSha256 ?? "")
  ) {
    fail(`Invalid ${label} metadata.`);
  }
  validateRecordList(manifest.files, `${label} files`);
  if (
    manifest.fileCount !== manifest.files.length ||
    manifest.contentSha256 !== digestRecords(manifest.files)
  ) {
    fail(`${label} file envelope is invalid.`);
  }
  if (manifest.sourceInputs !== undefined) {
    validateRecordList(manifest.sourceInputs, `${label} source inputs`);
    if (
      manifest.sourceInputCount !== manifest.sourceInputs.length ||
      manifest.sourceInputSha256 !== digestRecords(manifest.sourceInputs)
    ) {
      fail(`${label} source-input envelope is invalid.`);
    }
  }
  if (manifest.distFiles !== undefined) {
    validateRecordList(manifest.distFiles, `${label} dist files`);
    if (
      manifest.distFileCount !== manifest.distFiles.length ||
      manifest.distSha256 !== digestRecords(manifest.distFiles)
    ) {
      fail(`${label} dist envelope is invalid.`);
    }
  }
  if (manifest.approvalSha256 !== digestApprovalManifest(manifest)) {
    fail(`${label} approval envelope is invalid.`);
  }
  return manifest;
}

function safeRelative(root, path) {
  const value = relative(root, path).split(sep).join("/");
  if (!value || value === ".." || value.startsWith("../") || value.includes("/../")) {
    fail("Integrity path escapes its declared root.");
  }
  return value;
}

async function listRegularFiles(
  root,
  { excludedPaths = [], ignoredDirectoryNames = [".git", "dist", "node_modules"] } = {},
) {
  const excluded = new Set(excludedPaths);
  const ignored = new Set(ignoredDirectoryNames);
  const result = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      const rel = safeRelative(root, path);
      if (excluded.has(rel)) continue;
      if (entry.name.includes(".bak-")) fail(`Backup artifacts are forbidden: ${rel}`);
      if (entry.isSymbolicLink()) fail(`Symbolic links are forbidden: ${rel}`);
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) await visit(path);
      } else if (entry.isFile()) result.push(rel);
      else fail(`Special files are forbidden: ${rel}`);
    }
  }
  await visit(root);
  return result.sort();
}

async function snapshotCandidateIntegrity() {
  const manifestPath = "release-integrity-manifest.json";
  const integrityBytes = await readFile(resolve(candidateRoot, manifestPath));
  const manifest = JSON.parse(integrityBytes.toString("utf8"));
  validateIntegrityEnvelope({
    manifest,
    expectedKind: "synthetic_public_release_candidate",
    expectedDatasetVersion: manifest.datasetVersion,
    expectedLicenseStatus: "applied",
    label: manifestPath,
  });
  const canonical = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  if (!integrityBytes.equals(canonical)) {
    fail("The public-release integrity manifest is not canonical.");
  }
  const paths = await listRegularFiles(candidateRoot, { excludedPaths: [manifestPath] });
  if (JSON.stringify(paths) !== JSON.stringify(manifest.files.map((record) => record.path))) {
    fail("The sealed candidate source set changed before the immutable snapshot.");
  }
  const sourceFiles = new Map();
  for (const record of manifest.files) {
    const bytes = await readFile(resolve(candidateRoot, record.path));
    if (bytes.byteLength !== record.bytes || sha256(bytes) !== record.sha256) {
      fail(`The sealed candidate changed during snapshot: ${record.path}`);
    }
    sourceFiles.set(record.path, bytes);
  }
  const distRoot = resolve(candidateRoot, "dist");
  const distPaths = await listRegularFiles(distRoot, { ignoredDirectoryNames: [] });
  if (JSON.stringify(distPaths) !== JSON.stringify(manifest.distFiles.map((record) => record.path))) {
    fail("The sealed candidate build set changed before the immutable snapshot.");
  }
  for (const record of manifest.distFiles) {
    const bytes = await readFile(resolve(distRoot, record.path));
    if (bytes.byteLength !== record.bytes || sha256(bytes) !== record.sha256) {
      fail(`The sealed build changed during snapshot: dist/${record.path}`);
    }
  }
  const profileBytes = sourceFiles.get("data/profile.synthetic.json");
  if (!profileBytes || JSON.parse(profileBytes.toString("utf8")).datasetVersion !== manifest.datasetVersion) {
    fail("The sealed candidate profile and integrity manifest disagree.");
  }
  return Object.freeze({ manifest, sourceFiles, integrityBytes });
}

export function validatePreflightSourceInputSeal(approvedReview, currentSourceInputs) {
  if (!Array.isArray(approvedReview?.sourceInputs) || !Array.isArray(currentSourceInputs)) {
    fail("Approved source-input seal is missing.");
  }
  const paths = approvedReview.sourceInputs.map((record) => record.path);
  const unique = new Set(paths);
  if (
    unique.size !== paths.length ||
    paths.some(
      (path) =>
        typeof path !== "string" ||
        (!path.startsWith("submission-profile/") && !requiredSourceInputs.includes(path)),
    ) ||
    requiredSourceInputs.some((path) => !unique.has(path)) ||
    JSON.stringify(currentSourceInputs) !== JSON.stringify(approvedReview.sourceInputs) ||
    digestRecords(currentSourceInputs) !== approvedReview.sourceInputSha256
  ) {
    fail("Workspace release controls do not match the sealed review inputs.");
  }
  return paths;
}

export function parsePreflightArguments(argv) {
  const forwarded = [];
  let workspaceRoot;
  const args = [...argv];
  while (args.length) {
    const key = args.shift();
    if (key === "--workspace-root") {
      if (workspaceRoot !== undefined || !args.length) fail("Exactly one --workspace-root is required.");
      workspaceRoot = args.shift();
    } else forwarded.push(key);
  }
  if (!workspaceRoot || !isAbsolute(workspaceRoot)) {
    fail("--workspace-root must be an absolute path to the approved demo worktree.");
  }
  return { workspaceRoot: resolve(workspaceRoot), forwarded };
}

function argumentValue(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || index === args.length - 1 || args.indexOf(name, index + 1) >= 0) {
    fail(`Exactly one ${name} value is required.`);
  }
  return args[index + 1];
}

async function snapshotSourceInputs(workspaceRoot, approvedReview) {
  const records = [];
  const bytesByPath = new Map();
  for (const record of approvedReview.sourceInputs) {
    const bytes = await readFile(resolve(workspaceRoot, record.path));
    if (bytes.byteLength !== record.bytes || sha256(bytes) !== record.sha256) {
      fail(`Workspace source input changed before execution snapshot: ${record.path}`);
    }
    records.push({ path: record.path, bytes: bytes.byteLength, sha256: record.sha256 });
    bytesByPath.set(record.path, bytes);
  }
  validatePreflightSourceInputSeal(approvedReview, records);
  return Object.freeze({ records, bytesByPath });
}

async function main() {
  const { workspaceRoot, forwarded } = parsePreflightArguments(process.argv.slice(2));
  if (resolve(workspaceRoot, "release-review", "submission-public-release-candidate") !== candidateRoot) {
    fail("The sealed preflight is not inside the approved workspace public-release candidate.");
  }
  const candidateSnapshot = await snapshotCandidateIntegrity();
  const releaseIntegrity = candidateSnapshot.manifest;
  if (argumentValue(forwarded, "--approved-release-sha256") !== releaseIntegrity.approvalSha256) {
    fail("The requested public-release SHA-256 does not match this sealed candidate.");
  }
  const releaseManifest = JSON.parse(
    candidateSnapshot.sourceFiles.get("release-manifest.json").toString("utf8"),
  );
  const approvedReview = JSON.parse(
    candidateSnapshot.sourceFiles.get("approved-review-manifest.json").toString("utf8"),
  );
  if (releaseManifest.datasetVersion !== releaseIntegrity.datasetVersion) {
    fail("The public candidate release and integrity manifests disagree.");
  }
  validateIntegrityEnvelope({
    manifest: approvedReview,
    expectedKind: "synthetic_local_review_candidate",
    expectedDatasetVersion: releaseIntegrity.datasetVersion,
    expectedLicenseStatus: "pending_explicit_approval",
    label: "approved review manifest",
  });
  if (approvedReview.approvalSha256 !== releaseManifest.approvedReviewCandidateSha256) {
    fail("The public candidate does not carry its matching approved review seal.");
  }
  validatePreflightSourceInputSeal(approvedReview, approvedReview.sourceInputs);
  const sourceSnapshot = await snapshotSourceInputs(workspaceRoot, approvedReview);
  const temporary = await mkdtemp(resolve(tmpdir(), "rd-webmcp-finalize-controls-"));
  try {
    for (const record of sourceSnapshot.records) {
      const target = resolve(temporary, record.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, sourceSnapshot.bytesByPath.get(record.path), { flag: "wx" });
    }
    const finalizer = resolve(temporary, "scripts/finalize-public-release.mjs");
    const { stdout, stderr } = await execFileAsync(process.execPath, [finalizer, ...forwarded], {
      cwd: workspaceRoot,
      env: { ...process.env, RD_WEBMCP_FINALIZE_WORKSPACE_ROOT: workspaceRoot },
      maxBuffer: 20 * 1024 * 1024,
    });
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
