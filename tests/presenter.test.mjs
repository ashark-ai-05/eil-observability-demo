import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

test("presenter narrates every span and ends with the derived measured output", () => {
  const run = spawnSync(process.execPath, ["scripts/present-delivery.mjs", "--no-colour"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal((run.stdout.match(/✓ measured/g) ?? []).length, 11);
  assert.match(run.stdout, /MEASURED OUTPUT — accepted production outcome/);
  assert.match(run.stdout, /elapsed\s+52m 29s/);
  assert.match(run.stdout, /active \/ wait\s+16m 46s \/ 35m 43s/);
  assert.match(run.stdout, /tokens\s+66,200 \(18,800 cached\)/);
  assert.match(run.stdout, /tool calls \/ retries\s+47 \/ 4/);
  assert.match(run.stdout, /total cost\s+\$0\.5389 estimated/);
  assert.match(run.stdout, /attribution coverage 100%/);
});
