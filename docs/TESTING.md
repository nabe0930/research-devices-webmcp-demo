# Research-Devices WebMCP — Testing Instructions

## Step 0 — Get a WebMCP-capable browser

Native WebMCP is exposed by a supporting browser only. Pick one:

- **ChatGPT desktop app.** Update to the latest version, open its built-in browser, and enable **Settings > Browser > Permissions > Enable site tools**. Current model and workspace availability is listed in the [OpenAI Site tools guide](https://learn.chatgpt.com/docs/webmcp).
- **Chrome local testing.** Open `chrome://flags/#enable-webmcp-testing`, set the flag to Enabled, and restart Chrome. Chrome documents its origin trial separately in the [official WebMCP guide](https://developer.chrome.com/docs/ai/webmcp).

Verification that the browser is ready: open the developer console on any page and evaluate
`typeof document.modelContext?.registerTool`. The expected value is `function`. If it is
`undefined`, the browser does not expose WebMCP and steps 1-5 below cannot pass; the on-page
inspector buttons will still run the same handlers, but that is not Native WebMCP execution.

## Live WebMCP test

Verified live URL: https://research-devices-webmcp-demo.vercel.app/ (repository and Native WebMCP checks completed 2026-08-30T14:13:46.030Z). For deterministic local verification, the loopback workflow below remains available.

1. Open https://research-devices-webmcp-demo.vercel.app/ in the challenge-provided WebMCP-enabled browser environment.
2. Confirm that the page reports four registered tools:
   - `search_devices`
   - `compare_devices`
   - `get_price_range`
   - `get_literature_signal`
3. Give the browser agent this exact request:

> Compare fictional RD-SYN qPCR A and B for a 96-well workflow requiring 6 detection channels, support for up to 6 multiplex targets, `audit_trail: true`, and a ¥6,000,000 ceiling. Use all four Research-Devices tools, normalized specifications, fictional JPY price scenarios, and device-name mention counts from twelve fictional research records created for this demo. Include record URLs and every source, preserve every limitation, and explain the trade-off.

4. Confirm that the agent invokes all four tools and returns:
   - both demonstration records;
   - normalized specification differences;
   - price observations kept separate by currency and basis;
   - device-name mention counts from twelve fictional research records, labeled as neither papers, citations, nor verified use;
   - record URLs, sources, dataset version, and limitations;
   - conditional guidance without an automatic winner.
5. Inspect the Native WebMCP evidence panel after the request. It should show four callbacks and all four registered tool names, separately from human interactions and the guided preview. The panel proves callback receipt but does not identify the caller.

## Deterministic local verification

Requirements: a JavaScript runtime version 22 or later and the challenge-supported browser environment.

```bash
git clone https://github.com/nabe0930/research-devices-webmcp-demo
cd research-devices-webmcp-demo
npm run verify
npm run dev
```

Open:

- English: `http://127.0.0.1:4173/`
- Japanese: `http://127.0.0.1:4173/ja/`

With the local server running, execute the deterministic Native WebMCP smoke journey:

```bash
npm run eval:webmcp:smoke
```

The same journey against the Japanese page:

```bash
npm run eval:webmcp:smoke:ja
```

Expected result:

- source and public-data checks exit successfully;
- all automated tests pass;
- the static build completes;
- the smoke report discovers four WebMCP tools;
- all four representative tool executions pass.

If the browser does not expose WebMCP, the guided preview remains available for inspecting the shared contracts and domain results. It is a fallback demonstration only and must not be treated as proof of Native WebMCP execution.
