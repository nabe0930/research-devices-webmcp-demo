import { readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFilesForCatalog } from "./build-contract.mjs";

const defaultRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

async function list(directory, dist) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Build output contains a symbolic link.");
    if (entry.isDirectory()) result.push(...(await list(path, dist)));
    else if (entry.isFile()) result.push(relative(dist, path));
    else throw new Error("Build output contains an unsupported file type.");
  }
  return result;
}

export async function assertBuildParity({ root, expected }) {
  const dist = resolve(root, "dist");
  const actual = (await list(dist, dist)).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
    throw new Error("Build output does not match the explicit allowlist.");
  }
  for (const path of expected) {
    const [source, built] = await Promise.all([
      readFile(resolve(root, path)),
      readFile(resolve(dist, path)),
    ]);
    if (!source.equals(built)) throw new Error(`Build output is stale or modified: ${path}`);
  }
  return expected.length;
}

export async function checkDist(root = defaultRoot) {
  const catalog = JSON.parse(await readFile(resolve(root, "data/catalog.synthetic.json"), "utf8"));
  const expected = buildFilesForCatalog(catalog);
  return assertBuildParity({ root, expected });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const count = await checkDist();
  console.log(`synthetic build parity: PASS files=${count}`);
}
