import { DEFAULT_ZAP_CELEBRATION_TIER, type ZapCelebrationTier } from "@/src/zap-celebration";

export async function playZapSound(tierName: ZapCelebrationTier = DEFAULT_ZAP_CELEBRATION_TIER, destination?: AudioNode) {
  const context = getAudioContext();
  if (!context || !await resumeAudioContext(context)) return false;
  const now = context.currentTime;
  const output = context.createGain();
  const tierSettings = zapSoundSettings(tierName);
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
  });
  return true;
}

export async function primeZapSound() {
  const context = getAudioContext();
  return context ? resumeAudioContext(context) : false;
}

async function resumeAudioContext(context: AudioContext): Promise<boolean> {
  if (context.state === "suspended") await context.resume().catch(() => undefined);
  return context.state === "running";
}

export function playSoundEnabledCue() {
  const context = getAudioContext();
  if (!context) return;
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
}

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    sharedAudioContext = new AudioContextClass();
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
