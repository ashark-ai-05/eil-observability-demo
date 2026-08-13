import assert from "node:assert/strict";
import { test } from "node:test";
import { waterfallRow } from "../scripts/journey-layout.mjs";

/** One step occupying the middle of a 100s run: 40s in, 20s long, 5s of it working. */
const step = { startedAt: "2026-08-13T09:00:40.000Z", durationSeconds: 20, activeSeconds: 5 };
const run = { startedAt: "2026-08-13T09:00:00.000Z", elapsedSeconds: 100 };

test("a span is drawn where it happened, not flush left", () => {
  const row = waterfallRow(step, run, 50);

  // 40s into a 100s run across 50 columns -> 20 leading blanks.
  assert.equal(row.indexOf("█"), 20);
});

test("active and wait are different glyphs so the split is visible", () => {
  const row = waterfallRow(step, run, 50);

  // 20s of 100s across 50 columns = 10 cells; 5s active = 2 of them.
  const bar = row.trim();
  assert.equal(bar.length, 10);
  assert.equal([...bar].filter((glyph) => glyph === "█").length, 2);
  assert.equal([...bar].filter((glyph) => glyph === "░").length, 8);
});

test("a span shorter than one column still draws, rather than vanishing", () => {
  // 1s of a 100s run across 50 columns rounds to half a cell.
  const brief = { startedAt: run.startedAt, durationSeconds: 1, activeSeconds: 1 };

  const row = waterfallRow(brief, run, 50);

  // A step that ran must never render as blank: an invisible span reads as
  // a step that did not happen.
  assert.ok(row.trim().length >= 1);
});

test("a fully waiting span draws no active glyph", () => {
  const idle = { startedAt: run.startedAt, durationSeconds: 20, activeSeconds: 0 };

  const row = waterfallRow(idle, run, 50);

  assert.equal([...row].filter((glyph) => glyph === "█").length, 0);
  assert.ok([...row].filter((glyph) => glyph === "░").length > 0);
});

test("the last span ends inside the chart rather than overflowing it", () => {
  const last = { startedAt: "2026-08-13T09:01:30.000Z", durationSeconds: 10, activeSeconds: 10 };

  const row = waterfallRow(last, run, 50);

  assert.ok(row.length <= 50, `row was ${row.length} columns wide`);
});
