import assert from "node:assert/strict";
import test from "node:test";
import { playSoundEnabledCue, playSpecialZapSound, playTimeUpSound, playZapSound, primeZapSound, watchZapSoundRecovery } from "../src/zap-audio";

class FakeAudioContext extends EventTarget {
  state = "suspended";
  currentTime = 10;
  sampleRate = 48000;
  destination = {};
  resumeCalls = 0;
  starts = 0;
  resumeMode: "resolve" | "reject" | "pending" = "resolve";
  pendingResumes: (() => void)[] = [];
  nodes: { disconnected: boolean }[] = [];
  sources: { onended?: () => void }[] = [];
  async resume() {
    this.resumeCalls++;
    if (this.resumeMode === "reject") throw new Error("Playback blocked");
    if (this.resumeMode === "pending") await new Promise<void>(resolve => this.pendingResumes.push(resolve));
    this.state = "running";
  }
  parameter() { return { setValueAtTime() {}, exponentialRampToValueAtTime() {} }; }
  node() {
    const node = { disconnected: false, connect() {}, disconnect() { node.disconnected = true; } };
    this.nodes.push(node);
    return node;
  }
  createGain() { return { ...this.node(), gain: this.parameter() }; }
  createOscillator() {
    const source: ReturnType<FakeAudioContext["node"]> & { type: string; frequency: ReturnType<FakeAudioContext["parameter"]>; onended?: () => void; start(): void; stop(): void } = {
      ...this.node(), type: "sine", frequency: this.parameter(), start: () => { this.starts++; }, stop() {}
    };
    this.sources.push(source);
    return source;
  }
  createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
  createBufferSource() {
    const source = { ...this.node(), buffer: null, onended: undefined as (() => void) | undefined, start: () => { this.starts++; }, stop() {} };
    this.sources.push(source);
    return source;
  }
  createBiquadFilter() { return { ...this.node(), type: "lowpass", frequency: this.parameter() }; }
}

function installBrowser() {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  let context: FakeAudioContext | undefined;
  class Context extends FakeAudioContext { constructor() { super(); context = this; } }
  const browser = Object.assign(new EventTarget(), { AudioContext: Context, matchMedia: () => ({ matches: false }) });
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  return {
    browser, document,
    get context(): FakeAudioContext { assert.ok(context); return context; },
    restore() {
      if (context) context.state = "closed";
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      else Reflect.deleteProperty(globalThis, "window");
      if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
      else Reflect.deleteProperty(globalThis, "document");
    }
  };
}

test("every effect resumes Safari's interrupted context before scheduling sound", async () => {
  const fixture = installBrowser();
  try {
    assert.equal(await primeZapSound(), true);
    for (const play of [() => playZapSound("one"), () => playTimeUpSound(), () => playSpecialZapSound(100_000)]) {
      fixture.context.state = "interrupted";
      const resumesBefore = fixture.context.resumeCalls;
      const startsBefore = fixture.context.starts;
      assert.equal(await play(), true);
      assert.equal(fixture.context.resumeCalls, resumesBefore + 1);
      assert.ok(fixture.context.starts > startsBefore);
    }
    fixture.context.state = "interrupted";
    fixture.context.resumeMode = "reject";
    const startsBefore = fixture.context.starts;
    assert.equal(await playTimeUpSound(), false);
    assert.equal(fixture.context.starts, startsBefore);
  } finally { fixture.restore(); }
});

test("foreground and input recovery are silent, shared between panels and removed on mute", async () => {
  const fixture = installBrowser();
  const stopDisplay = watchZapSoundRecovery();
  const stopPreview = watchZapSoundRecovery();
  try {
    assert.equal(fixture.context.resumeCalls, 1);
    assert.equal(fixture.context.starts, 0);
    fixture.context.state = "interrupted";
    fixture.document.visibilityState = "hidden";
    fixture.document.dispatchEvent(new Event("visibilitychange"));
    assert.equal(fixture.context.resumeCalls, 1);
    fixture.document.visibilityState = "visible";
    fixture.document.dispatchEvent(new Event("visibilitychange"));
    assert.equal(fixture.context.resumeCalls, 2);
    for (const [target, event] of [
      [fixture.browser, "focus"], [fixture.browser, "pageshow"],
      [fixture.document, "pointerdown"], [fixture.document, "touchend"],
      [fixture.document, "click"], [fixture.document, "keydown"],
      [fixture.context, "statechange"]
    ] as const) {
      fixture.context.state = "interrupted";
      const before: number = fixture.context.resumeCalls;
      target.dispatchEvent(new Event(event));
      assert.equal(fixture.context.resumeCalls, before + 1, event);
    }
    stopDisplay();
    fixture.context.state = "interrupted";
    const before = fixture.context.resumeCalls;
    fixture.document.dispatchEvent(new Event("click"));
    assert.equal(fixture.context.resumeCalls, before + 1, "Preview still owns recovery");
    stopPreview();
    stopPreview();
    fixture.context.state = "interrupted";
    for (const event of ["click", "pointerdown", "touchend", "keydown", "visibilitychange"]) fixture.document.dispatchEvent(new Event(event));
    fixture.browser.dispatchEvent(new Event("focus"));
    fixture.context.dispatchEvent(new Event("statechange"));
    assert.equal(fixture.context.resumeCalls, before + 1, "No recovery after final subscriber stops");
    assert.equal(fixture.context.starts, 0, "Recovery must never play a cue or missed Zap");
  } finally { stopDisplay(); stopPreview(); fixture.restore(); }
});

test("a blocked resume cannot replay an expired effect after later activation", async () => {
  const fixture = installBrowser();
  try {
    assert.equal(await primeZapSound(), true);
    fixture.context.state = "suspended";
    fixture.context.resumeMode = "pending";
    assert.equal(await playZapSound("one"), false);
    assert.equal(fixture.context.starts, 0);
    fixture.context.pendingResumes.forEach(resolve => resolve());
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(fixture.context.starts, 0, "Old playback continuation has expired");
    fixture.context.resumeMode = "resolve";
    assert.equal(await playZapSound("one"), true);
    assert.equal(fixture.context.starts, 1);
  } finally { fixture.restore(); }
});

test("a gesture retries resume even while automatic activation is pending", async () => {
  const fixture = installBrowser();
  let stop = () => {};
  try {
    assert.equal(await primeZapSound(), true);
    fixture.context.state = "interrupted";
    fixture.context.resumeMode = "pending";
    stop = watchZapSoundRecovery();
    const before = fixture.context.resumeCalls;
    fixture.context.resumeMode = "resolve";
    fixture.document.dispatchEvent(new Event("click"));
    assert.equal(fixture.context.resumeCalls, before + 1);
    assert.equal(fixture.context.state, "running");
    fixture.context.pendingResumes.forEach(resolve => resolve());
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(fixture.context.starts, 0);
  } finally { stop(); fixture.restore(); }
});

test("completed ordinary effects release every oscillator, gain and output over a long event", async () => {
  const fixture = installBrowser();
  try {
    for (let index = 0; index < 100; index++) {
      assert.equal(await playZapSound(index % 2 ? "one" : "tenThousand"), true);
      assert.equal(await playTimeUpSound(), true);
      playSoundEnabledCue();
      fixture.context.sources.splice(0).forEach(source => source.onended?.());
      assert.ok(fixture.context.nodes.every(node => node.disconnected), "Completed graphs must disconnect");
      fixture.context.nodes = [];
    }
  } finally { fixture.restore(); }
});
