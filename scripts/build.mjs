import { cp, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCandidateData } from "./validate-data.mjs";
import { buildFilesForCatalog } from "./build-contract.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const target = resolve(root, "dist");
const staging = resolve(root, `.dist-next-${process.pid}`);
const now = new Date();
const pad = (value) => String(value).padStart(2, "0");
const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function moveDirectory(source, destination) {
  try {
    await rename(source, destination);
  } catch (error) {
    if (error?.code !== "EXDEV") throw error;
    await cp(source, destination, {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
    await rm(source, { recursive: true, force: true });
  }
}

await validateCandidateData();
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });

const catalog = JSON.parse(
  await (await import("node:fs/promises")).readFile(
    resolve(root, "data/catalog.synthetic.json"),
    "utf8",
  ),
);
const files = buildFilesForCatalog(catalog);

for (const sourceRelative of files) {
  const source = resolve(root, sourceRelative);
  if (!(await exists(source))) throw new Error(`Missing build input: ${sourceRelative}`);
  const destination = resolve(staging, sourceRelative);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination);
}

async function list(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await list(path)));
    else if (entry.isFile()) result.push(relative(staging, path));
    else throw new Error("Build output contains an unsupported file type.");
  }
  return result.sort();
}

const actual = await list(staging);
const expected = [...files].sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error("Build output does not match the explicit allowlist.");
}

if (await exists(target)) {
  const backupDirectory = resolve(dirname(root), "_build-backups");
  const backup = resolve(backupDirectory, `${basename(root)}-dist.bak-${timestamp}`);
  if (await exists(backup)) throw new Error(`Build backup already exists: ${backup}`);
  await mkdir(backupDirectory, { recursive: true });
  await moveDirectory(target, backup);
}
await moveDirectory(staging, target);
console.log(`synthetic build: PASS files=${files.length}`);
