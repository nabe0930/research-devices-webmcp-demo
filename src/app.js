import { loadDemoData } from "./data-store.js";
import { createToolHandlers } from "./tools.js";
import { createToolDefinitions, registerWebMCPTools, TOOL_NAMES } from "./webmcp.js";

const locale = document.documentElement.lang === "ja" ? "ja" : "en";
const copy = {
  en: {
    loading: "Loading the fictional demo dataset…",
    ready: "Fictional demo dataset ready",
    localRun: "On-page check",
    running: "Running…",
    failed: "The demonstration call failed.",
    nativeReady: "WebMCP tool access is ready — 4 read-only tools available",
    nativeUnavailable:
      "This browser cannot call the WebMCP tools directly. The buttons below still show the same processing on this page.",
    nativeFailed: "The WebMCP tools could not be made available in this browser.",
    noNativeCalls: "No WebMCP tool execution has reached this page in this session.",
    nativeSummary: (registered, executed, callbacks) =>
      `Tools available: ${registered}/4 · Tools called through WebMCP: ${executed}/4 · Total WebMCP calls: ${callbacks}`,
    nativeLabel: "WebMCP call",
    evidenceLabel: "Technical details (input and result JSON)",
    executeOk: "Run succeeded",
    executeRejected: "Could not run",
    noteIdle: "Run a call to see what the structured result means for the brief above.",
    notes: {
      search_devices:
        "Four qPCR records match. The requested two candidates return as RD-SYN qPCR A and B with stable IDs and their source pages. Nothing is ranked or selected yet.",
      compare_devices:
        "Both records have 96 wells. B has 6 detection channels, supports up to 6 multiplex targets, and has an audit-trail capability. A has 4 channels, supports up to 4 targets, and does not have that capability.",
      get_price_range:
        "A has two fictional price records, producing a demo range of ¥4,800,000–5,100,000 under the ¥6,000,000 ceiling. B has one fictional price record at ¥6,900,000, so it is a single example rather than a price range, and it exceeds the ceiling.",
      get_literature_signal:
        "A is named in 7 of the 12 fictional research records created for this demo and B in 6. These are device-name mention counts, not papers, citations, validation, or verified use, and they do not resolve the capability-budget trade-off.",
    },
    verdict:
      "No record meets every constraint. B has six channels, supports six targets, and has an audit-trail capability, but its single fictional price record is ¥6,900,000, above the ceiling. A fits the ceiling based on two fictional price records, but has four channels, supports four targets, and has no audit-trail capability. The tools expose the trade-off; the researcher decides.",
  },
  ja: {
    loading: "架空のデモデータを読み込んでいます…",
    ready: "架空のデモデータを準備しました",
    localRun: "ページ内確認",
    running: "実行中…",
    failed: "デモ機能を実行できませんでした。",
    nativeReady: "WebMCP機能の準備完了 — 読み取り専用4機能を利用できます",
    nativeUnavailable:
      "このブラウザでは、AIからWebMCP機能を直接利用できません。下のボタンでは、WebMCPと同じ処理結果を確認できます。",
    nativeFailed: "このブラウザではWebMCP機能を利用できません。",
    noNativeCalls: "このページを開いてから、WebMCP経由のツール実行はまだありません。",
    nativeSummary: (registered, executed, callbacks) =>
      `利用可能な機能: ${registered}/4 · WebMCP経由で実行した機能: ${executed}/4 · WebMCP経由の実行回数: ${callbacks}`,
    nativeLabel: "WebMCP経由の実行",
    evidenceLabel: "技術詳細（入力・出力JSON）",
    executeOk: "実行成功",
    executeRejected: "実行できませんでした",
    noteIdle: "いずれかの機能を実行すると、結果を日本語で説明します。",
    notes: {
      search_devices:
        "リアルタイムPCR（qPCR）の機器データは4件該当します。指定した2候補を一意の機器IDで返し、各データの出典も保持します。この時点では順位付けも選定も行いません。",
      compare_devices:
        "両方とも96ウェルです。Bは検出チャンネル数6・同時測定できるターゲット数6・監査証跡機能あり、Aは4・4・監査証跡機能なしです。",
      get_price_range:
        "Aは架空の価格記録2件に基づく480〜510万円で、予算600万円以内です。Bは690万円の架空の価格記録1件だけなので価格幅ではなく、予算も超えています。",
      get_literature_signal:
        "Aはこのデモ用に作成した架空研究記録12件中7件、Bは6件で機器名が言及されています。これは論文数、引用数、性能の裏付け、実際の利用実績ではなく、機能と予算のどちらを優先するかを決める情報でもありません。",
    },
    verdict:
      "すべての条件を満たす候補はありません。Bは検出6チャンネル・同時測定6ターゲット・監査証跡機能ありですが、架空の価格記録は690万円の1件だけで予算超過です。Aは架空の価格記録2件に基づく480万〜510万円で予算内ですが、検出4チャンネル・同時測定4ターゲット・監査証跡機能なしです。ツールは両立しない条件を示し、最終判断は研究者が行います。",
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
