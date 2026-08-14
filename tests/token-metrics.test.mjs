import assert from "node:assert/strict";
import { test } from "node:test";
import { tokenMetrics } from "../scripts/token-metrics.mjs";

const summary = {
  tokenInput: 13058,
  tokenOutput: 136,
  tokenCached: 1408,
  tokenTotal: 13194,
  modelCalls: 1,
};

test("tokens per accepted outcome is the denominator cost cannot supply", () => {
  const metrics = tokenMetrics(summary, { acceptedOutcomes: 1, provenance: "measured" });

  assert.equal(metrics.perOutcome, 13194);
  assert.equal(metrics.provenance, "measured");
});

test("cache reuse is reported against input, not against the total", () => {
  const metrics = tokenMetrics(summary, { acceptedOutcomes: 1, provenance: "measured" });

  // 1408 of 13058 input tokens were served from cache. Dividing by the total
  // would understate reuse by counting output tokens that can never be cached.
  assert.equal(metrics.cachedRatio, 0.108);
});

test("no accepted outcome means no per-outcome figure, not a division by zero", () => {
  const metrics = tokenMetrics(summary, { acceptedOutcomes: 0, provenance: "measured" });

  assert.equal(metrics.perOutcome, null);
});

test("a run with no model calls reports zero tokens as measured, not unknown", () => {
  // Zero is the right answer here and unknown is not: the run genuinely made
  // no model calls, which is different from having made some we cannot count.
  const metrics = tokenMetrics(
    { tokenInput: 0, tokenOutput: 0, tokenCached: 0, tokenTotal: 0, modelCalls: 0 },
    { acceptedOutcomes: 1, provenance: "measured" },
  );

  assert.equal(metrics.total, 0);
  assert.equal(metrics.provenance, "measured");
  assert.equal(metrics.cachedRatio, null);
});

test("simulated token counts stay labelled simulated", () => {
  const metrics = tokenMetrics(summary, { acceptedOutcomes: 1, provenance: "simulated" });

  assert.equal(metrics.provenance, "simulated");
});

test("a compact headline reads without a currency", () => {
  const metrics = tokenMetrics(summary, { acceptedOutcomes: 1, provenance: "measured" });

  assert.equal(metrics.headline, "13.2k");
});

test("thousands are only abbreviated once they exist", () => {
  const small = tokenMetrics(
    { tokenInput: 400, tokenOutput: 100, tokenCached: 0, tokenTotal: 500, modelCalls: 1 },
    { acceptedOutcomes: 1, provenance: "measured" },
  );

  assert.equal(small.headline, "500");
});
