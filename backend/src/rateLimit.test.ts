import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDailyQuota, createPerMinuteLimiter } from "./rateLimit.ts";

describe("createPerMinuteLimiter", () => {
  it("allows up to the limit per key within a minute, then reports when to retry", () => {
    const limiter = createPerMinuteLimiter(2);
    assert.deepEqual(limiter.check("a", 0), { ok: true });
    assert.deepEqual(limiter.check("a", 1_000), { ok: true });
    assert.deepEqual(limiter.check("a", 15_000), { ok: false, retryAfterSeconds: 45 });
    assert.deepEqual(limiter.check("b", 15_000), { ok: true });
  });

  it("starts a new window after a minute", () => {
    const limiter = createPerMinuteLimiter(1);
    limiter.check("a", 0);
    assert.equal(limiter.check("a", 59_999).ok, false);
    assert.equal(limiter.check("a", 60_000).ok, true);
  });
});

describe("createDailyQuota", () => {
  it("allows up to the limit per day and resets the next day", () => {
    const quota = createDailyQuota(2);
    const day1 = new Date(2026, 9, 27, 10).getTime();
    const day2 = new Date(2026, 9, 28, 10).getTime();
    assert.equal(quota.take(day1), true);
    assert.equal(quota.take(day1), true);
    assert.equal(quota.take(day1), false);
    assert.equal(quota.take(day2), true);
  });
});
