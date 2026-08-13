/**
 * The lifecycle as four acts, three of which execute the real products.
 *
 * The split matters more than the sequence. An audience shown eleven pipeline
 * phases has no way to tell which ones are a product and which are a fixture,
 * and a demo that blurs the two is worth nothing the moment someone checks.
 * Every act therefore carries `kind`, and the closing ledger counts only what
 * actually ran.
 */
export function lifecyclePlan({ eilRepo, observabilityRepo }) {
  return [
    {
      id: "knowledge-plane",
      title: "The knowledge plane is built",
      kind: "real",
      says:
        "Storage, scope registry, ingestion, structural chunking, offline embeddings, " +
        "atomic publication, reconciliation, rank fusion and the MCP surface — the real " +
        "pipeline over a deterministic synthetic corpus.",
      watch: "310 published resources, and the roadmap naming its own stubs at the end",
      available: Boolean(eilRepo),
      skipReason: "EIL_REPO is not set, so the real ingestion pipeline cannot run",
    },
    {
      id: "change-applied",
      title: "A change is applied and gated",
      kind: "real",
      says:
        "The incident is reproduced against a real git repository, patched, and put " +
        "through the acceptance gates. The gates that fail, fail visibly.",
      watch: "gates=8/12 — a demo that cannot show a bad number cannot be trusted with a good one",
      available: true,
      skipReason: null,
    },
    {
      id: "observed",
      title: "The work is observed across products",
      kind: "real",
      says:
        "EIL emits a retrieval event; Observability normalises, validates and persists it, " +
        "then proves the retry is idempotent. Two products, one contract.",
      watch: "the two commit SHAs on the receipt line — this ran against pinned revisions",
      available: Boolean(eilRepo && observabilityRepo),
      skipReason: "EIL_REPO and OBSERVABILITY_REPO must both be set for the cross-product proof",
    },
    {
      id: "delivery-journey",
      title: "The delivery journey, end to end",
      kind: "simulated",
      says:
        "Jira through Bamboo to production as one correlated trace, with elapsed, active, " +
        "wait, tokens, tool calls and cost per span. These corporate systems are fixtures.",
      watch: "68% of the lead time was waiting — and where the green stops in the waterfall",
      available: true,
      skipReason: null,
    },
  ];
}

/**
 * Counts what ran, not what was planned. A summary that reports the plan is
 * the specific failure this exists to prevent: three acts skipped for a
 * missing checkout must never be narrated as three acts proven.
 */
export function provenanceLedger(plan, ranIds) {
  const ran = plan.filter((act) => ranIds.has(act.id));
  return {
    realRan: ran.filter((act) => act.kind === "real").length,
    simulatedRan: ran.filter((act) => act.kind === "simulated").length,
    realPlanned: plan.filter((act) => act.kind === "real").length,
    skipped: plan.filter((act) => !ranIds.has(act.id)).map((act) => act.id),
  };
}
