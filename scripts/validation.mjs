import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function json(relativePath) {
  return JSON.parse(await readFile(resolve(root, relativePath), "utf8"));
}

export async function validators() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const names = ["common", "scenario", "runner", "runner-proof", "receipt", "recording", "acceptance"];
  const schemas = await Promise.all(names.map((name) => json(`schemas/${name}.schema.json`)));
  for (const schema of schemas) ajv.addSchema(schema);
  return {
    scenario: ajv.getSchema("https://demo.local/schemas/scenario.schema.json"),
    runner: ajv.getSchema("https://demo.local/schemas/runner.schema.json"),
    runnerProof: ajv.getSchema("https://demo.local/schemas/runner-proof.schema.json"),
    receipt: ajv.getSchema("https://demo.local/schemas/receipt.schema.json"),
    recording: ajv.getSchema("https://demo.local/schemas/recording.schema.json"),
    acceptance: ajv.getSchema("https://demo.local/schemas/acceptance.schema.json")
  };
}

export function assertValid(validate, value, label) {
  if (!validate(value)) throw new Error(`${label} rejected: ${JSON.stringify(validate.errors)}`);
}

export function assertRejected(validate, value, label) {
  if (validate(value)) throw new Error(`${label} unexpectedly accepted`);
}

const rawMetadataKeys = new Set([
  "query", "prompt", "response", "completion", "content", "body", "text",
  "reasoning", "terminal_output", "source_code", "code"
]);

/** Semantic refinements mirrored from the canonical Zod contract plus demo policy. */
export function canonicalEventPolicyErrors(event) {
  const errors = [];
  if (Date.parse(event.timing.receivedAt) < Date.parse(event.timing.observedAt)) {
    errors.push("receivedAt cannot be earlier than observedAt");
  }
  if (event.capture.mode === "metadata_only") {
    for (const [scope, attributes] of [["attributes", event.attributes], ["vendor.attributes", event.vendor.attributes]]) {
      for (const key of Object.keys(attributes)) {
        if (rawMetadataKeys.has(key.toLowerCase())) errors.push(`${scope}.${key} contains raw content`);
      }
    }
  }
  for (const link of event.workflow?.links ?? []) {
    if (link.sourceStepId !== event.workflow.stepId) errors.push("workflow link source differs from containing step");
    if (link.targetStepId === event.workflow.stepId) errors.push("workflow step links to itself");
    if (link.method === "deterministic" && (link.confidence !== 1 || link.score !== 1)) errors.push("deterministic link is not certain");
    if (link.method === "evidence" && link.confidence === 1) errors.push("evidence link claims certainty");
    if (link.method === "evidence" && link.calibration.calibrated &&
        (link.calibration.measuredPrecision === undefined || link.calibration.sampleSize === undefined || link.calibration.calibrationId === undefined)) {
      errors.push("calibrated evidence link lacks calibration facts");
    }
  }
  return errors;
}
