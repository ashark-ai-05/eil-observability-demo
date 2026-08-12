# EIL + AI Observability Demo

Thin, resettable integration harness for demonstrating governed enterprise
intelligence and AI-effectiveness observability against the same incident.

This repository orchestrates the products through a versioned wire contract. It
does not copy their implementation or import either private package at runtime.

## Current milestone

The Phase 0 foundation is executable and credential-free. It validates:

- the payment-retry scenario manifest;
- Amp CLI, GitHub Copilot CLI, and MaaS reference capability manifests;
- metadata-only canonical receipt fixtures;
- recording manifests and tamper detection;
- deterministic acceptance-result structure.

It does **not** yet run the complete agent demo. Live Amp and Copilot recordings,
the disposable code fixture, cross-product processes, and the cockpit are tracked
as explicit capability gates rather than simulated.

## Run

Prerequisites: Node.js 22 or newer and pnpm 10.32.1.

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm demo:validate
```

Expected final line:

```text
PASS phase0 foundation: 8 valid artifacts, 4 expected rejections, digests verified
```

## Layout

```text
schemas/      Versioned JSON Schema wire contracts
fixtures/     Valid and deliberately invalid conformance fixtures
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

## Next gates

1. Record a real Amp CLI run and reconcile its commit trailer to thread cost.
2. Measure a real authenticated Copilot CLI environment and managed telemetry.
3. Wire EIL MCP receipts into observability ingestion using these schemas.
4. Add the disposable payment-retry repository and deterministic acceptance.
5. Publish a single record/rerun/replay runbook only after every command is run
   from a clean checkout.

The first paid Amp attempt is preserved as a sanitized `blocked_environment`
runner proof. It established native thread identity and structured activity, but
the installed CLI was rejected by the Amp service as unsupported; no successful
model turn, commit, or cost reconciliation is claimed.
