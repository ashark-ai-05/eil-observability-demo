# EIL + AI Observability Demo

Thin, resettable integration harness for demonstrating governed enterprise
intelligence and AI-effectiveness observability against the same incident.

This repository orchestrates the products through a versioned wire contract. It
does not copy their implementation or import either private package at runtime.

## Before attempting the Amp proof

```bash
pnpm amp:probe            # no-spend environment checks
pnpm amp:probe -- --live  # adds one minimal real turn (may spend on a working setup)
```

Reports, per check, whether the Amp CLI is installed, which build it is, whether
the account is authenticated, whether it holds credits, and — with `--live` —
whether Amp's server actually accepts that build.

It exists because these failures are silent and mutually disguising. On the
machine where the proof was first attempted, `amp update` reported the CLI as
current while the server rejected that exact build with **HTTP 426**, surfacing
only as "Unexpected error inside Amp CLI"; the account separately held **zero
credits**; and behind an egress proxy the same command instead dies with a
network timeout and no stream at all. The probe names which of those you have
rather than leaving a failed run to be interpreted.

A rejected build fails before any model call and costs nothing. A working build
with credits *will* run the prompt and bill for it, which is why `--live` is
opt-in.

## Current milestone

The Phase 0 foundation is executable and credential-free. It validates:

- the payment-retry scenario manifest;
- Amp CLI, GitHub Copilot CLI, and MaaS reference capability manifests;
- the vendored canonical-event v1 wire schema used by observability and EIL;
- metadata-only canonical event fixtures plus a stricter demo capture policy;
- recording manifests and tamper detection;
- deterministic acceptance-result structure.

It also provides a credential-free controlled-reference vertical slice. The
runner resets a disposable payment-retry repository, proves the incident test
fails, applies the reference fix, proves verification passes, commits the
artifact, emits a metadata-only canonical EIL receipt, creates a content-digested
recording, evaluates all 12 acceptance gates, and replays the evidence. Eight
gates pass in the controlled run. Live ACL/citation proof, independent
acceptance, and capture-time recording verification remain unmet rather than
being simulated; replay verifies the recording after capture. The controlled
`AcceptanceResult` therefore remains `passed: false` even when replay succeeds.

It does **not** simulate live Amp or Copilot success. Those runners remain
explicitly capability-blocked until their real environments produce receipts.

## Run

Prerequisites: Node.js 22 or newer and pnpm 10.32.1.

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm demo:validate
pnpm demo:test
```

Expected final line:

```text
PASS phase0 foundation: 9 valid artifacts, 4 expected rejections, digests verified
```

The controlled-reference run finishes with:

```text
REPLAY VERIFIED recording-maas-…: 8/12 gates, digests verified,
unmet=zero_acl_leakage,citations_resolve,independent_acceptance,recording_verified
```

To inspect each lifecycle step separately:

```bash
pnpm demo:reset
pnpm demo:run
pnpm demo:replay
```

Runtime output is written below `.demo/` and is intentionally git-ignored.

## Layout

```text
schemas/      Versioned JSON Schema wire contracts
fixtures/     Valid wire fixtures and deliberately invalid contract fixtures
scenario/     Resettable incident manifest (no hidden truth or credentials)
runners/      Honest capability declarations for Amp, Copilot, and MaaS
acceptance/   Deterministic outcome gates and example result
recordings/   Content-digested recording manifest fixtures
scripts/      Validation and tamper-check entry point
```

## Safety

The distributable fixtures contain no credentials, prompts, source content,
protected evidence, or hidden evaluation truth. Metadata-only receipts carry
digests, IDs, counts, ranks, and classifications—not raw query text.

`schemas/receipt.schema.json` vendors the public wire shape from observability
main at the recorded upstream commit. Conformance fixtures cover both the EIL
emitter's current workflow-free output and the runner-correlated demo shape.
The stricter metadata-only key policy is an integration ingress rule layered on
that compatible wire schema; it is not a third event vocabulary.

## Next gates

1. Record a real Amp CLI run and reconcile its commit trailer to thread cost.
2. Measure a real authenticated Copilot CLI environment and managed telemetry.
3. Replace the controlled-reference receipt with live EIL MCP event ingestion;
   the same vendored schema and replay validator are already exercised here.
4. Add the cockpit only after live runner receipts exist.

The first paid Amp attempt is preserved as a sanitized `blocked_environment`
runner proof. It established native thread identity and structured activity, but
the installed CLI was rejected by the Amp service as unsupported; no successful
model turn, commit, or cost reconciliation is claimed.
