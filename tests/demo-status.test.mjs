import assert from "node:assert/strict";
import { test } from "node:test";
import { describeSource } from "../scripts/demo-status.mjs";

test("a present lifecycle record is what the cockpit will show", () => {
  const status = describeSource({ lifecycleRecordExists: true, lifecycleMode: "measured" });

  assert.equal(status.source, ".demo/lifecycle/run.json");
  assert.equal(status.kind, "measured");
});

test("a missing lifecycle record silently falls back to the fixture", () => {
  const status = describeSource({ lifecycleRecordExists: false });

  // `pnpm demo:reset` deletes .demo, which takes the measured run record with
  // it. The cockpit then serves the scenario fixture with no error and no
  // visible difference -- so a presenter can be showing fixture data while
  // telling the room it was measured.
  assert.equal(status.source, "scenario/delivery-lifecycle.json");
  assert.equal(status.kind, "fixture");
  assert.match(status.remedy, /pnpm lifecycle/);
});

test("the fixture case is flagged as needing action, the measured case is not", () => {
  assert.equal(describeSource({ lifecycleRecordExists: false }).actionNeeded, true);
  assert.equal(
    describeSource({ lifecycleRecordExists: true, lifecycleMode: "measured" }).actionNeeded,
    false,
  );
});

test("a lifecycle record that is itself simulated is reported as such", () => {
  const status = describeSource({ lifecycleRecordExists: true, lifecycleMode: "simulated" });

  // Present but simulated is a third state: the file exists, so the fallback
  // warning would not fire, but the numbers are still not measured.
  assert.equal(status.kind, "simulated");
  assert.equal(status.actionNeeded, true);
});
