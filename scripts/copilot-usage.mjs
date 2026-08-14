import { readFile } from "node:fs/promises";

const unwrap = (value) => {
  if (value === null || typeof value !== "object") return value;
  for (const key of ["intValue", "doubleValue", "stringValue", "boolValue"]) {
    if (key in value) return Number.isFinite(Number(value[key])) ? Number(value[key]) : value[key];
  }
  return value;
};

function collectAttributes(value, found = new Map()) {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    for (const item of value) collectAttributes(item, found);
    return found;
  }
  if (typeof value.key === "string" && "value" in value) found.set(value.key, unwrap(value.value));
  for (const [key, item] of Object.entries(value)) {
    if (key.startsWith("gen_ai.") || key.startsWith("github.copilot.")) found.set(key, unwrap(item));
    collectAttributes(item, found);
  }
  return found;
}

export async function readCopilotUsage(path) {
  const lines = (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean);
  const records = lines.map((line) => JSON.parse(line));
  const spans = records.flatMap((record) => {
    const candidates = [];
    const visit = (value) => {
      if (!value || typeof value !== "object") return;
      if (!Array.isArray(value) && (value.name === "chat" || value.name === "invoke_agent")) candidates.push(value);
      for (const item of Object.values(value)) visit(item);
    };
    visit(record);
    return candidates;
  });
  const chat = spans.filter((span) => span.name === "chat");
  const attributes = chat.map((span) => collectAttributes(span));
  const sum = (key) => attributes.reduce((total, map) => total + (Number(map.get(key)) || 0), 0);
  const models = [...new Set(attributes.map((map) => map.get("gen_ai.response.model") ?? map.get("gen_ai.request.model")).filter(Boolean))];
  return {
    modelCalls: chat.length,
    inputTokens: sum("gen_ai.usage.input_tokens"),
    outputTokens: sum("gen_ai.usage.output_tokens"),
    cachedTokens: sum("gen_ai.usage.cache_read.input_tokens"),
    costUsd: sum("github.copilot.cost"),
    models,
    provenance: chat.length > 0 ? "provider_reported_otel" : "unknown",
  };
}
