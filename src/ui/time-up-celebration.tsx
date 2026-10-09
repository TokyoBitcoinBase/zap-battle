"use client";
import type { CSSProperties } from "react";
import { TIME_UP_ENTER_MS, TIME_UP_FADE_MS, TIME_UP_HOLD_MS } from "@/src/time-up";
export function TimeUpCelebration({ locale = "en" }: { locale?: "en" | "ja" }) {
  return <div className="time-up-celebration" aria-hidden="true" style={{ "--timeup-enter": `${TIME_UP_ENTER_MS}ms`, "--timeup-fade-delay": `${TIME_UP_ENTER_MS + TIME_UP_HOLD_MS}ms`, "--timeup-fade": `${TIME_UP_FADE_MS}ms` } as CSSProperties}>
    <div className="time-up-line top" /><div className="time-up-line bottom" />
    <div className="time-up-content"><p className="time-up-label">TIME UP!</p><strong className="time-up-clock">00:00</strong><p className="time-up-caption">{locale === "ja" ? "バトル時間が終了しました" : "BATTLE TIME HAS ENDED"}</p></div>
  </div>;
}
