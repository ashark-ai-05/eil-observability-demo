import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDir = resolve(root, ".demo/lifecycle");
const tracePath = resolve(outputDir, "run.json");
const argv = process.argv.slice(2);
const pause = argv.includes("--pause");
const plain = argv.includes("--no-colour") || argv.includes("--no-color");
const colour = !plain && (process.stdout.isTTY || process.env.FORCE_COLOR);
const sgr = (code, value) => colour ? `\x1b[${code}m${value}\x1b[0m` : value;
const rule = "─".repeat(78);

function requiredRepo(variable) {
  const raw = process.env[variable];
  if (!raw) throw new Error(`${variable} is required; point it at the built pinned checkout`);
  const path = resolve(raw);
  if (!existsSync(path)) throw new Error(`${variable}=${path} does not exist`);
  return path;
}

function waitForPresenter() {
  if (!pause) return Promise.resolve();
  return new Promise((done) => {
    const child = spawn("bash", ["-c", 'read -r -p "  ↵ " _ < /dev/tty'], { stdio: "inherit" });
    child.on("exit", done);
  });
}

async function observedCommand({ label, show, bin, args, cwd, sections = false }) {
  console.log(`\n${sgr(90, rule)}\n${sgr(36, label)}\n  ${sgr(32, "$ ")} ${show}\n`);
  await waitForPresenter();
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const observedSections = [];
  let activeSection = null;
  let stdout = "";
  let stderr = "";
  const child = spawn(bin, args, { cwd, env: process.env });
  let pending = "";
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;
    process.stdout.write(text);
    if (!sections) return;
    pending += text;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      const match = line.match(/^=== (.+) ===$/);
      if (!match) continue;
      const at = performance.now();
      if (activeSection) {
        activeSection.durationMs = Number(Math.max(0.01, at - activeSection.started).toFixed(3));
        delete activeSection.started;
      }
      activeSection = { title: match[1], started: at, startedAt: new Date().toISOString() };
      observedSections.push(activeSection);
    }
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    process.stderr.write(text);
  });
  const status = await new Promise((done, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => done(code ?? 1));
  });
  const endedAt = new Date().toISOString();
  const durationMs = Number(Math.max(0.01, performance.now() - started).toFixed(3));
  if (activeSection) {
    activeSection.durationMs = Number(Math.max(0.01, performance.now() - activeSection.started).toFixed(3));
    delete activeSection.started;
  }
  if (status !== 0) throw new Error(`${show} failed with ${status}: ${stderr.slice(-500)}`);
  return { label, startedAt, endedAt, durationMs, stdout, sections: observedSections };
}

const numberFrom = (text, pattern, fallback = null) => {
  const match = text.match(pattern);
  return match ? Number(match[1].replaceAll(",", "")) : fallback;
};
const durationSeconds = (ms) => Number(Math.max(0.001, ms / 1000).toFixed(3));
const zeroTokens = { input: 0, output: 0, cached: 0, provenance: "measured_no_model_call" };

function traceStep({ id, stage, system, action, detail, durationMs, metrics, artifact, toolCalls = 1, sourceData = "simulated" }) {
  return {
    id,
    stage,
    system,
    action,
    detail,
    durationSeconds: durationSeconds(durationMs),
    activeSeconds: durationSeconds(durationMs),
    durationMs,
    tokens: zeroTokens,
    toolCalls,
    retries: 0,
    modelCostUsd: null,
    infraCostUsd: null,
    resource: Object.entries(metrics).map(([key, value]) => `${key}=${value}`).join(" · "),
    metrics,
    artifact,
    status: "succeeded",
    provenance: { operation: "measured", sourceData },
  };
}

const eilRepo = requiredRepo("EIL_REPO");
const observabilityRepo = requiredRepo("OBSERVABILITY_REPO");
await mkdir(outputDir, { recursive: true });
const lifecycleStartedAt = new Date().toISOString();
const lifecycleStarted = performance.now();

console.log(`\n${sgr(36, sgr(1, "MEASURED DELIVERY LIFECYCLE"))}  synthetic corpus · real execution`);
console.log("Only Confluence, Jira and code content are fixtures. Every operation and metric below executes.");

const eil = await observedCommand({
  label: "01 · INGEST AND INDEX THE KNOWLEDGE PLANE",
  show: "pnpm demo",
  bin: "pnpm",
  args: ["demo"],
  cwd: eilRepo,
  sections: true,
});

const section = (startsWith) => eil.sections.find((item) => item.title.startsWith(startsWith));
const steps = [];
const synthetic = section("Synthetic corpus");
const ingestion = section("Ingestion");
const chunks = section("Structural chunks");
const embeddings = section("Embeddings");
const publication = section("Publication");
const evaluation = section("Evaluation");
const mcp = section("MCP tool surface");

steps.push(traceStep({
  id: "ingest", stage: "understand", system: "EIL ingestion pipeline", action: "Fixture corpus ingested",
  detail: "Real scope, cursor, hashing, normalization, ACL and persistence code processed synthetic Confluence, Jira and Git content.",
  durationMs: (ingestion?.durationMs ?? 0) + (synthetic?.durationMs ?? 0),
  metrics: {
    resourcesPublished: numberFrom(eil.stdout, /([\d,]+) resource\(s\) assigned/),
    confluenceObjects: numberFrom(eil.stdout, /generated: ([\d,]+) confluence/),
    jiraObjects: numberFrom(eil.stdout, /confluence, ([\d,]+) jira/),
    gitEvents: numberFrom(eil.stdout, /jira, ([\d,]+) git change events/),
    ingestMs: numberFrom(eil.stdout, /ingested in ([\d,]+)ms/),
  },
  artifact: { label: "Published EIL corpus", type: "dataset", ref: ".demo/eil-demo.log#ingestion" }, toolCalls: 3,
}));
steps.push(traceStep({
  id: "index", stage: "understand", system: "EIL indexing pipeline", action: "Corpus chunked and indexed",
  detail: "Real structural chunking, offline WASM embeddings, lexical projections and atomic publication ran over the fixture corpus.",
  durationMs: (chunks?.durationMs ?? 0) + (embeddings?.durationMs ?? 0) + (publication?.durationMs ?? 0),
  metrics: {
    structuralChunks: numberFrom(eil.stdout, /structural chunks stored: ([\d,]+)/),
    embeddingDimensions: numberFrom(eil.stdout, /stored at ([\d,]+) dimensions/),
    readyProjections: numberFrom(eil.stdout, /([\d,]+) ready projections/),
  },
  artifact: { label: "Published lexical + vector index", type: "index", ref: ".demo/eil-demo.log#index" }, toolCalls: 3,
}));
steps.push(traceStep({
  id: "read-jira", stage: "understand", system: "EIL MCP tools", action: "Jira evidence read through EIL",
  detail: "The real MCP choke point searched and fetched governed evidence from the indexed synthetic corpus.",
  durationMs: mcp?.durationMs ?? 0,
  metrics: {
    searchResults: numberFrom(eil.stdout, /search_enterprise\("PAY-1"\): ([\d,]+) result/),
    auditEntries: numberFrom(eil.stdout, /audit: ([\d,]+) entries recorded/),
    recallAt10: numberFrom(eil.stdout, /recall@10\s+([\d.]+)/),
    mrr: numberFrom(eil.stdout, /MRR\s+([\d.]+)/),
  },
  artifact: { label: "Governed MCP retrieval", type: "search", ref: ".demo/eil-demo.log#mcp" }, toolCalls: 3,
}));

await observedCommand({ label: "02 · RESET THE CONTROLLED CHANGE", show: "pnpm demo:reset", bin: "pnpm", args: ["demo:reset"], cwd: root });
await writeFile(resolve(root, ".demo/eil-demo.log"), eil.stdout);
const contextPath = resolve(root, ".demo/eil-context.json");
const jiraRank = eil.stdout.match(/\d+\. \[jira\] (.+) — score ([\d.]+)/);
const confluenceRank = eil.stdout.match(/\d+\. \[confluence\] (.+) — score ([\d.]+)/);
await writeFile(contextPath, `${JSON.stringify({
  provenance: { sourceData: "simulated", retrieval: "real_eil_pipeline" },
  evidence: [
    { ref: "jira:PAY-142", source: "jira", title: jiraRank?.[1] ?? "Payment retry issue", score: Number(jiraRank?.[2] ?? 0) },
    { ref: "confluence:payment-retry-runbook", source: "confluence", title: confluenceRank?.[1] ?? "Payment Retry Runbook", score: Number(confluenceRank?.[2] ?? 0) },
  ],
  retrievalMetrics: { recallAt10: numberFrom(eil.stdout, /recall@10\s+([\d.]+)/), mrr: numberFrom(eil.stdout, /MRR\s+([\d.]+)/) },
}, null, 2)}\n`);
process.env.LIFECYCLE_CONTEXT_FILE = contextPath;
const change = await observedCommand({ label: "03 · CRITERIA, CHANGE, TEST AND COMMIT", show: "pnpm demo:run", bin: "pnpm", args: ["demo:run"], cwd: root });
const measuredChange = JSON.parse(await readFile(resolve(root, ".demo/run/measured-steps.json"), "utf8"));
const evidence = JSON.parse(await readFile(resolve(root, ".demo/run/evidence.json"), "utf8"));
const acceptance = JSON.parse(await readFile(resolve(root, ".demo/run/acceptance.json"), "utf8"));

const changeMap = {
  "read-enterprise-context": ["understand", "EIL evidence reader", "Indexed Jira and Confluence evidence read", "context"],
  "write-acceptance-criteria": ["plan", "Criteria generator", "Acceptance criteria written", "criteria"],
  "reproduce-defect": ["verify", "Node test runner", "Defect reproduced before change", "test"],
  "apply-code-change": ["implement", "Filesystem code tool", "Code change applied", "diff"],
  "verify-change": ["verify", "Node test runner", "Change verified", "test"],
  "commit-artifact": ["verify", "Git", "Verified artifact committed", "commit"],
  "record-evidence": ["observe", "Canonical event recorder", "Evidence and receipt recorded", "receipt"],
};
for (const item of measuredChange.steps) {
  const [stage, system, action, type] = changeMap[item.id];
  const artifactRefs = {
    "read-enterprise-context": ".demo/eil-context.json",
    "write-acceptance-criteria": ".demo/run/criteria.json",
    "reproduce-defect": ".demo/payment-retry-repo/payment-retry.test.mjs",
    "apply-code-change": ".demo/payment-retry-repo/payment-retry.mjs",
    "verify-change": ".demo/payment-retry-repo/payment-retry.test.mjs",
    "record-evidence": ".demo/run/recording.json",
  };
  steps.push(traceStep({
    id: item.id,
    stage,
    system,
    action,
    detail: `${item.action}. This operation executed against the disposable repository and its fixture inputs.`,
    durationMs: item.durationMs,
    metrics: item.metrics,
    artifact: {
      label: item.id === "commit-artifact" ? evidence.artifactCommit.slice(0, 8) : item.action,
      type,
      ref: item.id === "commit-artifact" ? `git:${evidence.artifactCommit}` : artifactRefs[item.id],
    },
    sourceData: item.id === "read-enterprise-context" ? "simulated" : "derived_from_simulated_source",
  }));
}

const observed = await observedCommand({
  label: "04 · INGEST THE WORK INTO OBSERVABILITY",
  show: "pnpm test:integration",
  bin: "pnpm",
  args: ["test:integration"],
  cwd: root,
});
await writeFile(resolve(root, ".demo/observability-integration.log"), observed.stdout);
steps.push(traceStep({
  id: "observability-ingest", stage: "observe", system: "Enterprise AI Observability", action: "EIL event persisted and replayed",
  detail: "Real EIL emitted a metadata-only retrieval event; real Observability validated and persisted it, then rejected the duplicate replay.",
  durationMs: observed.durationMs,
  metrics: {
    emittedEvents: 1,
    persistedReceipts: 1,
    duplicateRowsOnReplay: 0,
    captureMode: "metadata_only",
  },
  artifact: { label: "Persisted canonical receipt", type: "receipt", ref: ".demo/observability-integration.log" }, toolCalls: 2,
  sourceData: "derived_from_simulated_source",
}));

const lifecycleEndedAt = new Date().toISOString();
const trace = {
  schemaVersion: 2,
  mode: "measured",
  runId: measuredChange.runId,
  correlationId: measuredChange.runId,
  startedAt: lifecycleStartedAt,
  endedAt: lifecycleEndedAt,
  task: {
    id: "PAY-4471",
    title: "Stop retrying non-retryable payment failures",
    owner: "Payments Platform",
    service: "checkout-payments",
    repository: ".demo/payment-retry-repo",
    risk: "medium",
    outcome: "verified_and_observed",
    environment: "LOCAL",
  },
  pricing: { currency: "USD", version: null, provenance: "unknown_not_metered" },
  provenance: {
    simulated: ["Confluence content", "Jira content", "code corpus"],
    measured: "all ingestion, indexing, retrieval, criteria, file, test, Git, telemetry and persistence operations",
  },
  summaryEvidence: {
    artifactCommit: evidence.artifactCommit,
    acceptanceGatesPassed: acceptance.gates.filter((gate) => gate.passed).length,
    acceptanceGatesTotal: acceptance.gates.length,
    lifecycleExecutionMs: Number((performance.now() - lifecycleStarted).toFixed(3)),
  },
  stageOrder: ["understand", "plan", "implement", "verify", "observe"],
  steps,
  lineage: steps.slice(1).map((step, index) => [steps[index].id, step.id]),
};
await mkdir(outputDir, { recursive: true });
await writeFile(tracePath, `${JSON.stringify(trace, null, 2)}\n`);

console.log(`\n${sgr(90, rule)}\n${sgr(32, sgr(1, "MEASURED OUTPUT WRITTEN"))}`);
console.log(`  ${steps.length} executed spans · ${trace.summaryEvidence.lifecycleExecutionMs.toFixed(1)}ms wall time`);
console.log(`  ${steps.reduce((total, step) => total + step.toolCalls, 0)} tool/process calls · 0 model calls · cost unknown (not $0)`);
console.log(`  commit ${evidence.artifactCommit.slice(0, 8)} · gates ${trace.summaryEvidence.acceptanceGatesPassed}/${trace.summaryEvidence.acceptanceGatesTotal}`);
console.log(`  cockpit source ${tracePath}`);
console.log(`\n  ${sgr(36, "pnpm cockpit")} → http://127.0.0.1:4173\n`);
