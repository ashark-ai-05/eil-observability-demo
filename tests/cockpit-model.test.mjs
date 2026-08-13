import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolve } from "node:path";
import { buildCockpitModel, cockpitModel } from "../scripts/cockpit-model.mjs";

const root = resolve(import.meta.dirname, "..");
const fixture = async () => JSON.parse(await readFile(resolve(root, "scenario/delivery-lifecycle.json"), "utf8"));

test("cockpit derives executive totals and developer spans from one simulated trace", async () => {
  const model = await cockpitModel(root);
  assert.equal(model.mode, "simulated");
  assert.equal(model.task.id, "PAY-4471");
  assert.equal(model.steps.length, 11);
  assert.equal(model.summary.toolCalls, model.steps.reduce((total, step) => total + step.toolCalls, 0));
  assert.equal(model.summary.tokenTotal, model.steps.reduce((total, step) => total + step.tokens.total, 0));
  assert.equal(model.summary.elapsedSeconds, model.summary.activeSeconds + model.summary.waitSeconds);
  assert.equal(model.summary.verifiedShipping, true);
  assert.equal(model.summary.attributionCoverage, 1);
});

test("missing evidence artifact breaks trace reconstruction", async () => {
  const trace = await fixture();
  delete trace.steps[3].artifact;
  assert.throws(() => buildCockpitModel(trace), /missing a resolvable artifact/);
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
