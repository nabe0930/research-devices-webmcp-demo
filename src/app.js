import { loadDemoData } from "./data-store.js";
import { createToolHandlers } from "./tools.js";
import { createToolDefinitions, registerWebMCPTools, TOOL_NAMES } from "./webmcp.js";

const locale = document.documentElement.lang === "ja" ? "ja" : "en";
const copy = {
  en: {
    loading: "Loading the bounded synthetic dataset…",
    ready: "Synthetic dataset ready",
    localRun: "Local contract inspection",
    running: "Running…",
    failed: "The bounded demonstration call failed.",
    nativeReady: "Native WebMCP ready — 4 read-only tools registered",
    nativeUnavailable:
      "Native WebMCP is not exposed by this browser. The local inspection buttons still show the same contracts and handlers.",
    nativeFailed: "Native WebMCP registration failed safely.",
    noNativeCalls: "No Native WebMCP execute callback has run in this page session.",
    nativeSummary: (registered, executed, callbacks) =>
      `Registered tools: ${registered}/4 · Actually executed tools: ${executed}/4 · Execute callbacks: ${callbacks}`,
    nativeLabel: "Native WebMCP",
    evidenceLabel: "Structured input and bounded result",
    executeOk: "execute: ok",
    executeRejected: "execute: rejected",
    noteIdle: "Run a call to see what the structured result means for the brief above.",
    notes: {
      search_devices:
        "Four qPCR records match, and RD-SYN qPCR A and B are the two active candidates for the brief. Nothing is ranked yet — this call only establishes the shortlist and where each record came from.",
      compare_devices:
        "B carries the brief on capability: 6 detection channels against A's 4, and audit_trail is a typed true where A is a typed false. Neither field is blank, so the agent cannot mistake the audit trail for a value it may guess.",
      get_price_range:
        "A summarises two fictional observations, producing a bounded synthetic span of ¥4,800,000–5,100,000 under the ¥6,000,000 ceiling. B rests on one fictional observation at ¥6,900,000 — rangeStatus says single_observation, so it is a point, not a market price, and it breaches the ceiling.",
      get_literature_signal:
        "A appears in 7 of the 12 fictional methods records and B in 6. That is corpus frequency and nothing more: it is not citations, not validation, and it must not be allowed to overturn the audit-trail requirement.",
    },
    verdict:
      "No universal winner. If the GLP audit trail is a hard requirement, only B qualifies and the budget has to move — on the strength of one fictional price observation. If it is negotiable, A fits the ceiling with a bounded span derived from two fictional observations, and loses 6-colour multiplex. The tools surface that trade-off; the researcher decides it.",
  },
  ja: {
    loading: "対象限定の合成データを読み込んでいます…",
    ready: "合成データの準備完了",
    localRun: "ローカル契約確認",
    running: "実行中…",
    failed: "対象限定のデモ呼び出しに失敗しました。",
    nativeReady: "Native WebMCP準備完了 — 読み取り専用4ツールを登録済み",
    nativeUnavailable:
      "このブラウザではNative WebMCP APIが公開されていません。下の確認ボタンでは同じ契約とハンドラーをローカル実行できます。",
    nativeFailed: "Native WebMCPの登録は安全に停止しました。",
    noNativeCalls: "このページセッションではNative WebMCPのexecute callbackはまだ実行されていません。",
    nativeSummary: (registered, executed, callbacks) =>
      `登録ツール: ${registered}/4 · 実行済みツール: ${executed}/4 · Execute callback: ${callbacks}`,
    nativeLabel: "Native WebMCP",
    evidenceLabel: "構造化入力と対象限定結果",
    executeOk: "execute: 成功",
    executeRejected: "execute: 拒否",
    noteIdle: "いずれかの呼び出しを実行すると、その構造化結果が上の検討条件にとって何を意味するかを表示します。",
    notes: {
      search_devices:
        "qPCRレコードは4件該当し、うちRD-SYN qPCR AとBが検討条件に対する現行候補です。この時点では順位付けは行わず、候補範囲と各レコードの出所を確定させるだけです。",
      compare_devices:
        "性能面ではBが条件を満たします。検出チャンネルは6対4、audit_trailはBが型付きのtrue、Aが型付きのfalseです。どちらも空欄ではないため、AIが監査証跡を推測してよい欠損と誤認できません。",
      get_price_range:
        "Aは架空観測2件の要約なので、480〜510万円は予算600万円以内に収まる対象限定の合成価格幅です。Bは690万円の架空観測1件のみで、rangeStatusはsingle_observation。レンジではなく単一の点であり、かつ予算を超過します。",
      get_literature_signal:
        "Aは架空メソッドレコード12件中7件、Bは6件に出現します。これはコーパス内の出現頻度にすぎません。引用数でも妥当性検証でもなく、監査証跡の要件を覆す根拠にしてはいけません。",
    },
    verdict:
      "普遍的な勝者はいません。GLP監査証跡が必須要件なら、条件を満たすのはBだけで、予算を動かす必要があります。しかもその判断材料は架空価格観測1件です。監査証跡が交渉可能なら、Aは予算内に収まり、架空観測2件から導出した対象限定の価格幅を持ちますが、6色マルチプレックスを失います。ツールはこのトレードオフを可視化するだけで、決めるのは研究者です。",
  },
}[locale];

const scenarios = Object.freeze({
  search_devices: {
    query: "RD-SYN qPCR",
    categoryId: "qpcr",
    status: "active",
    limit: 2,
  },
  compare_devices: {
    productIds: ["rd-syn-qpcr-a", "rd-syn-qpcr-b"],
    maxSpecs: 8,
  },
  get_price_range: {
    productIds: ["rd-syn-qpcr-a", "rd-syn-qpcr-b"],
    currency: "JPY",
  },
  get_literature_signal: {
    productIds: ["rd-syn-qpcr-a", "rd-syn-qpcr-b"],
  },
});

const datasetStatus = document.querySelector("[data-dataset-status]");
const nativeStatus = document.querySelector("[data-native-status]");
const nativeCount = document.querySelector("[data-native-count]");
const nativeCounter = nativeCount.closest(".counter");
const nativeLog = document.querySelector("[data-native-log]");
const outputTitle = document.querySelector("[data-output-title]");
const outputBody = document.querySelector("[data-output]");
const outputInput = document.querySelector("[data-output-input]");
const outputNote = document.querySelector("[data-output-note]");
const productCount = document.querySelector("[data-product-count]");
const categoryCount = document.querySelector("[data-category-count]");
const corpusCount = document.querySelector("[data-corpus-count]");

let nativeExecutions = 0;
let nativeRegisteredTools = 0;
const nativeExecutedTools = new Set();
let nativeRegistration;

function format(value) {
  return JSON.stringify(value, null, 2);
}

function appendNativeActivity(event) {
  nativeExecutions += 1;
  nativeExecutedTools.add(event.tool);
  nativeCount.textContent = String(nativeExecutions);
  nativeCounter.dataset.state = "ready";
  nativeLog.textContent = copy.nativeSummary(
    nativeRegisteredTools,
    nativeExecutedTools.size,
    nativeExecutions,
  );
  const row = document.createElement("li");
  const stamp = document.createElement("time");
  stamp.dateTime = new Date().toISOString();
  stamp.textContent = new Date().toLocaleTimeString(locale === "ja" ? "ja-JP" : "en-US");
  const label = document.createElement("strong");
  label.textContent = `${copy.nativeLabel} · ${event.tool}`;
  const state = document.createElement("span");
  state.textContent = event.ok ? copy.executeOk : copy.executeRejected;
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = copy.evidenceLabel;
  const evidence = document.createElement("pre");
  evidence.textContent = format({
    input: event.input,
    ...(event.ok ? { result: event.result } : { error: event.error }),
  });
  details.append(summary, evidence);
  row.append(stamp, label, state, details);
  document.querySelector("[data-native-events]").prepend(row);
}

function setNativeCounterUnavailable() {
  nativeCount.textContent = "—";
  nativeCounter.dataset.state = "unavailable";
}

function revealLocalResult() {
  const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  outputTitle.focus({ preventScroll: true });
  outputTitle.scrollIntoView({ behavior, block: "start" });
}

function showError(error) {
  outputBody.textContent = format({
    error: error?.code ?? "tool_error",
    message: error instanceof Error ? error.message : copy.failed,
  });
}

async function registerNative(handlers) {
  nativeRegistration = await registerWebMCPTools({
    handlers,
    onActivity: appendNativeActivity,
    locale,
    origin: location.origin,
  });
  if (nativeRegistration.supported) {
    nativeRegisteredTools = nativeRegistration.registeredTools.length;
    nativeStatus.textContent = copy.nativeReady;
    nativeStatus.dataset.state = "ready";
    nativeCount.textContent = String(nativeExecutions);
    nativeCounter.dataset.state = "ready";
    nativeLog.textContent = copy.nativeSummary(
      nativeRegisteredTools,
      nativeExecutedTools.size,
      nativeExecutions,
    );
  } else {
    nativeStatus.textContent = copy.nativeUnavailable;
    nativeStatus.dataset.state = "unavailable";
    nativeLog.textContent = copy.noNativeCalls;
    setNativeCounterUnavailable();
  }
}

async function initialize() {
  datasetStatus.textContent = copy.loading;

  // Registration must not depend on the dataset fetch. `createToolHandlers()` uses the
  // cached lazy loader, so each execute callback resolves the snapshot on first use and
  // a slow or failed fetch can never leave the page with zero registered tools.
  const handlers = createToolHandlers();
  const nativeTask = registerNative(handlers).catch(() => {
    nativeStatus.textContent = copy.nativeFailed;
    nativeStatus.dataset.state = "error";
    nativeLog.textContent = copy.noNativeCalls;
    setNativeCounterUnavailable();
  });

  const localDefinitions = new Map(
    createToolDefinitions(handlers, {
      locale,
      outputProfile: "full",
      origin: location.origin,
    }).map((definition) => [definition.name, definition]),
  );

  for (const button of document.querySelectorAll("[data-run-tool]")) {
    button.addEventListener("click", async () => {
      const name = button.dataset.runTool;
      const definition = localDefinitions.get(name);
      const input = scenarios[name];
      if (!definition || !input) return;
      document.querySelectorAll("[data-run-tool]").forEach((item) => {
        item.disabled = true;
      });
      button.dataset.originalLabel = button.textContent;
      button.textContent = copy.running;
      outputTitle.textContent = `${copy.localRun}: ${name}`;
      outputInput.textContent = format(input);
      outputBody.textContent = copy.running;
      if (outputNote) outputNote.textContent = copy.running;
      try {
        const result = await definition.execute(input);
        outputBody.textContent = format(result);
        if (outputNote) {
          outputNote.textContent =
            name === "get_literature_signal"
              ? `${copy.notes[name]} ${copy.verdict}`
              : copy.notes[name];
        }
      } catch (error) {
        showError(error);
        if (outputNote) outputNote.textContent = copy.noteIdle;
      } finally {
        document.querySelectorAll("[data-run-tool]").forEach((item) => {
          item.disabled = false;
          if (item.dataset.originalLabel) {
            item.textContent = item.dataset.originalLabel;
            delete item.dataset.originalLabel;
          }
        });
        revealLocalResult();
      }
    });
  }

  const data = await loadDemoData();
  productCount.textContent = String(data.profile.counts.products);
  categoryCount.textContent = String(data.profile.counts.categories);
  corpusCount.textContent = String(data.profile.counts.corpusRecords);
  datasetStatus.textContent = `${copy.ready} · ${data.datasetVersion}`;
  await nativeTask;
}

initialize().catch((error) => {
  datasetStatus.textContent = error instanceof Error ? error.message : copy.failed;
  showError(error);
});

addEventListener("pagehide", () => nativeRegistration?.dispose(), { once: true });

if (new Set(TOOL_NAMES).size !== 4) {
  throw new Error("The demo must expose exactly four WebMCP tools.");
}
