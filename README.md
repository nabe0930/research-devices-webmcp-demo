# Research-Devices WebMCP

Evidence-aware instrument comparison through four bounded, read-only WebMCP tools.

## Verified public release

- Live demo: https://research-devices-webmcp-demo.vercel.app/
- Public repository: https://github.com/nabe0930/research-devices-webmcp-demo

Read-only verification at 2026-08-30T10:23:07.206Z byte-compared the published repository and every deployed file, checked the deployed security headers, and ran the four-tool Native WebMCP discovery-and-execution smoke journey with `webmcp-evals@0.0.4` against a WebMCP-enabled Chrome (`chrome://flags/#enable-webmcp-testing` set to Enabled); it discovered 4 tools and executed 4. Reproduce that run with `npm run eval:webmcp:smoke` as described in `docs/TESTING.md`, and see `release-manifest.json` for the recorded counts and hashes. The npm package remains `private: true` to prevent registry publication; the source code is licensed under MIT.

## What it demonstrates

The bilingual static application registers four functions with `document.modelContext.registerTool()`:

- `search_devices` searches eight Research-Devices-owned synthetic device records.
- `compare_devices` compares two to four same-category records using normalized fields.
- `get_price_range` returns fictional demonstration observations without merging currencies, bases, or configurations.
- `get_literature_signal` reports mentions in a twelve-record, entrant-authored synthetic methods corpus.

Every result includes a concise summary, stable same-origin record URLs, source pages, the dataset version, and explicit limitations. Missing values remain missing. No tool declares a universal winner or makes a purchasing decision.

## Why WebMCP rather than a server-side MCP server

The same four functions could be served by a remote MCP server. Three properties appear only when the page itself is the tool provider:

- **No integration step.** The capability travels with the URL. A researcher opens the page and the agent can already call typed functions: nothing to deploy, no key to issue, no connector to install.
- **One shared surface.** The human and the agent are looking at the same document. The evidence panel records each `execute` callback, its input, and its bounded result inside the page the researcher is already reading, so agent activity stays auditable where the work happens instead of in a separate log.
- **Provenance the human can click.** Every `productUrl` and source link handed to the agent is a same-origin page of this site. The agent's citation and the researcher's next click resolve to the same document.

## Representative journey

The central journey compares `RD-SYN qPCR A` and `RD-SYN qPCR B`:

1. Search for both active demonstration records.
2. Compare channel capacity, multiplex capacity, and workflow fields.
3. Retrieve fictional JPY price observations while preserving their basis.
4. Retrieve synthetic-corpus mention counts and owned corpus-source links.

The result provides conditional shortlist guidance while clearly stating that every product, specification, price, and corpus record is fictional.

## Native WebMCP evidence

The guided preview uses the same contracts and domain handlers, but it does not invoke an LLM or browser agent. A separate evidence panel reports registration status during setup; its execution trace and callback counters change only when a registered Native WebMCP `execute` callback runs. It reports what the page can verify: registrations, executed tool names, callback count, inputs, results, and limitations. It does not claim to identify the caller.

## Browser requirements for Native WebMCP

Native WebMCP is exposed by a supporting browser only. Use either:

- the latest **ChatGPT desktop app's built-in browser**, with **Settings > Browser > Permissions > Enable site tools** enabled; or
- Chrome for local API testing, with `chrome://flags/#enable-webmcp-testing` set to Enabled, followed by a browser restart.

Site-tools availability varies by rollout, model, and workspace. Follow the current [OpenAI Site tools guide](https://learn.chatgpt.com/docs/webmcp). Chrome documents its origin trial separately from local flag-based testing in the [official WebMCP guide](https://developer.chrome.com/docs/ai/webmcp).

In any other browser the site still renders, and the on-page inspector buttons run the same validated handlers. No tool is registered and the Native evidence panel stays empty. An empty panel there is the correct result for a non-WebMCP browser, not a failure.

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

Development of this application began on 2026-08-29 and the dedicated public repository was created on 2026-08-30. Both dates fall inside the August 25 - September 3, 2026 submission window, so every commit in this repository is challenge-period work. The repository history starts at the published snapshot because the application was developed in a separate private workspace and published once its verification passed.

## Licenses

Source code, tests, and build logic are released under the MIT License. The Research-Devices-owned synthetic JSON and generated dataset content are released under Creative Commons Attribution 4.0 International (CC BY 4.0). See `LICENSE` and `DATA-NOTICE.md`.
