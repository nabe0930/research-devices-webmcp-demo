import { DemoDataError, loadDemoData, toPublicUrl } from "./data-store.js";

function fail(code, message, details) {
  throw new DemoDataError(code, message, details);
}

function assertObject(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("invalid_input", "Tool input must be an object.");
  }
}

function rejectUnknownKeys(input, allowed) {
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) fail("invalid_input", `Unknown input field: ${key}.`);
  }
}

function boundedString(value, label, { required = false, max = 128 } = {}) {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string") fail("invalid_input", `${label} must be a string.`);
  const normalized = value.trim().replace(/\s+/g, " ");
  if ((required && !normalized) || normalized.length > max) {
    fail("invalid_input", `${label} has an invalid length.`);
  }
  return normalized || undefined;
}

function boundedInteger(value, label, fallback, min, max) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    fail("invalid_input", `${label} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

function validateProductIds(value, min) {
  if (!Array.isArray(value) || value.length < min || value.length > 4) {
    fail("invalid_input", `productIds must contain ${min} to 4 IDs.`);
  }
  const ids = value.map((item) => boundedString(item, "productId", { required: true }));
  if (new Set(ids).size !== ids.length) fail("invalid_input", "productIds must be unique.");
  return ids;
}

function validateSearchInput(input) {
  assertObject(input);
  rejectUnknownKeys(input, new Set(["query", "categoryId", "manufacturerId", "status", "limit"]));
  const query = boundedString(input.query, "query", { max: 120 });
  const categoryId = boundedString(input.categoryId, "categoryId");
  const manufacturerId = boundedString(input.manufacturerId, "manufacturerId");
  if (!query && !categoryId && !manufacturerId) {
    fail("invalid_input", "Provide query, categoryId, or manufacturerId.");
  }
  const status = input.status ?? "active";
  if (!["active", "discontinued", "all"].includes(status)) {
    fail("invalid_input", "status must be active, discontinued, or all.");
  }
  return {
    query,
    categoryId,
    manufacturerId,
    status,
    limit: boundedInteger(input.limit, "limit", 5, 1, 10),
  };
}

function validateCompareInput(input) {
  assertObject(input);
  rejectUnknownKeys(input, new Set(["productIds", "maxSpecs"]));
  return {
    productIds: validateProductIds(input.productIds, 2),
    maxSpecs: boundedInteger(input.maxSpecs, "maxSpecs", 8, 1, 10),
  };
}

function validatePriceInput(input) {
  assertObject(input);
  rejectUnknownKeys(input, new Set(["productIds", "currency"]));
  const currency = boundedString(input.currency, "currency", { max: 3 });
  if (currency && !["JPY", "USD"].includes(currency)) {
    fail("invalid_input", "currency must be JPY or USD.");
  }
  return { productIds: validateProductIds(input.productIds, 1), currency };
}

function validateLiteratureInput(input) {
  assertObject(input);
  rejectUnknownKeys(input, new Set(["productIds"]));
  return { productIds: validateProductIds(input.productIds, 1) };
}

function productReference(product, data) {
  const maker = data.indexes.manufacturerById.get(product.manufacturerId);
  const category = data.indexes.categoryById.get(product.categoryId);
  return {
    id: product.id,
    name: product.name,
    nameJa: product.nameJa,
    status: product.status,
    manufacturer: maker.nameEn,
    category: category.nameEn,
    productUrl: toPublicUrl(product.paths.product, data.baseUrl),
  };
}

function requireProduct(id, data) {
  const product = data.indexes.productById.get(id);
  if (!product) fail("unknown_product", "A requested product does not exist.", { productId: id });
  return product;
}

function searchText(product, data) {
  const maker = data.indexes.manufacturerById.get(product.manufacturerId);
  const category = data.indexes.categoryById.get(product.categoryId);
  return [
    product.id,
    product.name,
    product.nameJa,
    product.catalogNumber,
    product.summaryEn,
    product.summaryJa,
    maker.nameEn,
    maker.nameJa,
    category.nameEn,
    category.nameJa,
    ...Object.values(product.specs),
  ]
    .join(" ")
    .normalize("NFKC")
    .toLocaleLowerCase("ja");
}

function keySpecs(product, category) {
  return category.specSchema
    .flatMap((section) => section.specs)
    .filter((spec) => Object.hasOwn(product.specs, spec.key))
    .slice(0, 3)
    .map((spec) => ({
      key: spec.key,
      label: spec.labelEn,
      value: product.specs[spec.key],
      ...(spec.unit ? { unit: spec.unit } : {}),
    }));
}

export function createToolHandlers(dataLoader = loadDemoData) {
  return Object.freeze({
    async search_devices(input) {
      const request = validateSearchInput(input);
      const data = await dataLoader();
      if (request.categoryId && !data.indexes.categoryById.has(request.categoryId)) {
        fail("unknown_category", "categoryId does not exist.");
      }
      if (request.manufacturerId && !data.indexes.manufacturerById.has(request.manufacturerId)) {
        fail("unknown_manufacturer", "manufacturerId does not exist.");
      }
      const terms = request.query
        ? request.query.normalize("NFKC").toLocaleLowerCase("ja").split(" ").filter(Boolean)
        : [];
      const matches = data.catalog.products.filter((product) => {
        if (request.categoryId && product.categoryId !== request.categoryId) return false;
        if (request.manufacturerId && product.manufacturerId !== request.manufacturerId) return false;
        if (request.status !== "all" && product.status !== request.status) return false;
        const text = searchText(product, data);
        return terms.every((term) => text.includes(term));
      });
      const items = matches.slice(0, request.limit).map((product) => {
        const category = data.indexes.categoryById.get(product.categoryId);
        return {
          ...productReference(product, data),
          catalogNumber: product.catalogNumber,
          summary: product.summaryEn,
          keySpecs: keySpecs(product, category),
          limitations: product.limitations.en,
        };
      });
      return {
        summary: `${matches.length} fictional device records matched; ${items.length} returned.`,
        total: matches.length,
        items,
        sources: items.map((item) => item.productUrl),
        limitations: [
          "This fixed snapshot contains fictional demonstration records only.",
          "Text matching does not infer numeric ranges, unit conversions, or suitability.",
        ],
        datasetVersion: data.datasetVersion,
      };
    },

    async compare_devices(input) {
      const request = validateCompareInput(input);
      const data = await dataLoader();
      const products = request.productIds.map((id) => requireProduct(id, data));
      const categoryId = products[0].categoryId;
      if (products.some((product) => product.categoryId !== categoryId)) {
        fail("category_mismatch", "Products must belong to one category.");
      }
      const category = data.indexes.categoryById.get(categoryId);
      const rows = category.specSchema.flatMap((section) =>
        section.specs.map((spec) => ({
          section: section.nameEn,
          key: spec.key,
          label: spec.labelEn,
          ...(spec.unit ? { unit: spec.unit } : {}),
          values: products.map((product) => ({
            productId: product.id,
            value: Object.hasOwn(product.specs, spec.key) ? product.specs[spec.key] : null,
          })),
        })),
      );
      rows.sort((left, right) => {
        const different = (row) => new Set(row.values.map((item) => JSON.stringify(item.value))).size > 1;
        return Number(different(right)) - Number(different(left));
      });
      const items = rows.slice(0, request.maxSpecs);
      const references = products.map((product) => productReference(product, data));
      return {
        summary: `${products.length} fictional ${category.nameEn} records compared across ${items.length} fields using the same names and units.`,
        products: references,
        items,
        sources: references.map((item) => item.productUrl),
        limitations: [
          "All records and specification values are fictional.",
          "Values remain in schema order; missing values are null and no winner is inferred.",
        ],
        datasetVersion: data.datasetVersion,
      };
    },

    async get_price_range(input) {
      const request = validatePriceInput(input);
      const data = await dataLoader();
      const products = request.productIds.map((id) => requireProduct(id, data));
      const items = products.map((product) => {
        const availableRows = data.indexes.pricesByProductId.get(product.id) ?? [];
        const rows = request.currency
          ? availableRows.filter((row) => row.currency === request.currency)
          : availableRows;
        const groups = new Map();
        for (const row of rows) {
          const key = `${row.scenarioMarket}|${row.currency}|${row.basis}|${row.configuration}`;
          const values = groups.get(key) ?? [];
          values.push(row);
          groups.set(key, values);
        }
        return {
          productId: product.id,
          productUrl: toPublicUrl(product.paths.product, data.baseUrl),
          available: rows.length > 0,
          groups: [...groups.values()].map((values) => {
            const first = values[0];
            let rangeStatus = "single_observation";
            const result = {};
            if (first.minAmount !== undefined) {
              rangeStatus = "source_stated_range";
              result.range = { min: first.minAmount, max: first.maxAmount };
            } else if (first.basis === "synthetic_scenario_starting_at") {
              rangeStatus = "starting_at_only";
              result.startingAt = first.amount;
            } else if (values.length > 1) {
              rangeStatus = "comparable_observations";
              result.range = {
                min: Math.min(...values.map((row) => row.amount)),
                max: Math.max(...values.map((row) => row.amount)),
              };
            } else {
              result.referencePrice = first.amount;
            }
            return {
              market: first.scenarioMarket,
              currency: first.currency,
              basis: first.basis,
              configuration: first.configuration,
              rangeStatus,
              ...result,
              observations: values.map((row) => ({
                id: row.id,
                ...(row.amount !== undefined ? { amount: row.amount } : {}),
                ...(row.minAmount !== undefined
                  ? { minAmount: row.minAmount, maxAmount: row.maxAmount }
                  : {}),
                sourceUrl: toPublicUrl(row.sourcePath, data.baseUrl),
                authoredDate: row.authoredDate,
              })),
            };
          }),
          limitations: rows.length ? [] : ["No observation matches the requested currency."],
        };
      });
      return {
        summary: `Fictional price records are available for ${items.filter((item) => item.available).length} of ${items.length} requested records.`,
        products: products.map((product) => productReference(product, data)),
        items,
        sources: [...new Set(items.flatMap((item) => item.groups.flatMap((group) => group.observations.map((row) => row.sourceUrl))))],
        limitations: [
          ...data.prices.limitations.en,
          "No currency conversion or mixing across pricing conditions is performed.",
        ],
        datasetVersion: data.datasetVersion,
      };
    },

    async get_literature_signal(input) {
      const request = validateLiteratureInput(input);
      const data = await dataLoader();
      const products = request.productIds.map((id) => requireProduct(id, data));
      const items = products.map((product) => {
        const signal = data.indexes.signalByProductId.get(product.id);
        return {
          productId: product.id,
          productUrl: toPublicUrl(product.paths.product, data.baseUrl),
          available: Boolean(signal),
          status: signal?.status ?? "signal_not_in_synthetic_scope",
          ...(signal
            ? {
                mentionRecordCount: signal.mentionRecordCount,
                sourceRecordIds: signal.sourceRecordIds,
                sourceUrl: toPublicUrl(signal.corpusSourcePath, data.baseUrl),
              }
            : {}),
          limitations: [
            "Mention records are fictional and are not publications, citations, or verified use.",
          ],
        };
      });
      return {
        summary: `Device-name mention counts are available for ${items.filter((item) => item.available).length} of ${items.length} requested records.`,
        products: products.map((product) => productReference(product, data)),
        items,
        sources: [...new Set(items.flatMap((item) => [item.productUrl, item.sourceUrl].filter(Boolean)))],
        limitations: data.literature.limitations.en,
        datasetVersion: data.datasetVersion,
      };
    },
  });
}

const handlers = createToolHandlers();

export const searchDevices = handlers.search_devices;
export const compareDevices = handlers.compare_devices;
export const getPriceRange = handlers.get_price_range;
export const getLiteratureSignal = handlers.get_literature_signal;
