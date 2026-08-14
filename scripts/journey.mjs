import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cockpitModel } from "./cockpit-model.mjs";
import { ACTIVE, WAIT, waterfallRow } from "./journey-layout.mjs";
import { DEMO_SCALE_BASIS, describeBasis, project, scaleApplies } from "./provenance.mjs";

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(`--${flag}`);
const VERBOSE = has("verbose");
const COLOUR =
  has("colour") ||
  has("color") ||
  !!process.env.FORCE_COLOR ||
  (process.stdout.isTTY && !process.env.NO_COLOR && !has("no-colour") && !has("no-color"));

const sgr = (code) => (s) => (COLOUR ? `\x1b[${code}m${s}\x1b[0m` : s);
const c = {
  bold: sgr(1),
  dim: sgr(2),
  cyan: sgr(36),
  amber: sgr(33),
  green: sgr(32),
  red: sgr(31),
  grey: sgr(90),
};
/** Reverse-video chip, so a step number reads as a marker rather than as text. */
const chip = (s) => (COLOUR ? `\x1b[46m\x1b[30m\x1b[1m${s}\x1b[0m` : `[${s.trim()}]`);
const warnChip = (s) => (COLOUR ? `\x1b[43m\x1b[30m\x1b[1m${s}\x1b[0m` : `[${s.trim()}]`);
const okChip = (s) => (COLOUR ? `\x1b[42m\x1b[30m\x1b[1m${s}\x1b[0m` : `[${s.trim()}]`);

const WIDTH = 78;
const RULE = "─".repeat(WIDTH);
const CHART = 44;

let SCALED = false;   // set once the trace mode is known; see scaleApplies()

const format = (seconds) => {
  if (seconds === null) return "unknown";
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
};

/**
 * With --scale, durations are projected to enterprise scale by a stated
 * multiplier. A projected duration is marked with a leading `~` wherever it
 * appears, so it can never be read off the page as a measurement. Without the
 * flag nothing is scaled and the real millisecond figures stand.
 */
const clock = (seconds) => {
  if (!SCALED) return format(seconds);
  const projected = project(seconds, DEMO_SCALE_BASIS);
  return projected.seconds === null ? "unknown" : `~${format(projected.seconds)}`;
};
const usd = (n) => n === null ? "unknown" : `$${n.toFixed(2)}`;
const pct = (n) => `${Math.round(n * 100)}%`;
const compact = (value) => JSON.stringify(value).replaceAll('"', "");

const model = await cockpitModel(resolve(fileURLToPath(new URL("..", import.meta.url))));
const { summary: sum, task, steps, stages, pricing } = model;
const measured = model.mode === "measured";
SCALED = has("scale") && scaleApplies(model.mode);

console.log(`\n${c.cyan(c.bold("DELIVERY INTELLIGENCE"))}  ${c.dim("one change, source to verified result")}`);
console.log(c.dim(`${task.id} · ${task.title}`));
console.log(c.dim(`${task.service} · ${task.repository} · correlation ${model.correlationId}`));
console.log(`\n${measured ? okChip(" MEASURED ") : warnChip(" DEMO RUN ")} ${c.dim("Demo dataset · measured execution and telemetry.")}`);
if (has("scale") && !scaleApplies(model.mode)) {
  console.log(`${warnChip(" NOT SCALED ")} ${c.amber("--scale ignored: this trace is simulated and its durations are already realistic.")}`);
  console.log(`             ${c.dim("scaling them would multiply a 52-minute lead time into hundreds of hours.")}`);
}
if (SCALED) {
  console.log(`${warnChip(" PROJECTED ")} ${c.amber(describeBasis(DEMO_SCALE_BASIS))}`);
  console.log(`             ${c.dim("every duration below is marked ~ and is a projection, not a measurement.")}`);
  console.log(`             ${c.dim("run without --scale to see the measured milliseconds.")}`);
}

// ── The four numbers an executive reads ─────────────────────────────────────
console.log(`\n${c.grey(RULE)}`);
console.log(`${chip(" 01 ")} ${c.bold(measured ? "What one verified change consumed" : "What it cost to ship one change")}`);
console.log(`    ${c.dim("The denominator is one accepted, verification-backed outcome.")}\n`);

const kpi = (label, value, note) =>
  `    ${c.dim(label.padEnd(18))} ${c.bold(value.padEnd(12))} ${c.dim(note)}`;
console.log(kpi(measured ? "run wall time" : "lead time", clock(sum.elapsedSeconds), measured ? `${steps.length} captured spans` : "intake → production"));
console.log(
  kpi("active work", clock(sum.activeSeconds), `${pct(sum.activeSeconds / sum.elapsedSeconds)} of elapsed`),
);
console.log(
  `    ${c.dim((measured ? "unattributed" : "waiting").padEnd(18))} ${c.amber(c.bold(clock(sum.waitSeconds).padEnd(12)))} ${c.dim(
    measured ? "startup + build + orchestration" : `${pct(sum.waitSeconds / sum.elapsedSeconds)} queue + human + compute`,
  )}`,
);
console.log(kpi("model usage", `${sum.tokenTotal.toLocaleString()} tok`, `${sum.modelCalls} model call${sum.modelCalls === 1 ? "" : "s"}`));
console.log(
  `    ${c.dim((measured ? "verified outcome" : "verified shipping").padEnd(18))} ${
    sum.verifiedShipping ? c.green(c.bold("Proven".padEnd(12))) : c.red(c.bold("Unproven".padEnd(12)))
  } ${c.dim(`${pct(sum.attributionCoverage)} lineage coverage`)}`,
);

// ── Input → operation → output → artifact ───────────────────────────────────
console.log(`\n${c.grey(RULE)}`);
console.log(`${chip(" 02 ")} ${c.bold("What happened at every stage")}`);
console.log(`    ${c.dim("Each step exposes its input, operation, output and resolvable artifact.")}\n`);
for (const step of steps) {
  console.log(`    ${chip(` ${String(step.order).padStart(2, "0")} `)} ${c.bold(step.action)} ${c.dim(`· ${step.system}`)}`);
  console.log(`       ${c.cyan("INPUT   ")} ${compact(step.input ?? { source: step.provenance.sourceData })}`);
  if (VERBOSE) console.log(`       ${c.amber("RUN     ")} ${step.detail}`);
  console.log(`       ${c.green("OUTPUT  ")} ${compact(step.output ?? step.metrics)}`);
  console.log(`       ${c.grey("ARTIFACT")} ${c.cyan(step.artifact.ref)} ${c.dim(`(${step.artifact.type})`)}`);
  const projection = SCALED ? ` · projected ${clock(step.durationSeconds)}` : "";
  console.log(`       ${c.grey("METRICS ")} ${format(step.durationSeconds)} · ${step.tokens.total.toLocaleString()} tokens · ${step.toolCalls} calls${c.dim(projection)}\n`);
}

// ── Where the time actually went ────────────────────────────────────────────
console.log(`\n${c.grey(RULE)}`);
console.log(`${chip(" 03 ")} ${c.bold("Where the time actually went")}`);
console.log(`    ${c.dim(measured ? "Executed spans in causal order; unattributed overhead is excluded." : "Each bar sits where it happened in the run, not flush left.")}`);
console.log(`    ${c.amber("▸ look for:")} ${c.amber(measured ? "the real ingest/index counts, failing-before/passing-after test, and persisted receipt." : "the gaps. Reasoning is the short part.")}\n`);
console.log(`    ${c.dim(`${c.green(ACTIVE)} active   ${WAIT} waiting`)}\n`);

let measuredCursor = Date.parse(model.startedAt);
for (const step of steps) {
  const chartStep = measured ? { ...step, startedAt: new Date(measuredCursor).toISOString() } : step;
  const row = waterfallRow(chartStep, { startedAt: model.startedAt, elapsedSeconds: measured ? sum.activeSeconds : sum.elapsedSeconds }, CHART);
  if (measured) measuredCursor += step.durationSeconds * 1000;
  const painted = COLOUR
    ? row.replaceAll(ACTIVE, `\x1b[32m${ACTIVE}\x1b[0m`).replaceAll(WAIT, `\x1b[90m${WAIT}\x1b[0m`)
    : row;
  const pad = " ".repeat(Math.max(0, CHART - row.length));
  // Fixed-width label: a long action name would otherwise push the duration
  // column out and break the alignment the chart depends on to be readable.
  const label = step.action.length > 26 ? `${step.action.slice(0, 25)}…` : step.action.padEnd(26);
  console.log(
    `    ${c.dim(String(step.order).padStart(2))} ${painted}${pad} ${c.bold(label)} ${c.dim(
      clock(step.durationSeconds).padStart(7),
    )}`,
  );
}

const slowest = [...steps].sort((a, b) => measured ? b.durationSeconds - a.durationSeconds : b.waitSeconds - a.waitSeconds)[0];
console.log(
  `\n    ${c.amber(measured ? "longest span" : "largest single delay")}  ${c.bold(slowest.action)} — ${c.amber(
    measured && SCALED ? `measured ${format(slowest.durationSeconds)} · projected ${clock(slowest.durationSeconds)}` : clock(measured ? slowest.durationSeconds : slowest.waitSeconds),
  )} ${c.dim(measured ? `executed by ${slowest.system}` : `of ${clock(slowest.durationSeconds)} was wait (${slowest.system})`)}`,
);

// ── The ledger a developer reads ────────────────────────────────────────────
if (VERBOSE) {
console.log(`\n${c.grey(RULE)}`);
console.log(`${chip(" 04 ")} ${c.bold("Every span resolves to an artifact")}`);
console.log(`    ${c.dim("No row on this page exists without something you can open.")}\n`);
console.log(
  `    ${c.dim(
    `${"#".padStart(2)} ${"SYSTEM".padEnd(20)} ${"TOKENS".padStart(7)} ${"TOOLS".padStart(5)} ${"RETRY".padStart(5)} ${"COST".padStart(6)}  EVIDENCE`,
  )}`,
);
for (const step of steps) {
  const retries = step.retries > 0 ? c.amber(String(step.retries).padStart(5)) : c.dim("    –");
  console.log(
    `    ${c.dim(String(step.order).padStart(2))} ${step.system.padEnd(20)} ${String(
      step.tokens.total,
    ).padStart(7)} ${String(step.toolCalls).padStart(5)} ${retries} ${usd(step.costUsd).padStart(
      6,
    )}  ${c.cyan(step.artifact.ref)}`,
  );
}
}

// ── Measured output ─────────────────────────────────────────────────────────
console.log(`\n${c.grey(RULE)}`);
console.log(`${okChip(" ✓ ")} ${c.bold("Measured.")} ${c.dim(`${steps.length} spans · ${model.lineage.length} causal links`)}\n`);

console.log(`    ${c.bold("The three to remember")}`);
console.log(`      ${c.amber("1.")} ${measured
  ? `${c.bold(clock(sum.activeSeconds))} was captured in spans; ${c.bold(clock(sum.waitSeconds))} remains unattributed overhead.`
  : `${c.bold(pct(sum.waitSeconds / sum.elapsedSeconds))} of the lead time was waiting, not thinking.`}`);
console.log(
  `      ${c.amber("2.")} ${c.bold(sum.tokenTotal.toLocaleString())} tokens across ${c.bold(String(sum.modelCalls))} model call${sum.modelCalls === 1 ? "" : "s"}.`,
);
console.log(`         ${c.dim(`${sum.modelCalls} model call · ${sum.tokenTotal.toLocaleString()} tokens · ${sum.toolCalls} tool calls · ${sum.retries} retries`)}`);
console.log(
  `      ${c.amber("3.")} ${c.bold(measured ? "Verification and persistence are proven" : "Shipping is proven, not asserted")} — ${pct(
    sum.attributionCoverage,
  )} of steps trace to an artifact.`,
);
console.log(`         ${c.dim("Break one causal link and this line reads Unproven instead.")}\n`);

console.log(`    ${c.dim("usage basis")} ${sum.usageProvenance} · tokens are the comparison unit`);
console.log(`    ${c.dim("browser")}    pnpm cockpit → http://127.0.0.1:4173\n`);
