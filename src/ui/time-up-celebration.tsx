"use client";
import type { CSSProperties } from "react";
import { TIME_UP_ENTER_MS, TIME_UP_FADE_MS, TIME_UP_HOLD_MS } from "@/src/time-up";
export function TimeUpCelebration() {
  return <p className="time-up-celebration" role="status" style={{ "--timeup-enter": `${TIME_UP_ENTER_MS}ms`, "--timeup-fade-delay": `${TIME_UP_ENTER_MS + TIME_UP_HOLD_MS}ms`, "--timeup-fade": `${TIME_UP_FADE_MS}ms` } as CSSProperties}>TIME UP!</p>;
}
