import assert from "node:assert/strict";
import { test } from "node:test";
import { combine, describeBasis, project, scaleApplies } from "../scripts/provenance.mjs";

const basis = { version: "demo-scale-2026-08-14", multiplier: 420, why: "test" };

test("a projected value is never labelled measured", () => {
  const projected = project(6, basis);

  assert.equal(projected.provenance, "projected");
  assert.equal(projected.seconds, 2520);
});

test("a projection carries the basis that produced it", () => {
  const projected = project(6, basis);

  // A projected number displayed without its multiplier is indistinguishable
  // from a measured one, which is the whole failure this guards.
  assert.equal(projected.basis.multiplier, 420);
  assert.equal(projected.basis.version, "demo-scale-2026-08-14");
});

test("projecting an unmeasurable value stays unknown rather than becoming a number", () => {
  const projected = project(null, basis);

  assert.equal(projected.provenance, "unknown");
  assert.equal(projected.seconds, null);
});

test("the weakest provenance wins when values are combined", () => {
  // One simulated LLM call in a run of measured spans makes the total
  // simulated. Reporting it as measured is the lie this prevents.
  assert.equal(combine(["measured", "measured"]), "measured");
  assert.equal(combine(["measured", "simulated"]), "simulated");
  assert.equal(combine(["measured", "projected"]), "projected");
  assert.equal(combine(["simulated", "projected"]), "projected");
});

test("unknown beats everything, including simulated", () => {
  assert.equal(combine(["measured", "simulated", "unknown"]), "unknown");
  assert.equal(combine(["unknown"]), "unknown");
});

test("combining nothing is unknown, not measured", () => {
  // An empty set of contributors must not read as a clean measured total.
  assert.equal(combine([]), "unknown");
});

test("a basis renders as a sentence a reader can check", () => {
  const sentence = describeBasis(basis);

  assert.match(sentence, /420/);
  assert.match(sentence, /demo-scale-2026-08-14/);
});

test("scaling applies to a measured run, whose durations are milliseconds", () => {
  assert.equal(scaleApplies("measured"), true);
});

test("scaling refuses a simulated trace, whose durations are already realistic", () => {
  // The simulated fixture already reports a 52-minute lead time. Multiplying
  // it by the demo scale produced 367 hours -- a number that is wrong in the
  // one direction nobody checks, because it still looks like a duration.
  assert.equal(scaleApplies("simulated"), false);
});
