# EIL + AI Observability Demo

Thin, resettable integration harness for demonstrating governed enterprise
intelligence and AI-effectiveness observability against the same incident.

Fast conformance checks use a versioned wire contract without depending on
either product. The integration test separately loads pinned, built checkouts of
both real products and fails if either checkout is missing, stale, or unbuilt.

## Seeing it work

```bash
EIL_REPO=/path/to/enterprise-intelligence-layer \
OBSERVABILITY_REPO=/path/to/enterprise-ai-observability \
pnpm report
```

Runs both real products and prints what happened: the estate as ingested, a
governed search, the same search as someone without access, the receipt EIL
emitted and Observability persisted, and a scorecard of what works.

**The two broken capabilities are on that scorecard**, in the same type as the
working ones — search cannot resolve identifiers, and the system never declines
to answer. That is deliberate. A report that cannot show a bad number should not
be trusted with a good one, and an audience that spots the omission itself will
disbelieve everything else on the page.

Nothing is pre-recorded; re-running re-derives every figure.

## The real integration test

Everything else here validates hand-written fixtures against a vendored copy of
the wire contract. That proves the two contracts agree on paper; it does not
prove the two products connect, because neither of them runs.

This one runs both:

```bash
EIL_REPO=/path/to/enterprise-intelligence-layer \
OBSERVABILITY_REPO=/path/to/enterprise-ai-observability \
pnpm test:integration
```

Real EIL seeds a corpus and answers a real MCP `search_enterprise` call with its
real emitter attached. The **exact bytes** that emitter writes go to real
Observability migrations and `ingestEvent`. The persisted row is read back and
asserted: `source_kind=eil`, `operation=retrieval`, `capture_mode=metadata_only`,
a `query_digest` present, **the raw query absent**, and a retry that is
idempotent. Nothing is constructed, reshaped or normalised along the way.

It **fails** — never skips — when a checkout, an export or a built artifact is
missing, or when a checkout sits at a revision `integration/products.lock.json`
does not pin. Verified by inducing each: a missing checkout, an unbuilt product,
a drifted revision and an injected raw-query leak each produce a distinct
failure. A green run that silently proved nothing is the failure mode this
repository exists to avoid.

### What this does and does not prove

**It proves library integration.** Both products are loaded in one process from
their built `dist/` trees. The emitter, the schema, the migrations and the
ingestion path are all the real ones, so a contract change on either side breaks
this test.

**It does not prove deployment integration.** Nothing crosses a process
boundary, a socket or a network. Transport, serialization over the wire, auth
between services, proxy behaviour and failure under partition are all untested
and this test would not notice if they broke. Two-process wiring remains open
work; do not read a green run here as covering it.

### Revisions are pinned, and CI runs it

`integration/products.lock.json` records the exact product revisions this is
verified against. CI checks out those revisions, builds both, and runs
`pnpm test:integration` in a **dedicated job** — because the conformance job runs
`pnpm check`, which does not run the integration test, so a green tick there says
nothing about whether the products still connect.

The test independently re-checks the resolved `HEAD` against the manifest and
fails on drift, so the CI pin and the assertion cannot silently disagree. Use
`INTEGRATION_ALLOW_UNPINNED=1` to run against a working tree during development;
CI never sets it.

Keep `pnpm check` for fast schema conformance; it needs no checkouts.

### Corporate-machine verification

Clone the three repositories as siblings, then use the exact revisions in
`integration/products.lock.json`. The commands below match the current manifest:

```bash
git clone https://github.com/ashark-ai-05/enterprise-intelligence-layer.git
git clone https://github.com/ashark-ai-05/enterprise-ai-observability.git
git clone https://github.com/ashark-ai-05/eil-observability-demo.git

cd enterprise-intelligence-layer
git checkout c8380bd1ff1a49be3cd7bcdcff0e59a05fcc1cf1
pnpm install --frozen-lockfile
pnpm build
pnpm run doctor

cd ../enterprise-ai-observability
git checkout 1160abe1794784fcbd045738d37ba9b24aab7b75
pnpm install --frozen-lockfile
pnpm build

cd ../eil-observability-demo
pnpm install --frozen-lockfile
pnpm check
EIL_REPO=../enterprise-intelligence-layer \
OBSERVABILITY_REPO=../enterprise-ai-observability \
pnpm test:integration
pnpm amp:probe

pnpm cockpit          # then open http://127.0.0.1:4173
```

`pnpm run doctor`, not `pnpm doctor`. `doctor` is also a built-in pnpm
subcommand and the built-in wins, so `pnpm doctor` prints nothing and exits 0 —
which reads as "the environment is fine" when the proxy, TLS-bundle and
native-binary checks never ran. `amp:probe`, `test:integration` and `cockpit`
are not pnpm subcommands, so they are unaffected.

#### GitHub-blocked / Stash transfer

**Download one file, not three:**

<https://github.com/ashark-ai-05/eil-observability-demo/releases/latest/download/corp-transfer.zip>

The latest `corp-transfer.zip` contains all three Git bundles, `SHA256SUMS.txt`, and
`TRANSFER-README.md`. Release assets live outside Git history, so they do not
make every future clone carry large, stale or recursively nested bundles.

Prerequisites on the corporate machine: Git, Node.js 22 or newer, pnpm 10.32.1,
and access to the corporate npm registry (normally Nexus or Artifactory). If the
registry uses a corporate CA, configure Node/pnpm to trust it before installing.

##### 1. Unpack and verify the one download

macOS or Linux:

```bash
unzip corp-transfer.zip -d corp-transfer
cd corp-transfer
shasum -a 256 -c SHA256SUMS.txt  # macOS
# or: sha256sum -c SHA256SUMS.txt # Linux

git bundle list-heads enterprise-intelligence-layer.bundle
git bundle list-heads enterprise-ai-observability.bundle
git bundle list-heads eil-observability-demo.bundle
```

Windows PowerShell:

```powershell
Expand-Archive .\corp-transfer.zip -DestinationPath .\corp-transfer
Set-Location .\corp-transfer
Get-FileHash -Algorithm SHA256 .\*.bundle
git bundle list-heads .\enterprise-intelligence-layer.bundle
git bundle list-heads .\enterprise-ai-observability.bundle
git bundle list-heads .\eil-observability-demo.bundle
```

Compare the hashes with `SHA256SUMS.txt`. The reported `refs/heads/main`
revisions must be:

```text
enterprise-intelligence-layer  c8380bd1ff1a49be3cd7bcdcff0e59a05fcc1cf1
enterprise-ai-observability    1160abe1794784fcbd045738d37ba9b24aab7b75
eil-observability-demo         use the `refs/heads/main` value printed by `git bundle list-heads`
```

##### 2. Restore the three repositories locally

Run from the unpacked `corp-transfer` directory:

```bash
git clone enterprise-intelligence-layer.bundle enterprise-intelligence-layer
git clone enterprise-ai-observability.bundle enterprise-ai-observability
git clone eil-observability-demo.bundle eil-observability-demo

git -C enterprise-intelligence-layer rev-parse HEAD
git -C enterprise-ai-observability rev-parse HEAD
git -C eil-observability-demo rev-parse HEAD
```

Those three values must match the revisions above. The repositories are now
siblings in the layout expected by the integration test.

##### 3. Optional: publish the preserved repositories to Stash

Create three new, empty Stash repositories. Restore and publish each bundle:

```bash
cd enterprise-intelligence-layer
git remote set-url origin <enterprise-intelligence-layer-stash-url>
git push origin --all
git push origin --tags
cd ..

cd enterprise-ai-observability
git remote set-url origin <enterprise-ai-observability-stash-url>
git push origin --all
git push origin --tags
cd ..

cd eil-observability-demo
git remote set-url origin <eil-observability-demo-stash-url>
git push origin --all
git push origin --tags
cd ..
```

Do not initialize and commit raw GitHub source ZIPs: that produces new commit
IDs and makes the pinned integration fail. The Stash destinations above must be
empty so the preserved histories remain authoritative.

You can test the local restored repositories immediately; uploading to Stash is
not required first. If you do upload them, later clone the three Stash
repositories into the same sibling layout.

##### 4. Install, build, and test the real product connection

Run from the parent directory containing the three repositories:

```bash
cd enterprise-intelligence-layer
pnpm install --frozen-lockfile
pnpm build
pnpm run doctor

cd ../enterprise-ai-observability
pnpm install --frozen-lockfile
pnpm build

cd ../eil-observability-demo
pnpm install --frozen-lockfile
pnpm check
EIL_REPO=../enterprise-intelligence-layer \
OBSERVABILITY_REPO=../enterprise-ai-observability \
pnpm test:integration
pnpm amp:probe

pnpm cockpit          # then open http://127.0.0.1:4173
```

PowerShell uses the same commands except for the two environment variables:

```powershell
$env:EIL_REPO = "../enterprise-intelligence-layer"
$env:OBSERVABILITY_REPO = "../enterprise-ai-observability"
pnpm test:integration
```

The required successful integration line is:

```text
eil c8380bd1 -> observability 1160abe1: eil/retrieval, capture metadata_only, idempotent retry ok
```

`pnpm run doctor` and `pnpm amp:probe` are diagnostics; a corporate proxy or an Amp
account/build issue can make them report a blocker without invalidating a green
local product integration test.

##### 5. Run and open the measured delivery command center

From `eil-observability-demo`:

```bash
EIL_REPO=../enterprise-intelligence-layer \
OBSERVABILITY_REPO=../enterprise-ai-observability \
pnpm lifecycle          # add -- --pause for a presenter-led run

pnpm cockpit            # then open http://127.0.0.1:4173
```

The lifecycle command is the recommended demo entry point. Only the Confluence,
Jira and code content is synthetic. Every operation after those source bytes is
real and measured:

1. **Knowledge plane — real product:** EIL storage, scope registration,
   ingestion, structural chunking, offline embeddings, atomic publication,
   reconciliation, rank fusion, ACL checks, retrieval and MCP surface over the
   deterministic synthetic corpus.
2. **Evidence and criteria:** the indexed Jira and Confluence evidence is read,
   then four acceptance criteria are written with resolvable evidence links.
3. **Change and gates:** a disposable Git repository reproduces the defect,
   applies the code change, passes the regression, commits the result and records
   all 12 acceptance gates. Unmet gates remain visible (`8/12`).
4. **Cross-product observation — real products:** pinned EIL emits the retrieval
   event and pinned Observability validates, persists and idempotently replays
   it through the real integration test.

Each span captures its actual wall time, operation counts, result counts, status
and artifact. The run writes `.demo/lifecycle/run.json`; `pnpm cockpit` reads
that file automatically. The presenter prints every span as **input → operation
→ output → artifact → metrics**, then renders the same trace in the cockpit.

One deterministic **simulated LLM call** drafts the acceptance criteria so the
report includes a visible model call, 3,000 tokens (2,400 input / 600 output,
900 cached), and a `$0.012` estimate from `demo-pricebook-2026-08`. Its receipt
is `.demo/run/llm-call.json`; both usage and price are labelled simulated and
estimated, never provider-reported. Every other operation remains real.

To replace that fixture with an actual GitHub Copilot CLI call:

```bash
EIL_REPO=../enterprise-intelligence-layer \
OBSERVABILITY_REPO=../enterprise-ai-observability \
pnpm lifecycle -- --llm=copilot
```

This path is explicit because it can consume paid GitHub AI credits. It runs
Copilot programmatically with writing, shell, URL and built-in MCP tools denied.
It enables Copilot's file OpenTelemetry exporter and reads provider-emitted
`gen_ai.usage.*` token fields; prompt/response content capture stays disabled.
A live probe found that `github.copilot.cost` reports `0.0` even when the CLI
footer charges AI credits, and the credit amount is absent from OTel. The demo
therefore keeps that zero as discrepancy evidence but reports cost as `unknown`.
If Copilot produces no chat/token span, the lifecycle fails instead of
displaying zero usage. See the official [Copilot programmatic CLI
guide](https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/automate-with-actions)
and [CLI OpenTelemetry reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference#opentelemetry-monitoring).

The cockpit shows two clocks separately: actual measured wall time and an
opt-in enterprise-scale scenario projection. `pnpm journey -- --scale` applies
the versioned 420× demo basis; every projected duration is prefixed `~`, and the
unscaled milliseconds remain available without the flag. Simulated traces are
never scaled again.
Missing paths, a drifted pin or a failed command stop the run.

GitHub Actions do not run in Stash. Reproduce `pnpm check`, both product builds,
and `pnpm test:integration` in Bamboo when turning this manual test into a
corporate pipeline.

The integration test should report that real EIL emitted an `eil/retrieval`
event that real Observability ingested with metadata-only capture and an
idempotent retry. `pnpm run doctor` and `pnpm amp:probe` are no-spend diagnostics;
send their exact output with any failure report. Run `pnpm amp:probe -- --live`
only when you intend to make a minimal paid Amp call.

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

Real library integration is proven: see [The real integration test](#the-real-integration-test)
above. The rest of the foundation below is executable and credential-free. It
validates:

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

For the audience-facing delivery intelligence demo:

```bash
EIL_REPO=/path/to/enterprise-intelligence-layer \
OBSERVABILITY_REPO=/path/to/enterprise-ai-observability \
pnpm lifecycle          # add -- --pause to step through it in front of a room

pnpm cockpit            # browser command center
pnpm journey            # delivery-trace act only; no product execution
```

Open <http://127.0.0.1:4173>. The command center reads the run just produced:
ingestion → indexing → Jira/Confluence evidence read → acceptance criteria →
failing regression → code change → passing regression → commit → canonical
receipt → real Observability persistence and idempotent replay. It displays the
actual durations, document/chunk/result counts, tool/process calls, test exit
codes, commit SHA, gates and receipt facts captured during that run.
It also shows the simulated LLM usage/cost and the separately labelled 180×
enterprise-scale projection. The measured figures remain available beside it.

The provenance boundary is narrow and visible: Confluence, Jira and code
**content** are deterministic fixtures; the storage, ingestion, normalization,
chunking, embeddings, indexes, retrieval, criteria writer, filesystem mutation,
test runner, Git operations, canonical event handling, database migrations,
Observability ingestion, replay and cockpit aggregation all execute.

The platform views are served beside the cockpit:

- <http://127.0.0.1:4173/platform/eil-platform.html>
- <http://127.0.0.1:4173/platform/observability-plane.html>

`platform/eil-platform.html` is the standalone presentation source. Copy it
where your presentation workflow expects it, for example
`cp platform/eil-platform.html ~/Documents/eil-platform.html`. When served by
`pnpm cockpit`, its observability slide reads `/api/run`, so the figures come
from the same measured record as the cockpit. Opened directly as a file, it
shows unknown placeholders instead of retaining stale figures from an older
run. The companion observability plane uses the same visual language and spells
out capture, measurement, attribution, presentation and the feedback loop into
ingest/index.

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
integration/  Pinned product manifest and real library-integration test
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

1. ~~Replace the controlled-reference receipt with live EIL MCP event
   ingestion~~ — done: `integration/eil-to-observability.test.mjs` runs the
   real MCP call, the real emitter, and real Observability ingestion, pinned
   and CI-enforced. It proves library integration only — see
   [What this does and does not prove](#what-this-does-and-does-not-prove).
2. Record a real Amp CLI run and reconcile its commit trailer to thread cost.
3. Measure a real authenticated Copilot CLI environment and managed telemetry.
4. Add a two-process deployment test covering transport, wire serialization,
   inter-service auth, proxies, and failure across the process boundary — the
   integration test above does not cover this.
5. Replace the controlled-reference runner with live product receipts, and add
   the cockpit only after those receipts and the deployment boundary above
   exist.

The first paid Amp attempt is preserved as a sanitized `blocked_environment`
runner proof. It established native thread identity and structured activity, but
the installed CLI was rejected by the Amp service as unsupported; no successful
model turn, commit, or cost reconciliation is claimed.
