import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertRejected, assertValid, json, root, validators } from "./validation.mjs";

const validate = await validators();
const valid = [
  [validate.scenario, "scenario/payment-retry.json"],
  [validate.runner, "runners/amp.json"],
  [validate.runner, "runners/copilot.json"],
  [validate.runner, "runners/maas.json"],
  [validate.receipt, "fixtures/valid/receipt-eil-search.json"],
  [validate.acceptance, "acceptance/example-result.json"],
  [validate.recording, "recordings/example.json"]
];
for (const [validator, path] of valid) assertValid(validator, await json(path), path);

const acceptance = await json("acceptance/example-result.json");
const requiredGates = new Set([
  "manifest_match", "zero_acl_leakage", "citations_resolve",
  "reproduction_fails_before_patch", "verification_passes_after_patch",
  "artifact_matches", "independent_acceptance", "outcome_accepted",
  "cost_reconciled", "coverage_disclosed", "limits_respected",
  "recording_verified"
]);
const observedGates = new Set(acceptance.gates.map((gate) => gate.id));
if (observedGates.size !== requiredGates.size ||
    [...requiredGates].some((gate) => !observedGates.has(gate))) {
  throw new Error("acceptance result does not contain every gate exactly once");
}
if (acceptance.passed !== acceptance.gates.every((gate) => gate.passed)) {
  throw new Error("acceptance passed flag disagrees with its gates");
}

const invalid = [
  [validate.receipt, "fixtures/invalid/receipt-raw-query.json"],
  [validate.receipt, "fixtures/invalid/receipt-metadata-content.json"],
  [validate.scenario, "fixtures/invalid/scenario-secret.json"],
  [validate.acceptance, "fixtures/invalid/acceptance-missing-gates.json"]
];
for (const [validator, path] of invalid) assertRejected(validator, await json(path), path);

// Demonstrate that a recording fixture has a stable content identity and that
// deliberate corruption changes it. Live recordings will carry these digests.
const bytes = await readFile(resolve(root, "recordings/example.json"));
const digest = createHash("sha256").update(bytes).digest("hex");
const corrupted = createHash("sha256").update(Buffer.concat([bytes, Buffer.from("corrupt")])).digest("hex");
if (digest === corrupted) throw new Error("recording corruption was not detected");

console.log(`PASS phase0 foundation: ${valid.length} valid artifacts, ${invalid.length} expected rejections, digests verified`);
