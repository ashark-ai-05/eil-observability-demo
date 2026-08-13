#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cockpitModel } from "./cockpit-model.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = new Set(process.argv.slice(2));
const colour = process.stdout.isTTY && !process.env.NO_COLOR && !args.has("--no-colour");
const paint = (code) => (value) => colour ? `\x1b[${code}m${value}\x1b[0m` : value;
const c = { bold: paint(1), dim: paint(2), cyan: paint(36), amber: paint(33), green: paint(32), grey: paint(90) };
const rule = "─".repeat(78);
const duration = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}m ${String(remainder).padStart(2, "0")}s` : `${remainder}s`;
};
const money = (value) => value === null ? "unknown" : `$${value.toFixed(4)}`;
const number = (value) => new Intl.NumberFormat("en-US").format(value);
const pause = () => {
  if (!args.has("--pause")) return;
  spawnSync("bash", ["-c", 'read -r -p "  ↵ " _ < /dev/tty'], { stdio: "inherit" });
};

const data = await cockpitModel(root);

console.log(`\n${c.cyan(c.bold("DELIVERY INTELLIGENCE — task to production"))}`);
console.log(c.dim(`${data.task.id} · ${data.task.title}`));
console.log(c.dim(`correlation ${data.correlationId} · ${data.steps.length} spans · ${data.mode} data`));
console.log(`\n${c.amber("▸ look for")} the active/wait split, evidence artifact and measured output on every step.`);

for (const step of data.steps) {
  console.log(`\n${c.grey(rule)}`);
  console.log(`${c.cyan(`[${String(step.order).padStart(2, "0")}]`)} ${c.bold(step.action)} ${c.dim(`· ${step.system}`)}`);
  console.log(`     ${step.detail}`);
  console.log(`     ${c.amber("▸ evidence")} ${step.artifact.label} ${c.dim(`(${step.artifact.ref})`)}`);
  console.log(
    `     ${c.green("✓ measured")} elapsed ${duration(step.durationSeconds)} · active ${duration(step.activeSeconds)}`
      + ` · wait ${duration(step.waitSeconds)} · ${number(step.tokens.total)} tokens`
      + ` · ${step.toolCalls} tools · ${money(step.costUsd)} estimated`,
  );
  pause();
}

console.log(`\n${c.grey(rule)}`);
console.log(c.bold("MEASURED OUTPUT — accepted production outcome"));
console.log(`  outcome              ${c.green(`released to ${data.task.environment}`)}`);
console.log(`  elapsed              ${duration(data.summary.elapsedSeconds)}`);
console.log(`  active / wait        ${duration(data.summary.activeSeconds)} / ${duration(data.summary.waitSeconds)}`);
console.log(`  tokens               ${number(data.summary.tokenTotal)} (${number(data.summary.tokenCached)} cached)`);
console.log(`  tool calls / retries ${data.summary.toolCalls} / ${data.summary.retries}`);
console.log(`  model / infra cost   ${money(data.summary.modelCostUsd)} / ${money(data.summary.infraCostUsd)}`);
console.log(`  total cost           ${money(data.summary.totalCostUsd)} ${c.amber("estimated")}`);
console.log(`  verified shipping    ${data.summary.verifiedShipping ? "proven" : "unproven"}`);
console.log(`  attribution coverage ${Math.round(data.summary.attributionCoverage * 100)}%`);
console.log(c.dim(`  provenance           ${data.pricing.version} · simulated lifecycle trace`));
console.log();
