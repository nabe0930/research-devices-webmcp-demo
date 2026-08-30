# Research-Devices WebMCP

Evidence-aware instrument comparison through four bounded, read-only WebMCP tools.

## Publication-ready release candidate

- Planned live demo URL (not yet verified): https://research-devices-webmcp-demo.vercel.app/
- Planned public repository URL (not yet verified): https://github.com/nabe0930/research-devices-webmcp-demo

This isolated WebMCP Challenge candidate has not been published or deployed by the local transformation. The npm package remains `private: true` to prevent registry publication; the candidate source code is licensed under MIT.

## What it demonstrates

The bilingual static application registers four functions with `document.modelContext.registerTool()`:

- `search_devices` searches eight Research-Devices-owned synthetic device records.
- `compare_devices` compares two to four same-category records using normalized fields.
- `get_price_range` returns fictional demonstration observations without merging currencies, bases, or configurations.
- `get_literature_signal` reports mentions in a twelve-record, entrant-authored synthetic methods corpus.

Every result includes a concise summary, stable same-origin record URLs, source pages, the dataset version, and explicit limitations. Missing values remain missing. No tool declares a universal winner or makes a purchasing decision.

## Representative journey

The central journey compares `RD-SYN qPCR A` and `RD-SYN qPCR B`:

1. Search for both active demonstration records.
2. Compare channel capacity, multiplex capacity, and workflow fields.
3. Retrieve fictional JPY price observations while preserving their basis.
4. Retrieve synthetic-corpus mention counts and owned corpus-source links.

The result provides conditional shortlist guidance while clearly stating that every product, specification, price, and corpus record is fictional.

## Native WebMCP evidence

The guided preview uses the same contracts and domain handlers, but it does not invoke an LLM or browser agent. A separate evidence panel reports registration status during setup; its execution trace and callback counters change only when a registered Native WebMCP `execute` callback runs. It reports what the page can verify: registrations, executed tool names, callback count, inputs, results, and limitations. It does not claim to identify the caller.

## Local setup

Requirements: Node.js 22 or later and a challenge-supported WebMCP browser for the native smoke test.

```bash
npm run verify
npm run dev
```

Open:

- English: `http://127.0.0.1:4173/`
- Japanese: `http://127.0.0.1:4173/ja/`

With the server running:

```bash
npm run eval:webmcp:smoke
```

The expected result is four discovered tools and four successful direct executions. See `docs/TESTING.md` for the complete browser-agent prompt and success criteria.

## Security and data boundary

- Static HTML, CSS, JavaScript modules, and checked-in JSON only.
- No backend, authentication, cookies, analytics, persistence, arbitrary remote fetching, or write operations.
- No production catalog, member data, user submissions, account data, credentials, third-party product records, product images, logos, or external product URLs.
- All device links and source links are same-origin paths generated from an explicit allowlist.
- Local HTTP URLs are accepted only for `127.0.0.1` or `localhost`; deployment output must use same-origin HTTPS.
- Tool inputs and outputs are bounded and validated at runtime.

## Synthetic dataset

- 8 fictional products
- 3 generic categories
- 1 Research-Devices-owned synthetic author label
- 9 fictional price observations
- 12 entrant-authored fictional methods records
- 8 derived mention signals

The dataset exists only to demonstrate WebMCP contracts and provenance handling. It does not describe real manufacturers, products, offers, procurement data, publications, citations, or verified laboratory use.

## Prior work and challenge work

Research-Devices and its human-facing equipment-information service existed before the challenge. The production application and its catalog, hosting, DNS, authentication, databases, and member functions are not included or modified.

The challenge-period work is the separate WebMCP application: four tool contracts and handlers, bounded schemas, runtime guards, synthetic release profile, bilingual console, guided workflow, structured trace, static security boundary, and WebMCP evaluation cases.

## Licenses

Source code, tests, and build logic are released under the MIT License. The Research-Devices-owned synthetic JSON and generated dataset content are released under Creative Commons Attribution 4.0 International (CC BY 4.0). See `LICENSE` and `DATA-NOTICE.md`.
