const ACTIVE = "█";
const WAIT = "░";

/**
 * One span rendered as a positioned waterfall row.
 *
 * The cockpit's span bars all start at the left edge, which shows how long
 * each step took but not *when* — and "when" is the whole point of a delivery
 * trace. Two nine-minute gaps back to back look identical to two nine-minute
 * gaps at opposite ends of the day until the bars are placed in time.
 *
 * Active and wait get different glyphs rather than different colours, so the
 * split survives a terminal with no colour, a projector that washes out hue,
 * and a screenshot pasted into a deck.
 */
export function waterfallRow(step, run, columns) {
  const runStart = Date.parse(run.startedAt);
  const perColumn = run.elapsedSeconds / columns;

  const offsetSeconds = (Date.parse(step.startedAt) - runStart) / 1000;
  const lead = Math.floor(offsetSeconds / perColumn);

  // A step that ran must never render blank: an invisible span reads as a step
  // that did not happen, which is the opposite of what the trace is asserting.
  const width = Math.max(1, Math.round(step.durationSeconds / perColumn));
  // Active floors while width rounds, so a half-cell of work never gets drawn
  // as a whole one. Active is the flattering number here -- it is the time the
  // agent was doing something -- and rounding it up would quietly shrink the
  // wait bar that the whole chart exists to expose.
  const active = Math.min(width, Math.floor(step.activeSeconds / perColumn));

  const bar = ACTIVE.repeat(active) + WAIT.repeat(width - active);
  // Clamp rather than let a trailing span push the chart wider than its frame;
  // an overflowing row wraps in a terminal and destroys the alignment that
  // makes the shape readable.
  return (" ".repeat(lead) + bar).slice(0, columns);
}

export { ACTIVE, WAIT };
