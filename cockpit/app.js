const data = await fetch("/api/run").then((response) => {
  if (!response.ok) throw new Error(`Run unavailable (${response.status})`);
  return response.json();
});

const number = (value) => new Intl.NumberFormat("en-US").format(value);
const duration = (seconds) => {
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return minutes ? `${minutes}m ${String(remainder).padStart(2, "0")}s` : `${rounded}s`;
};
const time = (value) => new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value));
const pct = (value) => `${Math.round(value * 100)}%`;
const icons = { understand: "⌕", plan: "◇", implement: "⌘", verify: "✓", observe: "◎", release: "↑" };
const artifactIcons = { dataset: "DB", index: "IX", search: "⌕", context: "C", ticket: "J", requirement: "C", code: "{ }", criteria: "AC", diff: "±", test: "T", commit: "G", receipt: "◎", build: "B", deployment: "D", approval: "A" };
const total = data.summary.elapsedSeconds;
const measured = data.mode === "measured";
const waterfallTotal = measured ? data.summary.activeSeconds : total;
const longest = [...data.steps].sort((a, b) => b.durationSeconds - a.durationSeconds)[0];
const badge = measured ? "MEASURED RUN" : "DEMO RUN";
const scale = data.summary.projectionBasis?.multiplier ?? null;
const actualLlm = data.summary.usageProvenance === "measured";
const outcomeLabel = measured ? "Verified and observed" : `Released to ${data.task.environment}`;
const axis = [0, .25, .5, .75, 1].map((fraction) => measured ? `+${duration(waterfallTotal * fraction)}` : time(new Date(Date.parse(data.startedAt) + total * fraction * 1000)));
const flow = data.steps.map((step) => `<div class="flow-node" data-stage="${step.stage}"><i>${step.order}</i><span><small>${step.system}</small><strong>${step.action}</strong></span></div>`).join("");
let elapsedCursor = 0;
const waterfall = data.steps.map((step) => {
  const left = elapsedCursor / waterfallTotal * 100;
  const width = step.durationSeconds / waterfallTotal * 100;
  const activeWidth = step.activeSeconds / step.durationSeconds * 100;
  elapsedCursor += step.durationSeconds;
  return `<div class="waterfall-row"><span class="waterfall-label"><i>${step.order}</i><b>${step.action}</b></span><div class="waterfall-track"><div class="waterfall-span" style="left:${left}%;width:${width}%"><i style="width:${activeWidth}%"></i><b></b></div></div><strong>${duration(step.durationSeconds)}</strong></div>`;
}).join("");

const stageCards = data.stages.map((stage, index) => `
  <article class="stage-card stage-${stage.name}">
    <div class="stage-head"><span>${String(index + 1).padStart(2, "0")}</span><i>${icons[stage.name]}</i></div>
    <h3>${stage.name}</h3>
    <strong>${duration(stage.durationSeconds)}</strong>
    <small>${stage.steps} ${stage.steps === 1 ? "step" : "steps"}</small>
    <div class="stage-bar"><i style="width:${stage.durationSeconds / total * 100}%"></i></div>
  </article>`).join("");

const timeline = data.steps.map((step) => {
  const waitShare = step.waitSeconds / step.durationSeconds * 100;
  const observedMetrics = Object.entries(step.metrics ?? {}).map(([key, value]) => `<span><small>${key.replaceAll(/([A-Z])/g, " $1")}</small><b>${typeof value === "number" ? number(value) : value}</b></span>`).join("");
  return `
    <article class="trace-step" data-stage="${step.stage}">
      <div class="trace-marker"><span>${step.order}</span></div>
      <div class="trace-main">
        <div class="trace-title"><span class="system">${step.system}</span><span class="clock">${time(step.startedAt)} → ${time(step.endedAt)}</span></div>
        <h3>${step.action}</h3>
        <p>${step.detail}</p>
        <div class="trace-io"><span><small>Input</small><code>${JSON.stringify(step.input ?? {})}</code></span><span><small>Output</small><code>${JSON.stringify(step.output ?? step.metrics ?? {})}</code></span></div>
        <div class="duration-bar"><i class="active" style="width:${100 - waitShare}%"></i><i class="wait" style="width:${waitShare}%"></i></div>
        <div class="trace-facts">
          <span><b>${duration(step.durationSeconds)}</b> elapsed</span>
          <span><b>${duration(step.activeSeconds)}</b> active</span>
          <span><b>${duration(step.waitSeconds)}</b> wait</span>
          <span><b>${number(step.tokens.total)}</b> tokens</span>
          <span><b>${step.toolCalls}</b> tools</span>
        </div>
        ${observedMetrics ? `<div class="trace-metrics">${observedMetrics}</div>` : ""}
      </div>
      <div class="artifact"><i>${artifactIcons[step.artifact.type] ?? "•"}</i><span><small>${step.artifact.type}</small><strong>${step.artifact.label}</strong><code>${step.artifact.ref}</code></span></div>
    </article>`;
}).join("");

document.querySelector("#app").innerHTML = `
  <nav>
    <a class="brand" href="#top"><i>DI</i><span>Delivery Intelligence<small>Agent observability command center</small></span></a>
    <div class="nav-meta"><span class="live-dot"></span> Trace reconstructed <b class="simulation">${badge}</b></div>
  </nav>
  <header id="top">
    <div class="crumb">PAYMENTS PLATFORM <span>/</span> ${data.task.id} <span>/</span> ${measured ? "EXECUTED RUN" : "DELIVERY RUN 01"}</div>
    <div class="title-row"><div><h1>${data.task.title}</h1><p>${data.task.service} · ${data.task.repository} · Correlation ${data.correlationId}</p></div><div class="outcome"><i>✓</i><span><small>Outcome</small><strong>${outcomeLabel}</strong></span></div></div>
  </header>
  <section class="notice"><b>${measured ? "Measured" : "Demo run"}</b><span>Demo dataset · measured execution and telemetry.</span><code>${data.runId}</code></section>
  <section class="flow"><div class="flow-line"></div>${flow}</section>
  <section class="kpis">
    <article><span>${measured ? "Execution time" : "Lead time"}</span><strong>${duration(data.summary.elapsedSeconds)}</strong><small>${scale ? `projected ~${duration(data.summary.projectedElapsedSeconds)} at ${scale}×` : "intake → production"}</small></article>
    <article><span>Model usage</span><strong>${number(data.summary.tokenTotal)}</strong><small>tokens · ${data.summary.modelCalls} call${data.summary.modelCalls === 1 ? "" : "s"}</small></article>
    <article><span>Tool activity</span><strong>${data.summary.toolCalls}</strong><small>calls · ${data.summary.retries} retries</small></article>
    <article><span>Measured work</span><strong>${duration(data.summary.activeSeconds)}</strong><small>${pct(data.summary.activeSeconds / data.summary.elapsedSeconds)} of elapsed</small></article>
    <article><span>${measured ? "Verified outcome" : "Verified shipping"}</span><strong class="good">${data.summary.verifiedShipping ? "Proven" : "Unproven"}</strong><small>${pct(data.summary.attributionCoverage)} lineage coverage</small></article>
  </section>
  <section class="panel journey-panel">
    <div class="panel-title"><div><span>01 · EXECUTIVE VIEW</span><h2>${measured ? "From indexed evidence to verified receipt" : "From task to production"}</h2><p>One outcome, reconstructed across the software delivery lifecycle.</p></div><div class="legend"><span><i class="legend-active"></i>active</span><span><i class="legend-wait"></i>wait</span></div></div>
    <div class="stages">${stageCards}</div>
  </section>
  <section class="insights">
    <article class="panel"><div class="panel-title compact"><div><span>02 · TOKEN USAGE</span><h2>Model consumption</h2></div><strong class="big-number">${number(data.summary.tokenTotal)}</strong></div><div class="token-grid"><div><small>Input</small><strong>${number(data.summary.tokenInput)}</strong></div><div><small>Output</small><strong>${number(data.summary.tokenOutput)}</strong></div><div><small>Cached</small><strong>${number(data.summary.tokenCached)}</strong></div><div><small>Calls</small><strong>${data.summary.modelCalls}</strong></div></div><p class="provenance"><b>${actualLlm ? "MEASURED BY COPILOT OTEL" : "DEMO MODEL USAGE"}</b> Tokens are the comparison unit.</p></article>
    <article class="panel"><div class="panel-title compact"><div><span>03 · BOTTLENECK</span><h2>${measured ? "Where this run spent time" : "Most time was not reasoning"}</h2></div><strong class="big-number">${duration(longest.durationSeconds)}</strong></div><div class="split"><i style="width:${data.summary.activeSeconds / data.summary.elapsedSeconds * 100}%"></i><b></b></div><div class="split-label"><span><i class="legend-active"></i>Measured · ${duration(data.summary.activeSeconds)}</span><span><i class="legend-wait"></i>Unattributed · ${duration(data.summary.waitSeconds)}</span></div><div class="callout"><i>!</i><span><strong>Longest span: ${longest.action}</strong><small>${duration(longest.durationSeconds)} measured in ${longest.system}.</small></span></div></article>
  </section>
  <section class="panel waterfall-panel">
    <div class="panel-title"><div><span>04 · POSITIONED WATERFALL</span><h2>Where the measured span time went</h2><p>Bars follow the executed span order. Process startup, build and orchestration overhead are reported above but excluded here because they cannot be honestly assigned to one span.</p></div><div class="waterfall-axis">${axis.map((label) => `<span>${label}</span>`).join("")}</div></div>
    <div class="waterfall">${waterfall}</div>
    <div class="waterfall-callout"><b>${measured ? "Longest measured span" : "Largest single delay"}</b><span>${longest.action} · ${duration(longest.durationSeconds)}</span></div>
  </section>
  <section class="panel trace-panel">
    <div class="panel-title"><div><span>05 · DELIVERY TRACE</span><h2>Steps and evidence</h2><p>Every number links to an executed step and its output.</p></div><div class="trace-summary"><b>${data.steps.length}</b> spans <b>${data.lineage.length}</b> links</div></div>
    <div class="trace-head"><span>Span</span><span>Evidence artifact</span></div>
    <div class="timeline">${timeline}</div>
  </section>
  <section class="measured-output" id="measured-output">
    <div><span>06 · MEASURED OUTPUT</span><h2>${measured ? "One verified, observed change" : "One accepted production outcome"}</h2><p>Final roll-up from the same ${data.steps.length} spans above. No separate spreadsheet and no authored metrics.</p></div>
    <div class="output-grid"><article><small>Run wall time</small><strong>${duration(data.summary.elapsedSeconds)}</strong></article><article><small>Projected scale</small><strong>${scale ? `~${duration(data.summary.projectedElapsedSeconds)}` : "—"}</strong></article><article><small>Model calls / tokens</small><strong>${data.summary.modelCalls} <i>/</i> ${number(data.summary.tokenTotal)}</strong></article><article><small>Tools / retries</small><strong>${data.summary.toolCalls} <i>/</i> ${data.summary.retries}</strong></article><article><small>Outcome proof</small><strong class="good">${measured ? "Verified" : "Shipped"} · ${pct(data.summary.attributionCoverage)}</strong></article></div>
    <footer><span>${actualLlm ? "COPILOT TOKEN TELEMETRY" : "DEMO MODEL TOKENS"}</span><span>Measured time and projected scale remain separate</span></footer>
  </section>
  <footer><span>Schema v${data.schemaVersion} · ${data.summary.usageProvenance} usage</span><span>${time(data.startedAt)} → ${time(data.endedAt)} UTC</span></footer>`;
