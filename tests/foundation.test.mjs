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

test("acceptance contract contains every gate exactly once", async () => {
  const validate = await validators();
  const result = await json("acceptance/example-result.json");
  assertValid(validate.acceptance, result, "acceptance");
  assert.equal(new Set(result.gates.map((gate) => gate.id)).size, 12);
  assert.equal(result.gates.every((gate) => gate.passed), true);
  assert.equal(result.passed, result.gates.every((gate) => gate.passed));
});
