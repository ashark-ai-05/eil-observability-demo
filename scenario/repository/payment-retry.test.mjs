import assert from "node:assert/strict";
import { shouldRetryPayment } from "./payment-retry.mjs";

assert.equal(shouldRetryPayment({ status: 503, attempts: 1 }), true);
assert.equal(shouldRetryPayment({ status: 429, attempts: 2 }), true);
assert.equal(shouldRetryPayment({ status: 400, attempts: 1 }), false);
assert.equal(shouldRetryPayment({ status: 401, attempts: 1 }), false);
assert.equal(shouldRetryPayment({ status: 503, attempts: 3 }), false);
