"use client";
import { useCallback, useEffect, useState } from "react";
import { readBrowserStorage, writeBrowserStorage } from "@/src/browser-storage";
import { primeZapSound, watchZapSoundRecovery } from "@/src/zap-audio";

export const SOUND_ENABLED_STORAGE_KEY = "zap-battle:sound-enabled";
const SOUND_CHANGE_EVENT = "zap-battle:sound-change";
export function useBattleSound() {
  const [soundEnabled, setState] = useState(false);
  useEffect(() => {
    const sync = () => setState(readBrowserStorage(SOUND_ENABLED_STORAGE_KEY, ["local"]) === "true");
    sync();
    window.addEventListener(SOUND_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener(SOUND_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);
  useEffect(() => {
    if (soundEnabled) return watchZapSoundRecovery();
  }, [soundEnabled]);
  const setSoundEnabled = useCallback((enabled: boolean) => {
    if (enabled) void primeZapSound();
    setState(enabled);
    writeBrowserStorage(SOUND_ENABLED_STORAGE_KEY, String(enabled), ["local"]);
    window.dispatchEvent(new Event(SOUND_CHANGE_EVENT));
  }, []);
  return { soundEnabled, setSoundEnabled };
}
