import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { resolve } from "node:path";

test("controlled reference run resets, fixes, accepts, and replays", () => {
  const result = spawnSync(process.execPath, ["scripts/demo-runner.mjs", "all"], {
    cwd: resolve(import.meta.dirname, ".."), encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /RUN maas-/);
  assert.match(result.stdout, /REPLAY PASS/);
  assert.match(result.stdout, /12\/12 gates/);
});
