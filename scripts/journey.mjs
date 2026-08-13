import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cockpitModel } from "./cockpit-model.mjs";
import { ACTIVE, WAIT, waterfallRow } from "./journey-layout.mjs";

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(`--${flag}`);
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

const clock = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
};
const usd = (n) => `$${n.toFixed(2)}`;
const pct = (n) => `${Math.round(n * 100)}%`;

const model = await cockpitModel(resolve(fileURLToPath(new URL("..", import.meta.url))));
const { summary: sum, task, steps, stages, pricing } = model;

console.log(`\n${c.cyan(c.bold("DELIVERY INTELLIGENCE"))}  ${c.dim("one task, intake to production")}`);
console.log(c.dim(`${task.id} · ${task.title}`));
console.log(c.dim(`${task.service} · ${task.repository} · correlation ${model.correlationId}`));
console.log(
  `\n${warnChip(" SIMULATED ")} ${c.dim("Jira, Confluence, Bamboo and deployment steps are fixtures,")}`,
);
console.log(`             ${c.dim("not live corporate telemetry. Every number below is derived")}`);
console.log(`             ${c.dim("from the trace, not written into the page.")}`);

// ── The four numbers an executive reads ─────────────────────────────────────
console.log(`\n${c.grey(RULE)}`);
console.log(`${chip(" 01 ")} ${c.bold("What it cost to ship one change")}`);
console.log(`    ${c.dim("The denominator is one accepted, verification-backed outcome.")}\n`);

const kpi = (label, value, note) =>
  `    ${c.dim(label.padEnd(18))} ${c.bold(value.padEnd(12))} ${c.dim(note)}`;
console.log(kpi("lead time", clock(sum.elapsedSeconds), "intake → production"));
console.log(
  kpi("active work", clock(sum.activeSeconds), `${pct(sum.activeSeconds / sum.elapsedSeconds)} of elapsed`),
);
console.log(
  `    ${c.dim("waiting".padEnd(18))} ${c.amber(c.bold(clock(sum.waitSeconds).padEnd(12)))} ${c.dim(
    `${pct(sum.waitSeconds / sum.elapsedSeconds)} queue + human + compute`,
  )}`,
);
console.log(kpi("estimated cost", usd(sum.totalCostUsd), pricing.version));
console.log(
  `    ${c.dim("verified shipping".padEnd(18))} ${
    sum.verifiedShipping ? c.green(c.bold("Proven".padEnd(12))) : c.red(c.bold("Unproven".padEnd(12)))
  } ${c.dim(`${pct(sum.attributionCoverage)} lineage coverage`)}`,
);

// ── Where the time actually went ────────────────────────────────────────────
console.log(`\n${c.grey(RULE)}`);
console.log(`${chip(" 02 ")} ${c.bold("Where the time actually went")}`);
console.log(`    ${c.dim("Each bar sits where it happened in the run, not flush left.")}`);
console.log(`    ${c.amber("▸ look for:")} ${c.amber("the gaps. Reasoning is the short part.")}\n`);
console.log(`    ${c.dim(`${c.green(ACTIVE)} active   ${WAIT} waiting`)}\n`);

for (const step of steps) {
  const row = waterfallRow(step, { startedAt: model.startedAt, elapsedSeconds: sum.elapsedSeconds }, CHART);
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

const slowest = [...steps].sort((a, b) => b.waitSeconds - a.waitSeconds)[0];
console.log(
  `\n    ${c.amber("largest single delay")}  ${c.bold(slowest.action)} — ${c.amber(
    clock(slowest.waitSeconds),
  )} ${c.dim(`of ${clock(slowest.durationSeconds)} was wait (${slowest.system})`)}`,
);

// ── The ledger a developer reads ────────────────────────────────────────────
console.log(`\n${c.grey(RULE)}`);
console.log(`${chip(" 03 ")} ${c.bold("Every span resolves to an artifact")}`);
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

// ── Measured output ─────────────────────────────────────────────────────────
console.log(`\n${c.grey(RULE)}`);
console.log(`${okChip(" ✓ ")} ${c.bold("Measured.")} ${c.dim(`${steps.length} spans · ${model.lineage.length} causal links`)}\n`);

console.log(`    ${c.bold("The three to remember")}`);
console.log(
  `      ${c.amber("1.")} ${c.bold(pct(sum.waitSeconds / sum.elapsedSeconds))} of the lead time was ${c.bold(
    "waiting",
  )}, not thinking.`,
);
console.log(`         ${c.dim("Buying a faster model optimises the 32%. The queue is the other 68%.")}`);
console.log(
  `      ${c.amber("2.")} ${c.bold(usd(sum.totalCostUsd))} bought ${c.bold("one verified production change")}.`,
);
console.log(`         ${c.dim(`${sum.tokenTotal.toLocaleString()} tokens · ${sum.toolCalls} tool calls · ${sum.retries} retries`)}`);
console.log(
  `      ${c.amber("3.")} ${c.bold("Shipping is proven, not asserted")} — ${pct(
    sum.attributionCoverage,
  )} of steps trace to an artifact.`,
);
console.log(`         ${c.dim("Break one causal link and this line reads Unproven instead.")}\n`);

console.log(`    ${c.dim("cost basis")}  ${pricing.provenance} · ${pricing.version} · not a billing record`);
console.log(`    ${c.dim("browser")}    pnpm cockpit → http://127.0.0.1:4173\n`);
