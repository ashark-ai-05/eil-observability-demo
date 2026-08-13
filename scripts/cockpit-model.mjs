import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const sum = (items, select) => items.reduce((total, item) => total + select(item), 0);
const round = (value, digits = 4) => Number(value.toFixed(digits));

const pathExists = (links, source, target) => {
  const seen = new Set();
  const visit = (id) => {
    if (id === target) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return links.filter(([from]) => from === id).some(([, to]) => visit(to));
  };
  return visit(source);
};

export function buildCockpitModel(trace) {
  if (trace.mode !== "simulated") throw new Error("demo trace must declare simulated mode");
  if (!Array.isArray(trace.steps) || trace.steps.length === 0) throw new Error("demo trace requires steps");
  const ids = new Set();
  let cursor = Date.parse(trace.startedAt);
  const steps = trace.steps.map((step, index) => {
    if (!step.id || ids.has(step.id)) throw new Error(`step ${index + 1} must have a unique id`);
    ids.add(step.id);
    if (!step.artifact?.ref) throw new Error(`${step.id} is missing a resolvable artifact`);
    if (!Number.isFinite(step.durationSeconds) || !Number.isFinite(step.activeSeconds)) {
      throw new Error(`${step.id} has no complete duration measurement`);
    }
    if (step.durationSeconds < 0 || step.activeSeconds < 0 || step.activeSeconds > step.durationSeconds) {
      throw new Error(`${step.id} has an invalid active/wait duration`);
    }
    const priced = Number.isFinite(step.modelCostUsd) && Number.isFinite(step.infraCostUsd);
    const startedAt = new Date(cursor).toISOString();
    cursor += step.durationSeconds * 1000;
    const waitSeconds = step.durationSeconds - step.activeSeconds;
    return {
      ...step,
      order: index + 1,
      startedAt,
      endedAt: new Date(cursor).toISOString(),
      waitSeconds,
      tokens: { ...step.tokens, total: step.tokens.input + step.tokens.output },
      costUsd: priced ? round(step.modelCostUsd + step.infraCostUsd) : null,
      costProvenance: priced ? trace.pricing.provenance : "unknown",
    };
  });
  const elapsedSeconds = sum(steps, (step) => step.durationSeconds);
  const activeSeconds = sum(steps, (step) => step.activeSeconds);
  const tokenInput = sum(steps, (step) => step.tokens.input);
  const tokenOutput = sum(steps, (step) => step.tokens.output);
  const allPriced = steps.every((step) => step.costUsd !== null);
  const modelCostUsd = allPriced ? round(sum(steps, (step) => step.modelCostUsd)) : null;
  const infraCostUsd = allPriced ? round(sum(steps, (step) => step.infraCostUsd)) : null;
  const totalCostUsd = allPriced ? round(modelCostUsd + infraCostUsd) : null;
  const stages = ["understand", "plan", "implement", "verify", "release"].map((name) => {
    const members = steps.filter((step) => step.stage === name);
    return {
      name,
      durationSeconds: sum(members, (step) => step.durationSeconds),
      activeSeconds: sum(members, (step) => step.activeSeconds),
      costUsd: members.every((step) => step.costUsd !== null) ? round(sum(members, (step) => step.costUsd)) : null,
      steps: members.length,
    };
  });
  return {
    schemaVersion: trace.schemaVersion,
    mode: trace.mode,
    runId: trace.runId,
    correlationId: trace.correlationId,
    startedAt: trace.startedAt,
    endedAt: new Date(cursor).toISOString(),
    task: trace.task,
    pricing: trace.pricing,
    summary: {
      elapsedSeconds,
      activeSeconds,
      waitSeconds: elapsedSeconds - activeSeconds,
      tokenInput,
      tokenOutput,
      tokenCached: sum(steps, (step) => step.tokens.cached),
      tokenTotal: tokenInput + tokenOutput,
      toolCalls: sum(steps, (step) => step.toolCalls),
      retries: sum(steps, (step) => step.retries),
      modelCostUsd,
      infraCostUsd,
      totalCostUsd,
      verifiedShipping: steps.some((step) => step.id === "bamboo" && step.status === "succeeded")
        && steps.some((step) => step.id === "prd-release" && step.status === "succeeded")
        && pathExists(trace.lineage, "bamboo", "prd-release"),
      attributionCoverage: trace.lineage.length === steps.length - 1 ? 1 : round(trace.lineage.length / (steps.length - 1)),
    },
    stages,
    steps,
    lineage: trace.lineage,
  };
}

export async function cockpitModel(root) {
  const trace = JSON.parse(await readFile(resolve(root, "scenario/delivery-lifecycle.json"), "utf8"));
  return buildCockpitModel(trace);
}
