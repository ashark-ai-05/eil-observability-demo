/**
 * The real integration test.
 *
 * Everything else in this repository validates hand-written fixtures against a
 * vendored copy of the wire contract. That proves the two contracts agree on
 * paper. It does not prove the two products connect, because neither of them
 * ever runs — a distinction that went unnoticed until it was asked about
 * directly.
 *
 * This test runs both. Real EIL seeds a corpus and answers a real MCP
 * `search_enterprise` call with its real emitter attached; the **exact bytes**
 * that emitter writes are handed to real Observability migrations and
 * `ingestEvent`; the persisted row is then read back and asserted.
 *
 * Nothing here constructs, reshapes or normalises an event. If the two
 * contracts drift apart, this fails — which is the property the vendored
 * schema cannot have.
 *
 * Neither product depends on the other, so both arrive by explicit path:
 *
 *   EIL_REPO=/path/to/enterprise-intelligence-layer \
 *   OBSERVABILITY_REPO=/path/to/enterprise-ai-observability \
 *   pnpm test:integration
 *
 * It fails loudly rather than skipping when a checkout, an export or a built
 * artifact is missing. A green run that silently proved nothing is the failure
 * mode this whole exercise exists to eliminate.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

/** A distinctive query, so its absence from the persisted row is meaningful. */
const QUERY = "payment retries in checkout";

const lock = JSON.parse(
  readFileSync(new URL("./products.lock.json", import.meta.url), "utf8"),
);

/**
 * Refuse to run against a revision the manifest does not pin.
 *
 * Without this the test accepts any local checkout, so a pass says "it worked
 * on someone's machine, against whatever they had" -- which is the claim this
 * test exists to replace. Set INTEGRATION_ALLOW_UNPINNED=1 to develop against a
 * working tree; CI never sets it.
 */
function assertPinned(name, path) {
  const expected = lock.products[name]?.revision;
  if (!expected) throw new Error(`products.lock.json has no revision for ${name}`);
  let head;
  try {
    head = execFileSync("git", ["-C", path, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    throw new Error(`${path} is not a git checkout, so its revision cannot be verified.`);
  }
  if (head === expected) return head;
  const message =
    `${name}: checkout is at ${head}, manifest pins ${expected}. ` +
    `Update integration/products.lock.json deliberately, or check out the pinned revision.`;
  if (process.env.INTEGRATION_ALLOW_UNPINNED === "1") {
    console.warn(`WARNING (unpinned run) ${message}`);
    return head;
  }
  throw new Error(message);
}

function requireRepo(variable) {
  const raw = process.env[variable];
  if (!raw) {
    throw new Error(
      `${variable} is not set. This test runs the real products; point it at a checkout:\n` +
        `  ${variable}=/path/to/repo pnpm test:integration`,
    );
  }
  const path = resolve(raw);
  if (!existsSync(path)) {
    throw new Error(`${variable} is set to ${path}, which does not exist.`);
  }
  return path;
}

/**
 * Import a built artifact, failing with the reason rather than a module error.
 * A missing `dist/` means the product was not built, which is a different
 * problem from a missing export and deserves a different message.
 */
async function importBuilt(repo, relative, variable) {
  const path = join(repo, relative);
  if (!existsSync(path)) {
    throw new Error(
      `${variable}: expected built artifact ${relative} is missing. Run \`pnpm build\` in ${repo}.`,
    );
  }
  return import(pathToFileURL(path).href);
}

function requireExports(module, names, where) {
  for (const name of names) {
    if (typeof module[name] === "undefined") {
      throw new Error(`${where}: expected export \`${name}\` is missing.`);
    }
  }
}

test("real EIL emits an event real Observability ingests", async (t) => {
  const eilRepo = requireRepo("EIL_REPO");
  const observabilityRepo = requireRepo("OBSERVABILITY_REPO");
  const eilHead = assertPinned("eil", eilRepo);
  const observabilityHead = assertPinned("observability", observabilityRepo);

  // --- load both real products -------------------------------------------
  const [corpus, gate, tools, telemetry, database, eilMigrations] =
    await Promise.all([
      importBuilt(eilRepo, "dist/corpus/synthetic.js", "EIL_REPO"),
      importBuilt(eilRepo, "dist/eval/corpus-gate.js", "EIL_REPO"),
      importBuilt(eilRepo, "dist/serving/tools.js", "EIL_REPO"),
      importBuilt(eilRepo, "dist/telemetry/canonical-event-sink.js", "EIL_REPO"),
      importBuilt(eilRepo, "dist/storage/database.js", "EIL_REPO"),
      importBuilt(eilRepo, "dist/storage/migrations.js", "EIL_REPO"),
    ]);
  requireExports(corpus, ["syntheticCorpusPresets"], "EIL corpus");
  requireExports(
    gate,
    ["seedEvaluationCorpus", "defaultArms", "evalViewer", "EVAL_TENANT"],
    "EIL corpus-gate",
  );
  requireExports(tools, ["callTool"], "EIL tools");
  requireExports(telemetry, ["CanonicalEventAuditSink"], "EIL telemetry");

  const [events, store, obsMigrations] = await Promise.all([
    importBuilt(observabilityRepo, "dist/contracts/events.js", "OBSERVABILITY_REPO"),
    importBuilt(observabilityRepo, "dist/storage/event-store.js", "OBSERVABILITY_REPO"),
    importBuilt(observabilityRepo, "dist/storage/migrations.js", "OBSERVABILITY_REPO"),
  ]);
  requireExports(events, ["canonicalEventSchema"], "Observability contracts");
  requireExports(store, ["ingestEvent"], "Observability event store");
  requireExports(obsMigrations, ["migrations"], "Observability migrations");

  const directory = await mkdtemp(join(tmpdir(), "eil-obs-integration-"));
  const ndjsonPath = join(directory, "emitted.ndjson");
  let eilDb;

  try {
    // --- 1. real EIL answers a real MCP call ------------------------------
    eilDb = await database.openDatabase({
      url: `pglite://${join(directory, "eil-catalog")}`,
    });
    await eilMigrations.migrate(eilDb);
    const seed = await gate.seedEvaluationCorpus(
      eilDb,
      corpus.syntheticCorpusPresets.ci,
    );

    const result = await tools.callTool(
      "search_enterprise",
      { query: QUERY },
      {
        db: eilDb,
        tenantId: gate.EVAL_TENANT,
        arms: gate.defaultArms(eilDb),
        viewer: gate.evalViewer(seed.containerIds),
        audit: new telemetry.CanonicalEventAuditSink({
          path: ndjsonPath,
          tenantId: gate.EVAL_TENANT,
        }),
      },
    );
    assert.ok(result, "EIL returned no tool result");

    // --- 2. take the emitted bytes exactly as written ---------------------
    const raw = await readFile(ndjsonPath, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    assert.equal(lines.length, 1, "expected exactly one emitted event");
    const emitted = JSON.parse(lines[0]);

    // --- 3. real Observability accepts them -------------------------------
    const parsed = events.canonicalEventSchema.safeParse(emitted);
    assert.ok(
      parsed.success,
      `emitted event rejected by the real canonical schema: ${JSON.stringify(parsed.error?.issues?.slice(0, 3))}`,
    );

    const pglite = await import(
      pathToFileURL(
        join(observabilityRepo, "node_modules/@electric-sql/pglite/dist/index.js"),
      ).href
    ).catch(() => import("@electric-sql/pglite"));
    const pg = new pglite.PGlite();
    const executor = {
      query: async (sql, params) => {
        const rows = await pg.query(sql, params);
        return { rows: rows.rows, rowCount: rows.affectedRows ?? rows.rows.length };
      },
    };
    for (const migration of obsMigrations.migrations) {
      for (const statement of migration.statements ?? [migration.sql]) {
        if (statement) await pg.exec(statement);
      }
    }

    const first = await store.ingestEvent(executor, emitted);
    assert.equal(first.inserted, true, "first ingestion did not insert");

    // --- 4. read the persisted row back and assert what it holds ----------
    const persisted = await pg.query(
      "SELECT event_id, source_kind, operation, capture_mode, content_included, event FROM ai_event_receipts",
    );
    assert.equal(persisted.rows.length, 1, "expected exactly one receipt");
    const row = persisted.rows[0];
    assert.equal(row.source_kind, "eil");
    assert.equal(row.operation, "retrieval");
    assert.equal(row.capture_mode, "metadata_only");
    assert.equal(row.content_included, false);

    const stored = typeof row.event === "string" ? JSON.parse(row.event) : row.event;
    assert.ok(
      typeof stored.vendor?.attributes?.query_digest === "string",
      "query digest missing from the persisted event",
    );

    // The property the metadata-only policy exists for: the query itself must
    // not survive anywhere in an append-only row, where late redaction is not
    // available.
    assert.equal(
      JSON.stringify(stored).includes(QUERY),
      false,
      "raw query text leaked into the persisted receipt",
    );

    // --- 5. replay is safe ------------------------------------------------
    const retry = await store.ingestEvent(executor, emitted);
    assert.equal(retry.inserted, false, "retry inserted a duplicate");
    assert.equal(retry.recordId, first.recordId, "retry produced a different record");

    await pg.close();
    t.diagnostic(
      `eil ${eilHead.slice(0, 8)} -> observability ${observabilityHead.slice(0, 8)}: ` +
        `${row.source_kind}/${row.operation}, capture ${row.capture_mode}, idempotent retry ok`,
    );
  } finally {
    if (eilDb) await eilDb.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});
