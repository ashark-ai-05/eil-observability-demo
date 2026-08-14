/**
 * Token-denominated consumption, for when cost cannot be stated.
 *
 * Copilot meters in AI credits and omits them from its telemetry, so a real
 * run has measured tokens and an unknown dollar figure. Rendering that as a
 * headline "UNKNOWN" is accurate and useless: it reads as a broken panel
 * rather than as an honest one.
 *
 * The fix is not to invent a cost but to change the denominator. Tokens per
 * accepted outcome answers the same question cost per accepted outcome was
 * asking — what did one shipped change consume — using a number that was
 * actually measured.
 */
export function tokenMetrics(summary, { acceptedOutcomes, provenance }) {
  const total = summary.tokenTotal ?? 0;
  const input = summary.tokenInput ?? 0;
  const cached = summary.tokenCached ?? 0;

  return {
    total,
    input,
    output: summary.tokenOutput ?? 0,
    cached,
    // Reuse is a property of input: output tokens are generated fresh every
    // time and can never be served from cache, so including them in the
    // denominator would understate how well the cache is working.
    cachedRatio: input > 0 ? Number((cached / input).toFixed(3)) : null,
    // Dividing by zero outcomes would produce Infinity, which renders as a
    // number. There is simply no per-outcome figure until something ships.
    perOutcome: acceptedOutcomes > 0 ? Math.round(total / acceptedOutcomes) : null,
    provenance,
    headline: abbreviate(total),
  };
}

/** `13.2k` reads at a glance; `13,194` does not, and neither needs a currency. */
function abbreviate(tokens) {
  if (tokens < 1000) return String(tokens);
  return `${(tokens / 1000).toFixed(1)}k`;
}
