"use client";
import { TimeUpCelebration } from "@/src/ui/time-up-celebration";
import type { CSSProperties } from "react";
import { ZAP_CELEBRATION_TIERS, type CelebrationTarget, type ConfettiPiece, type ZapCelebrationTier } from "@/src/zap-celebration";
export function ZapCelebration({ side, tier, amount, confetti, solo = false }: { side: CelebrationTarget; tier: ZapCelebrationTier; amount?: number; confetti: ConfettiPiece[]; solo?: boolean }) {
  if (side === "center") return <TimeUpCelebration />;
  return (
        <div className={`celebration ${side} ${solo ? "solo" : ""} ${ZAP_CELEBRATION_TIERS[tier].className}`} aria-hidden="true">
          <div className="zap-aura" />
          <div className="burst-text">
            <div className="zap-wordmark">
              <svg className="zap-bolt" viewBox="0 0 24 32" fill="currentColor"><path d="M14 0 1 18h9L7 32l16-21H13z" /></svg>
              <span className="zap-tier-label">{ZAP_CELEBRATION_TIERS[tier].text}</span>
            </div>
            {amount ? <small>{amount.toLocaleString("en-US")} <span>SATS</span></small> : null}
          </div>
          {confetti.map((piece) => (
            <span
              className="confetti"
              key={piece.id}
              style={{
                "--x": `${parseFloat(piece.x) - (solo ? 50 : side === "left" ? 25 : 75)}%`,
                "--y": piece.y,
                "--dx": piece.dx,
                "--dy": piece.dy,
                "--r": piece.r,
                "--color": piece.color,
                "--size": piece.size
              } as CSSProperties}
            />
          ))}
        </div>
  );
}
