import assert from "node:assert/strict";
import { appendFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadVerifiedBaseline, maintenancePaths, readArchivedManifest } from "./verify.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const manifestPath = "release-integrity-manifest.json";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "rd-webmcp-maintenance-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const { bytes: manifestBytes, records } = await readArchivedManifest(repositoryRoot);
  await writeFile(join(root, manifestPath), manifestBytes);
  for (const { path } of records) {
    const destination = join(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(join(repositoryRoot, path)));
  }
  for (const path of maintenancePaths) {
    const destination = join(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, "maintenance fixture\n");
  }
  return { root, archivedFileCount: records.length + 1 };
}

test("accepts the exact archived source plus the maintenance inventory", async (t) => {
  const { root, archivedFileCount } = await fixture(t);
  const verifiedFiles = await loadVerifiedBaseline(root);
  assert.equal(verifiedFiles.size, archivedFileCount);
  assert.deepEqual(verifiedFiles.get(manifestPath), await readFile(join(root, manifestPath)));
  assert.equal(verifiedFiles.has("SECURITY.md"), false);
});

test("rejects an altered archived source file", async (t) => {
  const { root } = await fixture(t);
  await appendFile(join(root, "README.md"), "\nChanged archived content.\n");
  await assert.rejects(loadVerifiedBaseline(root), /Archived source differs .* README\.md/);
});

test("rejects an altered archived manifest even when the JSON still parses", async (t) => {
  const { root } = await fixture(t);
  await appendFile(join(root, manifestPath), "\n");
  await assert.rejects(loadVerifiedBaseline(root), /Archived manifest digest differs/);
});

test("rejects unexpected source files", async (t) => {
  const { root } = await fixture(t);
  await writeFile(join(root, "maintenance/extra.md"), "unexpected\n");
  await assert.rejects(loadVerifiedBaseline(root), /Unexpected source file: maintenance\/extra\.md/);
});

test("rejects symbolic links in place of allowed maintenance files", async (t) => {
  const { root } = await fixture(t);
  const securityPolicy = join(root, "SECURITY.md");
  await rm(securityPolicy);
  await symlink("README.md", securityPolicy);
  await assert.rejects(loadVerifiedBaseline(root), /Symbolic link is not allowed: SECURITY\.md/);
});
