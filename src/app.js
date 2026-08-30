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
const nativeLog = document.querySelector("[data-native-log]");
const outputTitle = document.querySelector("[data-output-title]");
const outputBody = document.querySelector("[data-output]");
const outputInput = document.querySelector("[data-output-input]");
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
    nativeLog.textContent = copy.nativeSummary(
      nativeRegisteredTools,
      nativeExecutedTools.size,
      nativeExecutions,
    );
  } else {
    nativeStatus.textContent = copy.nativeUnavailable;
    nativeStatus.dataset.state = "unavailable";
    nativeLog.textContent = copy.noNativeCalls;
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
      try {
        const result = await definition.execute(input);
        outputBody.textContent = format(result);
      } catch (error) {
        showError(error);
      } finally {
        document.querySelectorAll("[data-run-tool]").forEach((item) => {
          item.disabled = false;
          if (item.dataset.originalLabel) {
            item.textContent = item.dataset.originalLabel;
            delete item.dataset.originalLabel;
          }
        });
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
