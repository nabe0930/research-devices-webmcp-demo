const DATA_PATHS = Object.freeze({
  profile: "/data/profile.synthetic.json",
  catalog: "/data/catalog.synthetic.json",
  prices: "/data/prices.synthetic.json",
  literature: "/data/literature.synthetic.json",
});

const MAX_BYTES = Object.freeze({
  profile: 100_000,
  catalog: 1_000_000,
  prices: 500_000,
  literature: 1_000_000,
});

let cachedData;

export class DemoDataError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "DemoDataError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new DemoDataError(code, message, details);
}

export function isSafePublicUrl(value) {
  if (typeof value !== "string") return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  return (
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost", "::1"].includes(url.hostname)
  );
}

export function toPublicUrl(path, baseUrl) {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    fail("invalid_dataset", "Synthetic data contains an unsafe public path.");
  }
  const url = new URL(path, baseUrl).href;
  if (!isSafePublicUrl(url)) {
    fail("invalid_dataset", "Synthetic data resolved to an unsafe public URL.");
  }
  return url;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_dataset", `${label} must be an object.`);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value)) fail("invalid_dataset", `${label} must be an array.`);
}

function assertUniqueIds(rows, label) {
  const ids = new Set();
  for (const row of rows) {
    if (!row || typeof row.id !== "string" || !row.id) {
      fail("invalid_dataset", `${label} contains an invalid ID.`);
    }
    if (ids.has(row.id)) fail("invalid_dataset", `${label} contains a duplicate ID.`);
    ids.add(row.id);
  }
  return ids;
}

function assertSafeRootRelativePath(value, label) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    value.split(/[?#]/)[0].split("/").includes("..")
  ) {
    fail("invalid_dataset", `${label} contains an unsafe public path.`);
  }
}

function assertExactKeys(value, expected, label) {
  assertPlainObject(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail("invalid_dataset", `${label} does not match the declared schema.`);
  }
}

function assertNoAbsoluteUrls(value, label, depth = 0) {
  if (depth > 20) fail("invalid_dataset", `${label} is nested too deeply.`);
  if (typeof value === "string") {
    if (/\b(?:https?|javascript):/i.test(value)) {
      fail("invalid_dataset", `${label} contains a forbidden absolute URL.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoAbsoluteUrls(item, `${label}[${index}]`, depth + 1));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) =>
      assertNoAbsoluteUrls(item, `${label}.${key}`, depth + 1),
    );
  }
}

function assertSpecValue(value, spec, label) {
  if (spec.type === "number" && !Number.isFinite(value)) {
    fail("invalid_dataset", `${label} must be a finite number.`);
  }
  if (spec.type === "boolean" && typeof value !== "boolean") {
    fail("invalid_dataset", `${label} must be boolean.`);
  }
  if (
    spec.type === "enum" &&
    (typeof value !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value))
  ) {
    fail("invalid_dataset", `${label} must be a bounded enum token.`);
  }
  if (!["number", "boolean", "enum"].includes(spec.type)) {
    fail("invalid_dataset", `${label} declares an unsupported spec type.`);
  }
}

function validateLicenseState(profile, datasets) {
  if (profile.licenseStatus === "pending_explicit_approval") {
    if (
      profile.intendedLicenses?.code !== "MIT" ||
      profile.intendedLicenses?.data !== "CC-BY-4.0" ||
      profile.licenses !== undefined
    ) {
      fail("invalid_dataset", "The local candidate has an inconsistent license review state.");
    }
    for (const [label, value] of datasets) {
      if (
        value.licenseStatus !== "pending_explicit_approval" ||
        value.intendedLicense !== "CC-BY-4.0" ||
        value.license !== undefined
      ) {
        fail("invalid_dataset", `${label} has an inconsistent license review state.`);
      }
    }
    return;
  }
  if (profile.licenseStatus === "applied") {
    if (
      profile.licenses?.code !== "MIT" ||
      profile.licenses?.data !== "CC-BY-4.0" ||
      profile.intendedLicenses !== undefined
    ) {
      fail("invalid_dataset", "The public candidate has an inconsistent applied license state.");
    }
    for (const [label, value] of datasets) {
      if (
        value.licenseStatus !== "applied" ||
        value.license !== "CC-BY-4.0" ||
        value.intendedLicense !== undefined
      ) {
        fail("invalid_dataset", `${label} has an inconsistent applied license state.`);
      }
    }
    return;
  }
  fail("invalid_dataset", "The synthetic dataset has an unsupported license state.");
}

function validateData(profile, catalog, prices, literature) {
  [profile, catalog, prices, literature].forEach((value, index) =>
    assertPlainObject(value, ["profile", "catalog", "prices", "literature"][index]),
  );
  assertNoAbsoluteUrls({ profile, catalog, prices, literature }, "synthetic dataset");
  if (profile.datasetKind !== "fully_synthetic_challenge_dataset") {
    fail("invalid_dataset", "The release profile is not fully synthetic.");
  }
  if (!profile.publicationBoundary?.fullySynthetic) {
    fail("invalid_dataset", "The release profile does not assert a synthetic boundary.");
  }
  for (const flag of [
    "thirdPartyProductDataIncluded",
    "thirdPartyProductMarksIncluded",
    "thirdPartyProductUrlsIncluded",
    "memberDataIncluded",
    "userGeneratedContentIncluded",
    "externalImagesIncluded",
    "externalScriptsIncluded",
  ]) {
    if (profile.publicationBoundary[flag] !== false) {
      fail("invalid_dataset", `The release profile has an unsafe ${flag} boundary.`);
    }
  }
  validateLicenseState(profile, [
    ["catalog", catalog],
    ["prices", prices],
    ["literature", literature],
  ]);
  const versions = [catalog.datasetVersion, prices.datasetVersion, literature.datasetVersion];
  if (versions.some((value) => value !== profile.datasetVersion)) {
    fail("invalid_dataset", "Synthetic dataset versions do not match.");
  }
  assertArray(catalog.products, "catalog.products");
  assertArray(catalog.categories, "catalog.categories");
  assertArray(catalog.manufacturers, "catalog.manufacturers");
  assertArray(prices.observations, "prices.observations");
  assertArray(literature.records, "literature.records");
  assertArray(literature.signals, "literature.signals");

  const productIds = assertUniqueIds(catalog.products, "catalog.products");
  const categoryIds = assertUniqueIds(catalog.categories, "catalog.categories");
  const manufacturerIds = assertUniqueIds(catalog.manufacturers, "catalog.manufacturers");
  const recordIds = assertUniqueIds(literature.records, "literature.records");
  assertUniqueIds(prices.observations, "prices.observations");

  const schemaByCategoryId = new Map();
  for (const category of catalog.categories) {
    assertArray(category.specSchema, `category ${category.id} specSchema`);
    const schema = new Map();
    for (const section of category.specSchema) {
      assertArray(section.specs, `category ${category.id} section specs`);
      for (const spec of section.specs) {
        if (!spec || typeof spec.key !== "string" || !spec.key || schema.has(spec.key)) {
          fail("invalid_dataset", `Category ${category.id} has an invalid spec schema.`);
        }
        schema.set(spec.key, spec);
      }
    }
    schemaByCategoryId.set(category.id, schema);
  }
  for (const manufacturer of catalog.manufacturers) {
    assertSafeRootRelativePath(manufacturer.websitePath, `manufacturer ${manufacturer.id} websitePath`);
  }

  for (const product of catalog.products) {
    if (!categoryIds.has(product.categoryId) || !manufacturerIds.has(product.manufacturerId)) {
      fail("invalid_dataset", "A product references an unknown category or author label.");
    }
    const schema = schemaByCategoryId.get(product.categoryId);
    assertExactKeys(product.specs, schema.keys(), `product ${product.id} specs`);
    for (const [key, value] of Object.entries(product.specs)) {
      assertSpecValue(value, schema.get(key), `product ${product.id} spec ${key}`);
    }
    assertExactKeys(
      product.paths,
      ["product", "catalogSource", "priceSource", "literatureSource", "dataNotice"],
      `product ${product.id} paths`,
    );
    for (const [label, path] of Object.entries(product.paths)) {
      assertSafeRootRelativePath(path, `product ${product.id} ${label}`);
    }
  }
  for (const observation of prices.observations) {
    if (!productIds.has(observation.productId)) {
      fail("invalid_dataset", "A price scenario references an unknown product.");
    }
    assertSafeRootRelativePath(observation.sourcePath, `price ${observation.id} sourcePath`);
    if (![/^[A-Z]{3}$/, /^[A-Z]{2}$/].every((pattern, index) =>
      pattern.test(index === 0 ? observation.currency : observation.scenarioMarket))) {
      fail("invalid_dataset", `Price ${observation.id} has an invalid currency or market.`);
    }
    if (
      typeof observation.configuration !== "string" ||
      !/^[a-z0-9][a-z0-9_-]{0,95}$/.test(observation.configuration)
    ) {
      fail("invalid_dataset", `Price ${observation.id} has an invalid configuration.`);
    }
    const allowedBases = new Set([
      "synthetic_scenario_price",
      "synthetic_scenario_range",
      "synthetic_scenario_starting_at",
    ]);
    if (!allowedBases.has(observation.basis)) {
      fail("invalid_dataset", `Price ${observation.id} has an invalid basis.`);
    }
    const hasAmount = Number.isFinite(observation.amount);
    const hasMin = Number.isFinite(observation.minAmount);
    const hasMax = Number.isFinite(observation.maxAmount);
    if (observation.basis === "synthetic_scenario_range") {
      if (
        hasAmount ||
        !hasMin ||
        !hasMax ||
        observation.minAmount <= 0 ||
        observation.minAmount > observation.maxAmount
      ) {
        fail("invalid_dataset", `Price ${observation.id} has an invalid stated range.`);
      }
    } else if (
      !hasAmount ||
      observation.amount <= 0 ||
      hasMin ||
      hasMax
    ) {
      fail("invalid_dataset", `Price ${observation.id} has an invalid point value.`);
    }
  }
  for (const record of literature.records) {
    if (!Array.isArray(record.mentionedProductIds)) {
      fail("invalid_dataset", "A corpus record has invalid product references.");
    }
    record.mentionedProductIds.forEach((id) => {
      if (!productIds.has(id)) fail("invalid_dataset", "A corpus record references an unknown product.");
    });
    assertSafeRootRelativePath(record.sourcePath, `record ${record.id} sourcePath`);
  }
  const signalProductIds = new Set();
  for (const signal of literature.signals) {
    if (!productIds.has(signal.productId)) {
      fail("invalid_dataset", "A literature signal references an unknown product.");
    }
    if (signalProductIds.has(signal.productId)) {
      fail("invalid_dataset", "Literature signals contain a duplicate product ID.");
    }
    signalProductIds.add(signal.productId);
    assertSafeRootRelativePath(
      signal.corpusSourcePath,
      `signal ${signal.productId} corpusSourcePath`,
    );
    assertSafeRootRelativePath(signal.productPath, `signal ${signal.productId} productPath`);
    const derivedIds = literature.records
      .filter((record) => record.mentionedProductIds.includes(signal.productId))
      .map((record) => record.id);
    if (
      signal.mentionRecordCount !== derivedIds.length ||
      JSON.stringify(signal.sourceRecordIds) !== JSON.stringify(derivedIds) ||
      signal.sourceRecordIds.some((id) => !recordIds.has(id))
    ) {
      fail("invalid_dataset", "A literature signal does not match the synthetic corpus.");
    }
  }
  if (signalProductIds.size !== productIds.size) {
    fail("invalid_dataset", "Every synthetic product must have exactly one literature signal.");
  }

  const actualCounts = {
    products: catalog.products.length,
    categories: catalog.categories.length,
    manufacturers: catalog.manufacturers.length,
    schemaAlignedSpecCells: catalog.products.reduce(
      (sum, product) => sum + Object.keys(product.specs ?? {}).length,
      0,
    ),
    priceObservations: prices.observations.length,
    priceProducts: new Set(prices.observations.map((row) => row.productId)).size,
    literatureSignals: literature.signals.length,
    corpusRecords: literature.records.length,
  };
  for (const [key, value] of Object.entries(actualCounts)) {
    if (profile.counts?.[key] !== value) {
      fail("invalid_dataset", `Profile count mismatch for ${key}.`);
    }
  }
}

export function createDataStore({ profile, catalog, prices, literature, baseUrl }) {
  validateData(profile, catalog, prices, literature);
  if (!isSafePublicUrl(new URL("/", baseUrl).href)) {
    fail("invalid_origin", "The demo origin must use HTTPS or loopback HTTP.");
  }
  const productById = new Map(catalog.products.map((row) => [row.id, row]));
  const categoryById = new Map(catalog.categories.map((row) => [row.id, row]));
  const manufacturerById = new Map(catalog.manufacturers.map((row) => [row.id, row]));
  const pricesByProductId = new Map();
  for (const row of prices.observations) {
    const values = pricesByProductId.get(row.productId) ?? [];
    values.push(row);
    pricesByProductId.set(row.productId, values);
  }
  const signalByProductId = new Map(
    literature.signals.map((row) => [row.productId, row]),
  );
  return Object.freeze({
    datasetVersion: profile.datasetVersion,
    baseUrl: new URL("/", baseUrl).href,
    profile,
    catalog,
    prices,
    literature,
    indexes: Object.freeze({
      productById,
      categoryById,
      manufacturerById,
      pricesByProductId,
      signalByProductId,
    }),
  });
}

async function fetchJson(label) {
  const origin = globalThis.location?.origin;
  if (!origin || !isSafePublicUrl(new URL("/", origin).href)) {
    fail("invalid_origin", "The page must run from HTTPS or a loopback HTTP origin.");
  }
  const url = new URL(DATA_PATHS[label], origin);
  if (url.origin !== origin) fail("dataset_fetch_failed", "Cross-origin data is forbidden.");
  let response;
  try {
    response = await globalThis.fetch(url.href, {
      credentials: "same-origin",
      redirect: "error",
    });
  } catch {
    fail("dataset_fetch_failed", `Could not load ${label} data.`);
  }
  if (!response?.ok || (response.url && new URL(response.url).origin !== origin)) {
    fail("dataset_fetch_failed", `Could not load ${label} data.`);
  }
  const text = await response.text();
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes === 0 || bytes > MAX_BYTES[label]) {
    fail("invalid_dataset", `${label} data has an unsafe size.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    fail("invalid_dataset", `${label} data is not valid JSON.`);
  }
}

export async function loadDemoData() {
  if (!cachedData) {
    cachedData = Promise.all(Object.keys(DATA_PATHS).map(fetchJson)).then(
      ([profile, catalog, prices, literature]) =>
        createDataStore({
          profile,
          catalog,
          prices,
          literature,
          baseUrl: globalThis.location.origin,
        }),
    );
    cachedData.catch(() => {
      cachedData = undefined;
    });
  }
  return cachedData;
}

export function resetDemoDataForTests() {
  cachedData = undefined;
}
