import assert from "node:assert/strict";
import test from "node:test";
import { createDataStore } from "../src/data-store.js";
import { createToolHandlers } from "../src/tools.js";
import { loadFixtureData } from "./helpers.mjs";

const data = await loadFixtureData();
const tools = createToolHandlers(() => Promise.resolve(data));

function rebuildData(mutator) {
  const fixture = {
    profile: structuredClone(data.profile),
    catalog: structuredClone(data.catalog),
    prices: structuredClone(data.prices),
    literature: structuredClone(data.literature),
  };
  mutator(fixture);
  return () => createDataStore({
    ...fixture,
    baseUrl: "https://synthetic-demo.example.test/",
  });
}

test("synthetic profile count boundary is exact", () => {
  assert.deepEqual(data.profile.counts, {
    products: 8,
    categories: 3,
    manufacturers: 1,
    schemaAlignedSpecCells: 72,
    priceObservations: 9,
    priceProducts: 8,
    literatureSignals: 8,
    corpusRecords: 12,
  });
});

test("search returns RD-SYN qPCR A and B from the bounded active set", async () => {
  const result = await tools.search_devices({
    query: "RD-SYN qPCR",
    categoryId: "qpcr",
    status: "active",
    limit: 2,
  });
  assert.equal(result.total, 4);
  assert.deepEqual(result.items.map((item) => item.id), ["rd-syn-qpcr-a", "rd-syn-qpcr-b"]);
  assert.ok(result.items.every((item) => item.productUrl.startsWith("https://synthetic-demo.example.test/devices/")));
  assert.match(result.limitations.join(" "), /fictional/i);
});

test("search defaults exclude discontinued records and status all includes them", async () => {
  const active = await tools.search_devices({ categoryId: "automated-cell-counting" });
  const all = await tools.search_devices({ categoryId: "automated-cell-counting", status: "all" });
  assert.deepEqual(active.items.map((item) => item.id), ["rd-syn-cell-counter-a"]);
  assert.deepEqual(all.items.map((item) => item.id), [
    "rd-syn-cell-counter-a",
    "rd-syn-cell-counter-b",
  ]);
});

test("compare preserves product order and normalized qPCR differences", async () => {
  const result = await tools.compare_devices({
    productIds: ["rd-syn-qpcr-a", "rd-syn-qpcr-b"],
    maxSpecs: 10,
  });
  assert.deepEqual(result.products.map((item) => item.id), ["rd-syn-qpcr-a", "rd-syn-qpcr-b"]);
  const values = new Map(result.items.map((row) => [row.key, row.values.map((item) => item.value)]));
  assert.deepEqual(values.get("reaction_volume_min_ul"), [10, 5]);
  assert.deepEqual(values.get("detection_channels"), [4, 6]);
  assert.deepEqual(values.get("multiplex_targets"), [4, 6]);
  assert.deepEqual(values.get("max_ramp_rate_c_per_s"), [4.5, 6]);
  assert.deepEqual(values.get("audit_trail"), [false, true]);
  assert.deepEqual(values.get("remote_monitoring"), [false, true]);
  assert.match(result.limitations.join(" "), /no winner is inferred/i);
});

test("compare rejects cross-category and duplicate inputs", async () => {
  await assert.rejects(
    tools.compare_devices({ productIds: ["rd-syn-qpcr-a", "rd-syn-microvolume-a"] }),
    (error) => error.code === "category_mismatch",
  );
  await assert.rejects(
    tools.compare_devices({ productIds: ["rd-syn-qpcr-a", "rd-syn-qpcr-a"] }),
    (error) => error.code === "invalid_input",
  );
});

test("price scenarios preserve range, reference, stated range, and starting-at semantics", async () => {
  const result = await tools.get_price_range({
    productIds: ["rd-syn-qpcr-a", "rd-syn-qpcr-b", "rd-syn-qpcr-c", "rd-syn-qpcr-d"],
    currency: "JPY",
  });
  const items = new Map(result.items.map((item) => [item.productId, item.groups[0]]));
  assert.deepEqual(items.get("rd-syn-qpcr-a").range, { min: 4_800_000, max: 5_100_000 });
  assert.equal(items.get("rd-syn-qpcr-a").rangeStatus, "comparable_observations");
  assert.equal(items.get("rd-syn-qpcr-b").referencePrice, 6_900_000);
  assert.equal(items.get("rd-syn-qpcr-b").rangeStatus, "single_observation");
  assert.deepEqual(items.get("rd-syn-qpcr-c").range, { min: 8_200_000, max: 9_000_000 });
  assert.equal(items.get("rd-syn-qpcr-c").rangeStatus, "source_stated_range");
  assert.equal(items.get("rd-syn-qpcr-d").startingAt, 2_400_000);
  assert.equal(items.get("rd-syn-qpcr-d").rangeStatus, "starting_at_only");
  assert.match(result.limitations.join(" "), /fictional/i);
  assert.match(result.limitations.join(" "), /not offers/i);
});

test("price currency filter never converts unavailable records", async () => {
  const result = await tools.get_price_range({
    productIds: ["rd-syn-microvolume-a"],
    currency: "JPY",
  });
  assert.equal(result.items[0].available, false);
  assert.equal(result.items[0].groups.length, 0);
});

test("synthetic methods signal is derived from the twelve-record corpus", async () => {
  const result = await tools.get_literature_signal({
    productIds: ["rd-syn-qpcr-a", "rd-syn-qpcr-b"],
  });
  assert.equal(result.items[0].mentionRecordCount, 7);
  assert.equal(result.items[1].mentionRecordCount, 6);
  for (const item of result.items) {
    const derived = data.literature.records
      .filter((record) => record.mentionedProductIds.includes(item.productId))
      .map((record) => record.id);
    assert.deepEqual(item.sourceRecordIds, derived);
    assert.equal(item.status, "synthetic_corpus_signal");
  }
  assert.match(result.limitations.join(" "), /not publication counts/i);
});

test("bounded inputs reject empty search, unknown fields, and unknown IDs", async () => {
  await assert.rejects(tools.search_devices({}), (error) => error.code === "invalid_input");
  await assert.rejects(
    tools.search_devices({ query: "RD-SYN", extra: true }),
    (error) => error.code === "invalid_input",
  );
  await assert.rejects(
    tools.get_literature_signal({ productIds: ["not-a-product"] }),
    (error) => error.code === "unknown_product",
  );
});

test("dataset validation rejects newly enabled external publication boundaries", () => {
  for (const flag of [
    "thirdPartyProductUrlsIncluded",
    "externalImagesIncluded",
    "externalScriptsIncluded",
  ]) {
    assert.throws(
      rebuildData(({ profile }) => {
        profile.publicationBoundary[flag] = true;
      }),
      (error) => error.code === "invalid_dataset" && error.message.includes(flag),
    );
  }
});

test("dataset validation rejects duplicate product signals", () => {
  assert.throws(
    rebuildData(({ literature }) => {
      literature.signals[1].productId = literature.signals[0].productId;
      literature.signals[1].mentionRecordCount = literature.signals[0].mentionRecordCount;
      literature.signals[1].sourceRecordIds = [...literature.signals[0].sourceRecordIds];
      literature.signals[1].productPath = literature.signals[0].productPath;
    }),
    (error) => error.code === "invalid_dataset" && /duplicate product ID/i.test(error.message),
  );
});

test("dataset validation rejects spec keys outside the declared category schema", () => {
  assert.throws(
    rebuildData(({ catalog }) => {
      const product = catalog.products[0];
      const value = product.specs.sample_capacity_wells;
      delete product.specs.sample_capacity_wells;
      product.specs.undeclared_capacity = value;
    }),
    (error) => error.code === "invalid_dataset" && /declared schema/i.test(error.message),
  );
});

test("dataset validation enforces declared spec types and rejects absolute URLs", () => {
  assert.throws(
    rebuildData(({ catalog }) => {
      catalog.products[0].specs.sample_capacity_wells = "96";
    }),
    (error) => error.code === "invalid_dataset" && /finite number/i.test(error.message),
  );
  assert.throws(
    rebuildData(({ catalog }) => {
      catalog.products[0].summaryEn = "https://outside.example.test/product";
    }),
    (error) => error.code === "invalid_dataset" && /forbidden absolute URL/i.test(error.message),
  );
});

test("dataset validation rejects inverted or semantically invalid price values", () => {
  assert.throws(
    rebuildData(({ prices }) => {
      const range = prices.observations.find(
        (row) => row.basis === "synthetic_scenario_range",
      );
      [range.minAmount, range.maxAmount] = [range.maxAmount, range.minAmount];
    }),
    (error) => error.code === "invalid_dataset" && /invalid stated range/i.test(error.message),
  );
  assert.throws(
    rebuildData(({ prices }) => {
      prices.observations[0].amount = "4800000";
    }),
    (error) => error.code === "invalid_dataset" && /invalid point value/i.test(error.message),
  );
});

test("dataset validation accepts a coherent approved license state in memory", () => {
  assert.doesNotThrow(
    rebuildData(({ profile, catalog, prices, literature }) => {
      profile.licenseStatus = "applied";
      profile.licenses = { code: "MIT", data: "CC-BY-4.0" };
      delete profile.intendedLicenses;
      for (const dataset of [catalog, prices, literature]) {
        dataset.licenseStatus = "applied";
        dataset.license = "CC-BY-4.0";
        delete dataset.intendedLicense;
      }
    }),
  );
});

test("dataset validation rejects mixed pending and applied license states", () => {
  assert.throws(
    rebuildData(({ profile, catalog, prices, literature }) => {
      profile.licenseStatus = "applied";
      profile.licenses = { code: "MIT", data: "CC-BY-4.0" };
      delete profile.intendedLicenses;
      for (const dataset of [catalog, prices, literature]) {
        dataset.licenseStatus = "applied";
        dataset.license = "CC-BY-4.0";
        delete dataset.intendedLicense;
      }
      catalog.licenseStatus = "pending_explicit_approval";
      catalog.intendedLicense = "CC-BY-4.0";
      delete catalog.license;
    }),
    (error) => error.code === "invalid_dataset" && /applied license state/i.test(error.message),
  );
});
