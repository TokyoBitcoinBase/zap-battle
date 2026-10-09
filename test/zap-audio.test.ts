import assert from "node:assert/strict";
import test from "node:test";
import { createPreviewAudioChannel, playTimeUpSound, playZapSound, zapSoundSettings } from "../src/zap-audio";
import { TIME_UP_DURATION_MS, TIME_UP_ENTER_MS, TIME_UP_FADE_MS, TIME_UP_HOLD_MS } from "../src/time-up";

test("time-up leaves six full seconds between entrance and fade", () => {
  assert.equal(TIME_UP_DURATION_MS - TIME_UP_ENTER_MS - TIME_UP_FADE_MS, 6000);
  assert.equal(TIME_UP_HOLD_MS, 6000);
});
test("preview uses the actual tier audio and a separate stoppable output channel", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  let starts = 0;
  let disconnected = false;
  let context: FakeContext | undefined;
  const parameter = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  class FakeContext {
    state = "running";
    currentTime = 0;
    destination = {};
    constructor() { context = this; }
    createGain() { return { gain: parameter(), connect() {}, disconnect() { disconnected = true; } }; }
    createOscillator() { return { type: "sine", frequency: parameter(), connect() {}, start() { starts++; }, stop() {} }; }
    async resume() { /* A suspended context stays blocked in the failure test. */ }
  }
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { AudioContext: FakeContext } });
    const channel = createPreviewAudioChannel();
    assert.ok(channel);
    for (const [tier, count] of [["one", 1], ["ten", 2], ["hundred", 3], ["thousand", 5], ["tenThousand", 8]] as const) {
      starts = 0;
      assert.equal(await playZapSound(tier, channel.destination), true);
      assert.equal(starts, count);
    }
    starts = 0;
    assert.equal(await playTimeUpSound(channel.destination), true);
    assert.equal(starts, 4);
    channel.stop();
    assert.equal(disconnected, true);
    context!.state = "suspended";
    starts = 0;
    assert.equal(await playZapSound("one"), false);
    assert.equal(starts, 0);
    assert.equal(new Set(["one", "ten", "hundred", "thousand", "tenThousand"].map(tier => JSON.stringify(zapSoundSettings(tier as Parameters<typeof zapSoundSettings>[0])))).size, 5);
  } finally {
    if (context) context.state = "closed";
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
