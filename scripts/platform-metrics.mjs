import { tokenMetrics } from "./token-metrics.mjs";

const ABSENT = "—";
const HOW = "run `pnpm lifecycle`, then reload";

/**
 * The four tiles on the platform deck's observability slide.
 *
 * Two rules learned the hard way here:
 *
 * The consumption tile reports **tokens**, not dollars. Copilot meters in AI
 * credits and omits them from its telemetry, so a dollar figure on this slide
 * would be invented; tokens were measured.
 *
 * An absent run renders `—`, never instructional text. The slide previously
 * shipped the literal strings "run lifecycle" and "unknown" sitting in a 20px
 * bold value slot, which an audience reads as a broken number rather than as
 * an absent one. Guidance belongs in the caption, at caption size.
 */
export function platformTiles(run) {
  if (!run?.summary) {
    return {
      elapsed: tile("LEAD TIME", ABSENT, HOW),
      split: tile("WORK / OTHER TIME", ABSENT, HOW),
      consumption: tile("TOKENS PER OUTCOME", ABSENT, HOW),
      proof: tile("VERIFIED SHIPPING", ABSENT, HOW),
    };
  }

  const { summary, steps = [] } = run;
  const elapsed = summary.elapsedSeconds;
  const captured = steps.reduce((total, step) => total + (step.durationSeconds ?? 0), 0);
  const capturedPct = elapsed > 0 ? Math.round((captured / elapsed) * 100) : null;

  const tokens = tokenMetrics(summary, {
    acceptedOutcomes: summary.verifiedShipping ? 1 : 0,
    provenance: "measured",
  });

  return {
    elapsed: tile("LEAD TIME", duration(elapsed), "intake → verified receipt"),
    split: tile(
      "WORK / OTHER TIME",
      capturedPct === null ? ABSENT : `${capturedPct} / ${100 - capturedPct}`,
      capturedPct === null ? HOW : "spans versus orchestration overhead",
    ),
    consumption: tile(
      "TOKENS PER OUTCOME",
      tokens.headline,
      `${summary.modelCalls} model call(s) · ${format(summary.tokenCached)} cached`,
    ),
    proof: tile(
      "VERIFIED SHIPPING",
      summary.verifiedShipping ? "Proven" : "Unproven",
      "every step resolves to an artifact",
    ),
  };
}

const tile = (label, value, caption) => ({ label, value, caption });

function duration(seconds) {
  if (!Number.isFinite(seconds)) return ABSENT;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function format(tokens) {
  if (!Number.isFinite(tokens)) return ABSENT;
  return tokens < 1000 ? String(tokens) : `${(tokens / 1000).toFixed(1)}k`;
}
