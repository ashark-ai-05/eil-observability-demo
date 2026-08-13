const data = await fetch("/api/run").then((response) => {
  if (!response.ok) throw new Error(`Run unavailable (${response.status})`);
  return response.json();
});

const money = (value) => value === null ? "unknown" : `$${value.toFixed(2)}`;
const number = (value) => new Intl.NumberFormat("en-US").format(value);
const duration = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}m ${String(remainder).padStart(2, "0")}s` : `${remainder}s`;
};
const time = (value) => new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value));
const pct = (value) => `${Math.round(value * 100)}%`;
const icons = { understand: "⌕", plan: "◇", implement: "⌘", verify: "✓", release: "↑" };
const artifactIcons = { ticket: "J", requirement: "C", code: "{ }", criteria: "AC", diff: "±", test: "T", commit: "G", build: "B", deployment: "D", approval: "A" };
const total = data.summary.elapsedSeconds;
const flow = data.steps.map((step) => `<div class="flow-node" data-stage="${step.stage}"><i>${step.order}</i><span><small>${step.system}</small><strong>${step.action}</strong></span></div>`).join("");
let elapsedCursor = 0;
const waterfall = data.steps.map((step) => {
  const left = elapsedCursor / total * 100;
  const width = step.durationSeconds / total * 100;
  const activeWidth = step.activeSeconds / step.durationSeconds * 100;
  elapsedCursor += step.durationSeconds;
  return `<div class="waterfall-row"><span class="waterfall-label"><i>${step.order}</i><b>${step.action}</b></span><div class="waterfall-track"><div class="waterfall-span" style="left:${left}%;width:${width}%"><i style="width:${activeWidth}%"></i><b></b></div></div><strong>${duration(step.durationSeconds)}</strong></div>`;
}).join("");

const stageCards = data.stages.map((stage, index) => `
  <article class="stage-card stage-${stage.name}">
    <div class="stage-head"><span>${String(index + 1).padStart(2, "0")}</span><i>${icons[stage.name]}</i></div>
    <h3>${stage.name}</h3>
    <strong>${duration(stage.durationSeconds)}</strong>
    <small>${stage.steps} ${stage.steps === 1 ? "step" : "steps"} · ${money(stage.costUsd)}</small>
    <div class="stage-bar"><i style="width:${stage.durationSeconds / total * 100}%"></i></div>
  </article>`).join("");

const timeline = data.steps.map((step) => {
  const waitShare = step.waitSeconds / step.durationSeconds * 100;
  return `
    <article class="trace-step" data-stage="${step.stage}">
      <div class="trace-marker"><span>${step.order}</span></div>
      <div class="trace-main">
        <div class="trace-title"><span class="system">${step.system}</span><span class="clock">${time(step.startedAt)} → ${time(step.endedAt)}</span></div>
        <h3>${step.action}</h3>
        <p>${step.detail}</p>
        <div class="duration-bar"><i class="active" style="width:${100 - waitShare}%"></i><i class="wait" style="width:${waitShare}%"></i></div>
        <div class="trace-facts">
          <span><b>${duration(step.durationSeconds)}</b> elapsed</span>
          <span><b>${duration(step.activeSeconds)}</b> active</span>
          <span><b>${duration(step.waitSeconds)}</b> wait</span>
          <span><b>${number(step.tokens.total)}</b> tokens</span>
          <span><b>${step.toolCalls}</b> tools</span>
          <span><b>${money(step.costUsd)}</b> est.</span>
        </div>
      </div>
      <div class="artifact"><i>${artifactIcons[step.artifact.type] ?? "•"}</i><span><small>${step.artifact.type}</small><strong>${step.artifact.label}</strong><code>${step.artifact.ref}</code></span></div>
    </article>`;
}).join("");

const costRows = [
  ["Model inference", data.summary.modelCostUsd, "tokens · versioned pricebook"],
  ["CI + deployment", data.summary.infraCostUsd, "compute-min · environment"],
].map(([label, value, note]) => `<div class="cost-row"><span><strong>${label}</strong><small>${note}</small></span><b>${money(value)}</b><i style="width:${value === null || data.summary.totalCostUsd === null ? 0 : value / data.summary.totalCostUsd * 100}%"></i></div>`).join("");

document.querySelector("#app").innerHTML = `
  <nav>
    <a class="brand" href="#top"><i>DI</i><span>Delivery Intelligence<small>Agent observability command center</small></span></a>
    <div class="nav-meta"><span class="live-dot"></span> Trace reconstructed <b class="simulation">SIMULATED DATA</b></div>
  </nav>
  <header id="top">
    <div class="crumb">PAYMENTS PLATFORM <span>/</span> ${data.task.id} <span>/</span> DELIVERY RUN 01</div>
    <div class="title-row"><div><h1>${data.task.title}</h1><p>${data.task.service} · ${data.task.repository} · Correlation ${data.correlationId}</p></div><div class="outcome"><i>✓</i><span><small>Outcome</small><strong>Released to ${data.task.environment}</strong></span></div></div>
  </header>
  <section class="notice"><b>Simulation</b><span>This journey demonstrates the intended experience. Jira, Confluence, Bamboo and deployment events below are representative fixtures, not live corporate telemetry.</span><code>${data.runId}</code></section>
  <section class="flow"><div class="flow-line"></div>${flow}</section>
  <section class="kpis">
    <article><span>Lead time</span><strong>${duration(data.summary.elapsedSeconds)}</strong><small>intake → production</small></article>
    <article><span>Active work</span><strong>${duration(data.summary.activeSeconds)}</strong><small>${pct(data.summary.activeSeconds / data.summary.elapsedSeconds)} of elapsed</small></article>
    <article><span>Waiting</span><strong>${duration(data.summary.waitSeconds)}</strong><small>${pct(data.summary.waitSeconds / data.summary.elapsedSeconds)} queue + human + compute</small></article>
    <article><span>Estimated cost</span><strong>${money(data.summary.totalCostUsd)}</strong><small>${data.pricing.version}</small></article>
    <article><span>Verified shipping</span><strong class="good">${data.summary.verifiedShipping ? "Proven" : "Unproven"}</strong><small>${pct(data.summary.attributionCoverage)} lineage coverage</small></article>
  </section>
  <section class="panel journey-panel">
    <div class="panel-title"><div><span>01 · EXECUTIVE VIEW</span><h2>From task to production</h2><p>One outcome, reconstructed across the software delivery lifecycle.</p></div><div class="legend"><span><i class="legend-active"></i>active</span><span><i class="legend-wait"></i>wait</span></div></div>
    <div class="stages">${stageCards}</div>
  </section>
  <section class="insights">
    <article class="panel"><div class="panel-title compact"><div><span>02 · VALUE & COST</span><h2>What the outcome consumed</h2></div><strong class="big-number">${money(data.summary.totalCostUsd)}</strong></div>${costRows}<div class="mini-grid"><div><small>Tokens</small><strong>${number(data.summary.tokenTotal)}</strong><span>${number(data.summary.tokenCached)} cached</span></div><div><small>Tool calls</small><strong>${data.summary.toolCalls}</strong><span>${data.summary.retries} retries</span></div><div><small>Accepted outcomes</small><strong>1</strong><span>${money(data.summary.totalCostUsd)} / outcome</span></div></div><p class="provenance"><b>ESTIMATED</b> Provider usage × ${data.pricing.version}; not a billing record.</p></article>
    <article class="panel"><div class="panel-title compact"><div><span>03 · BOTTLENECK</span><h2>Most time was not reasoning</h2></div><strong class="big-number">${pct(data.summary.waitSeconds / data.summary.elapsedSeconds)}</strong></div><div class="split"><i style="width:${data.summary.activeSeconds / data.summary.elapsedSeconds * 100}%"></i><b></b></div><div class="split-label"><span><i class="legend-active"></i>Active · ${duration(data.summary.activeSeconds)}</span><span><i class="legend-wait"></i>Wait · ${duration(data.summary.waitSeconds)}</span></div><div class="callout"><i>!</i><span><strong>Largest delay: production approval</strong><small>11m 25s of the 12m approval span was human wait.</small></span></div></article>
  </section>
  <section class="panel waterfall-panel">
    <div class="panel-title"><div><span>04 · POSITIONED WATERFALL</span><h2>Where the delivery time went</h2><p>Each bar begins where the span happened. Mint is active work; slate is queue, compute or human wait.</p></div><div class="waterfall-axis"><span>09:00</span><span>09:13</span><span>09:26</span><span>09:39</span><span>09:52</span></div></div>
    <div class="waterfall">${waterfall}</div>
    <div class="waterfall-callout"><b>Largest single delay</b><span>Production approval · 11m 25s of the 12m span was human wait</span></div>
  </section>
  <section class="panel trace-panel">
    <div class="panel-title"><div><span>05 · DEVELOPER VIEW</span><h2>Trace, evidence and resource ledger</h2><p>Every number resolves to one simulated span and one artifact.</p></div><div class="trace-summary"><b>${data.steps.length}</b> spans <b>${data.lineage.length}</b> causal links</div></div>
    <div class="trace-head"><span>Span</span><span>Evidence artifact</span></div>
    <div class="timeline">${timeline}</div>
  </section>
  <section class="measured-output" id="measured-output">
    <div><span>06 · MEASURED OUTPUT</span><h2>One accepted production outcome</h2><p>Final roll-up from the same 11 spans above. No separate spreadsheet and no hidden denominator.</p></div>
    <div class="output-grid"><article><small>Elapsed</small><strong>${duration(data.summary.elapsedSeconds)}</strong></article><article><small>Active / wait</small><strong>${duration(data.summary.activeSeconds)} <i>/</i> ${duration(data.summary.waitSeconds)}</strong></article><article><small>Tokens</small><strong>${number(data.summary.tokenTotal)}</strong></article><article><small>Tools / retries</small><strong>${data.summary.toolCalls} <i>/</i> ${data.summary.retries}</strong></article><article><small>Total estimated cost</small><strong>${money(data.summary.totalCostUsd)}</strong></article><article><small>Outcome proof</small><strong class="good">Shipped · ${pct(data.summary.attributionCoverage)}</strong></article></div>
    <footer><span>${data.pricing.version} · ESTIMATED COST</span><span>Every value resolves to the simulated trace</span></footer>
  </section>
  <footer><span>Schema v${data.schemaVersion} · ${data.pricing.provenance} cost · simulation</span><span>${time(data.startedAt)} → ${time(data.endedAt)} UTC</span></footer>`;
