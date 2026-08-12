import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  assertValid,
  canonicalEventPolicyErrors,
  json,
  root,
  validators,
} from "./validation.mjs";

const command = process.argv[2] ?? "all";
const demoRoot = resolve(root, ".demo");
const repo = resolve(demoRoot, "payment-retry-repo");
const runDir = resolve(demoRoot, "run");
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const fileDigest = async (path) => digest(await readFile(path));
const exec = (program, args, cwd = root) => spawnSync(program, args, {
  cwd,
  encoding: "utf8",
  env: {
    ...process.env,
    GIT_AUTHOR_DATE: "2026-08-12T12:00:00Z",
    GIT_COMMITTER_DATE: "2026-08-12T12:00:00Z",
  },
});
const implementation = `export function shouldRetryPayment({ status, attempts }) {\n  if (attempts >= 3) return false;\n  return status === 429 || status >= 500;\n}\n`;

async function reset() {
  await rm(demoRoot, { recursive: true, force: true });
  await mkdir(repo, { recursive: true });
  await cp(resolve(root, "scenario/repository"), repo, { recursive: true });
  for (const args of [
    ["init", "-q"],
    ["config", "user.name", "Demo Acceptance"],
    ["config", "user.email", "demo-acceptance@example.invalid"],
    ["add", "."],
    ["commit", "-q", "-m", "Seed payment retry incident"],
  ]) {
    const result = exec("git", args, repo);
    if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr}`);
  }
  console.log(`RESET ${repo}`);
}

async function run() {
  const scenario = await json("scenario/payment-retry.json");
  const runner = await json("runners/maas.json");
  const evidenceManifest = await json("scenario/evidence-manifest.json");
  const validate = await validators();
  assertValid(validate.scenario, scenario, "scenario");
  assertValid(validate.runner, runner, "maas runner");
  const startCommit = exec("git", ["rev-parse", "HEAD"], repo).stdout.trim();
  const templateBytes = Buffer.concat([
    await readFile(resolve(root, "scenario/repository/payment-retry.mjs")),
    await readFile(resolve(root, "scenario/repository/payment-retry.test.mjs")),
  ]);
  const manifestMatches = startCommit === scenario.repository.startCommit &&
    digest(templateBytes) === scenario.repository.worktreeDigest;

  const before = exec(process.execPath, ["payment-retry.test.mjs"], repo);
  if (before.status === 0) throw new Error("incident reproduction unexpectedly passed before patch");

  await writeFile(resolve(repo, "payment-retry.mjs"), implementation);
  const after = exec(process.execPath, ["payment-retry.test.mjs"], repo);
  if (after.status !== 0) throw new Error(`verification failed after patch: ${after.stderr}`);
  const runId = `maas-${randomUUID()}`;
  const commit = exec("git", ["add", "."], repo);
  if (commit.status !== 0) throw new Error(commit.stderr);
  const committed = exec("git", ["commit", "-q", "-m", "Fix retry eligibility", "-m", `MaaS-Run-ID: ${runId}`], repo);
  if (committed.status !== 0) throw new Error(committed.stderr);
  const artifact = exec("git", ["rev-parse", "HEAD"], repo).stdout.trim();

  await mkdir(runDir, { recursive: true });
  const scenarioDigest = await fileDigest(resolve(root, "scenario/payment-retry.json"));
  const runnerDigest = await fileDigest(resolve(root, "runners/maas.json"));
  const queryDigest = digest("payment retry policy PAY-4471");
  const now = new Date().toISOString();
  const receipt = {
    schemaVersion: 1,
    eventId: randomUUID(),
    idempotencyKey: digest(`${runId}:search`),
    revisionDigest: digest(`${artifact}:search`),
    sourceEventId: `eil:search_enterprise:${runId}`,
    tenantId: scenario.identity.tenantId,
    source: { kind: "eil", provider: "enterprise-intelligence-layer" },
    identity: { principalId: scenario.identity.principalId, actorType: "agent" },
    trace: { runId, traceId: `trace-${runId}`, spanId: "span-search-1" },
    workflow: {
      workflowId: scenario.workflow.workflowId,
      workflowType: scenario.workflow.workflowType,
      attemptId: "attempt-1", stepId: "search-1", stage: "evidence_assembly",
      layer: "eil", role: "evidence", links: [],
    },
    timing: { observedAt: now, receivedAt: now },
    operation: "retrieval", status: "succeeded",
    capture: { mode: "metadata_only", contentIncluded: false, redaction: "source", policyVersion: "eil-audit-v1" },
    attributes: { scenario_digest: scenarioDigest, runner_digest: runnerDigest, artifact_commit: artifact },
    vendor: { namespace: "eil.v1", attributes: { tool: "search_enterprise", query_digest: queryDigest, result_count: 3, arms_skipped: 0, acl_rejected: 0, acl_drift: 0 } },
  };
  assertValid(validate.receipt, receipt, "generated receipt");
  const policyErrors = canonicalEventPolicyErrors(receipt);
  if (policyErrors.length > 0) throw new Error(`receipt policy rejected: ${policyErrors.join(", ")}`);
  const receiptPath = resolve(runDir, "receipt.json");
  await writeFile(receiptPath, stableJson(receipt));

  const evidence = {
    runId, runnerKind: "maas_reference", scenarioId: scenario.scenarioId,
    reproductionExitCode: before.status, verificationExitCode: after.status,
    startCommit, artifactCommit: artifact, manifestMatches,
    evidenceManifestDigest: await fileDigest(resolve(root, "scenario/evidence-manifest.json")),
    protectedEvidenceIds: evidenceManifest.forbidden,
    citations: evidenceManifest.authorized,
    cost: { currency: "USD", amount: "0.00", method: "controlled_reference" },
    coverage: { amp: "blocked_environment", copilot: "blocked_environment", maas: "observed" },
    limits: scenario.limits,
    usage: { attempts: 1, steps: 4, elapsedSeconds: 1 },
  };
  const evidencePath = resolve(runDir, "evidence.json");
  await writeFile(evidencePath, stableJson(evidence));
  const evidenceDigest = await fileDigest(evidencePath);
  const patchedBytes = await readFile(resolve(repo, "payment-retry.mjs"), "utf8");
  const gateFacts = {
    manifest_match: manifestMatches,
    zero_acl_leakage: false,
    citations_resolve: false,
    reproduction_fails_before_patch: before.status !== 0,
    verification_passes_after_patch: after.status === 0,
    artifact_matches: patchedBytes === implementation && artifact.length === 40,
    independent_acceptance: false,
    outcome_accepted: after.status === 0,
    cost_reconciled: evidence.cost.amount === "0.00" && evidence.cost.method === "controlled_reference",
    coverage_disclosed: Object.keys(evidence.coverage).length === 3,
    limits_respected: evidence.usage.attempts <= scenario.limits.maxAttempts &&
      evidence.usage.steps <= scenario.limits.maxStepsPerAttempt &&
      evidence.usage.elapsedSeconds <= scenario.limits.timeoutSeconds,
    recording_verified: false,
  };
  const passedCount = Object.values(gateFacts).filter(Boolean).length;
  const acceptance = {
    apiVersion: "eil-observability-demo/v1alpha1", kind: "AcceptanceResult",
    contract: scenario.acceptance.contract, runId, passed: Object.values(gateFacts).every(Boolean),
    gates: Object.entries(gateFacts).map(([id, passed]) => ({ id, passed, evidenceDigest })),
  };
  assertValid(validate.acceptance, acceptance, "acceptance");
  const acceptancePath = resolve(runDir, "acceptance.json");
  await writeFile(acceptancePath, stableJson(acceptance));

  const recording = {
    apiVersion: "eil-observability-demo/v1alpha1", kind: "Recording",
    recordingId: `recording-${runId}`, runnerKind: "maas_reference", capturedAt: now,
    scenarioDigest, runnerDigest,
    receiptDigests: [await fileDigest(receiptPath)], artifactDigests: [digest(patchedBytes)],
    acceptanceResultDigest: await fileDigest(acceptancePath),
  };
  assertValid(validate.recording, recording, "recording");
  const recordingPath = resolve(runDir, "recording.json");
  await writeFile(recordingPath, stableJson(recording));
  const storedRecording = JSON.parse(await readFile(recordingPath, "utf8"));
  assertValid(validate.recording, storedRecording, "stored recording");
  if (storedRecording.receiptDigests[0] !== await fileDigest(receiptPath) ||
      storedRecording.acceptanceResultDigest !== await fileDigest(acceptancePath)) {
    throw new Error("recording verification failed at capture");
  }
  console.log(`RUN ${runId} commit=${artifact} gates=${passedCount}/12`);
}

async function replay() {
  const validate = await validators();
  const scenario = await json("scenario/payment-retry.json");
  const runner = await json("runners/maas.json");
  const evidenceManifest = await json("scenario/evidence-manifest.json");
  const recording = JSON.parse(await readFile(resolve(runDir, "recording.json"), "utf8"));
  const acceptance = JSON.parse(await readFile(resolve(runDir, "acceptance.json"), "utf8"));
  const receipt = JSON.parse(await readFile(resolve(runDir, "receipt.json"), "utf8"));
  const evidencePath = resolve(runDir, "evidence.json");
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const evidenceDigest = await fileDigest(evidencePath);
  assertValid(validate.recording, recording, "recording replay");
  assertValid(validate.acceptance, acceptance, "acceptance replay");
  assertValid(validate.receipt, receipt, "receipt replay");
  const policyErrors = canonicalEventPolicyErrors(receipt);
  if (policyErrors.length > 0) throw new Error(`receipt policy mismatch: ${policyErrors.join(", ")}`);
  const scenarioDigestMatches = recording.scenarioDigest === await fileDigest(resolve(root, "scenario/payment-retry.json"));
  const runnerDigestMatches = recording.runnerDigest === await fileDigest(resolve(root, "runners/maas.json"));
  if (!scenarioDigestMatches) throw new Error("scenario digest mismatch");
  if (!runnerDigestMatches) throw new Error("runner digest mismatch");
  if (evidence.evidenceManifestDigest !== await fileDigest(resolve(root, "scenario/evidence-manifest.json"))) throw new Error("evidence manifest digest mismatch");
  const receiptDigestMatches = recording.receiptDigests[0] === await fileDigest(resolve(runDir, "receipt.json"));
  const acceptanceDigestMatches = recording.acceptanceResultDigest === await fileDigest(resolve(runDir, "acceptance.json"));
  if (!receiptDigestMatches) throw new Error("receipt digest mismatch");
  if (!acceptanceDigestMatches) throw new Error("acceptance digest mismatch");
  const committedArtifact = exec("git", ["show", `${evidence.artifactCommit}:payment-retry.mjs`], repo);
  if (committedArtifact.status !== 0) throw new Error("accepted artifact commit is unavailable");
  const verifyRoot = resolve(demoRoot, "verification");
  await rm(verifyRoot, { recursive: true, force: true });
  await mkdir(resolve(verifyRoot, "before"), { recursive: true });
  await mkdir(resolve(verifyRoot, "after"), { recursive: true });
  const testBytes = exec("git", ["show", `${evidence.artifactCommit}:payment-retry.test.mjs`], repo);
  const beforeBytes = exec("git", ["show", `${evidence.artifactCommit}^:payment-retry.mjs`], repo);
  if (testBytes.status !== 0 || beforeBytes.status !== 0) throw new Error("verification inputs unavailable from git");
  await writeFile(resolve(verifyRoot, "before/payment-retry.mjs"), beforeBytes.stdout);
  await writeFile(resolve(verifyRoot, "before/payment-retry.test.mjs"), testBytes.stdout);
  await writeFile(resolve(verifyRoot, "after/payment-retry.mjs"), committedArtifact.stdout);
  await writeFile(resolve(verifyRoot, "after/payment-retry.test.mjs"), testBytes.stdout);
  const beforeReplay = exec(process.execPath, ["payment-retry.test.mjs"], resolve(verifyRoot, "before"));
  const afterReplay = exec(process.execPath, ["payment-retry.test.mjs"], resolve(verifyRoot, "after"));
  const templateBytes = Buffer.concat([
    await readFile(resolve(root, "scenario/repository/payment-retry.mjs")),
    await readFile(resolve(root, "scenario/repository/payment-retry.test.mjs")),
  ]);
  const recomputed = {
    manifest_match: evidence.startCommit === scenario.repository.startCommit &&
      digest(templateBytes) === scenario.repository.worktreeDigest,
    zero_acl_leakage: false,
    citations_resolve: false,
    reproduction_fails_before_patch: beforeReplay.status !== 0,
    verification_passes_after_patch: afterReplay.status === 0,
    artifact_matches: committedArtifact.stdout === implementation && recording.artifactDigests[0] === digest(committedArtifact.stdout),
    independent_acceptance: false,
    outcome_accepted: afterReplay.status === 0,
    cost_reconciled: evidence.cost.currency === "USD" && evidence.cost.amount === "0.00" && evidence.cost.method === "controlled_reference",
    coverage_disclosed: JSON.stringify(Object.keys(evidence.coverage).sort()) === JSON.stringify(["amp", "copilot", "maas"]),
    limits_respected: evidence.usage.attempts <= scenario.limits.maxAttempts &&
      evidence.usage.steps <= scenario.limits.maxStepsPerAttempt &&
      evidence.usage.elapsedSeconds <= scenario.limits.timeoutSeconds,
    // The captured acceptance necessarily predates the recording that embeds
    // its digest. Replay verifies that recording, but cannot rewrite history
    // and claim the capture had already been independently verified.
    recording_verified: false,
  };
  const accepted = new Map(acceptance.gates.map((gate) => [gate.id, gate]));
  for (const [id, passed] of Object.entries(recomputed)) {
    const gate = accepted.get(id);
    if (gate?.passed !== passed || gate.evidenceDigest !== evidenceDigest) throw new Error(`acceptance gate mismatch: ${id}`);
  }
  if (receipt.trace.runId !== evidence.runId || acceptance.runId !== evidence.runId ||
      receipt.attributes.scenario_digest !== recording.scenarioDigest ||
      receipt.attributes.runner_digest !== recording.runnerDigest ||
      receipt.attributes.artifact_commit !== evidence.artifactCommit) throw new Error("cross-artifact correlation mismatch");
  if (acceptance.passed !== acceptance.gates.every((gate) => gate.passed)) throw new Error("acceptance aggregate mismatch");
  const passedCount = acceptance.gates.filter((gate) => gate.passed).length;
  const unmet = acceptance.gates.filter((gate) => !gate.passed).map((gate) => gate.id).join(",");
  console.log(`REPLAY VERIFIED ${recording.recordingId}: ${passedCount}/12 gates, digests verified, unmet=${unmet}`);
}

if (!["reset", "run", "replay", "all"].includes(command)) throw new Error(`unknown command: ${command}`);
if (command === "reset" || command === "all") await reset();
if (command === "run" || command === "all") await run();
if (command === "replay") await replay();
if (command === "all") {
  const verified = exec(process.execPath, ["scripts/demo-runner.mjs", "replay"]);
  if (verified.status !== 0) throw new Error(`independent replay failed: ${verified.stderr}`);
  process.stdout.write(verified.stdout);
}
