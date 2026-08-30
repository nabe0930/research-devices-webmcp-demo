# Research-Devices WebMCP — Testing Instructions

## Live WebMCP test

Use the planned live URL below only after deployment verification. For deterministic local verification, start the local server in the next section and use its loopback URL.

1. Open https://research-devices-webmcp-demo.vercel.app/ in the challenge-provided WebMCP-enabled browser environment.
2. Confirm that the page reports four registered tools:
   - `search_devices`
   - `compare_devices`
   - `get_price_range`
   - `get_literature_signal`
3. Give the browser agent this exact request:

> Compare RD-SYN qPCR A and RD-SYN qPCR B. Use all four Research-Devices tools to find the records, compare their normalized specifications, retrieve their demo price observations and entrant-authored synthetic methods-corpus mention signals, include record URLs and sources, and explain which requirements favor each instrument. Preserve every data limitation and do not choose a universal winner.

4. Confirm that the agent invokes all four tools and returns:
   - both demonstration records;
   - normalized specification differences;
   - price observations kept separate by currency and basis;
   - entrant-authored synthetic methods-corpus mention signals labeled as neither papers, citations, nor verified use;
   - record URLs, sources, dataset version, and limitations;
   - conditional guidance without an automatic winner.
5. Inspect the Native WebMCP evidence panel. Native callbacks must be shown separately from human interactions and the guided preview.

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

Expected result:

- source and public-data checks exit successfully;
- all automated tests pass;
- the static build completes;
- the smoke report discovers four WebMCP tools;
- all four representative tool executions pass.

If the browser does not expose WebMCP, the guided preview remains available for inspecting the shared contracts and domain results. It is a fallback demonstration only and must not be treated as proof of Native WebMCP execution.
