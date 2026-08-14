import assert from "node:assert/strict";
import { test } from "node:test";
import { platformTiles } from "../scripts/platform-metrics.mjs";

const run = {
  summary: {
    elapsedSeconds: 12.093,
    tokenTotal: 3000,
    tokenCached: 900,
    tokenInput: 2400,
    modelCalls: 1,
    verifiedShipping: true,
    totalCostUsd: null,
  },
  steps: [{ durationSeconds: 4 }, { durationSeconds: 3 }],
};

test("the consumption tile reports tokens, because cost is not knowable", () => {
  const tiles = platformTiles(run);

  // Copilot meters in AI credits and omits them from telemetry, so a dollar
  // figure here would be invented. Tokens were measured.
  assert.equal(tiles.consumption.value, "3.0k");
  assert.equal(tiles.consumption.label, "TOKENS USED");
});

test("captured versus unattributed is a split of the wall clock", () => {
  const tiles = platformTiles(run);

  // 7s of captured spans inside 12.093s elapsed.
  assert.equal(tiles.split.value, "58 / 42");
});

test("verified shipping reads Proven only when it is", () => {
  assert.equal(platformTiles(run).proof.value, "Proven");

  const unproven = { ...run, summary: { ...run.summary, verifiedShipping: false } };
  assert.equal(platformTiles(unproven).proof.value, "Unproven");
});

test("with no run at all the value slots are empty, not instructional text", () => {
  const tiles = platformTiles(null);

  // The slide previously rendered the literal strings "run lifecycle" and
  // "unknown" in a 20px value slot, which reads to an audience as a broken
  // number rather than as an absent one.
  assert.equal(tiles.consumption.value, "—");
  assert.equal(tiles.split.value, "—");
  assert.equal(tiles.proof.value, "—");
});

test("an absent run says how to produce one, in the caption", () => {
  const tiles = platformTiles(null);

  assert.match(tiles.consumption.caption, /pnpm lifecycle/);
});

test("a run with zero elapsed time does not divide by zero", () => {
  const instant = { summary: { ...run.summary, elapsedSeconds: 0 }, steps: [] };

  assert.equal(platformTiles(instant).split.value, "—");
});
