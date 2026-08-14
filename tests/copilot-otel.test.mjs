import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { summariseCopilotOtel } from "../scripts/copilot-otel.mjs";

const root = resolve(import.meta.dirname, "..");
const fixture = async () =>
  summariseCopilotOtel(await readFile(resolve(root, "fixtures/copilot-otel-sample.jsonl"), "utf8"));

test("token counts come from the real export, not an estimate", async () => {
  const run = await fixture();

  assert.equal(run.tokens.input, 13058);
  assert.equal(run.tokens.output, 136);
  assert.equal(run.tokens.cachedInput, 1408);
  assert.equal(run.tokens.reasoningOutput, 128);
  assert.equal(run.tokens.provenance, "measured");
});

test("cost is unknown, never zero", async () => {
  const run = await fixture();

  // The export carries `github.copilot.cost: 0.0` for a call the CLI's own
  // footer billed at 0.32 AI credits. Trusting that field would put $0.00 on
  // the page for work that cost real money -- the exact failure this whole
  // repository is built to refuse.
  assert.equal(run.cost.provenance, "unknown");
  assert.equal(run.cost.usd, null);
  assert.match(run.cost.reason, /credit/i);
});

test("the reported cost field is surfaced as evidence, not as a total", async () => {
  const run = await fixture();

  // Keep what the tool said, so the discrepancy is auditable rather than
  // silently discarded.
  assert.equal(run.cost.reportedByTool, 0);
});

test("model calls are counted from chat spans", async () => {
  const run = await fixture();

  assert.equal(run.modelCalls, 1);
});

test("the model recorded is the one that answered, not the alias requested", async () => {
  const run = await fixture();

  // The request asked for "auto"; a cost or capability claim about "auto" is
  // meaningless, so the resolved model is what gets recorded.
  assert.equal(run.model, "gpt-5-mini");
});

test("duration comes from the agent span", async () => {
  const run = await fixture();

  assert.ok(run.durationSeconds > 0, "expected a positive duration");
  assert.ok(run.durationSeconds < 600, `implausible duration ${run.durationSeconds}`);
});

test("an export with no chat span reports unknown tokens rather than zero", () => {
  const run = summariseCopilotOtel("");

  assert.equal(run.tokens.provenance, "unknown");
  assert.equal(run.tokens.input, null);
  assert.equal(run.modelCalls, 0);
});

test("malformed lines are skipped rather than aborting the run", () => {
  const run = summariseCopilotOtel('not json\n{"type":"span","name":"chat x","attributes":{}}\n');

  assert.equal(run.modelCalls, 1);
});
