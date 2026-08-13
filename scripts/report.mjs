/**
 * The audience report.
 *
 * Runs both real products and renders what actually happened. Every number
 * below is read from a live run — the corpus is really ingested, the searches
 * really execute, the ACL decision is really made, and the receipt is really
 * emitted by EIL and really ingested by Observability.
 *
 * Nothing here is staged. That constraint is the point: a demo that cannot
 * produce a disappointing number cannot produce a credible one, so the failures
 * are on screen next to the successes, in the same size type.
 *
 *   EIL_REPO=… OBSERVABILITY_REPO=… pnpm report
 */

import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const colour = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, text) => (colour ? `[${code}m${text}[0m` : text);
const bold = (t) => c("1", t);
const dim = (t) => c("2", t);
const green = (t) => c("32", t);
const red = (t) => c("31", t);
const yellow = (t) => c("33", t);
const cyan = (t) => c("36", t);

const WIDTH = 74;
const rule = (ch = "─") => dim(ch.repeat(WIDTH));

function heading(number, title, subtitle) {
  console.log("");
  console.log(`${cyan(bold(`${number}`))}  ${bold(title)}`);
  if (subtitle) console.log(`   ${dim(subtitle)}`);
  console.log(rule());
}

function row(label, value, note) {
  // Padded on visible length: colour codes are invisible but still count.
  const visible = label.replace(/\u001b\[[0-9;]*m/g, "").length;
  const gap = Math.max(1, 42 - visible);
  console.log(`  ${label}${" ".repeat(gap)}${value}${note ? `  ${dim(note)}` : ""}`);
}

function requireRepo(variable) {
  const raw = process.env[variable];
  if (!raw) throw new Error(`${variable} is not set. This report runs the real products.`);
  const path = resolve(raw);
  if (!existsSync(join(path, "dist"))) {
    throw new Error(`${variable}: ${path} has no dist/. Run \`pnpm build\` there first.`);
  }
  return path;
}

const load = (repo, rel) => import(pathToFileURL(join(repo, rel)).href);

const eilRepo = requireRepo("EIL_REPO");
const obsRepo = requireRepo("OBSERVABILITY_REPO");

const [corpus, gate, tools, telemetry, db_, mig] = await Promise.all([
  load(eilRepo, "dist/corpus/synthetic.js"),
  load(eilRepo, "dist/eval/corpus-gate.js"),
  load(eilRepo, "dist/serving/tools.js"),
  load(eilRepo, "dist/telemetry/canonical-event-sink.js"),
  load(eilRepo, "dist/storage/database.js"),
  load(eilRepo, "dist/storage/migrations.js"),
]);
const [events, store, obsMig] = await Promise.all([
  load(obsRepo, "dist/contracts/events.js"),
  load(obsRepo, "dist/storage/event-store.js"),
  load(obsRepo, "dist/storage/migrations.js"),
]);

const dir = await mkdtemp(join(tmpdir(), "eil-report-"));
const ndjson = join(dir, "emitted.ndjson");
let db;

console.log("");
console.log(bold("  ENTERPRISE INTELLIGENCE + AI OBSERVABILITY"));
console.log(dim("  Every figure below is from this run. Nothing is pre-recorded."));

try {
  db = await db_.openDatabase({ url: `pglite://${join(dir, "catalog")}` });
  await mig.migrate(db);
  const preset = corpus.syntheticCorpusPresets.ci;
  const seed = await gate.seedEvaluationCorpus(db, preset);
  const audit = new telemetry.CanonicalEventAuditSink({
    path: ndjson,
    tenantId: gate.EVAL_TENANT,
  });
  const viewer = gate.evalViewer(seed.containerIds);
  const context = (v) => ({
    db,
    tenantId: gate.EVAL_TENANT,
    arms: gate.defaultArms(db),
    viewer: v,
    audit,
  });

  // ── 1. the estate ────────────────────────────────────────────────────────
  heading("1", "The estate", "ingested through the real pipeline, ACLs and all");
  row("Confluence pages", String(preset.confluencePages));
  row("Jira issues", String(preset.jiraIssues));
  row("Code files", String(preset.repositories * preset.filesPerRepository));
  row("Indexed resources", String(seed.resourceCount), "published, ACL-assigned");
  row("Distinct subjects", String(corpus.subjectVocabulary(preset).length));

  // ── 2. a governed search ─────────────────────────────────────────────────
  const query = "payment retries in checkout";
  heading("2", "A governed search", `"${query}"`);
  const search = JSON.parse(
    (await tools.callTool("search_enterprise", { query }, context(viewer))).content,
  );
  const hits = search.results ?? search.hits ?? [];
  for (const hit of hits.slice(0, 5)) {
    row(dim(`[${hit.source}]`), hit.id, hit.title?.slice(0, 34));
  }
  row("Returned", String(hits.length), "every one permission-checked at read time");

  // ── 3. the ACL moment ────────────────────────────────────────────────────
  heading("3", "The same question, a different person", "authorization changes the answer");
  const blind = { principal: "contractor", principals: [], containers: seed.containerIds };
  const asBlind = JSON.parse(
    (await tools.callTool("search_enterprise", { query }, context(blind))).content,
  );
  const blindHits = asBlind.results ?? asBlind.hits ?? [];
  row("Authorized viewer", green(`${hits.length} results`));
  row("Unauthorized viewer", blindHits.length === 0 ? green("0 results") : red(`${blindHits.length} results`),
    "not an error — an absence");
  console.log(`  ${dim("An answer withheld is a decision, and it is recorded like any other.")}`);

  // ── 4. the audit trail ───────────────────────────────────────────────────
  heading("4", "What the ledger recorded", "emitted by EIL, ingested by Observability");
  const raw = await readFile(ndjson, "utf8");
  const emitted = raw.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const first = emitted[0];

  const parsed = events.canonicalEventSchema.safeParse(first);
  // Resolved from the observability checkout: this repo deliberately depends on
  // neither product, so it borrows the driver the product already ships.
  const pglite = await import(
    pathToFileURL(join(obsRepo, "node_modules/@electric-sql/pglite/dist/index.js")).href
  );
  const pg = new pglite.PGlite();
  const exec = {
    query: async (sql, params) => {
      const r = await pg.query(sql, params);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
  };
  for (const m of obsMig.migrations) {
    for (const s of m.statements ?? [m.sql]) if (s) await pg.exec(s);
  }
  let inserted = 0;
  for (const e of emitted) if ((await store.ingestEvent(exec, e)).inserted) inserted += 1;
  const retry = await store.ingestEvent(exec, first);
  // Selects `event` deliberately: that jsonb column is where the whole
  // canonical event lands, so it is the only place a raw query could survive.
  // An earlier version checked a projection without it, which could not have
  // found a leak if there had been one.
  const stored = await pg.query(
    "SELECT event_id, source_kind, operation, capture_mode, event FROM ai_event_receipts",
  );

  row("Events emitted", String(emitted.length), "one per tool call, no extra plumbing");
  row("Schema", parsed.success ? green("valid") : red("invalid"), "against Observability's real contract");
  row("Persisted", String(stored.rows.length), "append-only receipts");
  row("Replayed", retry.inserted ? red("duplicated") : green("idempotent"), "safe to re-ingest");
  console.log("");
  row("Query recorded as", dim(first.vendor.attributes.query_digest.slice(0, 24) + "…"));
  const leaked = stored.rows.some((r) =>
    JSON.stringify(typeof r.event === "string" ? JSON.parse(r.event) : r.event).includes(query),
  );
  row("Raw query stored", leaked ? red("YES — leak") : green("no"),
    "governed access, provable rather than asserted");

  // ── 5. the scorecard ─────────────────────────────────────────────────────
  heading("5", "What works, and what does not", "measured this run, failures included");
  const families = [
    ["exact_lookup", "Find PAY-1 by its key, via search"],
    ["subject_search", "Find documents about a subject"],
    ["unanswerable", "Decline when nothing answers"],
    ["denied", "Refuse what the viewer may not see"],
  ];
  for (const [family, description] of families) {
    const r = await gate.runFamilyEvaluation(db, seed, undefined, { limit: 20, family });
    let verdict;
    if (family === "exact_lookup") {
      verdict = r.recallAtK === 0 ? red("NOT VIA SEARCH") : green("works");
    } else if (family === "unanswerable") {
      verdict = r.retrievalAnsweredRate === 1 ? red("NEVER DECLINES") : green("declines");
    } else if (family === "denied") {
      verdict = r.leakedQueries === 0 ? green("zero leakage") : red("LEAKED");
    } else {
      verdict = `recall ${r.recallAtK.toFixed(2)}  MRR ${r.mrr.toFixed(2)}`;
    }
    row(description, verdict, `n=${r.queries}`);
  }
  const nav = await gate.runNavigationEvaluation(db, seed, { limit: 20 });
  row("Reach an issue's evidence", green(`${(nav.coverage * 100).toFixed(0)}% coverage`), `leaked ${nav.leaked}`);

  const lookup = JSON.parse(
    (await tools.callTool("lookup_object", { id: "PAY-1" }, context(viewer))).content,
  );
  row("Find PAY-1 by its key, via lookup_object", lookup.found ? green("works") : red("fails"));

  console.log("");
  console.log(rule("━"));
  console.log(`  ${bold("Two capabilities are missing and are on this page on purpose.")}`);
  console.log(`  ${dim("Search cannot resolve identifiers — a dedicated surface does. And the")}`);
  console.log(`  ${dim("system never declines to answer, which is the next thing to fix.")}`);
  console.log(`  ${dim("A demo that cannot show a bad number cannot be trusted with a good one.")}`);
  console.log("");
} finally {
  if (db) await db.close().catch(() => {});
  await rm(dir, { recursive: true, force: true });
}
