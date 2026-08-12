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
