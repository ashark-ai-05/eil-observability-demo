import test from "node:test";
import assert from "node:assert/strict";
import { assertValid, json, validators } from "../scripts/validation.mjs";

test("scenario and all runners conform", async () => {
  const validate = await validators();
  assertValid(validate.scenario, await json("scenario/payment-retry.json"), "scenario");
  for (const runner of ["amp", "copilot", "maas"]) {
    assertValid(validate.runner, await json(`runners/${runner}.json`), runner);
  }
});

test("metadata-only receipt rejects raw query and content", async () => {
  const validate = await validators();
  assert.equal(validate.receipt(await json("fixtures/valid/receipt-eil-search.json")), true);
  assert.equal(validate.receipt(await json("fixtures/invalid/receipt-raw-query.json")), false);
  assert.equal(validate.receipt(await json("fixtures/invalid/receipt-metadata-content.json")), false);
});

test("blocked Amp proof preserves facts without claiming acceptance", async () => {
  const validate = await validators();
  const proof = await json("recordings/amp-blocked-environment.json");
  assertValid(validate.runnerProof, proof, "Amp blocked proof");
  assert.equal(proof.terminalStatus, "blocked_environment");
  assert.equal(proof.blockers.find((blocker) => blocker.id === "unsupported_cli_version").proven, true);
  assert.equal(proof.blockers.find((blocker) => blocker.id === "no_available_credits").proven, false);
  assert.equal(proof.acceptanceGates.commit_to_thread_to_cost, "unmet");
});

test("acceptance contract contains every gate exactly once", async () => {
  const validate = await validators();
  const result = await json("acceptance/example-result.json");
  assertValid(validate.acceptance, result, "acceptance");
  assert.equal(new Set(result.gates.map((gate) => gate.id)).size, 12);
  assert.equal(result.gates.every((gate) => gate.passed), true);
  assert.equal(result.passed, result.gates.every((gate) => gate.passed));
});
