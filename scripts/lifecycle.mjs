import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lifecyclePlan, provenanceLedger } from "./lifecycle-plan.mjs";

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
const chip = (s) => (COLOUR ? `\x1b[46m\x1b[30m\x1b[1m${s}\x1b[0m` : `[${s.trim()}]`);
const simChip = (s) => (COLOUR ? `\x1b[43m\x1b[30m\x1b[1m${s}\x1b[0m` : `[${s.trim()}]`);
const okChip = (s) => (COLOUR ? `\x1b[42m\x1b[30m\x1b[1m${s}\x1b[0m` : `[${s.trim()}]`);
const RULE = "─".repeat(78);

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoPath = (variable) => {
  const raw = process.env[variable];
  if (!raw) return null;
  const path = resolve(raw);
  return existsSync(path) ? path : null;
};

const eilRepo = repoPath("EIL_REPO");
const observabilityRepo = repoPath("OBSERVABILITY_REPO");
const plan = lifecyclePlan({ eilRepo, observabilityRepo });
const ran = new Set();

function pause() {
  if (!has("pause")) return;
  spawnSync("bash", ["-c", 'read -r -p "  ↵ " _ < /dev/tty'], { stdio: "inherit" });
}

/**
 * Run one command, echoing it first so the room sees what produced the output.
 * `spawnSync` with an argument array, never a shell string: nothing here is
 * interpolated into a command line.
 */
function runCommand(show, bin, args, cwd) {
  console.log(`\n    ${c.green("$")} ${c.green(show)}\n`);
  const result = spawnSync(bin, args, { cwd, stdio: "inherit", env: process.env });
  return result.status === 0;
}

let actNo = 0;
function act(entry, commands) {
  actNo += 1;
  console.log(`\n${c.grey(RULE)}`);
  const badge = entry.kind === "real" ? chip(` ${actNo} `) : simChip(` ${actNo} `);
  const tag = entry.kind === "real" ? c.green("REAL PRODUCTS") : c.amber("SIMULATED FIXTURES");
  console.log(`${badge} ${c.bold(entry.title)}   ${tag}`);
  console.log(`    ${c.dim(entry.says)}`);
  console.log(`    ${c.amber("▸ look for:")} ${c.amber(entry.watch)}`);

  if (!entry.available) {
    console.log(`\n    ${c.amber("skipped —")} ${c.dim(entry.skipReason)}`);
    return;
  }
  pause();
  let ok = true;
  for (const command of commands) {
    if (!runCommand(command.show, command.bin, command.args, command.cwd)) ok = false;
  }
  if (ok) ran.add(entry.id);
  else console.log(`\n    ${c.red("this act did not complete — it is not counted below")}`);
}

const byId = Object.fromEntries(plan.map((entry) => [entry.id, entry]));

console.log(`\n${c.cyan(c.bold("THE FULL LIFECYCLE"))}  ${c.dim("ingest → index → retrieve → change → observe → deliver")}`);
console.log(c.dim("Three acts run the real products. The fourth is a labelled simulation."));
console.log(c.dim(`--pause steps through it · --no-colour for a plain log`));

act(byId["knowledge-plane"], [
  { show: "pnpm demo", bin: "pnpm", args: ["demo"], cwd: eilRepo ?? root },
]);

act(byId["change-applied"], [
  { show: "pnpm demo:reset", bin: "pnpm", args: ["demo:reset"], cwd: root },
  { show: "pnpm demo:run", bin: "pnpm", args: ["demo:run"], cwd: root },
]);

act(byId["observed"], [
  { show: "pnpm test:integration", bin: "pnpm", args: ["test:integration"], cwd: root },
]);

act(byId["delivery-journey"], [
  { show: "pnpm journey", bin: "pnpm", args: ["journey"], cwd: root },
]);

// ── What was actually proven ────────────────────────────────────────────────
const ledger = provenanceLedger(plan, ran);
console.log(`\n${c.grey(RULE)}`);
console.log(`${okChip(" ✓ ")} ${c.bold("Lifecycle complete.")}\n`);

console.log(`    ${c.bold("What just ran, and what it was")}`);
for (const entry of plan) {
  const state = ran.has(entry.id)
    ? entry.kind === "real"
      ? c.green("ran · real product code")
      : c.amber("ran · labelled simulation")
    : c.dim("skipped");
  console.log(`      ${c.dim(String(plan.indexOf(entry) + 1))}. ${entry.title.padEnd(42)} ${state}`);
}

console.log(
  `\n    ${c.bold("Provenance")}  ${c.green(`${ledger.realRan} of ${ledger.realPlanned} real acts ran`)}` +
    `${ledger.simulatedRan ? c.amber(` · ${ledger.simulatedRan} simulated act ran`) : ""}`,
);
if (ledger.skipped.length > 0) {
  console.log(`    ${c.amber("not proven this run")}  ${c.dim(ledger.skipped.join(", "))}`);
}

console.log(`\n    ${c.bold("The three to remember")}`);
console.log(`      ${c.amber("1.")} Ingestion, indexing, ACL and retrieval are ${c.bold("product code")}, not slides.`);
console.log(`         ${c.dim("The corpus is synthetic; the pipeline that processed it is the shipping one.")}`);
console.log(`      ${c.amber("2.")} The gates report ${c.bold("8/12")}, and the failures stay on screen.`);
console.log(`         ${c.dim("A demo that cannot show a bad number cannot be trusted with a good one.")}`);
console.log(`      ${c.amber("3.")} Only ${c.bold("Jira, Confluence, Bamboo and deployment")} are fixtures.`);
console.log(`         ${c.dim("They are the systems we have no connector for yet — named, not hidden.")}\n`);

console.log(`    ${c.dim("browser")}  pnpm cockpit → http://127.0.0.1:4173\n`);
