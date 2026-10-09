import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSession } from "../src/session-validation";
import { SPECIAL_ZAP_HOLD_MS, SPECIAL_ZAP_FADE_MS, isSpecialZap, normalizeSpecialZapThreshold, specialZapDigits, specialZapDurationMs, specialZapRevealMs } from "../src/special-zap";

test("special Zap threshold is inclusive and checks an individual amount", () => {
  assert.equal(isSpecialZap(99_999, 100_000), false);
  assert.equal(isSpecialZap(100_000, 100_000), true);
  assert.equal(isSpecialZap(123_456, 100_000), true);
  assert.equal(isSpecialZap(100_000, null), false);
  assert.equal(isSpecialZap(undefined, 100_000), false);
});
test("threshold saves and explicit disable survives session normalization", () => {
  assert.equal(normalizeSession({ specialZapThresholdSats: 500_000 }, "test").specialZapThresholdSats, 500_000);
  assert.equal(normalizeSession({ specialZapThresholdSats: null }, "test").specialZapThresholdSats, null);
  for (const value of [undefined, -1, 0, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, "100000"]) assert.equal(normalizeSpecialZapThreshold(value), 100_000);
});
test("digits settle from units to the highest place and end at the exact amount", () => {
  assert.deepEqual(specialZapDigits(123456, 700).map(d => d.settled), [false, false, false, false, false, true]);
  assert.deepEqual(specialZapDigits(123456, 880).map(d => d.settled), [false, false, false, false, true, true]);
  for (const amount of [1, 100000, 123456, Number.MAX_SAFE_INTEGER]) {
    const digits = specialZapDigits(amount, specialZapRevealMs(amount));
    assert.equal(digits.map(d => d.digit).join(""), String(amount));
    assert.equal(digits.every(d => d.settled), true);
    assert.equal(specialZapDurationMs(amount) - specialZapRevealMs(amount), SPECIAL_ZAP_HOLD_MS + SPECIAL_ZAP_FADE_MS);
    assert.equal(SPECIAL_ZAP_HOLD_MS, 6000);
    assert.equal(SPECIAL_ZAP_FADE_MS, 800);
  }
});

import { zapCelebrationTier } from "../src/zap-celebration";
test("existing celebration tiers keep the same inclusive boundaries", () => {
  for (const [amount, tier] of [[1, "one"], [9, "one"], [10, "ten"], [99, "ten"], [100, "hundred"], [999, "hundred"], [1000, "thousand"], [9999, "thousand"], [10000, "tenThousand"]] as const) assert.equal(zapCelebrationTier(amount), tier);
});
