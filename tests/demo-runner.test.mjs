import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { readFile, rename, writeFile } from "node:fs/promises";
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

test("replay fails when evidence is missing", async () => {
  const project = resolve(import.meta.dirname, "..");
  const setup = spawnSync(process.execPath, ["scripts/demo-runner.mjs", "all"], { cwd: project, encoding: "utf8" });
  assert.equal(setup.status, 0, setup.stderr);
  const evidence = resolve(project, ".demo/run/evidence.json");
  const moved = `${evidence}.missing`;
  await rename(evidence, moved);
  const replay = spawnSync(process.execPath, ["scripts/demo-runner.mjs", "replay"], { cwd: project, encoding: "utf8" });
  assert.notEqual(replay.status, 0);
  await rename(moved, evidence);
});

test("replay fails when evidence is changed", async () => {
  const project = resolve(import.meta.dirname, "..");
  const setup = spawnSync(process.execPath, ["scripts/demo-runner.mjs", "all"], { cwd: project, encoding: "utf8" });
  assert.equal(setup.status, 0, setup.stderr);
  const evidence = resolve(project, ".demo/run/evidence.json");
  const changed = JSON.parse(await readFile(evidence, "utf8"));
  changed.citations.pop();
  await writeFile(evidence, `${JSON.stringify(changed, null, 2)}\n`);
  const replay = spawnSync(process.execPath, ["scripts/demo-runner.mjs", "replay"], { cwd: project, encoding: "utf8" });
  assert.notEqual(replay.status, 0);
});
