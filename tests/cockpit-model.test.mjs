import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolve } from "node:path";
import { buildCockpitModel, cockpitModel } from "../scripts/cockpit-model.mjs";

const root = resolve(import.meta.dirname, "..");
const fixture = async () => JSON.parse(await readFile(resolve(root, "scenario/delivery-lifecycle.json"), "utf8"));

test("cockpit derives executive totals and developer spans from one simulated trace", async () => {
  const model = buildCockpitModel(await fixture());
  assert.equal(model.mode, "simulated");
  assert.equal(model.task.id, "PAY-4471");
  assert.equal(model.steps.length, 11);
  assert.equal(model.summary.toolCalls, model.steps.reduce((total, step) => total + step.toolCalls, 0));
  assert.equal(model.summary.tokenTotal, model.steps.reduce((total, step) => total + step.tokens.total, 0));
  assert.equal(model.summary.elapsedSeconds, model.summary.activeSeconds + model.summary.waitSeconds);
  assert.equal(model.summary.verifiedShipping, true);
  assert.equal(model.summary.attributionCoverage, 1);
});

test("measured trace keeps unknown cost and proves verified observed lineage", async () => {
  const base = await fixture();
  const trace = {
    ...base,
    mode: "measured",
    stageOrder: ["verify", "observe"],
    pricing: { currency: "USD", version: null, provenance: "unknown_not_metered" },
    summaryEvidence: { lifecycleExecutionMs: 2000 },
    steps: [
      { ...base.steps[0], id: "verify-change", stage: "verify", modelCostUsd: null, infraCostUsd: null, metrics: { testsPassed: 1 } },
      { ...base.steps[1], id: "observability-ingest", stage: "observe", modelCostUsd: null, infraCostUsd: null, metrics: { persistedReceipts: 1 } },
    ],
    lineage: [["verify-change", "observability-ingest"]],
  };
  const model = buildCockpitModel(trace);
  assert.equal(model.mode, "measured");
  assert.equal(model.summary.totalCostUsd, null);
  assert.equal(model.summary.verifiedShipping, true);
  assert.equal(model.summary.attributionCoverage, 1);
  assert.equal(model.steps[1].metrics.persistedReceipts, 1);
  assert.equal(model.summary.projectedElapsedSeconds, model.summary.elapsedSeconds * 420);
  assert.equal(model.summary.modelCalls, 0);
  assert.equal(model.summary.usageProvenance, "measured");
});

test("missing evidence artifact breaks trace reconstruction", async () => {
  const trace = await fixture();
  delete trace.steps[3].artifact;
  assert.throws(() => buildCockpitModel(trace), /missing a resolvable artifact/);
});

test("one simulated LLM call downgrades aggregate usage provenance", async () => {
  const trace = await fixture();
  trace.steps[0].tokens = { input: 2400, output: 600, cached: 900, provenance: "simulated_provider_usage" };
  trace.steps[0].metrics = { modelCalls: 1 };
  const model = buildCockpitModel(trace);
  assert.equal(model.summary.modelCalls, 1);
  assert.equal(model.summary.tokenTotal, 3000 + trace.steps.slice(1).reduce((total, step) => total + step.tokens.input + step.tokens.output, 0));
  assert.equal(model.summary.usageProvenance, "simulated");
});

test("missing terminal measurement never becomes zero duration", async () => {
  const trace = await fixture();
  delete trace.steps[4].durationSeconds;
  assert.throws(() => buildCockpitModel(trace), /no complete duration measurement/);
});

test("unpriced usage propagates unknown instead of understating cost", async () => {
  const trace = await fixture();
  delete trace.steps[4].modelCostUsd;
  const model = buildCockpitModel(trace);
  assert.equal(model.steps[4].costUsd, null);
  assert.equal(model.steps[4].costProvenance, "unknown");
  assert.equal(model.summary.totalCostUsd, null);
});

test("production outcome is unproven without causal verification lineage", async () => {
  const trace = await fixture();
  trace.lineage = trace.lineage.filter(([source]) => source !== "bamboo");
  const model = buildCockpitModel(trace);
  assert.equal(model.summary.verifiedShipping, false);
});

test("platform observability slide reads token-first cockpit metrics without unexplained placeholders", async () => {
  const html = await readFile(resolve(root, "platform/eil-platform.html"), "utf8");
  assert.match(html, /fetch\("\/api\/run"\)/);
  assert.match(html, /id="obs-elapsed"/);
  assert.match(html, /import\("\/platform-metrics\.mjs"\)/);
  assert.doesNotMatch(html, />unknown</);
  assert.doesNotMatch(html, /52m 29s|\$0\.54|32 \/ 68/);
});

test("an unpopulated slide shows an empty value, not words where a number belongs", async () => {
  const html = await readFile(resolve(root, "platform/eil-platform.html"), "utf8");

  // It previously shipped "run lifecycle" and "unknown" inside a 20px bold
  // value slot. An audience reads that as a broken number rather than an
  // absent one; guidance belongs in the caption, at caption size.
  for (const id of ["obs-elapsed", "obs-work-wait", "obs-tokens", "obs-proof"]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*>—<`), `${id} should default to an em-dash`);
    assert.match(html, new RegExp(`id="${id}-cap"[^>]*>run \`pnpm lifecycle\``), `${id} needs a caption`);
  }
});

test("the slide reports consumption in tokens, never in dollars", async () => {
  const html = await readFile(resolve(root, "platform/eil-platform.html"), "utf8");

  // Copilot meters in AI credits and omits them from telemetry, so any dollar
  // figure on this slide would be invented rather than measured.
  assert.match(html, /TOKENS PER OUTCOME/);
  assert.doesNotMatch(html, /COST PER OUTCOME/);
});
