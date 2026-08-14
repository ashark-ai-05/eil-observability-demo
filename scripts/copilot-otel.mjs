/**
 * Reads GitHub Copilot CLI's OpenTelemetry file export and summarises one run.
 *
 * Enable it with `COPILOT_OTEL_FILE_EXPORTER_PATH=<file>`, which writes every
 * signal as JSON lines and needs no OTLP endpoint, no collector and no network
 * — which is what makes it usable on a locked-down corporate machine.
 *
 * Attribute names follow the OTel GenAI semantic conventions, so tokens arrive
 * as real measurements rather than as an estimate from output length. Copilot's
 * content capture is off by default, so the export carries metadata only — the
 * same posture as this project's `capture: metadata_only`.
 */

/** A `chat` span is one LLM call; `invoke_agent` is the orchestration around them. */
const CHAT_SPAN = /^chat\b/;
const AGENT_SPAN = "invoke_agent";

export function summariseCopilotOtel(jsonl) {
  const records = [];
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // A truncated final line is normal when reading a file the CLI is still
      // writing. Skipping it beats aborting a run over a partial record.
    }
  }

  const spans = records.filter((record) => record.type === "span");
  const chats = spans.filter((span) => CHAT_SPAN.test(span.name ?? ""));
  const agent = spans.find((span) => span.name === AGENT_SPAN);
  const usageSource = agent ?? chats[0];
  const attributes = usageSource?.attributes ?? {};

  const measuredTokens = chats.length > 0 && "gen_ai.usage.input_tokens" in attributes;

  // Tokens aggregate on the agent span, but only the chat span records which
  // model actually answered: `invoke_agent` keeps the requested alias ("auto").
  const chatAttributes = chats[0]?.attributes ?? {};

  return {
    modelCalls: chats.length,
    model:
      chatAttributes["gen_ai.response.model"] ??
      chatAttributes["gen_ai.request.model"] ??
      attributes["gen_ai.request.model"] ??
      null,
    durationSeconds: spanSeconds(agent ?? chats[0]),
    tokens: measuredTokens
      ? {
          input: attributes["gen_ai.usage.input_tokens"] ?? null,
          output: attributes["gen_ai.usage.output_tokens"] ?? null,
          cachedInput: attributes["gen_ai.usage.cache_read.input_tokens"] ?? null,
          reasoningOutput: attributes["gen_ai.usage.reasoning.output_tokens"] ?? null,
          provenance: "measured",
        }
      : {
          input: null,
          output: null,
          cachedInput: null,
          reasoningOutput: null,
          provenance: "unknown",
        },
    cost: cost(chats),
  };
}

/**
 * Copilot bills in AI credits, and its OTel export does not carry them.
 *
 * Measured on v1.0.79: a call the CLI's own footer billed at `AI Credits 0.32`
 * exported `github.copilot.cost: 0.0`, and no credit metric appears anywhere in
 * the file. Reading that field as a total would put $0.00 on the page for work
 * that cost real money — indistinguishable from a genuinely free call.
 *
 * So cost is reported as unknown and the tool's own figure is kept beside it as
 * evidence. A real cost must come from tokens priced against a versioned price
 * book, which makes it `estimated`, or from the billing API, which makes it
 * `reported`. Neither is this field.
 */
function cost(chats) {
  const reported = chats
    .map((span) => span.attributes?.["github.copilot.cost"])
    .find((value) => typeof value === "number");
  return {
    usd: null,
    provenance: "unknown",
    reportedByTool: reported ?? null,
    reason:
      "Copilot meters in AI credits, which its OpenTelemetry export omits; " +
      "github.copilot.cost reported 0 for a call billed at 0.32 credits",
  };
}

function spanSeconds(span) {
  if (!span?.startTime || !span?.endTime) return null;
  const seconds = (hrToMs(span.endTime) - hrToMs(span.startTime)) / 1000;
  return Number.isFinite(seconds) && seconds >= 0 ? Number(seconds.toFixed(3)) : null;
}

/** OTel timestamps arrive as [seconds, nanoseconds]. */
function hrToMs(time) {
  if (Array.isArray(time)) return time[0] * 1000 + time[1] / 1e6;
  return Date.parse(time);
}
