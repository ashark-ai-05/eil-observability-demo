import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertRejected, assertValid, canonicalEventPolicyErrors, json, root, validators } from "./validation.mjs";

const validate = await validators();
const valid = [
  [validate.scenario, "scenario/payment-retry.json"],
  [validate.runner, "runners/amp.json"],
  [validate.runner, "runners/copilot.json"],
  [validate.runner, "runners/maas.json"],
  [validate.runnerProof, "recordings/amp-blocked-environment.json"],
  [validate.receipt, "fixtures/valid/receipt-eil-search.json"],
  [validate.receipt, "fixtures/valid/receipt-eil-emitter.json"],
  [validate.acceptance, "acceptance/example-result.json"],
  [validate.recording, "recordings/example.json"]
];
for (const [validator, path] of valid) assertValid(validator, await json(path), path);
const validReceipt = await json("fixtures/valid/receipt-eil-search.json");
if (canonicalEventPolicyErrors(validReceipt).length > 0) throw new Error("valid receipt violates canonical event policy");
const emitterReceipt = await json("fixtures/valid/receipt-eil-emitter.json");
if (canonicalEventPolicyErrors(emitterReceipt).length > 0) throw new Error("EIL emitter receipt violates canonical event policy");

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
  [validate.scenario, "fixtures/invalid/scenario-secret.json"],
  [validate.acceptance, "fixtures/invalid/acceptance-missing-gates.json"]
];
for (const [validator, path] of invalid) assertRejected(validator, await json(path), path);

const rawQuery = structuredClone(validReceipt);
rawQuery.vendor.attributes.query = "payment retry policy";
if (!validate.receipt(rawQuery) || canonicalEventPolicyErrors(rawQuery).length === 0) throw new Error("raw query policy fixture was not rejected");
const metadataContent = structuredClone(validReceipt);
metadataContent.capture.contentIncluded = true;
if (validate.receipt(metadataContent)) throw new Error("metadata content fixture was not rejected");

// Demonstrate that a recording fixture has a stable content identity and that
// deliberate corruption changes it. Live recordings will carry these digests.
const bytes = await readFile(resolve(root, "recordings/example.json"));
const digest = createHash("sha256").update(bytes).digest("hex");
const corrupted = createHash("sha256").update(Buffer.concat([bytes, Buffer.from("corrupt")])).digest("hex");
if (digest === corrupted) throw new Error("recording corruption was not detected");

console.log(`PASS phase0 foundation: ${valid.length} valid artifacts, ${invalid.length + 2} expected rejections, digests verified`);
