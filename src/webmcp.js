import { createToolHandlers } from "./tools.js";
import { isSafePublicUrl } from "./data-store.js";

export const TOOL_NAMES = Object.freeze([
  "search_devices",
  "compare_devices",
  "get_price_range",
  "get_literature_signal",
]);

export const AGENT_OUTPUT_MAX_CHARS = 1_500;

const annotations = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  untrustedContentHint: true,
});

const MAX_OUTPUT = Object.freeze({
  arrayItems: 64,
  depth: 12,
  keys: 64,
  nodes: 5_000,
  stringLength: 4_096,
  bytes: 128_000,
});

const FORBIDDEN_KEY = /(?:authorization|cookie|credential|email|password|secret|seller|session|token|user.?id)/i;

const inputSchemas = Object.freeze({
  search_devices: {
    type: "object",
    properties: {
      query: {
        type: "string",
        minLength: 1,
        maxLength: 120,
        description: "Name, fictional model, author label, category, or summary terms.",
      },
      categoryId: {
        type: "string",
        maxLength: 128,
        description: "Stable synthetic category ID, such as qpcr.",
      },
      manufacturerId: {
        type: "string",
        maxLength: 128,
        description: "Stable entrant-owned author-label ID, such as rd-synthetic-lab.",
      },
      status: {
        type: "string",
        enum: ["active", "discontinued", "all"],
        default: "active",
      },
      limit: { type: "integer", minimum: 1, maximum: 10, default: 5 },
    },
    anyOf: [
      { required: ["query"] },
      { required: ["categoryId"] },
      { required: ["manufacturerId"] },
    ],
    additionalProperties: false,
  },
  compare_devices: {
    type: "object",
    required: ["productIds"],
    properties: {
      productIds: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        uniqueItems: true,
        items: { type: "string", minLength: 1, maxLength: 128 },
        description: "Two to four same-category synthetic product IDs from search_devices.",
      },
      maxSpecs: { type: "integer", minimum: 1, maximum: 10, default: 8 },
    },
    additionalProperties: false,
  },
  get_price_range: {
    type: "object",
    required: ["productIds"],
    properties: {
      productIds: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        uniqueItems: true,
        items: { type: "string", minLength: 1, maxLength: 128 },
      },
      currency: {
        type: "string",
        enum: ["JPY", "USD"],
        description: "Optional original fictional currency. No conversion is performed.",
      },
    },
    additionalProperties: false,
  },
  get_literature_signal: {
    type: "object",
    required: ["productIds"],
    properties: {
      productIds: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        uniqueItems: true,
        items: { type: "string", minLength: 1, maxLength: 128 },
      },
    },
    additionalProperties: false,
  },
});

const metadata = Object.freeze({
  search_devices: {
    en: "Search synthetic research devices",
    ja: "合成研究機器レコードを検索",
    description:
      "Search a bounded, fully synthetic Research-Devices catalog. Returns concise records, same-origin sources, dataset version, and limitations.",
  },
  compare_devices: {
    en: "Compare synthetic research devices",
    ja: "合成研究機器レコードを比較",
    description:
      "Compare two to four same-category synthetic records with normalized specification labels. Missing values remain explicit and no winner is declared.",
  },
  get_price_range: {
    en: "Get synthetic price scenarios",
    ja: "合成価格シナリオを確認",
    description:
      "Retrieve fictional price observations grouped by original currency, basis, and configuration. Values are not offers, quotes, procurement evidence, or market prices.",
  },
  get_literature_signal: {
    en: "Get fictional research-record mention counts",
    ja: "架空研究記録内の機器名言及数を確認",
    description:
      "Retrieve device-name mention counts from twelve fictional research records created for this demo, with same-origin provenance and explicit interpretation limits.",
  },
});

function abortError() {
  return new DOMException("Tool call aborted", "AbortError");
}

async function runWithAbort(handler, input, signal) {
  if (signal?.aborted) throw abortError();
  const work = Promise.resolve().then(() => handler(input ?? {}));
  if (!signal) return work;
  let listener;
  const aborted = new Promise((_, reject) => {
    listener = () => reject(abortError());
    signal.addEventListener("abort", listener, { once: true });
  });
  try {
    return await Promise.race([work, aborted]);
  } finally {
    signal.removeEventListener("abort", listener);
  }
}

function emitActivity(onActivity, value) {
  try {
    const pending = onActivity(value);
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
  } catch {
    // Evidence reporting must never change a tool result.
  }
}

function assertOutputUrl(value, expectedOrigin) {
  if (!isSafePublicUrl(value)) throw new TypeError("Tool output contains an unsafe URL.");
  const url = new URL(value);
  if (expectedOrigin && url.origin !== expectedOrigin) {
    throw new TypeError("Tool output URLs must remain on the current origin.");
  }
}

function assertJson(value, state, expectedOrigin, depth = 0) {
  state.nodes += 1;
  if (state.nodes > MAX_OUTPUT.nodes || depth > MAX_OUTPUT.depth) {
    throw new TypeError("Tool output exceeds the bounded JSON structure limit.");
  }
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Tool output contains a non-finite number.");
    return;
  }
  if (typeof value === "string") {
    if (value.length > MAX_OUTPUT.stringLength) throw new TypeError("Tool output string is too long.");
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_OUTPUT.arrayItems) throw new TypeError("Tool output array is too large.");
    value.forEach((item) => assertJson(item, state, expectedOrigin, depth + 1));
    return;
  }
  if (!value || typeof value !== "object") {
    throw new TypeError("Tool output must contain JSON-compatible values only.");
  }
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError("Tool output must contain plain objects only.");
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_OUTPUT.keys) throw new TypeError("Tool output object is too large.");
  for (const [key, child] of entries) {
    if (FORBIDDEN_KEY.test(key)) throw new TypeError("Tool output contains a forbidden field.");
    if (/url$/i.test(key) && child !== null && child !== undefined) {
      assertOutputUrl(child, expectedOrigin);
    }
    if (/^(?:sources|producturls)$/i.test(key)) {
      if (!Array.isArray(child)) throw new TypeError("Tool output contains an invalid URL list.");
      child.forEach((url) => assertOutputUrl(url, expectedOrigin));
    }
    assertJson(child, state, expectedOrigin, depth + 1);
  }
}

export function validateToolOutput(value, expectedOrigin) {
  assertJson(value, { nodes: 0 }, expectedOrigin);
  const serialized = JSON.stringify(value);
  if (!serialized || new TextEncoder().encode(serialized).byteLength > MAX_OUTPUT.bytes) {
    throw new TypeError("Tool output exceeds the serialized byte limit.");
  }
  return value;
}

function shorten(value, max = 96) {
  if (typeof value !== "string") return value;
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function compactSearch(result) {
  const items = result.items.slice(0, 3);
  return {
    summary: `${result.total} synthetic device records matched; ${items.length} returned in this compact response.`,
    total: result.total,
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      status: item.status,
      productUrl: item.productUrl,
    })),
    provenance: items.slice(0, 2).map((item) => ({
      productId: item.id,
      sourceUrl: item.productUrl,
    })),
    limitations: ["Fictional fixed snapshot only; no suitability is inferred."],
    datasetVersion: result.datasetVersion,
  };
}

function compactCompare(result) {
  const specLimit = result.products.length === 2 ? 6 : 4;
  const specs = result.items.slice(0, specLimit);
  return {
    summary: `${result.products.length} synthetic records compared across ${specs.length} normalized fields in this compact response.`,
    productUrls: result.products.map((item) => item.productUrl),
    specs: specs.map((row) => ({
      key: row.key,
      label: row.label,
      ...(row.unit ? { unit: row.unit } : {}),
      values: row.values.map((item) => item.value),
    })),
    provenance: result.products.slice(0, 2).map((item) => ({ sourceUrl: item.productUrl })),
    limitations: ["Values follow productUrls order; no conversion or winner is inferred."],
    datasetVersion: result.datasetVersion,
  };
}

function compactPrice(result) {
  const includeScenarioDimensions = result.items.length <= 2;
  return {
    summary: shorten(result.summary, 80),
    items: result.items.map((item) => ({
      productId: item.productId,
      productUrl: item.productUrl,
      available: item.available,
      ranges: item.groups.slice(0, 1).map((group) => ({
        ...(includeScenarioDimensions
          ? {
              market: group.market,
              configuration: group.configuration,
              observationCount: group.observations.length,
            }
          : {}),
        currency: group.currency,
        basis: group.basis.replace(/^synthetic_/, ""),
        status: group.rangeStatus,
        ...(group.range ? { range: [group.range.min, group.range.max] } : {}),
        ...(group.startingAt !== undefined ? { startingAt: group.startingAt } : {}),
        ...(group.referencePrice !== undefined ? { referencePrice: group.referencePrice } : {}),
      })),
    })),
    provenance: result.sources.slice(0, 1).map((sourceUrl) => ({ sourceUrl })),
    limitations: ["Fictional scenarios; no conversion, offer, quote, or market-price claim."],
    datasetVersion: result.datasetVersion,
  };
}

function compactLiterature(result) {
  return {
    summary: shorten(result.summary, 120),
    items: result.items.map((item) => ({
      productId: item.productId,
      productUrl: item.productUrl,
      available: item.available,
      ...(item.available ? { mentionRecordCount: item.mentionRecordCount } : { status: item.status }),
    })),
    provenance: result.items
      .filter((item) => item.sourceUrl)
      .slice(0, 2)
      .map((item) => ({ productId: item.productId, sourceUrl: item.sourceUrl })),
    limitations: ["Fictional mentions are not publications, citations, or verified use."],
    datasetVersion: result.datasetVersion,
  };
}

function compact(toolName, value) {
  switch (toolName) {
    case "search_devices":
      return compactSearch(value);
    case "compare_devices":
      return compactCompare(value);
    case "get_price_range":
      return compactPrice(value);
    case "get_literature_signal":
      return compactLiterature(value);
    default:
      return value;
  }
}

export function createToolDefinitions(
  handlers = createToolHandlers(),
  {
    onActivity = () => {},
    locale = "en",
    outputProfile = "agent",
    origin = globalThis.location?.origin,
  } = {},
) {
  if (!['agent', 'full'].includes(outputProfile)) {
    throw new TypeError("outputProfile must be agent or full.");
  }
  const language = String(locale).toLowerCase().startsWith("ja") ? "ja" : "en";
  return TOOL_NAMES.map((name) => ({
    name,
    title: metadata[name][language],
    description: metadata[name].description,
    inputSchema: inputSchemas[name],
    annotations,
    execute: async (input, execution = {}) => {
      const startedAt = Date.now();
      try {
        const full = validateToolOutput(
          await runWithAbort(handlers[name], input, execution.signal),
          origin,
        );
        const output = outputProfile === "full" ? full : compact(name, full);
        validateToolOutput(output, origin);
        if (outputProfile === "agent" && JSON.stringify(output).length > AGENT_OUTPUT_MAX_CHARS) {
          throw new TypeError("Compact WebMCP output exceeds 1,500 characters.");
        }
        if (execution.signal?.aborted) throw abortError();
        emitActivity(onActivity, {
          tool: name,
          input: input ?? {},
          result: output,
          ok: true,
          durationMs: Date.now() - startedAt,
        });
        return output;
      } catch (error) {
        emitActivity(onActivity, {
          tool: name,
          input: input ?? {},
          error: error instanceof Error ? error.message : "Unknown tool error",
          ok: false,
          durationMs: Date.now() - startedAt,
        });
        throw error;
      }
    },
  }));
}

export async function registerWebMCPTools({
  modelContext = globalThis.document?.modelContext,
  handlers = createToolHandlers(),
  onActivity = () => {},
  locale = globalThis.document?.documentElement?.lang ?? "en",
  origin = globalThis.location?.origin,
} = {}) {
  if (!modelContext || typeof modelContext.registerTool !== "function") {
    return { supported: false, registeredTools: [], dispose() {} };
  }
  const controller = new AbortController();
  const definitions = createToolDefinitions(handlers, {
    onActivity,
    locale,
    outputProfile: "agent",
    origin,
  });
  const registeredTools = [];
  try {
    for (const definition of definitions) {
      await modelContext.registerTool(definition, { signal: controller.signal });
      registeredTools.push(definition.name);
    }
  } catch (error) {
    controller.abort();
    throw error;
  }
  return {
    supported: true,
    registeredTools,
    dispose() {
      controller.abort();
    },
  };
}
