import assert from "node:assert/strict";
import { test } from "node:test";
import { lifecyclePlan, provenanceLedger } from "../scripts/lifecycle-plan.mjs";

const bothRepos = { eilRepo: "/somewhere/eil", observabilityRepo: "/somewhere/obs" };

test("every act declares whether it runs real code or replays a fixture", () => {
  for (const act of lifecyclePlan(bothRepos)) {
    assert.ok(["real", "simulated"].includes(act.kind), `${act.id} has kind ${act.kind}`);
  }
});

test("the acts that need a product checkout are unavailable without one", () => {
  const plan = lifecyclePlan({ eilRepo: null, observabilityRepo: null });

  const knowledge = plan.find((act) => act.id === "knowledge-plane");
  assert.equal(knowledge.available, false);
  assert.match(knowledge.skipReason, /EIL_REPO/);
});

test("the simulated delivery act needs no checkout and always runs", () => {
  const plan = lifecyclePlan({ eilRepo: null, observabilityRepo: null });

  const delivery = plan.find((act) => act.id === "delivery-journey");
  assert.equal(delivery.available, true);
  assert.equal(delivery.kind, "simulated");
});

test("the ledger counts only acts that actually ran as real", () => {
  const plan = lifecyclePlan({ eilRepo: null, observabilityRepo: null });
  // Nothing executed, so nothing may be claimed.
  const ledger = provenanceLedger(plan, new Set());

  assert.equal(ledger.realRan, 0);
});

test("an act that was available but skipped is never counted as real", () => {
  const plan = lifecyclePlan(bothRepos);
  const ran = new Set(["delivery-journey"]);

  const ledger = provenanceLedger(plan, ran);

  // The failure this guards: a summary that reports "4 real phases" because
  // four were planned, when the operator skipped three of them.
  assert.equal(ledger.realRan, 0);
  assert.equal(ledger.simulatedRan, 1);
});

test("the ledger reports real acts that did run", () => {
  const plan = lifecyclePlan(bothRepos);
  const realIds = plan.filter((act) => act.kind === "real").map((act) => act.id);

  const ledger = provenanceLedger(plan, new Set(realIds));

  assert.equal(ledger.realRan, realIds.length);
  assert.ok(ledger.realRan >= 3, "the lifecycle should have at least three real acts");
});
