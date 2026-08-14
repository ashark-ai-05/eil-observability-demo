import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Which run record the cockpit will serve, and whether that is the one you
 * think it is.
 *
 * `pnpm demo:reset` removes `.demo`, which is also where `pnpm lifecycle`
 * writes its measured run record. The cockpit then falls back to the scenario
 * fixture — with no error, no warning, and, once the SIMULATED banner is off
 * the page, nothing visible to distinguish the two. A presenter can reset to
 * start clean, open the cockpit, and narrate fixture numbers as measured ones.
 *
 * This is the preflight that makes that impossible to do by accident.
 */
export function describeSource({ lifecycleRecordExists, lifecycleMode }) {
  if (!lifecycleRecordExists) {
    return {
      source: "scenario/delivery-lifecycle.json",
      kind: "fixture",
      actionNeeded: true,
      remedy: "run `pnpm lifecycle` to produce a measured run record",
    };
  }
  const measured = lifecycleMode === "measured";
  return {
    source: ".demo/lifecycle/run.json",
    kind: measured ? "measured" : "simulated",
    actionNeeded: !measured,
    remedy: measured ? null : "run `pnpm lifecycle` to produce a measured run record",
  };
}

/* c8 ignore start — CLI wrapper around the tested function above */
if (import.meta.url === `file://${process.argv[1]}`) {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const record = resolve(root, ".demo/lifecycle/run.json");
  const exists = existsSync(record);
  let mode;
  let age;
  if (exists) {
    try {
      mode = JSON.parse(readFileSync(record, "utf8")).mode;
      age = Math.round((Date.now() - statSync(record).mtimeMs) / 60000);
    } catch {
      mode = undefined;
    }
  }
  const status = describeSource({ lifecycleRecordExists: exists, lifecycleMode: mode });
  const colour = process.stdout.isTTY && !process.env.NO_COLOR;
  const paint = (code, text) => (colour ? `\x1b[${code}m${text}\x1b[0m` : text);

  const badge =
    status.kind === "measured"
      ? paint("42;30;1", " MEASURED ")
      : status.kind === "simulated"
        ? paint("43;30;1", " SIMULATED ")
        : paint("43;30;1", " FIXTURE ");

  console.log(`\n${badge} the cockpit will show ${paint(1, status.source)}`);
  if (exists && age !== undefined) console.log(`           recorded ${age} minute(s) ago`);
  if (status.remedy) console.log(`\n  ${paint(33, "→")} ${status.remedy}`);
  console.log(
    `\n  ${paint(2, "pnpm lifecycle")}  produce a measured run     ${paint(2, "pnpm demo:reset")}  clear it and start over`,
  );
  console.log(`  ${paint(2, "pnpm cockpit")}    open the browser view      ${paint(2, "pnpm journey")}     the terminal view\n`);
  process.exit(status.actionNeeded ? 1 : 0);
}
/* c8 ignore stop */
