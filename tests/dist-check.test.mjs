import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { assertBuildParity } from "../scripts/check-dist.mjs";

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "rd-webmcp-dist-"));
  await mkdir(resolve(root, "dist"), { recursive: true });
  await writeFile(resolve(root, "asset.txt"), "current\n");
  await writeFile(resolve(root, "dist/asset.txt"), "current\n");
  return root;
}

test("dist parity accepts an exact byte-for-byte allowlist", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(await assertBuildParity({ root, expected: ["asset.txt"] }), 1);
});

test("dist parity rejects stale content and extra files", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(resolve(root, "dist/asset.txt"), "stale!!\n");
  await assert.rejects(
    assertBuildParity({ root, expected: ["asset.txt"] }),
    /stale or modified/i,
  );
  await writeFile(resolve(root, "dist/asset.txt"), "current\n");
  await writeFile(resolve(root, "dist/extra.txt"), "extra\n");
  await assert.rejects(
    assertBuildParity({ root, expected: ["asset.txt"] }),
    /allowlist/i,
  );
});

test("dist parity rejects symbolic links", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await rm(resolve(root, "dist/asset.txt"));
  await symlink(resolve(root, "asset.txt"), resolve(root, "dist/asset.txt"));
  await assert.rejects(
    assertBuildParity({ root, expected: ["asset.txt"] }),
    /symbolic link/i,
  );
});
