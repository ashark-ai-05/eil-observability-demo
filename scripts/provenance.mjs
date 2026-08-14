/**
 * Provenance of a number, and the arithmetic for keeping it honest.
 *
 * The demo executes in seconds what an enterprise delivery takes an afternoon
 * to do, so a measured run reports a lead time of milliseconds. That is useless
 * to an audience, and the obvious fix — multiply it until it looks realistic —
 * manufactures a number that reads as measured and is not.
 *
 * The resolution is not to refuse the multiplier but to refuse to hide it. A
 * scaled value is `projected`, carries the basis that produced it, and may not
 * be displayed in the same column as a measured one.
 */

/** Weakest first. A total is only as trustworthy as its least trustworthy part. */
const STRENGTH = ["unknown", "projected", "simulated", "measured"];

/**
 * Scale a measured duration by a stated multiplier.
 *
 * Returns `projected`, never `measured` — the multiplier is a modelling
 * assumption about enterprise scale, not an observation of one.
 */
export function project(measuredSeconds, basis) {
  if (measuredSeconds === null || !Number.isFinite(measuredSeconds)) {
    // Scaling an unmeasurable value would invent one. Multiplying nothing by
    // 420 is still nothing, and must not arrive on the page as a duration.
    return { seconds: null, provenance: "unknown", basis };
  }
  return {
    seconds: Number((measuredSeconds * basis.multiplier).toFixed(3)),
    provenance: "projected",
    basis,
  };
}

/**
 * The provenance of a value derived from several others.
 *
 * One simulated LLM call inside a run of measured spans makes the total
 * simulated; one unmeasurable span makes it unknown. This is the same rule
 * `measureWorkflowTrace` applies to unknown work totals, generalised: a
 * summary may never claim more certainty than its weakest contributor.
 */
export function combine(provenances) {
  // No contributors is not a clean measured total — it is an absence.
  if (provenances.length === 0) return "unknown";
  return provenances.reduce(
    (weakest, current) =>
      STRENGTH.indexOf(current) < STRENGTH.indexOf(weakest) ? current : weakest,
    "measured",
  );
}

/**
 * Whether the scale multiplier may be applied to a trace at all.
 *
 * Only a measured run needs it: its spans are the milliseconds the demo
 * actually took. The simulated fixture already carries realistic corporate
 * durations -- a 52-minute lead time -- and multiplying those produced 367
 * hours, which is wrong in the one direction nobody checks, because it still
 * looks like a duration.
 */
export function scaleApplies(mode) {
  return mode === "measured";
}

/** One line a reader can check the arithmetic against. */
export function describeBasis(basis) {
  return `projected at ${basis.multiplier}x measured (${basis.version}) — ${basis.why}`;
}

/**
 * The demo's shipped basis.
 *
 * The multiplier is chosen so a run whose spans measure a few seconds lands in
 * the range a real delivery occupies. It is a presentation aid with a stated
 * value, not a claim about any particular organisation's cycle time.
 */
export const DEMO_SCALE_BASIS = {
  version: "demo-scale-2026-08-14",
  multiplier: 420,
  why: "one demo second stands for seven minutes of enterprise delivery",
};
