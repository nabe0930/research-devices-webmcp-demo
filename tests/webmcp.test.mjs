import assert from "node:assert/strict";
import test from "node:test";
import { createToolHandlers } from "../src/tools.js";
import {
  AGENT_OUTPUT_MAX_CHARS,
  createToolDefinitions,
  registerWebMCPTools,
  TOOL_NAMES,
} from "../src/webmcp.js";
import { combinations, loadFixtureData } from "./helpers.mjs";

const origin = "https://synthetic-demo.example.test";
const data = await loadFixtureData(`${origin}/`);
const handlers = createToolHandlers(() => Promise.resolve(data));

test("exactly four bounded read-only WebMCP definitions are exposed", () => {
  const definitions = createToolDefinitions(handlers, { origin });
  assert.deepEqual(definitions.map((item) => item.name), [...TOOL_NAMES]);
  assert.equal(definitions.length, 4);
  for (const definition of definitions) {
    assert.equal(definition.annotations.readOnlyHint, true);
    assert.equal(definition.annotations.destructiveHint, false);
    assert.equal(definition.annotations.idempotentHint, true);
    assert.equal(definition.annotations.openWorldHint, false);
    assert.equal(definition.annotations.untrustedContentHint, true);
    assert.equal(definition.inputSchema.additionalProperties, false);
    assert.match(definition.description, /synthetic|fictional/i);
  }
});

test("registration uses document.modelContext-compatible registerTool calls", async () => {
  const calls = [];
  const registration = await registerWebMCPTools({
    modelContext: {
      async registerTool(definition, options) {
        calls.push({ definition, options });
      },
    },
    handlers,
    origin,
    locale: "ja",
  });
  assert.equal(registration.supported, true);
  assert.deepEqual(registration.registeredTools, [...TOOL_NAMES]);
  assert.equal(calls.length, 4);
  assert.ok(calls.every((call) => call.options.signal instanceof AbortSignal));
  assert.match(calls[0].definition.title, /合成/);
  registration.dispose();
  assert.ok(calls.every((call) => call.options.signal.aborted));
});

test("registration never depends on the dataset fetch", async () => {
  // The page registers before it loads data, so a slow or failing snapshot fetch can
  // never leave a WebMCP browser with zero registered tools.
  let loaderCalls = 0;
  const failingLoader = () => {
    loaderCalls += 1;
    return Promise.reject(new Error("dataset unavailable"));
  };
  const registered = [];
  const registration = await registerWebMCPTools({
    modelContext: {
      async registerTool(definition) {
        registered.push(definition.name);
      },
    },
    handlers: createToolHandlers(failingLoader),
    origin,
  });
  assert.equal(registration.supported, true);
  assert.deepEqual(registered, [...TOOL_NAMES]);
  assert.equal(loaderCalls, 0);
  registration.dispose();
});

test("a failed dataset fetch surfaces per call instead of blocking registration", async () => {
  const definitions = createToolDefinitions(createToolHandlers(() => Promise.reject(new Error("dataset unavailable"))), {
    origin,
    outputProfile: "agent",
  });
  assert.equal(definitions.length, 4);
  await assert.rejects(
    () => definitions[0].execute({ query: "RD-SYN qPCR" }),
    /dataset unavailable/,
  );
});

test("unsupported browsers fail closed without registering a substitute", async () => {
  const registration = await registerWebMCPTools({ modelContext: undefined, handlers, origin });
  assert.deepEqual(registration.registeredTools, []);
  assert.equal(registration.supported, false);
});

test("all representative agent outputs remain within 1,500 characters", async () => {
  const definitions = new Map(
    createToolDefinitions(handlers, { origin, outputProfile: "agent" }).map((item) => [
      item.name,
      item,
    ]),
  );
  const search = await definitions.get("search_devices").execute({
    query: "RD-SYN qPCR",
    categoryId: "qpcr",
    status: "active",
    limit: 4,
  });
  assert.ok(JSON.stringify(search).length <= AGENT_OUTPUT_MAX_CHARS);

  const qPCR = ["rd-syn-qpcr-a", "rd-syn-qpcr-b", "rd-syn-qpcr-c", "rd-syn-qpcr-d"];
  for (const productIds of combinations(qPCR, 2, 4)) {
    const result = await definitions.get("compare_devices").execute({ productIds, maxSpecs: 10 });
    assert.ok(JSON.stringify(result).length <= AGENT_OUTPUT_MAX_CHARS, productIds.join(","));
    assert.equal(result.productUrls.length, productIds.length);
  }

  const allIds = data.catalog.products.map((product) => product.id);
  for (const productIds of combinations(allIds, 1, 4)) {
    const price = await definitions.get("get_price_range").execute({ productIds });
    const literature = await definitions.get("get_literature_signal").execute({ productIds });
    assert.ok(JSON.stringify(price).length <= AGENT_OUTPUT_MAX_CHARS, `price:${productIds.join(",")}`);
    assert.ok(JSON.stringify(literature).length <= AGENT_OUTPUT_MAX_CHARS, `literature:${productIds.join(",")}`);
  }
});

test("agent outputs retain sources, limitations, and dataset version", async () => {
  const definitions = createToolDefinitions(handlers, { origin });
  const inputs = {
    search_devices: { query: "RD-SYN qPCR", limit: 2 },
    compare_devices: { productIds: ["rd-syn-qpcr-a", "rd-syn-qpcr-b"] },
    get_price_range: { productIds: ["rd-syn-qpcr-a", "rd-syn-qpcr-b"], currency: "JPY" },
    get_literature_signal: { productIds: ["rd-syn-qpcr-a", "rd-syn-qpcr-b"] },
  };
  for (const definition of definitions) {
    const result = await definition.execute(inputs[definition.name]);
    assert.equal(result.datasetVersion, data.datasetVersion);
    assert.ok(result.provenance.length > 0);
    assert.ok(result.limitations.length > 0);
    for (const item of result.provenance) assert.equal(new URL(item.sourceUrl).origin, origin);
  }
});

test("compact summaries describe the returned rows and retain the A/B workflow evidence", async () => {
  const definitions = new Map(
    createToolDefinitions(handlers, { origin }).map((definition) => [definition.name, definition]),
  );
  const search = await definitions.get("search_devices").execute({
    query: "RD-SYN",
    status: "all",
    limit: 10,
  });
  assert.equal(search.items.length, 3);
  assert.match(search.summary, /3 returned in this compact response/);

  const comparison = await definitions.get("compare_devices").execute({
    productIds: ["rd-syn-qpcr-a", "rd-syn-qpcr-b"],
    maxSpecs: 10,
  });
  assert.equal(comparison.specs.length, 6);
  assert.match(comparison.summary, /6 normalized fields in this compact response/);
  assert.deepEqual(
    comparison.specs.map((row) => row.key),
    [
      "reaction_volume_min_ul",
      "detection_channels",
      "multiplex_targets",
      "max_ramp_rate_c_per_s",
      "audit_trail",
      "remote_monitoring",
    ],
  );
});

test("compact A/B price evidence retains scenario dimensions and truthful observation counts", async () => {
  const definition = createToolDefinitions(handlers, { origin }).find(
    (item) => item.name === "get_price_range",
  );
  const result = await definition.execute({
    productIds: ["rd-syn-qpcr-a", "rd-syn-qpcr-b"],
    currency: "JPY",
  });
  const groups = result.items.map((item) => item.ranges[0]);
  assert.deepEqual(groups.map((group) => group.observationCount), [2, 1]);
  assert.equal(groups.reduce((sum, group) => sum + group.observationCount, 0), 3);
  assert.ok(groups.every((group) => group.market && group.configuration));
  assert.ok(JSON.stringify(result).length <= AGENT_OUTPUT_MAX_CHARS);
});

test("tool output rejects cross-origin or credentialed provenance", async () => {
  const badHandlers = Object.fromEntries(
    TOOL_NAMES.map((name) => [
      name,
      async () => ({
        summary: "bad",
        sources: ["https://outside.example.test/source"],
        limitations: ["test"],
        datasetVersion: "test",
      }),
    ]),
  );
  const definition = createToolDefinitions(badHandlers, {
    origin,
    outputProfile: "full",
  })[0];
  await assert.rejects(definition.execute({ query: "x" }), /current origin/);
});

test("aborted execution rejects with AbortError", async () => {
  const definition = createToolDefinitions(handlers, { origin })[0];
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    definition.execute({ query: "RD-SYN" }, { signal: controller.signal }),
    (error) => error.name === "AbortError",
  );
});
