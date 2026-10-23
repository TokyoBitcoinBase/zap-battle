import { DEFAULT_ZAP_CELEBRATION_TIER, type ZapCelebrationTier } from "@/src/zap-celebration";
import { SPECIAL_ZAP_FIRST_LOCK_MS, SPECIAL_ZAP_LOCK_STEP_MS, SPECIAL_ZAP_ROLL_STEP_MS, specialZapRevealMs } from "@/src/special-zap";

// Schedule both phases on the audio clock, using the same timing as the digits.
export async function playSpecialZapSound(amount: number, destination?: AudioNode) {
  const context = getAudioContext();
  if (!context || !await resumeAudioContext(context)) return false;
  const now = context.currentTime;
  const revealMs = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : specialZapRevealMs(amount);
  const impactAt = now + revealMs / 1000;
  const output = context.createGain();
  output.gain.setValueAtTime(0.5, now);
  output.connect(destination ?? context.destination);

  for (let elapsed = 0; elapsed < revealMs; elapsed += SPECIAL_ZAP_ROLL_STEP_MS) {
    const progress = elapsed / revealMs;
    const frequency = [880, 1175, 1047, 1397][Math.floor(elapsed / SPECIAL_ZAP_ROLL_STEP_MS) % 4] * (1 + progress * 0.35);
    specialZapTone(context, output, "square", frequency, now + elapsed / 1000, Math.min(0.028, (revealMs - elapsed) / 1000), 0.08 + progress * 0.04);
  }
  // Give each locked place a distinct metallic click, leaving the last to the impact.
  for (let elapsed = SPECIAL_ZAP_FIRST_LOCK_MS; elapsed < revealMs; elapsed += SPECIAL_ZAP_LOCK_STEP_MS) {
    specialZapTone(context, output, "triangle", 1800, now + elapsed / 1000, 0.07, 0.18, 900);
  }

  specialZapTone(context, output, "sine", 150, impactAt, 0.85, 0.65, 42);
  specialZapTone(context, output, "triangle", 72, impactAt, 1.1, 0.25, 36);
  // A simultaneous chord and a bright trailing shimmer, distinct from the tier arpeggio.
  [293.66, 440, 587.33, 739.99, 880].forEach(frequency => {
    specialZapTone(context, output, "triangle", frequency, impactAt, 1.8, 0.12);
  });
  [1174.66, 1479.98, 1760].forEach((frequency, index) => {
    specialZapTone(context, output, "sine", frequency, impactAt + 0.1 + index * 0.1, 1.25, 0.065);
  });

  const crash = context.createBufferSource();
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.8), context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
  crash.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(6000, impactAt);
  filter.frequency.exponentialRampToValueAtTime(500, impactAt + 0.75);
  const crashGain = context.createGain();
  crashGain.gain.setValueAtTime(0.0001, impactAt);
  crashGain.gain.exponentialRampToValueAtTime(0.26, impactAt + 0.008);
  crashGain.gain.exponentialRampToValueAtTime(0.0001, impactAt + 0.8);
  crash.connect(filter);
  filter.connect(crashGain);
  crashGain.connect(output);
  crash.start(impactAt);
  crash.stop(impactAt + 0.8);
  crash.onended = () => { crash.disconnect(); filter.disconnect(); crashGain.disconnect(); };
  return true;
}

function specialZapTone(context: AudioContext, output: AudioNode, wave: OscillatorType, frequency: number, startAt: number, duration: number, volume: number, endFrequency?: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startAt + duration * 0.8);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + Math.min(0.012, duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain);
  gain.connect(output);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}

export async function playZapSound(tierName: ZapCelebrationTier = DEFAULT_ZAP_CELEBRATION_TIER, destination?: AudioNode) {
  const context = getAudioContext();
  if (!context || !await resumeAudioContext(context)) return false;
  const now = context.currentTime;
  const output = context.createGain();
  const tierSettings = zapSoundSettings(tierName);
  const releaseVoice = releaseSoundOutput(output, tierSettings.notes.length + (tierName === "tenThousand" ? 1 : 0));
  output.gain.setValueAtTime(0.0001, now);
  output.gain.exponentialRampToValueAtTime(tierSettings.volume, now + 0.02);
  output.gain.exponentialRampToValueAtTime(0.0001, now + tierSettings.tail);
  output.connect(destination ?? context.destination);

  tierSettings.notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startAt = now + index * tierSettings.spacing;
    oscillator.type = tierSettings.wave;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    if (tierName === "thousand" || tierName === "tenThousand") {
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.08, startAt + tierSettings.noteLength * 0.55);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(tierSettings.noteGain, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + tierSettings.noteLength);
    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start(startAt);
    oscillator.stop(startAt + tierSettings.noteLength + 0.04);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); releaseVoice(); };
  });

  if (tierName === "tenThousand") {
    const bass = context.createOscillator();
    const bassGain = context.createGain();
    bass.type = "sawtooth";
    bass.frequency.setValueAtTime(92, now);
    bass.frequency.exponentialRampToValueAtTime(46, now + 0.42);
    bassGain.gain.setValueAtTime(0.0001, now);
    bassGain.gain.exponentialRampToValueAtTime(0.2, now + 0.025);
    bassGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
    bass.connect(bassGain);
    bassGain.connect(output);
    bass.start(now);
    bass.stop(now + 0.52);
    bass.onended = () => { bass.disconnect(); bassGain.disconnect(); releaseVoice(); };
  }
  return true;
}

export function zapSoundSettings(tierName: ZapCelebrationTier): {
  noteGain: number;
  noteLength: number;
  notes: number[];
  spacing: number;
  tail: number;
  volume: number;
  wave: OscillatorType;
} {
  if (tierName === "one") {
    return { noteGain: 0.09, noteLength: 0.12, notes: [660], spacing: 0.05, tail: 0.22, volume: 0.14, wave: "sine" };
  }
  if (tierName === "ten") {
    return { noteGain: 0.12, noteLength: 0.16, notes: [587, 880], spacing: 0.07, tail: 0.34, volume: 0.18, wave: "triangle" };
  }
  if (tierName === "hundred") {
    return { noteGain: 0.16, noteLength: 0.22, notes: [520, 784, 1046], spacing: 0.055, tail: 0.42, volume: 0.24, wave: "square" };
  }
  if (tierName === "thousand") {
    return { noteGain: 0.18, noteLength: 0.28, notes: [392, 588, 784, 1176, 1568], spacing: 0.055, tail: 0.68, volume: 0.28, wave: "sawtooth" };
  }
  return { noteGain: 0.2, noteLength: 0.34, notes: [262, 392, 523, 784, 1046, 1568, 2093], spacing: 0.045, tail: 0.92, volume: 0.32, wave: "sawtooth" };
}

export async function playTimeUpSound(destination?: AudioNode) {
  const context = getAudioContext();
  if (!context || !await resumeAudioContext(context)) return false;
  const now = context.currentTime;
  const output = context.createGain();
  const releaseVoice = releaseSoundOutput(output, 4);
  output.gain.setValueAtTime(0.0001, now);
  output.gain.exponentialRampToValueAtTime(0.28, now + 0.03);
  output.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
  output.connect(destination ?? context.destination);

  [880, 660, 440, 220].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startAt = now + index * 0.12;
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.14, startAt + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.16);
    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.18);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); releaseVoice(); };
  });
  return true;
}

export async function primeZapSound() {
  const context = getAudioContext();
  return context ? resumeAudioContext(context) : false;
}

async function resumeAudioContext(context: AudioContext): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    // Safari can report "interrupted" as well as "suspended". Call resume
    // synchronously so a click/tap can grant playback permission even if an
    // earlier, automatic resume is still waiting for user activation.
    if (context.state !== "running" && context.state !== "closed") {
      await Promise.race([
        context.resume(),
        new Promise<void>(resolve => { timeout = setTimeout(resolve, 500); })
      ]);
    }
    return context.state === "running";
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function playSoundEnabledCue() {
  const context = getAudioContext();
  if (!context || context.state !== "running") return;
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(660, now);
  oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.12);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.2);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}

let sharedAudioContext: AudioContext | null = null;
let soundRecoveryUsers = 0;
const AUDIO_INPUT_EVENTS = ["pointerdown", "touchend", "click", "keydown"] as const;

function recoverZapSound() {
  if (soundRecoveryUsers === 0 || document.visibilityState === "hidden") return;
  void primeZapSound();
}

// Display and admin previews share one context and one set of recovery listeners.
// Recovery primes the context silently; it never replays a missed effect.
export function watchZapSoundRecovery(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  if (++soundRecoveryUsers === 1) {
    AUDIO_INPUT_EVENTS.forEach(event => document.addEventListener(event, recoverZapSound, { capture: true, passive: true }));
    document.addEventListener("visibilitychange", recoverZapSound);
    window.addEventListener("focus", recoverZapSound);
    window.addEventListener("pageshow", recoverZapSound);
    recoverZapSound();
  }
  let watching = true;
  return () => {
    if (!watching) return;
    watching = false;
    if (--soundRecoveryUsers !== 0) return;
    AUDIO_INPUT_EVENTS.forEach(event => document.removeEventListener(event, recoverZapSound, true));
    document.removeEventListener("visibilitychange", recoverZapSound);
    window.removeEventListener("focus", recoverZapSound);
    window.removeEventListener("pageshow", recoverZapSound);
  };
}

function releaseSoundOutput(output: AudioNode, voices: number) {
  return () => { if (--voices === 0) output.disconnect(); };
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    try {
      sharedAudioContext = new AudioContextClass();
      sharedAudioContext.addEventListener?.("statechange", recoverZapSound);
    } catch {
      return null;
    }
  }
  return sharedAudioContext;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export function createPreviewAudioChannel(): { destination: GainNode; stop(): void } | null {
  const context = getAudioContext();
  if (!context) return null;
  const destination = context.createGain();
  destination.connect(context.destination);
  return { destination, stop() { destination.disconnect(); } };
}
