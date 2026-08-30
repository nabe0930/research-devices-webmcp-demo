import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

function fail(message) {
  throw new Error(message);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeRelative(root, path) {
  const value = relative(root, path).split(sep).join("/");
  if (!value || value === ".." || value.startsWith("../") || value.includes("/../")) {
    fail("Integrity path escapes its declared root.");
  }
  return value;
}

export async function listRegularFiles(
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
      } else if (entry.isFile()) {
        result.push(rel);
      } else {
        fail(`Special files are forbidden: ${rel}`);
      }
    }
  }

  await visit(root);
  return result.sort();
}

export async function hashFileRecords(root, relativePaths) {
  const records = [];
  for (const path of [...relativePaths].sort()) {
    if (
      typeof path !== "string" ||
      path.startsWith("/") ||
      path === ".." ||
      path.startsWith("../") ||
      path.split("/").includes("..")
    ) {
      fail(`Unsafe integrity path: ${path}`);
    }
    const bytes = await readFile(resolve(root, path));
    records.push({ path, bytes: bytes.byteLength, sha256: sha256(bytes) });
  }
  return records;
}

export function digestRecords(records) {
  return sha256(`${JSON.stringify(records)}\n`);
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

export function digestApprovalManifest(manifest) {
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

export function validateIntegrityEnvelope({
  manifest,
  expectedKind,
  expectedDatasetVersion,
  expectedLicenseStatus,
  label = "integrity manifest",
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

const verifiedMutableSourcePaths = new Set([
  "DATA-NOTICE.md",
  "README.md",
  "docs/TESTING.md",
  "release-manifest.json",
]);

export function validateVerifiedEvidenceCounts({
  approvedRelease,
  repositoryVerification,
  deploymentVerification,
}) {
  if (
    !Number.isInteger(approvedRelease?.fileCount) ||
    !Number.isInteger(approvedRelease?.distFileCount) ||
    repositoryVerification?.filesMatched !== approvedRelease.fileCount + 1 ||
    deploymentVerification?.httpFilesMatched !== approvedRelease.distFileCount
  ) {
    fail("Verified publication counts do not match the approved public-release manifest.");
  }
  return true;
}

export function validateVerifiedSourceTransition({
  approvedRelease,
  verifiedRelease,
  approvedReleaseIntegrityRecord,
}) {
  validateRecordList(approvedRelease?.files, "approved public-release files");
  validateRecordList(verifiedRelease?.files, "verified public-release files");
  if (
    approvedReleaseIntegrityRecord?.path !== "approved-release-integrity-manifest.json" ||
    !Number.isInteger(approvedReleaseIntegrityRecord.bytes) ||
    approvedReleaseIntegrityRecord.bytes < 0 ||
    !/^[a-f0-9]{64}$/.test(approvedReleaseIntegrityRecord.sha256 ?? "")
  ) {
    fail("Approved public-release manifest record is invalid.");
  }
  const approvedByPath = new Map(approvedRelease.files.map((record) => [record.path, record]));
  if (approvedByPath.has(approvedReleaseIntegrityRecord.path)) {
    fail("Approved public-release manifest record already exists in the approved source set.");
  }
  const expectedPaths = [
    ...approvedByPath.keys(),
    approvedReleaseIntegrityRecord.path,
  ].sort();
  const actualPaths = verifiedRelease.files.map((record) => record.path);
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    fail("Verified candidate source set is not the exact approved transition.");
  }
  for (const record of verifiedRelease.files) {
    if (record.path === approvedReleaseIntegrityRecord.path) {
      if (JSON.stringify(record) !== JSON.stringify(approvedReleaseIntegrityRecord)) {
        fail("Verified candidate does not contain the exact approved-release manifest bytes.");
      }
      continue;
    }
    if (
      !verifiedMutableSourcePaths.has(record.path) &&
      JSON.stringify(record) !== JSON.stringify(approvedByPath.get(record.path))
    ) {
      fail(`Verified candidate changed an immutable approved source: ${record.path}`);
    }
  }
  return true;
}

export async function createIntegrityManifest({
  root,
  manifestPath,
  kind,
  datasetVersion,
  licenseStatus,
  sourceRoot,
  sourceInputPaths,
  distRoot,
}) {
  const paths = await listRegularFiles(root, { excludedPaths: [manifestPath] });
  const files = await hashFileRecords(root, paths);
  const manifest = {
    schemaVersion: 1,
    kind,
    datasetVersion,
    licenseStatus,
    fileCount: files.length,
    files,
    contentSha256: digestRecords(files),
  };
  if (sourceRoot && sourceInputPaths) {
    const sourceInputs = await hashFileRecords(sourceRoot, sourceInputPaths);
    manifest.sourceInputCount = sourceInputs.length;
    manifest.sourceInputs = sourceInputs;
    manifest.sourceInputSha256 = digestRecords(sourceInputs);
  }
  if (distRoot) {
    const distPaths = await listRegularFiles(distRoot, { ignoredDirectoryNames: [] });
    const distFiles = await hashFileRecords(distRoot, distPaths);
    manifest.distFileCount = distFiles.length;
    manifest.distFiles = distFiles;
    manifest.distSha256 = digestRecords(distFiles);
  }
  manifest.approvalSha256 = digestApprovalManifest(manifest);
  return manifest;
}

export async function validateIntegrityManifest({
  root,
  manifestPath,
  expectedKind,
  expectedDatasetVersion,
  expectedLicenseStatus,
  allowMissingDist = false,
}) {
  const manifest = JSON.parse(await readFile(resolve(root, manifestPath), "utf8"));
  validateIntegrityEnvelope({
    manifest,
    expectedKind,
    expectedDatasetVersion,
    expectedLicenseStatus,
    label: manifestPath,
  });
  const paths = await listRegularFiles(root, { excludedPaths: [manifestPath] });
  const files = await hashFileRecords(root, paths);
  if (
    manifest.fileCount !== files.length ||
    JSON.stringify(manifest.files) !== JSON.stringify(files) ||
    manifest.contentSha256 !== digestRecords(files)
  ) {
    fail(`Integrity manifest does not match candidate files: ${manifestPath}`);
  }
  if (manifest.distFiles !== undefined) {
    const distRoot = resolve(root, "dist");
    let distPaths;
    try {
      distPaths = await listRegularFiles(distRoot, { ignoredDirectoryNames: [] });
    } catch (error) {
      if (allowMissingDist && error?.code === "ENOENT") return manifest;
      throw error;
    }
    const distFiles = await hashFileRecords(distRoot, distPaths);
    if (
      manifest.distFileCount !== distFiles.length ||
      JSON.stringify(manifest.distFiles) !== JSON.stringify(distFiles) ||
      manifest.distSha256 !== digestRecords(distFiles)
    ) {
      fail(`Integrity manifest does not match build output: ${manifestPath}`);
    }
  }
  return manifest;
}

export async function snapshotIntegrityManifest({
  root,
  manifestPath,
  expectedKind,
  expectedDatasetVersion,
  expectedLicenseStatus,
  expectedApprovalSha256,
}) {
  const integrityBytes = await readFile(resolve(root, manifestPath));
  const manifest = JSON.parse(integrityBytes.toString("utf8"));
  validateIntegrityEnvelope({
    manifest,
    expectedKind,
    expectedDatasetVersion: expectedDatasetVersion ?? manifest.datasetVersion,
    expectedLicenseStatus,
    label: manifestPath,
  });
  if (
    expectedApprovalSha256 !== undefined &&
    manifest.approvalSha256 !== expectedApprovalSha256
  ) {
    fail(`Integrity manifest does not match the explicitly approved SHA-256: ${manifestPath}`);
  }
  const canonicalIntegrity = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  if (!integrityBytes.equals(canonicalIntegrity)) {
    fail(`Integrity manifest is not canonical: ${manifestPath}`);
  }

  const paths = await listRegularFiles(root, { excludedPaths: [manifestPath] });
  if (JSON.stringify(paths) !== JSON.stringify(manifest.files.map((record) => record.path))) {
    fail(`Integrity manifest does not match the exact candidate file set: ${manifestPath}`);
  }
  const sourceFiles = new Map();
  for (const record of manifest.files) {
    const bytes = await readFile(resolve(root, record.path));
    if (bytes.byteLength !== record.bytes || sha256(bytes) !== record.sha256) {
      fail(`Integrity manifest file changed during immutable snapshot: ${record.path}`);
    }
    sourceFiles.set(record.path, bytes);
  }

  const distFiles = new Map();
  if (manifest.distFiles !== undefined) {
    const distRoot = resolve(root, "dist");
    const distPaths = await listRegularFiles(distRoot, { ignoredDirectoryNames: [] });
    if (JSON.stringify(distPaths) !== JSON.stringify(manifest.distFiles.map((record) => record.path))) {
      fail(`Integrity manifest does not match the exact build file set: ${manifestPath}`);
    }
    for (const record of manifest.distFiles) {
      const bytes = await readFile(resolve(distRoot, record.path));
      if (bytes.byteLength !== record.bytes || sha256(bytes) !== record.sha256) {
        fail(`Build file changed during immutable snapshot: dist/${record.path}`);
      }
      distFiles.set(record.path, bytes);
    }
  }
  return Object.freeze({ manifest, sourceFiles, distFiles, integrityBytes });
}
