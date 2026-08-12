import test from "node:test";
import assert from "node:assert/strict";
import { assertValid, canonicalEventPolicyErrors, json, validators } from "../scripts/validation.mjs";

test("scenario and all runners conform", async () => {
  const validate = await validators();
  assertValid(validate.scenario, await json("scenario/payment-retry.json"), "scenario");
  for (const runner of ["amp", "copilot", "maas"]) {
    assertValid(validate.runner, await json(`runners/${runner}.json`), runner);
  }
});

test("metadata-only receipt rejects raw query and content", async () => {
  const validate = await validators();
  const receipt = await json("fixtures/valid/receipt-eil-search.json");
  assert.equal(validate.receipt(receipt), true);
  assert.deepEqual(canonicalEventPolicyErrors(receipt), []);
  const rawQuery = structuredClone(receipt);
  rawQuery.vendor.attributes.query = "payment retry policy";
  assert.equal(validate.receipt(rawQuery), true, "raw-query shape remains wire-compatible");
  assert.notEqual(canonicalEventPolicyErrors(rawQuery).length, 0, "demo policy rejects raw query");
  const metadataContent = structuredClone(receipt);
  metadataContent.capture.contentIncluded = true;
  assert.equal(validate.receipt(metadataContent), false);
});

test("merged EIL emitter shape conforms without fabricated workflow", async () => {
  const validate = await validators();
  const receipt = await json("fixtures/valid/receipt-eil-emitter.json");
  assertValid(validate.receipt, receipt, "EIL emitter receipt");
  assert.equal("workflow" in receipt, false);
  assert.deepEqual(canonicalEventPolicyErrors(receipt), []);
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
