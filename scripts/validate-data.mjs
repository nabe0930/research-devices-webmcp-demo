import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDataStore } from "../src/data-store.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

async function readJson(name) {
  return JSON.parse(await readFile(resolve(root, "data", name), "utf8"));
}

export async function validateCandidateData() {
  const [profile, catalog, prices, literature] = await Promise.all([
    readJson("profile.synthetic.json"),
    readJson("catalog.synthetic.json"),
    readJson("prices.synthetic.json"),
    readJson("literature.synthetic.json"),
  ]);
  const data = createDataStore({
    profile,
    catalog,
    prices,
    literature,
    baseUrl: "https://synthetic-demo.example.test/",
  });
  if (!catalog.products.every((product) => product.id.startsWith("rd-syn-"))) {
    throw new Error("Every public product ID must use the rd-syn- prefix.");
  }
  if (
    catalog.manufacturers.length !== 1 ||
    catalog.manufacturers[0].id !== "rd-synthetic-lab"
  ) {
    throw new Error("Only the entrant-owned synthetic author label is allowed.");
  }
  if (!prices.observations.every((row) => row.id.startsWith("price-rd-syn-"))) {
    throw new Error("Every public price ID must use the synthetic prefix.");
  }
  if (!literature.records.every((row) => row.id.startsWith("rdm-"))) {
    throw new Error("Every public methods-record ID must use the rdm- prefix.");
  }
  return data;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = await validateCandidateData();
  console.log(
    `synthetic candidate data: PASS products=${data.profile.counts.products} prices=${data.profile.counts.priceObservations} signals=${data.profile.counts.literatureSignals} records=${data.profile.counts.corpusRecords}`,
  );
}
