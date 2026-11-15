import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const archivedCommit = "18dc41c222afc41d1cfb6230175bc6eac6fa279a";
const manifestPath = "release-integrity-manifest.json";
const manifestDigest = "874f734cec7b130a945d6fdceb419daed2310114d7f383d92a2a7b83dfae7951";

export const maintenancePaths = Object.freeze([
  ".github/dependabot.yml",
  ".github/workflows/security-verify.yml",
  "SECURITY.md",
  "maintenance/README.md",
  "maintenance/verify.mjs",
  "maintenance/verify.test.mjs",
]);

// Git metadata and disposable root build/dependency directories are outside the source set.
// The archived verification builds a fresh dist in its isolated directory.
const generatedDirectories = new Set(["dist", "node_modules"]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function listSourceFiles(root, directory = "") {
  const files = [];
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  for (const entry of entries) {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Symbolic link is not allowed: ${path}`);
    if (!directory && entry.isDirectory() && generatedDirectories.has(entry.name)) continue;
    if (path === ".git" && (entry.isDirectory() || entry.isFile())) continue;
    if (entry.isDirectory()) {
      files.push(...await listSourceFiles(root, path));
    } else if (entry.isFile()) {
      files.push(path);
    } else {
      throw new Error(`Special file is not allowed: ${path}`);
    }
  }
  return files;
}

export async function readArchivedManifest(root = repositoryRoot) {
  const manifestBytes = await readFile(join(root, manifestPath));
  if (sha256(manifestBytes) !== manifestDigest) {
    throw new Error(`Archived manifest digest differs from commit ${archivedCommit}.`);
  }
  return { bytes: manifestBytes, records: JSON.parse(manifestBytes.toString("utf8")).files };
}

export async function loadVerifiedBaseline(root = repositoryRoot) {
  const actualPaths = new Set(await listSourceFiles(root));
  if (!actualPaths.has(manifestPath)) throw new Error(`Missing archived manifest: ${manifestPath}`);

  const { bytes: manifestBytes, records } = await readArchivedManifest(root);
  const expectedPaths = new Set([manifestPath, ...records.map(({ path }) => path), ...maintenancePaths]);
  for (const path of [...actualPaths].sort()) {
    if (!expectedPaths.has(path)) throw new Error(`Unexpected source file: ${path}`);
  }
  for (const path of expectedPaths) {
    if (!actualPaths.has(path)) throw new Error(`Missing source file: ${path}`);
  }

  const verifiedFiles = new Map([[manifestPath, manifestBytes]]);
  for (const record of records) {
    const bytes = await readFile(join(root, record.path));
    if (bytes.length !== record.bytes || sha256(bytes) !== record.sha256) {
      throw new Error(`Archived source differs from commit ${archivedCommit}: ${record.path}`);
    }
    verifiedFiles.set(record.path, bytes);
  }
  return verifiedFiles;
}

async function verifyMaintenance() {
  const verifiedFiles = await loadVerifiedBaseline();
  const snapshot = await mkdtemp(join(tmpdir(), "rd-webmcp-maintenance-"));
  try {
    for (const [path, bytes] of verifiedFiles) {
      const destination = join(snapshot, path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
    }

    const result = spawnSync("npm", ["run", "verify"], { cwd: snapshot, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Archived verification failed (${result.signal ?? `exit ${result.status}`}).`);
    }
    console.log(`Verified the archived source from ${archivedCommit} and the maintenance file boundary.`);
  } finally {
    await rm(snapshot, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await verifyMaintenance();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
