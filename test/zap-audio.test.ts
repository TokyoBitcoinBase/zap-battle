import assert from "node:assert/strict";
import test from "node:test";
import { createPreviewAudioChannel, playSpecialZapSound, playTimeUpSound, playZapSound, zapSoundSettings } from "../src/zap-audio";
import { SPECIAL_ZAP_ROLL_STEP_MS, specialZapRevealMs } from "../src/special-zap";
import { TIME_UP_DURATION_MS, TIME_UP_ENTER_MS, TIME_UP_FADE_MS, TIME_UP_HOLD_MS } from "../src/time-up";

test("time-up leaves six full seconds between entrance and fade", () => {
  assert.equal(TIME_UP_DURATION_MS - TIME_UP_ENTER_MS - TIME_UP_FADE_MS, 6000);
  assert.equal(TIME_UP_HOLD_MS, 6000);
});

test("special audio rolls with the digits and reserves its impact for the final lock", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  type Tone = { type: string; frequency: number; start: number; end: number };
  const tones: Tone[] = [];
  const crashes: number[] = [];
  let reducedMotion = false;
  let context: FakeContext | undefined;
  let disconnected = false;
  const parameter = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  class FakeContext {
    state = "running";
    currentTime = 12.5;
    sampleRate = 48000;
    destination = {};
    constructor() { context = this; }
    createGain() { return { gain: parameter(), connect() {}, disconnect() { disconnected = true; } }; }
    createOscillator() {
      const tone = { type: "sine", frequency: 0, start: -1, end: -1 };
      const oscillator = {
        type: "sine",
        frequency: { setValueAtTime(value: number) { tone.frequency = value; }, exponentialRampToValueAtTime() {} },
        connect() {}, disconnect() {},
        start(time: number) { tone.type = oscillator.type; tone.start = time; tones.push(tone); },
        stop(time: number) { tone.end = time; }
      };
      return oscillator;
    }
    createBuffer(_channels: number, length: number) { return { getChannelData() { return new Float32Array(length); } }; }
    createBufferSource() { return { buffer: null, connect() {}, disconnect() {}, start(time: number) { crashes.push(time); }, stop() {} }; }
    createBiquadFilter() { return { type: "lowpass", frequency: parameter(), connect() {}, disconnect() {} }; }
    async resume() {}
  }
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      AudioContext: FakeContext, matchMedia: () => ({ matches: reducedMotion })
    } });
    const channel = createPreviewAudioChannel();
    assert.ok(channel);
    for (const amount of [1, 100_000, Number.MAX_SAFE_INTEGER]) {
      tones.length = 0;
      crashes.length = 0;
      assert.equal(await playSpecialZapSound(amount, channel.destination), true);
      const now = context!.currentTime;
      const impactAt = now + specialZapRevealMs(amount) / 1000;
      assert.deepEqual(crashes, [impactAt]);
      const rolling = tones.filter(tone => tone.type === "square");
      assert.equal(rolling[0].start, now);
      assert.ok(Math.abs(rolling[1].start - rolling[0].start - SPECIAL_ZAP_ROLL_STEP_MS / 1000) < 1e-10);
      assert.ok(rolling.every(tone => tone.start < impactAt && tone.end <= impactAt));
      assert.ok(tones.filter(tone => tone.frequency < 200).every(tone => tone.start === impactAt));
      assert.ok(tones.some(tone => tone.start === impactAt && tone.end > impactAt + 1.5));
    }
    reducedMotion = true;
    tones.length = 0;
    crashes.length = 0;
    assert.equal(await playSpecialZapSound(100_000, channel.destination), true);
    assert.deepEqual(crashes, [context!.currentTime]);
    assert.equal(tones.some(tone => tone.type === "square"), false);
    assert.ok(tones.every(tone => tone.start >= context!.currentTime));
    channel.stop();
    assert.equal(disconnected, true);
    context!.state = "suspended";
    tones.length = 0;
    crashes.length = 0;
    assert.equal(await playSpecialZapSound(100_000), false);
    assert.equal(tones.length + crashes.length, 0);
  } finally {
    if (context) context.state = "closed";
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
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
