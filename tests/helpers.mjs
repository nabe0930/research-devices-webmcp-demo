import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDataStore } from "../src/data-store.js";

export async function loadFixtureData(baseUrl = "https://synthetic-demo.example.test/") {
  const readJson = async (name) =>
    JSON.parse(await readFile(resolve("data", name), "utf8"));
  const [profile, catalog, prices, literature] = await Promise.all([
    readJson("profile.synthetic.json"),
    readJson("catalog.synthetic.json"),
    readJson("prices.synthetic.json"),
    readJson("literature.synthetic.json"),
  ]);
  return createDataStore({ profile, catalog, prices, literature, baseUrl });
}

export function combinations(items, min = 1, max = items.length) {
  const result = [];
  const visit = (index, selected) => {
    if (selected.length >= min && selected.length <= max) result.push([...selected]);
    if (selected.length === max) return;
    for (let cursor = index; cursor < items.length; cursor += 1) {
      selected.push(items[cursor]);
      visit(cursor + 1, selected);
      selected.pop();
    }
  };
  visit(0, []);
  return result;
}
