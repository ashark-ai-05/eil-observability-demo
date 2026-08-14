import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readCopilotUsage } from "../scripts/copilot-usage.mjs";

test("Copilot OTel spans yield provider-reported token and cost metrics", async () => {
  const dir = await mkdtemp(join(tmpdir(), "copilot-otel-"));
  const path = join(dir, "otel.jsonl");
  await writeFile(path, `${JSON.stringify({ resourceSpans: [{ scopeSpans: [{ spans: [{ name: "chat", attributes: [
    { key: "gen_ai.usage.input_tokens", value: { intValue: "2400" } },
    { key: "gen_ai.usage.output_tokens", value: { intValue: "600" } },
    { key: "gen_ai.usage.cache_read.input_tokens", value: { intValue: "900" } },
    { key: "github.copilot.cost", value: { doubleValue: 0.012 } },
    { key: "gen_ai.response.model", value: { stringValue: "gpt-demo" } },
  ] }] }] }] })}\n`);
  assert.deepEqual(await readCopilotUsage(path), {
    modelCalls: 1, inputTokens: 2400, outputTokens: 600, cachedTokens: 900,
    costUsd: 0.012, models: ["gpt-demo"], provenance: "provider_reported_otel",
  });
});
